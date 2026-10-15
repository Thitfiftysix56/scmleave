import React, { useState } from 'react';
import {
  Box,
  Stack,
  Typography,
  Card,
  CardContent,
  TextField,
  Button,
  Alert,
  Tabs,
  Tab,
  Chip,
  Link,
  Divider,
} from '@mui/material';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import { api, setToken, ROLE_LABEL } from './api';
import { OffPicker, SelectField } from './ui';
export function Auth({ onLogin }) {
  const [tab, setTab] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('');
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    role: 'CS',
    weekly_off: [0, 6],
  });
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  async function submit(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      if (tab === 0) {
        const r = await api('/auth/login', {
          method: 'POST',
          body: { email: form.email, password: form.password },
        });
        setToken(r.token);
        onLogin(r.user);
      } else {
        const r = await api('/auth/register', { method: 'POST', body: form });
        setMessage(r.message);
        setTab(0);
        set('password', '');
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Box
      sx={{
        minHeight: '100dvh',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', lg: '1.05fr 1fr' },
        bgcolor: 'background.paper',
      }}
    >
      <Box
        sx={{
          display: { xs: 'none', lg: 'flex' },
          p: 7,
          m: 2,
          borderRadius: 5,
          background: 'radial-gradient(ellipse at 10% 5%,#d5f5e8 0%,#edf7f2 40%,#e8edf6 100%)',
          flexDirection: 'column',
          justifyContent: 'space-between',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Stack direction="row" spacing={1.2} alignItems="center">
          <Box className="brand-mark">
            <CalendarMonthRoundedIcon />
          </Box>
          <Typography fontWeight={850} variant="h6">
            SCM<span style={{ color: '#00a76f' }}> Leave</span>
          </Typography>
        </Stack>
        <Box sx={{ position: 'relative', zIndex: 1 }}>
          <Chip
            label="TEAM LEAVE MANAGEMENT"
            sx={{ bgcolor: '#fff', fontSize: 10, letterSpacing: 1, mb: 3 }}
          />
          <Typography variant="h3" sx={{ fontSize: 45, lineHeight: 1.45 }}>
            เห็นวันหยุดของทีม
            <br />
            วางแผนงานได้ลงตัว
          </Typography>
          <Typography color="text.secondary" mt={2} maxWidth={380}>
            ปฏิทินเดียวสำหรับ Customer Service และ Store ส่งคำขอลา ตรวจโควตา และอนุมัติอย่างเป็นระบบ
          </Typography>
          <Card sx={{ mt: 5, maxWidth: 420, transform: 'rotate(-3deg)', p: 3 }}>
            <Stack direction="row" justifyContent="space-between" mb={2}>
              <Typography fontWeight={750}>Team availability</Typography>
              <Chip size="small" color="success" label="SCM" />
            </Stack>
            <Box className="auth-calendar">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <span className="weekday" key={i}>
                  {d}
                </span>
              ))}
              {Array.from({ length: 21 }, (_, i) => (
                <span
                  key={i}
                  className={
                    [4, 11, 18].includes(i)
                      ? 'green-cell'
                      : [5, 6, 12, 13].includes(i)
                        ? 'amber-cell'
                        : ''
                  }
                >
                  {i + 1}
                </span>
              ))}
            </Box>
            <Stack direction="row" spacing={1} mt={2} alignItems="center">
              <CheckCircleRoundedIcon color="primary" fontSize="small" />
              <Typography variant="body2">จัดการวันลาให้ทีมเดินหน้าต่อได้</Typography>
            </Stack>
          </Card>
        </Box>
        <Typography variant="caption" color="text.secondary">
          SCM WORKSPACE · Calendar / People / Approvals
        </Typography>
      </Box>
      <Box display="flex" alignItems="center" justifyContent="center" px={{ xs: 3, md: 7 }} py={6}>
        <Box width="100%" maxWidth={440}>
          <Typography variant="h4">
            {tab === 0 ? 'ยินดีต้อนรับกลับมา' : 'เข้าร่วมทีม SCM'}
          </Typography>
          <Typography variant="body2" color="text.secondary" mt={1}>
            {tab === 0
              ? 'เข้าสู่ระบบเพื่อดูปฏิทินและจัดการวันลา'
              : 'กรอกข้อมูล แล้วรอผู้ดูแลเปิดใช้งานบัญชี'}
          </Typography>
          <Tabs
            value={tab}
            onChange={(_, v) => {
              setTab(v);
              setError('');
              setMessage('');
            }}
            sx={{ mt: 3, mb: 3 }}
          >
            <Tab label="เข้าสู่ระบบ" />
            <Tab label="สมัครสมาชิก" />
          </Tabs>
          <Stack component="form" spacing={2.5} onSubmit={submit}>
            {message && <Alert severity="success">{message}</Alert>}
            {error && <Alert severity="error">{error}</Alert>}
            {tab === 1 && (
              <TextField
                label="ชื่อที่แสดง"
                autoComplete="name"
                value={form.name}
                onChange={(e) => set('name', e.target.value)}
                required
                inputProps={{ minLength: 2, maxLength: 120 }}
              />
            )}
            <TextField
              label="อีเมล"
              type="email"
              autoComplete="username"
              value={form.email}
              onChange={(e) => set('email', e.target.value.trim())}
              required
            />
            <TextField
              label="รหัสผ่าน"
              type="password"
              autoComplete={tab ? 'new-password' : 'current-password'}
              helperText={tab ? 'อย่างน้อย 12 ตัวอักษร' : undefined}
              value={form.password}
              onChange={(e) => set('password', e.target.value)}
              required
              inputProps={{ minLength: tab ? 12 : 1, maxLength: 128 }}
            />
            {tab === 1 && (
              <>
                <SelectField
                  label="ตำแหน่ง"
                  value={form.role}
                  onChange={(v) => set('role', v)}
                  options={{ CS: ROLE_LABEL.CS, STORE: ROLE_LABEL.STORE }}
                />
                <OffPicker value={form.weekly_off} onChange={(v) => set('weekly_off', v)} />
              </>
            )}
            <Button
              fullWidth
              size="large"
              variant="contained"
              type="submit"
              disabled={
                busy ||
                (tab === 1 && (form.weekly_off.length === 0 || form.weekly_off.length === 7))
              }
            >
              {busy ? 'กำลังดำเนินการ…' : tab === 0 ? 'เข้าสู่ระบบ' : 'สร้างบัญชี'}
            </Button>
            <Typography variant="caption" color="text.secondary" align="center">
              {tab === 0
                ? 'ลืมรหัสผ่าน? ติดต่อ Super Customer Service เพื่อรับรหัสชั่วคราว'
                : 'บัญชีใหม่ไม่มีสิทธิ์อนุมัติหรือเปลี่ยนตำแหน่งตนเอง'}
            </Typography>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
