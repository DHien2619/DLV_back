import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';
import { IconSparkles, IconAlert, IconLoader, IconCheck } from './icons';
import './Login.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export default function Register() {
  const navigate = useNavigate();
  const { setSessionFromSupabase } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  const validPwd = password.length >= 6;
  const matchPwd = password && password === confirm;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!validPwd) return setError('Mật khẩu cần ít nhất 6 ký tự');
    if (!matchPwd) return setError('Mật khẩu xác nhận không khớp');
    setLoading(true);
    try {
      // 1. Sign up via Supabase
      const { data, error: sbErr } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: name.trim() }
        }
      });
      if (sbErr) throw sbErr;

      // If email confirmation is required by Supabase project, no session yet
      if (!data.session) {
        setNeedsConfirm(true);
        return;
      }

      // 2. Bridge to our backend
      const res = await fetch(`${API_URL}/auth/supabase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: data.session.access_token })
      });
      const bridgeData = await res.json();
      if (!res.ok) throw new Error(bridgeData.message || 'Bridge failed');

      localStorage.setItem('token', bridgeData.token);
      localStorage.setItem('user', JSON.stringify(bridgeData.user));
      setSessionFromSupabase(bridgeData.token, bridgeData.user);
      navigate('/');
    } catch (err) {
      setError(err.message || 'Đăng ký thất bại');
    } finally { setLoading(false); }
  };

  if (needsConfirm) {
    return (
      <div className="auth-root">
        <div className="auth-bg-blob auth-bg-blob-1"/>
        <div className="auth-bg-blob auth-bg-blob-2"/>
        <div className="auth-card">
          <div className="auth-brand">
            <div className="auth-logo"><IconCheck size={24}/></div>
            <h1>Kiểm tra email</h1>
            <p>Chúng tôi đã gửi link xác minh tới <b>{email}</b></p>
          </div>
          <div className="auth-hint" style={{ marginTop: 0 }}>
            Sau khi xác minh email, bạn có thể quay lại để <Link to="/login">đăng nhập</Link>.
          </div>
        </div>
      </div>
    );
  }

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
          <h2>Đăng ký tài khoản</h2>

          <label>
            <span>Họ tên</span>
            <input type="text" autoComplete="name" placeholder="Nguyễn Văn A"
              value={name} onChange={e => setName(e.target.value)} required disabled={loading}/>
          </label>

          <label>
            <span>Email</span>
            <input type="email" autoComplete="email" placeholder="ban@example.com"
              value={email} onChange={e => setEmail(e.target.value)} required disabled={loading}/>
          </label>

          <label>
            <span>Mật khẩu</span>
            <div className="auth-pwd-wrap">
              <input type={showPwd ? 'text' : 'password'} autoComplete="new-password"
                placeholder="Tối thiểu 6 ký tự" value={password}
                onChange={e => setPassword(e.target.value)} required disabled={loading}/>
              <button type="button" className="auth-pwd-toggle" onClick={() => setShowPwd(!showPwd)} tabIndex={-1}>
                {showPwd ? 'Ẩn' : 'Hiện'}
              </button>
            </div>
            {password && (
              <div className={`auth-pwd-hint ${validPwd ? 'ok' : ''}`}>
                {validPwd ? <IconCheck size={11}/> : <span style={{width:11}}/>}
                Tối thiểu 6 ký tự
              </div>
            )}
          </label>

          <label>
            <span>Xác nhận mật khẩu</span>
            <input type={showPwd ? 'text' : 'password'} autoComplete="new-password"
              placeholder="Nhập lại mật khẩu" value={confirm}
              onChange={e => setConfirm(e.target.value)} required disabled={loading}/>
            {confirm && (
              <div className={`auth-pwd-hint ${matchPwd ? 'ok' : 'err'}`}>
                {matchPwd ? <IconCheck size={11}/> : <IconAlert size={11}/>}
                {matchPwd ? 'Mật khẩu khớp' : 'Mật khẩu không khớp'}
              </div>
            )}
          </label>

          {error && (
            <div className="auth-error">
              <IconAlert size={14}/> {error}
            </div>
          )}

          <button type="submit" className="auth-submit" disabled={loading || !validPwd || !matchPwd || !name || !email}>
            {loading ? <><IconLoader size={16} className="spin"/> Đang tạo tài khoản...</> : 'Đăng ký'}
          </button>
        </form>

        <div className="auth-footer">
          Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
        </div>
      </div>
    </div>
  );
}
