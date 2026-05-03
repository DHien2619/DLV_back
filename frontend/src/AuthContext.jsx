import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(true);

  // Verify token on load
  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetch(`${API_URL}/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(d => { setUser(d.user); setLoading(false); })
      .catch(() => {
        localStorage.removeItem('token');
        setToken(null); setUser(null); setLoading(false);
      });
  }, [token]);

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API_URL}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Đăng nhập thất bại');
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  // After Supabase OAuth redirect, GoogleSignInButton calls this with our app token
  const setSessionFromSupabase = useCallback((appToken, appUser) => {
    setToken(appToken);
    setUser(appUser);
  }, []);

  const register = useCallback(async ({ name, email, password }) => {
    const res = await fetch(`${API_URL}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Đăng ký thất bại');
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null); setUser(null);
    window.location.href = '/login';
  }, []);

  // Helper: authenticated fetch
  const authFetch = useCallback((url, options = {}) => {
    return fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });
  }, [token]);

  const isAdmin = user?.role === 'admin';

  // Capability check — admin always has all, staff checks permissions object
  const can = useCallback((permission) => {
    if (!user) return false;
    if (isAdmin) return true;
    return !!user.permissions?.[permission];
  }, [user, isAdmin]);

  // Refresh user from /me (after profile update OR when admin changed perms)
  const refreshUser = useCallback(async () => {
    if (!token) return;
    const res = await fetch(`${API_URL}/me`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const d = await res.json();
      setUser(d.user);
      localStorage.setItem('user', JSON.stringify(d.user));
    }
  }, [token]);

  // Auto-sync permissions: refresh /me when tab becomes visible again.
  // Covers the case where admin updated this user's perms while they were
  // on another tab — they get fresh sidebar/menu without manual reload.
  // Throttled to once per 30s to avoid spamming /me on rapid focus changes.
  useEffect(() => {
    if (!token) return;
    let lastRefresh = 0;
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - lastRefresh < 30_000) return;
      lastRefresh = now;
      refreshUser();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [token, refreshUser]);

  const value = {
    user, token, loading,
    isAuthenticated: !!user,
    isAdmin,
    isStaff: user?.role === 'staff',
    can,
    refreshUser,
    login, register, setSessionFromSupabase, logout, authFetch
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

// Wrapper component: redirects to /login if not authenticated.
// Supports adminOnly OR requirePermission='view_dashboard' etc.
export function ProtectedRoute({ children, adminOnly = false, requirePermission }) {
  const { isAuthenticated, isAdmin, can, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', color: 'var(--ink-500)', fontSize: 14
      }}>
        Đang xác thực...
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = '/login';
    return null;
  }

  const denied =
    (adminOnly && !isAdmin) ||
    (requirePermission && !can(requirePermission));

  if (denied) {
    return (
      <div style={{
        padding: 60, textAlign: 'center', color: 'var(--ink-600)',
        background: 'var(--paper)', borderRadius: 12, margin: 24,
        border: '1px solid var(--ink-100)'
      }}>
        <h2 style={{ color: 'var(--danger)', marginBottom: 8 }}>Không có quyền truy cập</h2>
        <p style={{ fontSize: 14, color: 'var(--ink-500)' }}>
          {requirePermission
            ? <>Bạn cần được Admin cấp quyền <b>{requirePermission}</b> để xem trang này.</>
            : <>Trang này chỉ dành cho <b>Admin</b>.</>}
        </p>
        <a href="/" style={{
          display: 'inline-block', marginTop: 16, padding: '10px 20px',
          background: 'var(--primary-gradient)', color: 'white',
          borderRadius: 8, textDecoration: 'none', fontWeight: 600, fontSize: 13
        }}>← Về trang chủ</a>
      </div>
    );
  }

  return children;
}
