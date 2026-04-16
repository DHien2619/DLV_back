import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import WaveSurfer from 'wavesurfer.js';
import BatchUpload from './BatchUpload';
import TodayDashboard from './TodayDashboard';
import './CallAnalyzer.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

// ---------- helpers ----------
const fmtTime = (sec) => {
  const s = Math.max(0, Math.floor(sec || 0));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const fmtVND = (v) => new Intl.NumberFormat('vi-VN').format(v || 0) + 'đ';
const gradeColor = (g) => ({ A: '#16a34a', B: '#65a30d', C: '#eab308', D: '#f97316', F: '#dc2626' }[g] || '#64748b');
const sevColor = (s) => ({ red: '#dc2626', orange: '#f97316', yellow: '#eab308', clean: '#16a34a' }[s] || '#64748b');
const momentEmoji = {
  buying_signal: '💰', objection: '🛑', adverse_event: '⚠️', commitment: '✅',
  question_unanswered: '❓', price_mention: '💵', competitor_mention: '🥊', emotional_peak: '💥'
};
const phaseLabel = {
  opening: 'Mở đầu', discovery: 'Khám phá nhu cầu', pitch: 'Giới thiệu SP',
  objection_handling: 'Xử lý phản đối', close: 'Chốt đơn', wrap_up: 'Kết thúc'
};

// --- Customer Picker (autocomplete search + quick create) ---
function CustomerPicker({ value, onChange }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!q || q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const res = await fetch(`${API_URL}/api/v2/customers?q=${encodeURIComponent(q)}&limit=8`);
      setResults(await res.json());
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  if (value) {
    return (
      <div className="ca-picked">
        <span>👤 <b>{value.name}</b> {value.phone && `· ${value.phone}`}</span>
        <button onClick={() => onChange(null)} className="ca-btn-ghost" style={{ padding: '4px 10px' }}>Đổi</button>
      </div>
    );
  }

  const createQuick = async () => {
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
    <div className="ca-picker">
      <input
        placeholder="Tìm KH (tên / SĐT / mã) hoặc để trống để auto-match..."
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 200)}
      />
      {open && (results.length > 0 || q.length >= 2) && (
        <div className="ca-picker-dd">
          {results.map(c => (
            <div key={c.id} className="ca-picker-item" onClick={() => { onChange(c); setQ(''); }}>
              <b>{c.name}</b>
              <span>{c.phone || '—'} · {c.code || '—'}</span>
            </div>
          ))}
          {q.length >= 2 && !results.find(r => r.name === q) && (
            <div className="ca-picker-item ca-picker-create" onClick={createQuick}>
              {creating ? '⏳ Đang tạo...' : `+ Tạo KH mới: "${q}"`}
            </div>
          )}
        </div>
      )}
      <small className="ca-picker-hint">Không chọn = Agent sẽ tự match KH sau khi diarize</small>
    </div>
  );
}

