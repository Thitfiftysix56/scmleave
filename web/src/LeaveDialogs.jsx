import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Stack,
  Typography,
  TextField,
  Button,
  Alert,
  Checkbox,
  FormControlLabel,
  Divider,
  Chip,
  Link,
} from '@mui/material';
import UploadFileRoundedIcon from '@mui/icons-material/UploadFileRounded';
import FactCheckRoundedIcon from '@mui/icons-material/FactCheckRounded';
import { api, LEAVE_LABEL, today, displayDate } from './api';
import { SelectField, Status, Loading } from './ui';
const initial = () => ({
  leave_type: 'annual',
  start_date: today(),
  end_date: today(),
  reason: '',
  team_discussed: false,
  notified_klao: false,
  exception_requested: false,
  exception_reason: '',
});
export function LeaveForm({ open, onClose, onSaved, notify, dates }) {
  const [form, setForm] = useState(initial),
    [file, setFile] = useState(null),
    [preview, setPreview] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (open) {
      setForm({ ...initial(), ...dates });
      setFile(null);
      setPreview(null);
      setError('');
    }
  }, [open, dates]);
  const change = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setPreview(null);
    setError('');
  };
  async function check() {
    setBusy(true);
    setError('');
    try {
      setPreview(
        await api('/leaves/preview', {
          method: 'POST',
          body: { input: form, has_certificate: Boolean(file) },
        }),
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.append('payload', JSON.stringify(form));
      if (file) body.append('certificate', file);
      const r = await api('/leaves', { method: 'POST', body });
      notify(r.message);
      onSaved();
      onClose();
    } catch (e) {
      setError(e.message);
      if (e.details) setPreview(e.details);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        สร้างคำขอลา
        <Typography variant="body2" color="text.secondary">
          ระบบคำนวณวันลาร่วมกับวันหยุดปกติของคุณ
        </Typography>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2.4} mt={1}>
          {error && <Alert severity="error">{error}</Alert>}
          <SelectField
            label="ประเภทการลา"
            value={form.leave_type}
            onChange={(v) => {
              change('leave_type', v);
              setFile(null);
            }}
            options={LEAVE_LABEL}
          />
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
            <TextField
              fullWidth
              type="date"
              label="ตั้งแต่วันที่"
              InputLabelProps={{ shrink: true }}
              value={form.start_date}
              onChange={(e) => {
                change('start_date', e.target.value);
                if (e.target.value > form.end_date) change('end_date', e.target.value);
              }}
            />
            <TextField
              fullWidth
              type="date"
              label="ถึงวันที่ (รวมวันนี้)"
              InputLabelProps={{ shrink: true }}
              value={form.end_date}
              onChange={(e) => change('end_date', e.target.value)}
            />
          </Stack>
          <TextField
            label="เหตุผลการลา"
            required
            multiline
            minRows={2}
            value={form.reason}
            onChange={(e) => change('reason', e.target.value)}
            inputProps={{ maxLength: 2000 }}
            helperText="เจ้าของคำขอและ Super Customer Service เท่านั้นที่เห็นเหตุผล"
          />
          {form.leave_type === 'sick' && (
            <Box sx={{ border: '1px dashed #c4cdd5', p: 2, borderRadius: 2, bgcolor: '#f9fafb' }}>
              <Typography variant="body2" fontWeight={700} mb={1}>
                รูปใบรับรองแพทย์
              </Typography>
              <Button component="label" variant="outlined" startIcon={<UploadFileRoundedIcon />}>
                {file ? 'เปลี่ยนรูป' : 'เลือกรูปภาพ'}
                <input
                  type="file"
                  hidden
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f && f.size > 8 * 1024 * 1024) {
                      setError('เลือกภาพขนาดไม่เกิน 8 MB');
                      return;
                    }
                    setFile(f || null);
                    setPreview(null);
                  }}
                />
              </Button>
              {file && (
                <Typography variant="body2" mt={1}>
                  {file.name} · {(file.size / 1024).toFixed(0)} KB{' '}
                  <Button
                    size="small"
                    onClick={() => {
                      setFile(null);
                      setPreview(null);
                    }}
                  >
                    นำออก
                  </Button>
                </Typography>
              )}
              <Typography variant="caption" display="block" color="text.secondary" mt={1}>
                JPEG / PNG / WebP ≤ 8 MB · ตั้งแต่ 3 วันต้องแนบ (ผู้ดูแลปรับเป็น 2 วันได้) ·
                เก็บแบบเข้ารหัส
              </Typography>
            </Box>
          )}
          <Divider />
          <Box>
            <Typography variant="subtitle2">กรณีหยุดต่อเนื่อง 5 วัน / เหตุจำเป็น</Typography>
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.team_discussed}
                  onChange={(e) => change('team_discussed', e.target.checked)}
                />
              }
              label={<Typography variant="body2">พูดคุยภายในทีมแล้ว</Typography>}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.notified_klao}
                  onChange={(e) => change('notified_klao', e.target.checked)}
                />
              }
              label={<Typography variant="body2">แจ้งพี่เกล้าเพิ่มเติมแล้ว</Typography>}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.exception_requested}
                  onChange={(e) => change('exception_requested', e.target.checked)}
                />
              }
              label={<Typography variant="body2">ขอให้ Super พิจารณาอนุมัติพิเศษ</Typography>}
            />
            {form.exception_requested && (
              <TextField
                fullWidth
                label="เหตุจำเป็น (อย่างน้อย 10 ตัวอักษร)"
                multiline
                minRows={2}
                value={form.exception_reason}
                onChange={(e) => change('exception_reason', e.target.value)}
                helperText="วันลาทั่วไป 5 วัน หรือเหตุป่วยที่ขัดกับข้อจำกัดการวางแผน"
              />
            )}
          </Box>
          {preview && (
            <Stack spacing={1}>
              {preview.ok && (
                <Alert severity="success">
                  ตรวจผ่านเบื้องต้น · ใช้วันลา {preview.chargedDays} วัน · หยุดต่อเนื่องสูงสุด{' '}
                  {preview.maxConsecutive} วัน
                </Alert>
              )}
              {preview.errors?.map((e, i) => (
                <Alert severity="error" key={i}>
                  {e.message}
                </Alert>
              ))}
              {preview.warnings?.map((w, i) => (
                <Alert severity="warning" key={i}>
                  {w.message}
                </Alert>
              ))}
              {preview.blocks?.length > 0 && (
                <Typography variant="caption" color="text.secondary">
                  ช่วงหยุดที่ตรวจ:{' '}
                  {preview.blocks
                    .map((b) => `${displayDate(b.start)} – ${displayDate(b.end)} (${b.days} วัน)`)
                    .join(' / ')}
                </Typography>
              )}
            </Stack>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2.5 }}>
        <Button onClick={onClose} disabled={busy}>
          ปิด
        </Button>
        <Button
          variant="outlined"
          startIcon={<FactCheckRoundedIcon />}
          onClick={check}
          disabled={busy || form.reason.trim().length < 3}
        >
          ตรวจเงื่อนไข
        </Button>
        <Button variant="contained" onClick={submit} disabled={busy || !preview?.ok}>
          {busy ? 'กำลังบันทึก…' : 'ส่งคำขอ'}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
