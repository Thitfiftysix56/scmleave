import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';

// Explicit opt-in and database-name guard: never run against a real team's DB.
if (process.env.RUN_INTEGRATION !== '1' || process.env.DB_NAME !== 'scm_leave_test')
  throw new Error(
    'Set RUN_INTEGRATION=1 and DB_NAME=scm_leave_test with an EMPTY, separate test database.',
  );
process.env.NODE_ENV = 'test';
process.env.FILE_ENCRYPTION_KEY = randomBytes(32).toString('base64');
const initialPassword = 'Init-' + randomBytes(12).toString('hex'),
  mainPassword = 'Admin-' + randomBytes(12).toString('hex');
process.env.BOOTSTRAP_ADMIN_EMAIL = 'admin@scm.test';
process.env.BOOTSTRAP_ADMIN_PASSWORD = initialPassword;
process.env.BOOTSTRAP_ADMIN_NAME = 'Integration Admin';
process.env.SEED_DEMO = 'false';
const { pool } = await import('../src/db.mjs');
const { migrate } = await import('../src/migrate.mjs');
const { app } = await import('../src/app.mjs');
const { todayTH, addDays, weekday } = await import('../src/dates.mjs');
const { thaiHolidays } = await import('../src/holidays.mjs');
const { hashPassword } = await import('../src/security.mjs');
const client = request(app),
  year = Number(todayTH().slice(0, 4)) + 1;
const members = {},
  tokens = {};
let adminToken, friday, sickMonday, otherMonday, winnerId, winnerUser, approvedId, certificateId;
const auth = (req, token = adminToken) => req.set('Authorization', `Bearer ${token}`);
const payload = (extra) => ({
  leave_type: 'annual',
  start_date: friday,
  end_date: friday,
  reason: 'integration private reason',
  team_discussed: false,
  notified_klao: false,
  exception_requested: false,
  exception_reason: '',
  ...extra,
});
const sendLeave = (token, data, file) => {
  const req = auth(client.post('/api/leaves'), token).field('payload', JSON.stringify(data));
  return file
    ? req.attach('certificate', file, { filename: 'medical.png', contentType: 'image/png' })
    : req;
};
function safeDay(dow, start) {
  const h = new Set(thaiHolidays(year).map((h) => h.day));
  for (let d = start; d < `${year}-12-01`; d = addDays(d, 1)) {
    if (weekday(d) !== dow) continue;
    let safe = true;
    for (let n = -6; n <= 8; n++) if (h.has(addDays(d, n))) safe = false;
    if (safe) return d;
  }
  throw new Error('No safe test day');
}
async function login(email, password) {
  const r = await client.post('/api/auth/login').send({ email, password });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}
before(async () => {
  const [[count]] = await pool.query(
    'SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE()',
  );
  assert.equal(
    count.n,
    0,
    'Test database must be empty. Create a fresh dedicated database/container.',
  );
  await migrate();
  await migrate();
  friday = safeDay(5, `${year}-02-01`);
  sickMonday = safeDay(1, `${year}-03-01`);
  otherMonday = safeDay(1, `${year}-05-01`);
});
after(async () => {
  await pool.end();
});

