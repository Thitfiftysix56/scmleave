import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import {
  Box,
  Drawer,
  Stack,
  Typography,
  Avatar,
  Button,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  AppBar,
  Toolbar,
  IconButton,
  Chip,
  Snackbar,
  Alert,
  Divider,
} from '@mui/material';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import EventNoteRoundedIcon from '@mui/icons-material/EventNoteRounded';
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded';
import WorkHistoryRoundedIcon from '@mui/icons-material/WorkHistoryRounded';
import SettingsRoundedIcon from '@mui/icons-material/SettingsRounded';
import BeachAccessRoundedIcon from '@mui/icons-material/BeachAccessRounded';
import AccountCircleRoundedIcon from '@mui/icons-material/AccountCircleRounded';
import LogoutRoundedIcon from '@mui/icons-material/LogoutRounded';
import MenuRoundedIcon from '@mui/icons-material/MenuRounded';
import { api, hasToken, setToken, ROLE_LABEL, today, isManager, isStaff } from './api';
import { Auth } from './auth';
import { Loading } from './ui';
import CalendarPage from './CalendarPage';
import RequestsPage from './RequestsPage';
import MembersPage from './MembersPage';
import HolidaysPage from './HolidaysPage';
import CoveragePage from './CoveragePage';
import SettingsPage from './SettingsPage';
import ProfilePage from './ProfilePage';
import { LeaveForm, LeaveDetails } from './LeaveDialogs';
const WIDTH = 252;
export default function App() {
  const [user, setUser] = useState(null),
    [loading, setLoading] = useState(hasToken()),
    [startupError, setStartupError] = useState(''),
    [mobile, setMobile] = useState(false),
    [version, setVersion] = useState(0),
    [toast, setToast] = useState(''),
    [creating, setCreating] = useState(false),
    [dates, setDates] = useState(undefined),
    [detail, setDetail] = useState(null);
  const navigate = useNavigate(),
    notify = useCallback((message) => setToast(message), []),
    refresh = useCallback(() => setVersion((v) => v + 1), []);
  async function restore() {
    setLoading(true);
    setStartupError('');
    try {
      const r = await api('/auth/me');
      setUser(r.user);
    } catch (e) {
      if (e.status !== 401) setStartupError(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (hasToken()) restore();
    const expired = () => {
      setUser(null);
      setLoading(false);
      setStartupError('');
      notify('เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
    };
    window.addEventListener('scm-session-expired', expired);
    return () => window.removeEventListener('scm-session-expired', expired);
  }, []);
  useEffect(() => {
    if (!user) return;
    const tick = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const timer = setInterval(tick, 60000);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      window.removeEventListener('focus', tick);
    };
  }, [user?.id, refresh]);
  async function logout(call = true) {
    const revoke = call
      ? api('/auth/logout', { method: 'POST', body: {} }).catch(() => {})
      : Promise.resolve();
    setToken(null);
    setUser(null);
    setDetail(null);
    setCreating(false);
    navigate('/');
    await revoke;
  }
  function create(value) {
    if (!isStaff(user?.role)) return;
    setDates(value);
    setCreating(true);
  }
  function details(id, owner) {
    if (owner !== user.id && !isManager(user.role)) {
      notify('รายละเอียดคำขอดูได้เฉพาะเจ้าของ Admin และ Super Customer Service');
      return;
    }
    setDetail(id);
  }
  const snack = (
    <Snackbar
      open={Boolean(toast)}
      autoHideDuration={6000}
      onClose={() => setToast('')}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    >
      <Alert severity="info" onClose={() => setToast('')}>
        {toast}
      </Alert>
    </Snackbar>
  );
  if (loading) return <Loading />;
  if (startupError && !user)
    return (
      <Box p={5}>
        <Alert severity="error">{startupError}</Alert>
        <Stack direction="row" spacing={2} mt={2}>
          <Button onClick={restore}>ลองเชื่อมต่อใหม่</Button>
          <Button
            onClick={() => {
              setToken(null);
              setStartupError('');
            }}
          >
            ไปหน้าเข้าสู่ระบบ
          </Button>
        </Stack>
      </Box>
    );
  if (!user)
    return (
      <>
        <Auth
          onLogin={(u) => {
            setUser(u);
            navigate(u.must_change_password ? '/profile' : '/');
          }}
        />
        {snack}
      </>
    );
  const menus = [
    ['/', 'ปฏิทินของทีม', CalendarMonthRoundedIcon],
    ['/requests', isManager(user.role) ? 'คำขอ / อนุมัติ' : 'คำขอลาของฉัน', EventNoteRoundedIcon],
    ['/coverage', 'ทำงานแทน / OT', WorkHistoryRoundedIcon],
    ...(isManager(user.role)
      ? [
          ['/members', 'สมาชิกในทีม', PeopleAltRoundedIcon],
          ['/holidays', 'วันหยุดไทย', BeachAccessRoundedIcon],
          ['/settings', 'กติกา / ประวัติ', SettingsRoundedIcon],
        ]
      : []),
    ['/profile', 'บัญชีของฉัน', AccountCircleRoundedIcon],
  ];
  const sidebar = (
    <Stack sx={{ height: '100%', p: 2.5, bgcolor: 'white' }}>
      <Stack direction="row" spacing={1.2} alignItems="center" sx={{ p: 1, mb: 4, mt: 1 }}>
        <Box className="brand-mark">
          <CalendarMonthRoundedIcon />
        </Box>
        <Typography variant="h6" fontWeight={850}>
          SCM<span style={{ color: '#00a76f' }}> Leave</span>
        </Typography>
      </Stack>
      <Box sx={{ bgcolor: '#f4f6f8', p: 1.7, borderRadius: 2.5, mb: 3 }}>
        <Stack direction="row" spacing={1.4} alignItems="center">
          <Avatar sx={{ bgcolor: '#c8f4e0', color: '#007867', fontWeight: 750 }}>
            {user.name.slice(0, 1)}
          </Avatar>
          <Box overflow="hidden">
            <Typography fontWeight={750} variant="body2" noWrap>
              {user.name}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {ROLE_LABEL[user.role]}
            </Typography>
          </Box>
        </Stack>
      </Box>
      <Typography
        sx={{
          pl: 1.3,
          mb: 1,
          color: 'text.secondary',
          fontSize: 10,
          fontWeight: 750,
          letterSpacing: 1.2,
        }}
      >
        WORKSPACE
      </Typography>
      <List disablePadding>
        {menus.map(([path, label, Icon]) => (
          <ListItemButton
            disabled={user.must_change_password && path !== '/profile'}
            component={NavLink}
            to={path}
            end={path === '/'}
            key={path}
            onClick={() => setMobile(false)}
            sx={{
              borderRadius: 2,
              mb: 0.6,
              py: 1.1,
              color: 'text.secondary',
              '&.active': { color: 'primary.dark', bgcolor: '#00a76f14' },
              '&.active .MuiListItemIcon-root': { color: 'primary.main' },
            }}
          >
            <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}>
              <Icon sx={{ fontSize: 22 }} />
            </ListItemIcon>
            <ListItemText
              primary={label}
              primaryTypographyProps={{ fontSize: 13, fontWeight: 650 }}
            />
          </ListItemButton>
        ))}
      </List>
      <Box sx={{ mt: 'auto', pt: 4 }}>
        <Box sx={{ p: 2, bgcolor: '#e8f8f1', borderRadius: 2.5, mb: 2 }}>
          <Typography variant="body2" fontWeight={750}>
            {user.role === 'ADMIN' ? 'บัญชีผู้ดูแลระบบ' : 'วางแผนก่อนหยุด'}
          </Typography>
          <Typography variant="caption" color="text.secondary">
            {user.role === 'ADMIN'
              ? 'ไม่ต้องกำหนดวันหยุดหรือส่งคำขอลาส่วนตัว'
              : 'ศุกร์–อาทิตย์ลาเพิ่มได้ 1 คน รวม Store'}
          </Typography>
        </Box>
        <Button
          fullWidth
          color="inherit"
          startIcon={<LogoutRoundedIcon />}
          onClick={() => logout()}
        >
          ออกจากระบบ
        </Button>
      </Box>
    </Stack>
  );
  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <Box
        component="nav"
        className="no-print"
        sx={{ width: { lg: WIDTH }, flexShrink: { lg: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobile}
          onClose={() => setMobile(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ display: { xs: 'block', lg: 'none' }, '& .MuiDrawer-paper': { width: WIDTH } }}
        >
          {sidebar}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', lg: 'block' },
            '& .MuiDrawer-paper': {
              width: WIDTH,
              boxSizing: 'border-box',
              borderRight: '1px dashed #dfe4e8',
            },
          }}
          open
        >
          {sidebar}
        </Drawer>
      </Box>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <AppBar
          className="no-print"
          elevation={0}
          position="sticky"
          sx={{
            background: 'rgba(248,250,251,.9)',
            backdropFilter: 'blur(14px)',
            color: 'text.primary',
            borderBottom: '1px solid #edf0f2',
          }}
        >
          <Toolbar sx={{ minHeight: 76, px: { xs: 2, md: 4 } }}>
            <IconButton
              sx={{ display: { lg: 'none' }, mr: 1 }}
              onClick={() => setMobile(true)}
              aria-label="เปิดเมนู"
            >
              <MenuRoundedIcon />
            </IconButton>
            <Typography variant="body2" color="text.secondary" sx={{ flexGrow: 1 }}>
              SCM Workspace{' '}
              <Box component="span" sx={{ mx: 1, color: '#c4cdd5' }}>
                {' '}
                /{' '}
              </Box>{' '}
              Team calendar
            </Typography>
            <Chip
              size="small"
              label={`พ.ศ. ${Number(today().slice(0, 4)) + 543}`}
              variant="outlined"
              sx={{ mr: 2, display: { xs: 'none', sm: 'flex' } }}
            />
            <Avatar
              sx={{
                width: 34,
                height: 34,
                bgcolor: '#00a76f1a',
                color: 'primary.dark',
                fontSize: 14,
              }}
            >
              {user.name.slice(0, 1)}
            </Avatar>
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ p: { xs: 2, md: 4 }, maxWidth: 1740, mx: 'auto' }}>
          {user.must_change_password ? (
            <ProfilePage user={user} onLogout={logout} notify={notify} />
          ) : (
            <Routes>
              <Route
                path="/"
                element={
                  <CalendarPage
                    version={version}
                    canRequestLeave={isStaff(user.role)}
                    onCreate={create}
                    onDetails={details}
                    notify={notify}
                  />
                }
              />
              <Route
                path="/requests"
                element={
                  <RequestsPage
                    user={user}
                    version={version}
                    onCreate={create}
                    onDetails={details}
                  />
                }
              />
              <Route
                path="/coverage"
                element={
                  <CoveragePage user={user} version={version} onSaved={refresh} notify={notify} />
                }
              />
              {isManager(user.role) && (
                <>
                  <Route
                    path="/members"
                    element={<MembersPage version={version} onSaved={refresh} notify={notify} />}
                  />
                  <Route
                    path="/holidays"
                    element={<HolidaysPage version={version} onSaved={refresh} notify={notify} />}
                  />
                  <Route
                    path="/settings"
                    element={<SettingsPage version={version} onSaved={refresh} notify={notify} />}
                  />
                </>
              )}
              <Route
                path="/profile"
                element={<ProfilePage user={user} onLogout={logout} notify={notify} />}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          )}
        </Box>
      </Box>
      {isStaff(user.role) && (
        <LeaveForm
          open={creating}
          dates={dates}
          onClose={() => setCreating(false)}
          onSaved={refresh}
          notify={notify}
        />
      )}
      <LeaveDetails
        id={detail}
        onClose={() => setDetail(null)}
        user={user}
        notify={notify}
        onSaved={refresh}
      />
      {snack}
    </Box>
  );
}