export function LeaveDetails({ id, onClose, user, notify, onSaved }) {
  const [r, setR] = useState(null),
    [error, setError] = useState(''),
    [note, setNote] = useState(''),
    [allow, setAllow] = useState(false),
    [busy, setBusy] = useState(false),
    [imageUrl, setImageUrl] = useState(null);
  useEffect(() => {
    if (!id) return;
    const abort = new AbortController();
    setR(null);
    setError('');
    setNote('');
    setAllow(false);
    setImageUrl(null);
    api(`/leaves/${id}`, { signal: abort.signal })
      .then((v) => setR(v.request))
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      });
    return () => abort.abort();
  }, [id]);
  useEffect(
    () => () => {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
    },
    [imageUrl],
  );
  async function act(path, body) {
    setBusy(true);
    setError('');
    try {
      const v = await api(`/leaves/${id}/${path}`, { method: 'POST', body });
      notify(v.message);
      onSaved();
      onClose();
    } catch (e) {
      setError(
        e.message +
          (e.details?.errors ? ' · ' + e.details.errors.map((x) => x.message).join(' / ') : ''),
      );
    } finally {
      setBusy(false);
    }
  }
  async function showImage() {
    setBusy(true);
    try {
      const blob = await api(`/leaves/${id}/certificate`, { blob: true });
      setImageUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const canReview =
    r && user.role === 'SUPER_CS' && r.user_id !== user.id && r.status === 'pending';
  return (
    <Dialog open={Boolean(id)} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>คำขอลา #{id}</DialogTitle>
      <DialogContent>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        {!r && !error ? (
          <Loading />
        ) : (
          r && (
            <Stack spacing={2}>
              <Stack direction="row" justifyContent="space-between">
                <Box>
                  <Typography variant="h6">{r.name}</Typography>
                  <Typography color="text.secondary" variant="body2">
                    {LEAVE_LABEL[r.leave_type]}
                  </Typography>
                </Box>
                <Status value={r.status} />
              </Stack>
              <Box sx={{ p: 2, bgcolor: '#f4f6f8', borderRadius: 2 }}>
                <Typography fontWeight={700}>
                  {displayDate(r.start_date)} – {displayDate(r.end_date)}
                </Typography>
                <Typography variant="body2">
                  ใช้วันลา {r.charged_days} วัน · หยุดต่อเนื่อง{' '}
                  {r.validation_snapshot.maxConsecutive} วัน
                </Typography>
              </Box>
              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                เหตุผล: {r.reason}
              </Typography>
              {r.exception_requested === 1 && (
                <Alert severity="warning">ขออนุมัติพิเศษ: {r.exception_reason}</Alert>
              )}
              <Stack direction="row" spacing={1}>
                <Chip
                  size="small"
                  label={r.team_discussed ? 'คุยทีมแล้ว' : 'ยังไม่ระบุการคุยทีม'}
                />
                <Chip
                  size="small"
                  label={r.notified_klao ? 'แจ้งพี่เกล้าแล้ว' : 'ยังไม่ระบุการแจ้งพี่เกล้า'}
                />
              </Stack>
              {r.has_certificate && (
                <>
                  <Button variant="outlined" onClick={showImage} disabled={busy}>
                    เปิดใบรับรองแพทย์
                  </Button>
                  {imageUrl && (
                    <Box
                      component="img"
                      src={imageUrl}
                      alt="ใบรับรองแพทย์ของคำขอ"
                      sx={{ maxWidth: '100%', borderRadius: 2 }}
                    />
                  )}
                </>
              )}
              {r.review_note && (
                <Alert severity="info">
                  {r.reviewer_name}: {r.review_note}
                </Alert>
              )}
              {canReview && (
                <>
                  <Divider />
                  <Typography variant="h6">พิจารณาคำขอ</Typography>
                  <TextField
                    label="หมายเหตุผู้อนุมัติ"
                    multiline
                    minRows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  {r.validation_snapshot.requiresException && (
                    <FormControlLabel
                      control={
                        <Checkbox checked={allow} onChange={(e) => setAllow(e.target.checked)} />
                      }
                      label="ยืนยันอนุมัติข้อยกเว้น (หมายเหตุอย่างน้อย 10 ตัวอักษร)"
                    />
                  )}
                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="outlined"
                      color="error"
                      disabled={busy || note.trim().length < 3}
                      onClick={() =>
                        act('review', { decision: 'rejected', note, allow_exception: false })
                      }
                    >
                      ไม่อนุมัติ
                    </Button>
                    <Button
                      variant="contained"
                      disabled={
                        busy ||
                        (r.validation_snapshot.requiresException &&
                          (!allow || note.trim().length < 10))
                      }
                      onClick={() =>
                        act('review', { decision: 'approved', note, allow_exception: allow })
                      }
                    >
                      อนุมัติคำขอ
                    </Button>
                  </Stack>
                </>
              )}
              {['pending', 'approved'].includes(r.status) &&
                (r.user_id === user.id || user.role === 'SUPER_CS') && (
                  <>
                    <Divider />
                    <Button
                      color="error"
                      variant="text"
                      disabled={busy}
                      onClick={() => act('cancel', {})}
                    >
                      ยกเลิกคำขอนี้และคืนโควตา
                    </Button>
                  </>
                )}
            </Stack>
          )
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          ปิด
        </Button>
      </DialogActions>
    </Dialog>
  );
}
