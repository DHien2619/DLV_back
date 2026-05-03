import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  IconSparkles, IconCustomer, IconLightbulb, IconTarget
} from './icons';
// Import lucide directly for input toolbar to avoid wrapper edge cases
import { Send, X as XIcon, Loader2, Mic, Paperclip, Upload } from 'lucide-react';
import './AgentSheet.css';

const IconSend = (p) => <Send strokeWidth={2} {...p}/>;
const IconClose = (p) => <XIcon strokeWidth={2} {...p}/>;
const IconLoader = (p) => <Loader2 strokeWidth={2} {...p}/>;
const IconMic = (p) => <Mic strokeWidth={2} {...p}/>;
const IconPaperclip = (p) => <Paperclip strokeWidth={2} {...p}/>;
const IconUpload = (p) => <Upload strokeWidth={2} {...p}/>;

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

// ---------- context detection from route ----------
function useAgentContext() {
  const location = useLocation();
  const path = location.pathname;
  const callMatch = path.match(/^\/call\/([a-f0-9-]+)/);
  const custMatch = path.match(/^\/customers\/([a-f0-9-]+)/);

  if (callMatch) return { mode: 'call', callId: callMatch[1], customerId: null, label: 'Cuộc gọi' };
  if (custMatch) return { mode: 'customer', customerId: custMatch[1], callId: null, label: 'Khách hàng' };
  return { mode: 'advisor', customerId: null, callId: null, label: 'Cố vấn' };
}

const MODE_INFO = {
  call:     { Icon: IconMic,        color: '#16a34a', label: 'Phân tích cuộc gọi', desc: 'Trả lời dựa trên cuộc gọi đang xem' },
  customer: { Icon: IconCustomer,    color: '#4f46e5', label: 'Hỏi đáp khách hàng', desc: 'Trả lời dựa trên lịch sử & trí nhớ KH' },
  advisor:  { Icon: IconLightbulb,  color: '#f59e0b', label: 'Cố vấn nghiệp vụ',   desc: 'Hỏi về kỹ năng bán hàng, tuân thủ, coaching' }
};

