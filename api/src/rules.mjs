import { addDays, daysBetween, isDay, isOff, weekday } from './dates.mjs';
export const DEFAULT_POLICY = {
  weekendCapacity: 1,
  maxConsecutive: 4,
  exceptionConsecutive: 5,
  certificateFromDays: 3,
  blockHolidayExtension: true,
};
// Pure policy engine: API preview and transactional create/approve use the SAME function.
export function evaluateLeave(input, ctx) {
  const errors = [],
    warnings = [],
    p = { ...DEFAULT_POLICY, ...ctx.policy };
  const error = (code, message) => errors.push({ code, message });
  const warning = (code, message) => warnings.push({ code, message });
  if (!isDay(input.start_date) || !isDay(input.end_date) || input.end_date < input.start_date) {
    error('DATES', 'วันที่เริ่มต้น/สิ้นสุดไม่ถูกต้อง');
    return { ok: false, errors, warnings, days: [], chargedDays: 0 };
  }
  let declared;
  try {
    declared = daysBetween(input.start_date, input.end_date, 90);
  } catch {
    error('RANGE', 'เลือกได้ไม่เกิน 90 วันต่อคำขอ');
    return { ok: false, errors, warnings, days: [], chargedDays: 0 };
  }
  const holidays = new Set(ctx.holidays),
    existing = ctx.existing || [],
    isSick = input.leave_type === 'sick';
  const ownDays = new Set(existing.flatMap((r) => r.days));
  const days = declared.filter((d) => !isOff(ctx.schedules, d) && !holidays.has(d));
  if (!days.length) error('NO_WORK_DAYS', 'ช่วงนี้เป็นวันหยุดทั้งหมด จึงไม่ต้องส่งคำขอลา');
  if (days.some((d) => ownDays.has(d)))
    error('OVERLAP', 'มีคำขอรออนุมัติหรืออนุมัติแล้วของคุณซ้ำในช่วงนี้');
  if (ctx.today && input.leave_type !== 'sick' && input.start_date < ctx.today)
    error('PAST', 'วันลาทั่วไปต้องไม่ย้อนหลัง (ลาป่วยย้อนหลังได้)');
  const newDays = new Set(days),
    away = (d) => newDays.has(d) || ownDays.has(d) || isOff(ctx.schedules, d) || holidays.has(d);
  let maxConsecutive = 0,
    hasHolidayBlock = false;
  const covered = new Set(),
    blocks = [];
  for (const d of days) {
    if (covered.has(d)) continue;
    let first = d,
      last = d;
    for (let n = 0; n < 400 && away(addDays(first, -1)); n++) first = addDays(first, -1);
    for (let n = 0; n < 400 && away(addDays(last, 1)); n++) last = addDays(last, 1);
    const block = daysBetween(first, last, 1000);
    block.forEach((x) => covered.add(x));
    const holiday = block.some((x) => holidays.has(x));
    maxConsecutive = Math.max(maxConsecutive, block.length);
    hasHolidayBlock ||= holiday;
    blocks.push({ start: first, end: last, days: block.length, includesHoliday: holiday });
  }
  const years = new Set([...declared, ...covered].map((d) => Number(d.slice(0, 4))));
  const unconfirmed = [...years].filter((y) => !(ctx.confirmedYears || []).includes(y));
  let requiresException = false;
  const restrictive = (code, message) => {
    if (isSick) {
      requiresException = true;
      warning(code, message + ' — ต้องให้ Admin / Super อนุมัติข้อยกเว้น');
    } else error(code, message);
  };
  if (unconfirmed.length)
    restrictive(
      'HOLIDAYS_UNCONFIRMED',
      `ผู้ดูแลยังไม่ยืนยันปฏิทินวันหยุดปี ${unconfirmed.map((y) => y + 543).join(', ')}`,
    );
  if (p.blockHolidayExtension && hasHolidayBlock)
    restrictive(
      'HOLIDAY_EXTENSION',
      'ห้ามลาเพิ่มต่อกับช่วงวันหยุดเทศกาล/นักขัตฤกษ์ ทั้งก่อนและหลัง รวมวันที่เชื่อมด้วยวันหยุดปกติ',
    );
  if (maxConsecutive > p.exceptionConsecutive)
    restrictive(
      'CONSECUTIVE_LIMIT',
      `หยุดต่อเนื่องรวมวันหยุดปกติได้สูงสุด ${p.exceptionConsecutive} วัน`,
    );
  else if (maxConsecutive > p.maxConsecutive) {
    requiresException = true;
    if (!input.team_discussed || !input.notified_klao)
      restrictive('FIVE_DAY_ACK', 'หยุดต่อเนื่อง 5 วันต้องคุยในทีมและแจ้งพี่เกล้าก่อน');
    warning('FIVE_DAY', 'คำขอนี้ต้องให้ Admin / Super ยืนยันการอนุมัติพิเศษ');
  }
  for (const d of days) {
    if ([5, 6, 0].includes(weekday(d)) && (ctx.busy?.[d] || 0) >= p.weekendCapacity) {
      const message = `${d}: โควตาศุกร์/เสาร์/อาทิตย์เต็มแล้ว (รวม Store และคำขอรออนุมัติ)`;
      if (!isSick && input.exception_requested && input.team_discussed) {
        requiresException = true;
        warning('CAPACITY', message + ' — ขอให้ Admin / Super พิจารณาเหตุจำเป็นหลังคุยทีม');
      } else restrictive('CAPACITY', message + ' หากจำเป็นให้คุยทีมและขออนุมัติพิเศษ');
    }
    if ((ctx.coverageDays || []).includes(d))
      error('COVERAGE_CONFLICT', `${d}: คุณมีคำขอมาทำงานแทนที่ยังใช้งานอยู่ ต้องยกเลิกก่อน`);
  }
  const usage = {};
  for (const d of days) {
    const key = `${d.slice(0, 4)}:${input.leave_type}`;
    usage[key] = (usage[key] || 0) + 1;
  }
  for (const [key, count] of Object.entries(usage)) {
    const q = ctx.entitlements?.[key];
    if (q && q.used + count > q.quota)
      restrictive(
        'BALANCE',
        `วันลาปี ${Number(key.slice(0, 4)) + 543} ไม่พอ (สิทธิ์ ${q.quota}, ใช้/จองแล้ว ${q.used}, ขอเพิ่ม ${count})`,
      );
  }
  let sickCalendarDays = 0,
    certificateRequired = false,
    existingCertificate = false;
  if (isSick) {
    const sickRequests = existing.filter((r) => r.leave_type === 'sick');
    const sickDates = new Set([
      ...declared,
      ...sickRequests.flatMap((r) => daysBetween(r.start_date, r.end_date, 90)),
    ]);
    const sickAway = (d) => sickDates.has(d) || isOff(ctx.schedules, d) || holidays.has(d);
    let first = input.start_date,
      last = input.end_date;
    for (let n = 0; n < 400 && sickAway(addDays(first, -1)); n++) first = addDays(first, -1);
    for (let n = 0; n < 400 && sickAway(addDays(last, 1)); n++) last = addDays(last, 1);
    const connected = [...sickDates].filter((d) => d >= first && d <= last).sort();
    if (connected.length)
      sickCalendarDays = daysBetween(connected[0], connected.at(-1), 1000).length;
    existingCertificate = sickRequests.some(
      (r) => r.has_certificate && r.end_date >= first && r.start_date <= last,
    );
    certificateRequired = sickCalendarDays >= p.certificateFromDays;
    if (certificateRequired && !input.has_certificate)
      error(
        'CERTIFICATE',
        `ป่วยต่อเนื่องตั้งแต่ ${p.certificateFromDays} วันปฏิทินต้องแนบรูปใบรับรองแพทย์ในคำขอนี้ด้วย (รวมคำขอที่แบ่งช่วง)`,
      );
  }
  if (requiresException && !input.exception_requested)
    error('EXCEPTION_ACK', 'กรุณาเลือกขออนุมัติพิเศษและกรอกเหตุจำเป็น');
  if (requiresException && String(input.exception_reason || '').trim().length < 10)
    error('EXCEPTION_REASON', 'เหตุจำเป็นสำหรับข้อยกเว้นต้องมีอย่างน้อย 10 ตัวอักษร');
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    days,
    chargedDays: days.length,
    maxConsecutive,
    blocks,
    requiresException,
    certificateRequired,
    sickCalendarDays,
    existingCertificate,
  };
}
