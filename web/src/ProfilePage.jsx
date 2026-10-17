import React, { useState, useEffect } from 'react';
import { Card, Stack, Typography, TextField, Button, Alert, Box, Chip } from '@mui/material';
import { api, ROLE_LABEL, DAY_LABEL, today } from './api';
import { PageHeading } from './ui';
export default function ProfilePage({ user, onLogout, notify }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', repeat: '' }),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [schedules, setSchedules] = useState([]);
  useEffect(() => {
    if (!user.must_change_password)
      api('/meta')
        .then((r) => setSchedules(r.schedules))
        .catch(() => {});
  }, [user.must_change_password]);
  async function save(e) {
    e.preventDefault();
    if (form.newPassword !== form.repeat) {
      setError('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const r = await api('/auth/password', {
        method: 'POST',
        body: { currentPassword: form.currentPassword, newPassword: form.newPassword },
      });
      notify(r.message);
      onLogout(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const off = schedules.filter((s) => s.valid_from <= today()).at(-1)?.weekly_off || [];
  return (
    <>
      <PageHeading
        title={user.must_change_password ? 'เปลี่ยนรหัสผ่านเริ่มต้น' : 'บัญชีของฉัน'}
        subtitle="ข้อมูลบัญชีและความปลอดภัย"
      />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1fr 1.4fr' }, gap: 3 }}>
        <Card sx={{ p: 3, alignSelf: 'start' }}>
          <Typography variant="h5">{user.name}</Typography>
          <Typography color="text.secondary" variant="body2" mt={1}>
            {user.email}
          </Typography>
          <Chip sx={{ mt: 2 }} label={ROLE_LABEL[user.role]} color="success" />
          <Typography variant="body2" mt={3}>
            {user.role === 'ADMIN'
              ? 'บัญชีผู้ดูแลระบบ ไม่ต้องกำหนดวันหยุดปกติหรือสิทธิ์วันลา'
              : `วันหยุดปกติ: ${off.length ? off.map((n) => DAY_LABEL[n]).join(', ') : 'ตรวจสอบกับผู้ดูแล'}`}
          </Typography>
        </Card>
        <Card component="form" onSubmit={save} sx={{ p: 3 }}>
          <Stack spacing={2.5}>
            {user.must_change_password && (
              <Alert severity="warning">กรุณาตั้งรหัสผ่านส่วนตัวก่อนใช้งานระบบ</Alert>
            )}
            {error && <Alert severity="error">{error}</Alert>}
            <Typography variant="h6">เปลี่ยนรหัสผ่าน</Typography>
            <TextField
              required
              label="รหัสผ่านปัจจุบัน / ชั่วคราว"
              type="password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
            />
            <TextField
              required
              label="รหัสผ่านใหม่"
              type="password"
              autoComplete="new-password"
              inputProps={{ minLength: 12, maxLength: 128 }}
              helperText="อย่างน้อย 12 ตัวอักษร"
              value={form.newPassword}
              onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
            />
            <TextField
              required
              label="ยืนยันรหัสผ่านใหม่"
              type="password"
              autoComplete="new-password"
              value={form.repeat}
              onChange={(e) => setForm({ ...form, repeat: e.target.value })}
            />
            <Button variant="contained" type="submit" disabled={busy}>
              บันทึกและเข้าสู่ระบบใหม่
            </Button>
          </Stack>
        </Card>
      </Box>
    </>
  );
}
