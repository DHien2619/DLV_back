// Step 3: Needs Extractor — structured customer needs profile.
const { generateStructured } = require("../claude-client");
const { needsSchema } = require("../schemas");

const SYSTEM = `Ban la chuyen vien phan tich nhu cau khach hang trong nganh duoc pham/y te.
Doc transcript cuoc goi tu van va TRICH XUAT profile nhu cau cua KHACH HANG theo schema.

NGUYEN TAC (CHONG BIA - RAT QUAN TRONG):
- CHI trich tu nhung gi KH NOI RA TRUC TIEP hoac agent XAC NHAN voi KH. TUYET DOI KHONG bia, KHONG suy dien.
- KHONG suy ra benh/nhu cau tu TEN SAN PHAM. VD: san pham "tra giam mo/giam can" KHONG co nghia KH bi "mo mau cao", "mo gan" — chi ghi khi KH TU NOI ra.
- Neu khong co cau noi cu the lam bang chung -> de MANG RONG []. Tha thieu con hon bia.
- Moi item PHAI kem evidence_quote la cum tu KH noi NGUYEN VAN trong transcript (he thong se hau kiem; quote khong khop transcript se bi LOAI BO).
- medical_conditions: benh/trieu chung KH TU de cap, voi duration/severity CHI khi KH co noi (khong co thi de trong, dung doan "trung_binh").
- current_medications: CHI thuoc/TPCN KH DANG TU DUNG truoc cuoc goi. KHONG tinh san pham agent dang chao ban trong cuoc goi nay.
- allergies: di ung thuoc/thuc pham KH nhac.
- lifestyle_factors: stress, ngu, an uong, cong viec, sinh hoat anh huong suc khoe.
- unmet_needs: nhu cau chua duoc giai quyet (VD: "khong tim duoc thuoc nao het ngua"), co urgency.
- budget_signals: do nhay gia:
  * cao = hoi gia >=3 lan hoac so sanh gia competitor hoac tu choi vi gia.
  * trung_binh = hoi gia 1-2 lan, cham chu y duoc dieu kien.
  * thap = khong quan tam gia hoac noi san sang chi tra.
  * khong_ro = chua du data.
- decision_style: VD "can hoi vo", "quyet nhanh", "can thoi gian suy nghi", "cho khuyen mai", "de con trai quyet"...
- family_context: gia dinh, con cai, cham soc cha me... neu KH co de cap.

QUAN TRONG: Output la 1 profile KH thuc te, cu the, nhu mot nhan vien biet ro KH nay se viet ra. Khong chung chung.`;

async function extractNeeds({ diarizedText }) {
  const parts = [
    {
      text: `TRANSCRIPT CO DIARIZATION:
${diarizedText}

Trich xuat profile nhu cau KH theo schema.`
    }
  ];

  return generateStructured({
    systemInstruction: SYSTEM,
    parts,
    schema: needsSchema,
    temperature: 0.2,
    tier: 'fast', // Structured extraction — Haiku is sufficient
    maxOutputTokens: 3000
  });
}

module.exports = { extractNeeds };
