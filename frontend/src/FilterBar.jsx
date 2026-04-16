import React, { useState, useEffect, useRef } from 'react';
import './FilterBar.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

const PRESETS = [
  { k: 'today',   label: 'Hôm nay' },
  { k: 'week',    label: '7 ngày' },
  { k: 'month',   label: '30 ngày' },
  { k: 'quarter', label: 'Quý (90d)' },
  { k: 'year',    label: 'Năm' },
  { k: 'all',     label: 'Tất cả' }
];

/**
 * Controlled filter bar.
 * value: { preset, from, to, customerId, customerName }
 * onChange(next)
 * Props:
 *   showCustomer=true
 *   showPreset=true
 */
export default function FilterBar({ value = {}, onChange, showCustomer = true, showPreset = true, extra }) {
  const preset = value.preset || 'week';
  const customerName = value.customerName || '';

  const [custQuery, setCustQuery] = useState('');
  const [custOpen, setCustOpen] = useState(false);
  const [custResults, setCustResults] = useState([]);
  const custTimer = useRef(null);

  useEffect(() => {
    if (!custQuery || custQuery.length < 2) { setCustResults([]); return; }
    clearTimeout(custTimer.current);
    custTimer.current = setTimeout(async () => {
      const res = await fetch(`${API_URL}/api/v2/customers?q=${encodeURIComponent(custQuery)}&limit=8`);
      setCustResults(await res.json());
    }, 250);
    return () => clearTimeout(custTimer.current);
  }, [custQuery]);

  const setPreset = (p) => onChange({ ...value, preset: p, from: null, to: null });
  const setCustomer = (c) => {
    onChange({ ...value, customerId: c?.id || null, customerName: c?.name || '' });
    setCustQuery(''); setCustOpen(false);
  };

  return (
    <div className="fb-root">
      {showPreset && (
        <div className="fb-group">
          <span className="fb-label">📅 Thời gian</span>
          <div className="fb-presets">
            {PRESETS.map(p => (
              <button
                key={p.k}
                className={`fb-preset ${preset === p.k ? 'active' : ''}`}
                onClick={() => setPreset(p.k)}
              >{p.label}</button>
            ))}
          </div>
        </div>
      )}

      {showCustomer && (
        <div className="fb-group">
          <span className="fb-label">👤 Khách hàng</span>
          {value.customerId ? (
            <div className="fb-chip-active">
              <b>{customerName}</b>
              <button onClick={() => setCustomer(null)}>✕</button>
            </div>
          ) : (
            <div className="fb-search">
              <input
                placeholder="Tìm KH (tên / SĐT)…"
                value={custQuery}
                onChange={(e) => { setCustQuery(e.target.value); setCustOpen(true); }}
                onFocus={() => setCustOpen(true)}
                onBlur={() => setTimeout(() => setCustOpen(false), 200)}
              />
              {custOpen && custResults.length > 0 && (
                <div className="fb-dd">
                  {custResults.map(c => (
                    <div key={c.id} className="fb-dd-item" onClick={() => setCustomer(c)}>
                      <b>{c.name}</b>
                      <span>{c.phone || c.code || '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {extra && <div className="fb-extra">{extra}</div>}
    </div>
  );
}

/** Helper to convert filter state → URL query string */
export function filtersToQuery(value) {
  const params = new URLSearchParams();
  if (value.preset) params.set('preset', value.preset);
  if (value.from)   params.set('from', value.from);
  if (value.to)     params.set('to', value.to);
  if (value.customerId) params.set('customerId', value.customerId);
  if (value.repId)      params.set('repId', value.repId);
  return params.toString();
}
