import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import WaveSurfer from 'wavesurfer.js';
import AnalysisProgress from './AnalysisProgress';
import { CanvasView, fmtTime } from './CallCanvas';
import {
  IconCustomer, IconClock, IconPaperclip, IconSparkles, IconArrowLeft,
  IconChat, IconSend, IconLoader, IconPlus, IconAlert, IconCheck, IconAnalyze
} from './icons';
import './CallWorkspace.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

// helpers imported from CallCanvas (fmtTime)

// ============================================================
// Customer picker (inline, compact)
// ============================================================
function CustomerPicker({ value, onChange }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!q || q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`${API_URL}/api/v2/customers?q=${encodeURIComponent(q)}&limit=6`);
      setResults(await res.json());
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  if (value) {
    return (
      <div className="ws-cust-chip">
        <span><IconCustomer size={15} /> <b>{value.name}</b>{value.phone ? ` · ${value.phone}` : ''}</span>
        <button onClick={() => onChange(null)}>Đổi</button>
      </div>
    );
  }

  const quickCreate = async () => {
    if (!q) return;
    setCreating(true);
    try {
      const res = await fetch(`${API_URL}/api/v2/customers`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: q, source: 'hotline' })
      });
      if (res.ok) onChange(await res.json());
    } finally { setCreating(false); }
  };

  return (
    <div className="ws-picker">
      <input
        placeholder="Tìm tên / SĐT hoặc nhập tên KH mới..."
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {open && (results.length > 0 || q.length >= 2) && (
        <div className="ws-picker-dd">
          {results.map(c => (
            <div key={c.id} className="ws-picker-item" onClick={() => { onChange(c); setQ(''); setOpen(false); }}>
              <b>{c.name}</b>
              <span>{c.phone || '—'}</span>
            </div>
          ))}
          {q.length >= 2 && !results.find(r => r.name.toLowerCase() === q.toLowerCase()) && (
            <div className="ws-picker-item ws-picker-create" onClick={quickCreate}>
              {creating ? <><IconLoader size={13} className="spin" /> Đang tạo...</> : <><IconPlus size={13} /> Tạo KH mới: "{q}"</>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Datetime picker with presets
// ============================================================
function DateTimePicker({ value, onChange }) {
  const toLocal = (d) => {
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const setPreset = (preset) => {
    const d = new Date();
    if (preset === 'hour-ago') d.setHours(d.getHours() - 1);
    else if (preset === 'morning') { d.setHours(9, 0, 0, 0); }
    else if (preset === 'yesterday') { d.setDate(d.getDate() - 1); d.setHours(14, 0, 0, 0); }
    onChange(toLocal(d));
  };
  return (
    <div className="ws-dt">
      <input
        type="datetime-local"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
      <div className="ws-dt-presets">
        <button onClick={() => setPreset('now')}>Ngay bây giờ</button>
        <button onClick={() => setPreset('hour-ago')}>1h trước</button>
        <button onClick={() => setPreset('morning')}>Sáng nay</button>
        <button onClick={() => setPreset('yesterday')}>Hôm qua</button>
      </div>
    </div>
  );
}

// ============================================================
// Chat Panel (inline, scoped per customer+call)
// ============================================================
const QUICK_PROMPTS = [
  'Tóm tắt ngắn gọn cuộc gọi này',
  'Điểm yếu nhất của Agent trong cuộc gọi là gì?',
  'KH có dấu hiệu mua hàng không?',
  'Có vi phạm tuân thủ nào cần xử lý?',
  'Next best action là gì?'
];

function renderMarkdown(text) {
  if (!text) return '';
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
                .replace(/\n- /g, '<br>• ').replace(/\n\* /g, '<br>• ').replace(/\n/g, '<br>');
}

function InlineChat({ customerId, callContext, onCitationClick }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, sending]);

  useEffect(() => { setMessages([]); }, [customerId]);

  const send = async (text) => {
    const q = (text ?? input).trim();
    if (!q || sending || !customerId) return;
    setInput('');
    const history = messages.map(m => ({ role: m.role, content: m.content }));
    setMessages([...messages, { role: 'user', content: q }]);
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
        confidence: data.confidence, citations: data.citations, actions: data.suggested_actions,
        no_info: data.no_info_available, ms: data.response_ms
      }]);
    } catch (e) {
      setMessages(m => [...m, { role: 'assistant', content: `⚠️ ${e.message}`, error: true }]);
    } finally { setSending(false); }
  };

  return (
    <div className="ws-chat">
      <div className="ws-chat-head">
        <b><IconChat size={15} /> Hỏi Agent về cuộc gọi</b>
        {callContext && <small>{callContext}</small>}
      </div>
      <div className="ws-chat-body" ref={bodyRef}>
        {!customerId && (
          <div className="ws-chat-empty">
            <p>Chọn khách hàng phía trên để Agent có thể trả lời dựa trên lịch sử KH đó.</p>
          </div>
        )}
        {customerId && messages.length === 0 && (
          <div className="ws-chat-welcome">
            <p>👋 Tôi là <b>Agent phân tích</b>. Hỏi tôi về chất lượng tư vấn, cơ hội bán, tuân thủ, hoặc nhu cầu KH.</p>
            <div className="ws-chat-quick">
              {QUICK_PROMPTS.map(p => (
                <button key={p} onClick={() => send(p)}>{p}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ws-msg ws-msg-${m.role}${m.error ? ' err' : ''}`}>
            {m.role === 'user' ? (
              <div className="ws-bubble">{m.content}</div>
            ) : (
              <>
                <div className="ws-bubble">
                  <div dangerouslySetInnerHTML={{ __html: renderMarkdown(m.content) }} />
                  {m.no_info && <div className="ws-no-info">ℹ️ Chưa đủ data.</div>}
                </div>
                {m.citations?.length > 0 && (
                  <div className="ws-cites">
                    {m.citations.slice(0, 3).map((c, j) => (
                      <button key={j}
                        className={`ws-cite ws-cite-${c.source_type}`}
                        onClick={() => onCitationClick?.(c)}
                      >
                        <small>{c.source_type} {c.timestamp_sec ? `@ ${fmtTime(c.timestamp_sec)}` : ''}</small>
                        <span>"{c.quote?.slice(0, 80)}{c.quote?.length > 80 ? '…' : ''}"</span>
                      </button>
                    ))}
                  </div>
                )}
                {m.actions?.length > 0 && (
                  <div className="ws-cite-actions">
                    {m.actions.map((a, j) => <div key={j}>🎯 {a}</div>)}
                  </div>
                )}
                {m.ms && <div className="ws-msg-meta">{m.confidence} · {m.ms}ms</div>}
              </>
            )}
          </div>
        ))}
        {sending && <div className="ws-msg ws-msg-assistant"><div className="ws-typing"><span/><span/><span/></div></div>}
      </div>
      <form className="ws-chat-input" onSubmit={(e) => { e.preventDefault(); send(); }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={customerId ? "Hỏi Agent..." : "Chọn KH trước..."}
          disabled={!customerId || sending}
        />
        <button type="submit" disabled={!customerId || sending || !input.trim()}>
          {sending ? <IconLoader size={14} className="spin" /> : <IconSend size={14} />}
        </button>
      </form>
    </div>
  );
}


// ============================================================
// MAIN WORKSPACE
// ============================================================
export default function CallWorkspace() {
  const [customer, setCustomer] = useState(null);
  const [recordingTime, setRecordingTime] = useState('');
  const [file, setFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [progressEvents, setProgressEvents] = useState([]);
  const [error, setError] = useState(null);
  const [analysis, setAnalysis] = useState(null);

  const [activeTab, setActiveTab] = useState('overview');
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);

  const waveRef = useRef(null);
  const wavesurferRef = useRef(null);
  const navigate = useNavigate();

  const canAnalyze = customer && recordingTime && file && !analyzing;
  const setupComplete = analysis != null;

  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    setAudioUrl(URL.createObjectURL(f));
    setError(null);
  };

  const startAnalysis = async () => {
    if (!canAnalyze) return;
    setAnalyzing(true);
    setError(null);
    setProgressEvents([]);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (user?.id) fd.append('userId', user.id);
      fd.append('customerId', customer.id);
      fd.append('notes', `recorded_at:${recordingTime}`);

      // Streaming NDJSON response
      const res = await fetch(`${API_URL}/api/v2/calls/analyze-stream`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (!res.body) throw new Error('No response stream');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let finalResult = null;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const evt = JSON.parse(line);
            setProgressEvents(prev => [...prev, evt]);
            if (evt.step === 'complete' && evt.result) {
              finalResult = evt.result;
            } else if (evt.step === 'error') {
              throw new Error(evt.message || 'Analysis failed');
            }
          } catch (e) {
            // ignore malformed line
            console.warn('bad ndjson line:', line, e.message);
          }
        }
      }

      if (finalResult) {
        setAnalysis(finalResult);
        setActiveTab('overview');
      } else {
        throw new Error('Không nhận được kết quả cuối từ server');
      }
    } catch (e) {
      setError(e.message);
    } finally { setAnalyzing(false); }
  };

  // Wavesurfer setup when audio + transcript tab
  useEffect(() => {
    if (activeTab !== 'transcript' || !audioUrl || !waveRef.current) return;
    if (wavesurferRef.current) { try { wavesurferRef.current.destroy(); } catch(_){}; wavesurferRef.current = null; }
    const ws = WaveSurfer.create({
      container: waveRef.current, waveColor: '#cbd5e1', progressColor: '#4f46e5',
      cursorColor: '#dc2626', height: 56, barWidth: 2, barRadius: 2
    });
    ws.load(audioUrl);
    ws.on('ready', () => setDuration(ws.getDuration()));
    ws.on('audioprocess', () => setCurrentTime(ws.getCurrentTime()));
    ws.on('seeking', () => setCurrentTime(ws.getCurrentTime()));
    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    wavesurferRef.current = ws;
    return () => { try { ws.destroy(); } catch(_){}; };
  }, [audioUrl, activeTab]);

  const activeSeg = useMemo(() => {
    if (!analysis?.diarized?.segments) return -1;
    return analysis.diarized.segments.findIndex(s => currentTime >= s.start_sec && currentTime < s.end_sec);
  }, [currentTime, analysis]);

  const jumpTo = (sec) => {
    setActiveTab('transcript');
    setTimeout(() => { wavesurferRef.current?.setTime(sec); wavesurferRef.current?.play(); }, 100);
  };

  const resetForNewCall = () => {
    setCustomer(null); setRecordingTime(''); setFile(null); setAudioUrl(null);
    setAnalysis(null); setActiveTab('overview'); setError(null);
  };

  return (
    <div className="ws-root">
      {/* LEFT PANE */}
      <aside className="ws-left">
        {/* Setup */}
        <div className={`ws-setup ${setupComplete ? 'compact' : ''}`}>
          <h3>
            {setupComplete
              ? <><IconCheck size={15} /> Cuộc gọi</>
              : <><IconSparkles size={15} /> Thiết lập phân tích</>}
          </h3>

          <div className="ws-field">
            <label><span className="ws-step-num">1</span> Khách hàng <span className="ws-req">*</span></label>
            {setupComplete ? (
              <div className="ws-cust-chip"><IconCustomer size={15} /> <b>{customer?.name}</b></div>
            ) : (
              <CustomerPicker value={customer} onChange={setCustomer} />
            )}
          </div>

          <div className="ws-field">
            <label><span className="ws-step-num">2</span> Thời gian ghi âm <span className="ws-req">*</span></label>
            {setupComplete ? (
              <div className="ws-time-chip"><IconClock size={14} /> {recordingTime ? new Date(recordingTime).toLocaleString('vi-VN') : '—'}</div>
            ) : (
              <DateTimePicker value={recordingTime} onChange={setRecordingTime} />
            )}
          </div>

          {!setupComplete && (
            <div className="ws-field">
              <label><span className="ws-step-num">3</span> File ghi âm <span className="ws-req">*</span></label>
              <div className={`ws-drop ${file ? 'has-file' : ''} ${!customer || !recordingTime ? 'disabled' : ''}`}>
                <input
                  type="file"
                  accept="audio/*"
                  id="ws-file"
                  onChange={(e) => handleFile(e.target.files[0])}
                  disabled={!customer || !recordingTime}
                  style={{ display: 'none' }}
                />
                <label htmlFor="ws-file">
                  {file ? (
                    <>
                      <IconAnalyze size={22} />
                      <b>{file.name}</b>
                      <small>{(file.size / 1024 / 1024).toFixed(2)} MB</small>
                    </>
                  ) : (
                    <>
                      <IconPaperclip size={26} />
                      <b>Chọn / kéo thả file audio</b>
                      <small>
                        {!customer ? 'Cần chọn KH trước' :
                         !recordingTime ? 'Cần nhập thời gian' :
                         'MP3, WAV, M4A'}
                      </small>
                    </>
                  )}
                </label>
              </div>
            </div>
          )}

          {!setupComplete && (
            <button className="ws-start-btn" onClick={startAnalysis} disabled={!canAnalyze}>
              {analyzing
                ? <><IconLoader size={15} className="spin" /> Đang phân tích...</>
                : <><IconSparkles size={15} /> Bắt đầu phân tích</>}
            </button>
          )}
          {setupComplete && (
            <button className="ws-reset-btn" onClick={resetForNewCall}>
              <IconArrowLeft size={13} /> Phân tích cuộc gọi khác
            </button>
          )}

          {error && <div className="ws-err"><IconAlert size={14} /> {error}</div>}
        </div>

        {/* Chat — only after analysis */}
        {setupComplete && (
          <InlineChat
            customerId={customer?.id}
            callContext={customer?.name ? `KH ${customer.name}` : ''}
            onCitationClick={(c) => c.timestamp_sec && jumpTo(c.timestamp_sec)}
          />
        )}
      </aside>

      {/* RIGHT CANVAS */}
      <main className="ws-right">
        {analyzing ? (
          <div className="ws-canvas-progress">
            <AnalysisProgress events={progressEvents} />
          </div>
        ) : !setupComplete ? (
          <div className="ws-canvas-empty">
            <div className="ws-canvas-icon"><IconSparkles size={48} strokeWidth={1.5} /></div>
            <h2>Canvas phân tích</h2>
            <p>Hoàn tất <b>3 bước thiết lập</b> bên trái — Agent sẽ phân tích cuộc gọi và hiển thị kết quả đầy đủ tại đây.</p>
            <ul className="ws-checklist">
              <li className={customer ? 'done' : ''}>
                {customer ? <IconCheck size={14} /> : <span className="ws-bullet" />}
                Chọn khách hàng
              </li>
              <li className={recordingTime ? 'done' : ''}>
                {recordingTime ? <IconCheck size={14} /> : <span className="ws-bullet" />}
                Nhập thời gian ghi âm
              </li>
              <li className={file ? 'done' : ''}>
                {file ? <IconCheck size={14} /> : <span className="ws-bullet" />}
                Upload file audio
              </li>
            </ul>
          </div>
        ) : (
          <CanvasView
            analysis={analysis}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            activeSeg={activeSeg}
            audioRef={waveRef}
            onJump={jumpTo}
            hasAudio={!!audioUrl}
            audioUrl={audioUrl}
            ragUsed={analysis?.rag_context_used}
          />
        )}
      </main>
    </div>
  );
}
