import React, { useState, useEffect, useRef, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import multiMonthPlugin from '@fullcalendar/multimonth';
import thLocale from '@fullcalendar/core/locales/th';
import {
  Box,
  Card,
  CardContent,
  Stack,
  Typography,
  Button,
  Chip,
  Alert,
  FormControlLabel,
  Switch,
  TextField,
  InputAdornment,
  MenuItem,
  LinearProgress,
  IconButton,
  Tooltip,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import SearchRoundedIcon from '@mui/icons-material/SearchRounded';
import RefreshRoundedIcon from '@mui/icons-material/RefreshRounded';
import PrintRoundedIcon from '@mui/icons-material/PrintRounded';
import CalendarMonthRoundedIcon from '@mui/icons-material/CalendarMonthRounded';
import PeopleAltRoundedIcon from '@mui/icons-material/PeopleAltRounded';
import EventAvailableRoundedIcon from '@mui/icons-material/EventAvailableRounded';
import { api, today } from './api';
import { PageHeading } from './ui';
function previousDay(s) {
  const d = new Date(s.slice(0, 10) + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
export default function CalendarPage({
  version,
  onCreate,
  onDetails,
  notify,
  canRequestLeave = true,
}) {
  const ref = useRef(null),
    [range, setRange] = useState(null),
    [data, setData] = useState({ events: [], members: [], holidayYears: [] }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [view, setView] = useState('dayGridMonth'),
    [search, setSearch] = useState(''),
    [offs, setOffs] = useState(true),
    [pending, setPending] = useState(true),
    [member, setMember] = useState('all'),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!range) return;
    const controller = new AbortController();
    setBusy(true);
    setError('');
    api(`/calendar?start=${range.start}&end=${range.end}`, { signal: controller.signal })
      .then(setData)
      .catch((e) => {
        if (e.name !== 'AbortError') setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [range, version, refresh]);
  const filtered = useMemo(
    () =>
      data.events.filter((e) => {
        const p = e.extendedProps;
        if (p.kind === 'holiday') return true;
        if (p.kind === 'regular' && !offs) return false;
        if (p.status === 'pending' && !pending) return false;
        if (member !== 'all' && String(p.user_id) !== String(member)) return false;
        return e.title.toLocaleLowerCase().includes(search.toLocaleLowerCase());
      }),
    [data, offs, pending, member, search],
  );
  const visibleYears = range
    ? [Number(range.start.slice(0, 4)), Number(previousDay(range.end).slice(0, 4))]
    : [Number(today().slice(0, 4))];
  const unconfirmed = data.holidayYears.filter(
    (y) => visibleYears.includes(y.year) && !y.confirmed,
  );
  const uniqueLeaves = data.events.filter((e) => e.extendedProps.kind === 'leave');
  return (
    <>
      <PageHeading
        title="ปฏิทินของทีม"
        subtitle="วันหยุดที่ต่างกัน วางแผนร่วมกันได้ในปฏิทินเดียว"
        action={
          canRequestLeave && (
            <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => onCreate()}>
              สร้างคำขอลา
            </Button>
          )
        }
      />
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', sm: 'repeat(3,1fr)' },
          gap: 2,
          mb: 3,
        }}
      >
        {[
          [
            'สมาชิกในทีม',
            data.members.length,
            'Super CS, CS และ Store · ไม่นับ Admin',
            PeopleAltRoundedIcon,
            '#00a76f',
          ],
          [
            'วันลารออนุมัติ',
            uniqueLeaves.filter((e) => e.extendedProps.status === 'pending').length,
            'คำขอในช่วงปฏิทินนี้',
            CalendarMonthRoundedIcon,
            '#ffab00',
          ],
          [
            'วันลาที่อนุมัติแล้ว',
            uniqueLeaves.filter((e) => e.extendedProps.status === 'approved').length,
            'คำขอในช่วงปฏิทินนี้',
            EventAvailableRoundedIcon,
            '#8e33ff',
          ],
        ].map(([label, count, sub, Icon, color]) => (
          <Card key={label}>
            <CardContent>
              <Stack direction="row" alignItems="center" justifyContent="space-between">
                <Box>
                  <Typography variant="body2" fontWeight={650}>
                    {label}
                  </Typography>
                  <Typography variant="h3" mt={1}>
                    {count}
                  </Typography>
                </Box>
                <Box
                  sx={{ bgcolor: color + '12', color, p: 1.7, borderRadius: 3, display: 'flex' }}
                >
                  <Icon sx={{ fontSize: 28 }} />
                </Box>
              </Stack>
              <Typography variant="caption" color="text.secondary">
                {sub}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Box>
      {unconfirmed.length > 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          ปฏิทินปี {unconfirmed.map((y) => y.year + 543).join(', ')}{' '}
          ยังรอผู้ดูแลตรวจทานวันหยุดพิเศษและยืนยัน ในเมนู “วันหยุดไทย”
        </Alert>
      )}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Card>
        <Box sx={{ px: { xs: 2, md: 3 }, pt: 3, pb: 2 }}>
          <Stack
            className="no-print"
            direction={{ xs: 'column', md: 'row' }}
            justifyContent="space-between"
            gap={2}
          >
            <Stack direction="row" spacing={1.5} flexWrap="wrap" useFlexGap>
              <TextField
                size="small"
                placeholder="ค้นหาชื่อสมาชิก"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchRoundedIcon fontSize="small" />
                    </InputAdornment>
                  ),
                }}
                sx={{ width: { xs: '100%', sm: 220 } }}
              />
              <TextField
                size="small"
                select
                label="สมาชิก"
                value={member}
                onChange={(e) => setMember(e.target.value)}
                sx={{ minWidth: 170 }}
              >
                <MenuItem value="all">สมาชิกทั้งหมด</MenuItem>
                {data.members.map((m) => (
                  <MenuItem key={m.id} value={String(m.id)}>
                    {m.name}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>
            <Stack direction="row" spacing={1}>
              <TextField
                select
                size="small"
                value={view}
                onChange={(e) => {
                  setView(e.target.value);
                  ref.current?.getApi().changeView(e.target.value);
                }}
                sx={{ minWidth: 110 }}
                aria-label="มุมมองปฏิทิน"
              >
                {Object.entries({
                  dayGridDay: 'วัน',
                  dayGridWeek: 'สัปดาห์',
                  dayGridMonth: 'เดือน',
                  multiMonthYear: 'ปี',
                }).map(([v, l]) => (
                  <MenuItem value={v} key={v}>
                    {l}
                  </MenuItem>
                ))}
              </TextField>
              <Tooltip title="โหลดใหม่">
                <IconButton onClick={() => setRefresh((v) => v + 1)} aria-label="โหลดใหม่">
                  <RefreshRoundedIcon />
                </IconButton>
              </Tooltip>
              <Tooltip title="พิมพ์">
                <IconButton onClick={() => window.print()} aria-label="พิมพ์ปฏิทิน">
                  <PrintRoundedIcon />
                </IconButton>
              </Tooltip>
            </Stack>
          </Stack>
          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            alignItems={{ sm: 'center' }}
            justifyContent="space-between"
            gap={1}
            mt={2}
          >
            <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
              <Chip size="small" color="success" label="อนุมัติแล้ว" />
              <Chip size="small" color="warning" label="รออนุมัติ" />
              <Chip size="small" label="หยุดปกติ" variant="outlined" />
              <Chip size="small" label="นักขัตฤกษ์" sx={{ bgcolor: '#fff2cc', color: '#7a4f00' }} />
            </Stack>
            <Stack direction="row">
              <FormControlLabel
                sx={{ mr: 1 }}
                control={
                  <Switch size="small" checked={offs} onChange={(e) => setOffs(e.target.checked)} />
                }
                label={<Typography variant="caption">หยุดปกติ</Typography>}
              />
              <FormControlLabel
                sx={{ mr: 0 }}
                control={
                  <Switch
                    size="small"
                    checked={pending}
                    onChange={(e) => setPending(e.target.checked)}
                  />
                }
                label={<Typography variant="caption">รออนุมัติ</Typography>}
              />
            </Stack>
          </Stack>
        </Box>
        {busy ? <LinearProgress sx={{ height: 2 }} /> : <Box height={2} />}
        <Box sx={{ p: { xs: 1, md: 3 }, pt: 2 }}>
          <FullCalendar
            ref={ref}
            plugins={[dayGridPlugin, interactionPlugin, multiMonthPlugin]}
            initialView="dayGridMonth"
            locale={thLocale}
            firstDay={1}
            headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
            buttonText={{ today: 'วันนี้' }}
            height="auto"
            dayMaxEvents={3}
            multiMonthMaxColumns={3}
            fixedWeekCount={false}
            events={filtered}
            editable={false}
            selectable={canRequestLeave}
            selectMirror
            datesSet={(v) => {
              const next = { start: v.startStr.slice(0, 10), end: v.endStr.slice(0, 10) };
              setRange((old) => (old?.start === next.start && old?.end === next.end ? old : next));
            }}
            select={(v) => {
              onCreate({ start_date: v.startStr.slice(0, 10), end_date: previousDay(v.endStr) });
              ref.current.getApi().unselect();
            }}
            dateClick={(v) =>
              canRequestLeave &&
              onCreate({ start_date: v.dateStr.slice(0, 10), end_date: v.dateStr.slice(0, 10) })
            }
            eventClick={(v) => {
              const p = v.event.extendedProps;
              if (p.kind === 'leave') onDetails(p.request_id, p.user_id);
              else notify(v.event.title);
            }}
          />
        </Box>
      </Card>
      <Typography variant="caption" color="text.secondary" display="block" mt={2}>
        ศุกร์–อาทิตย์ลาเพิ่มได้ 1 คนต่อวัน รวม Store · วันหยุดปกติไม่หักโควตานี้ ·
        {canRequestLeave
          ? 'คลิกวันที่หรือลากช่วงวันเพื่อขอลา'
          : 'Admin ดูแลระบบโดยไม่ถูกนับในกำลังคนของทีม'}
      </Typography>
    </>
  );
}
