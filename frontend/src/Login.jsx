import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';
import { IconSparkles, IconAlert, IconLoader } from './icons';
import './Login.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export default function Login() {
  const navigate = useNavigate();
  const { setSessionFromSupabase } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null); setLoading(true);
    try {
      // 1. Authenticate via Supabase
      const { data, error: sbErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });
      if (sbErr) throw sbErr;
      if (!data.session) throw new Error('Không nhận được session');

      // 2. Bridge to our backend → get app JWT + role
      const res = await fetch(`${API_URL}/auth/supabase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: data.session.access_token })
      });
      const bridgeData = await res.json();
      if (!res.ok) throw new Error(bridgeData.message || 'Bridge failed');

      // 3. Save & navigate
      localStorage.setItem('token', bridgeData.token);
      localStorage.setItem('user', JSON.stringify(bridgeData.user));
      setSessionFromSupabase(bridgeData.token, bridgeData.user);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Đăng nhập thất bại');
    } finally { setLoading(false); }
  };

  return (
    <div className="auth-root">
      <div className="auth-bg-blob auth-bg-blob-1"/>
      <div className="auth-bg-blob auth-bg-blob-2"/>

      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-logo"><IconSparkles size={24}/></div>
          <h1>PharmaVoice</h1>
          <p>Trợ lý AI phân tích cuộc gọi telesale dược phẩm</p>
        </div>

        <form onSubmit={onSubmit} className="auth-form">
          <h2>Đăng nhập</h2>

          <label>
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              placeholder="ban@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </label>

          <label>
            <span>Mật khẩu</span>
            <div className="auth-pwd-wrap">
              <input
                type={showPwd ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                disabled={loading}
              />
              <button type="button" className="auth-pwd-toggle" onClick={() => setShowPwd(!showPwd)} tabIndex={-1}>
                {showPwd ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
          </label>

          {error && (
            <div className="auth-error">
              <IconAlert size={14}/> {error}
            </div>
          )}

          <button type="submit" className="auth-submit" disabled={loading || !email || !password}>
            {loading ? <><IconLoader size={16} className="spin"/> Đang xác thực...</> : 'Đăng nhập'}
          </button>
        </form>

        <div className="auth-footer">
          Chưa có tài khoản? <Link to="/register">Đăng ký ngay</Link>
        </div>
      </div>
    </div>
  );
}
