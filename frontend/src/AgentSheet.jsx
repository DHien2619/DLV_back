import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { IconSparkles, IconSend, IconClose, IconChevronDown, IconLoader, IconCustomer, IconMic, IconLightbulb } from './icons';
import './AgentSheet.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

// ---------- context detection from route ----------
function useAgentContext() {
  const location = useLocation();
  const path = location.pathname;

  // /call/:id
  const callMatch = path.match(/^\/call\/([a-f0-9-]+)/);
  // /customers/:id
  const custMatch = path.match(/^\/customers\/([a-f0-9-]+)/);

  if (callMatch) return { mode: 'call', callId: callMatch[1], customerId: null, label: 'Cuộc gọi' };
  if (custMatch) return { mode: 'customer', customerId: custMatch[1], callId: null, label: 'Khách hàng' };
  return { mode: 'advisor', customerId: null, callId: null, label: 'Cố vấn' };
}

const MODE_INFO = {
  call:     { icon: <IconMic size={14}/>,       color: '#16a34a', label: 'Phân tích cuộc gọi', desc: 'Agent trả lời dựa trên nội dung cuộc gọi này' },
  customer: { icon: <IconCustomer size={14}/>,   color: '#4f46e5', label: 'Hỏi đáp khách hàng', desc: 'Agent trả lời dựa trên lịch sử & trí nhớ KH' },
  advisor:  { icon: <IconLightbulb size={14}/>,  color: '#f59e0b', label: 'Cố vấn nghiệp vụ',   desc: 'Hỏi về kỹ năng bán hàng, tuân thủ, coaching' }
};

const QUICK_PROMPTS = {
  call: [
    'Tóm tắt cuộc gọi này',
    'Điểm yếu nhất của nhân viên?',
    'KH có dấu hiệu mua hàng không?',
    'Có vi phạm tuân thủ nào?',
    'Hành động tiếp theo nên làm gì?'
  ],
  customer: [
    'KH này đang bị bệnh gì?',
    'Đã mua sản phẩm nào?',
    'Có dị ứng hay tương tác nguy hiểm?',
    'Phong cách quyết định mua?',
    'Hành động follow-up tiếp theo?'
  ],
  advisor: [
    'Cách mở đầu cuộc gọi telesale hiệu quả?',
    'Xử lý khi KH chê giá đắt?',
    'Quy định quảng cáo dược phẩm VN?',
    'Coaching nhân viên mới cần lưu ý gì?',
    'KPI nào quan trọng nhất cho telesale dược?'
  ]
};

function renderMarkdown(text) {
  if (!text) return '';
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>')
    .replace(/\n- /g,'<br>• ').replace(/\n\* /g,'<br>• ').replace(/\n/g,'<br>');
}

