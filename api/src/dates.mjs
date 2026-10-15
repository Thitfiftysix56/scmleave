export const iso = (date) => date.toISOString().slice(0, 10);
export const todayTH = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export function isDay(s) {
  return (
    typeof s === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !Number.isNaN(Date.parse(s + 'T12:00:00Z')) &&
    iso(new Date(s + 'T12:00:00Z')) === s
  );
}
export function addDays(day, n) {
  const d = new Date(day + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
}
export function weekday(day) {
  return new Date(day + 'T12:00:00Z').getUTCDay();
}
export function daysBetween(start, end, limit = 370) {
  if (!isDay(start) || !isDay(end) || start > end) throw new Error('Invalid date range');
  const out = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (out.length >= limit) throw new Error('Date range too long');
    out.push(d);
  }
  return out;
}
export function weeklyOff(schedules, day) {
  const s = schedules
    .filter((s) => s.valid_from <= day)
    .sort((a, b) => b.valid_from.localeCompare(a.valid_from))[0];
  return s ? (Array.isArray(s.weekly_off) ? s.weekly_off : JSON.parse(s.weekly_off)) : [];
}
export function isOff(schedules, day) {
  return weeklyOff(schedules, day).includes(weekday(day));
}
