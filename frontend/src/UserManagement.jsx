import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { PERMISSIONS, PRESET_FULL_ACCESS, PRESET_BASIC, PRESET_TEAM_LEAD } from './permissions';
import { IconCustomer, IconLoader, IconAlert, IconCheck, IconCustomers, IconClose, IconSettings } from './icons';
import './UserManagement.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export default function UserManagement() {
  const { authFetch, user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // user being edited in drawer

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await authFetch(`${API_URL}/api/users`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Lỗi tải');
      setUsers(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [authFetch]);

  useEffect(() => { load(); }, [load]);

  const updateUser = async (id, updates) => {
    const res = await authFetch(`${API_URL}/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Lỗi');
    setUsers(us => us.map(u => u.id === id ? data : u));
    return data;
  };

  const counts = {
    admin: users.filter(u => u.role === 'admin').length,
    staff: users.filter(u => u.role === 'staff').length
  };

  return (
    <div className="um-root">
      <div className="um-header">
        <div className="um-header-icon"><IconCustomers size={22}/></div>
        <div>
          <h1>Quản lý người dùng</h1>
          <p>Phân quyền chi tiết cho từng staff trong tổ chức</p>
        </div>
      </div>

      <div className="um-stats">
        <StatCard label="Tổng số" value={users.length} accent="var(--primary)"/>
        <StatCard label="Admin"   value={counts.admin} accent="#dc2626"/>
        <StatCard label="Staff"   value={counts.staff} accent="var(--success)"/>
      </div>

      {error && (
        <div className="um-error"><IconAlert size={14}/> {error}</div>
      )}

      {loading ? (
        <div className="um-loading"><IconLoader size={18} className="spin"/> Đang tải...</div>
      ) : (
        <div className="um-list">
          {users.map((u, i) => (
            <UserRow
              key={u.id}
              user={u}
              isMe={u.id === me?.id}
              onEdit={() => setEditing(u)}
              onChangeRole={async (role) => {
                try { await updateUser(u.id, { role }); }
                catch (e) { alert(e.message); }
              }}
              first={i === 0}
            />
          ))}
        </div>
      )}

      {editing && (
        <PermissionDrawer
          user={editing}
          isMe={editing.id === me?.id}
          onClose={() => setEditing(null)}
          onSave={async (updates) => {
            try { await updateUser(editing.id, updates); setEditing(null); }
            catch (e) { alert(e.message); }
          }}
        />
      )}
    </div>
  );
}

// ─── Stat card ────────────────────────────────────────────
function StatCard({ label, value, accent }) {
  return (
    <div className="um-stat">
      <div className="um-stat-label">{label}</div>
      <div className="um-stat-value" style={{ color: accent }}>{value}</div>
    </div>
  );
}

// ─── User row ─────────────────────────────────────────────
function UserRow({ user, isMe, onEdit, onChangeRole, first }) {
  const initials = (user.name || 'U').split(' ').map(s => s[0]).slice(-2).join('').toUpperCase();
  const grantedCount = Object.values(user.permissions || {}).filter(Boolean).length;
  const totalPerms = PERMISSIONS.flatMap(g => g.items).length;

  return (
    <div className={`um-row ${first ? 'first' : ''}`}>
      <div className={`um-avatar ${user.role === 'admin' ? 'um-avatar-admin' : ''}`}>
        {user.image ? <img src={user.image} alt={user.name}/> : initials}
      </div>

      <div className="um-info">
        <div className="um-name">
          {user.name}
          {isMe && <span className="um-me-tag">BẠN</span>}
          {user.title && <span className="um-title">· {user.title}</span>}
        </div>
        <div className="um-email">{user.email}</div>
      </div>

      <div className="um-meta">
        <span className={`um-role-pill um-role-${user.role}`}>
          {user.role === 'admin' ? 'Admin' : 'Staff'}
        </span>
        {user.role === 'staff' && (
          <small className="um-perm-count">
            {grantedCount}/{totalPerms} quyền
          </small>
        )}
      </div>

      <div className="um-actions">
        <select
          value={user.role}
          onChange={e => onChangeRole(e.target.value)}
          disabled={isMe}
          className="um-role-select"
        >
          <option value="admin">Admin</option>
          <option value="staff">Staff</option>
        </select>
        <button
          className="um-edit-btn"
          onClick={onEdit}
          disabled={user.role === 'admin'}
          title={user.role === 'admin' ? 'Admin có toàn quyền — không cần cấp riêng' : 'Cấp quyền chi tiết'}
        >
          <IconSettings size={14}/>
          <span>Quyền</span>
        </button>
      </div>
    </div>
  );
}

// ─── Permission Drawer ─────────────────────────────────────
function PermissionDrawer({ user, isMe, onClose, onSave }) {
  const [perms, setPerms] = useState(user.permissions || {});
  const [saving, setSaving] = useState(false);

  const toggle = (key) => setPerms(p => ({ ...p, [key]: !p[key] }));
  const applyPreset = (preset) => setPerms({ ...preset });

  const save = async () => {
    setSaving(true);
    await onSave({ permissions: perms });
    setSaving(false);
  };

  const grantedCount = Object.values(perms).filter(Boolean).length;
  const totalPerms = PERMISSIONS.flatMap(g => g.items).length;

  return (
    <>
      <div className="um-backdrop" onClick={onClose}/>
      <div className="um-drawer">
        <div className="um-drawer-head">
          <div>
            <h3>Phân quyền chi tiết</h3>
            <small>{user.name} · {user.email}</small>
          </div>
          <button className="um-close" onClick={onClose}><IconClose size={18}/></button>
        </div>

        <div className="um-drawer-summary">
          <span>Đã cấp: <b>{grantedCount}/{totalPerms}</b> quyền</span>
        </div>

        <div className="um-presets">
          <small>Áp dụng nhanh:</small>
          <button onClick={() => applyPreset(PRESET_BASIC)}>Cơ bản</button>
          <button onClick={() => applyPreset(PRESET_TEAM_LEAD)}>Team Lead</button>
          <button onClick={() => applyPreset(PRESET_FULL_ACCESS)}>Toàn bộ</button>
        </div>

        <div className="um-perm-body">
          {PERMISSIONS.map(group => (
            <div key={group.group} className="um-perm-group">
              <h4>{group.group}</h4>
              {group.items.map(item => {
                const on = !!perms[item.key];
                return (
                  <label key={item.key} className={`um-perm-row ${on ? 'on' : ''}`}>
                    <div className="um-perm-text">
                      <b>{item.label}</b>
                      <small>{item.desc}</small>
                    </div>
                    <button
                      type="button"
                      className={`um-toggle ${on ? 'on' : ''}`}
                      onClick={() => toggle(item.key)}
                    >
                      <span className="um-toggle-knob"/>
                    </button>
                  </label>
                );
              })}
            </div>
          ))}
        </div>

        <div className="um-drawer-foot">
          <button className="um-cancel" onClick={onClose}>Hủy</button>
          <button className="um-save" onClick={save} disabled={saving}>
            {saving ? <><IconLoader size={14} className="spin"/> Đang lưu...</> : <><IconCheck size={14}/> Lưu thay đổi</>}
          </button>
        </div>
      </div>
    </>
  );
}
