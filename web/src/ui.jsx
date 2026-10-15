import React from 'react';
import {
  Box,
  Typography,
  Stack,
  Chip,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  CircularProgress,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  TableContainer,
  Paper,
  Alert,
} from '@mui/material';
import { STATUS_LABEL, DAY_LABEL } from './api';
export function PageHeading({ eyebrow = 'WORKSPACE / SCM', title, subtitle, action }) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      justifyContent="space-between"
      alignItems={{ sm: 'center' }}
      spacing={2}
      mb={3}
    >
      <Box>
        <Typography
          variant="caption"
          sx={{ letterSpacing: 1.3, fontWeight: 750, color: 'text.secondary' }}
        >
          {eyebrow}
        </Typography>
        <Typography variant="h4" mt={0.7}>
          {title}
        </Typography>
        {subtitle && (
          <Typography color="text.secondary" variant="body2" mt={0.8}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {action}
    </Stack>
  );
}
export function Status({ value }) {
  return (
    <Chip
      size="small"
      label={STATUS_LABEL[value] || value}
      color={
        value === 'approved' || value === 'active'
          ? 'success'
          : value === 'pending'
            ? 'warning'
            : value === 'rejected' || value === 'inactive'
              ? 'error'
              : 'default'
      }
    />
  );
}
export function OffPicker({ value, onChange }) {
  return (
    <Box>
      <Typography variant="body2" color="text.secondary" mb={1}>
        วันหยุดปกติประจำสัปดาห์
      </Typography>
      <Stack direction="row" flexWrap="wrap" gap={0.8}>
        {DAY_LABEL.map((d, i) => (
          <Chip
            key={d}
            clickable
            label={d}
            color={value.includes(i) ? 'success' : 'default'}
            variant={value.includes(i) ? 'filled' : 'outlined'}
            onClick={() =>
              onChange(value.includes(i) ? value.filter((x) => x !== i) : [...value, i].sort())
            }
          />
        ))}
      </Stack>
      <Typography variant="caption" color="text.secondary">
        แต่ละคนกำหนดวันหยุดต่างกันได้ · เลือกอย่างน้อย 1 วันและไม่ครบ 7 วัน
      </Typography>
    </Box>
  );
}
export function SelectField({ label, value, onChange, options, ...props }) {
  return (
    <FormControl fullWidth size="small" {...props}>
      <InputLabel>{label}</InputLabel>
      <Select label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {Object.entries(options).map(([k, v]) => (
          <MenuItem key={k} value={k}>
            {v}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}
export function Loading() {
  return (
    <Box display="flex" justifyContent="center" p={6}>
      <CircularProgress size={30} />
    </Box>
  );
}
export function Empty({ text = 'ยังไม่มีรายการ' }) {
  return (
    <Box textAlign="center" py={6}>
      <Typography variant="h5" color="text.secondary">
        {text}
      </Typography>
      <Typography variant="body2" color="text.secondary" mt={1}>
        รายการใหม่จะแสดงที่นี่
      </Typography>
    </Box>
  );
}
export function DataTable({ columns, rows, empty = 'ยังไม่มีรายการ' }) {
  return (
    <TableContainer>
      <Table size="small">
        <TableHead>
          <TableRow>
            {columns.map((c) => (
              <TableCell key={c.key}>{c.label}</TableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.id || i} hover>
              {columns.map((c) => (
                <TableCell key={c.key}>{c.render ? c.render(r) : r[c.key]}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!rows.length && <Empty text={empty} />}
    </TableContainer>
  );
}
export function ConfirmDialog({ state, onClose }) {
  const [busy, setBusy] = React.useState(false),
    [error, setError] = React.useState('');
  React.useEffect(() => {
    setError('');
    setBusy(false);
  }, [state]);
  return (
    <Dialog open={Boolean(state)} onClose={busy ? undefined : onClose} fullWidth maxWidth="xs">
      <DialogTitle>{state?.title}</DialogTitle>
      <DialogContent>
        <Typography variant="body2">{state?.text}</Typography>
        {error && (
          <Alert severity="error" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>
          กลับ
        </Button>
        <Button
          variant="contained"
          color={state?.danger ? 'error' : 'primary'}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await state.action();
              onClose();
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          ยืนยัน
        </Button>
      </DialogActions>
    </Dialog>
  );
}
