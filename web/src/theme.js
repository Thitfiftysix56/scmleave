import { createTheme, alpha } from '@mui/material/styles';
export const theme = createTheme({
  palette: {
    primary: { main: '#00a76f', dark: '#007867', light: '#5be49b' },
    secondary: { main: '#8e33ff' },
    background: { default: '#f8fafb', paper: '#fff' },
    text: { primary: '#1c252e', secondary: '#637381' },
    divider: '#edf0f2',
    success: { main: '#118d57' },
    warning: { main: '#ffab00' },
    error: { main: '#ff5630' },
  },
  typography: {
    fontFamily: '"Noto Sans Thai", "Thonburi", "Tahoma", system-ui, sans-serif',
    h3: { fontSize: '2rem', fontWeight: 800, letterSpacing: '-.025em' },
    h4: { fontSize: '1.65rem', fontWeight: 800, letterSpacing: '-.025em' },
    h5: { fontSize: '1.2rem', fontWeight: 750 },
    h6: { fontWeight: 750, fontSize: '1.05rem' },
    button: { fontWeight: 700, textTransform: 'none' },
    body2: { fontSize: '.86rem', lineHeight: 1.8 },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 9, padding: '9px 17px' },
        contained: { boxShadow: 'none' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 18,
          boxShadow: '0 0 2px 0 rgba(145,158,171,.2),0 12px 24px -6px rgba(145,158,171,.10)',
          backgroundImage: 'none',
        },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: { root: { borderRadius: 10 }, notchedOutline: { borderColor: '#dce2e7' } },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 650, borderRadius: 7 },
        colorSuccess: { background: alpha('#00a76f', 0.12), color: '#007867' },
        colorWarning: { background: '#fff1d6', color: '#9a5b00' },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: { background: '#f4f6f8', color: '#637381', fontWeight: 700, whiteSpace: 'nowrap' },
        root: { borderBottom: '1px dashed #edf0f2', padding: '14px 16px' },
      },
    },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 20 } } },
    MuiAlert: { styleOverrides: { root: { borderRadius: 12 } } },
  },
});
