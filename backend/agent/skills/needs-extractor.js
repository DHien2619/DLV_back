// Step 3: Needs Extractor — structured customer needs profile.
const { generateStructured } = require("../claude-client");
const { needsSchema } = require("../schemas");

const SYSTEM = `Ban la chuyen vien phan tich nhu cau khach hang trong nganh duoc pham/y te.
Doc transcript cuoc goi tu van va TRICH XUAT profile nhu cau cua KHACH HANG theo schema.

NGUYEN TAC:
- Chi trich tu nhung gi KH NOI RA hoac agent XAC NHAN voi KH. Khong bia.
- Moi insight quan trong phai kem evidence_quote (quote nguyen van, ngan gon - toi da 30 tu) va evidence_timestamp neu co.
- medical_conditions: benh/trieu chung KH de cap, voi duration/severity neu KH co noi.
- current_medications: thuoc KH dang dung + hieu qua theo danh gia cua KH.
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
    temperature: 0.2
  });
}

module.exports = { extractNeeds };
