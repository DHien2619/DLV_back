import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import './CustomerHub.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const fmtVND = (v) => new Intl.NumberFormat('vi-VN').format(v || 0) + 'đ';
const fmtDate = (s) => s ? new Date(s).toLocaleString('vi-VN') : '—';

// ====================== CUSTOMER LIST ======================
export function CustomerList() {
  const [items, setItems] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', code: '', source: 'hotline' });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/v2/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      setItems(await res.json());
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const createCustomer = async (e) => {
    e.preventDefault();
    if (!form.name) return;
    const res = await fetch(`${API_URL}/api/v2/customers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form)
    });
    if (res.ok) {
      setForm({ name: '', phone: '', code: '', source: 'hotline' });
      setCreating(false);
      load();
    }
  };

  return (
    <div className="ch-root">
      <div className="ch-header">
        <h1>Khách hàng</h1>
        <div className="ch-header-actions">
          <input
            placeholder="Tìm theo tên / SĐT / mã..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
          <button onClick={load}>Tìm</button>
          <button className="ch-btn-primary" onClick={() => setCreating(!creating)}>
            {creating ? '✕ Huỷ' : '+ KH mới'}
          </button>
        </div>
      </div>

      {creating && (
        <form className="ch-create-form" onSubmit={createCustomer}>
          <input placeholder="Họ tên *" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input placeholder="SĐT" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input placeholder="Mã KH (Odoo partner id...)" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
          <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
            <option value="hotline">Hotline</option>
            <option value="facebook">Facebook</option>
            <option value="referral">Giới thiệu</option>
            <option value="walk-in">Walk-in</option>
            <option value="other">Khác</option>
          </select>
          <button type="submit" className="ch-btn-primary">Tạo</button>
        </form>
      )}

      {loading ? (
        <p className="ch-loading">Đang tải…</p>
      ) : items.length === 0 ? (
        <div className="ch-empty">
          <p>Chưa có khách hàng nào. Tạo mới hoặc phân tích cuộc gọi để tự động match.</p>
        </div>
      ) : (
        <div className="ch-table">
          <div className="ch-row ch-row-head">
            <span>Tên</span><span>SĐT</span><span>Mã</span><span>Nguồn</span>
            <span>LTV</span><span>Risk</span><span>Cập nhật</span>
          </div>
          {items.map(c => (
            <Link key={c.id} to={`/customers/${c.id}`} className="ch-row ch-row-item">
              <span><b>{c.name}</b></span>
              <span>{c.phone || '—'}</span>
              <span>{c.code || '—'}</span>
              <span>{c.source || '—'}</span>
              <span>{fmtVND(c.lifetime_value_vnd)}</span>
              <span className={`ch-risk ${c.churn_risk > 0.5 ? 'high' : 'low'}`}>
                {c.churn_risk ? (c.churn_risk * 100).toFixed(0) + '%' : '—'}
              </span>
              <span className="ch-small">{fmtDate(c.updated_at)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ====================== CUSTOMER 360 ======================
export function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/v2/customers/${id}`);
        if (res.ok) setData(await res.json());
      } finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return <div className="ch-root"><p className="ch-loading">Đang tải…</p></div>;
  if (!data) return <div className="ch-root"><p>Không tìm thấy KH</p></div>;

  const { customer, calls, memory, opportunities } = data;

  // Group memory by type
  const byType = memory.reduce((acc, m) => {
    (acc[m.fact_type] = acc[m.fact_type] || []).push(m);
    return acc;
  }, {});

  const typeLabels = {
    condition: '🏥 Tình trạng sức khỏe',
    medication: '💊 Thuốc đã/đang dùng',
    allergy: '⚠️ Dị ứng',
    preference: '🧭 Sở thích & phong cách quyết định',
    goal: '🎯 Mục tiêu',
    family: '👨‍👩‍👧 Gia đình',
    purchase: '🛒 Đã mua',
    contact: '📞 Thông tin liên lạc',
    lifestyle: '🏃 Lối sống'
  };

  return (
    <div className="ch-root">
      <div className="ch-360-header">
        <div>
          <h1>{customer.name}</h1>
          <p className="ch-sub">
            {customer.phone && <span>📞 {customer.phone}</span>}
            {customer.code && <span>🔖 {customer.code}</span>}
            {customer.source && <span>📍 {customer.source}</span>}
            {customer.age && <span>🎂 {customer.age}</span>}
          </p>
        </div>
        <div className="ch-360-stats">
          <div><small>LTV</small><b>{fmtVND(customer.lifetime_value_vnd)}</b></div>
          <div><small>Calls</small><b>{calls.length}</b></div>
          <div><small>Churn</small><b>{customer.churn_risk ? (customer.churn_risk * 100).toFixed(0) + '%' : '—'}</b></div>
        </div>
      </div>

      {customer.next_best_action && (
        <div className="ch-nba">
          <h4>🎯 Next Best Action</h4>
          <p>{customer.next_best_action}</p>
        </div>
      )}

      <div className="ch-360-grid">
        {/* LEFT: Memory facts */}
        <section className="ch-card">
          <h2>🧠 Kiến thức về KH (Memory)</h2>
          <p className="ch-card-sub">Agent dùng để phân tích call mới. Cập nhật tự động sau mỗi cuộc gọi.</p>
          {Object.keys(byType).length === 0 ? (
            <p className="ch-empty-inline">Chưa có memory. Chạy phân tích 1 cuộc gọi → Agent sẽ học.</p>
          ) : (
            Object.entries(byType).map(([type, facts]) => (
              <div key={type} className="ch-mem-group">
                <h3>{typeLabels[type] || type}</h3>
                {facts.map(f => (
                  <div key={f.id} className="ch-fact">
                    <div className="ch-fact-head">
                      <b>{f.fact_value?.label || f.fact_key}</b>
                      <span className="ch-confidence">conf {Math.round((f.confidence || 0) * 100)}%</span>
                    </div>
                    {f.fact_value?.detail && <div className="ch-fact-detail">{f.fact_value.detail}</div>}
                    <div className="ch-fact-meta">
                      {f.fact_value?.severity && <span className={`ch-sev ${f.fact_value.severity}`}>{f.fact_value.severity}</span>}
                      {f.fact_value?.duration && <span>⏱ {f.fact_value.duration}</span>}
                      {f.fact_value?.effectiveness && <span>📊 {f.fact_value.effectiveness}</span>}
                      {f.fact_value?.amount_vnd && <span>💵 {fmtVND(f.fact_value.amount_vnd)}</span>}
                    </div>
                    {f.source_quote && (
                      <div className="ch-fact-src">"{f.source_quote}"</div>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </section>

        {/* MIDDLE: Call timeline */}
        <section className="ch-card">
          <h2>📞 Lịch sử cuộc gọi</h2>
          {calls.length === 0 ? (
            <p className="ch-empty-inline">Chưa có cuộc gọi nào.</p>
          ) : (
            <div className="ch-timeline">
              {calls.map(c => {
                const summ = c.insights?.structure?.summary_short || '—';
                return (
                  <div key={c.id} className="ch-call-item" onClick={() => navigate(`/call/${c.id}`)}>
                    <div className="ch-call-head">
                      <span className="ch-call-date">{fmtDate(c.created_at)}</span>
                      {c.compliance_status && c.compliance_status !== 'clean' && (
                        <span className={`ch-compliance-badge sev-${c.compliance_status}`}>
                          {c.compliance_status.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="ch-call-scores">
                      <span>Q: <b>{c.total_quality_score || '—'}</b>/100</span>
                      <span>Opp: <b>{c.opportunity_score || '—'}</b>/100</span>
                    </div>
                    <p className="ch-call-summary">{summ}</p>
                    {c.audio_filename && <small>📎 {c.audio_filename}</small>}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* RIGHT: Opportunities */}
        <section className="ch-card">
          <h2>💰 Opportunities</h2>
          {opportunities.length === 0 ? (
            <p className="ch-empty-inline">Chưa có opportunity.</p>
          ) : (
            <div className="ch-opps">
              {opportunities.map(o => (
                <div key={o.id} className={`ch-opp stage-${o.stage}`}>
                  <div className="ch-opp-head">
                    <b>{o.product_hint || 'SP chưa rõ'}</b>
                    <span className="ch-opp-stage">{o.stage}</span>
                  </div>
                  <div className="ch-opp-meta">
                    {o.estimated_value_vnd ? <span>{fmtVND(o.estimated_value_vnd)}</span> : null}
                    {o.score ? <span>Score {o.score}</span> : null}
                    {o.due_date ? <span>⏳ {new Date(o.due_date).toLocaleDateString('vi-VN')}</span> : null}
                  </div>
                  {o.next_action && <p className="ch-opp-action">{o.next_action}</p>}
                  {o.outcome && <small className={`ch-opp-outcome ${o.outcome}`}>{o.outcome}</small>}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

    </div>
  );
}
