import mysql from 'mysql2/promise';
import { config } from './config.mjs';
import { requestState } from './request-state.mjs';
export const pool = mysql.createPool(config.db);
export const jsonValue = (value) => (typeof value === 'string' ? JSON.parse(value) : value);
export async function transaction(fn) {
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    await c.query('SELECT id FROM policy_lock WHERE id=1 FOR UPDATE');
    const actor = requestState.getStore()?.actor;
    if (actor) {
      const [rows] = await c.execute(
        "SELECT u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.user_id=? AND s.expires_at>UTC_TIMESTAMP() AND u.status='active'",
        [actor.tokenHash, actor.userId],
      );
      if (!rows[0] || rows[0].role !== actor.role)
        throw Object.assign(new Error('สิทธิ์บัญชีเปลี่ยนแปลง กรุณาเข้าสู่ระบบใหม่'), {
          status: 401,
        });
    }
    const result = await fn(c);
    await c.commit();
    return result;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
export async function audit(c, actor, action, type, id, details = {}) {
  await c.execute(
    'INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,details) VALUES(?,?,?,?,?)',
    [actor || null, action, type, String(id), JSON.stringify(details)],
  );
}
export async function policy(c = pool) {
  const [rows] = await c.query('SELECT policy FROM settings WHERE id=1');
  return jsonValue(rows[0].policy);
}
