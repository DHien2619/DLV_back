import React, { useMemo } from 'react';
import { IconArrowRight, IconChartLine, IconCheck, IconClose, IconLayers, IconMemory, IconMoney, IconSearch, IconWarning, IconZap } from './icons';
import './AnalysisProgress.css';

/**
 * Render real-time progress from analyze-stream events.
 *
 * Props:
 *   events: Array of { step, status, ts, ms?, error?, ... }
 *
 * Steps shown (in order):
 *   init           <IconArrowRight size={14}/> Nhận file
 *   upload         <IconArrowRight size={14}/> Upload lên Gemini
 *   diarize        <IconArrowRight size={14}/> Phiên âm & tách speaker
 *   rag-context    <IconArrowRight size={14}/> Load lịch sử KH
 *   matcher        <IconArrowRight size={14}/> Match KH không rõ
 *   skills (parent) với 5 children: quality, needs, opportunity, compliance, structure
 *   persist        <IconArrowRight size={14}/> Lưu vào DB
 *   complete       <IconArrowRight size={14}/> Done
 */

const STAGES = [
  { key: 'init',        icon: '📥', label: 'Nhận file & chuẩn bị' },
  { key: 'upload',      icon: '☁️',  label: 'Tải file lên Gemini' },
  { key: 'diarize',     icon: '🎙️', label: 'Phiên âm & tách speaker (Agent/KH)', longHint: 'Khoảng 15-30 giây' },
  { key: 'rag-context', icon: '', label: 'Tải lịch sử & trí nhớ KH', optional: true },
  { key: 'matcher',     icon: '', label: 'Tìm KH khớp (fuzzy + semantic)', optional: true },
  { key: 'skills',      icon: '⚡', label: 'Phân tích 5 kỹ năng song song', longHint: '~15-30s', hasChildren: true },
  { key: 'persist',     icon: '💾', label: 'Lưu kết quả vào cơ sở dữ liệu' },
  { key: 'complete',    icon: '✓', label: 'Hoàn tất' }
];

const SKILL_ITEMS = [
  { key: 'skill:quality',     icon: '', label: 'Chấm rubric 9 tiêu chí' },
  { key: 'skill:needs',       icon: '', label: 'Trích nhu cầu KH' },
  { key: 'skill:opportunity', icon: '💰', label: 'Phát hiện cơ hội & signals' },
  { key: 'skill:compliance',  icon: '⚠️', label: 'Kiểm tra tuân thủ' },
  { key: 'skill:structure',   icon: '', label: 'Phân đoạn & sentiment arc' }
];

function getStepStatus(events, stepKey) {
  // Find latest event for this step
  let lastEvent = null;
  for (const e of events) {
    if (e.step === stepKey) lastEvent = e;
  }
  if (!lastEvent) return { state: 'pending' };
  if (lastEvent.status === 'start') return { state: 'running', ts: lastEvent.ts };
  if (lastEvent.status === 'done')  return { state: 'done', ts: lastEvent.ts, ms: lastEvent.ms };
  if (lastEvent.status === 'error') return { state: 'error', ts: lastEvent.ts, error: lastEvent.error };
  return { state: 'pending' };
}

function fmtMs(ms) {
  if (!ms) return '';
  if (ms < 1000) return ms + 'ms';
  return (ms / 1000).toFixed(1) + 's';
}

export default function AnalysisProgress({ events = [] }) {
  const now = Date.now();

  const overall = useMemo(() => {
    let done = 0, running = 0, total = 0;
    for (const stage of STAGES) {
      if (stage.key === 'skills') {
        for (const skill of SKILL_ITEMS) {
          total++;
          const st = getStepStatus(events, skill.key);
          if (st.state === 'done') done++;
          if (st.state === 'running') running++;
        }
      } else {
        total++;
        const st = getStepStatus(events, stage.key);
        if (st.state === 'done') done++;
        if (st.state === 'running') running++;
        if (stage.optional && st.state === 'pending') {
          // Skip optional stages from total if not triggered
        }
      }
    }
    return { done, running, total, pct: Math.round((done / total) * 100) };
  }, [events]);

  const firstTs = events[0]?.ts || now;
  const elapsed = now - firstTs;

  return (
    <div className="ap-root">
      <div className="ap-head">
        <div className="ap-head-left">
          <div className="ap-spinner" />
          <div>
            <b>🤖 Agent đang phân tích</b>
            <small>{overall.done}/{overall.total} bước · {fmtMs(elapsed)}</small>
          </div>
        </div>
        <div className="ap-pct">{overall.pct}%</div>
      </div>

      <div className="ap-bar">
        <div className="ap-bar-fill" style={{ width: `${overall.pct}%` }} />
      </div>

      <div className="ap-steps">
        {STAGES.map(stage => {
          const st = getStepStatus(events, stage.key);
          const isSkip = stage.optional && st.state === 'pending';
          if (isSkip) return null;

          // Skills parent: show children inline
          if (stage.hasChildren) {
            const allChildStates = SKILL_ITEMS.map(s => getStepStatus(events, s.key));
            const skillsRunning = allChildStates.some(s => s.state === 'running');
            const skillsDone = allChildStates.every(s => s.state === 'done');
            const parentState = skillsDone ? 'done' : skillsRunning ? 'running' : st.state;
            return (
              <React.Fragment key={stage.key}>
                <div className={`ap-step ap-${parentState}`}>
                  <div className="ap-step-icon">
                    {parentState === 'running' ? <span className="ap-mini-spin"/> :
                     parentState === 'done' ? '✓' :
                     parentState === 'error' ? '✕' : stage.icon}
                  </div>
                  <div className="ap-step-body">
                    <b>{stage.label}</b>
                    {stage.longHint && parentState !== 'done' && <small>{stage.longHint}</small>}
                  </div>
                </div>
                <div className="ap-skills">
                  {SKILL_ITEMS.map((skill, i) => {
                    const sst = allChildStates[i];
                    return (
                      <div key={skill.key} className={`ap-skill ap-${sst.state}`}>
                        <span className="ap-skill-icon">
                          {sst.state === 'running' ? <span className="ap-mini-spin"/> :
                           sst.state === 'done' ? '✓' :
                           sst.state === 'error' ? '✕' : skill.icon}
                        </span>
                        <span className="ap-skill-label">{skill.label}</span>
                        <span className="ap-skill-ms">{sst.ms ? fmtMs(sst.ms) : ''}</span>
                      </div>
                    );
                  })}
                </div>
              </React.Fragment>
            );
          }

          return (
            <div key={stage.key} className={`ap-step ap-${st.state}`}>
              <div className="ap-step-icon">
                {st.state === 'running' ? <span className="ap-mini-spin"/> :
                 st.state === 'done' ? '✓' :
                 st.state === 'error' ? '✕' : stage.icon}
              </div>
              <div className="ap-step-body">
                <b>{stage.label}</b>
                {st.state === 'running' && stage.longHint && <small>{stage.longHint}</small>}
                {st.state === 'error' && <small className="ap-err">{st.error || 'Lỗi'}</small>}
              </div>
              <div className="ap-step-ms">{st.ms ? fmtMs(st.ms) : ''}</div>
            </div>
          );
        })}
      </div>

      <div className="ap-footer">
        <small><IconMemory size={16}/> Hệ thống: Gemini 2.5 Flash · gemini-embedding-001 · pgvector RAG</small>
      </div>
    </div>
  );
}
