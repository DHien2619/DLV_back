import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  IconAnalyze, IconHome, IconHistory, IconCustomers,
  IconQuality, IconOpportunity, IconCompliance, IconMemory,
  IconDashboard, IconCoach, IconComplianceQ,
  IconMyCalls, IconDraft, IconBell, IconSettings, IconSparkles
} from './icons';
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
      { to: '/dashboard-v2',      Icon: IconDashboard,   label: 'Bảng điều khiển' },
      { to: '/coach',             Icon: IconCoach,       label: 'Huấn luyện viên' },
      { to: '/compliance-queue',  Icon: IconComplianceQ, label: 'Hàng đợi tuân thủ' }
    ]
  },
  {
    section: 'Cá nhân',
    items: [
      { to: '/my/calls',  Icon: IconMyCalls, label: 'Cuộc gọi của tôi' },
      { to: '/my/drafts', Icon: IconDraft,   label: 'Ghi chú' }
    ]
  }
];

// Mobile bottom bar — first 2 + FAB + last 2 from workspace group
const MOBILE_LEFT  = NAV[0].items.slice(0, 2);
const MOBILE_RIGHT = NAV[0].items.slice(2, 4);

export default function AppShell({ children }) {
  const location = useLocation();
  const [agentOpen, setAgentOpen] = useState(false);

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
          {NAV.map((group, gi) => (
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
          <div className="shell-user">
            <div className="shell-avatar">HN</div>
            <div>
              <b>Admin</b>
              <small>Quản lý</small>
            </div>
          </div>
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
  return path.replace(/^\//, '').replace(/\//g, ' / ');
}
