import { pool } from './db.mjs';
import { tokenHash } from './security.mjs';
import { fail } from './validation.mjs';
import { requestState } from './request-state.mjs';
export function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    status: u.status,
    must_change_password: Boolean(u.must_change_password),
  };
}
export async function authenticate(req, res, next) {
  const token = req.headers.authorization?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1];
  if (!token) return next(Object.assign(new Error('กรุณาเข้าสู่ระบบ'), { status: 401 }));
  try {
    const [rows] = await pool.execute(
      "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>UTC_TIMESTAMP() AND u.status='active'",
      [tokenHash(token)],
    );
    if (!rows[0]) fail(401, 'เซสชันหมดอายุ หรือบัญชีถูกระงับ กรุณาเข้าสู่ระบบใหม่');
    req.user = publicUser(rows[0]);
    req.tokenHash = tokenHash(token);
    const state = requestState.getStore();
    if (state) state.actor = { tokenHash: req.tokenHash, userId: req.user.id, role: req.user.role };
    if (req.user.must_change_password && !['/me', '/password', '/logout'].includes(req.path))
      fail(403, 'กรุณาเปลี่ยนรหัสผ่านเริ่มต้นก่อนใช้งาน');
    next();
  } catch (e) {
    next(e);
  }
}
export const requireRole =
  (...roles) =>
  (req, res, next) =>
    roles.includes(req.user.role)
      ? next()
      : next(Object.assign(new Error('คุณไม่มีสิทธิ์ใช้งานส่วนนี้'), { status: 403 }));
