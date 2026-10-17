const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');
let token = sessionStorage.getItem('scm-token');
export function setToken(value) {
  token = value;
  if (value) sessionStorage.setItem('scm-token', value);
  else sessionStorage.removeItem('scm-token');
}
export function hasToken() {
  return Boolean(token);
}
export async function api(path, { method = 'GET', body, blob = false, signal } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !(body instanceof FormData))
    headers['Content-Type'] = 'application/json';
  let response;
  try {
    response = await fetch(BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      signal,
    });
  } catch (e) {
    if (e.name === 'AbortError') throw e;
    throw new Error('เชื่อมต่อ API ไม่ได้ กรุณาตรวจอินเทอร์เน็ตหรือรอ Render เริ่มระบบแล้วลองใหม่');
  }
  if (!response.ok) {
    let result;
    try {
      result = await response.json();
    } catch {
      result = { message: `API ตอบกลับ ${response.status} กรุณารอสักครู่แล้วลองใหม่` };
    }
    const error = Object.assign(new Error(result.message || 'เกิดข้อผิดพลาด'), {
      details: result.details,
      status: response.status,
    });
    if (response.status === 401) {
      setToken(null);
      window.dispatchEvent(new Event('scm-session-expired'));
    }
    throw error;
  }
  return blob ? response.blob() : response.json();
}
export const LEAVE_LABEL = { annual: 'ลาพักร้อน', personal: 'ลากิจ', sick: 'ลาป่วย' };
export const ROLE_LABEL = {
  ADMIN: 'Admin',
  SUPER_CS: 'Super Customer Service',
  CS: 'Customer Service',
  STORE: 'Store',
};
export const isManager = (role) => ['ADMIN', 'SUPER_CS'].includes(role);
export const isStaff = (role) => ['SUPER_CS', 'CS', 'STORE'].includes(role);
export const STATUS_LABEL = {
  pending: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
  cancelled: 'ยกเลิกแล้ว',
  active: 'ใช้งาน',
  inactive: 'ระงับ',
};
export const DAY_LABEL = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
export const today = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
export function displayDate(value) {
  return value
    ? new Intl.DateTimeFormat('th-TH', { dateStyle: 'medium', timeZone: 'Asia/Bangkok' }).format(
        new Date(
          value.length === 10
            ? value + 'T12:00:00+07:00'
            : value.replace(' ', 'T') + (value.endsWith('Z') ? '' : 'Z'),
        ),
      )
    : '—';
}
