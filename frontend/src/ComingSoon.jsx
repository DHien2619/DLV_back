import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { IconChartLine, IconCompliance, IconCustomers, IconHistory, IconMemory, IconMoney, IconWarning } from './icons';

const FEATURES = {
  '/skills/quality':   { icon: '', title: 'Quality Assessor',    desc: 'Pharma rubric 9 tiêu chí với evidence-backed scoring.', status: 'Đã có trong pipeline. Trang dashboard riêng đang build.' },
  '/skills/opportunity': { icon: '💰', title: 'Opportunity Scout',   desc: 'Sales signals, objections, estimated value, NBA.',    status: 'Đã có trong pipeline. Trang dashboard riêng đang build.' },
  '/skills/compliance':  { icon: '⚠️', title: 'Compliance Guardian', desc: 'Phát hiện adverse event, off-label, guarantee cure.',  status: 'Đã có trong pipeline. Trang dashboard riêng đang build.' },
  '/skills/memory':      { icon: '', title: 'Memory Agent',        desc: 'Fact store + RAG + conflict detection.',               status: 'Đã chạy trong Customer 360. Admin view đang build.' },
  '/dashboard-v2':       { icon: '', title: 'Dashboard tổng',      desc: 'Team leaderboard, trends, compliance queue.',          status: 'Sẽ build trong Sprint 4.' },
  '/coach':              { icon: '🎓', title: 'Coach Agent',         desc: 'Weekly feedback actionable cho từng rep.',             status: 'Sẽ build trong Sprint 4.' },
  '/compliance-queue':   { icon: '', title: 'Compliance Queue',    desc: 'Hàng đợi events RED/ORANGE cho compliance officer.',   status: 'Sẽ build trong Sprint 4.' },
  '/my/calls':           { icon: '', title: 'Cuộc gọi của tôi',    desc: 'Lịch sử call cá nhân + scorecard rep.',                status: 'Sẽ build trong Sprint 4.' },
  '/my/drafts':          { icon: '📝', title: 'Ghi chú',             desc: 'Notes / reminders / follow-up.',                       status: 'Sẽ build trong Sprint 4.' }
};

export default function ComingSoon() {
  const location = useLocation();
  const info = FEATURES[location.pathname] || { icon: '🚧', title: 'Đang xây dựng', desc: location.pathname, status: 'Coming soon.' };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: 'calc(100vh - 200px)', padding: 40, textAlign: 'center'
    }}>
      <div style={{
        fontSize: 64, marginBottom: 20,
        width: 120, height: 120, borderRadius: 32,
        background: 'linear-gradient(135deg, #fff1f1, #ffe0e0)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 8px 24px rgba(220, 38, 38, .12)'
      }}>{info.icon}</div>
      <h1 style={{ margin: '0 0 10px', fontSize: 28, fontWeight: 800 }}>{info.title}</h1>
      <p style={{ color: '#64748b', fontSize: 15, margin: '0 0 6px', maxWidth: 520 }}>{info.desc}</p>
      <div style={{
        marginTop: 20, padding: '10px 20px',
        background: 'var(--primary-soft, #fff1f1)',
        border: '1px solid #ffc6c6',
        borderRadius: 999,
        color: 'var(--primary, #dc2626)',
        fontSize: 13, fontWeight: 600
      }}>🚧 {info.status}</div>
      <div style={{ marginTop: 32, display: 'flex', gap: 12 }}>
        <Link to="/" style={{
          padding: '10px 20px', borderRadius: 10,
          background: 'var(--primary-gradient, linear-gradient(135deg, #ef4444, #b91c1c))',
          color: 'white', textDecoration: 'none', fontWeight: 600, fontSize: 13,
          boxShadow: 'var(--shadow-red, 0 8px 24px rgba(220, 38, 38, .25))'
        }}>🎙️ Phân tích cuộc gọi</Link>
        <Link to="/customers" style={{
          padding: '10px 20px', borderRadius: 10,
          background: 'white', color: '#475569',
          border: '1px solid #e2e8f0', textDecoration: 'none',
          fontWeight: 600, fontSize: 13
        }}><IconCustomers size={16}/> Khách hàng</Link>
      </div>
    </div>
  );
}
