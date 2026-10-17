import { z } from 'zod';
import { isDay, todayTH } from './dates.mjs';
export const date = z
  .string()
  .refine(
    (s) => isDay(s) && s >= '2020-01-01' && s <= '2100-12-31',
    'วันที่ต้องเป็น YYYY-MM-DD ระหว่างปี 2020–2100',
  );
export const password = z.string().min(12, 'รหัสผ่านอย่างน้อย 12 ตัวอักษร').max(128);
export const offDays = z
  .array(z.number().int().min(0).max(6))
  .min(1)
  .max(6)
  .refine((a) => new Set(a).size === a.length, 'วันหยุดซ้ำกัน');
export const role = z.enum(['ADMIN', 'SUPER_CS', 'CS', 'STORE']);
export const leaveType = z.enum(['annual', 'personal', 'sick']);
export const leaveInput = z
  .object({
    leave_type: leaveType,
    start_date: date,
    end_date: date,
    reason: z.string().trim().min(3).max(2000),
    team_discussed: z.boolean().default(false),
    notified_klao: z.boolean().default(false),
    exception_requested: z.boolean().default(false),
    exception_reason: z.string().trim().max(2000).default(''),
  })
  .strict()
  .refine((v) => v.start_date <= v.end_date, {
    message: 'วันสิ้นสุดต้องไม่น้อยกว่าวันเริ่ม',
    path: ['end_date'],
  });
export const registration = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z
      .email()
      .max(191)
      .transform((s) => s.toLowerCase()),
    password,
    role: z.enum(['CS', 'STORE']).default('CS'),
    weekly_off: offDays,
  })
  .strict();
const memberFields = {
  name: z.string().trim().min(2).max(120),
  status: z.enum(['active', 'pending', 'inactive']),
  valid_from: date.default(todayTH),
};
export const memberUpdate = z.discriminatedUnion('role', [
  z
    .object({
      ...memberFields,
      role: z.literal('ADMIN'),
      weekly_off: z.array(z.number()).max(0).default([]),
    })
    .strict(),
  z
    .object({ ...memberFields, role: z.enum(['SUPER_CS', 'CS', 'STORE']), weekly_off: offDays })
    .strict(),
]);
export const adminCreation = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z
      .email()
      .max(191)
      .transform((s) => s.toLowerCase()),
  })
  .strict();
export const policyInput = z
  .object({
    weekendCapacity: z.number().int().min(1).max(10),
    maxConsecutive: z.literal(4),
    exceptionConsecutive: z.literal(5),
    certificateFromDays: z.number().int().min(2).max(3),
    blockHolidayExtension: z.boolean(),
  })
  .strict();
export const yearInput = z.coerce.number().int().min(2020).max(2100);
export const idInput = z.coerce.number().int().positive();
export function fail(status, message, details) {
  const e = new Error(message);
  e.status = status;
  e.details = details;
  throw e;
}
