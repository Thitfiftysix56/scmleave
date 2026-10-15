import React, { useEffect, useState } from 'react';
import {
  Box,
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
  Divider,
  MenuItem,
  Chip,
  IconButton,
  Tooltip,
} from '@mui/material';
import EditRoundedIcon from '@mui/icons-material/EditRounded';
import KeyRoundedIcon from '@mui/icons-material/KeyRounded';
import { api, ROLE_LABEL, LEAVE_LABEL, DAY_LABEL, today, displayDate } from './api';
import {
  PageHeading,
  DataTable,
  Status,
  Loading,
  OffPicker,
  SelectField,
  ConfirmDialog,
} from './ui';
const currentSchedule = (m) =>
  (m.schedules.filter((s) => s.valid_from <= today()).at(-1) || m.schedules[0])?.weekly_off || [
    0, 6,
  ];
export default function MembersPage({ version, onSaved, notify }) {
  const [members, setMembers] = useState(null),
    [error, setError] = useState(''),
    [search, setSearch] = useState(''),
    [selected, setSelected] = useState(null),
    [form, setForm] = useState(null),
    [busy, setBusy] = useState(false),
    [dialogError, setDialogError] = useState(''),
    [confirm, setConfirm] = useState(null),
    [temporary, setTemporary] = useState(null),
    [year, setYear] = useState(Number(today().slice(0, 4))),
    [quotas, setQuotas] = useState({ annual: '', personal: '', sick: '' });
  useEffect(() => {
    let active = true;
    api('/admin/members')
      .then((r) => {
        if (active) {
          setMembers(r.members);
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
  useEffect(() => {
    if (selected) {
      setQuotas(
        Object.fromEntries(
          ['annual', 'personal', 'sick'].map((t) => [
            t,
            selected.entitlements.find((e) => e.year === Number(year) && e.leave_type === t)
              ?.quota ?? '',
          ]),
        ),
      );
    }
  }, [selected, year]);
  function edit(m) {
    setSelected(m);
    setForm({
      name: m.name,
      role: m.role,
      status: m.status,
      weekly_off: currentSchedule(m),
      valid_from: today(),
    });
    setDialogError('');
  }
  async function save() {
    setBusy(true);
    setDialogError('');
    try {
      const r = await api(`/admin/members/${selected.id}`, { method: 'PATCH', body: form });
      notify(r.message);
      onSaved();
      setSelected(null);
    } catch (e) {
      setDialogError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function saveQuotas() {
    setBusy(true);
    setDialogError('');
    try {
      const r = await api(`/admin/members/${selected.id}/entitlements/${year}`, {
        method: 'PUT',
        body: Object.entries(quotas).map(([leave_type, q]) => ({
          leave_type,
          quota: q === '' ? null : Number(q),
        })),
      });
      notify(r.message);
      onSaved();
      setSelected(null);
    } catch (e) {
      setDialogError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function reset(m) {
    setConfirm({
      title: 'รีเซ็ตรหัสผ่านสมาชิก',
      text: `ออกจากระบบทุกอุปกรณ์ของ ${m.name} และสร้างรหัสชั่วคราวใหม่`,
      action: async () => {
        const r = await api(`/admin/members/${m.id}/reset-password`, { method: 'POST', body: {} });
        setTemporary({ name: m.name, password: r.temporaryPassword });
        onSaved();
      },
    });
  }
  return (
    <>
      <PageHeading
        title="สมาชิกในทีม"
        subtitle="เปิดใช้งานบัญชี จัดตำแหน่ง และกำหนดวันหยุดประจำตัว"
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Card>
        <Box p={3}>
          <TextField
            fullWidth
            size="small"
            label="ค้นหาชื่อหรืออีเมล"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </Box>
        {!members && !error ? (
          <Loading />
        ) : (
          <DataTable
            rows={(members || []).filter((m) =>
              `${m.name} ${m.email}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
            )}
            columns={[
              {
                key: 'name',
                label: 'สมาชิก',
                render: (m) => (
                  <>
                    <Typography variant="body2" fontWeight={750}>
                      {m.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {m.email}
                    </Typography>
                  </>
                ),
              },
              {
                key: 'role',
                label: 'ตำแหน่ง',
                render: (m) => <Chip size="small" label={ROLE_LABEL[m.role]} variant="outlined" />,
              },
              { key: 'status', label: 'สถานะ', render: (m) => <Status value={m.status} /> },
              {
                key: 'off',
                label: 'หยุดปกติ',
                render: (m) => (
                  <Typography variant="body2">
                    {currentSchedule(m)
                      .map((n) => DAY_LABEL[n])
                      .join(', ')}
                  </Typography>
                ),
              },
              {
                key: 'action',
                label: 'จัดการ',
                render: (m) => (
                  <Stack direction="row">
                    <Tooltip title="แก้ไขสมาชิก">
                      <IconButton onClick={() => edit(m)} aria-label="แก้ไขสมาชิก">
                        <EditRoundedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title="รีเซ็ตรหัสผ่าน">
                      <IconButton onClick={() => reset(m)} aria-label="รีเซ็ตรหัสผ่าน">
                        <KeyRoundedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Stack>
                ),
              },
            ]}
          />
        )}
      </Card>
      <Dialog
        open={Boolean(selected)}
        onClose={busy ? undefined : () => setSelected(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>จัดการสมาชิก · {selected?.name}</DialogTitle>
        <DialogContent>
          {form && (
            <Stack mt={1} spacing={2.5}>
              {dialogError && <Alert severity="error">{dialogError}</Alert>}
              <TextField
                label="ชื่อแสดง"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <SelectField
                  label="ตำแหน่ง"
                  value={form.role}
                  onChange={(v) => setForm({ ...form, role: v })}
                  options={ROLE_LABEL}
                />
                <SelectField
                  label="สถานะบัญชี"
                  value={form.status}
                  onChange={(v) => setForm({ ...form, status: v })}
                  options={{ pending: 'รอเปิดใช้งาน', active: 'ใช้งาน', inactive: 'ระงับ' }}
                />
              </Stack>
              <OffPicker
                value={form.weekly_off}
                onChange={(v) => setForm({ ...form, weekly_off: v })}
              />
              <TextField
                label="วันเริ่มใช้ตารางนี้"
                type="date"
                InputLabelProps={{ shrink: true }}
                value={form.valid_from}
                onChange={(e) => setForm({ ...form, valid_from: e.target.value })}
                helperText="เก็บตารางเดิมไว้คำนวณประวัติ หากมีคำขออนาคตต้องยกเลิก/ส่งใหม่ก่อนเปลี่ยน"
              />
              <Button variant="contained" disabled={busy} onClick={save}>
                บันทึกข้อมูลสมาชิก
              </Button>
              <Divider />
              <Typography variant="h6">สิทธิ์วันลารายปี</Typography>
              <TextField
                label="ปี ค.ศ."
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                helperText={`พ.ศ. ${Number(year) + 543}`}
                inputProps={{ min: 2020, max: 2100 }}
              />
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                {Object.entries(LEAVE_LABEL).map(([t, l]) => (
                  <TextField
                    key={t}
                    fullWidth
                    label={l + ' (วัน)'}
                    type="number"
                    value={quotas[t]}
                    onChange={(e) => setQuotas({ ...quotas, [t]: e.target.value })}
                    inputProps={{ min: 0, max: 366 }}
                  />
                ))}
              </Stack>
              <Typography variant="caption" color="text.secondary">
                ช่องว่าง = ยังไม่กำหนดเพดานรายปี · 0 = ไม่มีสิทธิ์ · ไม่มีวันลาชดเชยอัตโนมัติ
              </Typography>
              <Button
                variant="outlined"
                disabled={busy || Number(year) < 2020 || Number(year) > 2100}
                onClick={saveQuotas}
              >
                บันทึกสิทธิ์วันลาแยกต่างหาก
              </Button>
              <Typography variant="body2" color="text.secondary">
                ประวัติตาราง:{' '}
                {selected?.schedules
                  .map(
                    (s) =>
                      `${displayDate(s.valid_from)}: ${s.weekly_off.map((d) => DAY_LABEL[d]).join(', ')}`,
                  )
                  .join(' / ')}
              </Typography>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelected(null)} disabled={busy}>
            ปิด
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
      <Dialog open={Boolean(temporary)} onClose={() => setTemporary(null)} fullWidth maxWidth="xs">
        <DialogTitle>รหัสชั่วคราว · {temporary?.name}</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            แสดงครั้งเดียว กรุณาจดและส่งให้เจ้าของบัญชีเป็นการส่วนตัว
          </Alert>
          <TextField fullWidth value={temporary?.password || ''} inputProps={{ readOnly: true }} />
          <Typography variant="caption" color="text.secondary">
            ระบบบังคับเปลี่ยนรหัสเมื่อเข้าสู่ระบบ
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setTemporary(null)}>ปิด</Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
