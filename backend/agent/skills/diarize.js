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

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_WHISPER_MODEL || "whisper-large-v3";
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

if (!GROQ_API_KEY) console.warn("[diarize] GROQ_API_KEY missing");

// ============================================================
// Step 1a: Transcribe with Groq Whisper (returns segments + timestamps)
// ============================================================
async function transcribeWithGroq(filePath) {
  // Use FormData (available in Node 18+ globally)
  const form = new FormData();
  const fileBuffer = fs.readFileSync(filePath);
  const filename = path.basename(filePath);
  const blob = new Blob([fileBuffer]);
  form.append("file", blob, filename);
  form.append("model", GROQ_MODEL);
  form.append("response_format", "verbose_json"); // segments + timestamps
  form.append("language", "vi"); // Vietnamese
  form.append("temperature", "0");

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${GROQ_API_KEY}` },
    body: form
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq Whisper failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  // data: { text, language, duration, segments: [{ id, start, end, text, ... }] }
  return data;
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
async function diarizeAudio({ filePath }) {
  if (!filePath) throw new Error("[diarize] filePath required");

  // Step 1: Transcribe
  const whisper = await transcribeWithGroq(filePath);
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
    console.warn("[diarize] speaker labeling failed, using alternating fallback:", e.message);
    // Fallback: alternate AGENT/CUSTOMER starting with AGENT
    labels = rawSegments.map((_, i) => (i % 2 === 0 ? "AGENT" : "CUSTOMER"));
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

function formatTime(sec) {
  const s = Math.floor(sec || 0);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

module.exports = { diarizeAudio, diarizedToText, formatTime, transcribeWithGroq, labelSpeakers };
