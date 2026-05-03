// Step 6: Call Structure — summary + phases + moments + talk-ratio + sentiment arc.
const { generateStructured } = require("../claude-client");
const { callStructureSchema } = require("../schemas");

const SYSTEM = `Ban la chuyen gia phan tich cau truc cuoc goi sales.
Doc transcript co diarization va tra ve:

1. summary_short: 1-2 cau tom tat.
2. summary_detailed: 4-6 cau ke lai cuoc goi theo thu tu thoi gian (KH ai, van de gi, agent lam gi, ket qua).

3. phases: chia cuoc goi thanh cac giai doan, co thoi diem bat dau/ket thuc (giay):
   - opening: chao hoi + xac nhan danh tinh.
   - discovery: hoi trieu chung/nhu cau.
   - pitch: gioi thieu san pham/giai phap.
   - objection_handling: xu ly phan doi (neu co).
   - close: xac nhan mua/next step.
   - wrap_up: chao tam biet.
   (Khong phai cuoc nao cung co du 6 phase. Chi ghi phase thuc te xuat hien.)
   Moi phase kem summary ngan + quality_note.

4. moments: TIMESTAMPED EVENTS quan trong (min 3, max 15):
   - buying_signal, objection, adverse_event, commitment, question_unanswered,
     price_mention, competitor_mention, emotional_peak.
   Moi moment: quote nguyen van + note ngan (ly do quan trong).

5. talk_ratio: % thoi gian AGENT noi vs CUSTOMER noi.
   - assessment: danh gia (VD: "Agent noi qua nhieu 75% - nen cho KH noi nhieu hon giai doan discovery").

6. sentiment_arc: diem moc cam xuc KH trong cuoc goi (3-8 diem).
   - timestamp_sec + sentiment level + note ngan ve nguyen nhan thay doi.

YEU CAU:
- Chi xuat su kien/nhan xet DUA TREN transcript. Khong bia.
- Quote evidence ngan gon, sat that.`;

async function analyzeStructure({ diarizedText }) {
  const parts = [
    {
      text: `TRANSCRIPT CO DIARIZATION:
${diarizedText}

Phan tich cau truc cuoc goi theo schema.`
    }
  ];

  return generateStructured({
    systemInstruction: SYSTEM,
    parts,
    schema: callStructureSchema,
    temperature: 0.3,
    tier: 'fast', // Phase segmentation + summary — Haiku
    maxOutputTokens: 3000
  });
}

module.exports = { analyzeStructure };
