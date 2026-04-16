import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './ComplianceQueue.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const fmtTime = (sec) => { const s = Math.floor(sec||0); return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; };
const fmtDate = (s) => s ? new Date(s).toLocaleString('vi-VN') : '—';

const EVENT_TYPE_LABEL = {
  adverse_event: '⚕️ Adverse event',
  off_label_claim: '📋 Off-label claim',
  guarantee_cure: '✋ Hứa chữa khỏi',
  pregnancy_risk_ignored: '🤰 Bỏ qua rủi ro thai kỳ',
  drug_interaction_missed: '💊 Bỏ qua tương tác thuốc',
  underage_recommendation: '👶 Khuyên cho trẻ em',
  competitor_disparagement: '🥊 Chê bai đối thủ',
  personal_data_leak: '🔓 Lộ dữ liệu KH',
  other: '❓ Khác'
};

export default function ComplianceQueue() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState({ severity: searchParams.get('severity') || '', reviewed: 'false' });
  const [selected, setSelected] = useState(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    const q = new URLSearchParams();
    if (filter.severity) q.set('severity', filter.severity);
    if (filter.reviewed) q.set('reviewed', filter.reviewed);
    fetch(`${API_URL}/api/v2/compliance/events?${q.toString()}`)
      .then(r => r.json())
      .then(data => { setEvents(data || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  const setSeverity = (sev) => {
    setFilter({ ...filter, severity: sev });
    if (sev) setSearchParams({ severity: sev });
    else setSearchParams({});
  };

  const markReviewed = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      const res = await fetch(`${API_URL}/api/v2/compliance/events/${selected.id}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note, reviewerId: user?.id })
      });
      if (res.ok) {
        setSelected(null);
        setNote('');
        load();
      }
    } finally { setSaving(false); }
  };

  const counts = events.reduce((acc, e) => { acc[e.severity] = (acc[e.severity]||0)+1; return acc; }, {});

  return (
    <div className="cq-root">
      <div className="cq-header">
        <div>
          <h1>🛡️ Compliance Queue</h1>
          <p>Hàng đợi review cho compliance officer — {events.length} events</p>
        </div>
      </div>

      {/* Filter bar */}
      <div className="cq-filterbar">
        <div className="cq-filter-group">
          <button className={`cq-filter ${!filter.severity ? 'active' : ''}`} onClick={() => setSeverity('')}>
            Tất cả ({events.length})
          </button>
          <button className={`cq-filter cq-f-red ${filter.severity==='red' ? 'active' : ''}`} onClick={() => setSeverity('red')}>
            🔴 RED {counts.red ? `(${counts.red})` : ''}
          </button>
          <button className={`cq-filter cq-f-orange ${filter.severity==='orange' ? 'active' : ''}`} onClick={() => setSeverity('orange')}>
            🟠 ORANGE {counts.orange ? `(${counts.orange})` : ''}
          </button>
          <button className={`cq-filter cq-f-yellow ${filter.severity==='yellow' ? 'active' : ''}`} onClick={() => setSeverity('yellow')}>
            🟡 YELLOW {counts.yellow ? `(${counts.yellow})` : ''}
          </button>
        </div>
        <div className="cq-filter-group">
          <button className={`cq-filter ${filter.reviewed==='false' ? 'active' : ''}`} onClick={() => setFilter({ ...filter, reviewed: 'false' })}>
            Chưa review
          </button>
          <button className={`cq-filter ${filter.reviewed==='true' ? 'active' : ''}`} onClick={() => setFilter({ ...filter, reviewed: 'true' })}>
            Đã review
          </button>
          <button className={`cq-filter ${filter.reviewed==='' ? 'active' : ''}`} onClick={() => setFilter({ ...filter, reviewed: '' })}>
            Tất cả
          </button>
        </div>
      </div>

      {loading ? (
        <div className="cq-loading">Đang tải…</div>
      ) : events.length === 0 ? (
        <div className="cq-empty">
          <div className="cq-empty-icon">✅</div>
          <h3>Không có event nào</h3>
          <p>Tuân thủ sạch! Không có vi phạm cần review trong bộ lọc này.</p>
        </div>
      ) : (
        <div className="cq-split">
          {/* Left: event list */}
          <div className="cq-list">
            {events.map(e => (
              <div
                key={e.id}
                className={`cq-item cq-item-${e.severity} ${selected?.id === e.id ? 'selected' : ''} ${e.reviewed ? 'reviewed' : ''}`}
                onClick={() => { setSelected(e); setNote(e.review_note || ''); }}
              >
                <div className="cq-item-head">
                  <span className={`cq-sev cq-sev-${e.severity}`}>{e.severity.toUpperCase()}</span>
                  <b>{EVENT_TYPE_LABEL[e.event_type] || e.event_type}</b>
                  {e.reviewed && <span className="cq-reviewed-badge">✓</span>}
                </div>
                <div className="cq-item-meta">
                  <span>👤 {e.customer?.name || 'KH unknown'}</span>
                  {e.call?.created_at && <span>📅 {new Date(e.call.created_at).toLocaleDateString('vi-VN')}</span>}
                  {e.timestamp_sec != null && <span>⏱ {fmtTime(e.timestamp_sec)}</span>}
                </div>
                <div className="cq-item-quote">"{e.quote?.slice(0, 120)}{e.quote?.length > 120 ? '…' : ''}"</div>
              </div>
            ))}
          </div>

          {/* Right: detail panel */}
          <div className="cq-detail">
            {!selected ? (
              <div className="cq-detail-empty">
                <p>← Chọn 1 event để xem chi tiết và review</p>
              </div>
            ) : (
              <>
                <div className="cq-detail-head">
                  <span className={`cq-sev-big cq-sev-${selected.severity}`}>{selected.severity.toUpperCase()}</span>
                  <h2>{EVENT_TYPE_LABEL[selected.event_type] || selected.event_type}</h2>
                </div>

                <div className="cq-detail-meta">
                  <div><small>KH</small><b>{selected.customer?.name || '—'}</b></div>
                  <div><small>Timestamp</small><b>{selected.timestamp_sec != null ? fmtTime(selected.timestamp_sec) : '—'}</b></div>
                  <div><small>Phát hiện</small><b>{fmtDate(selected.created_at)}</b></div>
                  <div><small>Speaker</small><b>{selected.speaker || '—'}</b></div>
                </div>

                <div className="cq-section">
                  <h4>📝 Trích dẫn nguyên văn</h4>
                  <blockquote>"{selected.quote}"</blockquote>
                </div>

                <div className="cq-section">
                  <h4>💡 Lý do vi phạm</h4>
                  <p>{selected.explanation}</p>
                </div>

                <div className="cq-section">
                  <h4>🎯 Khuyến nghị xử lý</h4>
                  <p>{selected.recommended_action}</p>
                </div>

                <div className="cq-actions">
                  {selected.call_id && (
                    <button className="cq-btn-ghost" onClick={() => navigate(`/call/${selected.call_id}`)}>
                      ↗ Xem cuộc gọi đầy đủ
                    </button>
                  )}
                  {selected.customer_id && (
                    <button className="cq-btn-ghost" onClick={() => navigate(`/customers/${selected.customer_id}`)}>
                      👤 Xem KH
                    </button>
                  )}
                </div>

                <div className="cq-review-box">
                  <h4>✍️ Review</h4>
                  {selected.reviewed ? (
                    <div className="cq-reviewed-box">
                      <p>✅ Đã review lúc {fmtDate(selected.reviewed_at)}</p>
                      {selected.review_note && <p className="cq-review-note">{selected.review_note}</p>}
                    </div>
                  ) : (
                    <>
                      <textarea
                        placeholder="Ghi chú review (optional)… VD: đã training lại rep, đã đính chính với KH…"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={3}
                      />
                      <button className="btn btn-primary" onClick={markReviewed} disabled={saving}>
                        {saving ? '⏳ Đang lưu…' : '✅ Đánh dấu đã review'}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
