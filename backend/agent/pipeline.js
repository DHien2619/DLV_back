// Orchestrator — runs the full analysis pipeline for a single call.
// Flow:
//   1) Diarize (audio -> transcript with speakers + timestamps)
//   2) Parallel: Quality | Needs | Opportunity | Compliance | Structure
//   3) Aggregate into one result + persist to DB
//
// Each sub-task failure is isolated so partial results are still returned.

const { uploadAudio } = require("./gemini-client");
const { diarizeAudio, diarizedToText } = require("./skills/diarize");
const { assessQuality } = require("./skills/quality-assessor");
const { extractNeeds } = require("./skills/needs-extractor");
const { scoutOpportunity } = require("./skills/opportunity-scout");
const { checkCompliance } = require("./skills/compliance-guardian");
const { analyzeStructure } = require("./skills/call-structure");

const ANALYSIS_VERSION = "v2.0-gemini-poc";

async function safeRun(name, fn) {
  const t0 = Date.now();
  try {
    const data = await fn();
    return { ok: true, data, ms: Date.now() - t0 };
  } catch (err) {
    console.error(`[pipeline] ${name} FAILED:`, err.message);
    return { ok: false, error: err.message, ms: Date.now() - t0 };
  }
}

/**
 * Main entry — analyze a call given a local audio file path.
 * @param {string} filePath - absolute path to audio file
 * @param {Object} options
 * @param {string} [options.mimeType]
 * @param {Object} [options.metadata] - call metadata (customer_id, rep_id, channel...)
 * @param {function} [options.onProgress] - progress callback (step, status)
 * @returns {Promise<Object>} analysis result
 */
async function analyzeCall(filePath, options = {}) {
  const { mimeType = "audio/mpeg", metadata = {}, onProgress = () => {} } = options;
  const startedAt = Date.now();

  onProgress("upload", "start");
  const { fileData, cleanup } = await uploadAudio(filePath, mimeType);
  onProgress("upload", "done");

  try {
    // ---- Step 1: Diarize (sequential — needed by everyone) ----
    onProgress("diarize", "start");
    const diarized = await diarizeAudio({ fileData });
    const diarizedText = diarizedToText(diarized);
    onProgress("diarize", "done");

    // ---- Step 2: Parallel skills on diarized text ----
    onProgress("skills", "start");
    const [quality, needs, opportunity, compliance, structure] = await Promise.all([
      safeRun("quality", () => assessQuality({ diarizedText, callMetadata: metadata })),
      safeRun("needs", () => extractNeeds({ diarizedText })),
      safeRun("opportunity", () => scoutOpportunity({ diarizedText })),
      safeRun("compliance", () => checkCompliance({ diarizedText })),
      safeRun("structure", () => analyzeStructure({ diarizedText }))
    ]);
    onProgress("skills", "done");

    const totalMs = Date.now() - startedAt;

    return {
      analysis_version: ANALYSIS_VERSION,
      processing_ms: totalMs,
      diarized,
      transcript_text: diarizedText,
      quality: quality.ok ? quality.data : { error: quality.error },
      needs: needs.ok ? needs.data : { error: needs.error },
      opportunity: opportunity.ok ? opportunity.data : { error: opportunity.error },
      compliance: compliance.ok ? compliance.data : { error: compliance.error },
      structure: structure.ok ? structure.data : { error: structure.error },
      timings: {
        quality_ms: quality.ms,
        needs_ms: needs.ms,
        opportunity_ms: opportunity.ms,
        compliance_ms: compliance.ms,
        structure_ms: structure.ms
      }
    };
  } finally {
    // Always cleanup uploaded file to avoid stale files on Gemini
    cleanup().catch(() => {});
  }
}

module.exports = { analyzeCall, ANALYSIS_VERSION };
