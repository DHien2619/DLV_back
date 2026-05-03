// Step 1: Diarized Transcription.
// Pipeline: Groq Whisper (audio→text+timestamps) → Claude (speaker labeling).
//
// Why split? Whisper gives the best Vietnamese transcription quality but does
// NOT do diarization. We use Claude as a smart classifier to label each segment
// as AGENT / CUSTOMER based on content (who introduces, who answers questions,
// who mentions symptoms, etc.).

const fs = require("fs");
const path = require("path");
const { generateStructured } = require("../claude-client");

const GROQ_API_KEY = (process.env.GROQ_API_KEY || "").trim();
const GROQ_MODEL = (process.env.GROQ_WHISPER_MODEL || "whisper-large-v3").trim();
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

if (!GROQ_API_KEY) console.warn("[diarize] GROQ_API_KEY missing");

// ============================================================
// Step 1a: Transcribe with Groq Whisper (returns segments + timestamps)
// ============================================================
// Map ext → MIME type Groq accepts
const EXT_MIME = {
  ".mp3": "audio/mpeg", ".wav": "audio/wav", ".m4a": "audio/mp4",
  ".mp4": "audio/mp4",  ".ogg": "audio/ogg", ".flac": "audio/flac",
  ".webm": "audio/webm", ".mpga": "audio/mpeg", ".mpeg": "audio/mpeg",
  ".opus": "audio/opus"
};

async function transcribeWithGroq(filePath, originalName = null, mimeType = null) {
  const fileBuffer = fs.readFileSync(filePath);
  // Prefer originalName (has proper extension) over tmp filePath (multer random name)
  const nameForExt = originalName || path.basename(filePath);
  const ext = (path.extname(nameForExt) || ".mp3").toLowerCase();
  const mime = (mimeType && mimeType.startsWith("audio/")) ? mimeType : (EXT_MIME[ext] || "audio/mpeg");

  // Ensure filename has a recognized extension (Groq checks filename too)
  const safeName = ext in EXT_MIME ? (originalName || `audio${ext}`) : `audio.mp3`;

  const blob = new Blob([fileBuffer], { type: mime });
  const form = new FormData();
  form.append("file", blob, safeName);
  form.append("model", GROQ_MODEL);
  form.append("response_format", "verbose_json");
  form.append("language", "vi");
  form.append("temperature", "0");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${GROQ_API_KEY}` },
    body: form
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq Whisper failed (${res.status}) [file=${safeName} mime=${mime}]: ${errText}`);
  }
  return res.json();
}

// ============================================================
// Step 1b: Label speakers with Claude
// ============================================================
const SPEAKER_LABEL_SYSTEM = `Ban la chuyen gia phan tich cuoc goi telesale/tu van duoc pham tai Viet Nam.
Nhiem vu: gan nhan nguoi noi (AGENT / CUSTOMER / UNKNOWN) cho tung segment cua transcript.

DAU HIEU NHAN DIEN:
- AGENT (tu van vien/duoc si):
  * Gioi thieu ban than, cong ty, nha thuoc
  * Chu dong chao hoi, hoi thong tin, hoi trieu chung
  * Noi ve san pham, lieu dung, cach dung, gia
  * Cam on, hen lich, chot don, xac nhan don
  * Dung ngon ngu chuyen nghiep, tu xung "em/minh"

- CUSTOMER (khach hang):
  * Tra loi cau hoi cua agent
  * Ke trieu chung benh, dau o dau, bao lau
  * Hoi gia, hoi cong dung, hoi tac dung phu
  * Do du quyet dinh, dong y mua, tu choi
  * Thuong noi ngan hon, tu xung "toi/chi/anh/bac/con"

- UNKNOWN: chi dung khi KHONG the xac dinh duoc (VD: tieng on, cau khong ro nghia)

NGUYEN TAC:
1. MOI SEGMENT bat buoc co label.
2. Agent thuong noi TRUOC (chao hoi, gioi thieu). Cau dau tien 80% la AGENT.
3. Dua vao NOI DUNG + NGOI XUNG + CHUC NANG cau noi.
4. Neu 2 segment lien tiep cung nguoi → van la cung speaker (khong doi lien tuc).

OUTPUT: Tra ve MANG labels theo dung thu tu segments duoc cung cap.`;

const speakerLabelsSchema = {
  type: "OBJECT",
  properties: {
    labels: {
      type: "ARRAY",
      items: {
        type: "STRING",
        enum: ["AGENT", "CUSTOMER", "UNKNOWN"]
      },
      description: "Mang labels theo thu tu segments"
    }
  },
  required: ["labels"]
};

async function labelSpeakers(segments) {
  if (!segments || segments.length === 0) return [];

  // Build compact view for Claude: just index + text
  const segList = segments.map((s, i) => `[${i}] (${formatTime(s.start)}) "${s.text.trim()}"`).join("\n");

  const userText = `Gan nhan cho ${segments.length} segments sau day. Tra ve MANG labels co dung ${segments.length} phan tu theo thu tu:

${segList}

Tra ve JSON theo schema voi mang "labels" co dung ${segments.length} phan tu.`;

  const result = await generateStructured({
    systemInstruction: SPEAKER_LABEL_SYSTEM,
    parts: [{ text: userText }],
    schema: speakerLabelsSchema,
    temperature: 0.1,
    tier: 'fast', // Just AGENT/CUSTOMER classification — Haiku
    maxOutputTokens: 4096
  });

  let labels = result.labels || [];
  // Safety: pad/truncate to exact length
  if (labels.length < segments.length) {
    labels = [...labels, ...Array(segments.length - labels.length).fill("UNKNOWN")];
  } else if (labels.length > segments.length) {
    labels = labels.slice(0, segments.length);
  }
  return labels;
}

