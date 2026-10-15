import { policy, jsonValue } from './db.mjs';
import { addDays, todayTH } from './dates.mjs';
import { ensureYear } from './holidays.mjs';
export async function leaveContext(c, userId, input, excludeId = 0) {
  const year = Number(input.start_date.slice(0, 4)),
    endYear = Number(input.end_date.slice(0, 4));
  for (let y = year - 1; y <= endYear + 1; y++) await ensureYear(c, y);
  const [schedules] = await c.execute(
    'SELECT valid_from,weekly_off FROM work_schedules WHERE user_id=? ORDER BY valid_from',
    [userId],
  );
  const [holidayRows] = await c.execute(
    'SELECT day FROM holidays WHERE enabled=TRUE AND day BETWEEN ? AND ?',
    [`${year - 1}-01-01`, `${endYear + 1}-12-31`],
  );
  const [confirmed] = await c.query('SELECT year FROM holiday_years WHERE confirmed=TRUE');
  const [requests] = await c.execute(
    `SELECT r.*, EXISTS(SELECT 1 FROM certificates c WHERE c.request_id=r.id) AS has_certificate FROM leave_requests r WHERE user_id=? AND status IN ('pending','approved') AND id<>? AND end_date>=? AND start_date<=?`,
    [userId, excludeId, addDays(input.start_date, -400), addDays(input.end_date, 400)],
  );
  const [ownDays] = await c.execute(
    `SELECT d.request_id,d.day FROM leave_days d JOIN leave_requests r ON r.id=d.request_id WHERE r.user_id=? AND r.status IN ('pending','approved') AND r.id<>?`,
    [userId, excludeId],
  );
  const [busyRows] = await c.execute(
    `SELECT d.day,COUNT(DISTINCT d.user_id) AS n FROM leave_days d JOIN leave_requests r ON r.id=d.request_id WHERE r.status IN ('pending','approved') AND r.user_id<>? AND d.day BETWEEN ? AND ? GROUP BY d.day`,
    [userId, input.start_date, input.end_date],
  );
  const [quotas] = await c.execute(
    'SELECT year,leave_type,quota FROM entitlements WHERE user_id=?',
    [userId],
  );
  const [usedRows] = await c.execute(
    `SELECT YEAR(d.day) AS year,r.leave_type,COUNT(*) AS n FROM leave_days d JOIN leave_requests r ON r.id=d.request_id WHERE r.user_id=? AND r.status IN ('pending','approved') AND r.id<>? GROUP BY YEAR(d.day),r.leave_type`,
    [userId, excludeId],
  );
  const [coverage] = await c.execute(
    "SELECT day FROM coverage_requests WHERE user_id=? AND status IN ('pending','approved')",
    [userId],
  );
  return {
    policy: await policy(c),
    today: excludeId ? undefined : todayTH(),
    schedules: schedules.map((s) => ({ ...s, weekly_off: jsonValue(s.weekly_off) })),
    holidays: holidayRows.map((h) => h.day),
    confirmedYears: confirmed.map((r) => r.year),
    existing: requests.map((r) => ({
      ...r,
      has_certificate: Boolean(r.has_certificate),
      days: ownDays.filter((d) => d.request_id === r.id).map((d) => d.day),
    })),
    busy: Object.fromEntries(busyRows.map((r) => [r.day, Number(r.n)])),
    coverageDays: coverage.map((c) => c.day),
    entitlements: Object.fromEntries(
      quotas.map((q) => [
        `${q.year}:${q.leave_type}`,
        {
          quota: q.quota,
          used: Number(
            usedRows.find((u) => Number(u.year) === q.year && u.leave_type === q.leave_type)?.n ||
              0,
          ),
        },
      ]),
    ),
  };
}
