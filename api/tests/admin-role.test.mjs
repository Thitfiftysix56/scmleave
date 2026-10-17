import test from 'node:test';
import assert from 'node:assert/strict';
import { memberUpdate, registration, adminCreation } from '../src/validation.mjs';
import { isManager, isStaff } from '../src/roles.mjs';

test('Admin is a manager but is not a leave-calendar participant', () => {
  assert.equal(isManager('ADMIN'), true);
  assert.equal(isStaff('ADMIN'), false);
  assert.equal(isManager('SUPER_CS'), true);
  assert.equal(isStaff('SUPER_CS'), true);
  for (const role of ['CS', 'STORE']) {
    assert.equal(isManager(role), false);
    assert.equal(isStaff(role), true);
  }
});
test('Admin updates require no schedule; staff updates still require valid off days', () => {
  const fields = { name: 'System administrator', status: 'active' };
  assert.deepEqual(memberUpdate.parse({ ...fields, role: 'ADMIN' }).weekly_off, []);
  assert.equal(
    memberUpdate.safeParse({ ...fields, role: 'ADMIN', weekly_off: [0, 6] }).success,
    false,
  );
  for (const role of ['SUPER_CS', 'CS', 'STORE']) {
    assert.equal(memberUpdate.safeParse({ ...fields, role }).success, false);
    assert.equal(memberUpdate.safeParse({ ...fields, role, weekly_off: [] }).success, false);
    assert.equal(memberUpdate.safeParse({ ...fields, role, weekly_off: [5, 6] }).success, true);
  }
});
test('public registration cannot create managers and Admin creation accepts identity only', () => {
  const fields = {
    name: 'Test account',
    email: 'test@example.com',
    password: 'LongPassword123!',
    weekly_off: [0, 6],
  };
  for (const role of ['ADMIN', 'SUPER_CS'])
    assert.equal(registration.safeParse({ ...fields, role }).success, false);
  assert.deepEqual(adminCreation.parse({ name: 'System admin', email: 'ADMIN@EXAMPLE.COM' }), {
    name: 'System admin',
    email: 'admin@example.com',
  });
  assert.equal(
    adminCreation.safeParse({ name: 'Admin', email: 'admin@example.com', role: 'ADMIN' }).success,
    false,
  );
});