// ============================================================
// Main: Diarize = Groq transcribe + Claude speaker label
// ============================================================
async function diarizeAudio({ filePath, originalName = null, mimeType = null }) {
  if (!filePath) throw new Error("[diarize] filePath required");

  // Step 1: Transcribe
  const whisper = await transcribeWithGroq(filePath, originalName, mimeType);
  const rawSegments = Array.isArray(whisper.segments) ? whisper.segments : [];

  if (rawSegments.length === 0) {
    // Fallback: single segment from the full text
    return {
      language: whisper.language || "vi",
      segments: [{
        speaker: "UNKNOWN",
        start_sec: 0,
        end_sec: whisper.duration || 0,
        text: whisper.text || ""
      }]
    };
  }

  // Step 2: Label speakers
  let labels;
  try {
    labels = await labelSpeakers(rawSegments);
  } catch (e) {
    console.warn("[diarize] speaker labeling failed, using heuristic fallback:", e.message);
    labels = heuristicLabel(rawSegments);
  }

  // Step 3: Merge into final schema
  const segments = rawSegments.map((s, i) => ({
    speaker: labels[i] || "UNKNOWN",
    start_sec: Math.max(0, Number(s.start) || 0),
    end_sec: Math.max(0, Number(s.end) || 0),
    text: (s.text || "").trim()
  })).filter(s => s.text.length > 0);

  // Sort by start time
  segments.sort((a, b) => a.start_sec - b.start_sec);

  return {
    language: whisper.language || "vi",
    segments
  };
}

/**
 * Flatten diarized transcript into tagged text for downstream skills.
 */
function diarizedToText(diarized) {
  if (!diarized || !Array.isArray(diarized.segments)) return "";
  return diarized.segments
    .map(s => `[${formatTime(s.start_sec)}] ${s.speaker}: ${s.text}`)
    .join("\n");
}

// Heuristic speaker labeling fallback (only used when Claude labeling fails).
// Strategy:
//  - First segment is AGENT (greeting) — matches our prompt assumption
//  - Score each segment with AGENT/CUSTOMER markers
//  - Apply continuity bias (consecutive short segments tend to be same speaker)
const AGENT_MARKERS = [
  /\b(em|mình|nhà thuốc|bên em|công ty|tư vấn|dược sĩ|thưa)\b/i,
  /\b(xin chào|alo|chào (anh|chị|cô|chú|bác|bạn))/i,
  /\b(sản phẩm|liều dùng|cách dùng|công dụng|thành phần|đơn hàng|giao hàng)\b/i,
  /\b(em (xin|sẽ|gửi|tư vấn|hỗ trợ|giới thiệu|chốt))/i,
];
const CUSTOMER_MARKERS = [
  /\b(tôi|chị|anh|cô|chú|bác|con|cháu|bố|mẹ|ông|bà)\b/i,
  /\b(đau|nhức|mệt|khó chịu|triệu chứng|bệnh|uống thuốc gì)\b/i,
  /\b(bao nhiêu|giá|đắt|rẻ|mắc|có tác dụng|có khỏi|có hết)\b/i,
  /\b(để (tôi|anh|chị) suy nghĩ|chưa quyết|hỏi vợ|hỏi chồng|từ chối|không cần)\b/i,
];

function scoreSpeaker(text) {
  if (!text) return 0;
  let score = 0;
  for (const re of AGENT_MARKERS)    if (re.test(text)) score += 1;
  for (const re of CUSTOMER_MARKERS) if (re.test(text)) score -= 1;
  return score; // >0 → AGENT, <0 → CUSTOMER, 0 → unknown
}

function heuristicLabel(segments) {
  const labels = new Array(segments.length).fill(null);
  // Step 1: score each segment
  const scores = segments.map(s => scoreSpeaker(s.text));
  // Step 2: assign confident labels first
  scores.forEach((sc, i) => {
    if (sc >= 1) labels[i] = "AGENT";
    else if (sc <= -1) labels[i] = "CUSTOMER";
  });
  // Step 3: anchor first segment as AGENT if still unknown (greeting bias)
  if (labels[0] === null) labels[0] = "AGENT";
  // Step 4: fill gaps using continuity (consecutive unlabeled segments inherit
  // from the last labeled neighbor, then alternate when speaker likely changed —
  // detected by long gap or punctuation-heavy text)
  let last = labels[0];
  for (let i = 1; i < labels.length; i++) {
    if (labels[i] !== null) { last = labels[i]; continue; }
    const prev = segments[i - 1];
    const cur = segments[i];
    const gap = (cur.start || 0) - (prev.end || 0);
    const longSilence = gap > 1.2;        // > 1.2s gap → likely turn change
    const endsWithQuestion = /[?？]\s*$/.test(prev.text || "");
    const turnChange = longSilence || endsWithQuestion;
    labels[i] = turnChange ? (last === "AGENT" ? "CUSTOMER" : "AGENT") : last;
    last = labels[i];
  }
  return labels;
}

function formatTime(sec) {
  const s = Math.floor(sec || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

module.exports = { diarizeAudio, diarizedToText, formatTime, transcribeWithGroq, labelSpeakers };
