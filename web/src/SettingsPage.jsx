import React, { useEffect, useState } from 'react';
import {
  Box,
  Card,
  Stack,
  Typography,
  TextField,
  Button,
  Alert,
  FormControlLabel,
  Switch,
  MenuItem,
  Chip,
} from '@mui/material';
import SaveRoundedIcon from '@mui/icons-material/SaveRounded';
import { api, displayDate } from './api';
import { PageHeading, DataTable, Loading, ConfirmDialog } from './ui';
export default function SettingsPage({ version, onSaved, notify }) {
  const [policy, setPolicy] = useState(null),
    [error, setError] = useState(''),
    [logs, setLogs] = useState([]),
    [confirm, setConfirm] = useState(null);
  useEffect(() => {
    let active = true;
    Promise.all([api('/admin/settings'), api('/admin/audit')])
      .then(([s, a]) => {
        if (active) {
          setPolicy(s.policy);
          setLogs(a.logs);
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
  return (
    <>
      <PageHeading
        title="กติกาและประวัติระบบ"
        subtitle="กำหนดเงื่อนไขของทีม และตรวจสอบกิจกรรมสำคัญย้อนหลัง"
      />
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Card sx={{ p: 3, mb: 3 }}>
        {!policy ? (
          <Loading />
        ) : (
          <Stack spacing={3}>
            <Typography variant="h6">กติกาการลา</Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', md: 'repeat(2,1fr)' },
                gap: 3,
              }}
            >
              <TextField
                label="จำนวนคนลาเพิ่มสูงสุด ศุกร์–อาทิตย์"
                type="number"
                value={policy.weekendCapacity}
                inputProps={{ min: 1, max: 10 }}
                onChange={(e) => setPolicy({ ...policy, weekendCapacity: Number(e.target.value) })}
                helperText="รวมทุกตำแหน่ง รวมคำขอรออนุมัติ / ไม่รวมวันหยุดปกติ"
              />
              <TextField
                select
                label="ต้องแนบใบรับรองตั้งแต่กี่วัน"
                value={policy.certificateFromDays}
                onChange={(e) =>
                  setPolicy({ ...policy, certificateFromDays: Number(e.target.value) })
                }
              >
                <MenuItem value={2}>2 วันปฏิทิน</MenuItem>
                <MenuItem value={3}>3 วันปฏิทิน</MenuItem>
              </TextField>
              <TextField
                label="หยุดต่อเนื่องปกติสูงสุด"
                value="4 วัน"
                inputProps={{ readOnly: true }}
              />
              <TextField
                label="กรณีพิเศษเมื่อคุยทีมและแจ้งพี่เกล้า"
                value="5 วัน"
                inputProps={{ readOnly: true }}
              />
            </Box>
            <FormControlLabel
              control={
                <Switch
                  checked={policy.blockHolidayExtension}
                  onChange={(e) =>
                    setPolicy({ ...policy, blockHolidayExtension: e.target.checked })
                  }
                />
              }
              label="ห้ามลาเพิ่มต่อเนื่องกับเทศกาล/นักขัตฤกษ์ ทั้งก่อนและหลัง"
            />
            <Alert severity="info">
              ลาป่วยที่ติดข้อจำกัดการวางแผนสามารถส่งขอให้ Admin / Super พิจารณาพิเศษได้
              แต่ต้องมีเอกสารตามเกณฑ์ กฎทั้งหมดตรวจซ้ำใน API เมื่อส่งและเมื่ออนุมัติ
            </Alert>
            <Button
              sx={{ alignSelf: 'flex-start' }}
              variant="contained"
              startIcon={<SaveRoundedIcon />}
              onClick={() =>
                setConfirm({
                  title: 'บันทึกกติกาใหม่',
                  text: 'ระบบจะให้ยกเลิกคำขออนาคตที่ยังใช้งานอยู่ก่อนเปลี่ยนกติกา เพื่อป้องกันผลการตรวจเดิมคลาดเคลื่อน',
                  action: async () => {
                    const r = await api('/admin/settings', { method: 'PUT', body: policy });
                    notify(r.message);
                    onSaved();
                  },
                })
              }
            >
              บันทึกกติกา
            </Button>
          </Stack>
        )}
      </Card>
      <Card>
        <Box p={3}>
          <Typography variant="h6">กิจกรรมล่าสุด</Typography>
          <Typography variant="body2" color="text.secondary">
            200 รายการล่าสุด · เข้าสู่ระบบ สมาชิก วันลา และการเปิดใบรับรองแพทย์
          </Typography>
        </Box>
        <DataTable
          rows={logs}
          columns={[
            {
              key: 'created_at',
              label: 'เวลา',
              render: (r) => (
                <Typography variant="caption" whiteSpace="nowrap">
                  {displayDate(r.created_at)} {r.created_at?.slice(11, 16)} UTC
                </Typography>
              ),
            },
            { key: 'actor_name', label: 'ผู้ดำเนินการ' },
            {
              key: 'action',
              label: 'กิจกรรม',
              render: (r) => <Chip size="small" variant="outlined" label={r.action} />,
            },
            { key: 'entity', label: 'รายการ', render: (r) => `${r.entity_type} #${r.entity_id}` },
          ]}
        />
      </Card>
      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
