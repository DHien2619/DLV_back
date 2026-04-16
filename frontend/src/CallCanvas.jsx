// Shared Canvas tab components — used by CallWorkspace (live analysis)
// and CallDetail (saved call from DB).
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  IconTarget, IconTranscript, IconQuality, IconMoney, IconCompliance, IconMemory,
  IconSparkles, IconScroll, IconClock, IconQuote, IconCheck, IconAlert
} from './icons';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';

// ---------- helpers ----------
export const fmtTime = (sec) => { const s = Math.max(0, Math.floor(sec || 0)); return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`; };
export const fmtVND  = (v) => v ? new Intl.NumberFormat('vi-VN').format(v) + 'đ' : '—';
export const gradeColor = (g) => ({ A:'#16a34a', B:'#65a30d', C:'#eab308', D:'#f97316', F:'#dc2626' }[g] || '#94a3b8');
export const sevColor   = (s) => ({ red:'#dc2626', orange:'#f97316', yellow:'#eab308', clean:'#16a34a' }[s] || '#94a3b8');
export const momentIcon = { buying_signal:'💰', objection:'🛑', adverse_event:'⚠️', commitment:'✅', question_unanswered:'❓', price_mention:'💵', competitor_mention:'🥊', emotional_peak:'💥' };
export const phaseLabel = { opening:'Mở đầu', discovery:'Khám phá', pitch:'Giới thiệu SP', objection_handling:'Xử lý phản đối', close:'Chốt', wrap_up:'Kết thúc' };

export const TABS = [
  { key: 'overview',    label: 'Tổng quan',       Icon: IconTarget },
  { key: 'transcript',  label: 'Phiên âm',        Icon: IconTranscript },
  { key: 'quality',     label: 'Chất lượng',      Icon: IconQuality },
  { key: 'opportunity', label: 'Cơ hội bán hàng', Icon: IconMoney },
  { key: 'compliance',  label: 'Tuân thủ',        Icon: IconCompliance },
  { key: 'needs',       label: 'Nhu cầu KH',      Icon: IconMemory }
];

export const RUBRIC_LABELS = {
  identity_verification: 'Xác minh danh tính',
  medical_discovery: 'Khám phá y khoa',
  indication_appropriateness: 'Phù hợp chỉ định',
  side_effects_disclosure: 'Thông báo tác dụng phụ',
  dosage_clarity: 'Liều & cách dùng',
  drug_interaction_check: 'Kiểm tra tương tác thuốc',
  empathy_listening: 'Đồng cảm & lắng nghe',
  professional_close: 'Kết thúc chuyên nghiệp',
  compliance_language: 'Ngôn ngữ tuân thủ'
};

// ============================================================
// OVERVIEW
// ============================================================
export function CanvasOverview({ analysis, onTabJump }) {
  const { quality, opportunity, compliance, structure } = analysis || {};
  return (
    <div className="cv-over">
      {structure?.summary_short && (
        <div className="cv-card">
          <h3>📄 Tóm tắt</h3>
          <p className="cv-sum-short">{structure.summary_short}</p>
          {structure.summary_detailed && <p className="cv-sum-long">{structure.summary_detailed}</p>}
        </div>
      )}
      <div className="cv-kpi-row">
        <div className="cv-kpi" onClick={() => onTabJump?.('quality')}>
          <small>Chất lượng</small>
          <b style={{ color: gradeColor(quality?.overall_grade) }}>{quality?.overall_grade || '—'}</b>
          <span>{quality?.total_score || 0}/100</span>
        </div>
        <div className="cv-kpi" onClick={() => onTabJump?.('opportunity')}>
          <small>Cơ hội</small>
          <b>{opportunity?.score || 0}</b>
          <span>{opportunity?.stage || '—'}</span>
        </div>
        <div className="cv-kpi" onClick={() => onTabJump?.('opportunity')}>
          <small>Giá trị</small>
          <b style={{ fontSize: 18 }}>{fmtVND(opportunity?.estimated_value_vnd)}</b>
          <span>ước tính</span>
        </div>
        <div className="cv-kpi" onClick={() => onTabJump?.('compliance')}>
          <small>Tuân thủ</small>
          <b style={{ color: sevColor(compliance?.overall_status) }}>
            {compliance?.overall_status === 'clean' ? '✓' : (compliance?.overall_status || '—').toUpperCase()}
          </b>
          <span>{compliance?.events?.length || 0} sự kiện</span>
        </div>
      </div>

      <div className="cv-card">
        <h3>🎯 Hành động tiếp theo</h3>
        <p className="cv-nba">{opportunity?.next_best_action || 'Chưa có gợi ý.'}</p>
      </div>

      {structure?.talk_ratio && (
        <div className="cv-card">
          <h3>🗣 Tỷ lệ nói</h3>
          <div className="cv-ratio">
            <div className="cv-ratio-agent" style={{ width: `${structure.talk_ratio.agent_pct}%` }}>NV {structure.talk_ratio.agent_pct}%</div>
            <div className="cv-ratio-cust" style={{ width: `${structure.talk_ratio.customer_pct}%` }}>KH {structure.talk_ratio.customer_pct}%</div>
          </div>
          <small>{structure.talk_ratio.assessment}</small>
        </div>
      )}

      {structure?.phases?.length > 0 && (
        <div className="cv-card">
          <h3>🗂️ Giai đoạn</h3>
          <div className="cv-phases">
            {structure.phases.map((p, i) => (
              <div key={i} className="cv-phase">
                <b>{phaseLabel[p.phase] || p.phase}</b>
                <small>{fmtTime(p.start_sec)}–{fmtTime(p.end_sec)}</small>
                <p>{p.summary}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {structure?.moments?.length > 0 && (
        <div className="cv-card">
          <h3>⏰ Khoảnh khắc quan trọng</h3>
          {structure.moments.map((m, i) => (
            <button key={i} className="cv-chip cv-chip-signal" onClick={() => onTabJump?.('transcript')}>
              <small>{momentIcon[m.moment_type] || '•'} {m.moment_type} · {fmtTime(m.timestamp_sec)}</small>
              <span>"{m.quote}"</span>
              <small className="cv-chip-note">{m.note}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// TRANSCRIPT with Audio Player
// ============================================================
export function CanvasTranscript({ analysis, activeSeg: externalActiveSeg, audioRef, onJump, hasAudio = true, audioUrl }) {
  const segs = analysis?.diarized?.segments || [];
  const playerRef = useRef(null);
  const listRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [localActiveSeg, setLocalActiveSeg] = useState(-1);

  const canPlay = !!audioUrl;
  const activeSeg = canPlay ? localActiveSeg : externalActiveSeg;

  // Find active segment based on currentTime
  useEffect(() => {
    if (!canPlay || !playing) return;
    const idx = segs.findIndex((s, i) => {
      const next = segs[i + 1];
      return currentTime >= (s.start_sec || 0) && (!next || currentTime < (next.start_sec || 0));
    });
    if (idx !== localActiveSeg && idx >= 0) {
      setLocalActiveSeg(idx);
      // Auto-scroll to active segment
      const el = listRef.current?.querySelector(`[data-seg="${idx}"]`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [currentTime, segs, canPlay, playing, localActiveSeg]);

  // Audio event listeners
  useEffect(() => {
    const audio = playerRef.current;
    if (!audio) return;
    const onTime = () => setCurTime(audio.currentTime);
    const onDur = () => setDuration(audio.duration || 0);
    const onEnd = () => setPlaying(false);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onDur);
    audio.addEventListener('durationchange', onDur);
    audio.addEventListener('ended', onEnd);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    return () => {
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onDur);
      audio.removeEventListener('durationchange', onDur);
      audio.removeEventListener('ended', onEnd);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
    };
  }, [audioUrl]);

  const togglePlay = useCallback(() => {
    const a = playerRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }, []);

  const seekTo = useCallback((sec) => {
    const a = playerRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, sec);
    if (a.paused) a.play().catch(() => {});
  }, []);

  const skip = useCallback((delta) => {
    const a = playerRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + delta));
  }, []);

  const toggleMute = useCallback(() => {
    const a = playerRef.current;
    if (!a) return;
    a.muted = !a.muted;
    setMuted(a.muted);
  }, []);

  const cycleSpeed = useCallback(() => {
    const a = playerRef.current;
    if (!a) return;
    const rates = [0.75, 1, 1.25, 1.5, 2];
    const next = rates[(rates.indexOf(speed) + 1) % rates.length];
    a.playbackRate = next;
    setSpeed(next);
  }, [speed]);

  const onProgressClick = useCallback((e) => {
    const a = playerRef.current;
    if (!a || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    a.currentTime = pct * duration;
  }, [duration]);

  const handleSegClick = useCallback((seg, idx) => {
    if (canPlay) {
      seekTo(seg.start_sec || 0);
      setLocalActiveSeg(idx);
    } else {
      onJump?.(seg.start_sec);
    }
  }, [canPlay, seekTo, onJump]);

  return (
    <div className="cv-tr">
      {/* Hidden audio element */}
      {canPlay && <audio ref={playerRef} src={audioUrl} preload="metadata" />}

      {/* Sticky audio player */}
      {canPlay ? (
        <div className="cv-player">
          <div className="cv-player-controls">
            <button className="cv-player-btn" onClick={() => skip(-10)} title="-10s">
              <SkipBack size={16} strokeWidth={2}/>
            </button>
            <button className="cv-player-btn cv-player-play" onClick={togglePlay}>
              {playing ? <Pause size={20} strokeWidth={2.5}/> : <Play size={20} strokeWidth={2.5}/>}
            </button>
            <button className="cv-player-btn" onClick={() => skip(10)} title="+10s">
              <SkipForward size={16} strokeWidth={2}/>
            </button>
          </div>

          <div className="cv-player-middle">
            <span className="cv-player-time">{fmtTime(currentTime)}</span>
            <div className="cv-player-progress" onClick={onProgressClick}>
              <div className="cv-player-bar" style={{ width: duration ? `${(currentTime / duration) * 100}%` : '0%' }}/>
            </div>
            <span className="cv-player-time">{fmtTime(duration)}</span>
          </div>

          <div className="cv-player-right">
            <button className="cv-player-btn cv-player-speed" onClick={cycleSpeed} title="Tốc độ">
              {speed}x
            </button>
            <button className="cv-player-btn" onClick={toggleMute} title={muted ? 'Bật tiếng' : 'Tắt tiếng'}>
              {muted ? <VolumeX size={16} strokeWidth={2}/> : <Volume2 size={16} strokeWidth={2}/>}
            </button>
          </div>
        </div>
      ) : (
        <div className="cv-tr-no-audio">
          📎 File audio không còn (đã xử lý xong). Transcript với timestamp vẫn đầy đủ.
        </div>
      )}

      {/* Transcript list */}
      <div className="cv-tr-list" ref={listRef}>
        {segs.map((s, i) => (
          <div
            key={i}
            data-seg={i}
            className={`cv-seg cv-seg-${s.speaker.toLowerCase()} ${activeSeg === i ? 'active' : ''}`}
            onClick={() => handleSegClick(s, i)}
          >
            <div className="cv-seg-head">
              <span className="cv-seg-speaker">{s.speaker === 'AGENT' ? '👨‍⚕️ Agent' : s.speaker === 'CUSTOMER' ? '👤 KH' : '❓'}</span>
              <div className="cv-seg-actions">
                {canPlay && (
                  <button
                    className="cv-seg-play"
                    onClick={(e) => { e.stopPropagation(); seekTo(s.start_sec || 0); }}
                    title="Phát từ đây"
                  >
                    {activeSeg === i && playing ? <Pause size={13} strokeWidth={2.5}/> : <Play size={13} strokeWidth={2.5}/>}
                  </button>
                )}
                <span className="cv-seg-time">{fmtTime(s.start_sec)}</span>
              </div>
            </div>
            <div className="cv-seg-text">{s.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// QUALITY
// ============================================================
export function CanvasQuality({ analysis, onJump }) {
  const q = analysis?.quality;
  if (!q || q.error) return <div className="cv-empty">Không có dữ liệu chất lượng.</div>;
  return (
    <div className="cv-q">
      <div className="cv-q-head">
        <div className="cv-q-grade" style={{ background: gradeColor(q.overall_grade) }}>
          {q.overall_grade} · {q.total_score}/100
        </div>
        <div className="cv-q-lists">
          <div><h4>✅ Điểm mạnh</h4><ul>{q.top_strengths?.map((s,i) => <li key={i}>{s}</li>)}</ul></div>
          <div><h4>🎯 Cần cải thiện</h4><ul>{q.top_improvements?.map((s,i) => <li key={i}>{s}</li>)}</ul></div>
        </div>
      </div>
      <div className="cv-q-rubric">
        {Object.entries(RUBRIC_LABELS).map(([k, label]) => {
          const x = q[k]; if (!x) return null;
          const pct = (x.score / x.max) * 100;
          return (
            <div key={k} className="cv-q-row">
              <div className="cv-q-row-head">
                <span>{label}</span>
                <b>{x.score}/{x.max}</b>
              </div>
              <div className="cv-q-bar"><div style={{ width: `${pct}%`, background: pct >= 70 ? '#16a34a' : pct >= 40 ? '#eab308' : '#dc2626' }}/></div>
              <small>{x.reasoning}</small>
              {x.evidence?.[0] && (
                <button className="cv-evidence" onClick={() => onJump?.(x.evidence[0].timestamp_sec)}>
                  🔗 {fmtTime(x.evidence[0].timestamp_sec)} · "{x.evidence[0].quote.slice(0, 80)}"
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// OPPORTUNITY
// ============================================================
export function CanvasOpportunity({ analysis, onJump }) {
  const o = analysis?.opportunity;
  if (!o || o.error) return <div className="cv-empty">Không có dữ liệu.</div>;
  return (
    <div className="cv-opp">
      <div className="cv-opp-head">
        <div><small>Giai đoạn</small><b data-stage={o.stage}>{o.stage}</b></div>
        <div><small>Điểm</small><b>{o.score}/100</b></div>
        <div><small>Giá trị</small><b>{fmtVND(o.estimated_value_vnd)}</b></div>
        <div><small>Tin cậy</small><b>{Math.round((o.confidence || 0) * 100)}%</b></div>
      </div>
      <div className="cv-card cv-nba-card">
        <h4>🎯 Hành động tiếp theo</h4>
        <p>{o.next_best_action}</p>
      </div>
      {o.buying_signals?.length > 0 && (
        <div className="cv-card">
          <h4>📡 Tín hiệu mua ({o.buying_signals.length})</h4>
          {o.buying_signals.map((s, i) => (
            <button key={i} className="cv-chip cv-chip-signal" onClick={() => onJump?.(s.timestamp_sec)}>
              <small>[{s.strength}] {s.signal_type} · {fmtTime(s.timestamp_sec)}</small>
              <span>"{s.quote}"</span>
            </button>
          ))}
        </div>
      )}
      {o.objections?.length > 0 && (
        <div className="cv-card">
          <h4>🛑 Phản đối ({o.objections.length})</h4>
          {o.objections.map((ob, i) => (
            <button key={i} className={`cv-chip ${ob.handled_well ? 'cv-chip-handled' : 'cv-chip-missed'}`} onClick={() => onJump?.(ob.timestamp_sec)}>
              <small>{ob.handled_well ? '✅' : '❌'} {ob.objection_type} · {fmtTime(ob.timestamp_sec)}</small>
              <span>"{ob.quote}"</span>
              <small className="cv-chip-note">{ob.agent_response_note}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// COMPLIANCE
// ============================================================
export function CanvasCompliance({ analysis, onJump }) {
  const c = analysis?.compliance;
  if (!c || c.error) return <div className="cv-empty">Không có dữ liệu.</div>;
  return (
    <div className="cv-comp">
      <div className="cv-comp-head" style={{ background: sevColor(c.overall_status) }}>
        <b>{c.overall_status === 'clean' ? '✅ CLEAN' : c.overall_status.toUpperCase()}</b>
        <span>{c.events?.length || 0} sự kiện phát hiện</span>
      </div>
      {c.events?.length === 0 ? (
        <p className="cv-empty">✅ Không phát hiện vi phạm nào.</p>
      ) : (
        c.events.map((e, i) => (
          <div key={i} className={`cv-comp-event sev-${e.severity}`} onClick={() => onJump?.(e.timestamp_sec)}>
            <div className="cv-comp-head-row">
              <span className="cv-comp-badge" style={{ background: sevColor(e.severity) }}>{e.severity.toUpperCase()}</span>
              <b>{e.event_type}</b>
              <small>{fmtTime(e.timestamp_sec)}</small>
            </div>
            <blockquote>"{e.quote}"</blockquote>
            <div className="cv-comp-why"><b>Lý do:</b> {e.explanation}</div>
            <div className="cv-comp-act"><b>Xử lý:</b> {e.recommended_action}</div>
          </div>
        ))
      )}
    </div>
  );
}

// ============================================================
// NEEDS
// ============================================================
export function CanvasNeeds({ analysis }) {
  const n = analysis?.needs;
  if (!n || n.error) return <div className="cv-empty">Không có dữ liệu.</div>;
  const blocks = [
    { key: 'medical_conditions', label: '🏥 Tình trạng sức khỏe', render: (arr) => arr.map((x,i) => (
        <div key={i} className="cv-need"><b>{x.name}</b> <span className={`cv-sev ${x.severity}`}>{x.severity}</span>
          {x.duration && <small> · {x.duration}</small>}
          {x.evidence_quote && <div className="cv-need-q">"{x.evidence_quote}"</div>}
        </div>
      ))},
    { key: 'current_medications', label: '💊 Thuốc đang dùng', render: (arr) => arr.map((x,i) => (
        <div key={i} className="cv-need"><b>{x.name}</b>
          {x.effectiveness && <span className={`cv-eff ${x.effectiveness}`}>{x.effectiveness}</span>}
          {x.evidence_quote && <div className="cv-need-q">"{x.evidence_quote}"</div>}
        </div>
      ))},
    { key: 'allergies', label: '⚠️ Dị ứng', render: (arr) => arr.length ? <ul>{arr.map((a,i)=><li key={i}>{a}</li>)}</ul> : <small>—</small> },
    { key: 'lifestyle_factors', label: '🏃 Lối sống', render: (arr) => arr.length ? <ul>{arr.map((a,i)=><li key={i}>{a}</li>)}</ul> : <small>—</small> },
    { key: 'unmet_needs', label: '❗ Nhu cầu chưa đáp ứng', render: (arr) => arr.map((x,i) => (
        <div key={i} className="cv-need"><b>{x.need}</b> <span className={`cv-sev ${x.urgency}`}>{x.urgency}</span>
          <div className="cv-need-q">"{x.evidence_quote}"</div>
        </div>
      ))}
  ];
  return (
    <div className="cv-needs">
      {blocks.map(b => {
        const arr = n[b.key] || [];
        if (!arr.length && b.key !== 'allergies') return null;
        return <div key={b.key} className="cv-card"><h4>{b.label}</h4>{b.render(arr)}</div>;
      })}
      {n.budget_signals && (
        <div className="cv-card">
          <h4>💵 Tín hiệu ngân sách</h4>
          <p>Độ nhạy giá: <b>{n.budget_signals.price_sensitivity}</b> ({n.budget_signals.mentions_count} mentions)</p>
          {n.budget_signals.notes && <p>{n.budget_signals.notes}</p>}
        </div>
      )}
      {n.decision_style && <div className="cv-card"><h4>🧭 Phong cách quyết định</h4><p>{n.decision_style}</p></div>}
      {n.family_context && <div className="cv-card"><h4>👨‍👩‍👧 Gia đình</h4><p>{n.family_context}</p></div>}
    </div>
  );
}

// ============================================================
// CANVAS ROOT — renders tabs + active content
// ============================================================
export function CanvasView({ analysis, activeTab, onTabChange, activeSeg, audioRef, onJump, hasAudio = true, ragUsed = false, audioUrl }) {
  return (
    <>
      <div className="ws-canvas-tabs">
        {TABS.map(t => (
          <button
            key={t.key}
            className={`ws-tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => onTabChange(t.key)}
          >
            <t.Icon size={15} />
            <span>{t.label}</span>
          </button>
        ))}
        {ragUsed && <span className="ws-rag-badge"><IconSparkles size={12} /> Ngữ cảnh lịch sử</span>}
      </div>
      <div className="ws-canvas-content">
        {activeTab === 'overview'    && <CanvasOverview analysis={analysis} onTabJump={onTabChange} />}
        {activeTab === 'transcript'  && <CanvasTranscript analysis={analysis} activeSeg={activeSeg} audioRef={audioRef} onJump={onJump} hasAudio={hasAudio} audioUrl={audioUrl} />}
        {activeTab === 'quality'     && <CanvasQuality analysis={analysis} onJump={onJump} />}
        {activeTab === 'opportunity' && <CanvasOpportunity analysis={analysis} onJump={onJump} />}
        {activeTab === 'compliance'  && <CanvasCompliance analysis={analysis} onJump={onJump} />}
        {activeTab === 'needs'       && <CanvasNeeds analysis={analysis} />}
      </div>
    </>
  );
}
