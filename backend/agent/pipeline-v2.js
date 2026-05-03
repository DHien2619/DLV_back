// Pipeline V2 — RAG-enhanced.
// Flow:
//   1) Upload audio to Gemini
//   2) Diarize transcript
//   3) If customer_id known -> load customer context (memory facts + relevant past chunks)
//      If not -> run customer matcher to get candidates (caller confirms later)
//   4) Run 5 skills in parallel, INJECTING customer context into each so agents can
//      reason with prior history (like a real employee would).
//   5) Post-processing (async after response can be returned):
//      - Extract facts and upsert into customer_memory (with conflict detection)
//      - Chunk transcript + embed + insert into call_chunks (for future RAG)
//      - Upsert calls row with all results
//      - Upsert opportunities + compliance_events

const { diarizeAudio, diarizedToText } = require("./skills/diarize");
const { assessQuality } = require("./skills/quality-assessor");
const { extractNeeds } = require("./skills/needs-extractor");
const { scoutOpportunity } = require("./skills/opportunity-scout");
const { checkCompliance } = require("./skills/compliance-guardian");
const { analyzeStructure } = require("./skills/call-structure");
const { extractFacts, applyFacts, buildCustomerContext } = require("./skills/memory-agent");
const { findCandidates } = require("./skills/customer-matcher");
const { embedText, embedBatch, chunkDiarized } = require("./embeddings");

const ANALYSIS_VERSION = "v2.1-gemini-rag";

async function safeRun(name, fn, onProgress) {
  const t0 = Date.now();
  if (onProgress) onProgress(`skill:${name}`, 'start');
  try {
    const data = await fn();
    const ms = Date.now() - t0;
    if (onProgress) onProgress(`skill:${name}`, 'done', { ms });
    return { ok: true, data, ms };
  } catch (err) {
    const ms = Date.now() - t0;
    console.error(`[pipeline-v2] ${name} FAILED:`, err.message);
    if (onProgress) onProgress(`skill:${name}`, 'error', { ms, error: err.message });
    return { ok: false, error: err.message, ms };
  }
}

// Retry wrapper for async post-processing — exponential backoff (300ms, 900ms, 2700ms).
// Not all errors are retryable; we still log on final failure so operators can see it.
async function withRetry(label, fn, { attempts = 3, baseDelayMs = 300 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      const delay = baseDelayMs * Math.pow(3, i);
      console.warn(`[pipeline-v2] ${label} attempt ${i + 1}/${attempts} failed: ${e.message} (retry in ${delay}ms)`);
      if (i < attempts - 1) await new Promise(r => setTimeout(r, delay));
    }
  }
  console.error(`[pipeline-v2] ${label} GAVE UP after ${attempts} attempts:`, lastErr?.message);
  throw lastErr;
}

/**
 * Build the "customer context block" that is injected into each skill prompt.
 * It contains:
 *   - Active facts snapshot
 *   - Last 3 calls summary
 *   - Top-K relevant past transcript chunks similar to the new transcript
 */
