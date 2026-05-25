import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const AnalysisCtx = createContext(null);

// Holds the whole call-analysis lifecycle ABOVE the router so that navigating
// between tabs does not unmount the run loop or lose progress/results.
export function AnalysisProvider({ children }) {
  // Setup inputs
  const [customer, setCustomer] = useState(null);
  const [recordingTime, setRecordingTime] = useState('');
  const [file, setFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);

  // Analysis lifecycle
  const [analyzing, setAnalyzing] = useState(false);
  const [progressEvents, setProgressEvents] = useState([]);
  const [error, setError] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  // Global indicator: has the finished/failed result been acknowledged?
  const [resultSeen, setResultSeen] = useState(true);

  const audioUrlRef = useRef(null);

  const handleFile = useCallback((f) => {
    if (!f) return;
    if (audioUrlRef.current) { try { URL.revokeObjectURL(audioUrlRef.current); } catch (_) {} }
    const url = URL.createObjectURL(f);
    audioUrlRef.current = url;
    setFile(f);
    setAudioUrl(url);
    setError(null);
  }, []);

  const canAnalyze = !!(customer && recordingTime && file && !analyzing);

  const startAnalysis = useCallback(async () => {
    if (!(customer && recordingTime && file) || analyzing) return;
    setAnalyzing(true);
    setError(null);
    setProgressEvents([]);
    setAnalysis(null);
    setResultSeen(false);
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
    } finally {
      setAnalyzing(false);
    }
  }, [customer, recordingTime, file, analyzing]);

  const resetForNewCall = useCallback(() => {
    if (audioUrlRef.current) { try { URL.revokeObjectURL(audioUrlRef.current); } catch (_) {} audioUrlRef.current = null; }
    setCustomer(null); setRecordingTime(''); setFile(null); setAudioUrl(null);
    setAnalysis(null); setActiveTab('overview'); setError(null);
    setProgressEvents([]); setResultSeen(true);
  }, []);

  const markResultSeen = useCallback(() => setResultSeen(true), []);

  // ----------------------------------------------------------------
  // Batch analysis (used by BatchUpload on the /home page) — also lifted
  // here so the queue keeps processing when the user switches tabs.
  // ----------------------------------------------------------------
  const [batchItems, setBatchItems] = useState([]); // { file, status, ms?, result?, error? }
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchResultSeen, setBatchResultSeen] = useState(true);
  const [batchCustomer, setBatchCustomer] = useState(null); // KH gán cho cả batch (persist khi đổi tab)
  const batchRunningRef = useRef(false);
  const batchItemsRef = useRef([]);
  useEffect(() => { batchItemsRef.current = batchItems; }, [batchItems]);
  // Mirror selected customer so a worker can read its latest value at the exact
  // moment a file finishes (late binding — user can change KH mid-analysis).
  const batchCustomerRef = useRef(null);
  useEffect(() => { batchCustomerRef.current = batchCustomer; }, [batchCustomer]);
  // Cancellation: aborts in-flight analyze fetches + stops the worker loop.
  // NOTE: the Python diarize service is single-threaded & blocking, so the file
  // currently being diarized still finishes server-side — this only stops the
  // UI from waiting and prevents the remaining queued files from starting.
  const batchAbortRef = useRef(null);
  const batchCancelRef = useRef(false);

  const addBatchFiles = useCallback((files) => {
    const next = Array.from(files)
      .filter(f => f.type.startsWith('audio/') || /\.(mp3|wav|m4a|aac|ogg|flac|webm)$/i.test(f.name))
      .map(f => ({ file: f, status: 'queued', progress: 0 }));
    if (next.length) setBatchItems(prev => [...prev, ...next]);
  }, []);

  const removeBatchItem = useCallback((idx) => {
    setBatchItems(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const clearBatch = useCallback(() => setBatchItems([]), []);
  const markBatchSeen = useCallback(() => setBatchResultSeen(true), []);

  const processBatch = useCallback(async () => {
    if (batchRunningRef.current) return;

    // Snapshot the current queue from the ref (kept in sync with state).
    const queue = [...batchItemsRef.current];
    if (!queue.some(it => it.status === 'queued')) return;

    batchRunningRef.current = true;
    setBatchRunning(true);
    setBatchResultSeen(false);
    batchCancelRef.current = false;
    const ac = new AbortController();
    batchAbortRef.current = ac;

    const updateItem = (file, patch) => {
      setBatchItems(prev => prev.map(it => it.file === file ? { ...it, ...patch } : it));
    };

    const worker = async () => {
      while (true) {
        if (batchCancelRef.current) break;
        const target = queue.find(it => it.status === 'queued');
        if (!target) break;
        target.status = 'uploading';
        updateItem(target.file, { status: 'uploading' });

        const t0 = Date.now();
        try {
          const fd = new FormData();
          fd.append('file', target.file);
          const user = JSON.parse(localStorage.getItem('user') || '{}');
          if (user?.id) fd.append('userId', user.id);
          // KH KHÔNG gửi lúc phân tích → gán SAU khi xong (late binding), nên
          // user có thể đổi KH trong lúc file đang chạy, miễn đổi kịp trước khi xong.

          updateItem(target.file, { status: 'analyzing' });
          const res = await fetch(`${API_URL}/api/v2/calls/analyze-v2`, { method: 'POST', body: fd, signal: ac.signal });
          const data = await res.json();
          if (!res.ok || !data.success) throw new Error(data.message || 'Analyze failed');

          // Gán KH theo giá trị picker NGAY TẠI thời điểm file này xong.
          let assignedId = data.customer_id;
          let assignedName = null;
          const picked = batchCustomerRef.current;
          if (data.saved_call_id && picked?.id) {
            try {
              const ar = await fetch(`${API_URL}/api/v2/calls2/${data.saved_call_id}/assign-customer`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customer_id: picked.id })
              });
              if (ar.ok) { assignedId = picked.id; assignedName = picked.name; }
            } catch (_) { /* gán KH lỗi → giữ auto-match, không chặn pipeline */ }
          }

          target.status = 'done';
          updateItem(target.file, {
            status: 'done',
            ms: Date.now() - t0,
            result: {
              saved_call_id: data.saved_call_id,
              customer_id: assignedId,
              customer_name: assignedName,
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
          if (batchCancelRef.current || e.name === 'AbortError') {
            target.status = 'cancelled';
            updateItem(target.file, { status: 'cancelled', ms: Date.now() - t0 });
          } else {
            target.status = 'failed';
            updateItem(target.file, { status: 'failed', error: e.message, ms: Date.now() - t0 });
          }
        }
      }
    };

    const workers = Array.from({ length: Math.min(3, queue.length) }, () => worker());
    await Promise.all(workers);
    batchAbortRef.current = null;
    batchRunningRef.current = false;
    setBatchRunning(false);
  }, []);

  // User-triggered cancel of an in-progress batch.
  const cancelBatch = useCallback(() => {
    batchCancelRef.current = true;
    if (batchAbortRef.current) { try { batchAbortRef.current.abort(); } catch (_) {} }
    setBatchItems(prev => prev.map(it =>
      (it.status === 'queued' || it.status === 'uploading' || it.status === 'analyzing')
        ? { ...it, status: 'cancelled' }
        : it
    ));
    batchRunningRef.current = false;
    setBatchRunning(false);
  }, []);

  const value = {
    customer, setCustomer,
    recordingTime, setRecordingTime,
    file, audioUrl, handleFile,
    analyzing, progressEvents, error, analysis,
    activeTab, setActiveTab,
    canAnalyze, startAnalysis, resetForNewCall,
    resultSeen, markResultSeen,
    // batch
    batchItems, batchRunning, batchResultSeen,
    batchCustomer, setBatchCustomer,
    addBatchFiles, removeBatchItem, clearBatch, processBatch, cancelBatch, markBatchSeen,
  };

  return <AnalysisCtx.Provider value={value}>{children}</AnalysisCtx.Provider>;
}

export function useAnalysis() {
  const ctx = useContext(AnalysisCtx);
  if (!ctx) throw new Error('useAnalysis must be used within AnalysisProvider');
  return ctx;
}
