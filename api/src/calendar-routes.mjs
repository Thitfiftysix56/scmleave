import { Router } from 'express';
import { z } from 'zod';
import { pool, transaction, jsonValue, policy } from './db.mjs';
import { date, yearInput, fail } from './validation.mjs';
import { daysBetween, addDays, isOff, todayTH } from './dates.mjs';
import { ensureYear } from './holidays.mjs';
export const calendarRoutes = Router();
calendarRoutes.get('/people', async (req, res) => {
  const [members] = await pool.query(
    "SELECT id,name,role FROM users WHERE status='active' ORDER BY name",
  );
  res.json({ members });
});
calendarRoutes.get('/meta', async (req, res) => {
  const [roles] = await pool.query('SELECT code,label FROM roles');
  const [years] = await pool.query('SELECT year,confirmed,source FROM holiday_years ORDER BY year');
  const [schedules] = await pool.execute(
    'SELECT valid_from,weekly_off FROM work_schedules WHERE user_id=? ORDER BY valid_from',
    [req.user.id],
  );
  res.json({
    roles,
    policy: await policy(),
    holidayYears: years,
    schedules: schedules.map((s) => ({ ...s, weekly_off: jsonValue(s.weekly_off) })),
    today: todayTH(),
  });
});
calendarRoutes.get('/calendar', async (req, res) => {
  const q = z.object({ start: date, end: date }).parse(req.query);
  let days;
  try {
    days = daysBetween(q.start, addDays(q.end, -1), 400);
  } catch {
    fail(400, 'ช่วงปฏิทินไม่ถูกต้องหรือเกิน 400 วัน');
  }
  const firstYear = Number(q.start.slice(0, 4)),
    lastYear = Number(q.end.slice(0, 4));
  await transaction(async (c) => {
    for (let y = firstYear; y <= lastYear; y++) await ensureYear(c, y);
  });
  const [members] = await pool.query(
    "SELECT id,name,role FROM users WHERE status='active' ORDER BY name",
  );
  const [schedules] = await pool.execute(
    'SELECT user_id,valid_from,weekly_off FROM work_schedules WHERE valid_from<=? ORDER BY valid_from',
    [q.end],
  );
  const [holidays] = await pool.execute(
    'SELECT h.*,y.confirmed FROM holidays h LEFT JOIN holiday_years y ON y.year=YEAR(h.day) WHERE h.enabled=TRUE AND h.day>=? AND h.day<? ORDER BY h.day',
    [q.start, q.end],
  );
  // No reason, review note, e-mail, certificate or medical details are included in team events.
  const [leaves] = await pool.execute(
    `SELECT r.id,r.user_id,u.name,u.role,r.leave_type,r.status,r.start_date,r.end_date FROM leave_requests r JOIN users u ON u.id=r.user_id WHERE r.status IN ('pending','approved') AND r.start_date<? AND r.end_date>=?`,
    [q.end, q.start],
  );
  const events = [];
  for (const h of holidays)
    events.push({
      id: `h${h.id}`,
      title: h.name + (h.confirmed ? '' : ' · รอยืนยัน'),
      start: h.day,
      end: addDays(h.day, 1),
      allDay: true,
      backgroundColor: '#fff2cc',
      borderColor: '#ffda7b',
      textColor: '#7a4f00',
      extendedProps: { kind: 'holiday', confirmed: Boolean(h.confirmed) },
    });
  for (const m of members) {
    const ss = schedules
      .filter((s) => s.user_id === m.id)
      .map((s) => ({ ...s, weekly_off: jsonValue(s.weekly_off) }));
    for (const day of days)
      if (isOff(ss, day))
        events.push({
          id: `off-${m.id}-${day}`,
          title: `${m.name} · หยุดปกติ`,
          start: day,
          end: addDays(day, 1),
          allDay: true,
          backgroundColor: '#f1f4f7',
          borderColor: '#e4e9ed',
          textColor: '#637381',
          extendedProps: { kind: 'regular', user_id: m.id, role: m.role },
        });
  }
  for (const r of leaves)
    events.push({
      id: `leave-${r.id}`,
      title: `${r.name} · ${r.leave_type === 'sick' ? 'ลาป่วย' : r.leave_type === 'personal' ? 'ลากิจ' : 'ลาพักร้อน'}`,
      start: r.start_date,
      end: addDays(r.end_date, 1),
      allDay: true,
      backgroundColor: r.status === 'pending' ? '#fff1d6' : '#d8f6e9',
      borderColor: r.status === 'pending' ? '#ffbd59' : '#9fe2c6',
      textColor: r.status === 'pending' ? '#9a5b00' : '#006b48',
      extendedProps: {
        kind: 'leave',
        request_id: r.id,
        user_id: r.user_id,
        role: r.role,
        status: r.status,
      },
    });
  const [years] = await pool.query('SELECT year,confirmed FROM holiday_years ORDER BY year');
  res.json({ events, members, holidayYears: years });
});
calendarRoutes.get('/balances', async (req, res) => {
  const year = yearInput.parse(req.query.year || todayTH().slice(0, 4));
  const [quotas] = await pool.execute(
    'SELECT leave_type,quota FROM entitlements WHERE user_id=? AND year=?',
    [req.user.id, year],
  );
  const [used] = await pool.execute(
    "SELECT r.leave_type,r.status,COUNT(*) AS n FROM leave_days d JOIN leave_requests r ON r.id=d.request_id WHERE r.user_id=? AND YEAR(d.day)=? AND r.status IN ('pending','approved') GROUP BY r.leave_type,r.status",
    [req.user.id, year],
  );
  res.json({
    year,
    balances: ['annual', 'personal', 'sick'].map((type) => {
      const quota = quotas.find((q) => q.leave_type === type)?.quota ?? null,
        approved = Number(
          used.find((u) => u.leave_type === type && u.status === 'approved')?.n || 0,
        ),
        pending = Number(used.find((u) => u.leave_type === type && u.status === 'pending')?.n || 0);
      return {
        leave_type: type,
        quota,
        approved,
        pending,
        remaining: quota === null ? null : quota - approved - pending,
      };
    }),
  });
});
