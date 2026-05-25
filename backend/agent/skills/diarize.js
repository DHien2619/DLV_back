// Step 1: Diarized Transcription.
// Primary: Deepgram (nova-2, vi) — transcribe + acoustic diarization in ONE call.
//   Deepgram clusters real voices (S0/S1/...); we map clusters → AGENT/CUSTOMER by
//   talk time (telesale agent dominates the call). Splitting by actual voice avoids
//   the mid-call role-flip errors of the old text-guessing approach.
// Fallback (no DEEPGRAM_API_KEY, or Deepgram error/empty): Groq Whisper (transcribe)
//   + Claude Haiku (guess speaker from text). Kept for revert/comparison.

const fs = require("fs");
const path = require("path");
const http = require("http");
const { generateStructured } = require("../claude-client");

const GROQ_API_KEY = (process.env.GROQ_API_KEY || "").trim();
const GROQ_MODEL = (process.env.GROQ_WHISPER_MODEL || "whisper-large-v3").trim();
const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

if (!GROQ_API_KEY) console.warn("[diarize] GROQ_API_KEY missing");

const DEEPGRAM_API_KEY = (process.env.DEEPGRAM_API_KEY || "").trim();
const DEEPGRAM_MODEL = (process.env.DEEPGRAM_MODEL || "nova-2").trim();
const DEEPGRAM_LANG = (process.env.DEEPGRAM_LANG || "vi").trim();
const DEEPGRAM_URL = "https://api.deepgram.com/v1/listen";
const LOCAL_DIARIZE_URL = (process.env.LOCAL_DIARIZE_URL || "").trim();

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
// Step 1-DG: Deepgram transcribe + acoustic diarization (one call)
// ============================================================
async function transcribeAndDiarizeDeepgram(filePath, originalName = null, mimeType = null) {
  if (!DEEPGRAM_API_KEY) throw new Error("DEEPGRAM_API_KEY missing");
  const fileBuffer = fs.readFileSync(filePath);
  const nameForExt = originalName || path.basename(filePath);
  const ext = (path.extname(nameForExt) || ".mp3").toLowerCase();
  const mime = (mimeType && mimeType.startsWith("audio/")) ? mimeType : (EXT_MIME[ext] || "audio/mpeg");
  const params = new URLSearchParams({
    model: DEEPGRAM_MODEL, language: DEEPGRAM_LANG,
    diarize: "true", punctuate: "true", utterances: "true", smart_format: "true",
  });
  const res = await fetch(`${DEEPGRAM_URL}?${params}`, {
    method: "POST",
    headers: { Authorization: `Token ${DEEPGRAM_API_KEY}`, "Content-Type": mime },
    body: fileBuffer,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Deepgram failed (${res.status}): ${t.slice(0, 300)}`);
  }
  return res.json();
}

// Map Deepgram speaker clusters (0/1/...) → AGENT/CUSTOMER.
// Heuristic: in outbound telesale the AGENT dominates talk time → most-talk = AGENT,
// 2nd = CUSTOMER, any extra clusters = UNKNOWN.
function assignRoles(utterances) {
  const stats = {};
  for (const u of utterances) {
    const k = u.speaker;
    if (!(k in stats)) stats[k] = { time: 0, first: Infinity };
    stats[k].time += Math.max(0, (Number(u.end) || 0) - (Number(u.start) || 0));
    stats[k].first = Math.min(stats[k].first, Number(u.start) || 0);
  }
  const ids = Object.keys(stats).map(Number);
  if (ids.length <= 1) return ids.length ? { [ids[0]]: "AGENT" } : {};
  const byTime = ids.slice().sort((a, b) => stats[b].time - stats[a].time);
  const map = { [byTime[0]]: "AGENT", [byTime[1]]: "CUSTOMER" };
  byTime.slice(2).forEach((i) => (map[i] = "UNKNOWN"));
  return map;
}

// Convert Deepgram response → { language, segments:[{speaker,start_sec,end_sec,text}] }
function dgToSegments(dg) {
  const utt = (dg.results && dg.results.utterances) || [];
  const lang = (dg.results?.channels?.[0]?.detected_language) || DEEPGRAM_LANG || "vi";
  if (utt.length === 0) {
    const alt = dg.results?.channels?.[0]?.alternatives?.[0] || {};
    const text = (alt.transcript || "").trim();
    return { language: lang, segments: text ? [{ speaker: "UNKNOWN", start_sec: 0, end_sec: dg.metadata?.duration || 0, text }] : [] };
  }
  const roleMap = assignRoles(utt);
  const segments = utt.map((u) => ({
    speaker: roleMap[u.speaker] || "UNKNOWN",
    start_sec: Math.max(0, Number(u.start) || 0),
    end_sec: Math.max(0, Number(u.end) || 0),
    text: (u.transcript || "").trim(),
  })).filter((s) => s.text.length > 0);
  segments.sort((a, b) => a.start_sec - b.start_sec);
  return { language: lang, segments };
}

// ============================================================
// Step 1b: Label speakers with Claude (FALLBACK path only)
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

// Call local Whisper+pyannote HTTP service (same machine), via Node http (NO timeout —
// CPU diarization of long calls can take many minutes). Returns {language, segments}.
function diarizeViaLocalService(filePath) {
  return new Promise((resolve, reject) => {
    const u = new URL(LOCAL_DIARIZE_URL);
    const body = JSON.stringify({ filePath });
    const req = http.request(
      {
        hostname: u.hostname, port: u.port, path: u.pathname, method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          if (res.statusCode !== 200) return reject(new Error(`local diarize ${res.statusCode}`));
          try {
            const j = JSON.parse(data);
            if (j && j.error) return reject(new Error(`local diarize: ${j.error}`));
            resolve({ language: (j && j.language) || "vi", segments: (j && j.segments) || [] });
          } catch (e) { reject(e); }
        });
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ============================================================
// Step 1-AAI: AssemblyAI (cloud transcribe + acoustic diarize) → map roles by
// content → Gemini label-correction → smooth/merge. PRIMARY engine for mono
// Vietnamese telesale audio: fast, concurrent, ~92-95% after Gemini fix.
// On 429/quota or any error, Gemini correction degrades gracefully to rule-only.
// ============================================================
const ASSEMBLYAI_API_KEY = (process.env.ASSEMBLYAI_API_KEY || "").trim();
const AAI_BASE = "https://api.assemblyai.com/v2";
const AAI_MODELS = (process.env.AAI_SPEECH_MODELS || "universal-3-pro").split(",").map(s => s.trim()).filter(Boolean);
const GEMINI_API_KEY = (process.env.GEMINI_API_KEY || "").trim();
const GEMINI_CORRECT_MODEL = (process.env.GEMINI_CORRECT_MODEL || "gemini-flash-latest").trim();
const DIARIZE_LLM_CORRECT = (process.env.DIARIZE_LLM_CORRECT || "1") !== "0";

async function aaiReq(method, url, body, headers) {
  const res = await fetch(url, { method, headers: { authorization: ASSEMBLYAI_API_KEY, ...(headers || {}) }, body });
  if (!res.ok) throw new Error(`AssemblyAI ${method} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function aaiTranscribe(filePath) {
  const buf = fs.readFileSync(filePath);
  const up = await aaiReq("POST", `${AAI_BASE}/upload`, buf, { "content-type": "application/octet-stream" });
  let tr = await aaiReq("POST", `${AAI_BASE}/transcript`, JSON.stringify({
    audio_url: up.upload_url, speaker_labels: true, language_code: "vi",
    speakers_expected: 2, speech_models: AAI_MODELS, punctuate: true, format_text: true
  }), { "content-type": "application/json" });
  const id = tr.id;
  for (let i = 0; i < 200; i++) {
    if (tr.status === "completed") return tr;
    if (tr.status === "error") throw new Error(`AssemblyAI: ${tr.error}`);
    await new Promise(r => setTimeout(r, 3000));
    tr = await aaiReq("GET", `${AAI_BASE}/transcript/${id}`);
  }
  throw new Error("AssemblyAI poll timeout");
}

const AAI_AGENT_MARKERS = ["bên em","bên cháu","bên mình","phòng khám","công ty","tư vấn","dược sĩ","em gửi","em xin","cho em xin","em sẽ gửi","em gọi","miễn phí ship","free ship","khuyến mãi","giảm giá","liệu trình","sản phẩm","thành phần","công dụng","xin chào","chào chị","chào anh","chào cô","chào bác","chào mình","tình trạng","triệu chứng","đang sử dụng","đang dùng","đơn hàng","địa chỉ"];

// Map AssemblyAI speaker clusters (A/B/...) → AGENT/CUSTOMER by content markers.
function aaiAssignRoles(turns, textByCluster) {
  const talk = {}, first = {};
  for (const [s, e, lab] of turns) { talk[lab] = (talk[lab] || 0) + (e - s); first[lab] = Math.min(first[lab] ?? 1e9, s); }
  const ids = Object.keys(talk);
  if (ids.length <= 1) return ids.length ? { [ids[0]]: "AGENT" } : {};
  const score = {};
  for (const k of ids) { const t = (textByCluster[k] || "").toLowerCase(); score[k] = AAI_AGENT_MARKERS.reduce((a, m) => a + (t.split(m).length - 1), 0); }
  const agent = ids.slice().sort((a, b) => (score[b] - score[a]) || (first[a] - first[b]) || (talk[b] - talk[a]))[0];
  const role = { [agent]: "AGENT" };
  const others = ids.filter(k => k !== agent).sort((a, b) => talk[b] - talk[a]);
  if (others[0]) role[others[0]] = "CUSTOMER";
  for (const k of others.slice(1)) role[k] = "UNKNOWN";
  return role;
}

const _aaiNormc = (s) => (s || "").toLowerCase().replace(/[^0-9a-zà-ỹ]/g, "");

const AAI_CORRECT_PROMPT = `Bạn là chuyên gia hiệu đính nhãn người nói cho transcript cuộc gọi telesale dược phẩm (tiếng Việt).
Máy tách giọng theo ÂM THANH tạo ra các đoạn dưới đây, mỗi đoạn gắn [AGENT] (nhân viên) hoặc [CUSTOMER] (khách). Nhãn và RANH GIỚI giữa các đoạn THƯỜNG SAI vì máy cắt theo tiếng, không theo nghĩa. Hãy CHỦ ĐỘNG chia lại theo NGHĨA, ĐỪNG giữ nguyên ranh giới máy cắt.

LỖI HAY GẶP (sửa đúng):
1) Một câu/ý của CÙNG MỘT người bị xé thành nhiều đoạn rồi gán nhầm qua người kia → GỘP lại về đúng người.
2) Tiếng đáp ngắn của người ĐANG NGHE ("dạ", "vâng", "ừ", "đúng rồi ạ", "à") bị dính vào lượt nói dài của người kia → TÁCH ra, gán cho người nghe.
3) Mảnh vụn ngắn do nói đè → gán theo câu liền kề cho hợp mạch.

QUAN TRỌNG — CHỐNG GỘP LẠM:
- Khi khách nói xong, agent ĐÁP LẠI là một LƯỢT MỚI. ĐỪNG gộp lời agent vào lượt khách chỉ vì cùng chủ đề (và ngược lại).
- Câu giải thích/hướng dẫn liều/báo giá (vd "mỗi hộp 300 viên, uống 15 viên sáng", "giá 490 còn 367") = AGENT.
- Câu kể bệnh/triệu chứng/mặc cả/nghi ngờ/hỏi = CUSTOMER.

RÀNG BUỘC TUYỆT ĐỐI (vi phạm = hỏng):
1. GIỮ NGUYÊN 100% TỪ NGỮ: không thêm/bớt/sửa chữ, không tóm tắt, không bỏ "ờ/à/dạ". Chép y hệt từng chữ.
2. GIỮ ĐÚNG THỨ TỰ thời gian. Chỉ ĐỔI NHÃN và GOM/TÁCH ranh giới.
3. Nối toàn bộ text các đoạn output phải BẰNG ĐÚNG text input (cùng số chữ).
4. CHỈ trả JSON: {"segments":[{"speaker":"AGENT","text":"..."}]}

VÍ DỤ (chỉ để học cách sửa — KHÔNG đưa text ví dụ vào output):
Input:
[AGENT] Còn sản phẩm này thì... Thật ra cô cũng đã
[CUSTOMER] dùng đông y rồi nhưng nên
[AGENT] không nhớ nữa Cái đông y thì phải dùng lâu dài nhé
Output đúng:
{"segments":[{"speaker":"AGENT","text":"Còn sản phẩm này thì..."},{"speaker":"CUSTOMER","text":"Thật ra cô cũng đã dùng đông y rồi nhưng nên không nhớ nữa"},{"speaker":"AGENT","text":"Cái đông y thì phải dùng lâu dài nhé"}]}

Input:
[CUSTOMER] cô nhé Dạ vâng ạ, mỗi 1
[AGENT] hồn này là 300 viên uống 15 viên sáng
Output đúng:
{"segments":[{"speaker":"CUSTOMER","text":"cô nhé Dạ vâng ạ,"},{"speaker":"AGENT","text":"mỗi 1 hồn này là 300 viên uống 15 viên sáng"}]}

Transcript cần sửa:
`;

// Verbatim safety (±12% char drift) + re-attach timestamps from word stream.
function aaiFinalize(segments, corrected, words) {
  if (!corrected || !corrected.length) return segments;
  const origN = _aaiNormc(segments.map(s => s.text).join("")).length;
  const corrN = _aaiNormc(corrected.map(c => c.text || "").join("")).length;
  if (origN === 0 || Math.abs(corrN - origN) > 0.12 * origN) {
    console.warn(`[diarize/aai] gemini drift ${corrN} vs ${origN} → keep raw`);
    return segments;
  }
  const stream = [];
  for (const [ws, we, wt] of words) { const n = _aaiNormc(wt).length; for (let k = 0; k < n; k++) stream.push([ws, we]); }
  const out = []; let pos = 0;
  for (const c of corrected) {
    const t = (c.text || "").trim();
    const n = _aaiNormc(t).length;
    if (n === 0) continue;
    const chunk = pos < stream.length ? stream.slice(pos, pos + n) : [];
    const st = chunk.length ? chunk[0][0] : (stream.length ? stream[stream.length - 1][1] : 0);
    const en = chunk.length ? chunk[chunk.length - 1][1] : st;
    pos += n;
    let spk = c.speaker;
    if (spk !== "AGENT" && spk !== "CUSTOMER") spk = "UNKNOWN";
    out.push({ speaker: spk, start_sec: Math.round(st * 100) / 100, end_sec: Math.round(en * 100) / 100, text: t });
  }
  return out.length ? out : segments;
}

async function aaiCorrectWithGemini(segments, words) {
  if (!(DIARIZE_LLM_CORRECT && GEMINI_API_KEY && segments.length)) return segments;
  try {
    const lines = segments.map(s => `[${s.speaker}] ${s.text}`).join("\n");
    const body = { contents: [{ parts: [{ text: AAI_CORRECT_PROMPT + lines }] }], generationConfig: { temperature: 0.1, responseMimeType: "application/json" } };
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_CORRECT_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`gemini ${res.status}`);
    const data = await res.json();
    const txt = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const corrected = JSON.parse(txt).segments || [];
    return aaiFinalize(segments, corrected, words);
  } catch (e) {
    console.warn("[diarize/aai] gemini correct failed → keep raw:", e.message);
    return segments;
  }
}

const AAI_FILLERS = new Set(["đấy","đó","ừm","à","ờ","nhé","vâng","dạ","ạ","ừ","ơ","hử","hả","rồi","thế","thì","ok","uhm","um"]);
function aaiSmoothMerge(segments) {
  if (!segments.length) return segments;
  const isFiller = (s) => { const ws = s.text.split(/\s+/).map(w => w.toLowerCase().replace(/[^0-9a-zà-ỹ]/g, "")).filter(Boolean); return ws.length > 0 && ws.length <= 2 && ws.every(w => AAI_FILLERS.has(w)); };
  const segs = segments.map(s => ({ ...s }));
  for (let i = 1; i < segs.length - 1; i++) {
    if (isFiller(segs[i]) && segs[i - 1].speaker === segs[i + 1].speaker && segs[i].speaker !== segs[i - 1].speaker) segs[i].speaker = segs[i - 1].speaker;
  }
  const out = [];
  for (const s of segs) {
    if (out.length && out[out.length - 1].speaker === s.speaker) { out[out.length - 1].end_sec = s.end_sec; out[out.length - 1].text = (out[out.length - 1].text + " " + s.text).trim(); }
    else out.push({ ...s });
  }
  return out;
}

async function diarizeViaAssemblyAI(filePath) {
  const tr = await aaiTranscribe(filePath);
  const words = (tr.words || []).map(w => [w.start / 1000, w.end / 1000, w.text || ""]);
  const utt = tr.utterances || [];
  if (!utt.length) {
    const text = (tr.text || "").trim();
    return { language: tr.language_code || "vi", segments: text ? [{ speaker: "UNKNOWN", start_sec: 0, end_sec: (tr.audio_duration || 0), text }] : [] };
  }
  const turns = utt.map(u => [u.start / 1000, u.end / 1000, u.speaker]);
  const textByCluster = {};
  for (const u of utt) textByCluster[u.speaker] = (textByCluster[u.speaker] || "") + " " + (u.text || "");
  const role = aaiAssignRoles(turns, textByCluster);
  let segments = utt.map(u => ({ speaker: role[u.speaker] || "UNKNOWN", start_sec: Math.round(u.start / 10) / 100, end_sec: Math.round(u.end / 10) / 100, text: (u.text || "").trim() })).filter(s => s.text);
  segments = await aaiCorrectWithGemini(segments, words);
  segments = aaiSmoothMerge(segments);
  return { language: tr.language_code || "vi", segments };
}

// ============================================================
// Main orchestrator: AssemblyAI+Gemini → local Whisper+pyannote → Deepgram → Groq+Claude
// ============================================================
async function diarizeAudio({ filePath, originalName = null, mimeType = null }) {
  if (!filePath) throw new Error("[diarize] filePath required");
  if (ASSEMBLYAI_API_KEY) {
    try {
      const out = await diarizeViaAssemblyAI(filePath);
      if (out.segments.length) return out;
      console.warn("[diarize] AssemblyAI returned 0 segments → fallback");
    } catch (e) {
      console.warn("[diarize] AssemblyAI failed → fallback:", e.message);
    }
  }
  if (LOCAL_DIARIZE_URL) {
    try {
      const out = await diarizeViaLocalService(filePath);
      if (out.segments.length) return out;
      console.warn("[diarize] local service returned 0 segments → fallback");
    } catch (e) {
      console.warn("[diarize] local service failed → fallback:", e.message);
    }
  }
  if (DEEPGRAM_API_KEY) {
    try {
      const dg = await transcribeAndDiarizeDeepgram(filePath, originalName, mimeType);
      const out = dgToSegments(dg);
      if (out.segments.length) return out;
      console.warn("[diarize] Deepgram returned 0 segments → fallback to Groq");
    } catch (e) {
      console.warn("[diarize] Deepgram failed → fallback to Groq:", e.message);
    }
  }
  return diarizeAudioGroq({ filePath, originalName, mimeType });
}

// Fallback: Groq Whisper transcribe + Claude Haiku speaker labeling
async function diarizeAudioGroq({ filePath, originalName = null, mimeType = null }) {
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

module.exports = { diarizeAudio, diarizeAudioGroq, diarizedToText, formatTime, transcribeWithGroq, labelSpeakers, transcribeAndDiarizeDeepgram, dgToSegments, assignRoles };
