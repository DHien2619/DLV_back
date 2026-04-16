import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './ChatPanel.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

const QUICK_PROMPTS = [
  'KH này đang bị bệnh gì?',
  'Đã mua những sản phẩm nào?',
  'Có dị ứng hay tương tác nguy hiểm không?',
  'Phong cách quyết định mua của KH?',
  'Call gần nhất có rủi ro compliance gì?',
  'Next best action để follow up?',
];

export default function ChatPanel({ customerId, customerName }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const bodyRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, sending]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || sending) return;
    setInput('');
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    const newMsgs = [...messages, { role: 'user', content: q, ts: Date.now() }];
    setMessages(newMsgs);
    setSending(true);

    try {
      const res = await fetch(`${API_URL}/api/v2/customers/${customerId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, history })
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Chat failed');
      setMessages([...newMsgs, {
        role: 'assistant',
        content: data.answer,
        confidence: data.confidence,
        citations: data.citations || [],
        suggested_actions: data.suggested_actions || [],
        context_used: data.context_used,
        no_info: data.no_info_available,
        response_ms: data.response_ms,
        ts: Date.now()
      }]);
    } catch (e) {
      setMessages([...newMsgs, { role: 'assistant', content: `⚠️ Lỗi: ${e.message}`, error: true, ts: Date.now() }]);
    } finally {
      setSending(false);
    }
  };

  const handleCitationClick = (c) => {
    if (c.call_id) navigate(`/call/${c.call_id}`);
  };

  if (!expanded) {
    return (
      <button className="chp-fab" onClick={() => setExpanded(true)}>
        💬 Hỏi Agent về {customerName}
      </button>
    );
  }

  return (
    <div className="chp-panel">
      <div className="chp-head">
        <div>
          <b>💬 AI Agent</b>
          <small>Hỏi đáp dựa trên lịch sử KH</small>
        </div>
        <button className="chp-close" onClick={() => setExpanded(false)}>✕</button>
      </div>

      <div className="chp-body" ref={bodyRef}>
        {messages.length === 0 && (
          <div className="chp-welcome">
            <p>Tôi là Agent của <b>{customerName}</b>. Hỏi tôi bất cứ điều gì về KH này — tôi sẽ trả lời dựa trên memory, lịch sử cuộc gọi và các đoạn transcript liên quan.</p>
            <div className="chp-quick">
              {QUICK_PROMPTS.map(p => (
                <button key={p} onClick={() => send(p)}>{p}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`chp-msg chp-msg-${m.role}${m.error ? ' chp-msg-error' : ''}`}>
            {m.role === 'user' ? (
              <div className="chp-bubble">{m.content}</div>
            ) : (
              <>
                <div className="chp-bubble">
                  <div className="chp-answer" dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                  {m.no_info && <div className="chp-no-info">ℹ️ Agent chưa đủ data — nên hỏi KH trong call tiếp theo.</div>}
                </div>

                {m.citations?.length > 0 && (
                  <div className="chp-citations">
                    <div className="chp-citations-label">📎 Evidence ({m.citations.length})</div>
                    {m.citations.map((c, j) => (
                      <button
                        key={j}
                        className={`chp-citation chp-citation-${c.source_type}`}
                        onClick={() => handleCitationClick(c)}
                        disabled={!c.call_id}
                      >
                        <div className="chp-citation-type">
                          {c.source_type === 'memory' ? '🧠 memory' : c.source_type === 'transcript' ? '📝 transcript' : '📄 summary'}
                          {c.timestamp_sec > 0 && <span className="chp-citation-ts"> @ {fmtTime(c.timestamp_sec)}</span>}
                        </div>
                        <div className="chp-citation-quote">"{c.quote}"</div>
                        {c.note && <div className="chp-citation-note">{c.note}</div>}
                      </button>
                    ))}
                  </div>
                )}

                {m.suggested_actions?.length > 0 && (
                  <div className="chp-actions">
                    <div className="chp-actions-label">🎯 Gợi ý hành động</div>
                    {m.suggested_actions.map((a, j) => <div key={j} className="chp-action">• {a}</div>)}
                  </div>
                )}

                {m.context_used && (
                  <div className="chp-meta">
                    <span className={`chp-conf chp-conf-${m.confidence}`}>conf {m.confidence}</span>
                    <span>{m.context_used.calls_count} calls</span>
                    <span>{m.context_used.chunks_retrieved} chunks</span>
                    {m.context_used.top_similarity > 0 && <span>sim {m.context_used.top_similarity.toFixed(2)}</span>}
                    <span>{m.response_ms}ms</span>
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {sending && (
          <div className="chp-msg chp-msg-assistant">
            <div className="chp-bubble chp-typing">
              <span></span><span></span><span></span>
            </div>
          </div>
        )}
      </div>

      <form className="chp-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input
          type="text"
          placeholder="Hỏi về KH này..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
        />
        <button type="submit" disabled={sending || !input.trim()}>{sending ? '⏳' : 'Gửi'}</button>
      </form>
    </div>
  );
}

function fmtTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

// Very lightweight markdown: **bold** + * bullets + line breaks
function renderMarkdown(text) {
  if (!text) return '';
  const escaped = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\n- /g, '<br>• ')
    .replace(/\n\* /g, '<br>• ')
    .replace(/\n/g, '<br>');
}
