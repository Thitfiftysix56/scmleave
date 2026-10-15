import Holidays from 'date-holidays';
import { addDays, weekday } from './dates.mjs';
export const THAI_ICS_URL =
  'https://calendar.google.com/calendar/ical/th.th%23holiday%40group.v.calendar.google.com/public/basic.ics';
export function thaiHolidays(year) {
  const hd = new Holidays('TH', { languages: ['th', 'en'] });
  const source = 'date-holidays TH (ต้องตรวจทานวันชดเชยและประกาศพิเศษ)';
  const rows = hd
    .getHolidays(year)
    .filter((h) => h.type === 'public')
    .map((h) => ({ day: h.date.slice(0, 10), name: h.name, source }));
  const occupied = new Set(rows.map((h) => h.day));
  for (const h of [...rows].sort((a, b) => a.day.localeCompare(b.day))) {
    if (![0, 6].includes(weekday(h.day))) continue;
    let day = addDays(h.day, 1);
    while ([0, 6].includes(weekday(day)) || occupied.has(day)) day = addDays(day, 1);
    if (Number(day.slice(0, 4)) === year) {
      occupied.add(day);
      rows.push({
        day,
        name: 'ชดเชย ' + h.name,
        source: 'คำนวณวันชดเชย (ผู้ดูแลต้องตรวจประกาศจริง)',
      });
    }
  }
  return rows.sort((a, b) => a.day.localeCompare(b.day));
}
export async function ensureYear(c, year) {
  const [result] = await c.execute('INSERT IGNORE INTO holiday_years(year) VALUES(?)', [year]);
  if (result.affectedRows)
    for (const h of thaiHolidays(year))
      await c.execute('INSERT IGNORE INTO holidays(day,name,source) VALUES(?,?,?)', [
        h.day,
        h.name,
        h.source,
      ]);
}
export function parseThaiICS(text, year) {
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('แหล่งข้อมูลไม่ใช่ปฏิทิน ICS');
  const out = [],
    unfolded = text.replace(/\r?\n[ \t]/g, '');
  for (const block of unfolded.split('BEGIN:VEVENT').slice(1)) {
    if (/^RRULE:/m.test(block)) continue;
    const day = block.match(/^DTSTART(?:;VALUE=DATE)?:(\d{4})(\d{2})(\d{2})\s*$/m),
      summary = block.match(/^SUMMARY(?:;[^:]*)?:(.+)\r?$/m);
    if (!day || !summary || Number(day[1]) !== year) continue;
    out.push({
      day: `${day[1]}-${day[2]}-${day[3]}`,
      name: summary[1]
        .replace(/\\n/g, ' ')
        .replace(/\\([,;\\])/g, '$1')
        .trim()
        .slice(0, 255),
      source: THAI_ICS_URL,
    });
  }
  return [...new Map(out.map((h) => [h.day + '|' + h.name, h])).values()].sort((a, b) =>
    a.day.localeCompare(b.day),
  );
}
export async function onlineThaiHolidays(year) {
  const response = await fetch(THAI_ICS_URL, {
    signal: AbortSignal.timeout(10000),
    redirect: 'error',
  });
  if (!response.ok) throw new Error('ดาวน์โหลดปฏิทินไทยไม่สำเร็จ');
  const text = await response.text();
  if (text.length > 3000000) throw new Error('ข้อมูลปฏิทินใหญ่เกินกำหนด');
  const rows = parseThaiICS(text, year);
  if (!rows.length)
    throw new Error('แหล่งข้อมูลยังไม่มีรายการของปีนี้ ใช้รายการคำนวณและเพิ่มตามประกาศองค์กรได้');
  return rows;
}
