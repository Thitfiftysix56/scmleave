import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  Stack,
  Typography,
  TextField,
  Button,
  Alert,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Link,
  Chip,
  Checkbox,
  FormControlLabel,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import CheckCircleOutlineRoundedIcon from '@mui/icons-material/CheckCircleOutlineRounded';
import { api, today, displayDate } from './api';
import { PageHeading, DataTable, Loading, ConfirmDialog } from './ui';
export default function HolidaysPage({ version, onSaved, notify }) {
  const [year, setYear] = useState(Number(today().slice(0, 4))),
    [loadedYear, setLoadedYear] = useState(year),
    [data, setData] = useState(null),
    [error, setError] = useState(''),
    [edit, setEdit] = useState(null),
    [form, setForm] = useState(null),
    [dialogError, setDialogError] = useState(''),
    [busy, setBusy] = useState(false),
    [source, setSource] = useState(''),
    [confirm, setConfirm] = useState(null);
  const [online, setOnline] = useState(null),
    [picked, setPicked] = useState([]);
  useEffect(() => {
    let active = true;
    setData(null);
    api(`/admin/holidays/${loadedYear}`)
      .then((r) => {
        if (active) {
          setData(r);
          setSource(r.meta.confirmed ? r.meta.source : '');
          setError('');
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [loadedYear, version]);
  function open(h) {
    setEdit(h || { isNew: true });
    setForm(
      h
        ? { name: h.name, enabled: Boolean(h.enabled) }
        : { day: `${loadedYear}-01-01`, name: '', source: '' },
    );
    setDialogError('');
  }
  async function save() {
    setBusy(true);
    setDialogError('');
    try {
      const r = await api(edit.isNew ? '/admin/holidays' : `/admin/holidays/${edit.id}`, {
        method: edit.isNew ? 'POST' : 'PATCH',
        body: form,
      });
      notify(r.message);
      setEdit(null);
      onSaved();
    } catch (e) {
      setDialogError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function fetchOnline() {
    setBusy(true);
    setError('');
    try {
      const r = await api(`/admin/holidays/${loadedYear}/online-preview`);
      setOnline(r.holidays);
      setPicked([]);
    } catch (e) {
      setError(e.message + ' · สามารถตรวจรายการคำนวณและเพิ่มวันหยุดพิเศษเองได้');
    } finally {
      setBusy(false);
    }
  }
  async function importOnline() {
    setBusy(true);
    setDialogError('');
    try {
      const rows = online
        .filter((h, i) => picked.includes(i))
        .map(({ day, name }) => ({ day, name }));
      const r = await api(`/admin/holidays/${loadedYear}/import`, { method: 'POST', body: rows });
      notify(r.message);
      setOnline(null);
      onSaved();
    } catch (e) {
      setDialogError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeading
        title="ปฏิทินวันหยุดไทย"
        subtitle="คำนวณวันหยุดตามปี ตรวจวันหยุดพิเศษ แล้วรับรองปฏิทินขององค์กร"
        action={
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => open(null)}>
            เพิ่มวันหยุดพิเศษ
          </Button>
        }
      />
      <Card sx={{ p: 3, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} gap={2} alignItems={{ md: 'center' }}>
          <TextField
            size="small"
            type="number"
            label="ปี ค.ศ."
            value={year}
            onChange={(e) => setYear(e.target.value)}
            helperText={`พ.ศ. ${Number(year) + 543}`}
            inputProps={{ min: 2020, max: 2100 }}
          />
          <Button
            variant="outlined"
            onClick={() => setLoadedYear(Number(year))}
            disabled={Number(year) < 2020 || Number(year) > 2100}
          >
            ดูปฏิทินปีนี้
          </Button>
          {data && (
            <Chip
              color={data.meta.confirmed ? 'success' : 'warning'}
              label={data.meta.confirmed ? 'ยืนยันแล้ว' : 'รอตรวจทาน'}
            />
          )}
        </Stack>
        <Alert severity="info" sx={{ mt: 2 }}>
          รายการเริ่มต้นคำนวณด้วย date-holidays (TH) ซึ่งอาจยังไม่มีวันหยุดพิเศษที่ประกาศเพิ่ม
          โปรดเทียบประกาศที่องค์กรใช้ เพิ่ม/ปิดรายการให้ครบ แล้วกดยืนยัน
          ไม่ถือว่าวันหยุดธนาคารทุกวันเป็นวันหยุดของบริษัท
        </Alert>
        <Button variant="outlined" sx={{ mt: 2 }} disabled={busy} onClick={fetchOnline}>
          {busy ? 'กำลังโหลด…' : 'ดูรายการจากปฏิทินไทยออนไลน์ (Google)'}
        </Button>
        <Typography variant="body2" mt={1.5}>
          ตรวจประกาศ:{' '}
          <Link href="https://www.soc.go.th/" target="_blank" rel="noreferrer">
            สำนักเลขาธิการคณะรัฐมนตรี
          </Link>{' '}
          ·{' '}
          <Link
            href="https://www.bot.or.th/th/financial-institutions-holiday.html"
            target="_blank"
            rel="noreferrer"
          >
            ธนาคารแห่งประเทศไทย (เฉพาะวันหยุดสถาบันการเงิน)
          </Link>
        </Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} mt={2.5} spacing={2}>
          <TextField
            fullWidth
            size="small"
            label="ชื่อประกาศ / URL อ้างอิงที่ตรวจแล้ว"
            value={source}
            onChange={(e) => setSource(e.target.value)}
            inputProps={{ maxLength: 255 }}
          />
          <Button
            variant="contained"
            startIcon={<CheckCircleOutlineRoundedIcon />}
            disabled={!data || source.trim().length < 5}
            sx={{ whiteSpace: 'nowrap' }}
            onClick={() =>
              setConfirm({
                title: `ยืนยันปฏิทินปี ${loadedYear + 543}`,
                text: 'ยืนยันว่ารายการวันหยุดเปิดใช้งานครบตามที่องค์กรกำหนดแล้ว ระบบจะใช้รายการนี้ตรวจวันลา',
                action: async () => {
                  const r = await api(`/admin/holidays/${loadedYear}/confirm`, {
                    method: 'POST',
                    body: { source },
                  });
                  notify(r.message);
                  onSaved();
                },
              })
            }
          >
            ยืนยันปฏิทิน
          </Button>
        </Stack>
      </Card>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Card>
        {!data && !error ? (
          <Loading />
        ) : (
          <DataTable
            rows={data?.holidays || []}
            columns={[
              {
                key: 'day',
                label: 'วันที่',
                render: (h) => (
                  <Typography variant="body2" whiteSpace="nowrap">
                    {displayDate(h.day)}
                  </Typography>
                ),
              },
              { key: 'name', label: 'วันหยุด' },
              {
                key: 'enabled',
                label: 'ใช้งาน',
                render: (h) => (
                  <Chip
                    label={h.enabled ? 'ใช่' : 'ปิด'}
                    size="small"
                    color={h.enabled ? 'success' : 'default'}
                  />
                ),
              },
              {
                key: 'source',
                label: 'ที่มา',
                render: (h) => (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ maxWidth: 240, display: 'block', overflowWrap: 'anywhere' }}
                  >
                    {h.source}
                  </Typography>
                ),
              },
              {
                key: 'action',
                label: 'จัดการ',
                render: (h) => (
                  <Button size="small" onClick={() => open(h)}>
                    แก้ไข
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>
      <Dialog
        open={Boolean(edit)}
        onClose={busy ? undefined : () => setEdit(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>{edit?.isNew ? 'เพิ่มวันหยุดพิเศษ' : 'แก้ไขวันหยุด'}</DialogTitle>
        <DialogContent>
          {form && (
            <Stack spacing={2.5} mt={1}>
              {dialogError && <Alert severity="error">{dialogError}</Alert>}
              {edit?.isNew && (
                <TextField
                  label="วันที่"
                  type="date"
                  InputLabelProps={{ shrink: true }}
                  value={form.day}
                  onChange={(e) => setForm({ ...form, day: e.target.value })}
                />
              )}
              <TextField
                label="ชื่อวันหยุด"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              {edit?.isNew ? (
                <TextField
                  label="แหล่งอ้างอิง / ประกาศองค์กร"
                  value={form.source}
                  onChange={(e) => setForm({ ...form, source: e.target.value })}
                />
              ) : (
                <Stack direction="row" alignItems="center">
                  <Switch
                    checked={form.enabled}
                    onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
                  />
                  <Typography>เปิดใช้งานวันนี้</Typography>
                </Stack>
              )}
              <Alert severity="warning">
                แก้แล้วต้องยืนยันปฏิทินใหม่ หากมีคำขอลาที่ใช้งานอยู่ในปีนี้
                ระบบจะให้จัดการคำขอก่อนเพื่อป้องกันยอดวันลาเปลี่ยนย้อนหลัง
              </Alert>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setEdit(null)}>
            ปิด
          </Button>
          <Button variant="contained" disabled={busy} onClick={save}>
            บันทึก
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={Boolean(online)}
        onClose={busy ? undefined : () => setOnline(null)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>เลือกรายการจากปฏิทินไทย · พ.ศ. {loadedYear + 543}</DialogTitle>
        <DialogContent>
          <Alert severity="warning" sx={{ mb: 2 }}>
            ปฏิทิน Google อาจมีวันสำคัญที่องค์กรไม่ได้หยุด เลือกเฉพาะวันหยุดจริงขององค์กร
            รายการเดิมยังอยู่ ให้ตรวจวันซ้ำก่อนยืนยันปฏิทิน
          </Alert>
          {dialogError && <Alert severity="error">{dialogError}</Alert>}
          <Stack>
            {(online || []).map((h, i) => (
              <FormControlLabel
                key={h.day + h.name}
                control={
                  <Checkbox
                    checked={picked.includes(i)}
                    onChange={(e) =>
                      setPicked(e.target.checked ? [...picked, i] : picked.filter((x) => x !== i))
                    }
                  />
                }
                label={`${displayDate(h.day)} · ${h.name}`}
              />
            ))}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setOnline(null)}>
            ปิด
          </Button>
          <Button variant="contained" disabled={busy || !picked.length} onClick={importOnline}>
            นำเข้า {picked.length} รายการที่เลือก
          </Button>
        </DialogActions>
      </Dialog>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
