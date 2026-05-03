import React, { useState, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconCheck, IconClipboard, IconClose, IconLoader, IconPaperclip, IconWarning } from './icons';
import './BatchUpload.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const MAX_CONCURRENT = 3; // Gemini rate-limit friendly

const STATUS = {
  QUEUED: 'queued',
  UPLOADING: 'uploading',
  ANALYZING: 'analyzing',
  DONE: 'done',
  FAILED: 'failed'
};

const STATUS_LABEL = {
  queued: 'Chờ',
  uploading: 'Đang upload',
  analyzing: 'Đang phân tích',
  done: 'Xong',
  failed: 'Lỗi'
};

const fmtBytes = (b) => b < 1024 * 1024 ? `${(b / 1024).toFixed(0)}KB` : `${(b / 1024 / 1024).toFixed(2)}MB`;
const fmtTime = (ms) => `${(ms / 1000).toFixed(1)}s`;

/**
 * Props:
 *   customerId?: string — nếu truyền, mọi file sẽ gán cùng 1 KH
 *   onDone?: (results) => void
 *   defaultFiles?: File[]
 */
export default function BatchUpload({ customerId, onDone, defaultFiles }) {
  const [items, setItems] = useState(
    (defaultFiles || []).map(f => ({ file: f, status: STATUS.QUEUED, progress: 0 }))
  );
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  const addFiles = useCallback((files) => {
    const next = Array.from(files)
      .filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac|webm)$/i.test(f.name))
      .map(f => ({ file: f, status: STATUS.QUEUED, progress: 0 }));
    if (next.length) setItems(prev => [...prev, ...next]);
  }, []);

  const removeItem = (idx) => setItems(prev => prev.filter((_, i) => i !== idx));
  const clearAll = () => setItems([]);

  // ---------- concurrency-limited processor ----------
  const processQueue = async () => {
    if (running) return;
    setRunning(true);

    const queue = [...items];
    const updateItem = (file, patch) => {
      setItems(prev => prev.map(it => it.file === file ? { ...it, ...patch } : it));
    };

    const worker = async () => {
      while (true) {
        const target = queue.find(it => it.status === STATUS.QUEUED);
        if (!target) break;
        target.status = STATUS.UPLOADING;
        updateItem(target.file, { status: STATUS.UPLOADING });

        const t0 = Date.now();
        try {
          const fd = new FormData();
          fd.append('file', target.file);
          const user = JSON.parse(localStorage.getItem('user') || '{}');
          if (user?.id) fd.append('userId', user.id);
          if (customerId) fd.append('customerId', customerId);

          updateItem(target.file, { status: STATUS.ANALYZING });
          const res = await fetch(`${API_URL}/api/v2/calls/analyze-v2`, { method: 'POST', body: fd });
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.message || 'Analyze failed');
          target.status = STATUS.DONE;
          updateItem(target.file, {
            status: STATUS.DONE,
            ms: Date.now() - t0,
            result: {
              saved_call_id: data.saved_call_id,
              customer_id: data.customer_id,
              quality: data.quality?.total_score,
              grade: data.quality?.overall_grade,
              opportunity: data.opportunity?.score,
              stage: data.opportunity?.stage,
              compliance: data.compliance?.overall_status,
              compliance_events: data.compliance?.events?.length || 0,
              match_candidates: data.match_candidates?.candidates?.length || 0
            }
          });
        } catch (e) {
          target.status = STATUS.FAILED;
          updateItem(target.file, { status: STATUS.FAILED, error: e.message, ms: Date.now() - t0 });
        }
      }
    };

    const workers = Array.from({ length: Math.min(MAX_CONCURRENT, queue.length) }, () => worker());
    await Promise.all(workers);
    setRunning(false);
    onDone?.(items);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const counts = {
    total: items.length,
    done: items.filter(i => i.status === STATUS.DONE).length,
    failed: items.filter(i => i.status === STATUS.FAILED).length,
    processing: items.filter(i => i.status === STATUS.UPLOADING || i.status === STATUS.ANALYZING).length,
    queued: items.filter(i => i.status === STATUS.QUEUED).length
  };

  return (
    <div className="bu-root">
      <div
        className={`bu-drop ${dragOver ? 'over' : ''} ${items.length ? 'compact' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => addFiles(e.target.files)}
        />
        <div className="bu-drop-icon"><IconPaperclip size={14}/></div>
        <div>
          <strong>{items.length ? 'Thêm file khác' : 'Kéo thả file audio vào đây'}</strong>
          <span> hoặc <u>chọn file</u> (có thể chọn nhiều)</span>
        </div>
        <small>MP3, WAV, M4A · xử lý song song {MAX_CONCURRENT} file</small>
      </div>

      {items.length > 0 && (
        <>
          <div className="bu-toolbar">
            <div className="bu-counts">
              <span><b>{counts.total}</b> file</span>
              {counts.processing > 0 && <span className="bu-c-proc"><IconLoader size={14}/> {counts.processing} đang xử lý</span>}
              {counts.queued > 0 && <span className="bu-c-queue"><IconClipboard size={16}/> {counts.queued} chờ</span>}
              {counts.done > 0 && <span className="bu-c-done"><IconCheck size={14}/> {counts.done} xong</span>}
              {counts.failed > 0 && <span className="bu-c-fail"><IconWarning size={14}/> {counts.failed} lỗi</span>}
            </div>
            <div className="bu-actions">
              <button className="btn btn-ghost" onClick={clearAll} disabled={running}>
                Xoá tất cả
              </button>
              <button
                className="btn btn-primary"
                onClick={processQueue}
                disabled={running || counts.queued === 0}
              >
                {running ? `... Đang xử lý ${counts.processing}/${counts.total}` : `🚀 Phân tích ${counts.queued} file`}
              </button>
            </div>
          </div>

          <div className="bu-list">
            <div className="bu-row bu-row-head">
              <span>File</span>
              <span>Dung lượng</span>
              <span>Trạng thái</span>
              <span>Q</span>
              <span>Opp</span>
              <span>Compl</span>
              <span></span>
            </div>
            {items.map((it, i) => (
              <div key={i} className={`bu-row bu-status-${it.status}`}>
                <span className="bu-file">
                  <span className="bu-file-ico">🎙️</span>
                  <span className="bu-file-name" title={it.file.name}>{it.file.name}</span>
                </span>
                <span className="bu-size">{fmtBytes(it.file.size)}</span>
                <span className={`bu-st-badge bu-st-${it.status}`}>
                  {it.status === STATUS.ANALYZING && <span className="bu-spin" />}
                  {STATUS_LABEL[it.status]}
                  {it.ms && it.status !== STATUS.QUEUED && ` · ${fmtTime(it.ms)}`}
                </span>
                <span className="bu-q">
                  {it.result?.quality != null && (
                    <span className={`bu-grade bu-grade-${it.result.grade}`}>
                      {it.result.grade} · {it.result.quality}
                    </span>
                  )}
                </span>
                <span className="bu-opp">
                  {it.result?.opportunity != null && (
                    <span className={`bu-stage bu-stage-${it.result.stage}`}>
                      {it.result.opportunity} · {it.result.stage}
                    </span>
                  )}
                </span>
                <span className="bu-compl">
                  {it.result?.compliance && it.result.compliance !== 'clean' && (
                    <span className={`bu-sev bu-sev-${it.result.compliance}`}>
                      {it.result.compliance.toUpperCase()} · {it.result.compliance_events}
                    </span>
                  )}
                  {it.result?.compliance === 'clean' && <span className="bu-sev bu-sev-clean"><IconCheck size={14}/></span>}
                </span>
                <span className="bu-item-actions">
                  {it.status === STATUS.DONE && it.result?.saved_call_id && (
                    <button
                      className="bu-mini-btn"
                      onClick={() => navigate(`/call/${it.result.saved_call_id}`)}
                      title="Xem chi tiết"
                    >↗</button>
                  )}
                  {it.status === STATUS.FAILED && (
                    <button className="bu-mini-btn bu-mini-fail" title={it.error}>ⓘ</button>
                  )}
                  {(it.status === STATUS.QUEUED || it.status === STATUS.FAILED) && (
                    <button
                      className="bu-mini-btn"
                      onClick={() => removeItem(i)}
                      disabled={running}
                      title="Xoá"
                    ><IconClose size={14}/></button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
