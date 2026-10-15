import React, { useState, useEffect } from 'react';
import {
  Card,
  Stack,
  Typography,
  TextField,
  Button,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Box,
  Chip,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { api, today, displayDate } from './api';
import { PageHeading, DataTable, Status, Loading, ConfirmDialog } from './ui';
export default function CoveragePage({ user, version, onSaved, notify }) {
  const [rows, setRows] = useState(null),
    [members, setMembers] = useState([]),
    [error, setError] = useState(''),
    [open, setOpen] = useState(false),
    [form, setForm] = useState({
      covers_user_id: '',
      day: today(),
      hours: 8,
      requested_ot: false,
      reason: '',
    }),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState(null),
    [note, setNote] = useState(''),
    [confirm, setConfirm] = useState(null);
  useEffect(() => {
    let active = true;
    Promise.all([api('/coverage'), api('/people')])
      .then(([r, p]) => {
        if (active) {
          setRows(r.requests);
          setMembers(p.members);
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [version]);
  async function save() {
    setBusy(true);
    setError('');
    try {
      const r = await api('/coverage', {
        method: 'POST',
        body: { ...form, covers_user_id: Number(form.covers_user_id), hours: Number(form.hours) },
      });
      notify(r.message);
      onSaved();
      setOpen(false);
      setForm({ covers_user_id: '', day: today(), hours: 8, requested_ot: false, reason: '' });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function review(decision) {
    setBusy(true);
    setError('');
    try {
      const r = await api(`/coverage/${selected.id}/review`, {
        method: 'POST',
        body: { decision, note },
      });
      notify(r.message);
      onSaved();
      setSelected(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function action(r, type) {
    setConfirm({
      title: type === 'store-authorize' ? 'Store อนุญาต OT' : 'ยกเลิกการทำงานแทน',
      text: `${r.name} · ${displayDate(r.day)} · ${r.hours} ชั่วโมง`,
      action: async () => {
        const result = await api(`/coverage/${r.id}/${type}`, { method: 'POST', body: {} });
        notify(result.message);
        onSaved();
      },
    });
  }
  return (
    <>
      <PageHeading
        title="ทำงานแทน / OT"
        subtitle="บันทึกการมาทำแทน โดยไม่สร้าง OT หรือวันลาชดเชยอัตโนมัติ"
        action={
          <Button
            variant="contained"
            startIcon={<AddRoundedIcon />}
            onClick={() => {
              setOpen(true);
              setError('');
            }}
          >
            ขอมาทำงานแทน
          </Button>
        }
      />
      <Alert severity="info" sx={{ mb: 3 }}>
        กรณีขอ OT ต้องได้รับอนุญาตจาก Store แล้วให้ Super อนุมัติรายการอีกครั้ง
        ระบบบันทึกชั่วโมงที่ได้รับอนุญาต ไม่มีการคำนวณเงินเดือนหรือสร้างวันลาชดเชย
      </Alert>
      {error && !open && !selected && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Card>
        {!rows && !error ? (
          <Loading />
        ) : (
          <DataTable
            rows={rows || []}
            columns={[
              {
                key: 'name',
                label: 'ผู้มาทำงาน',
                render: (r) => (
                  <>
                    <Typography fontWeight={700} variant="body2">
                      {r.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      แทน {r.covers_name}
                    </Typography>
                  </>
                ),
              },
              { key: 'day', label: 'วันที่', render: (r) => displayDate(r.day) },
              { key: 'hours', label: 'ชั่วโมง' },
              {
                key: 'ot',
                label: 'การชดเชย',
                render: (r) => (
                  <>
                    <Chip size="small" label={r.requested_ot ? 'ขอ OT' : 'ไม่มี'} />
                    {r.requested_ot && (
                      <Typography variant="caption" display="block" color="text.secondary">
                        {r.store_name ? `Store: ${r.store_name}` : 'รอ Store อนุญาต'}
                      </Typography>
                    )}
                  </>
                ),
              },
              { key: 'status', label: 'สถานะ', render: (r) => <Status value={r.status} /> },
              {
                key: 'action',
                label: 'จัดการ',
                render: (r) => (
                  <Stack direction="row" gap={0.5} flexWrap="wrap">
                    {user.role === 'STORE' &&
                      r.requested_ot &&
                      r.status === 'pending' &&
                      r.user_id !== user.id &&
                      !r.store_authorized_by && (
                        <Button size="small" onClick={() => action(r, 'store-authorize')}>
                          อนุญาต OT
                        </Button>
                      )}
                    {user.role === 'SUPER_CS' &&
                      r.status === 'pending' &&
                      r.user_id !== user.id && (
                        <Button
                          size="small"
                          onClick={() => {
                            setSelected(r);
                            setNote('');
                            setError('');
                          }}
                        >
                          พิจารณา
                        </Button>
                      )}
                    {(user.id === r.user_id || user.role === 'SUPER_CS') &&
                      ['pending', 'approved'].includes(r.status) && (
                        <Button size="small" color="error" onClick={() => action(r, 'cancel')}>
                          ยกเลิก
                        </Button>
                      )}
                  </Stack>
                ),
              },
            ]}
          />
        )}
      </Card>
      <Dialog open={open} onClose={busy ? undefined : () => setOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>ขอมาทำงานแทน</DialogTitle>
        <DialogContent>
          <Stack spacing={2.5} mt={1}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField
              select
              label="มาทำงานแทนใคร"
              value={form.covers_user_id}
              onChange={(e) => setForm({ ...form, covers_user_id: e.target.value })}
            >
              {members
                .filter((m) => m.id !== user.id)
                .map((m) => (
                  <MenuItem value={m.id} key={m.id}>
                    {m.name}
                  </MenuItem>
                ))}
            </TextField>
            <Stack direction="row" spacing={2}>
              <TextField
                fullWidth
                type="date"
                label="วันที่"
                InputLabelProps={{ shrink: true }}
                value={form.day}
                onChange={(e) => setForm({ ...form, day: e.target.value })}
              />
              <TextField
                fullWidth
                type="number"
                label="ชั่วโมง"
                inputProps={{ min: 0.5, max: 16, step: 0.5 }}
                value={form.hours}
                onChange={(e) => setForm({ ...form, hours: e.target.value })}
              />
            </Stack>
            <TextField
              label="เหตุผล"
              multiline
              minRows={2}
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={form.requested_ot}
                  onChange={(e) => setForm({ ...form, requested_ot: e.target.checked })}
                />
              }
              label="ขอ OT (ต้องให้ Store อนุญาตก่อน)"
            />
            <Typography variant="caption" color="text.secondary">
              การมาทำงานแทนไม่เปลี่ยนโควตาการลา และไม่เกิดวันลาชดเชย
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setOpen(false)}>
            ปิด
          </Button>
          <Button
            variant="contained"
            disabled={busy || !form.covers_user_id || form.reason.trim().length < 3}
            onClick={save}
          >
            ส่งคำขอ
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(selected)}
        onClose={busy ? undefined : () => setSelected(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>พิจารณาการทำงานแทน</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <Typography>
              {selected?.name} · {displayDate(selected?.day)} · {selected?.hours} ชั่วโมง
            </Typography>
            <Typography variant="body2">{selected?.reason}</Typography>
            <TextField
              label="หมายเหตุอย่างน้อย 3 ตัวอักษร"
              multiline
              minRows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setSelected(null)}>
            ปิด
          </Button>
          <Button
            color="error"
            disabled={busy || note.trim().length < 3}
            onClick={() => review('rejected')}
          >
            ไม่อนุมัติ
          </Button>
          <Button
            variant="contained"
            disabled={busy || note.trim().length < 3}
            onClick={() => review('approved')}
          >
            อนุมัติ
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
