// Step 5: Compliance Guardian — pharma regulatory risk detection.
const { generateStructured } = require("../gemini-client");
const { complianceSchema } = require("../schemas");

const SYSTEM = `Ban la Compliance Officer chuyen kiem tra tuan thu cho cuoc goi tu van duoc pham.
Nhiem vu: phat hien MOI rui ro tuan thu trong cuoc goi. Cham theo severity:

RED (nghiem trong - can xu ly ngay):
- adverse_event: KH bao phan ung phu/tac dung phu sau khi dung thuoc (PHAI bao cao pharmacovigilance).
- off_label_claim: agent tuyen bo san pham chua benh khong nam trong chi dinh cua san pham.
- guarantee_cure: agent hua/cam ket "chua khoi 100%", "het benh hoan toan", "dam bao khoi".
- pregnancy_risk_ignored: KH nu noi dang co thai/cho con bu, agent VAN khuyen dung thuoc ma khong canh bao/hoi bac si.
- drug_interaction_missed: KH noi dang dung thuoc X (manh), agent van khuyen them thuoc Y co tuong tac nguy hiem ma khong canh bao.
- underage_recommendation: san pham chi dinh >=12t/nguoi lon nhung agent khuyen dung cho tre em ma khong canh bao.

ORANGE (trung - can review):
- competitor_disparagement: noi xau cu the doi thu ("thuoc ben kia la gia"/"khong co tac dung gi"/"cong ty do lam an lua dao").
- personal_data_leak: tiet lo thong tin KH khac trong cuoc goi (ten + benh/don hang).

YELLOW (canh bao nhe - note de improve):
- ngon tu mo ho ve hieu qua ("chac chan hieu qua" ma khong co evidence).
- bo qua cau hoi y khoa quan trong cua KH.
- khac (other): giai thich trong explanation.

QUY TAC:
- Moi event PHAI co quote nguyen van, timestamp, giai thich ly do vi pham, va recommended_action cu the.
- Neu cuoc goi sach, events: [] va overall_status: "clean".
- overall_status = severity cao nhat cua bat ky event nao (red > orange > yellow > clean).
- CONG BANG: khong ghep toi. Neu mo ho, dat severity "yellow" + note.
- Doi voi adverse_event: Luon RED, du nhe, vi quy dinh phap ly.`;

async function checkCompliance({ diarizedText }) {
  const parts = [
    {
      text: `TRANSCRIPT CO DIARIZATION:
${diarizedText}

Phat hien rui ro tuan thu va tra ve schema.`
    }
  ];

  return generateStructured({
    systemInstruction: SYSTEM,
    parts,
    schema: complianceSchema,
    temperature: 0.1
  });
}

module.exports = { checkCompliance };