export default function AgentSheet({ isOpen, onToggle }) {
  const ctx = useAgentContext();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [customerInfo, setCustomerInfo] = useState(null);
  const bodyRef = useRef(null);
  const sheetRef = useRef(null);
  const dragRef = useRef({ startY: 0, dragging: false });

  // Auto-scroll
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, sending]);

  // Load customer name when context changes
  useEffect(() => {
    const custId = ctx.customerId;
    if (!custId) { setCustomerInfo(null); return; }
    fetch(`${API_URL}/api/v2/customers/${custId}`)
      .then(r => r.json())
      .then(d => setCustomerInfo(d.customer || null))
      .catch(() => setCustomerInfo(null));
  }, [ctx.customerId]);

  // Load call's customer when on call page
  useEffect(() => {
    if (ctx.mode !== 'call' || !ctx.callId) return;
    fetch(`${API_URL}/api/v2/calls2/${ctx.callId}`)
      .then(r => r.json())
      .then(d => {
        if (d.customer) setCustomerInfo(d.customer);
        if (d.call?.customer_id) ctx.customerId = d.call.customer_id;
      })
      .catch(() => {});
  }, [ctx.callId]);

  const send = useCallback(async (text) => {
    const q = (text ?? input).trim();
    if (!q || sending) return;
    setInput('');

    const history = messages.map(m => ({ role: m.role, content: m.content }));
    const newMsgs = [...messages, { role: 'user', content: q, ts: Date.now() }];
    setMessages(newMsgs);
    setSending(true);

    try {
      const payload = { message: q, history, mode: ctx.mode };
      if (ctx.customerId) payload.customerId = ctx.customerId;
      if (ctx.callId) payload.callId = ctx.callId;

      const res = await fetch(`${API_URL}/api/v2/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Lỗi');

      setMessages([...newMsgs, {
        role: 'assistant', content: data.answer,
        confidence: data.confidence, citations: data.citations || [],
        actions: data.suggested_actions || [], no_info: data.no_info_available,
        ms: data.response_ms, mode: data.mode
      }]);
    } catch (e) {
      setMessages([...newMsgs, { role: 'assistant', content: `⚠️ ${e.message}`, error: true, ts: Date.now() }]);
    } finally { setSending(false); }
  }, [input, messages, sending, ctx]);

  // Drag to dismiss
  const onTouchStart = (e) => {
    dragRef.current = { startY: e.touches[0].clientY, dragging: true };
  };
  const onTouchMove = (e) => {
    if (!dragRef.current.dragging) return;
    const dy = e.touches[0].clientY - dragRef.current.startY;
    if (dy > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${dy}px)`;
      sheetRef.current.style.transition = 'none';
    }
  };
  const onTouchEnd = (e) => {
    if (!dragRef.current.dragging) return;
    const dy = e.changedTouches[0].clientY - dragRef.current.startY;
    dragRef.current.dragging = false;
    if (sheetRef.current) {
      sheetRef.current.style.transition = '';
      sheetRef.current.style.transform = '';
    }
    if (dy > 120) onToggle(); // dismiss if dragged >120px
  };

  const modeInfo = MODE_INFO[ctx.mode];
  const prompts = QUICK_PROMPTS[ctx.mode] || QUICK_PROMPTS.advisor;

  if (!isOpen) return null;

  return (
    <>
      <div className="as-backdrop" onClick={onToggle} />
      <div className="as-sheet" ref={sheetRef}>
        {/* Drag handle */}
        <div className="as-handle" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
          <div className="as-handle-bar" />
        </div>

        {/* Header */}
        <div className="as-header">
          <div className="as-header-left">
            <div className="as-avatar"><IconSparkles size={18} /></div>
            <div>
              <b>PharmaVoice Agent</b>
              <div className="as-mode-badge" style={{ '--mode-color': modeInfo.color }}>
                {modeInfo.icon} {modeInfo.label}
              </div>
            </div>
          </div>
          <button className="as-close" onClick={onToggle}><IconChevronDown size={20}/></button>
        </div>

        {/* Context bar */}
        {(customerInfo || ctx.mode !== 'advisor') && (
          <div className="as-context">
            {customerInfo && <span className="as-ctx-chip as-ctx-cust">{customerInfo.name}{customerInfo.phone ? ` · ${customerInfo.phone}` : ''}</span>}
            {ctx.callId && <span className="as-ctx-chip as-ctx-call">Cuộc gọi đang xem</span>}
            {ctx.mode === 'advisor' && <span className="as-ctx-chip as-ctx-adv">Chế độ cố vấn chung</span>}
          </div>
        )}

        {/* Messages */}
        <div className="as-body" ref={bodyRef}>
          {messages.length === 0 && (
            <div className="as-welcome">
              <div className="as-welcome-icon"><IconSparkles size={28}/></div>
              <h3>Xin chào! Tôi là Agent AI</h3>
              <p>{modeInfo.desc}</p>
              <div className="as-prompts">
                {prompts.map(p => (
                  <button key={p} onClick={() => send(p)}>{p}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`as-msg as-msg-${m.role}${m.error ? ' as-err' : ''}`}>
              {m.role === 'user' ? (
                <div className="as-bubble as-bubble-user">{m.content}</div>
              ) : (
                <>
                  <div className="as-bubble as-bubble-ai">
                    <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                    {m.no_info && <div className="as-no-info">Chưa đủ dữ liệu để trả lời chính xác.</div>}
                  </div>

                  {m.citations?.length > 0 && (
                    <div className="as-cites">
                      {m.citations.slice(0, 4).map((c, j) => (
                        <button key={j} className="as-cite"
                          onClick={() => c.call_id && navigate(`/call/${c.call_id}`)}>
                          <small>{c.source_type === 'memory' ? '🧠' : c.source_type === 'transcript' ? '📝' : '📄'} {c.source_type}</small>
                          <span>"{c.quote?.slice(0, 70)}{c.quote?.length > 70 ? '…' : ''}"</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {m.actions?.length > 0 && (
                    <div className="as-actions">
                      {m.actions.map((a, j) => <div key={j} className="as-action">🎯 {a}</div>)}
                    </div>
                  )}

                  {m.ms && (
                    <div className="as-meta">
                      <span className={`as-conf as-conf-${m.confidence}`}>{m.confidence}</span>
                      <span>{m.ms}ms</span>
                    </div>
                  )}
                </>
              )}
            </div>
          ))}

          {sending && (
            <div className="as-msg as-msg-assistant">
              <div className="as-bubble as-bubble-ai as-typing"><span/><span/><span/></div>
            </div>
          )}
        </div>

        {/* Input */}
        <form className="as-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Hỏi Agent..."
            disabled={sending}
          />
          <button type="submit" disabled={sending || !input.trim()}>
            {sending ? <IconLoader size={16} className="as-spin" /> : <IconSend size={16} />}
          </button>
        </form>
      </div>
    </>
  );
}
