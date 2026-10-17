import fs from 'node:fs/promises';
import { pool } from './db.mjs';
import { hashPassword } from './security.mjs';
import { ensureYear } from './holidays.mjs';
import { todayTH } from './dates.mjs';
export async function migrate() {
  const c = await pool.getConnection();
  try {
    const [[lock]] = await c.query("SELECT GET_LOCK('scm_schema_migration',30) AS got");
    if (!lock.got) throw new Error('Migration lock unavailable');
    for (const file of ['001_schema.sql', '002_admin_role.sql']) {
      const sql = await fs.readFile(new URL(`../../db/${file}`, import.meta.url), 'utf8');
      for (const statement of sql
        .split(';')
        .map((s) => s.replace(/^--.*$/gm, '').trim())
        .filter(Boolean))
        await c.query(statement);
      await c.execute('INSERT IGNORE INTO schema_migrations(version) VALUES(?)', [
        file.slice(0, 3),
      ]);
    }
    const [admins] = await c.query("SELECT id FROM users WHERE role IN ('ADMIN','SUPER_CS')");
    if (!admins.length) {
      const password = process.env.BOOTSTRAP_ADMIN_PASSWORD || '';
      if (password.length < 12)
        throw new Error('Set BOOTSTRAP_ADMIN_PASSWORD (12+ characters) before first migration');
      await c.execute(
        'INSERT INTO users(name,email,password_hash,role,status,must_change_password) VALUES(?,?,?,?,?,?)',
        [
          process.env.BOOTSTRAP_ADMIN_NAME || 'SCM Administrator',
          (process.env.BOOTSTRAP_ADMIN_EMAIL || 'admin@scm.local').toLowerCase(),
          await hashPassword(password),
          'ADMIN',
          'active',
          true,
        ],
      );
    }
    const year = Number(todayTH().slice(0, 4));
    for (const y of [year - 1, year, year + 1]) await ensureYear(c, y);
    if (process.env.SEED_DEMO === 'true') {
      if ((process.env.DEMO_PASSWORD || '').length < 12)
        throw new Error('DEMO_PASSWORD must contain 12+ characters');
      for (const [name, email, role, off] of [
        ['พลอย · CS', 'ploy@scm.local', 'CS', [5, 6]],
        ['นนท์ · CS', 'nont@scm.local', 'CS', [0, 1]],
        ['มิน · Store', 'mint@scm.local', 'STORE', [2, 3]],
      ]) {
        const [u] = await c.execute(
          'INSERT IGNORE INTO users(name,email,password_hash,role,status,must_change_password) VALUES(?,?,?,?,?,?)',
          [name, email, await hashPassword(process.env.DEMO_PASSWORD), role, 'active', true],
        );
        if (u.affectedRows)
          await c.execute(
            'INSERT INTO work_schedules(user_id,valid_from,weekly_off) VALUES(?,?,?)',
            [u.insertId, `${year - 1}-01-01`, JSON.stringify(off)],
          );
      }
    }
    console.log(
      'Schema 002 ready. Admin role available; existing users and data preserved. Review holiday years before submitting leave.',
    );
  } finally {
    await c.query("SELECT RELEASE_LOCK('scm_schema_migration')").catch(() => {});
    c.release();
  }
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  migrate()
    .then(() => pool.end())
    .catch(async (e) => {
      console.error('Migration failed:', e.message);
      await pool.end();
      process.exitCode = 1;
    });
}
