import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider, CssBaseline, Alert, Box, Button } from '@mui/material';
import { theme } from './theme';
import App from './App';
import './styles.css';
class ErrorBoundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <Box p={5}>
        <Alert severity="error">หน้าแอปแสดงผลไม่สำเร็จ กรุณารีเฟรชหรือติดต่อผู้ดูแล</Alert>
        <Button onClick={() => location.reload()}>โหลดใหม่</Button>
      </Box>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </ThemeProvider>
  </React.StrictMode>,
);
