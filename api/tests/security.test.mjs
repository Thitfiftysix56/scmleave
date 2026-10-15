import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import {
  hashPassword,
  verifyPassword,
  encryptionKey,
  encryptImage,
  decryptImage,
  sessionToken,
  tokenHash,
} from '../src/security.mjs';
test('password hashing verifies correct password and rejects an incorrect one', async () => {
  const hash = await hashPassword('LongTestPassword!2026');
  assert.notEqual(hash, 'LongTestPassword!2026');
  assert.equal(await verifyPassword('LongTestPassword!2026', hash), true);
  assert.equal(await verifyPassword('WrongPassword', hash), false);
});
test('same password produces distinct salted hashes', async () =>
  assert.notEqual(
    await hashPassword('SamePassword!2026'),
    await hashPassword('SamePassword!2026'),
  ));
test('medical image encryption roundtrip, wrong key rejection, tamper detection', () => {
  const key = randomBytes(32),
    plain = Buffer.from('private-medical-image'),
    row = encryptImage(plain, key);
  assert.notDeepEqual(row.ciphertext, plain);
  assert.deepEqual(decryptImage(row, key), plain);
  assert.throws(() => decryptImage(row, randomBytes(32)));
  const tampered = { ...row, ciphertext: Buffer.from(row.ciphertext) };
  tampered.ciphertext[0] ^= 1;
  assert.throws(() => decryptImage(tampered, key));
});
test('encryption key rejects malformed configuration', () => {
  assert.throws(() => encryptionKey('weak'));
  assert.equal(encryptionKey(randomBytes(32).toString('base64')).length, 32);
});
test('session tokens are random and stored as hashes', () => {
  const a = sessionToken(),
    b = sessionToken();
  assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(a, b);
  assert.equal(tokenHash(a).length, 64);
  assert.notEqual(tokenHash(a), a);
});
