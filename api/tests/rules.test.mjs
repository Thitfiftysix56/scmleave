import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLeave, DEFAULT_POLICY } from '../src/rules.mjs';
import { isDay, isOff, daysBetween, weekday } from '../src/dates.mjs';
const ctx = (extra) => ({
  policy: DEFAULT_POLICY,
  schedules: [{ valid_from: '2020-01-01', weekly_off: [0, 6] }],
  holidays: [],
  confirmedYears: [2026, 2027, 2028],
  existing: [],
  busy: {},
  entitlements: {},
  ...extra,
});
const input = (extra) => ({
  leave_type: 'annual',
  start_date: '2027-02-08',
  end_date: '2027-02-08',
  reason: 'ธุระครอบครัว',
  team_discussed: false,
  notified_klao: false,
  exception_requested: false,
  exception_reason: '',
  ...extra,
});
const has = (result, code) => result.errors.some((e) => e.code === code);
test('date-only validation rejects impossible dates and handles leap years', () => {
  assert.equal(isDay('2027-02-29'), false);
  assert.equal(isDay('2028-02-29'), true);
  assert.equal(isDay('2027-02-31'), false);
});
test('individual weekly schedules apply at their effective dates', () => {
  const s = [
    { valid_from: '2027-01-01', weekly_off: [5, 6] },
    { valid_from: '2027-03-01', weekly_off: [0, 1] },
  ];
  assert.equal(isOff(s, '2027-02-05'), true);
  assert.equal(isOff(s, '2027-03-05'), false);
  assert.equal(isOff(s, '2027-03-01'), true);
});
test('one Monday leave joins Saturday/Sunday into a 3-day block', () => {
  const r = evaluateLeave(input(), ctx());
  assert.equal(r.ok, true);
  assert.equal(r.chargedDays, 1);
  assert.equal(r.maxConsecutive, 3);
});
test('ordinary 4-day absence is allowed', () => {
  const r = evaluateLeave(input({ end_date: '2027-02-09' }), ctx());
  assert.equal(r.ok, true);
  assert.equal(r.maxConsecutive, 4);
});
test('5-day absence needs team acknowledgement and notification', () => {
  const r = evaluateLeave(
    input({
      end_date: '2027-02-10',
      exception_requested: true,
      exception_reason: 'จำเป็นต้องเดินทางไปต่างจังหวัด',
    }),
    ctx(),
  );
  assert.equal(has(r, 'FIVE_DAY_ACK'), true);
});
test('5-day exception can be submitted when every acknowledgement is present', () => {
  const r = evaluateLeave(
    input({
      end_date: '2027-02-10',
      team_discussed: true,
      notified_klao: true,
      exception_requested: true,
      exception_reason: 'จำเป็นต้องเดินทางไปต่างจังหวัด',
    }),
    ctx(),
  );
  assert.equal(r.ok, true);
  assert.equal(r.requiresException, true);
});
test('ordinary absence above 5 days is rejected even with acknowledgements', () => {
  const r = evaluateLeave(
    input({
      end_date: '2027-02-11',
      team_discussed: true,
      notified_klao: true,
      exception_requested: true,
      exception_reason: 'จำเป็นต้องเดินทางไปต่างจังหวัด',
    }),
    ctx(),
  );
  assert.equal(has(r, 'CONSECUTIVE_LIMIT'), true);
});
test('separate adjacent requests cannot evade consecutive-day rules', () => {
  const existing = [
    {
      id: 1,
      leave_type: 'annual',
      start_date: '2027-02-08',
      end_date: '2027-02-09',
      days: ['2027-02-08', '2027-02-09'],
    },
  ];
  const r = evaluateLeave(
    input({ start_date: '2027-02-10', end_date: '2027-02-11' }),
    ctx({ existing }),
  );
  assert.equal(has(r, 'CONSECUTIVE_LIMIT'), true);
});
test('holiday extension is rejected on the preceding side', () => {
  const r = evaluateLeave(
    input({ start_date: '2027-02-09', end_date: '2027-02-09' }),
    ctx({ holidays: ['2027-02-10'] }),
  );
  assert.equal(has(r, 'HOLIDAY_EXTENSION'), true);
});
test('holiday extension is rejected after a holiday bridged by weekly days off', () => {
  const r = evaluateLeave(input(), ctx({ holidays: ['2027-02-05'] }));
  assert.equal(has(r, 'HOLIDAY_EXTENSION'), true);
});
test('holiday-only/off-only ranges do not create a zero-day request', () => {
  const r = evaluateLeave(input({ start_date: '2027-02-06', end_date: '2027-02-07' }), ctx());
  assert.equal(has(r, 'NO_WORK_DAYS'), true);
});
test('weekend capacity includes another pending Store member', () => {
  assert.equal(weekday('2027-02-12'), 5);
  const r = evaluateLeave(
    input({ start_date: '2027-02-12', end_date: '2027-02-12' }),
    ctx({ busy: { '2027-02-12': 1 } }),
  );
  assert.equal(has(r, 'CAPACITY'), true);
});
test('weekly days off do not consume the extra-leave weekend capacity', () => {
  const r = evaluateLeave(
    input({ start_date: '2027-02-05', end_date: '2027-02-05' }),
    ctx({
      schedules: [{ valid_from: '2020-01-01', weekly_off: [5, 6] }],
      busy: { '2027-02-05': 1 },
    }),
  );
  assert.equal(has(r, 'CAPACITY'), false);
  assert.equal(has(r, 'NO_WORK_DAYS'), true);
});
test('Monday is not restricted by the Fri/Sat/Sun quota', () => {
  const r = evaluateLeave(input(), ctx({ busy: { '2027-02-08': 20 } }));
  assert.equal(r.ok, true);
});
test('planned weekend overbooking needs a team discussion and explicit special request', () => {
  const v = input({
    start_date: '2027-02-12',
    end_date: '2027-02-12',
    team_discussed: true,
    exception_requested: true,
    exception_reason: 'เหตุจำเป็นและตกลงการจัดคนในทีมแล้ว',
  });
  const r = evaluateLeave(v, ctx({ busy: { '2027-02-12': 1 } }));
  assert.equal(r.ok, true);
  assert.equal(r.requiresException, true);
  assert.equal(
    has(
      evaluateLeave({ ...v, team_discussed: false }, ctx({ busy: { '2027-02-12': 1 } })),
      'CAPACITY',
    ),
    true,
  );
});
test('one sick working day next to two weekly days off needs no certificate', () => {
  const r = evaluateLeave(input({ leave_type: 'sick' }), ctx());
  assert.equal(r.ok, true);
  assert.equal(r.sickCalendarDays, 1);
  assert.equal(r.certificateRequired, false);
});
test('two sick calendar days need no certificate under the default threshold', () => {
  const r = evaluateLeave(input({ leave_type: 'sick', end_date: '2027-02-09' }), ctx());
  assert.equal(r.certificateRequired, false);
  assert.equal(r.ok, true);
});
test('3-day illness requires its own certificate and exceptional 5-day acknowledgement', () => {
  const v = input({
    leave_type: 'sick',
    end_date: '2027-02-10',
    team_discussed: true,
    notified_klao: true,
    exception_requested: true,
    exception_reason: 'ป่วยต่อเนื่องตามความเห็นแพทย์',
  });
  assert.equal(has(evaluateLeave(v, ctx()), 'CERTIFICATE'), true);
  assert.equal(evaluateLeave({ ...v, has_certificate: true }, ctx()).ok, true);
});
test('splitting illness around weekly days off still requires a certificate', () => {
  const r = evaluateLeave(
    input({ leave_type: 'sick' }),
    ctx({
      existing: [
        {
          id: 1,
          leave_type: 'sick',
          start_date: '2027-02-05',
          end_date: '2027-02-05',
          days: ['2027-02-05'],
          has_certificate: false,
        },
      ],
    }),
  );
  assert.equal(r.sickCalendarDays, 4);
  assert.equal(has(r, 'CERTIFICATE'), true);
});
test('certificate from an earlier request does not silently replace this request attachment', () => {
  const r = evaluateLeave(
    input({ leave_type: 'sick' }),
    ctx({
      existing: [
        {
          id: 1,
          leave_type: 'sick',
          start_date: '2027-02-05',
          end_date: '2027-02-05',
          days: ['2027-02-05'],
          has_certificate: true,
        },
      ],
    }),
  );
  assert.equal(has(r, 'CERTIFICATE'), true);
});
test('certificate threshold can be set to 2 days', () => {
  const r = evaluateLeave(
    input({ leave_type: 'sick', end_date: '2027-02-09' }),
    ctx({ policy: { ...DEFAULT_POLICY, certificateFromDays: 2 } }),
  );
  assert.equal(has(r, 'CERTIFICATE'), true);
});
test('emergency sick quota conflicts escalate with explicit reason', () => {
  const r = evaluateLeave(
    input({
      leave_type: 'sick',
      start_date: '2027-02-12',
      end_date: '2027-02-12',
      exception_requested: true,
      exception_reason: 'ป่วยฉุกเฉินและแจ้งหัวหน้าทีมแล้ว',
    }),
    ctx({ busy: { '2027-02-12': 1 } }),
  );
  assert.equal(r.ok, true);
  assert.equal(r.requiresException, true);
  assert.equal(
    r.warnings.some((w) => w.code === 'CAPACITY'),
    true,
  );
});
test('unconfirmed holiday year blocks planned leave', () => {
  assert.equal(
    has(evaluateLeave(input(), ctx({ confirmedYears: [] })), 'HOLIDAYS_UNCONFIRMED'),
    true,
  );
});
test('a request crossing year-end requires both confirmed years', () => {
  const r = evaluateLeave(
    input({ start_date: '2026-12-31', end_date: '2027-01-01' }),
    ctx({ confirmedYears: [2026] }),
  );
  assert.equal(has(r, 'HOLIDAYS_UNCONFIRMED'), true);
});
test('pending and approved days count against annual entitlements', () => {
  const r = evaluateLeave(input(), ctx({ entitlements: { '2027:annual': { quota: 6, used: 6 } } }));
  assert.equal(has(r, 'BALANCE'), true);
});
test('missing entitlement means no configured annual ceiling', () => {
  assert.equal(evaluateLeave(input(), ctx()).ok, true);
});
test('overlap with own pending request is rejected', () => {
  const r = evaluateLeave(
    input(),
    ctx({
      existing: [
        {
          leave_type: 'annual',
          start_date: '2027-02-08',
          end_date: '2027-02-08',
          days: ['2027-02-08'],
        },
      ],
    }),
  );
  assert.equal(has(r, 'OVERLAP'), true);
});
test('working as a substitute and taking leave on the same day conflict', () => {
  assert.equal(
    has(evaluateLeave(input(), ctx({ coverageDays: ['2027-02-08'] })), 'COVERAGE_CONFLICT'),
    true,
  );
});
test('request ranges over 90 days are rejected before scanning', () => {
  assert.equal(has(evaluateLeave(input({ end_date: '2027-12-31' }), ctx()), 'RANGE'), true);
});
test('leaves on a normal day before/after a real working-day gap are independent', () => {
  const r = evaluateLeave(
    input({ start_date: '2027-02-10', end_date: '2027-02-10' }),
    ctx({ holidays: ['2027-02-08'] }),
  );
  assert.equal(r.ok, true);
  assert.equal(r.maxConsecutive, 1);
});