test('schema migration is idempotent and API health checks MySQL', async () => {
  const r = await client.get('/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ok');
  const [[roles]] = await pool.query('SELECT COUNT(*) AS n FROM roles');
  assert.equal(roles.n, 4);
});
test('bootstrap user must change password; old sessions are invalidated', async () => {
  const first = await login('admin@scm.test', initialPassword);
  assert.equal(first.user.role, 'ADMIN');
  assert.equal(first.user.must_change_password, true);
  assert.equal((await auth(client.get('/api/meta'), first.token)).status, 403);
  const changed = await auth(client.post('/api/auth/password'), first.token).send({
    currentPassword: initialPassword,
    newPassword: mainPassword,
  });
  assert.equal(changed.status, 200);
  assert.equal((await auth(client.get('/api/auth/me'), first.token)).status, 401);
  adminToken = (await login('admin@scm.test', mainPassword)).token;
});
test('signup cannot grant Admin or Super roles, and pending users cannot login', async () => {
  const r = await client.post('/api/auth/register').send({
    name: 'Forged admin',
    email: 'forged@scm.test',
    password: mainPassword,
    role: 'SUPER_CS',
    weekly_off: [0, 6],
  });
  assert.equal(r.status, 400);
  assert.equal(
    (
      await client.post('/api/auth/register').send({
        name: 'Forged Admin',
        email: 'forged-admin@scm.test',
        password: mainPassword,
        role: 'ADMIN',
      })
    ).status,
    400,
  );
  for (const [key, role] of [
    ['cs1', 'CS'],
    ['cs2', 'CS'],
    ['store1', 'STORE'],
    ['store2', 'STORE'],
  ]) {
    const email = `${key}@scm.test`,
      password = 'Member-' + randomBytes(12).toString('hex');
    const created = await client
      .post('/api/auth/register')
      .send({ name: key, email, password, role, weekly_off: [0, 6] });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    members[key] = { email, password, role };
  }
  const denied = await client
    .post('/api/auth/login')
    .send({ email: members.cs1.email, password: members.cs1.password });
  assert.equal(denied.status, 403);
});
test('Admin activates members; ordinary users cannot manage members or create Admin', async () => {
  const all = (await auth(client.get('/api/admin/members'))).body.members;
  for (const [key, m] of Object.entries(members)) {
    m.id = all.find((u) => u.email === m.email).id;
    const r = await auth(client.patch(`/api/admin/members/${m.id}`)).send({
      name: key,
      role: m.role,
      status: 'active',
      weekly_off: [0, 6],
      valid_from: todayTH(),
    });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    tokens[key] = (await login(m.email, m.password)).token;
  }
  assert.equal((await auth(client.get('/api/admin/members'), tokens.cs1)).status, 403);
  assert.equal(
    (
      await auth(client.post('/api/admin/admins'), tokens.cs1).send({
        name: 'No privilege',
        email: 'denied@scm.test',
      })
    ).status,
    403,
  );
  assert.equal((await client.get('/api/calendar')).status, 401);
});
test('cannot demote or deactivate the last active manager', async () => {
  const me = (await auth(client.get('/api/auth/me'))).body.user;
  const r = await auth(client.patch(`/api/admin/members/${me.id}`)).send({
    name: me.name,
    role: 'CS',
    status: 'active',
    weekly_off: [0, 6],
    valid_from: todayTH(),
  });
  assert.equal(r.status, 409);
  assert.equal(
    (
      await auth(client.patch(`/api/admin/members/${me.id}`)).send({
        name: me.name,
        role: 'ADMIN',
        status: 'inactive',
      })
    ).status,
    409,
  );
});
test('Admin has no schedule or balance and cannot submit leave or coverage directly', async () => {
  const me = (await auth(client.get('/api/auth/me'))).body.user;
  const [[s]] = await pool.execute('SELECT COUNT(*) AS n FROM work_schedules WHERE user_id=?', [
    me.id,
  ]);
  assert.equal(s.n, 0);
  assert.deepEqual((await auth(client.get('/api/meta'))).body.schedules, []);
  assert.deepEqual((await auth(client.get('/api/balances'))).body.balances, []);
  assert.equal(
    (await auth(client.post('/api/leaves/preview')).send({ input: payload() })).status,
    403,
  );
  assert.equal((await sendLeave(adminToken, payload())).status, 403);
  assert.equal(
    (
      await auth(client.post('/api/coverage')).send({
        covers_user_id: members.cs1.id,
        day: friday,
        hours: 8,
        requested_ot: false,
        reason: 'Admin should not cover',
      })
    ).status,
    403,
  );
  const balances = await auth(client.put(`/api/admin/members/${me.id}/entitlements/${year}`)).send(
    ['annual', 'personal', 'sick'].map((leave_type) => ({ leave_type, quota: 10 })),
  );
  assert.equal(balances.status, 400);
  const people = await auth(client.get('/api/people'));
  assert.equal(
    people.body.members.some((m) => m.id === me.id),
    false,
  );
  const coverAdmin = await auth(client.post('/api/coverage'), tokens.cs1).send({
    covers_user_id: me.id,
    day: friday,
    hours: 8,
    requested_ot: false,
    reason: 'Cannot cover Admin',
  });
  assert.equal(coverAdmin.status, 400);
});
test('an existing account can become Admin without off days and retains its password and history', async () => {
  const password = 'Legacy-' + randomBytes(12).toString('hex');
  const hash = await hashPassword(password);
  const [r] = await pool.execute(
    "INSERT INTO users(name,email,password_hash,role,status) VALUES('Existing Super','legacy@scm.test',?,'SUPER_CS','active')",
    [hash],
  );
  const id = r.insertId;
  await pool.execute('INSERT INTO work_schedules(user_id,valid_from,weekly_off) VALUES(?,?,?)', [
    id,
    `${year - 2}-01-01`,
    '[5,6]',
  ]);
  await migrate();
  const legacy = await login('legacy@scm.test', password);
  assert.equal(legacy.user.role, 'SUPER_CS');
  assert.equal((await auth(client.get('/api/admin/members'), legacy.token)).status, 200);
  assert.equal(
    (
      await auth(client.patch(`/api/admin/members/${id}`), legacy.token).send({
        name: 'Existing Admin',
        role: 'ADMIN',
        status: 'active',
      })
    ).status,
    200,
  );
  assert.equal((await auth(client.get('/api/auth/me'), legacy.token)).status, 401);
  let updated = await login('legacy@scm.test', password);
  assert.equal(updated.user.role, 'ADMIN');
  assert.deepEqual((await auth(client.get('/api/meta'), updated.token)).body.schedules, []);
  const [[history]] = await pool.execute(
    'SELECT COUNT(*) AS n FROM work_schedules WHERE user_id=?',
    [id],
  );
  assert.equal(history.n, 1);
  const cal = await auth(client.get(`/api/calendar?start=${year}-01-01&end=${year + 1}-01-01`));
  assert.equal(
    cal.body.members.some((m) => m.id === id),
    false,
  );
  assert.equal(
    cal.body.events.some((e) => e.extendedProps.user_id === id),
    false,
  );
  assert.equal(
    (
      await auth(client.patch(`/api/admin/members/${id}`)).send({
        name: 'Existing Super',
        role: 'SUPER_CS',
        status: 'active',
        weekly_off: [0, 6],
        valid_from: todayTH(),
      })
    ).status,
    200,
  );
  updated = await login('legacy@scm.test', password);
  assert.equal(updated.user.role, 'SUPER_CS');
  members.super = { id, email: 'legacy@scm.test', password, role: 'SUPER_CS' };
  tokens.super = updated.token;
});
test('manager creates an Admin without a schedule and a one-time password that must be changed', async () => {
  const created = await auth(client.post('/api/admin/admins'), tokens.super).send({
    name: 'Second Admin',
    email: 'second-admin@scm.test',
  });
  assert.equal(created.status, 201);
  const first = await login('second-admin@scm.test', created.body.temporaryPassword);
  assert.equal(first.user.role, 'ADMIN');
  assert.equal(first.user.must_change_password, true);
  assert.equal((await auth(client.get('/api/admin/members'), first.token)).status, 403);
  const [[s]] = await pool.execute('SELECT COUNT(*) AS n FROM work_schedules WHERE user_id=?', [
    created.body.id,
  ]);
  assert.equal(s.n, 0);
  const password = 'NewAdmin-' + randomBytes(12).toString('hex');
  assert.equal(
    (
      await auth(client.post('/api/auth/password'), first.token).send({
        currentPassword: created.body.temporaryPassword,
        newPassword: password,
      })
    ).status,
    200,
  );
  const fresh = await login('second-admin@scm.test', password);
  assert.equal((await auth(client.get('/api/admin/members'), fresh.token)).status, 200);
  assert.equal(
    (
      await auth(client.post('/api/admin/admins')).send({
        name: 'Duplicate',
        email: 'second-admin@scm.test',
      })
    ).status,
    409,
  );
});
test('unconfirmed holiday calendar rejects planned leave, then Super confirms years', async () => {
  const blocked = await sendLeave(tokens.cs1, payload());
  assert.equal(blocked.status, 422);
  assert.equal(
    blocked.body.details.errors.some((e) => e.code === 'HOLIDAYS_UNCONFIRMED'),
    true,
  );
  for (const y of [year - 1, year, year + 1]) {
    assert.equal((await auth(client.get(`/api/admin/holidays/${y}`))).status, 200);
    assert.equal(
      (
        await auth(client.post(`/api/admin/holidays/${y}/confirm`)).send({
          source: 'Integration calendar reviewed against test fixture',
        })
      ).status,
      200,
    );
  }
});
test('holiday import, confirmation, and editing preserve a review trail', async () => {
  const y = year + 2;
  assert.equal((await auth(client.get(`/api/admin/holidays/${y}`))).status, 200);
  const imported = await auth(client.post(`/api/admin/holidays/${y}/import`)).send([
    { day: `${y}-02-02`, name: 'Imported organization holiday' },
  ]);
  assert.equal(imported.status, 200);
  let result = await auth(client.get(`/api/admin/holidays/${y}`));
  assert.equal(Boolean(result.body.meta.confirmed), false);
  const row = result.body.holidays.find((h) => h.name === 'Imported organization holiday');
  assert.ok(row);
  assert.equal(
    (
      await auth(client.post(`/api/admin/holidays/${y}/confirm`)).send({
        source: 'Organization announcement verified for integration test',
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await auth(client.patch(`/api/admin/holidays/${row.id}`)).send({
        name: row.name,
        enabled: false,
      })
    ).status,
    200,
  );
  result = await auth(client.get(`/api/admin/holidays/${y}`));
  assert.equal(Boolean(result.body.meta.confirmed), false);
  assert.equal(Boolean(result.body.holidays.find((h) => h.id === row.id).enabled), false);
});
test('concurrent CS/Store leave submissions cannot both reserve a one-person Friday', async () => {
  const results = await Promise.all([
    sendLeave(tokens.cs1, payload()),
    sendLeave(tokens.store1, payload()),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 422]);
  const winIndex = results.findIndex((r) => r.status === 201);
  winnerId = results[winIndex].body.id;
  winnerUser = winIndex === 0 ? 'cs1' : 'store1';
  const [[count]] = await pool.execute(
    "SELECT COUNT(*) AS n FROM leave_days d JOIN leave_requests r ON r.id=d.request_id WHERE d.day=? AND r.status IN ('pending','approved')",
    [friday],
  );
  assert.equal(count.n, 1);
});
test('another member cannot read a private leave reason; reviewers cannot approve twice', async () => {
  assert.equal((await auth(client.get(`/api/leaves/${winnerId}`), tokens.cs2)).status, 403);
  const approved = await auth(client.post(`/api/leaves/${winnerId}/review`)).send({
    decision: 'approved',
    note: 'Approved by test supervisor',
    allow_exception: false,
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.body));
  assert.equal(
    (
      await auth(client.post(`/api/leaves/${winnerId}/review`)).send({
        decision: 'approved',
        note: 'Duplicate attempt',
        allow_exception: false,
      })
    ).status,
    409,
  );
});
test('cancellation releases Friday slot; another employee can reserve and be approved', async () => {
  assert.equal(
    (await auth(client.post(`/api/leaves/${winnerId}/cancel`), tokens[winnerUser]).send({})).status,
    200,
  );
  const loser = winnerUser === 'cs1' ? 'store1' : 'cs1';
  const r = await sendLeave(tokens[loser], payload());
  assert.equal(r.status, 201, JSON.stringify(r.body));
  approvedId = r.body.id;
  assert.equal(
    (
      await auth(client.post(`/api/leaves/${approvedId}/review`)).send({
        decision: 'approved',
        note: 'Approval after cancellation',
        allow_exception: false,
      })
    ).status,
    200,
  );
});
test('multipart file validation rejects forged image content', async () => {
  const r = await sendLeave(
    tokens.cs2,
    payload({ leave_type: 'sick', start_date: otherMonday, end_date: otherMonday }),
    Buffer.from('<svg><script>alert(1)</script></svg>'),
  );
  assert.equal(r.status, 400);
});
test('sick leave certificate is mandatory at threshold and stored as encrypted JPEG', async () => {
  const body = payload({
    leave_type: 'sick',
    start_date: sickMonday,
    end_date: addDays(sickMonday, 2),
    team_discussed: true,
    notified_klao: true,
    exception_requested: true,
    exception_reason: 'ป่วยต่อเนื่องและได้แจ้งหัวหน้าทีมเรียบร้อย',
  });
  const blocked = await sendLeave(tokens.cs2, body);
  assert.equal(blocked.status, 422);
  assert.equal(
    blocked.body.details.errors.some((e) => e.code === 'CERTIFICATE'),
    true,
  );
  const file = await sharp({
    create: { width: 20, height: 20, channels: 3, background: { r: 240, g: 240, b: 240 } },
  })
    .png()
    .toBuffer();
  const submitted = await sendLeave(tokens.cs2, body, file);
  assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
  certificateId = submitted.body.id;
  const [[image]] = await pool.execute('SELECT * FROM certificates WHERE request_id=?', [
    certificateId,
  ]);
  assert.equal(image.iv.length, 12);
  assert.equal(image.auth_tag.length, 16);
  assert.equal(
    (await auth(client.get(`/api/leaves/${certificateId}/certificate`), tokens.cs1)).status,
    403,
  );
  const own = await auth(client.get(`/api/leaves/${certificateId}/certificate`), tokens.cs2);
  assert.equal(own.status, 200);
  assert.match(own.headers['content-type'], /image\/jpeg/);
  assert.equal(own.body[0], 0xff);
  assert.notDeepEqual(image.ciphertext, own.body);
  assert.equal((await auth(client.get(`/api/leaves/${certificateId}/certificate`))).status, 200);
});
test('special approval requires explicit reviewer acknowledgement and reason', async () => {
  const no = await auth(client.post(`/api/leaves/${certificateId}/review`)).send({
    decision: 'approved',
    note: 'OK',
    allow_exception: false,
  });
  assert.equal(no.status, 422);
  const yes = await auth(client.post(`/api/leaves/${certificateId}/review`)).send({
    decision: 'approved',
    note: 'Reviewed medical reason and staffing exception',
    allow_exception: true,
  });
  assert.equal(yes.status, 200, JSON.stringify(yes.body));
});
test('team calendar omits private reasons and certificate data', async () => {
  const r = await auth(
    client.get(`/api/calendar?start=${year}-01-01&end=${year + 1}-01-01`),
    tokens.cs1,
  );
  assert.equal(r.status, 200);
  const text = JSON.stringify(r.body);
  assert.equal(text.includes('integration private reason'), false);
  assert.equal(text.includes('ciphertext'), false);
  assert.equal(text.includes('password_hash'), false);
  assert.equal(
    r.body.events.some((e) => e.extendedProps.kind === 'leave'),
    true,
  );
});
test('direct API calls cannot bypass own-overlap checks or date validation', async () => {
  const duplicate = await sendLeave(
    tokens.cs2,
    payload({ leave_type: 'sick', start_date: sickMonday, end_date: sickMonday }),
  );
  assert.equal(duplicate.status, 422);
  assert.equal(
    duplicate.body.details.errors.some((e) => e.code === 'OVERLAP'),
    true,
  );
  const invalid = await sendLeave(
    tokens.cs1,
    payload({ start_date: `${year}-02-31`, end_date: `${year}-02-31` }),
  );
  assert.equal(invalid.status, 400);
  assert.equal((await auth(client.get('/api/leaves/1%20OR%201=1'))).status, 400);
});
test('configured zero annual quota is enforced and pending leave prevents schedule edits', async () => {
  const quota = await auth(
    client.put(`/api/admin/members/${members.cs2.id}/entitlements/${year}`),
  ).send([
    { leave_type: 'annual', quota: 0 },
    { leave_type: 'personal', quota: null },
    { leave_type: 'sick', quota: null },
  ]);
  assert.equal(quota.status, 200);
  const blocked = await sendLeave(
    tokens.cs2,
    payload({ start_date: otherMonday, end_date: otherMonday }),
  );
  assert.equal(blocked.status, 422);
  assert.equal(
    blocked.body.details.errors.some((e) => e.code === 'BALANCE'),
    true,
  );
  const change = await auth(client.patch(`/api/admin/members/${members.cs2.id}`)).send({
    name: 'cs2',
    role: 'CS',
    status: 'active',
    weekly_off: [5, 6],
    valid_from: todayTH(),
  });
  assert.equal(change.status, 409);
  assert.equal(
    (
      await auth(client.patch(`/api/admin/members/${members.cs2.id}`)).send({
        name: 'cs2',
        role: 'ADMIN',
        status: 'active',
      })
    ).status,
    409,
  );
  const addHoliday = await auth(client.post('/api/admin/holidays')).send({
    day: addDays(friday, 1),
    name: 'Unreviewed special day',
    source: 'Test source',
  });
  assert.equal(addHoliday.status, 409);
});
test('Super cannot approve own leave request', async () => {
  const submitted = await sendLeave(
    tokens.super,
    payload({ start_date: otherMonday, end_date: otherMonday }),
  );
  assert.equal(submitted.status, 201, JSON.stringify(submitted.body));
  const r = await auth(client.post(`/api/leaves/${submitted.body.id}/review`), tokens.super).send({
    decision: 'approved',
    note: 'Self approval attempted',
    allow_exception: false,
  });
  assert.equal(r.status, 403);
  assert.equal(
    (
      await auth(client.post(`/api/leaves/${submitted.body.id}/review`)).send({
        decision: 'approved',
        note: 'Admin reviews Super request',
        allow_exception: false,
      })
    ).status,
    200,
  );
  assert.equal(
    (await auth(client.post(`/api/leaves/${submitted.body.id}/cancel`)).send({})).status,
    200,
  );
});
test('OT requires a different Store authorizer and Super approval; creates no compensation leave', async () => {
  const saturday = addDays(otherMonday, 5);
  const created = await auth(client.post('/api/coverage'), tokens.store1).send({
    covers_user_id: members.cs1.id,
    day: saturday,
    hours: 8,
    requested_ot: true,
    reason: 'Cover team member weekly day off',
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const [pending] = await pool.query('SELECT * FROM coverage_requests ORDER BY id DESC LIMIT 1'),
    id = pending[0].id;
  assert.equal(
    (await auth(client.post(`/api/coverage/${id}/store-authorize`), tokens.cs1).send({})).status,
    403,
  );
  assert.equal(
    (await auth(client.post(`/api/coverage/${id}/store-authorize`)).send({})).status,
    403,
  );
  assert.equal(
    (await auth(client.post(`/api/coverage/${id}/store-authorize`), tokens.store1).send({})).status,
    403,
  );
  assert.equal(
    (
      await auth(client.post(`/api/coverage/${id}/review`)).send({
        decision: 'approved',
        note: 'Supervisor review',
      })
    ).status,
    422,
  );
  assert.equal(
    (await auth(client.post(`/api/coverage/${id}/store-authorize`), tokens.store2).send({})).status,
    200,
  );
  assert.equal(
    (
      await auth(client.post(`/api/coverage/${id}/review`)).send({
        decision: 'approved',
        note: 'Store authorized and staffing confirmed',
      })
    ).status,
    200,
  );
  const [[entitlements]] = await pool.execute(
    'SELECT COUNT(*) AS n FROM entitlements WHERE user_id=?',
    [members.store1.id],
  );
  assert.equal(entitlements.n, 0);
});
test('password reset revokes sessions and forces change, and medical reads are audited', async () => {
  const reset = await auth(
    client.post(`/api/admin/members/${members.store2.id}/reset-password`),
  ).send({});
  assert.equal(reset.status, 200);
  assert.equal(reset.body.temporaryPassword.length >= 12, true);
  assert.equal((await auth(client.get('/api/auth/me'), tokens.store2)).status, 401);
  const fresh = await login(members.store2.email, reset.body.temporaryPassword);
  assert.equal(fresh.user.must_change_password, true);
  assert.equal((await auth(client.get('/api/meta'), fresh.token)).status, 403);
  const audit = await auth(client.get('/api/admin/audit'));
  assert.equal(audit.status, 200);
  assert.equal(audit.body.logs.filter((l) => l.action === 'certificate_viewed').length, 2);
});