export default function CallAnalyzer() {
  const [file, setFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState('');
  const [customer, setCustomer] = useState(null);
  const [showMatches, setShowMatches] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const waveRef = useRef(null);
  const wavesurferRef = useRef(null);
  const transcriptRef = useRef(null);

  // ---------- wavesurfer setup ----------
  useEffect(() => {
    if (!audioUrl || !waveRef.current) return;
    const ws = WaveSurfer.create({
      container: waveRef.current,
      waveColor: '#94a3b8',
      progressColor: '#2563eb',
      cursorColor: '#dc2626',
      height: 64,
      barWidth: 2,
      barRadius: 2
    });
    ws.load(audioUrl);
    ws.on('ready', () => setDuration(ws.getDuration()));
    ws.on('audioprocess', () => setCurrentTime(ws.getCurrentTime()));
    ws.on('seeking', () => setCurrentTime(ws.getCurrentTime()));
    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));
    ws.on('finish', () => setIsPlaying(false));
    wavesurferRef.current = ws;
    return () => { try { ws.destroy(); } catch (_) {} };
  }, [audioUrl]);

  // ---------- auto-scroll transcript to current segment ----------
  useEffect(() => {
    if (!analysis?.diarized?.segments || !transcriptRef.current) return;
    const active = analysis.diarized.segments.findIndex(
      s => currentTime >= s.start_sec && currentTime < s.end_sec
    );
    if (active < 0) return;
    const el = transcriptRef.current.querySelector(`[data-seg="${active}"]`);
    if (el) {
      const container = transcriptRef.current;
      const top = el.offsetTop - container.offsetTop - 80;
      if (Math.abs(container.scrollTop - top) > 150) {
        container.scrollTo({ top, behavior: 'smooth' });
      }
    }
  }, [currentTime, analysis]);

  // ---------- actions ----------
  const handleFile = (f) => {
    if (!f) return;
    setFile(f);
    setAudioUrl(URL.createObjectURL(f));
    setAnalysis(null);
    setError(null);
  };

  const runAnalysis = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setProgress('Đang upload & phiên âm (30-60s)...');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (user?.id) fd.append('userId', user.id);
      if (customer?.id) fd.append('customerId', customer.id);

      const res = await fetch(`${API_URL}/api/v2/calls/analyze-v2`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Analyze failed');
      setAnalysis(data);
      setProgress('');
      if (!customer && data.match_candidates?.candidates?.length > 0) {
        setShowMatches(true);
      }
    } catch (e) {
      setError(e.message);
      setProgress('');
    } finally {
      setLoading(false);
    }
  };

  const assignCustomer = async (candidateId) => {
    if (!analysis?.saved_call_id) return;
    setAssigning(true);
    try {
      const res = await fetch(`${API_URL}/api/v2/calls2/${analysis.saved_call_id}/assign-customer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: candidateId })
      });
      if (res.ok) {
        setShowMatches(false);
        alert('Đã gán KH. Memory & chunks đã link tự động.');
      }
    } finally { setAssigning(false); }
  };

  const jumpTo = (sec) => {
    if (!wavesurferRef.current || !duration) return;
    wavesurferRef.current.setTime(sec);
    if (!isPlaying) wavesurferRef.current.play();
  };

  const togglePlay = () => wavesurferRef.current?.playPause();

  // ---------- derived ----------
  const activeSegIdx = useMemo(() => {
    if (!analysis?.diarized?.segments) return -1;
    return analysis.diarized.segments.findIndex(
      s => currentTime >= s.start_sec && currentTime < s.end_sec
    );
  }, [currentTime, analysis]);

  // ---------- render ----------
  if (!analysis && !loading) {
    return (
      <div className="ca-home">
        {/* Compact branding strip */}
        <div className="ca-brand-strip">
          <div className="ca-brand-left">
            <b>PharmaVoice</b>
            <span>AI Sales Intelligence cho dược phẩm</span>
          </div>
          <div className="ca-brand-right">
            <Link to="/customers" className="ca-brand-link">👥 Khách hàng</Link>
          </div>
        </div>

        {/* Today Dashboard — rep home */}
        <TodayDashboard onUploadClick={() => {
          document.getElementById('ca-batch-upload-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          // Delay file picker until scroll finishes so user sees context
          setTimeout(() => {
            const fileInput = document.querySelector('.bu-drop input[type="file"]');
            fileInput?.click();
          }, 400);
        }} />

        {/* Anchor for scroll */}
        <div id="ca-batch-upload-anchor" style={{ height: 1 }} />

        {/* Batch upload panel */}
        <section className="ca-upload-section">
          <div className="ca-upload-head-v2">
            <div>
              <h2>📎 Upload & phân tích</h2>
              <p>Kéo thả nhiều file cùng lúc — xử lý song song 3 file. Chọn KH bên dưới để bật RAG context.</p>
            </div>
          </div>

          <div className="ca-upload-cust">
            <label className="ca-picker-label">Gán cho khách hàng <small>(optional)</small></label>
            <CustomerPicker value={customer} onChange={setCustomer} />
          </div>

          <BatchUpload customerId={customer?.id} />

          {error && <div className="ca-error">⚠️ {error}</div>}
        </section>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="ca-root">
        <div className="ca-loading">
          <div className="ca-spinner" />
          <h2>Agent đang phân tích...</h2>
          <p>{progress}</p>
          <p className="ca-loading-steps">
            Diarize transcript → Quality Rubric → Needs → Opportunity → Compliance → Structure
          </p>
        </div>
      </div>
    );
  }

  const { diarized, quality, needs, opportunity, compliance, structure, total_ms } = analysis;

  return (
    <div className="ca-root ca-result">
      {/* Top bar */}
      <div className="ca-topbar">
        <div>
          <h2 style={{ margin: 0 }}>🎙️ {file?.name || 'Call Analysis'}</h2>
          <small>
            {diarized?.segments?.length || 0} segments · {(total_ms / 1000).toFixed(1)}s analysis
            {analysis.rag_context_used && <span className="ca-rag-badge"> 🧠 RAG context active</span>}
            {analysis.customer_id && <span className="ca-customer-badge"> · Linked to KH</span>}
          </small>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <Link to="/customers" className="ca-btn-ghost">👥 Customers</Link>
          <button className="ca-btn-ghost" onClick={() => { setAnalysis(null); setFile(null); setAudioUrl(null); setCustomer(null); setShowMatches(false); }}>
            ← Cuộc gọi khác
          </button>
        </div>
      </div>

      {/* Match candidates banner */}
      {showMatches && analysis.match_candidates?.candidates?.length > 0 && (
        <div className="ca-match-banner">
          <div>
            <b>🔍 Agent gợi ý {analysis.match_candidates.candidates.length} KH khớp:</b>
            {analysis.match_candidates.hints && (
              <small style={{ display: 'block', marginTop: 4 }}>
                Hints: {Object.entries(analysis.match_candidates.hints)
                  .filter(([_, v]) => v)
                  .map(([k, v]) => `${k}="${v}"`).join(', ') || '—'}
              </small>
            )}
          </div>
          <div className="ca-match-list">
            {analysis.match_candidates.candidates.map(c => (
              <button
                key={c.customer.id}
                className="ca-match-btn"
                disabled={assigning}
                onClick={() => assignCustomer(c.customer.id)}
              >
                <b>{c.customer.name}</b>
                <span>{c.customer.phone || '—'} · score {c.score.toFixed(2)}</span>
                <small>{c.reasons.join(', ')}</small>
              </button>
            ))}
            <button className="ca-match-dismiss" onClick={() => setShowMatches(false)}>Bỏ qua</button>
          </div>
        </div>
      )}

      {/* Audio player */}
      <div className="ca-player">
        <button className="ca-play-btn" onClick={togglePlay}>
          {isPlaying ? '⏸' : '▶'}
        </button>
        <div className="ca-wave" ref={waveRef} />
        <div className="ca-time">{fmtTime(currentTime)} / {fmtTime(duration)}</div>
      </div>

      {/* Main 3-col grid */}
      <div className="ca-grid">
        {/* LEFT: Transcript */}
        <div className="ca-col ca-col-transcript">
          <h3>📝 Transcript</h3>
          <div className="ca-transcript" ref={transcriptRef}>
            {diarized?.segments?.map((s, i) => (
              <div
                key={i}
                data-seg={i}
                className={`ca-seg ca-seg-${s.speaker.toLowerCase()} ${activeSegIdx === i ? 'active' : ''}`}
                onClick={() => jumpTo(s.start_sec)}
              >
                <div className="ca-seg-head">
                  <span className="ca-seg-speaker">{s.speaker === 'AGENT' ? '👨‍⚕️ Agent' : s.speaker === 'CUSTOMER' ? '👤 KH' : '❓'}</span>
                  <span className="ca-seg-time">{fmtTime(s.start_sec)}</span>
                </div>
                <div className="ca-seg-text">{s.text}</div>
              </div>
            ))}
          </div>
        </div>

        {/* MIDDLE: Insights */}
        <div className="ca-col ca-col-insights">
          {/* Summary */}
          {structure && !structure.error && (
            <section className="ca-card">
              <h3>📄 Tóm tắt</h3>
              <p className="ca-summary-short">{structure.summary_short}</p>
              <p className="ca-summary-detail">{structure.summary_detailed}</p>
            </section>
          )}

          {/* Rubric */}
          {quality && !quality.error && (
            <section className="ca-card">
              <div className="ca-card-head">
                <h3>📊 Chất lượng tư vấn</h3>
                <div className="ca-grade" style={{ background: gradeColor(quality.overall_grade) }}>
                  {quality.overall_grade} · {quality.total_score}/100
                </div>
              </div>
              <div className="ca-rubric">
                {[
                  ['identity_verification', 'Xác minh danh tính'],
                  ['medical_discovery', 'Khám phá y khoa'],
                  ['indication_appropriateness', 'Phù hợp chỉ định'],
                  ['side_effects_disclosure', 'Disclose tác dụng phụ'],
                  ['dosage_clarity', 'Liều & cách dùng'],
                  ['drug_interaction_check', 'Check tương tác'],
                  ['empathy_listening', 'Empathy & lắng nghe'],
                  ['professional_close', 'Close chuyên nghiệp'],
                  ['compliance_language', 'Ngôn ngữ tuân thủ']
                ].map(([k, label]) => {
                  const x = quality[k];
                  if (!x) return null;
                  const pct = (x.score / x.max) * 100;
                  return (
                    <div key={k} className="ca-rubric-row">
                      <div className="ca-rubric-top">
                        <span>{label}</span>
                        <b>{x.score}/{x.max}</b>
                      </div>
                      <div className="ca-rubric-bar">
                        <div style={{ width: `${pct}%`, background: pct >= 70 ? '#16a34a' : pct >= 40 ? '#eab308' : '#dc2626' }} />
                      </div>
                      <div className="ca-rubric-reason">{x.reasoning}</div>
                      {x.evidence?.[0] && (
                        <button className="ca-evidence" onClick={() => jumpTo(x.evidence[0].timestamp_sec)}>
                          🔗 {fmtTime(x.evidence[0].timestamp_sec)} · "{x.evidence[0].quote.slice(0, 70)}{x.evidence[0].quote.length > 70 ? '…' : ''}"
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="ca-strengths">
                <div>
                  <h4>✅ Điểm mạnh</h4>
                  <ul>{quality.top_strengths?.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
                <div>
                  <h4>🎯 Cần cải thiện</h4>
                  <ul>{quality.top_improvements?.map((s, i) => <li key={i}>{s}</li>)}</ul>
                </div>
              </div>
            </section>
          )}

          {/* Opportunity */}
          {opportunity && !opportunity.error && (
            <section className="ca-card">
              <div className="ca-card-head">
                <h3>💰 Cơ hội bán hàng</h3>
                <div className="ca-stage-badge" data-stage={opportunity.stage}>
                  {opportunity.score}/100 · {opportunity.stage}
                </div>
              </div>
              <div className="ca-oppo-row">
                <div><small>Giá trị ước tính</small><b>{fmtVND(opportunity.estimated_value_vnd)}</b></div>
                <div><small>Close timing</small><b>{opportunity.close_timing_days ? `${opportunity.close_timing_days} ngày` : '—'}</b></div>
                <div><small>Tin cậy</small><b>{Math.round((opportunity.confidence || 0) * 100)}%</b></div>
              </div>
              <div className="ca-nba">
                <h4>🎯 Next best action</h4>
                <p>{opportunity.next_best_action}</p>
              </div>
              {opportunity.buying_signals?.length > 0 && (
                <div>
                  <h4>Buying signals ({opportunity.buying_signals.length})</h4>
                  {opportunity.buying_signals.map((s, i) => (
                    <button key={i} className="ca-chip ca-chip-signal" onClick={() => jumpTo(s.timestamp_sec)}>
                      💰 {fmtTime(s.timestamp_sec)} [{s.strength}] {s.signal_type} — "{s.quote.slice(0, 50)}…"
                    </button>
                  ))}
                </div>
              )}
              {opportunity.objections?.length > 0 && (
                <div>
                  <h4>Objections ({opportunity.objections.length})</h4>
                  {opportunity.objections.map((o, i) => (
                    <button key={i} className={`ca-chip ca-chip-objection ${o.handled_well ? 'handled' : 'missed'}`} onClick={() => jumpTo(o.timestamp_sec)}>
                      {o.handled_well ? '✅' : '❌'} {fmtTime(o.timestamp_sec)} {o.objection_type} — {o.agent_response_note}
                    </button>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Compliance */}
          {compliance && !compliance.error && (
            <section className="ca-card">
              <div className="ca-card-head">
                <h3>⚠️ Compliance</h3>
                <div className="ca-compliance-status" style={{ background: sevColor(compliance.overall_status) }}>
                  {compliance.overall_status.toUpperCase()}
                </div>
              </div>
              {compliance.events?.length === 0 ? (
                <p className="ca-clean">✅ Không phát hiện vi phạm tuân thủ.</p>
              ) : (
                compliance.events.map((e, i) => (
                  <div key={i} className={`ca-compliance-event sev-${e.severity}`} onClick={() => jumpTo(e.timestamp_sec)}>
                    <div className="ca-ce-head">
                      <span className="ca-ce-badge" style={{ background: sevColor(e.severity) }}>{e.severity.toUpperCase()}</span>
                      <b>{e.event_type}</b>
                      <span className="ca-ce-time">{fmtTime(e.timestamp_sec)}</span>
                    </div>
                    <div className="ca-ce-quote">"{e.quote}"</div>
                    <div className="ca-ce-why"><b>Lý do:</b> {e.explanation}</div>
                    <div className="ca-ce-action"><b>Xử lý:</b> {e.recommended_action}</div>
                  </div>
                ))
              )}
            </section>
          )}

          {/* Needs */}
          {needs && !needs.error && (
            <section className="ca-card">
              <h3>🧠 Nhu cầu khách hàng</h3>
              {needs.medical_conditions?.length > 0 && (
                <div className="ca-needs-block">
                  <h4>🏥 Tình trạng sức khỏe</h4>
                  {needs.medical_conditions.map((c, i) => (
                    <div key={i} className="ca-need-item">
                      <b>{c.name}</b> <span className={`ca-sev ${c.severity}`}>{c.severity}</span>
                      {c.duration && <span> · {c.duration}</span>}
                      {c.evidence_quote && <div className="ca-evidence-quote">"{c.evidence_quote}"</div>}
                    </div>
                  ))}
                </div>
              )}
              {needs.current_medications?.length > 0 && (
                <div className="ca-needs-block">
                  <h4>💊 Thuốc đang dùng</h4>
                  {needs.current_medications.map((m, i) => (
                    <div key={i} className="ca-need-item">
                      <b>{m.name}</b> {m.effectiveness && <span className={`ca-eff ${m.effectiveness}`}>{m.effectiveness}</span>}
                      {m.evidence_quote && <div className="ca-evidence-quote">"{m.evidence_quote}"</div>}
                    </div>
                  ))}
                </div>
              )}
              {needs.budget_signals && (
                <div className="ca-needs-block">
                  <h4>💵 Tín hiệu ngân sách</h4>
                  <p>Độ nhạy giá: <b>{needs.budget_signals.price_sensitivity}</b> ({needs.budget_signals.mentions_count} mentions)</p>
                  <p>{needs.budget_signals.notes}</p>
                </div>
              )}
              {needs.decision_style && (
                <div className="ca-needs-block">
                  <h4>🧭 Phong cách quyết định</h4>
                  <p>{needs.decision_style}</p>
                </div>
              )}
              {needs.family_context && (
                <div className="ca-needs-block">
                  <h4>👨‍👩‍👧 Bối cảnh gia đình</h4>
                  <p>{needs.family_context}</p>
                </div>
              )}
            </section>
          )}
        </div>

        {/* RIGHT: Timeline + moments */}
        <div className="ca-col ca-col-timeline">
          {structure && !structure.error && (
            <>
              <section className="ca-card">
                <h3>📞 Talk ratio</h3>
                <div className="ca-ratio">
                  <div className="ca-ratio-bar">
                    <div className="ca-ratio-agent" style={{ width: `${structure.talk_ratio?.agent_pct || 0}%` }}>
                      Agent {structure.talk_ratio?.agent_pct || 0}%
                    </div>
                    <div className="ca-ratio-customer" style={{ width: `${structure.talk_ratio?.customer_pct || 0}%` }}>
                      KH {structure.talk_ratio?.customer_pct || 0}%
                    </div>
                  </div>
                  <small>{structure.talk_ratio?.assessment}</small>
                </div>
              </section>

              {structure.phases?.length > 0 && (
                <section className="ca-card">
                  <h3>🗂️ Các giai đoạn</h3>
                  <div className="ca-phases">
                    {structure.phases.map((p, i) => (
                      <div key={i} className="ca-phase" onClick={() => jumpTo(p.start_sec)}>
                        <div className="ca-phase-head">
                          <b>{phaseLabel[p.phase] || p.phase}</b>
                          <span>{fmtTime(p.start_sec)}–{fmtTime(p.end_sec)}</span>
                        </div>
                        <p>{p.summary}</p>
                        {p.quality_note && <small>💡 {p.quality_note}</small>}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {structure.moments?.length > 0 && (
                <section className="ca-card">
                  <h3>⏰ Moments</h3>
                  <div className="ca-moments">
                    {structure.moments.map((m, i) => (
                      <div key={i} className="ca-moment" onClick={() => jumpTo(m.timestamp_sec)}>
                        <div className="ca-moment-head">
                          <span className="ca-moment-emoji">{momentEmoji[m.moment_type] || '•'}</span>
                          <b>{m.moment_type}</b>
                          <span>{fmtTime(m.timestamp_sec)}</span>
                        </div>
                        <div className="ca-moment-quote">"{m.quote}"</div>
                        <small>{m.note}</small>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {structure.sentiment_arc?.length > 0 && (
                <section className="ca-card">
                  <h3>😊 Sentiment arc</h3>
                  <div className="ca-sentiment">
                    {structure.sentiment_arc.map((s, i) => (
                      <div key={i} className={`ca-sent-dot sent-${s.sentiment}`} onClick={() => jumpTo(s.timestamp_sec)}>
                        <span>{fmtTime(s.timestamp_sec)}</span>
                        <b>{s.sentiment}</b>
                        {s.note && <small>{s.note}</small>}
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
