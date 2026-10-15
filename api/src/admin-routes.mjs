import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { pool, transaction, audit, jsonValue, policy } from './db.mjs';
import {
  idInput,
  yearInput,
  memberUpdate,
  policyInput,
  date,
  leaveType,
  fail,
} from './validation.mjs';
import { hashPassword } from './security.mjs';
import { todayTH } from './dates.mjs';
import { ensureYear, onlineThaiHolidays, THAI_ICS_URL } from './holidays.mjs';
export const adminRoutes = Router();
async function freezeIfFutureLeave(c, from, to) {
  const [rows] = await c.execute(
    "SELECT id FROM leave_requests WHERE status IN ('pending','approved') AND end_date>=? AND start_date<=? LIMIT 1",
    [from, to],
  );
  const [covers] = await c.execute(
    "SELECT id FROM coverage_requests WHERE status IN ('pending','approved') AND day>=? AND day<=? LIMIT 1",
    [from, to],
  );
  if (rows.length || covers.length)
    fail(
      409,
      'มีคำขอลา/ทำงานแทนที่ยังใช้งานอยู่ในช่วงที่ได้รับผลกระทบ ให้ยกเลิกคำขอเหล่านั้นก่อนเปลี่ยนกติกา/วันหยุด แล้วให้ส่งใหม่',
    );
}
adminRoutes.get('/members', async (req, res) => {
  const [users] = await pool.query(
    'SELECT id,name,email,role,status,must_change_password,created_at FROM users ORDER BY created_at DESC,id DESC',
  );
  const [schedules] = await pool.query(
    'SELECT user_id,valid_from,weekly_off FROM work_schedules ORDER BY valid_from',
  );
  const [entitlements] = await pool.query('SELECT * FROM entitlements ORDER BY year,leave_type');
  res.json({
    members: users.map((u) => ({
      ...u,
      schedules: schedules
        .filter((s) => s.user_id === u.id)
        .map((s) => ({ ...s, weekly_off: jsonValue(s.weekly_off) })),
      entitlements: entitlements.filter((e) => e.user_id === u.id),
    })),
  });
});
adminRoutes.patch('/members/:id', async (req, res) => {
  const id = idInput.parse(req.params.id),
    v = memberUpdate.parse(req.body);
  await transaction(async (c) => {
    const [[u]] = await c.execute('SELECT * FROM users WHERE id=?', [id]);
    if (!u) fail(404, 'ไม่พบสมาชิก');
    if (u.status === 'active' && v.status !== 'active') {
      const [future] = await c.execute(
        "SELECT id FROM leave_requests WHERE user_id=? AND status IN ('pending','approved') AND end_date>=? LIMIT 1",
        [id, todayTH()],
      );
      const [covers] = await c.execute(
        "SELECT id FROM coverage_requests WHERE (user_id=? OR covers_user_id=?) AND status IN ('pending','approved') AND day>=? LIMIT 1",
        [id, id, todayTH()],
      );
      if (future.length || covers.length)
        fail(409, 'กรุณายกเลิกคำขอลา/ทำงานแทนในอนาคตของสมาชิกก่อนระงับบัญชี เพื่อคืนโควตาทีม');
    }
    if (
      u.role === 'SUPER_CS' &&
      u.status === 'active' &&
      (v.role !== 'SUPER_CS' || v.status !== 'active')
    ) {
      const [[count]] = await c.query(
        "SELECT COUNT(*) AS n FROM users WHERE role='SUPER_CS' AND status='active'",
      );
      if (count.n <= 1) fail(409, 'ต้องเหลือ Super Customer Service ที่ใช้งานได้อย่างน้อย 1 คน');
    }
    const [scheduleRows] = await c.execute(
      'SELECT valid_from,weekly_off FROM work_schedules WHERE user_id=? AND valid_from<=? ORDER BY valid_from DESC LIMIT 1',
      [id, v.valid_from],
    );
    const oldOff = scheduleRows[0] ? jsonValue(scheduleRows[0].weekly_off) : [];
    const changed = JSON.stringify([...oldOff].sort()) !== JSON.stringify([...v.weekly_off].sort());
    if (changed) {
      if (v.valid_from < todayTH())
        fail(400, 'การเปลี่ยนวันหยุดต้องมีผลวันนี้หรือในอนาคต เพื่อเก็บประวัติเดิม');
      const [future] = await c.execute(
        "SELECT id FROM leave_requests WHERE user_id=? AND status IN ('pending','approved') AND end_date>=? LIMIT 1",
        [id, v.valid_from],
      );
      if (future.length)
        fail(
          409,
          'สมาชิกมีคำขอลาหลังวันที่เปลี่ยนตาราง ให้ยกเลิก/ส่งใหม่ก่อน เพื่อคำนวณวันลาถูกต้อง',
        );
      const [covers] = await c.execute(
        "SELECT id FROM coverage_requests WHERE (user_id=? OR covers_user_id=?) AND status IN ('pending','approved') AND day>=? LIMIT 1",
        [id, id, v.valid_from],
      );
      if (covers.length) fail(409, 'มีรายการทำงานแทนหลังวันเปลี่ยนตาราง ให้ยกเลิกก่อน');
      await c.execute(
        'INSERT INTO work_schedules(user_id,valid_from,weekly_off) VALUES(?,?,?) ON DUPLICATE KEY UPDATE weekly_off=VALUES(weekly_off)',
        [id, v.valid_from, JSON.stringify(v.weekly_off)],
      );
    }
    await c.execute('UPDATE users SET name=?,role=?,status=? WHERE id=?', [
      v.name,
      v.role,
      v.status,
      id,
    ]);
    if (v.role !== u.role || v.status !== u.status)
      await c.execute('DELETE FROM sessions WHERE user_id=?', [id]);
    await audit(c, req.user.id, 'member_updated', 'user', id, {
      role: v.role,
      status: v.status,
      scheduleChanged: changed,
      valid_from: v.valid_from,
    });
  });
  res.json({ message: 'บันทึกสมาชิกแล้ว' });
});
adminRoutes.post('/members/:id/reset-password', async (req, res) => {
  const id = idInput.parse(req.params.id);
  if (id === req.user.id) fail(400, 'เปลี่ยนรหัสของตนเองผ่านเมนูบัญชีของฉัน');
  const temporaryPassword = randomBytes(15).toString('base64url'),
    hash = await hashPassword(temporaryPassword);
  await transaction(async (c) => {
    const [r] = await c.execute(
      'UPDATE users SET password_hash=?,must_change_password=TRUE WHERE id=?',
      [hash, id],
    );
    if (!r.affectedRows) fail(404, 'ไม่พบสมาชิก');
    await c.execute('DELETE FROM sessions WHERE user_id=?', [id]);
    await audit(c, req.user.id, 'password_reset', 'user', id);
  });
  res.json({
    temporaryPassword,
    message: 'แสดงรหัสชั่วคราวครั้งเดียว ส่งให้เจ้าของบัญชีผ่านช่องทางส่วนตัว',
  });
});
adminRoutes.put('/members/:id/entitlements/:year', async (req, res) => {
  const id = idInput.parse(req.params.id),
    year = yearInput.parse(req.params.year),
    v = z
      .array(
        z.object({ leave_type: leaveType, quota: z.number().int().min(0).max(366).nullable() }),
      )
      .length(3)
      .refine((a) => new Set(a.map((r) => r.leave_type)).size === 3)
      .parse(req.body);
  await transaction(async (c) => {
    const [[u]] = await c.execute('SELECT id FROM users WHERE id=?', [id]);
    if (!u) fail(404, 'ไม่พบสมาชิก');
    for (const item of v) {
      const [[used]] = await c.execute(
        "SELECT COUNT(*) AS n FROM leave_days d JOIN leave_requests r ON r.id=d.request_id WHERE r.user_id=? AND r.leave_type=? AND YEAR(d.day)=? AND r.status IN ('pending','approved')",
        [id, item.leave_type, year],
      );
      if (item.quota !== null && item.quota < used.n)
        fail(409, 'สิทธิ์ใหม่ต่ำกว่าวันลาที่ใช้/จองแล้ว');
      if (item.quota === null)
        await c.execute('DELETE FROM entitlements WHERE user_id=? AND year=? AND leave_type=?', [
          id,
          year,
          item.leave_type,
        ]);
      else
        await c.execute(
          'INSERT INTO entitlements(user_id,year,leave_type,quota) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE quota=VALUES(quota)',
          [id, year, item.leave_type, item.quota],
        );
    }
    await audit(c, req.user.id, 'entitlements_updated', 'user', id, { year, quotas: v });
  });
  res.json({ message: 'บันทึกสิทธิ์วันลาแล้ว' });
});
adminRoutes.get('/settings', async (req, res) => res.json({ policy: await policy() }));
adminRoutes.put('/settings', async (req, res) => {
  const v = policyInput.parse(req.body);
  await transaction(async (c) => {
    const old = await policy(c);
    if (Object.keys(v).some((key) => v[key] !== old[key])) {
      await freezeIfFutureLeave(c, todayTH(), '2100-12-31');
      await c.execute('UPDATE settings SET policy=? WHERE id=1', [JSON.stringify(v)]);
      await audit(c, req.user.id, 'policy_updated', 'settings', 1, v);
    }
  });
  res.json({ message: 'บันทึกกติกาแล้ว', policy: v });
});
adminRoutes.get('/holidays/:year', async (req, res) => {
  const year = yearInput.parse(req.params.year);
  const data = await transaction(async (c) => {
    await ensureYear(c, year);
    const [[meta]] = await c.execute('SELECT * FROM holiday_years WHERE year=?', [year]);
    const [holidays] = await c.execute(
      'SELECT * FROM holidays WHERE YEAR(day)=? ORDER BY day,name',
      [year],
    );
    return { meta, holidays };
  });
  res.json(data);
});
adminRoutes.get('/holidays/:year/online-preview', async (req, res) => {
  const year = yearInput.parse(req.params.year);
  try {
    res.json({ holidays: await onlineThaiHolidays(year), source: THAI_ICS_URL });
  } catch (e) {
    fail(502, e.message || 'เชื่อมต่อปฏิทินไทยไม่สำเร็จ');
  }
});
adminRoutes.post('/holidays/:year/import', async (req, res) => {
  const year = yearInput.parse(req.params.year),
    rows = z
      .array(z.object({ day: date, name: z.string().trim().min(2).max(255) }))
      .min(1)
      .max(100)
      .refine(
        (rows) => rows.every((h) => Number(h.day.slice(0, 4)) === year),
        'วันที่ต้องอยู่ในปีที่นำเข้า',
      )
      .parse(req.body);
  await transaction(async (c) => {
    await freezeIfFutureLeave(c, `${year}-01-01`, `${year}-12-31`);
    await ensureYear(c, year);
    for (const h of rows)
      await c.execute(
        'INSERT INTO holidays(day,name,source) VALUES(?,?,?) ON DUPLICATE KEY UPDATE source=VALUES(source),enabled=TRUE',
        [h.day, h.name, THAI_ICS_URL],
      );
    await c.execute(
      'UPDATE holiday_years SET confirmed=FALSE,confirmed_by=NULL,confirmed_at=NULL WHERE year=?',
      [year],
    );
    await audit(c, req.user.id, 'holidays_imported', 'holiday_year', year, { count: rows.length });
  });
  res.json({ message: 'นำเข้ารายการที่เลือกแล้ว ตรวจวันซ้ำและยืนยันปฏิทินอีกครั้ง' });
});
adminRoutes.post('/holidays', async (req, res) => {
  const v = z
      .object({
        day: date,
        name: z.string().trim().min(2).max(255),
        source: z.string().trim().min(3).max(255),
      })
      .parse(req.body),
    year = yearInput.parse(v.day.slice(0, 4));
  await transaction(async (c) => {
    await freezeIfFutureLeave(c, `${year}-01-01`, `${year}-12-31`);
    await ensureYear(c, year);
    const [r] = await c.execute('INSERT INTO holidays(day,name,source) VALUES(?,?,?)', [
      v.day,
      v.name,
      v.source,
    ]);
    await c.execute(
      'UPDATE holiday_years SET confirmed=FALSE,confirmed_by=NULL,confirmed_at=NULL WHERE year=?',
      [year],
    );
    await audit(c, req.user.id, 'holiday_added', 'holiday', r.insertId, v);
  });
  res.status(201).json({ message: 'เพิ่มวันหยุดแล้ว กรุณายืนยันปฏิทินอีกครั้ง' });
});
adminRoutes.patch('/holidays/:id', async (req, res) => {
  const id = idInput.parse(req.params.id),
    v = z.object({ enabled: z.boolean(), name: z.string().trim().min(2).max(255) }).parse(req.body);
  await transaction(async (c) => {
    const [[h]] = await c.execute('SELECT * FROM holidays WHERE id=?', [id]);
    if (!h) fail(404, 'ไม่พบวันหยุด');
    const year = Number(h.day.slice(0, 4));
    await freezeIfFutureLeave(c, `${year}-01-01`, `${year}-12-31`);
    await c.execute('UPDATE holidays SET enabled=?,name=? WHERE id=?', [v.enabled, v.name, id]);
    await c.execute(
      'UPDATE holiday_years SET confirmed=FALSE,confirmed_by=NULL,confirmed_at=NULL WHERE year=?',
      [year],
    );
    await audit(c, req.user.id, 'holiday_updated', 'holiday', id, v);
  });
  res.json({ message: 'แก้ไขวันหยุดแล้ว กรุณายืนยันปฏิทินอีกครั้ง' });
});
adminRoutes.post('/holidays/:year/confirm', async (req, res) => {
  const year = yearInput.parse(req.params.year),
    v = z.object({ source: z.string().trim().min(5).max(255) }).parse(req.body);
  await transaction(async (c) => {
    await ensureYear(c, year);
    await c.execute(
      'UPDATE holiday_years SET confirmed=TRUE,confirmed_by=?,confirmed_at=UTC_TIMESTAMP(),source=? WHERE year=?',
      [req.user.id, v.source, year],
    );
    await audit(c, req.user.id, 'holiday_year_confirmed', 'holiday_year', year, {
      source: v.source,
    });
  });
  res.json({ message: `ยืนยันวันหยุดปี ${year + 543} แล้ว` });
});
adminRoutes.get('/audit', async (req, res) => {
  const [rows] = await pool.query(
    'SELECT a.*,u.name AS actor_name FROM audit_logs a LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 200',
  );
  res.json({ logs: rows.map((r) => ({ ...r, details: jsonValue(r.details) })) });
});
