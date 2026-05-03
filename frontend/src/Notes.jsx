import React, { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconAlert, IconAlertTriangle, IconCheck, IconClock, IconClose, IconCustomer, IconEdit, IconFilter, IconMic, IconPhone2, IconPlus, IconSearch, IconStar, IconTrash } from './icons';
import './Notes.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const fmtDate = (s) => s ? new Date(s).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }) : '';
const fmtFull = (s) => s ? new Date(s).toLocaleString('vi-VN') : '—';
const isOverdue = (d) => d && new Date(d) < new Date() ;
const relDate = (d) => {
  if (!d) return '';
  const diff = Math.ceil((new Date(d) - new Date()) / 86400000);
  if (diff < 0) return `Quá hạn ${-diff} ngày`;
  if (diff === 0) return 'Hôm nay';
  if (diff === 1) return 'Ngày mai';
  if (diff <= 7) return `${diff} ngày tới`;
  return fmtDate(d);
};

const TYPE_OPTS  = [
  { k: 'all',      label: 'Tất cả' },
  { k: 'note',     label: 'Ghi chú',  icon: '📝' },
  { k: 'reminder', label: 'Nhắc nhở',  icon: '⏰' },
  { k: 'followup', label: 'Follow-up', icon: '' }
];
const PRIORITY_COLOR = { low: 'var(--ink-400)', medium: 'var(--warning)', high: 'var(--danger)' };
const STATUS_TABS = [
  { k: 'open', label: 'Đang mở' },
  { k: 'done', label: 'Đã xong' },
  { k: 'all',  label: 'Tất cả' }
];

// Customer picker mini
function CustPicker({ value, onChange }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const r = await fetch(`${API_URL}/api/v2/customers?q=${encodeURIComponent(q)}&limit=6`);
      setResults(await r.json());
    }, 200);
    return () => clearTimeout(t);
  }, [q]);
  if (value) return (
    <div className="nt-chip"><IconCustomer size={13}/> {value.name} <button onClick={() => onChange(null)}><IconClose size={11}/></button></div>
  );
  return (
    <div className="nt-cust-pick">
      <input placeholder="Gắn KH (tuỳ chọn)..." value={q} onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 200)} />
      {open && results.length > 0 && (
        <div className="nt-dd">{results.map(c => (
          <div key={c.id} className="nt-dd-item" onClick={() => { onChange(c); setQ(''); setOpen(false); }}>
            <b>{c.name}</b><span>{c.phone||'—'}</span>
          </div>
        ))}</div>
      )}
    </div>
  );
}

// Create/Edit modal
function NoteModal({ note, onSave, onClose }) {
  const isEdit = !!note?.id;
  const [form, setForm] = useState({
    title: note?.title || '',
    body: note?.body || '',
    note_type: note?.note_type || 'note',
    priority: note?.priority || 'medium',
    due_date: note?.due_date ? new Date(note.due_date).toISOString().slice(0, 16) : '',
    customer: note?.customer || null
  });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        body: form.body,
        note_type: form.note_type,
        priority: form.priority,
        due_date: form.due_date || null,
        customer_id: form.customer?.id || null,
        userId: 1
      };
      const url = isEdit ? `${API_URL}/api/v2/notes/${note.id}` : `${API_URL}/api/v2/notes`;
      const method = isEdit ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (res.ok) onSave(await res.json());
    } finally { setSaving(false); }
  };

  return (
    <div className="nt-overlay" onClick={onClose}>
      <form className="nt-modal" onClick={e => e.stopPropagation()} onSubmit={submit}>
        <div className="nt-modal-head">
          <h2>{isEdit ? 'Sửa ghi chú' : 'Ghi chú mới'}</h2>
          <button type="button" className="nt-modal-close" onClick={onClose}><IconClose size={18}/></button>
        </div>

        <div className="nt-form-row">
          <input className="nt-input nt-input-title" placeholder="Tiêu đề *" value={form.title}
            onChange={e => setForm({...form, title: e.target.value})} autoFocus required />
        </div>

        <div className="nt-form-row">
          <textarea className="nt-input" placeholder="Nội dung chi tiết..." rows={4} value={form.body}
            onChange={e => setForm({...form, body: e.target.value})} />
        </div>

        <div className="nt-form-grid">
          <div className="nt-field">
            <label>Loại</label>
            <div className="nt-seg">
              {[{k:'note',l:'📝 Ghi chú'},{k:'reminder',l:'⏰ Nhắc nhở'},{k:'followup',l:' Follow-up'}].map(t => (
                <button key={t.k} type="button" className={form.note_type === t.k ? 'active' : ''}
                  onClick={() => setForm({...form, note_type: t.k})}>{t.l}</button>
              ))}
            </div>
          </div>

          <div className="nt-field">
            <label>Ưu tiên</label>
            <div className="nt-seg">
              {[{k:'low',l:'Thấp'},{k:'medium',l:'Trung bình'},{k:'high',l:' Cao'}].map(p => (
                <button key={p.k} type="button" className={form.priority === p.k ? 'active' : ''}
                  onClick={() => setForm({...form, priority: p.k})}>{p.l}</button>
              ))}
            </div>
          </div>

          <div className="nt-field">
            <label><IconClock size={13}/> Hạn chót</label>
            <input type="datetime-local" className="nt-input" value={form.due_date}
              onChange={e => setForm({...form, due_date: e.target.value})} />
          </div>

          <div className="nt-field">
            <label><IconCustomer size={13}/> Khách hàng</label>
            <CustPicker value={form.customer} onChange={c => setForm({...form, customer: c})} />
          </div>
        </div>

        <div className="nt-modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Huỷ</button>
          <button type="submit" className="btn btn-primary" disabled={saving || !form.title.trim()}>
            {saving ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Tạo ghi chú'}
          </button>
        </div>
      </form>
    </div>
  );
}

