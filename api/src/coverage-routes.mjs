import { Router } from 'express';
import { z } from 'zod';
import { pool, transaction, audit, jsonValue } from './db.mjs';
import { date, idInput, fail } from './validation.mjs';
import { isOff, todayTH } from './dates.mjs';
import { requireRole, requireStaff } from './auth.mjs';
import { isManager, MANAGER_ROLES } from './roles.mjs';
export const coverageRoutes = Router();
async function validateCoverage(c, v, userId, excludeId = 0) {
  if (v.day < todayTH()) fail(400, 'ขอมาทำงานแทนล่วงหน้าหรือวันนี้เท่านั้น');
  const [users] = await c.execute(
    "SELECT id FROM users WHERE id IN (?,?) AND status='active' AND role<>'ADMIN'",
    [userId, v.covers_user_id],
  );
  if (userId === v.covers_user_id || users.length !== 2)
    fail(400, 'เลือกสมาชิกที่ไม่ใช่ Admin ซึ่งใช้งานอยู่และไม่ใช่ตนเอง');
  const [absent] = await c.execute(
    "SELECT r.id FROM leave_days d JOIN leave_requests r ON r.id=d.request_id WHERE d.user_id=? AND d.day=? AND r.status IN ('pending','approved')",
    [userId, v.day],
  );
  if (absent.length) fail(409, 'คุณมีคำขอลาวันนี้ จึงไม่สามารถขอมาทำงานแทน');
  const [duplicate] = await c.execute(
    "SELECT id FROM coverage_requests WHERE user_id=? AND day=? AND status IN ('pending','approved') AND id<>?",
    [userId, v.day, excludeId],
  );
  if (duplicate.length) fail(409, 'คุณมีรายการทำงานแทนวันนี้แล้ว');
  const [targetLeave] = await c.execute(
    "SELECT r.id FROM leave_days d JOIN leave_requests r ON r.id=d.request_id WHERE d.user_id=? AND d.day=? AND r.status='approved'",
    [v.covers_user_id, v.day],
  );
  const [ss] = await c.execute(
    'SELECT valid_from,weekly_off FROM work_schedules WHERE user_id=? ORDER BY valid_from',
    [v.covers_user_id],
  );
  const [[h]] = await c.execute('SELECT id FROM holidays WHERE day=? AND enabled=TRUE LIMIT 1', [
    v.day,
  ]);
  if (
    !targetLeave.length &&
    !isOff(
      ss.map((s) => ({ ...s, weekly_off: jsonValue(s.weekly_off) })),
      v.day,
    ) &&
    !h
  )
    fail(400, 'วันที่เลือกไม่ใช่วันหยุดหรือวันลาที่อนุมัติแล้วของคนที่มาทำแทน');
}
coverageRoutes.get('/', async (req, res) => {
  const full = isManager(req.user.role) || req.user.role === 'STORE';
  const [rows] = await pool.execute(
    `SELECT c.*,u.name,covered.name AS covers_name,store.name AS store_name FROM coverage_requests c JOIN users u ON u.id=c.user_id JOIN users covered ON covered.id=c.covers_user_id LEFT JOIN users store ON store.id=c.store_authorized_by ${full ? '' : 'WHERE c.user_id=?'} ORDER BY c.id DESC LIMIT 300`,
    full ? [] : [req.user.id],
  );
  res.json({ requests: rows });
});
coverageRoutes.post('/', requireStaff, async (req, res) => {
  const v = z
    .object({
      covers_user_id: idInput,
      day: date,
      hours: z.number().min(0.5).max(16).multipleOf(0.5),
      requested_ot: z.boolean(),
      reason: z.string().trim().min(3).max(1000),
    })
    .parse(req.body);
  await transaction(async (c) => {
    await validateCoverage(c, v, req.user.id);
    const [r] = await c.execute(
      'INSERT INTO coverage_requests(user_id,covers_user_id,day,hours,requested_ot,reason) VALUES(?,?,?,?,?,?)',
      [req.user.id, v.covers_user_id, v.day, v.hours, v.requested_ot, v.reason],
    );
    await audit(c, req.user.id, 'coverage_submitted', 'coverage', r.insertId, {
      requested_ot: v.requested_ot,
    });
  });
  res.status(201).json({ message: 'ส่งคำขอทำงานแทนแล้ว ไม่มีการสร้าง OT หรือวันลาชดเชยอัตโนมัติ' });
});
coverageRoutes.post('/:id/store-authorize', requireRole('STORE'), async (req, res) => {
  const id = idInput.parse(req.params.id);
  await transaction(async (c) => {
    const [[r]] = await c.execute('SELECT * FROM coverage_requests WHERE id=?', [id]);
    if (!r) fail(404, 'ไม่พบรายการ');
    if (r.status !== 'pending' || !r.requested_ot)
      fail(409, 'รายการนี้ไม่ได้รอให้ Store อนุญาต OT');
    if (r.user_id === req.user.id) fail(403, 'Store อนุญาต OT ให้ตัวเองไม่ได้ ต้องใช้ Store อีกคน');
    await c.execute('UPDATE coverage_requests SET store_authorized_by=? WHERE id=?', [
      req.user.id,
      id,
    ]);
    await audit(c, req.user.id, 'ot_store_authorized', 'coverage', id);
  });
  res.json({ message: 'Store อนุญาต OT แล้ว รอ Admin / Super อนุมัติรายการ' });
});
coverageRoutes.post('/:id/review', requireRole(...MANAGER_ROLES), async (req, res) => {
  const id = idInput.parse(req.params.id),
    v = z
      .object({
        decision: z.enum(['approved', 'rejected']),
        note: z.string().trim().min(3).max(1000),
      })
      .parse(req.body);
  await transaction(async (c) => {
    const [[r]] = await c.execute('SELECT * FROM coverage_requests WHERE id=?', [id]);
    if (!r) fail(404, 'ไม่พบรายการ');
    if (r.status !== 'pending') fail(409, 'รายการได้รับการจัดการแล้ว');
    if (r.user_id === req.user.id) fail(403, 'อนุมัติรายการของตัวเองไม่ได้');
    if (v.decision === 'approved') {
      await validateCoverage(c, r, r.user_id, id);
      if (r.requested_ot) {
        const [[store]] = await c.execute(
          "SELECT id FROM users WHERE id=? AND role='STORE' AND status='active'",
          [r.store_authorized_by || 0],
        );
        if (!store) fail(422, 'ต้องให้ Store ที่ใช้งานอยู่อนุญาต OT ก่อน');
      }
    }
    await c.execute(
      'UPDATE coverage_requests SET status=?,reviewed_by=?,review_note=? WHERE id=?',
      [v.decision, req.user.id, v.note, id],
    );
    await audit(c, req.user.id, 'coverage_' + v.decision, 'coverage', id);
  });
  res.json({ message: 'บันทึกผลแล้ว' });
});
coverageRoutes.post('/:id/cancel', async (req, res) => {
  const id = idInput.parse(req.params.id);
  await transaction(async (c) => {
    const [[r]] = await c.execute('SELECT * FROM coverage_requests WHERE id=?', [id]);
    if (!r) fail(404, 'ไม่พบรายการ');
    if (r.user_id !== req.user.id && !isManager(req.user.role)) fail(403, 'ไม่มีสิทธิ์ยกเลิก');
    if (!['pending', 'approved'].includes(r.status)) fail(409, 'ยกเลิกไปแล้ว');
    await c.execute("UPDATE coverage_requests SET status='cancelled' WHERE id=?", [id]);
    await audit(c, req.user.id, 'coverage_cancelled', 'coverage', id);
  });
  res.json({ message: 'ยกเลิกรายการแล้ว' });
});
