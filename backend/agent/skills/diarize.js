// Step 1: Diarized Transcription with Gemini multimodal audio input.
// Gemini 2.5 Flash can handle audio and produce speaker-labeled transcripts
// when prompted with a clear schema. Not as precise as Deepgram's diarization
// but acceptable for POC — and keeps the "Gemini-only" constraint.

const { generateStructured } = require("../gemini-client");
const { diarizedTranscriptSchema } = require("../schemas");

const SYSTEM = `Ban la chuyen gia phien am tieng Viet cho cuoc goi tu van duoc pham tu xa (telesale/telehealth).
Nhiem vu:
1. Phien am CHINH XAC tung loi noi trong file audio.
2. Phan biet 2 nguoi noi:
   - AGENT: tu van vien/duoc si/telesale (thuong noi truoc, gioi thieu, hoi han).
   - CUSTOMER: khach hang (thuong dap lai, ke trieu chung, hoi gia...).
   - Dung "UNKNOWN" chi khi khong the xac dinh.
3. Chia thanh cac segments ngan (1 luot noi = 1 segment). Khi speaker chuyen thi tao segment moi.
4. Timestamps tinh theo GIAY (so thuc), bam sat audio that.
5. GIU NGUYEN van tu nhien, KHONG sua loi chinh ta, KHONG tom tat.
6. Neu co cau khong nghe ro, ghi [khong ro] trong text.

Output JSON dung schema duoc cung cap. KHONG giai thich them.`;

async function diarizeAudio({ fileData }) {
  const parts = [
    { fileData },
    { text: "Phien am cuoc goi nay voi diarization theo dung schema." }
  ];

  const result = await generateStructured({
    systemInstruction: SYSTEM,
    parts,
    schema: diarizedTranscriptSchema,
    temperature: 0.1
  });

  // Sort segments by start_sec as safety
  if (Array.isArray(result.segments)) {
    result.segments.sort((a, b) => (a.start_sec || 0) - (b.start_sec || 0));
  }
  return result;
}

/**
 * Helper: flatten diarized transcript into a single text with speaker tags
 * for downstream skills that only need text context.
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

module.exports = { diarizeAudio, diarizedToText, formatTime };
