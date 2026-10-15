import { app } from './app.mjs';
import { pool } from './db.mjs';
import { config } from './config.mjs';
await pool.query('SELECT 1');
const server = app.listen(config.port, '0.0.0.0', () =>
  console.log(`SCM API listening on port ${config.port}`),
);
function shutdown() {
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
