import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAnalysis } from './AnalysisContext';
import { IconLoader, IconCheck, IconAlert, IconClose } from './icons';

// Floating pill(s) shown on every tab (except the relevant workspace) so an
// in-progress analysis stays visible and clickable while the user works
// elsewhere. Reads global state from AnalysisContext, so it survives
// navigation. Two independent jobs:
//   - single call (CallWorkspace, /analyze)
//   - batch upload (CallAnalyzer, /home)

const BG = {
  running: 'linear-gradient(135deg,#4f46e5,#6366f1)',
  done:    'linear-gradient(135deg,#059669,#10b981)',
  error:   'linear-gradient(135deg,#b91c1c,#dc2626)',
};

function Pill({ mode, title, sub, onOpen, onDismiss }) {
  return (
    <div
      onClick={onOpen}
      role="button"
      title="Mở lại phân tích"
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', borderRadius: 12, cursor: 'pointer',
        boxShadow: '0 8px 28px rgba(0,0,0,.18)', maxWidth: 360,
        color: '#fff', fontSize: 13.5, fontWeight: 600,
        border: '1px solid rgba(255,255,255,.18)', background: BG[mode],
      }}
    >
      {mode === 'running' && <IconLoader size={18} className="spin" />}
      {mode === 'done' && <IconCheck size={18} />}
      {mode === 'error' && <IconAlert size={18} />}
      <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.3, flex: 1, minWidth: 0 }}>
        <span>{title}</span>
        <small style={{ fontWeight: 500, opacity: .9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {sub}
        </small>
      </div>
      {onDismiss && (
        <button
          onClick={(e) => { e.stopPropagation(); onDismiss(); }}
          title="Ẩn"
          style={{
            background: 'rgba(255,255,255,.2)', border: 0, color: '#fff',
            borderRadius: 8, width: 24, height: 24, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}
        >
          <IconClose size={13} />
        </button>
      )}
    </div>
  );
}

export default function GlobalAnalysisIndicator() {
  const {
    analyzing, analysis, error, customer, resultSeen, markResultSeen,
    batchItems, batchRunning, batchResultSeen, markBatchSeen,
  } = useAnalysis();
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  if (path === '/login' || path === '/register') return null;

  const jobs = [];

  // --- single call (workspace) ---
  if (path !== '/' && path !== '/analyze') {
    const cust = customer?.name ? ` · ${customer.name}` : '';
    if (analyzing) {
      jobs.push({ key: 'single', mode: 'running', title: 'Đang phân tích cuộc gọi…', sub: `Nhấn để mở lại${cust}`, to: '/analyze' });
    } else if (error && !resultSeen) {
      jobs.push({ key: 'single', mode: 'error', title: 'Phân tích gặp lỗi', sub: (error || '').slice(0, 70), to: '/analyze', dismiss: markResultSeen });
    } else if (analysis && !resultSeen) {
      jobs.push({ key: 'single', mode: 'done', title: 'Phân tích xong — Xem kết quả', sub: `Nhấn để mở lại${cust}`, to: '/analyze', dismiss: markResultSeen });
    }
  }

  // --- batch upload (/home) ---
  if (path !== '/home') {
    const total = batchItems.length;
    const done = batchItems.filter(i => i.status === 'done').length;
    const failed = batchItems.filter(i => i.status === 'failed').length;
    if (batchRunning) {
      jobs.push({ key: 'batch', mode: 'running', title: `Đang phân tích ${done}/${total} file…`, sub: 'Nhấn để mở lại', to: '/home' });
    } else if (total > 0 && !batchResultSeen) {
      jobs.push({
        key: 'batch', mode: failed ? 'error' : 'done',
        title: `Phân tích xong ${done}/${total} file`,
        sub: failed ? `${failed} lỗi · Nhấn để xem` : 'Nhấn để xem',
        to: '/home', dismiss: markBatchSeen,
      });
    }
  }

  if (jobs.length === 0) return null;

  return (
    <div style={{ position: 'fixed', right: 20, bottom: 20, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {jobs.map(j => (
        <Pill
          key={j.key}
          mode={j.mode}
          title={j.title}
          sub={j.sub}
          onOpen={() => navigate(j.to)}
          onDismiss={j.dismiss}
        />
      ))}
    </div>
  );
}
