// Step 2: Quality Assessor — Pharma-specific 9-criteria rubric with evidence.
const { generateStructured } = require("../claude-client");
const { rubricSchema } = require("../schemas");

const SYSTEM = `Ban la chuyen gia QA (Quality Assurance) cho doi ngu tu van duoc pham/telesale y te.
Nhiem vu: cham diem cuoc goi theo RUBRIC 9 TIEU CHI duoi day, MOI TIEU CHI BAT BUOC kem evidence (timestamp + quote nguyen van tu transcript).

BUOC 1 — XAC DINH LOAI CUOC GOI (call_type) TRUOC KHI CHAM:
- tu_van_moi: tu van san pham/suc khoe -> AP DUNG CA 9 tieu chi (applicable=true het).
- chot_don / giao_hang / cskh_khieu_nai / follow_up / khac: KHONG phai tu van y khoa.
  -> 5 tieu chi Y KHOA (medical_discovery, indication_appropriateness, side_effects_disclosure, dosage_clarity, drug_interaction_check): danh applicable=false (KHONG cham oan vi cuoc nay khong nham tu van benh).
  -> 4 tieu chi LUON AP DUNG moi cuoc (applicable=true): identity_verification, empathy_listening, professional_close, compliance_language.
QUAN TRONG: moi tieu chi PHAI dien field "applicable" (true/false) dung theo call_type. Tieu chi applicable=false van dien score=0, he thong se BO QUA khi tinh tong (khong bi tru oan).

RUBRIC (tong 100 diem):

1. IDENTITY_VERIFICATION (max 5)
   - Agent co xac nhan dung ten KH? Co xac nhan SDT/ma don? Co gioi thieu ban than?
   - 5 diem: du ca 3 (ten + SDT/ma + gioi thieu). 3 diem: du 2. 1-2 diem: 1. 0: khong co.

2. MEDICAL_DISCOVERY (max 15)
   - Agent co hoi day du: trieu chung cu the, thoi gian bi, muc do, thuoc dang dung, di ung, thai ky/cho con bu (neu nu 18-45t)?
   - 13-15: hoi sau >=5 yeu to. 8-12: 3-4 yeu to. 4-7: 1-2 yeu to. 0-3: khong hoi.

3. INDICATION_APPROPRIATENESS (max 20)
   - San pham agent goi y co match trieu chung KH khong? Co dua ra tuyen bo ngoai chi dinh (off-label)?
   - 18-20: san pham phu hop + khong off-label. 12-17: phu hop nhung ly giai yeu. 6-11: phu hop mot phan. 0-5: khong phu hop hoac off-label ro rang (TRUNG vao compliance).

4. SIDE_EFFECTS_DISCLOSURE (max 15)
   - Agent chu dong nhac tac dung phu thuong gap? Giai thich cach xu ly? KH co hoi ve TDP?
   - 13-15: chu dong nhac + giai thich xu ly. 8-12: chi nhac khi KH hoi. 4-7: nhac qua loa. 0-3: khong nhac.

5. DOSAGE_CLARITY (max 10)
   - Lieu + tan suat + thoi diem (truoc/sau an) + duration co duoc noi ro?
   - 9-10: du 4 yeu to. 6-8: du 3. 3-5: du 2. 0-2: mo ho.

6. DRUG_INTERACTION_CHECK (max 10)
   - Agent co hoi thuoc/thuc pham chuc nang dang dung de check tuong tac?
   - 9-10: hoi ky + giai thich tuong tac. 5-8: hoi nhung khong dan giai. 0-4: khong hoi.

7. EMPATHY_LISTENING (max 10)
   - Agent co dung ten KH? Phan hoi cam xuc? Reflective listening (lap lai/xac nhan y KH)? Khong ngat loi?
   - 9-10: >=3 yeu to. 6-8: 2 yeu to. 3-5: 1. 0-2: may moc.

8. PROFESSIONAL_CLOSE (max 10)
   - Xac nhan don hang? Next step ro rang? Thoi gian follow-up? Cam on?
   - 9-10: du 4. 6-8: 3. 3-5: 2. 0-2: cut cuoc goi.

9. COMPLIANCE_LANGUAGE (max 5)
   - KHONG hua "chua khoi 100%"? KHONG so sanh xau doi thu? KHONG tuyen bo khong co co so khoa hoc?
   - 5: sach. 3: co loi nhe. 1: co loi trung. 0: vi pham nghiem trong.

YEU CAU OUTPUT:
- Moi tieu chi: score + max + reasoning (1-2 cau) + evidence (it nhat 1 quote kem timestamp lay tu transcript).
- Neu KHONG tim duoc evidence (VD: agent KHONG hoi di ung), viet quote: "[Khong duoc nhac den]" va timestamp: 0. Diem se thap tuong ung.
- total_score = tong 9 muc (0-100).
- overall_grade: A (>=90), B (75-89), C (60-74), D (40-59), F (<40).
- top_strengths: 2-3 diem manh noi bat cua agent.
- top_improvements: 2-3 hanh dong cu the de cai thien (actionable, khong chung chung).

Nghiem tuc va cong bang. Khong boi quet. Cham diem thuc te theo bang chung trong transcript.`;

// Diem toi da co dinh tung tieu chi (khong tin max do model tu dien)
const RUBRIC_MAX = {
  identity_verification: 5, medical_discovery: 15, indication_appropriateness: 20,
  side_effects_disclosure: 15, dosage_clarity: 10, drug_interaction_check: 10,
  empathy_listening: 10, professional_close: 10, compliance_language: 5
};

// Tinh lai total_score theo THANG DONG: chi tinh tieu chi applicable !== false.
// VD cuoc giao_hang bo qua 5 tieu chi y khoa -> cham tren thang ~30 diem thay vi 100,
// tranh diem F oan cho cuoc khong phai tu van.
function recomputeTotal(r) {
  if (!r || typeof r !== "object") return r;
  let got = 0, max = 0;
  for (const k of Object.keys(RUBRIC_MAX)) {
    const c = r[k];
    if (!c || c.applicable === false) continue;
    got += Number(c.score) || 0;
    max += RUBRIC_MAX[k];
  }
  if (max > 0) {
    const pct = Math.round((got / max) * 100);
    r.total_score = pct;
    r.overall_grade = pct >= 90 ? "A" : pct >= 75 ? "B" : pct >= 60 ? "C" : pct >= 40 ? "D" : "F";
    r.scored_out_of = max; // minh bach: diem toi da thuc te sau khi bo tieu chi N/A
  }
  return r;
}

async function assessQuality({ diarizedText, callMetadata = {} }) {
  const parts = [
    {
      text: `TRANSCRIPT CO DIARIZATION VA TIMESTAMP:
${diarizedText}

METADATA (neu co):
${JSON.stringify(callMetadata, null, 2)}

Cham diem rubric theo schema.`
    }
  ];

  const result = await generateStructured({
    systemInstruction: SYSTEM,
    parts,
    schema: rubricSchema,
    temperature: 0.2,
    tier: 'premium', // 9-criteria rubric reasoning needs Sonnet
    maxOutputTokens: 6000
  });
  return recomputeTotal(result);
}

module.exports = { assessQuality };
