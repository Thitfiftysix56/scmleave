import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { z } from 'zod';
import { pool, transaction, audit, jsonValue } from './db.mjs';
import { requireRole } from './auth.mjs';
import { config } from './config.mjs';
import { encryptImage, decryptImage } from './security.mjs';
import { leaveInput, idInput, fail } from './validation.mjs';
import { leaveContext } from './context.mjs';
import { evaluateLeave } from './rules.mjs';
export const leaveRoutes = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 1, fieldSize: 20000 },
}).single('certificate');
async function normalizeImage(file) {
  if (!file) return null;
  try {
    const image = sharp(file.buffer, { limitInputPixels: 20000000, animated: false }),
      meta = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(meta.format) || meta.pages > 1)
      fail(400, 'รองรับรูป JPEG, PNG, WebP ที่เป็นภาพนิ่งเท่านั้น');
    const buffer = await image
      .rotate()
      .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
    if (buffer.length > 1024 * 1024) fail(400, 'ภาพหลังปรับขนาดยังใหญ่เกิน 1 MB กรุณาลดขนาดภาพ');
    return buffer;
  } catch (e) {
    if (e.status) throw e;
    fail(400, 'อ่านรูปไม่ได้ กรุณาใช้ JPEG/PNG/WebP ขนาดไม่เกิน 8 MB และไม่เกิน 20 ล้านพิกเซล');
  }
}
function parseMultipart(req) {
  let raw;
  try {
    raw = JSON.parse(req.body.payload || '{}');
  } catch {
    fail(400, 'payload ต้องเป็น JSON');
  }
  return leaveInput.parse(raw);
}
const select = `SELECT r.*,u.name,u.role,reviewer.name AS reviewer_name,
 EXISTS(SELECT 1 FROM certificates c WHERE c.request_id=r.id) AS has_certificate,
 (SELECT COUNT(*) FROM leave_days d WHERE d.request_id=r.id) AS charged_days
 FROM leave_requests r JOIN users u ON u.id=r.user_id LEFT JOIN users reviewer ON reviewer.id=r.reviewed_by`;
