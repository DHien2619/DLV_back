import React, { useState } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from './supabaseClient';
import { PERMISSIONS } from './permissions';
import {
  IconSettings, IconCustomer, IconLock, IconCheck, IconAlert, IconLoader, IconCompliance, IconUpload, IconClose
} from './icons';
import './Settings.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

const TABS = [
  { key: 'profile',     label: 'Hồ sơ',           Icon: IconCustomer },
  { key: 'security',    label: 'Bảo mật',         Icon: IconLock },
  { key: 'permissions', label: 'Quyền truy cập',  Icon: IconCompliance }
];

export default function Settings() {
  const { user, isAdmin, refreshUser, authFetch } = useAuth();
  const [tab, setTab] = useState('profile');

  if (!user) return null;

  return (
    <div className="set-root">
      <div className="set-header">
        <div className="set-header-icon"><IconSettings size={22}/></div>
        <div>
          <h1>Cài đặt tài khoản</h1>
          <p>Quản lý thông tin cá nhân, bảo mật và quyền truy cập</p>
        </div>
      </div>

      <div className="set-layout">
        <nav className="set-tabs">
          {TABS.map(t => (
            <button
              key={t.key}
              className={`set-tab ${tab === t.key ? 'active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              <t.Icon size={16}/>
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="set-content">
          {tab === 'profile'     && <ProfileTab user={user} refreshUser={refreshUser} authFetch={authFetch}/>}
          {tab === 'security'    && <SecurityTab user={user}/>}
          {tab === 'permissions' && <PermissionsTab user={user} isAdmin={isAdmin}/>}
        </div>
      </div>
    </div>
  );
}

// ── PROFILE ──────────────────────────────────────────────────
function ProfileTab({ user, refreshUser, authFetch }) {
  const [name, setName]   = useState(user.name || '');
  const [phone, setPhone] = useState(user.phone || '');
  const [title, setTitle] = useState(user.title || '');
  const [image, setImage] = useState(user.image || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg]     = useState(null);
  const [err, setErr]     = useState(null);
  const fileInputRef = React.useRef(null);

  const initials = (user.name || 'U').split(' ').map(s => s[0]).slice(-2).join('').toUpperCase();

  const onPickFile = () => fileInputRef.current?.click();

  const onFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr(null); setMsg(null); setUploading(true);
    try {
      // Validate
      if (!file.type.startsWith('image/')) throw new Error('Chỉ chấp nhận file ảnh');
      if (file.size > 5 * 1024 * 1024) throw new Error('Ảnh tối đa 5MB');

      // Upload to Supabase Storage
      const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
      const path = `user-${user.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, {
        upsert: true, contentType: file.type
      });
      if (upErr) throw upErr;

      const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
      const publicUrl = urlData.publicUrl;
      setImage(publicUrl);
      setMsg('Đã upload ảnh — click "Lưu thay đổi" để áp dụng');
    } catch (e) { setErr(e.message); }
    finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeImage = () => {
    setImage('');
    setMsg('Click "Lưu thay đổi" để xóa ảnh');
  };

  const onSave = async (e) => {
    e.preventDefault();
    setSaving(true); setMsg(null); setErr(null);
    try {
      const res = await authFetch(`${API_URL}/me/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, title, image })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Lỗi cập nhật');
      await refreshUser();
      setMsg('Đã lưu thay đổi');
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={onSave} className="set-form">
      <h3>Hồ sơ cá nhân</h3>

      <div className="set-avatar-row">
        <div className={`set-avatar ${user.role === 'admin' ? 'set-avatar-admin' : ''}`}>
          {image ? <img src={image} alt={name}/> : initials}
        </div>
        <div className="set-avatar-info">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={onFileChange}
            style={{ display: 'none' }}
          />
          <div className="set-avatar-buttons">
            <button type="button" className="set-avatar-upload" onClick={onPickFile} disabled={uploading}>
              {uploading
                ? <><IconLoader size={13} className="spin"/> Đang upload...</>
                : <><IconUpload size={13}/> {image ? 'Đổi ảnh' : 'Chọn ảnh'}</>}
            </button>
            {image && (
              <button type="button" className="set-avatar-remove" onClick={removeImage}>
                <IconClose size={13}/> Gỡ ảnh
              </button>
            )}
          </div>
          <small>JPG, PNG, WebP, GIF · tối đa 5MB · sẽ vuông tròn tự động</small>
        </div>
      </div>

      <div className="set-grid-2">
        <label>
          <span>Họ tên</span>
          <input type="text" value={name} onChange={e => setName(e.target.value)} required/>
        </label>
        <label>
          <span>Email</span>
          <input type="email" value={user.email} disabled/>
        </label>
        <label>
          <span>Số điện thoại</span>
          <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="0901234567"/>
        </label>
        <label>
          <span>Chức danh</span>
          <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="VD: Telesale Senior"/>
        </label>
      </div>

      <div className="set-readonly-row">
        <div>
          <span className="set-rolabel">Vai trò</span>
          <span className={`set-role-pill set-role-${user.role}`}>{user.role === 'admin' ? 'Admin' : 'Staff'}</span>
        </div>
        <div>
          <span className="set-rolabel">Tham gia</span>
          <span className="set-rovalue">{new Date(user.created_at).toLocaleDateString('vi-VN')}</span>
        </div>
      </div>

      {msg && <div className="set-success"><IconCheck size={14}/> {msg}</div>}
      {err && <div className="set-error"><IconAlert size={14}/> {err}</div>}

      <div className="set-actions">
        <button type="submit" className="set-save" disabled={saving}>
          {saving ? <><IconLoader size={14} className="spin"/> Đang lưu...</> : 'Lưu thay đổi'}
        </button>
      </div>
    </form>
  );
}

// ── SECURITY ──────────────────────────────────────────────────
function SecurityTab({ user }) {
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);

  const valid = newPwd.length >= 6 && newPwd === confirm;

  const onSubmit = async (e) => {
    e.preventDefault();
    setErr(null); setMsg(null);
    if (!valid) return setErr('Mật khẩu mới ≥ 6 ký tự và phải khớp');
    setSaving(true);
    try {
      // Verify old password by re-signing in
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: user.email, password: oldPwd
      });
      if (signErr) throw new Error('Mật khẩu hiện tại không đúng');

      // Update password via Supabase
      const { error: updErr } = await supabase.auth.updateUser({ password: newPwd });
      if (updErr) throw updErr;

      setMsg('Đã đổi mật khẩu thành công. Lần đăng nhập tiếp theo dùng mật khẩu mới.');
      setOldPwd(''); setNewPwd(''); setConfirm('');
    } catch (e) {
      setErr(e.message);
    } finally { setSaving(false); }
  };

  return (
    <form onSubmit={onSubmit} className="set-form">
      <h3>Đổi mật khẩu</h3>
      <p className="set-desc">Mật khẩu được quản lý bởi Supabase Auth — đảm bảo độ dài ≥ 6 ký tự.</p>

      <label>
        <span>Mật khẩu hiện tại</span>
        <input type="password" value={oldPwd} onChange={e => setOldPwd(e.target.value)} required autoComplete="current-password"/>
      </label>

      <label>
        <span>Mật khẩu mới</span>
        <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} required autoComplete="new-password" minLength={6}/>
      </label>

      <label>
        <span>Xác nhận mật khẩu mới</span>
        <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password"/>
        {confirm && (
          <div className={`set-pwd-hint ${newPwd === confirm ? 'ok' : 'err'}`}>
            {newPwd === confirm ? <IconCheck size={11}/> : <IconAlert size={11}/>}
            {newPwd === confirm ? 'Khớp' : 'Không khớp'}
          </div>
        )}
      </label>

      {msg && <div className="set-success"><IconCheck size={14}/> {msg}</div>}
      {err && <div className="set-error"><IconAlert size={14}/> {err}</div>}

      <div className="set-actions">
        <button type="submit" className="set-save" disabled={saving || !valid || !oldPwd}>
          {saving ? <><IconLoader size={14} className="spin"/> Đang đổi...</> : 'Đổi mật khẩu'}
        </button>
      </div>
    </form>
  );
}

// ── PERMISSIONS (read-only for current user) ──────────────────
function PermissionsTab({ user, isAdmin }) {
  return (
    <div className="set-form">
      <h3>Quyền truy cập của bạn</h3>
      {isAdmin ? (
        <div className="set-perm-admin-banner">
          <IconCheck size={16}/>
          <div>
            <b>Bạn là Admin</b>
            <p>Có toàn bộ quyền truy cập tới mọi tính năng của hệ thống.</p>
          </div>
        </div>
      ) : (
        <p className="set-desc">
          Quyền truy cập do <b>Admin</b> cấp. Liên hệ Admin nếu cần thay đổi.
        </p>
      )}

      {!isAdmin && PERMISSIONS.map(group => (
        <div key={group.group} className="set-perm-group">
          <h4>{group.group}</h4>
          <div className="set-perm-list">
            {group.items.map(item => {
              const granted = !!user.permissions?.[item.key];
              return (
                <div key={item.key} className={`set-perm-item ${granted ? 'granted' : ''}`}>
                  <div className={`set-perm-mark ${granted ? 'on' : 'off'}`}>
                    {granted ? <IconCheck size={12}/> : <IconAlert size={11}/>}
                  </div>
                  <div>
                    <b>{item.label}</b>
                    <small>{item.desc}</small>
                  </div>
                  <span className={`set-perm-badge ${granted ? 'on' : 'off'}`}>
                    {granted ? 'Có quyền' : 'Chưa có'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