async function buildRagContext({ supabase, customerId, currentTranscript }) {
  if (!customerId) return "";
  const parts = [];

  // Active facts
  const factsContext = await buildCustomerContext({ supabase, customerId });
  if (factsContext) parts.push(`KIEN THUC BEN VUNG VE KH (active memory):\n${factsContext}`);

  // Last 3 calls summary
  const { data: pastCalls } = await supabase
    .from("calls")
    .select("id, recorded_at, created_at, insights, total_quality_score, opportunity_score, compliance_status")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(3);

  if (pastCalls?.length) {
    const lines = pastCalls.map((c, i) => {
      const summ = c.insights?.structure?.summary_short || c.insights?.summary?.summary_short || "(khong co tom tat)";
      const date = new Date(c.created_at).toISOString().slice(0, 10);
      return `  #${i + 1} [${date}] Q=${c.total_quality_score || "?"} OPP=${c.opportunity_score || "?"} ${c.compliance_status ? `[${c.compliance_status.toUpperCase()}]` : ""} — ${summ}`;
    });
    parts.push(`LICH SU ${pastCalls.length} CUOC GOI GAN NHAT:\n${lines.join("\n")}`);
  }

  // Semantic retrieval of relevant past chunks
  try {
    const probeText = currentTranscript.slice(0, 1500);
    const qEmbed = await embedText(probeText, "RETRIEVAL_QUERY");
    if (qEmbed) {
      const { data: similar } = await supabase.rpc("match_customer_chunks", {
        query_embedding: qEmbed,
        customer_filter: customerId,
        match_count: 5,
        similarity_threshold: 0.70
      });
      if (similar?.length) {
        const chunks = similar.map(s => `  [t=${Math.floor(s.start_sec || 0)}s sim=${(s.similarity || 0).toFixed(2)}] ${s.chunk_text.slice(0, 200)}`);
        parts.push(`CAC DOAN HOI THOAI QUA KHU LIEN QUAN (tu cac cuoc goi truoc):\n${chunks.join("\n")}`);
      }
    }
  } catch (e) {
    console.warn("[pipeline-v2] RAG retrieval skipped:", e.message);
  }

  return parts.join("\n\n");
}

/**
 * Main entry — analyze a call with RAG context awareness.
 *
 * @param {Object} opts
 * @param {string} opts.filePath
 * @param {string} opts.mimeType
 * @param {Object} opts.supabase - Supabase client
 * @param {string} [opts.customerId] - known customer (skip matcher)
 * @param {number|string} [opts.repUserId]
 * @param {Object} [opts.metadata]
 * @param {boolean} [opts.persist=true] - whether to save to DB (calls, chunks, memory, opportunities, compliance)
 * @param {function} [opts.onProgress]
 */
