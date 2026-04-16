import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import FilterBar, { filtersToQuery } from './FilterBar';
import './CallHistory.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const fmtDate = (s) => s ? new Date(s).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const fmtDur = (s) => { if (!s) return '—'; const m = Math.floor(s/60); return `${m}:${String(Math.floor(s%60)).padStart(2,'0')}`; };
const gradeColor = (g) => ({ A:'#16a34a', B:'#65a30d', C:'#eab308', D:'#f97316', F:'#dc2626' }[g] || '#94a3b8');

const PAGE_SIZE = 50;

export default function CallHistory() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState({ preset: 'month' });
  const [compFilter, setCompFilter] = useState('any');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [data, setData] = useState({ total: 0, items: [] });
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams(filtersToQuery(filter));
    params.set('limit', PAGE_SIZE);
    params.set('offset', offset);
    if (compFilter !== 'any') params.set('compliance', compFilter);
    if (search) params.set('search', search);
    const res = await fetch(`${API_URL}/api/v2/calls/history?${params.toString()}`);
    const j = await res.json();
    setData(j);
    setLoading(false);
  }, [filter, offset, compFilter, search]);

  useEffect(() => { load(); }, [load]);
  // reset offset when filter changes
  useEffect(() => { setOffset(0); }, [filter, compFilter, search]);

  const onSearch = (e) => { e.preventDefault(); setSearch(searchInput); };

  const totalPages = Math.ceil(data.total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div className="hist-root">
      <div className="hist-header">
        <div>
          <h1>📂 Lịch sử phân tích</h1>
          <p>{data.total} cuộc gọi {filter.customerName && <>của <b>{filter.customerName}</b></>}</p>
        </div>
        <form onSubmit={onSearch} className="hist-search">
          <input
            placeholder="Tìm trong transcript…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <button type="submit">🔍</button>
          {search && <button type="button" onClick={() => { setSearch(''); setSearchInput(''); }} className="hist-clear">✕</button>}
        </form>
      </div>

      <FilterBar value={filter} onChange={setFilter} extra={
        <div className="hist-comp-filter">
          <span className="fb-label">⚠️ Compliance</span>
          {[
            { k: 'any', label: 'Tất cả' },
            { k: 'clean', label: 'Sạch' },
            { k: 'yellow', label: 'Vàng' },
            { k: 'orange', label: 'Cam' },
            { k: 'red', label: 'Đỏ' }
          ].map(f => (
            <button key={f.k}
              className={`fb-preset ${compFilter === f.k ? 'active' : ''} ${f.k === 'red' && compFilter === 'red' ? 'fb-danger' : ''}`}
              onClick={() => setCompFilter(f.k)}
            >{f.label}</button>
          ))}
        </div>
      } />

      {loading ? (
        <div className="hist-loading">Đang tải…</div>
      ) : data.items.length === 0 ? (
        <div className="hist-empty">
          <div className="hist-empty-icon">📂</div>
          <p>Không có cuộc gọi nào khớp bộ lọc.</p>
        </div>
      ) : (
        <>
          <div className="hist-table">
            <div className="hist-row hist-row-head">
              <span>Thời gian</span>
              <span>Khách hàng</span>
              <span>Tóm tắt</span>
              <span>Q</span>
              <span>Opp</span>
              <span>Compl</span>
              <span>Thời lượng</span>
            </div>
            {data.items.map(c => (
              <div key={c.id} className="hist-row" onClick={() => navigate(`/call/${c.id}`)}>
                <span className="hist-time">
                  <b>{new Date(c.created_at).toLocaleDateString('vi-VN')}</b>
                  <small>{new Date(c.created_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</small>
                </span>
                <span className="hist-cust">
                  {c.customer ? (
                    <>
                      <b>{c.customer.name}</b>
                      {c.customer.phone && <small>{c.customer.phone}</small>}
                    </>
                  ) : <small>❓ Chưa xác định</small>}
                </span>
                <span className="hist-summ">
                  {c.summary || <small>—</small>}
                </span>
                <span className="hist-chip-col">
                  {c.quality_score != null && (
                    <span className="hist-grade" style={{ background: gradeColor(c.quality_grade) }}>
                      {c.quality_grade || '?'} · {c.quality_score}
                    </span>
                  )}
                </span>
                <span className="hist-chip-col">
                  {c.opportunity_score != null && (
                    <span className={`hist-opp hist-stage-${c.opportunity_stage}`}>
                      {c.opportunity_score}
                    </span>
                  )}
                </span>
                <span className="hist-chip-col">
                  {c.compliance_status && c.compliance_status !== 'clean' ? (
                    <span className={`hist-sev hist-sev-${c.compliance_status}`}>
                      {c.compliance_status.toUpperCase()}
                      {c.compliance_events_count > 0 && ` ·${c.compliance_events_count}`}
                    </span>
                  ) : (
                    <span className="hist-sev hist-sev-clean">✓</span>
                  )}
                </span>
                <span className="hist-dur">{fmtDur(c.duration_sec)}</span>
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="hist-pager">
              <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>← Trước</button>
              <span>Trang {currentPage} / {totalPages}</span>
              <button disabled={currentPage >= totalPages} onClick={() => setOffset(offset + PAGE_SIZE)}>Sau →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
