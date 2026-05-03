import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { useAuth } from './AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export default function GoogleSignInButton({ onError }) {
  const navigate = useNavigate();
  const { setSessionFromSupabase } = useAuth();
  const [busy, setBusy] = useState(false);

  // Handle OAuth redirect: when user comes back from Google, exchange Supabase
  // session for our app token.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || cancelled) return;
      // Already in URL hash → Supabase auto-detected, now bridge to our backend
      setBusy(true);
      try {
        const res = await fetch(`${API_URL}/auth/supabase`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ access_token: session.access_token })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Bridge auth failed');
        // Store our app JWT
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        setSessionFromSupabase(data.token, data.user);
        // Clean up URL hash and go home
        window.history.replaceState({}, '', window.location.pathname);
        navigate('/');
      } catch (e) {
        onError?.(e.message);
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [navigate, setSessionFromSupabase, onError]);

  const handleClick = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/login'
        }
      });
      if (error) throw error;
      // Redirect happens, useEffect picks up on return
    } catch (e) {
      onError?.(e.message);
      setBusy(false);
    }
  };

  return (
    <div className="auth-google-wrap">
      <div className="auth-divider"><span>hoặc</span></div>
      <button
        type="button"
        className="auth-google-custom-btn"
        onClick={handleClick}
        disabled={busy}
      >
        <GoogleLogo/>
        <span>{busy ? 'Đang xử lý...' : 'Tiếp tục với Google'}</span>
      </button>
      <div className="auth-google-hint">
        Còn các provider khác (GitHub, Apple, Magic Link) — bật trong Supabase Dashboard
      </div>
    </div>
  );
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}
