// Gemini embeddings — text-embedding-004 (768 dims, matches pgvector schema).
const { genAI } = require("./gemini-client");

const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIMS = 768;   // must match pgvector(768) in migration 002

/**
 * Embed a single text string. Returns number[] of length 768.
 * Uses Matryoshka dim reduction via outputDimensionality.
 */
async function embedText(text, taskType = "RETRIEVAL_DOCUMENT") {
  if (!text || !text.trim()) return null;
  const model = genAI.getGenerativeModel({ model: EMBED_MODEL });
  const res = await model.embedContent({
    content: { parts: [{ text: text.slice(0, 8000) }] },
    taskType,
    outputDimensionality: EMBED_DIMS
  });
  return res.embedding?.values || null;
}

/** Batch embed with simple sequential loop (Gemini SDK has embedContents batch but limits vary). */
async function embedBatch(texts, taskType = "RETRIEVAL_DOCUMENT") {
  const out = [];
  for (const t of texts) {
    try {
      out.push(await embedText(t, taskType));
    } catch (e) {
      console.error("[embed] failed for chunk:", e.message);
      out.push(null);
    }
  }
  return out;
}

/**
 * Chunk a diarized transcript into semantically useful chunks for RAG.
 * Strategy: group consecutive segments within max ~60 sec window or max 400 chars.
 * Each chunk preserves speaker turns inside a [SPEAKER] prefix for context.
 */
function chunkDiarized(diarized, { maxChars = 400, maxSec = 60 } = {}) {
  if (!diarized?.segments?.length) return [];
  const chunks = [];
  let buf = [];
  let bufStart = null;
  let bufChars = 0;

  const flush = () => {
    if (!buf.length) return;
    const text = buf.map(s => `[${s.speaker}] ${s.text}`).join(" ");
    chunks.push({
      chunk_text: text,
      speaker: buf.length === 1 ? buf[0].speaker : "MIXED",
      start_sec: buf[0].start_sec,
      end_sec: buf[buf.length - 1].end_sec
    });
    buf = []; bufStart = null; bufChars = 0;
  };

  for (const s of diarized.segments) {
    if (bufStart === null) bufStart = s.start_sec;
    const wouldExceed = (bufChars + s.text.length > maxChars) ||
                       (s.end_sec - bufStart > maxSec);
    if (wouldExceed && buf.length) flush();
    if (bufStart === null) bufStart = s.start_sec;
    buf.push(s);
    bufChars += s.text.length;
  }
  flush();
  return chunks;
}

module.exports = { embedText, embedBatch, chunkDiarized, EMBED_MODEL };
