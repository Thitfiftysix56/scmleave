import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { pool, transaction, audit } from './db.mjs';
import { hashPassword, verifyPassword, sessionToken, tokenHash } from './security.mjs';
import { authenticate, publicUser } from './auth.mjs';
import { registration, password, fail } from './validation.mjs';
import { todayTH } from './dates.mjs';
import { config } from './config.mjs';
export const authRoutes = Router();
const loginLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'ลองเข้าสู่ระบบบ่อยเกินไป กรุณารอ 15 นาที' },
});
const registerLimit = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'สมัครบ่อยเกินไป กรุณารอ 1 ชั่วโมง' },
});
authRoutes.post('/register', registerLimit, async (req, res) => {
  const v = registration.parse(req.body),
    hash = await hashPassword(v.password);
  await transaction(async (c) => {
    const [old] = await c.execute('SELECT id FROM users WHERE email=?', [v.email]);
    if (old.length) fail(409, 'อีเมลนี้ถูกใช้แล้ว');
    const [u] = await c.execute(
      'INSERT INTO users(name,email,password_hash,role) VALUES(?,?,?,?)',
      [v.name, v.email, hash, v.role],
    );
    await c.execute('INSERT INTO work_schedules(user_id,valid_from,weekly_off) VALUES(?,?,?)', [
      u.insertId,
      todayTH(),
      JSON.stringify(v.weekly_off),
    ]);
    await audit(c, u.insertId, 'registered', 'user', u.insertId, { requested_role: v.role });
  });
  res
    .status(201)
    .json({ message: 'สมัครสำเร็จ กรุณารอ Admin หรือ Super Customer Service เปิดใช้งานบัญชี' });
});
authRoutes.post('/login', loginLimit, async (req, res) => {
  const v = z
    .object({
      email: z.email().transform((s) => s.toLowerCase()),
      password: z.string().min(1).max(128),
    })
    .parse(req.body);
  const [rows] = await pool.execute('SELECT * FROM users WHERE email=?', [v.email]),
    user = rows[0];
  if (!user) {
    await hashPassword(v.password);
    fail(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  }
  if (!(await verifyPassword(v.password, user.password_hash)))
    fail(401, 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
  if (user.status !== 'active')
    fail(
      403,
      user.status === 'pending' ? 'บัญชีรอผู้ดูแลเปิดใช้งาน' : 'บัญชีถูกระงับ กรุณาติดต่อผู้ดูแล',
    );
  const token = sessionToken();
  await transaction(async (c) => {
    const [[current]] = await c.execute('SELECT status,password_hash FROM users WHERE id=?', [
      user.id,
    ]);
    if (current.status !== 'active' || current.password_hash !== user.password_hash)
      fail(401, 'บัญชีมีการเปลี่ยนแปลง กรุณาเข้าสู่ระบบใหม่');
    await c.query('DELETE FROM sessions WHERE expires_at<UTC_TIMESTAMP()');
    await c.execute(
      'INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,DATE_ADD(UTC_TIMESTAMP(),INTERVAL ? HOUR))',
      [tokenHash(token), user.id, config.sessionHours],
    );
    await audit(c, user.id, 'login', 'user', user.id);
  });
  res.json({ token, user: publicUser(user) });
});
authRoutes.use(authenticate);
authRoutes.get('/me', (req, res) => res.json({ user: req.user }));
authRoutes.post('/logout', async (req, res) => {
  await pool.execute('DELETE FROM sessions WHERE token_hash=?', [req.tokenHash]);
  res.json({ message: 'ออกจากระบบแล้ว' });
});
authRoutes.post('/password', async (req, res) => {
  const v = z
    .object({ currentPassword: z.string().min(1).max(128), newPassword: password })
    .parse(req.body);
  if (v.currentPassword === v.newPassword) fail(400, 'รหัสผ่านใหม่ต้องต่างจากรหัสเดิม');
  const hash = await hashPassword(v.newPassword);
  await transaction(async (c) => {
    const [[u]] = await c.execute('SELECT password_hash FROM users WHERE id=?', [req.user.id]);
    if (!(await verifyPassword(v.currentPassword, u.password_hash)))
      fail(400, 'รหัสผ่านเดิมไม่ถูกต้อง');
    await c.execute('UPDATE users SET password_hash=?,must_change_password=FALSE WHERE id=?', [
      hash,
      req.user.id,
    ]);
    await c.execute('DELETE FROM sessions WHERE user_id=?', [req.user.id]);
    await audit(c, req.user.id, 'password_changed', 'user', req.user.id);
  });
  res.json({ message: 'เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบใหม่' });
});