async function analyzeCallV2(opts) {
  const { filePath, mimeType = "audio/mpeg", supabase, metadata = {},
          customerId, repUserId, persist = true, onProgress = () => {} } = opts;
  const startedAt = Date.now();

  onProgress("upload", "start");
  // No upload step needed for Groq Whisper — it reads the local file directly.
  const cleanup = async () => {};
  onProgress("upload", "done");

  try {
    // Step 1: Diarize (Groq Whisper + Claude speaker labeling)
    onProgress("diarize", "start");
    const diarized = await diarizeAudio({ filePath, originalName: metadata.filename, mimeType });
    const diarizedText = diarizedToText(diarized);
    onProgress("diarize", "done");

    // Step 2: Resolve customer context
    let resolvedCustomerId = customerId || null;
    let matchCandidates = null;
    let ragContext = "";

    if (resolvedCustomerId) {
      onProgress("rag-context", "start");
      ragContext = await buildRagContext({ supabase, customerId: resolvedCustomerId, currentTranscript: diarizedText });
      onProgress("rag-context", "done");
    } else if (supabase) {
      onProgress("matcher", "start");
      try {
        matchCandidates = await findCandidates({ supabase, diarizedText, topK: 5 });
      } catch (e) {
        console.warn("[pipeline-v2] matcher failed:", e.message);
      }
      onProgress("matcher", "done");
    }

    // Step 3: Skills in parallel with optional context
    onProgress("skills", "start");
    const contextBlock = ragContext ? `\n\n=== CONTEXT TU LICH SU KH ===\n${ragContext}\n=== HET CONTEXT ===\n` : "";
    const textWithContext = `${contextBlock}\n=== TRANSCRIPT CUOC GOI HIEN TAI ===\n${diarizedText}`;

    const [quality, needs, opportunity, compliance, structure] = await Promise.all([
      safeRun("quality", () => assessQuality({ diarizedText: textWithContext, callMetadata: metadata }), onProgress),
      safeRun("needs", () => extractNeeds({ diarizedText: textWithContext }), onProgress),
      safeRun("opportunity", () => scoutOpportunity({ diarizedText: textWithContext }), onProgress),
      safeRun("compliance", () => checkCompliance({ diarizedText: textWithContext }), onProgress),
      safeRun("structure", () => analyzeStructure({ diarizedText: textWithContext }), onProgress)
    ]);
    onProgress("skills", "done");

    const analysis = {
      analysis_version: ANALYSIS_VERSION,
      processing_ms: Date.now() - startedAt,
      diarized,
      transcript_text: diarizedText,
      quality: quality.ok ? quality.data : { error: quality.error },
      needs: needs.ok ? needs.data : { error: needs.error },
      opportunity: opportunity.ok ? opportunity.data : { error: opportunity.error },
      compliance: compliance.ok ? compliance.data : { error: compliance.error },
      structure: structure.ok ? structure.data : { error: structure.error },
      rag_context_used: !!ragContext,
      match_candidates: matchCandidates,
      customer_id: resolvedCustomerId,
      timings: {
        quality_ms: quality.ms, needs_ms: needs.ms, opportunity_ms: opportunity.ms,
        compliance_ms: compliance.ms, structure_ms: structure.ms
      }
    };

    // Step 4: Persist to DB
    let savedCallId = null;
    if (persist && supabase) {
      onProgress("persist", "start");
      // Upload audio to Supabase Storage (fire-and-forget style, but capture URL)
      let audioUrl = null;
      try {
        const fs = require("fs");
        const path = require("path");
        const audioBuffer = fs.readFileSync(filePath);
        const ext = path.extname(metadata.filename || "audio.mp3") || ".mp3";
        const storagePath = `calls/${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`;
        console.log(`[pipeline-v2] uploading audio: ${storagePath} (${(audioBuffer.length/1024/1024).toFixed(2)}MB, ${mimeType})`);
        const { data: upData, error: upErr } = await supabase.storage
          .from("call-audio")
          .upload(storagePath, audioBuffer, { contentType: mimeType, upsert: false });
        if (upErr) {
          console.error("[pipeline-v2] audio storage upload FAILED:", JSON.stringify(upErr));
          onProgress("audio-store", "error", { message: upErr.message });
        } else {
          const { data: urlData } = supabase.storage.from("call-audio").getPublicUrl(storagePath);
          audioUrl = urlData?.publicUrl || null;
          console.log("[pipeline-v2] audio stored:", audioUrl);
          onProgress("audio-store", "done", { url: audioUrl });
        }
      } catch (e) {
        console.error("[pipeline-v2] audio storage EXCEPTION:", e.message, e.stack);
        onProgress("audio-store", "error", { message: e.message });
      }

      const { data: callRow, error: callErr } = await supabase.from("calls").insert([{
        customer_id: resolvedCustomerId,
        rep_user_id: repUserId || null,
        audio_filename: metadata.filename || null,
        audio_url: audioUrl,
        metadata,
        customer_identified: !!resolvedCustomerId,
        match_candidates: matchCandidates ? matchCandidates.candidates : null,
        transcript_raw: diarizedText,
        transcript_diarized: diarized,
        talk_ratio: analysis.structure?.talk_ratio?.agent_pct || null,
        total_quality_score: analysis.quality?.total_score || null,
        opportunity_score: analysis.opportunity?.score || null,
        compliance_status: analysis.compliance?.overall_status || null,
        analysis_version: ANALYSIS_VERSION,
        insights: {
          quality: analysis.quality,
          needs: analysis.needs,
          opportunity: analysis.opportunity,
          compliance: analysis.compliance,
          structure: analysis.structure,
          timings: analysis.timings
        },
        processing_status: "done",
        processing_ms: analysis.processing_ms,
        recorded_at: metadata.recorded_at || new Date().toISOString()
      }]).select("id").single();

      if (callErr) console.error("[pipeline-v2] call insert failed:", callErr.message);
      else {
        savedCallId = callRow.id;
        analysis.saved_call_id = savedCallId;

        // Embed chunks (fire-and-forget, retried on transient errors)
        (async () => {
          try {
            const chunks = chunkDiarized(diarized);
            if (!chunks.length) return;
            const embeds = await withRetry('embed-batch', () => embedBatch(chunks.map(c => c.chunk_text)));
            const rows = chunks.map((c, i) => ({
              call_id: savedCallId,
              customer_id: resolvedCustomerId,
              chunk_text: c.chunk_text,
              speaker: c.speaker,
              start_sec: c.start_sec,
              end_sec: c.end_sec,
              embedding: embeds[i]
            })).filter(r => r.embedding);
            if (rows.length) {
              await withRetry('chunks-insert', async () => {
                const { error } = await supabase.from("call_chunks").insert(rows);
                if (error) throw new Error(error.message);
              });
            }
            console.log(`[pipeline-v2] embedded ${rows.length} chunks for call ${savedCallId}`);
          } catch (e) { console.error("[pipeline-v2] embed step gave up:", e.message); }
        })();

        // Memory facts (fire-and-forget with retry, only if we have a customer)
        if (resolvedCustomerId) {
          (async () => {
            try {
              const res = await withRetry('memory-facts', async () => {
                const existing = await buildCustomerContext({ supabase, customerId: resolvedCustomerId });
                const { facts } = await extractFacts({ diarizedText, existingContext: existing });
                return applyFacts({ supabase, customerId: resolvedCustomerId, callId: savedCallId, facts });
              });
              console.log(`[pipeline-v2] memory: +${res.inserted} / ~${res.updated} / superseded ${res.superseded}`);
              if (res.conflicts.length) console.log(`[pipeline-v2] CONFLICTS:`, res.conflicts);
            } catch (e) { console.error("[pipeline-v2] memory step gave up:", e.message); }
          })();
        }

        // Opportunity persistence
        if (analysis.opportunity && !analysis.opportunity.error && resolvedCustomerId) {
          try {
            const opp = analysis.opportunity;
            const { error: oppErr } = await supabase.from("opportunities").insert([{
              customer_id: resolvedCustomerId,
              call_id: savedCallId,
              product_hint: opp.product_interest?.[0]?.product_hint || null,
              stage: opp.stage,
              score: opp.score,
              estimated_value_vnd: opp.estimated_value_vnd || null,
              next_action: opp.next_best_action,
              confidence: opp.confidence || null,
              due_date: opp.close_timing_days ? new Date(Date.now() + opp.close_timing_days * 86400000).toISOString() : null,
              assigned_rep_id: repUserId || null
            }]);
            if (oppErr) console.error("[pipeline-v2] opp insert failed:", oppErr.message);
          } catch (e) { console.error("[pipeline-v2] opp insert exception:", e.message); }
        }

        // Compliance events
        if (analysis.compliance?.events?.length) {
          try {
            const rows = analysis.compliance.events.map(e => ({
              call_id: savedCallId,
              customer_id: resolvedCustomerId,
              rep_user_id: repUserId || null,
              event_type: e.event_type,
              severity: e.severity,
              timestamp_sec: e.timestamp_sec,
              speaker: e.speaker,
              quote: e.quote,
              explanation: e.explanation,
              recommended_action: e.recommended_action
            }));
            const { error: cErr } = await supabase.from("compliance_events").insert(rows);
            if (cErr) console.error("[pipeline-v2] compliance insert failed:", cErr.message);
          } catch (e) { console.error("[pipeline-v2] compliance insert exception:", e.message); }
        }
      }
      onProgress("persist", "done");
    }

    return analysis;
  } finally {
    cleanup().catch(() => {});
  }
}

module.exports = { analyzeCallV2, ANALYSIS_VERSION, buildRagContext };
