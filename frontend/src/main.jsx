import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Patch window.fetch to auto-inject JWT for backend API calls.
// Backend protects all /api/v2/* with requireAuth — without this patch every
// component using bare fetch() would 401.
const _origFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const url = typeof input === 'string' ? input : input?.url || '';
  const needsAuth = /\/(api\/v2|me|api\/users|dashboard)/.test(url);
  if (!needsAuth) return _origFetch(input, init);

  const token = localStorage.getItem('token');
  if (!token) return _origFetch(input, init);

  const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
  if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`);
  return _origFetch(input, { ...init, headers });
};

// Auto-redirect to /login on 401 (token expired) — except on auth pages themselves.
const _origFetch2 = window.fetch;
window.fetch = async (...args) => {
  const res = await _origFetch2(...args);
  if (res.status === 401 && !location.pathname.startsWith('/login') && !location.pathname.startsWith('/register')) {
    const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
    if (/\/(api\/v2|me)/.test(url)) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      location.href = '/login';
    }
  }
  return res;
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
