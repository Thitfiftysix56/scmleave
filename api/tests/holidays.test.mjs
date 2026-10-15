import test from 'node:test';
import assert from 'node:assert/strict';
import { thaiHolidays, parseThaiICS } from '../src/holidays.mjs';
test('Thai holiday calculations change with the year and include reviewed substitute candidates', () => {
  const a = thaiHolidays(2026),
    b = thaiHolidays(2027);
  assert.equal(
    a.some((h) => h.day === '2026-03-03' && h.name.includes('มาฆ')),
    true,
  );
  assert.equal(
    a.some((h) => h.day === '2026-06-01' && h.name.includes('ชดเชย')),
    true,
  );
  assert.equal(
    a.some((h) => h.day === '2026-12-07' && h.name.includes('ชดเชย')),
    true,
  );
  assert.equal(
    b.every((h) => h.day.startsWith('2027-')),
    true,
  );
});
test('online calendar parser selects the requested year and unfolds escaped summaries', () => {
  const ics =
    'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20270101\r\nSUMMARY:วันขึ้นปีใหม่\\, ไทย\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTSTART;VALUE=DATE:20260413\r\nSUMMARY:สงกรานต์\r\nEND:VEVENT\r\nEND:VCALENDAR';
  const rows = parseThaiICS(ics, 2027);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].day, '2027-01-01');
  assert.equal(rows[0].name, 'วันขึ้นปีใหม่, ไทย');
});
test('online parser rejects non-calendar text', () =>
  assert.throws(() => parseThaiICS('<html>bad gateway</html>', 2027)));
