import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAnalysis } from './AnalysisContext';
import { IconCheck, IconClipboard, IconClose, IconLoader, IconPaperclip, IconWarning } from './icons';
import './BatchUpload.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const MAX_CONCURRENT = 3; // Gemini rate-limit friendly

const STATUS = {
  QUEUED: 'queued',
  UPLOADING: 'uploading',
  ANALYZING: 'analyzing',
  DONE: 'done',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

const STATUS_LABEL = {
  queued: 'Chờ',
  uploading: 'Đang upload',
  analyzing: 'Đang phân tích',
  done: 'Xong',
  failed: 'Lỗi',
  cancelled: 'Đã hủy'
};

const fmtBytes = (b) => b < 1024 * 1024 ? `${(b / 1024).toFixed(0)}KB` : `${(b / 1024 / 1024).toFixed(2)}MB`;
const fmtTime = (ms) => `${(ms / 1000).toFixed(1)}s`;

/**
 * Props:
 *   customerId?: string — nếu truyền, mọi file sẽ gán cùng 1 KH
 *
 * Queue state + processing live in AnalysisContext so they survive navigation.
 */
export default function BatchUpload() {
  // Queue + processing live in AnalysisContext (above the router) so the batch
  // keeps running and results persist when the user switches tabs. The customer
  // is bound LATE (when each file finishes), so it's read from context, not props.
  const {
    batchItems: items,
    batchRunning: running,
    addBatchFiles: addFiles,
    removeBatchItem: removeItem,
    clearBatch: clearAll,
    processBatch,
    cancelBatch,
    markBatchSeen,
  } = useAnalysis();
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  // Viewing this panel acknowledges finished results → hide the global pill.
  useEffect(() => {
    if (!running && items.length) markBatchSeen();
  }, [running, items.length, markBatchSeen]);

  const startQueue = () => processBatch();

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const counts = {
    total: items.length,
    done: items.filter(i => i.status === STATUS.DONE).length,
    failed: items.filter(i => i.status === STATUS.FAILED).length,
    cancelled: items.filter(i => i.status === STATUS.CANCELLED).length,
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
              {counts.cancelled > 0 && <span className="bu-c-cancel"><IconClose size={14}/> {counts.cancelled} đã hủy</span>}
            </div>
            <div className="bu-actions">
              <button className="btn btn-ghost" onClick={clearAll} disabled={running}>
                Xoá tất cả
              </button>
              {running && (
                <button className="btn bu-btn-cancel" onClick={cancelBatch} title="Dừng phân tích các file chưa xong">
                  <IconClose size={14}/> Hủy
                </button>
              )}
              <button
                className="btn btn-primary"
                onClick={startQueue}
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
                  {it.result?.customer_name && (
                    <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 700, color: '#059669', whiteSpace: 'nowrap' }}>
                      → {it.result.customer_name}
                    </span>
                  )}
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
                  {(it.status === STATUS.QUEUED || it.status === STATUS.FAILED || it.status === STATUS.CANCELLED) && (
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
