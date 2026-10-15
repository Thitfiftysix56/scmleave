import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { encryptionKey } from './security.mjs';
dotenv.config({ path: fileURLToPath(new URL('../.env', import.meta.url)), quiet: true });
dotenv.config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });
const e = process.env;
export const config = {
  port: Number(e.PORT || 4000),
  production: e.NODE_ENV === 'production',
  origins: (e.CORS_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),
  trustProxy: Number(e.TRUST_PROXY || 0),
  sessionHours: Number(e.SESSION_HOURS || 12),
  fileKey: encryptionKey(e.FILE_ENCRYPTION_KEY),
  db: {
    host: e.DB_HOST || '127.0.0.1',
    port: Number(e.DB_PORT || 3306),
    database: e.DB_NAME || 'scm_leave',
    user: e.DB_USER || 'scm',
    password: e.DB_PASSWORD || '',
    charset: 'utf8mb4',
    dateStrings: true,
    timezone: 'Z',
    connectionLimit: 5,
    waitForConnections: true,
    queueLimit: 40,
    enableKeepAlive: true,
    ...(e.DB_SSL === 'true'
      ? {
          ssl: {
            rejectUnauthorized: true,
            ca:
              e.DB_SSL_CA?.replace(/\\n/g, '\n') ||
              (e.DB_SSL_CA_FILE ? fs.readFileSync(e.DB_SSL_CA_FILE, 'utf8') : undefined),
          },
        }
      : {}),
  },
};
if (config.production && config.origins.some((o) => !o.startsWith('https://')))
  throw new Error('Production CORS_ORIGINS must use https://');
if (!Number.isFinite(config.sessionHours) || config.sessionHours < 1 || config.sessionHours > 24)
  throw new Error('SESSION_HOURS must be between 1 and 24');
