import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  IconAnalyze, IconHome, IconHistory, IconCustomers,
  IconQuality, IconOpportunity, IconCompliance, IconMemory,
  IconDashboard, IconCoach, IconComplianceQ,
  IconMyCalls, IconDraft, IconBell, IconSettings, IconSparkles, IconBook,
  IconCustomer, IconClose
} from './icons';
import { useAuth } from './AuthContext';
import AgentSheet from './AgentSheet';
import './AppShell.css';

const NAV = [
  {
    section: 'Không gian làm việc',
    items: [
      { to: '/',          Icon: IconAnalyze,   label: 'Phân tích cuộc gọi' },
      { to: '/home',      Icon: IconHome,      label: 'Hôm nay' },
      { to: '/history',   Icon: IconHistory,   label: 'Lịch sử phân tích' },
      { to: '/customers', Icon: IconCustomers, label: 'Khách hàng' }
    ]
  },
  {
    section: 'Kỹ năng AI',
    requirePermission: 'view_skills',
    items: [
      { to: '/skills/quality',     Icon: IconQuality,     label: 'Chấm điểm tư vấn' },
      { to: '/skills/opportunity', Icon: IconOpportunity, label: 'Phát hiện cơ hội' },
      { to: '/skills/compliance',  Icon: IconCompliance,  label: 'Kiểm tra tuân thủ' },
      { to: '/skills/memory',      Icon: IconMemory,      label: 'Trí nhớ AI' }
    ]
  },
  {
    section: 'Quản lý',
    items: [
      { to: '/dashboard-v2',      Icon: IconDashboard,   label: 'Bảng điều khiển',     requirePermission: 'view_dashboard' },
      { to: '/coach',             Icon: IconCoach,       label: 'Huấn luyện viên',     requirePermission: 'coach_team' },
      { to: '/compliance-queue',  Icon: IconComplianceQ, label: 'Hàng đợi tuân thủ',   requirePermission: 'view_compliance_queue' },
      { to: '/admin/users',       Icon: IconCustomer,    label: 'Quản lý người dùng',  requirePermission: 'manage_users' }
    ]
  },
  {
    section: 'Cá nhân',
    items: [
      { to: '/my/calls',  Icon: IconMyCalls, label: 'Cuộc gọi của tôi' },
      { to: '/my/drafts', Icon: IconDraft,   label: 'Ghi chú' },
      { to: '/guide',     Icon: IconBook,    label: 'Hướng dẫn sử dụng' }
    ]
  }
];

// Mobile bottom bar — first 2 + FAB + last 2 from workspace group
const MOBILE_LEFT  = NAV[0].items.slice(0, 2);
const MOBILE_RIGHT = NAV[0].items.slice(2, 4);