const QUICK_PROMPTS = {
  call: [
    'Tóm tắt ngắn gọn cuộc gọi này',
    'Điểm yếu nhất của nhân viên trong cuộc gọi?',
    'Khách hàng có dấu hiệu mua hàng không?',
    'Có vi phạm tuân thủ nào cần xử lý?',
    'Hành động tiếp theo nên làm gì?'
  ],
  customer: [
    'Khách hàng này đang gặp vấn đề sức khỏe gì?',
    'Đã mua sản phẩm nào trước đây?',
    'Có dị ứng hay tương tác thuốc nguy hiểm không?',
    'Phong cách quyết định mua hàng của họ?',
    'Hành động follow-up tiếp theo nên làm gì?'
  ],
  advisor: [
    'Cách mở đầu cuộc gọi telesale dược phẩm hiệu quả?',
    'Xử lý khi khách hàng chê giá đắt thế nào?',
    'Quy định quảng cáo dược phẩm tại Việt Nam?',
    'Coaching nhân viên mới cần lưu ý những gì?',
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
  const inputRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, sending]);

  // Auto-focus input on open
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 200);
  }, [isOpen]);

  // Reset when context changes
  useEffect(() => {
    setMessages([]);
  }, [ctx.mode, ctx.callId, ctx.customerId]);

  // Load customer info
  useEffect(() => {
    const custId = ctx.customerId;
    if (!custId) { setCustomerInfo(null); return; }
    fetch(`${API_URL}/api/v2/customers/${custId}`)
      .then(r => r.json())
      .then(d => setCustomerInfo(d.customer || null))
      .catch(() => setCustomerInfo(null));
  }, [ctx.customerId]);

  useEffect(() => {
    if (ctx.mode !== 'call' || !ctx.callId) return;
    fetch(`${API_URL}/api/v2/calls2/${ctx.callId}`)
      .then(r => r.json())
      .then(d => { if (d.customer) setCustomerInfo(d.customer); })
      .catch(() => {});
  }, [ctx.callId]);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') onToggle(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onToggle]);

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
      setMessages([...newMsgs, { role: 'assistant', content: e.message, error: true, ts: Date.now() }]);
    } finally { setSending(false); }
  }, [input, messages, sending, ctx]);

  const modeInfo = MODE_INFO[ctx.mode];
  const ModeIcon = modeInfo.Icon;
  const prompts = QUICK_PROMPTS[ctx.mode] || QUICK_PROMPTS.advisor;
  const isEmpty = messages.length === 0 && !sending;

  if (!isOpen) return null;

  return (
    <div className="as-fullscreen">
      {/* Top bar */}
      <header className="as-topbar">
        <div className="as-topbar-left">
          <div className="as-brand-icon"><IconSparkles size={18}/></div>
          <div className="as-brand-text">
            <b>PharmaVoice Agent</b>
            <div className="as-mode-badge" style={{ '--mc': modeInfo.color }}>
              <ModeIcon size={11}/> {modeInfo.label}
              {customerInfo && <span> · {customerInfo.name}</span>}
            </div>
          </div>
        </div>
        <button className="as-close-btn" onClick={onToggle} title="Đóng (Esc)">
          <IconClose size={18}/>
        </button>
      </header>

      {/* Empty state — Google AI Mode style */}
      {isEmpty ? (
        <div className="as-hero-wrap">
          <div className="as-hero">
            <h1 className="as-hero-title">Meet AI Agent</h1>
            <p className="as-hero-subtitle">Đặt câu hỏi chi tiết để có câu trả lời chính xác hơn</p>

            {/* Big input bar with gradient ring */}
            <div className="as-hero-input-wrap">
              <div className="as-hero-input-glow"/>
              <form className="as-hero-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
                <textarea
                  ref={inputRef}
                  rows={1}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                  }}
                  placeholder="Hỏi bất cứ điều gì..."
                  disabled={sending}
                  autoFocus
                />
                <div className="as-hero-toolbar">
                  <div className="as-hero-toolbar-left">
                    <button type="button" className="as-icon-btn" title="Đính kèm ảnh"><IconUpload size={18}/></button>
                    <button type="button" className="as-icon-btn" title="Đính kèm file"><IconPaperclip size={18}/></button>
                  </div>
                  <div className="as-hero-toolbar-right">
                    <button type="button" className="as-icon-btn" title="Ghi âm"><IconMic size={18}/></button>
                    <button type="submit" className="as-send-btn" disabled={sending || !input.trim()}>
                      {sending ? <IconLoader size={18} className="as-spin"/> : <IconSend size={18}/>}
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Quick prompts */}
            <div className="as-hero-prompts">
              {prompts.map((p) => (
                <button key={p} className="as-hero-prompt" onClick={() => send(p)}>
                  <IconSparkles size={13}/>
                  <span>{p}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Conversation */}
          <div className="as-conv" ref={bodyRef}>
            <div className="as-conv-inner">
              {messages.map((m, i) => (
                <div key={i} className={`as-msg as-msg-${m.role}${m.error ? ' as-err' : ''}`}>
                  {m.role === 'user' ? (
                    <div className="as-bubble as-bubble-user">{m.content}</div>
                  ) : (
                    <>
                      <div className="as-msg-avatar"><IconSparkles size={14}/></div>
                      <div className="as-msg-content">
                        <div className="as-bubble as-bubble-ai">
                          <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                          {m.no_info && <div className="as-no-info">Chưa đủ dữ liệu để trả lời chính xác.</div>}
                        </div>

                        {m.citations?.length > 0 && (
                          <div className="as-cites">
                            {m.citations.slice(0, 4).map((c, j) => (
                              <button key={j} className="as-cite"
                                onClick={() => c.call_id && navigate(`/call/${c.call_id}`)}>
                                <small>{c.source_type}</small>
                                <span>"{c.quote?.slice(0, 80)}{c.quote?.length > 80 ? '…' : ''}"</span>
                              </button>
                            ))}
                          </div>
                        )}

                        {m.actions?.length > 0 && (
                          <div className="as-actions">
                            {m.actions.map((a, j) => (
                              <div key={j} className="as-action"><IconTarget size={14}/> {a}</div>
                            ))}
                          </div>
                        )}

                        {m.ms && (
                          <div className="as-meta">
                            <span className={`as-conf as-conf-${m.confidence}`}>{m.confidence}</span>
                            <span>{m.ms}ms</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              ))}

              {sending && (
                <div className="as-msg as-msg-assistant">
                  <div className="as-msg-avatar"><IconSparkles size={14}/></div>
                  <div className="as-msg-content">
                    <div className="as-bubble as-bubble-ai as-typing"><span/><span/><span/></div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom input — single row with icons inline */}
          <div className="as-bottom">
            <form className="as-bottom-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
              <button type="button" className="as-icon-btn" title="Đính kèm ảnh"><IconUpload size={18}/></button>
              <button type="button" className="as-icon-btn" title="Đính kèm file"><IconPaperclip size={18}/></button>
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                }}
                placeholder="Hỏi tiếp..."
                disabled={sending}
              />
              <button type="button" className="as-icon-btn" title="Ghi âm"><IconMic size={18}/></button>
              <button type="submit" className="as-send-btn" disabled={sending || !input.trim()}>
                {sending ? <IconLoader size={18} className="as-spin"/> : <IconSend size={18}/>}
              </button>
            </form>
            <div className="as-bottom-hint">
              Enter để gửi · Shift+Enter xuống dòng · Esc để đóng
            </div>
          </div>
        </>
      )}
    </div>
  );
}