function present(row) {
  return {
    ...row,
    validation_snapshot: jsonValue(row.validation_snapshot),
    has_certificate: Boolean(row.has_certificate),
  };
}
leaveRoutes.get('/', async (req, res) => {
  const admin = req.user.role === 'SUPER_CS';
  const [rows] = await pool.execute(
    select +
      (admin ? '' : ' WHERE r.user_id=?') +
      ' ORDER BY r.created_at DESC,r.id DESC LIMIT 500',
    admin ? [] : [req.user.id],
  );
  res.json({ requests: rows.map(present) });
});
leaveRoutes.post('/preview', async (req, res) => {
  const v = z
    .object({ input: leaveInput, has_certificate: z.boolean().default(false) })
    .parse(req.body);
  const result = await transaction(async (c) =>
    evaluateLeave(
      { ...v.input, has_certificate: v.has_certificate },
      await leaveContext(c, req.user.id, v.input),
    ),
  );
  res.json(result);
});
leaveRoutes.post('/', upload, async (req, res) => {
  const v = parseMultipart(req),
    image = await normalizeImage(req.file);
  if (image && v.leave_type !== 'sick') fail(400, 'แนบใบรับรองแพทย์ได้เฉพาะลาป่วย');
  const saved = await transaction(async (c) => {
    const result = evaluateLeave(
      { ...v, has_certificate: Boolean(image) },
      await leaveContext(c, req.user.id, v),
    );
    if (!result.ok) fail(422, 'คำขอไม่ผ่านกติกา', result);
    const [r] = await c.execute(
      `INSERT INTO leave_requests(user_id,leave_type,start_date,end_date,reason,team_discussed,notified_klao,exception_requested,exception_reason,validation_snapshot) VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [
        req.user.id,
        v.leave_type,
        v.start_date,
        v.end_date,
        v.reason,
        v.team_discussed,
        v.notified_klao,
        result.requiresException,
        v.exception_reason,
        JSON.stringify(result),
      ],
    );
    for (const day of result.days)
      await c.execute('INSERT INTO leave_days(request_id,user_id,day) VALUES(?,?,?)', [
        r.insertId,
        req.user.id,
        day,
      ]);
    if (image) {
      const encrypted = encryptImage(image, config.fileKey);
      await c.execute(
        'INSERT INTO certificates(request_id,ciphertext,iv,auth_tag,bytes) VALUES(?,?,?,?,?)',
        [r.insertId, encrypted.ciphertext, encrypted.iv, encrypted.auth_tag, image.length],
      );
    }
    await audit(c, req.user.id, 'leave_submitted', 'leave', r.insertId, {
      chargedDays: result.chargedDays,
      requiresException: result.requiresException,
    });
    return { id: r.insertId, validation: result };
  });
  res.status(201).json({ ...saved, message: 'ส่งคำขอแล้ว โควตาวันลาได้รับการจองระหว่างรออนุมัติ' });
});
leaveRoutes.get('/:id', async (req, res) => {
  const id = idInput.parse(req.params.id),
    [rows] = await pool.execute(select + ' WHERE r.id=?', [id]);
  const row = rows[0];
  if (!row) fail(404, 'ไม่พบคำขอ');
  if (row.user_id !== req.user.id && req.user.role !== 'SUPER_CS')
    fail(403, 'ไม่มีสิทธิ์ดูคำขอนี้');
  const [days] = await pool.execute('SELECT day FROM leave_days WHERE request_id=? ORDER BY day', [
    id,
  ]);
  res.json({ request: { ...present(row), days: days.map((d) => d.day) } });
});
leaveRoutes.post('/:id/cancel', async (req, res) => {
  const id = idInput.parse(req.params.id);
  await transaction(async (c) => {
    const [[r]] = await c.execute('SELECT * FROM leave_requests WHERE id=?', [id]);
    if (!r) fail(404, 'ไม่พบคำขอ');
    if (r.user_id !== req.user.id && req.user.role !== 'SUPER_CS') fail(403, 'ไม่มีสิทธิ์ยกเลิก');
    if (!['pending', 'approved'].includes(r.status)) fail(409, 'คำขอไม่ได้อยู่ในสถานะที่ยกเลิกได้');
    const [coverage] = await c.execute(
      "SELECT c.id FROM coverage_requests c JOIN leave_days d ON d.day=c.day AND d.request_id=? WHERE c.covers_user_id=? AND c.status IN ('pending','approved') LIMIT 1",
      [id, r.user_id],
    );
    if (coverage.length)
      fail(409, 'มีคนขอมาทำงานแทนในวันลานี้ ให้ยกเลิกรายการทำแทนก่อนยกเลิกวันลา');
    await c.execute("UPDATE leave_requests SET status='cancelled' WHERE id=?", [id]);
    await audit(c, req.user.id, 'leave_cancelled', 'leave', id, { previousStatus: r.status });
  });
  res.json({ message: 'ยกเลิกและคืนโควตาแล้ว' });
});
leaveRoutes.post('/:id/review', requireRole('SUPER_CS'), async (req, res) => {
  const id = idInput.parse(req.params.id),
    v = z
      .object({
        decision: z.enum(['approved', 'rejected']),
        note: z.string().trim().max(2000).default(''),
        allow_exception: z.boolean().default(false),
      })
      .parse(req.body);
  await transaction(async (c) => {
    const [[r]] = await c.execute('SELECT * FROM leave_requests WHERE id=?', [id]);
    if (!r) fail(404, 'ไม่พบคำขอ');
    if (r.status !== 'pending') fail(409, 'คำขอนี้ได้รับการจัดการไปแล้ว');
    if (r.user_id === req.user.id)
      fail(403, 'ไม่สามารถอนุมัติหรือปฏิเสธคำขอของตนเอง ให้ Super อีกคนตรวจสอบ');
    const [[owner]] = await c.execute('SELECT status FROM users WHERE id=?', [r.user_id]);
    if (owner.status !== 'active' && v.decision === 'approved')
      fail(409, 'เจ้าของคำขอไม่ได้อยู่ในสถานะใช้งาน');
    if (v.decision === 'approved') {
      const [[cert]] = await c.execute('SELECT request_id FROM certificates WHERE request_id=?', [
        id,
      ]);
      const result = evaluateLeave(
        {
          ...r,
          team_discussed: Boolean(r.team_discussed),
          notified_klao: Boolean(r.notified_klao),
          exception_requested: Boolean(r.exception_requested),
          has_certificate: Boolean(cert),
        },
        await leaveContext(c, r.user_id, r, id),
      );
      if (!result.ok) fail(422, 'ตรวจเงื่อนไขล่าสุดไม่ผ่าน', result);
      if (result.requiresException && (!v.allow_exception || v.note.length < 10))
        fail(422, 'กรณีพิเศษต้องยืนยันข้อยกเว้น พร้อมหมายเหตุอย่างน้อย 10 ตัวอักษร');
      await c.execute('UPDATE leave_requests SET validation_snapshot=? WHERE id=?', [
        JSON.stringify(result),
        id,
      ]);
    } else if (v.note.length < 3) fail(400, 'กรุณาระบุเหตุผลที่ไม่อนุมัติ');
    await c.execute(
      'UPDATE leave_requests SET status=?,reviewed_by=?,reviewed_at=UTC_TIMESTAMP(),review_note=? WHERE id=?',
      [v.decision, req.user.id, v.note, id],
    );
    await audit(c, req.user.id, 'leave_' + v.decision, 'leave', id, {
      allow_exception: v.allow_exception,
    });
  });
  res.json({ message: v.decision === 'approved' ? 'อนุมัติแล้ว' : 'ไม่อนุมัติคำขอแล้ว' });
});
leaveRoutes.get('/:id/certificate', async (req, res) => {
  const id = idInput.parse(req.params.id);
  const [rows] = await pool.execute(
    'SELECT c.*,r.user_id FROM certificates c JOIN leave_requests r ON r.id=c.request_id WHERE c.request_id=?',
    [id],
  );
  const row = rows[0];
  if (!row) fail(404, 'ไม่พบใบรับรองแพทย์');
  if (row.user_id !== req.user.id && req.user.role !== 'SUPER_CS')
    fail(403, 'ดูใบรับรองได้เฉพาะเจ้าของและ Super Customer Service');
  const buffer = decryptImage(row, config.fileKey);
  await audit(pool, req.user.id, 'certificate_viewed', 'leave', id);
  res
    .set({
      'Content-Type': 'image/jpeg',
      'Content-Disposition': `inline; filename="certificate-${id}.jpg"`,
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
    })
    .send(buffer);
});
