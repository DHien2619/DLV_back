import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './TodayDashboard.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const fmtVND = (v) => v ? new Intl.NumberFormat('vi-VN').format(v) + 'đ' : '—';
const fmtTime = (s) => new Date(s).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
const greeting = () => {
  const h = new Date().getHours();
  if (h < 11) return 'Chào buổi sáng';
  if (h < 14) return 'Chào buổi trưa';
  if (h < 18) return 'Chào buổi chiều';
  return 'Chào buổi tối';
};

export default function TodayDashboard({ onUploadClick }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const userId = user?.id || 1;
    fetch(`${API_URL}/api/v2/rep/${userId}/today`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="td-loading">Đang tải dashboard…</div>;
  }
  if (!data) return null;

  const { today_calls = [], week_stats = {}, compliance_alerts = [], hot_opportunities = [] } = data;
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  return (
    <div className="td-root">
      {/* Greeting + quick stats */}
      <div className="td-greeting">
        <div>
          <h1>{greeting()}, {user?.name?.split(' ').slice(-1)[0] || 'bạn'} 👋</h1>
          <p>Hôm nay có <b>{today_calls.length}</b> cuộc gọi.
            {week_stats.red_count > 0 && <span className="td-warn"> ⚠️ {week_stats.red_count} compliance RED tuần này.</span>}
          </p>
        </div>
        <div className="td-greeting-stats">
          <div className="td-stat">
            <small>Tuần này</small>
            <b>{week_stats.calls || 0}</b>
            <span>cuộc gọi</span>
          </div>
          <div className="td-stat">
            <small>Q̄ tuần</small>
            <b className={`td-q-${qualityGrade(week_stats.avg_quality)}`}>{week_stats.avg_quality || '—'}</b>
            <span>/100</span>
          </div>
          <div className="td-stat">
            <small>Opp̄ tuần</small>
            <b>{week_stats.avg_opportunity || '—'}</b>
            <span>/100</span>
          </div>
        </div>
      </div>

      {/* 3-col workspace */}
      <div className="td-grid">
        {/* LEFT: today's calls */}
        <section className="td-card">
          <div className="td-card-head">
            <h2>📞 Cuộc gọi hôm nay</h2>
            <button className="td-upload-btn" onClick={onUploadClick}>
              + Upload mới
            </button>
          </div>
          {today_calls.length === 0 ? (
            <div className="td-empty">
              <div className="td-empty-icon">🎙️</div>
              <p>Chưa có cuộc gọi nào hôm nay. Upload file audio để bắt đầu.</p>
              <button className="btn btn-primary" onClick={onUploadClick}>
                Upload file audio
              </button>
            </div>
          ) : (
            <div className="td-calls">
              {today_calls.map(c => (
                <div key={c.id} className="td-call" onClick={() => navigate(`/call/${c.id}`)}>
                  <div className="td-call-time">{fmtTime(c.created_at)}</div>
                  <div className="td-call-body">
                    <div className="td-call-head">
                      <b>{c.customer?.name || '❓ KH chưa xác định'}</b>
                      {c.customer?.phone && <small>{c.customer.phone}</small>}
                    </div>
                    {c.summary && <p className="td-call-summary">{c.summary}</p>}
                  </div>
                  <div className="td-call-scores">
                    {c.total_quality_score != null && (
                      <span className={`td-chip td-q td-q-${qualityGrade(c.total_quality_score)}`}>
                        Q {c.total_quality_score}
                      </span>
                    )}
                    {c.opportunity_score != null && (
                      <span className="td-chip td-opp">Opp {c.opportunity_score}</span>
                    )}
                    {c.compliance_status && c.compliance_status !== 'clean' && (
                      <span className={`td-chip td-sev td-sev-${c.compliance_status}`}>
                        {c.compliance_status.toUpperCase()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* MIDDLE: compliance alerts */}
        <section className="td-card">
          <div className="td-card-head">
            <h2>⚠️ Cảnh báo tuân thủ</h2>
            <span className="td-badge-count">{compliance_alerts.length}</span>
          </div>
          {compliance_alerts.length === 0 ? (
            <div className="td-empty td-empty-small">
              <div className="td-empty-icon">✅</div>
              <p>Không có cảnh báo chưa review.</p>
            </div>
          ) : (
            <div className="td-alerts">
              {compliance_alerts.map(a => (
                <div key={a.id} className={`td-alert td-alert-${a.severity}`}
                     onClick={() => a.call_id && navigate(`/call/${a.call_id}`)}>
                  <div className="td-alert-head">
                    <span className={`td-sev-badge td-sev-${a.severity}`}>{a.severity.toUpperCase()}</span>
                    <b>{a.event_type}</b>
                  </div>
                  <small>{a.customer?.name || 'KH unknown'}</small>
                  {a.explanation && <p className="td-alert-exp">{a.explanation}</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* RIGHT: hot opportunities */}
        <section className="td-card">
          <div className="td-card-head">
            <h2>💰 Deals nóng</h2>
            <span className="td-badge-count">{hot_opportunities.length}</span>
          </div>
          {hot_opportunities.length === 0 ? (
            <div className="td-empty td-empty-small">
              <div className="td-empty-icon">🎯</div>
              <p>Chưa có opportunity đang hot.</p>
            </div>
          ) : (
            <div className="td-opps">
              {hot_opportunities.map(o => (
                <div key={o.id} className={`td-opp td-opp-${o.stage}`}
                     onClick={() => o.customer_id && navigate(`/customers/${o.customer_id}`)}>
                  <div className="td-opp-head">
                    <b>{o.customer?.name || 'KH'}</b>
                    <span className="td-opp-score">{o.score}/100</span>
                  </div>
                  <div className="td-opp-meta">
                    <span>{o.stage}</span>
                    <span>{fmtVND(o.estimated_value_vnd)}</span>
                  </div>
                  {o.next_action && <p className="td-opp-action">→ {o.next_action}</p>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function qualityGrade(s) {
  if (s == null) return 'unknown';
  if (s >= 90) return 'A';
  if (s >= 75) return 'B';
  if (s >= 60) return 'C';
  if (s >= 40) return 'D';
  return 'F';
}
