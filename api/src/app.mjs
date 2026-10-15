import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { pool } from './db.mjs';
import { config } from './config.mjs';
import { authenticate, requireRole } from './auth.mjs';
import { authRoutes } from './auth-routes.mjs';
import { leaveRoutes } from './leave-routes.mjs';
import { adminRoutes } from './admin-routes.mjs';
import { calendarRoutes } from './calendar-routes.mjs';
import { coverageRoutes } from './coverage-routes.mjs';
import { requestState } from './request-state.mjs';
export const app = express();
app.disable('x-powered-by');
if (config.trustProxy) app.set('trust proxy', config.trustProxy);
app.use((req, res, next) => requestState.run({}, next));
app.use((req, res, next) => {
  req.requestId = randomUUID();
  res.set('X-Request-Id', req.requestId);
  next();
});
app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.origins.includes(origin)) callback(null, true);
      else callback(Object.assign(new Error('Origin ไม่ได้รับอนุญาต'), { status: 403 }));
    },
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 600,
  }),
);
app.use(express.json({ limit: '32kb' }));
app.get('/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', service: 'scm-leave-api' });
});
app.get('/', (req, res) => res.json({ service: 'SCM Leave API', health: '/health' }));
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    limit: 180,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่' },
  }),
);
app.use('/api/auth', authRoutes);
app.use('/api', authenticate, (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use('/api/leaves', leaveRoutes);
app.use('/api/coverage', coverageRoutes);
app.use('/api/admin', requireRole('SUPER_CS'), adminRoutes);
app.use('/api', calendarRoutes);
app.use((req, res) =>
  res.status(404).json({ message: 'ไม่พบ API ที่ร้องขอ', requestId: req.requestId }),
);
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof ZodError)
    return res
      .status(400)
      .json({
        message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        requestId: req.requestId,
      });
  if (err.code === 'LIMIT_FILE_SIZE')
    return res.status(400).json({ message: 'รูปมีขนาดเกิน 8 MB' });
  if (err.name === 'MulterError')
    return res.status(400).json({ message: 'ไฟล์อัปโหลดไม่ถูกต้อง แนบรูปได้ 1 รูปเท่านั้น' });
  if (err.code === 'ER_DUP_ENTRY')
    return res.status(409).json({ message: 'ข้อมูลซ้ำกับรายการที่มีอยู่แล้ว' });
  if (err instanceof SyntaxError && err.type === 'entity.parse.failed')
    return res.status(400).json({ message: 'JSON ไม่ถูกต้อง' });
  const status = Number(err.status) || 500;
  if (status >= 500)
    console.error(
      JSON.stringify({
        requestId: req.requestId,
        method: req.method,
        path: req.path,
        error: err.message,
      }),
    );
  res
    .status(status)
    .json({
      message: status >= 500 ? 'ระบบขัดข้อง กรุณาลองใหม่หรือติดต่อผู้ดูแล' : err.message,
      ...(err.details ? { details: err.details } : {}),
      requestId: req.requestId,
    });
});
