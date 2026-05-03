import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { CanvasView } from './CallCanvas';
import { IconArrowLeft, IconArrowRight, IconChat, IconCheck, IconLoader, IconTarget, IconWarning } from './icons';
import './CallDetail.css';
import './CallWorkspace.css'; // reuse cv-* styles

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const fmtDate = (s) => s ? new Date(s).toLocaleString('vi-VN') : '—';
const gradeColor = (g) => ({ A:'#16a34a', B:'#65a30d', C:'#eab308', D:'#f97316', F:'#dc2626' }[g] || '#94a3b8');
const sevColor   = (s) => ({ red:'#dc2626', orange:'#f97316', yellow:'#eab308', clean:'#16a34a' }[s] || '#94a3b8');

// MiniChat removed — replaced by global AgentSheet (center FAB)

function _deprecated_MiniChat({ customerId, customerName }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, sending]);

  if (!customerId) return null;

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || sending) return;
    setInput('');
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    setMessages(m => [...m, { role: 'user', content: q }]);
    setSending(true);
    try {
      const res = await fetch(`${API_URL}/api/v2/customers/${customerId}/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, history })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'fail');
      setMessages(m => [...m, {
        role: 'assistant', content: data.answer,
        confidence: data.confidence, citations: data.citations, actions: data.suggested_actions, ms: data.response_ms
      }]);
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: `⚠️ ${e.message}`, error: true }]);
    } finally { setSending(false); }
  };

  return (
    <div className="ws-chat" style={{ flex: 1, minHeight: 0 }}>
      <div className="ws-chat-head">
        <b><IconChat size={14}/> Hỏi Agent</b>
        <small>Về KH {customerName}</small>
      </div>
      <div className="ws-chat-body" ref={bodyRef}>
        {messages.length === 0 && (
          <div className="ws-chat-welcome">
            <p>Hỏi tôi về cuộc gọi này hoặc lịch sử KH {customerName}.</p>
            <div className="ws-chat-quick">
              <button onClick={() => send('Tóm tắt cuộc gọi này')}>Tóm tắt cuộc gọi này</button>
              <button onClick={() => send('Có rủi ro tuân thủ gì cần xử lý?')}>Rủi ro tuân thủ?</button>
              <button onClick={() => send('Next best action follow up?')}>Next best action?</button>
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ws-msg ws-msg-${m.role}${m.error ? ' err' : ''}`}>
            {m.role === 'user' ? (
              <div className="ws-bubble">{m.content}</div>
            ) : (
              <>
                <div className="ws-bubble"><div dangerouslySetInnerHTML={{ __html: m.content?.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>') || '' }} /></div>
                {m.citations?.length > 0 && (
                  <div className="ws-cites">
                    {m.citations.slice(0, 3).map((c, j) => (
                      <div key={j} className={`ws-cite ws-cite-${c.source_type}`}>
                        <small>{c.source_type}</small>
                        <span>"{c.quote?.slice(0, 80)}"</span>
                      </div>
                    ))}
                  </div>
                )}
                {m.actions?.length > 0 && (
                  <div className="ws-cite-actions">
                    {m.actions.map((a, j) => <div key={j}><IconTarget size={16}/> {a}</div>)}
                  </div>
                )}
              </>
            )}
          </div>
        ))}
        {sending && <div className="ws-msg ws-msg-assistant"><div className="ws-typing"><span/><span/><span/></div></div>}
      </div>
      <form className="ws-chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Hỏi Agent..." disabled={sending} />
        <button type="submit" disabled={sending || !input.trim()}>{sending ? '...' : '→'}</button>
      </form>
    </div>
  );
}

export default function CallDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    setLoading(true);
    fetch(`${API_URL}/api/v2/calls2/${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.message && !d.call) { setError(d.message); }
        else setData(d);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [id]);

  // Reshape DB row <IconArrowRight size={14}/> analysis object for CanvasView
  const analysis = useMemo(() => {
    if (!data?.call) return null;
    const c = data.call;
    return {
      diarized: c.transcript_diarized,
      transcript_text: c.transcript_raw,
      quality: c.insights?.quality,
      needs: c.insights?.needs,
      opportunity: c.insights?.opportunity,
      compliance: c.insights?.compliance,
      structure: c.insights?.structure,
      rag_context_used: false,
      saved_call_id: c.id,
      customer_id: c.customer_id
    };
  }, [data]);

  if (loading) return <div className="cd-loading">Đang tải cuộc gọi…</div>;
  if (error || !data?.call) {
    return (
      <div className="cd-error">
        <h2><IconWarning size={14}/> Không tìm thấy cuộc gọi</h2>
        <p>{error || 'Call ID không hợp lệ hoặc đã bị xoá.'}</p>
        <Link to="/history" className="cd-btn"><IconArrowLeft size={14}/> Về Lịch sử phân tích</Link>
      </div>
    );
  }

  const { call, customer } = data;

  return (
    <div className="cd-root">
      {/* Header */}
      <div className="cd-header">
        <div className="cd-header-top">
          <div className="cd-meta">
            <h1>
              {customer?.name || 'KH chưa xác định'}
              {customer?.phone && <small>{customer.phone}</small>}
            </h1>
            <p>
              <span>{fmtDate(call.created_at)}</span>
              {call.audio_filename && <span>{call.audio_filename}</span>}
              {call.analysis_version && <span>{call.analysis_version}</span>}
            </p>
          </div>
          <div className="cd-actions">
            {customer && <Link to={`/customers/${customer.id}`} className="cd-btn">Xem KH</Link>}
            <Link to="/history" className="cd-btn">Lịch sử</Link>
          </div>
        </div>
        <div className="cd-scores">
          {call.total_quality_score != null && (
            <div className="cd-score">
              <small>Quality</small>
              <b style={{ color: gradeColor(call.insights?.quality?.overall_grade) }}>
                {call.insights?.quality?.overall_grade || '?'} · {call.total_quality_score}
              </b>
            </div>
          )}
          {call.opportunity_score != null && (
            <div className="cd-score">
              <small>Opportunity</small>
              <b>{call.opportunity_score}/100</b>
              <span>{call.insights?.opportunity?.stage}</span>
            </div>
          )}
          {call.compliance_status && (
            <div className="cd-score">
              <small>Compliance</small>
              <b style={{ color: sevColor(call.compliance_status) }}>
                {call.compliance_status === 'clean' ? '✓' : call.compliance_status.toUpperCase()}
              </b>
              <span>{call.insights?.compliance?.events?.length || 0} events</span>
            </div>
          )}
        </div>
      </div>

      {/* Full-width canvas (chat via global AgentSheet FAB) */}
      <div className="cd-canvas-full">
        <CanvasView
          analysis={analysis}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          activeSeg={-1}
          audioRef={null}
          onJump={(sec) => { setActiveTab('transcript'); }}
          hasAudio={!!call.audio_url}
          audioUrl={call.audio_url || null}
          ragUsed={false}
        />
      </div>
    </div>
  );
}
