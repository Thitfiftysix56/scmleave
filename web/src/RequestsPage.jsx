import React, { useEffect, useState } from 'react';
import {
  Card,
  Stack,
  TextField,
  MenuItem,
  Button,
  Typography,
  Box,
  Chip,
  Alert,
} from '@mui/material';
import AddRoundedIcon from '@mui/icons-material/AddRounded';
import { api, LEAVE_LABEL, STATUS_LABEL, displayDate, today } from './api';
import { PageHeading, DataTable, Status, Loading } from './ui';
export default function RequestsPage({ user, version, onCreate, onDetails }) {
  const [rows, setRows] = useState(null),
    [balances, setBalances] = useState([]),
    [status, setStatus] = useState('all'),
    [search, setSearch] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    Promise.all([api('/leaves'), api('/balances')])
      .then(([r, b]) => {
        if (active) {
          setRows(r.requests);
          setBalances(b.balances);
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
        title={user.role === 'SUPER_CS' ? 'คำขอและการอนุมัติ' : 'คำขอลาของฉัน'}
        subtitle="ติดตามสถานะ ตรวจรายละเอียด และดูยอดวันลาที่ใช้ไป"
        action={
          <Button variant="contained" startIcon={<AddRoundedIcon />} onClick={() => onCreate()}>
            สร้างคำขอลา
          </Button>
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
        {balances.map((b) => (
          <Card key={b.leave_type} sx={{ p: 2.5 }}>
            <Typography fontWeight={700}>{LEAVE_LABEL[b.leave_type]} · ของฉัน</Typography>
            <Typography variant="h4" mt={1}>
              {b.remaining === null ? 'ไม่กำหนดสิทธิ์' : `${b.remaining} / ${b.quota} วัน`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              ปี {Number(today().slice(0, 4)) + 543} · อนุมัติ {b.approved} / จองรออนุมัติ{' '}
              {b.pending} วัน
            </Typography>
          </Card>
        ))}
      </Box>
      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}
      <Card>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} sx={{ p: 3 }}>
          <TextField
            size="small"
            label="ค้นหาชื่อ / เหตุผล"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: 1 }}
          />
          <TextField
            size="small"
            select
            label="สถานะ"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            sx={{ minWidth: 160 }}
          >
            <MenuItem value="all">ทุกสถานะ</MenuItem>
            {['pending', 'approved', 'rejected', 'cancelled'].map((s) => (
              <MenuItem value={s} key={s}>
                {STATUS_LABEL[s]}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
        {!rows && !error ? (
          <Loading />
        ) : (
          <DataTable
            rows={(rows || []).filter(
              (r) =>
                (status === 'all' || r.status === status) &&
                `${r.name} ${r.reason}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
            )}
            columns={[
              {
                key: 'name',
                label: 'สมาชิก',
                render: (r) => (
                  <>
                    <Typography variant="body2" fontWeight={700}>
                      {r.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      #{r.id} · {LEAVE_LABEL[r.leave_type]}
                    </Typography>
                  </>
                ),
              },
              {
                key: 'dates',
                label: 'ช่วงวันลา',
                render: (r) => (
                  <>
                    <Typography variant="body2" whiteSpace="nowrap">
                      {displayDate(r.start_date)}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      ถึง {displayDate(r.end_date)}
                    </Typography>
                  </>
                ),
              },
              { key: 'charged_days', label: 'ใช้สิทธิ์', render: (r) => `${r.charged_days} วัน` },
              {
                key: 'status',
                label: 'สถานะ',
                render: (r) => (
                  <Stack spacing={0.5} alignItems="flex-start">
                    <Status value={r.status} />
                    {r.validation_snapshot.requiresException && (
                      <Chip size="small" variant="outlined" label="กรณีพิเศษ" />
                    )}
                  </Stack>
                ),
              },
              {
                key: 'action',
                label: 'รายละเอียด',
                render: (r) => (
                  <Button size="small" onClick={() => onDetails(r.id, r.user_id)}>
                    เปิดคำขอ
                  </Button>
                ),
              },
            ]}
          />
        )}
      </Card>
    </>
  );
}