export default function AppShell({ children }) {
  const location = useLocation();
  const [agentOpen, setAgentOpen] = useState(false);
  const { user, isAdmin, can, logout } = useAuth();

  // Filter nav groups + items by permission/role
  const visibleNav = NAV
    .map(g => {
      // Filter group by adminOnly OR group-level requirePermission
      if (g.adminOnly && !isAdmin) return null;
      if (g.requirePermission && !can(g.requirePermission)) return null;
      // Filter items by per-item requirePermission
      const items = g.items.filter(it => !it.requirePermission || can(it.requirePermission));
      if (items.length === 0) return null;
      return { ...g, items };
    })
    .filter(Boolean);

  // Generate avatar initials
  const initials = (user?.name || 'U').split(' ').map(s => s[0]).slice(-2).join('').toUpperCase();
  const roleLabel = isAdmin ? 'Admin' : 'Staff';

  return (
    <div className="shell">
      {/* Desktop sidebar */}
      <aside className="shell-sidebar shell-sidebar-desktop">
        <div className="shell-brand">
          <div className="shell-logo">
            <span className="shell-logo-dot" />
            <span className="shell-logo-text">PharmaVoice</span>
          </div>
          <small>Trợ lý phân tích bán hàng</small>
        </div>

        <nav className="shell-nav">
          {visibleNav.map((group, gi) => (
            <div key={gi} className="shell-nav-group">
              <div className="shell-nav-section">{group.section}</div>
              {group.items.map(it => (
                <NavLink key={it.to} to={it.to} end={it.to === '/'}
                  className={({ isActive }) => `shell-nav-item${isActive ? ' active' : ''}`}>
                  <span className="shell-nav-icon"><it.Icon size={17} /></span>
                  <span className="shell-nav-label">{it.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Desktop agent FAB */}
        <button className="shell-agent-fab-desktop" onClick={() => setAgentOpen(!agentOpen)}>
          <IconSparkles size={18} /> Agent AI
        </button>

        <div className="shell-foot">
          <NavLink to="/settings" className="shell-user">
            <div className={`shell-avatar ${isAdmin ? 'shell-avatar-admin' : ''}`}>
              {user?.image ? <img src={user.image} alt={user.name}/> : initials}
            </div>
            <div className="shell-user-info">
              <b>{user?.name || 'Người dùng'}</b>
              <small>
                <span className={`shell-role-badge shell-role-${isAdmin ? 'admin' : 'staff'}`}>{roleLabel}</span>
              </small>
            </div>
            <button
              className="shell-logout-btn"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); logout(); }}
              title="Đăng xuất"
            >
              <IconClose size={14}/>
            </button>
          </NavLink>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="shell-bottom-nav">
        {MOBILE_LEFT.map(it => (
          <NavLink key={it.to} to={it.to} end={it.to === '/'}
            className={({ isActive }) => `sbn-item${isActive ? ' active' : ''}`}>
            <span className="sbn-icon"><it.Icon size={22} /></span>
            <span className="sbn-label">{it.label}</span>
          </NavLink>
        ))}

        {/* Center FAB */}
        <button className={`sbn-fab ${agentOpen ? 'active' : ''}`} onClick={() => setAgentOpen(!agentOpen)}>
          <IconSparkles size={22} />
        </button>

        {MOBILE_RIGHT.map(it => (
          <NavLink key={it.to} to={it.to} end={it.to === '/'}
            className={({ isActive }) => `sbn-item${isActive ? ' active' : ''}`}>
            <span className="sbn-icon"><it.Icon size={22} /></span>
            <span className="sbn-label">{it.label}</span>
          </NavLink>
        ))}
      </nav>

      <main className="shell-main">
        <header className="shell-topbar">
          <div className="shell-crumbs">
            <span>Trang chủ</span>
            {location.pathname !== '/' && <>
              <span className="shell-crumb-sep">/</span>
              <span className="shell-crumb-current">{getCrumb(location.pathname)}</span>
            </>}
          </div>
          <div className="shell-top-actions">
            <button className="shell-icon-btn" title="Thông báo"><IconBell size={16} /></button>
            <button className="shell-icon-btn" title="Cài đặt"><IconSettings size={16} /></button>
          </div>
        </header>

        <div className="shell-content">{children}</div>
      </main>

      {/* Agent Sheet (global) */}
      <AgentSheet isOpen={agentOpen} onToggle={() => setAgentOpen(!agentOpen)} />
    </div>
  );
}

function getCrumb(path) {
  if (path.startsWith('/customers/')) return 'Chi tiết khách hàng';
  if (path === '/customers') return 'Khách hàng';
  if (path.startsWith('/call/')) return 'Chi tiết cuộc gọi';
  if (path === '/analyze') return 'Phân tích cuộc gọi';
  if (path === '/history') return 'Lịch sử phân tích';
  if (path === '/home') return 'Hôm nay';
  if (path.startsWith('/skills/')) return 'Kỹ năng AI';
  if (path === '/dashboard-v2') return 'Bảng điều khiển';
  if (path === '/coach') return 'Huấn luyện viên';
  if (path === '/compliance-queue') return 'Hàng đợi tuân thủ';
  if (path === '/guide') return 'Hướng dẫn sử dụng';
  return path.replace(/^\//, '').replace(/\//g, ' / ');
}