// Main
export default function Notes() {
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('open');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(null); // null | 'new' | note object
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (typeFilter !== 'all') params.set('type', typeFilter);
    const res = await fetch(`${API_URL}/api/v2/notes?${params.toString()}`);
    const json = await res.json();
    setNotes(Array.isArray(json) ? json : []);
    setLoading(false);
  }, [statusFilter, typeFilter]);

  useEffect(() => { load(); }, [load]);

  const onSave = () => { setModal(null); load(); };

  const toggleDone = async (id) => {
    await fetch(`${API_URL}/api/v2/notes/${id}/toggle`, { method: 'POST' });
    load();
  };

  const deleteNote = async (id) => {
    if (!confirm('Xoá ghi chú này?')) return;
    await fetch(`${API_URL}/api/v2/notes/${id}`, { method: 'DELETE' });
    load();
  };

  const filtered = search
    ? notes.filter(n => n.title.toLowerCase().includes(search.toLowerCase()) || (n.body||'').toLowerCase().includes(search.toLowerCase()))
    : notes;

  const overdue = filtered.filter(n => n.status === 'open' && isOverdue(n.due_date));
  const today = filtered.filter(n => {
    if (!n.due_date || n.status !== 'open' || isOverdue(n.due_date)) return false;
    const d = new Date(n.due_date);
    const now = new Date();
    return d.toDateString() === now.toDateString();
  });
  const rest = filtered.filter(n => !overdue.includes(n) && !today.includes(n));

  return (
    <div className="nt-root">
      <div className="nt-header">
        <div>
          <h1>Ghi chú</h1>
          <p>{notes.length} ghi chú · {overdue.length > 0 ? <span className="nt-overdue-count">{overdue.length} quá hạn</span> : 'Không có quá hạn'}</p>
        </div>
        <div className="nt-header-actions">
          <div className="nt-search">
            <IconSearch size={14} />
            <input placeholder="Tìm..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={() => setModal('new')}>
            <IconPlus size={15} /> Ghi chú mới
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="nt-filters">
        <div className="nt-tabs">
          {STATUS_TABS.map(t => (
            <button key={t.k} className={`nt-tab ${statusFilter === t.k ? 'active' : ''}`}
              onClick={() => setStatusFilter(t.k)}>{t.label}</button>
          ))}
        </div>
        <div className="nt-tabs nt-type-tabs">
          {TYPE_OPTS.map(t => (
            <button key={t.k} className={`nt-tab ${typeFilter === t.k ? 'active' : ''}`}
              onClick={() => setTypeFilter(t.k)}>{t.icon ? `${t.icon} ` : ''}{t.label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="nt-loading">Đang tải…</div>
      ) : filtered.length === 0 ? (
        <div className="nt-empty">
          <div className="nt-empty-icon"><IconEdit size={40} strokeWidth={1.2}/></div>
          <h3>Chưa có ghi chú nào</h3>
          <p>Tạo ghi chú, nhắc nhở, hoặc follow-up để theo dõi công việc.</p>
          <button className="btn btn-primary" onClick={() => setModal('new')}>
            <IconPlus size={15}/> Tạo ghi chú đầu tiên
          </button>
        </div>
      ) : (
        <div className="nt-list">
          {/* Overdue section */}
          {overdue.length > 0 && (
            <div className="nt-section">
              <div className="nt-section-head nt-section-overdue">
                <IconAlert size={14}/> Quá hạn ({overdue.length})
              </div>
              {overdue.map(n => <NoteCard key={n.id} note={n} onToggle={toggleDone} onEdit={() => setModal(n)} onDelete={deleteNote} navigate={navigate} />)}
            </div>
          )}

          {/* Today section */}
          {today.length > 0 && (
            <div className="nt-section">
              <div className="nt-section-head nt-section-today">
                <IconClock size={14}/> Hôm nay ({today.length})
              </div>
              {today.map(n => <NoteCard key={n.id} note={n} onToggle={toggleDone} onEdit={() => setModal(n)} onDelete={deleteNote} navigate={navigate} />)}
            </div>
          )}

          {/* Rest */}
          <div className="nt-section">
            {(overdue.length > 0 || today.length > 0) && rest.length > 0 && (
              <div className="nt-section-head">Khác ({rest.length})</div>
            )}
            {rest.map(n => <NoteCard key={n.id} note={n} onToggle={toggleDone} onEdit={() => setModal(n)} onDelete={deleteNote} navigate={navigate} />)}
          </div>
        </div>
      )}

      {/* Modal */}
      {modal && (
        <NoteModal
          note={modal === 'new' ? null : modal}
          onSave={onSave}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function NoteCard({ note, onToggle, onEdit, onDelete, navigate }) {
  const n = note;
  const typeIcon = { note: '📝', reminder: '⏰', followup: '' }[n.note_type] || '📝';
  const overdue = n.status === 'open' && isOverdue(n.due_date);

  return (
    <div className={`nt-card ${n.status === 'done' ? 'done' : ''} ${overdue ? 'overdue' : ''} prio-${n.priority}`}>
      <button className={`nt-check ${n.status === 'done' ? 'checked' : ''}`} onClick={() => onToggle(n.id)}>
        {n.status === 'done' ? <IconCheck size={14}/> : null}
      </button>

      <div className="nt-card-body" onClick={() => onEdit()}>
        <div className="nt-card-top">
          <span className="nt-type-badge">{typeIcon}</span>
          <h4 className={n.status === 'done' ? 'nt-strikethrough' : ''}>{n.title}</h4>
          <span className="nt-prio-dot" style={{ background: PRIORITY_COLOR[n.priority] }} title={n.priority} />
        </div>
        {n.body && <p className="nt-card-text">{n.body.slice(0, 160)}{n.body.length > 160 ? '…' : ''}</p>}
        <div className="nt-card-meta">
          {n.due_date && (
            <span className={`nt-due ${overdue ? 'nt-due-overdue' : ''}`}>
              <IconClock size={11}/> {relDate(n.due_date)}
            </span>
          )}
          {n.customer && (
            <span className="nt-cust-tag" onClick={e => { e.stopPropagation(); navigate(`/customers/${n.customer_id}`); }}>
              <IconCustomer size={11}/> {n.customer.name}
            </span>
          )}
          {n.call_id && (
            <span className="nt-call-tag" onClick={e => { e.stopPropagation(); navigate(`/call/${n.call_id}`); }}>
              <IconMic size={11}/> Call
            </span>
          )}
          <span className="nt-date">{fmtFull(n.created_at)}</span>
        </div>
      </div>

      <div className="nt-card-actions">
        <button title="Sửa" onClick={() => onEdit()}><IconEdit size={14}/></button>
        <button title="Xoá" onClick={() => onDelete(n.id)}><IconTrash size={14}/></button>
      </div>
    </div>
  );
}
