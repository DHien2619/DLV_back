// Step 4: Opportunity Scout — sales intelligence + buying signals + objections.
const { generateStructured } = require("../gemini-client");
const { opportunitySchema } = require("../schemas");

const SYSTEM = `Ban la Sales Intelligence Analyst. Nhiem vu: doc cuoc goi va xuat co hoi ban hang voi gia tri va hanh dong tiep theo CU THE.

TIEU CHI CHAM SCORE (0-100):
- 90-100 (ready_to_buy): KH da dong y mua, chot so luong, hoi giao hang/thanh toan.
- 75-89 (hot): KH cam ket manh ("chi thu lay 1 hop"), hoi gia nhieu lan, hoi giao hang.
- 55-74 (interested): KH hoi thanh phan/cong dung/tac dung phu chi tiet, so sanh voi cai dang dung.
- 35-54 (qualified): KH co van de phu hop san pham, co nghe nhung chua commit.
- 15-34 (cold): KH khong huu hung, tra loi cuc chang.
- 0-14 (lost): KH tu choi ro, cup may, khong co tien.
- Neu co objection nang chua xu ly => stage "objection" bat ke score.

BUYING SIGNALS (moi signal PHAI co timestamp + quote nguyen van):
- price_inquiry: hoi gia, hoi khuyen mai.
- delivery_inquiry: hoi giao tan noi, bao lau, phi ship.
- payment_inquiry: hoi tra COD/chuyen khoan/tra gop.
- quantity_inquiry: hoi co gia si, combo, nhieu hop co giam khong.
- compare_competitor: so sanh voi thuoc dang dung/san pham khac.
- commitment_language: "lay thu", "mua thu", "dat truoc", "da quyet roi".
- urgency_language: "can gap", "mai dau thang".

OBJECTIONS:
- price: thay dat, khong du tien.
- trust: nghi ngo ve hieu qua/nguon goc/hang that gia.
- timing: chua can ngay, dang di lam xa...
- need: khong thay can thiet.
- competitor_loyalty: dang dung cai khac on roi.
- side_effect_fear: so tac dung phu.
- Moi objection PHAI xac dinh agent co xu ly tot khong (handled_well: true/false) + note ngan ve cach xu ly.

ESTIMATED_VALUE_VND:
- Uoc tinh CO CO SO: dua tren sl/product KH quan tam * gia thi truong thong thuong (VN).
- Neu KH chi quan tam 1 hop ~200-500k. Combo ~1-3tr. Lieu trinh dai ~3-10tr.
- Neu khong du info, de 0.

NEXT_BEST_ACTION: PHAI cu the, hanh dong hoa:
- XAU (tranh): "Follow up khach hang", "Goi lai sau"
- TOT: "Goi lai thu 3 sau 14h (KH da noi ranh buoi chieu), chao combo 3 hop + freeship vi KH nhay gia"

CLOSE_TIMING_DAYS:
- 0-2: hot, chot som.
- 3-7: can nurture 1-2 touch.
- 8-30: can education + follow up.
- >30 hoac -1: chua ro.

product_interest: ten san pham/nhom san pham KH to ra quan tam (du KH khong nho chinh xac ten). VD "thuoc boi co ngua".`;

async function scoutOpportunity({ diarizedText }) {
  const parts = [
    {
      text: `TRANSCRIPT CO DIARIZATION:
${diarizedText}

Phan tich co hoi ban hang va tra ve schema.`
    }
  ];

  return generateStructured({
    systemInstruction: SYSTEM,
    parts,
    schema: opportunitySchema,
    temperature: 0.3
  });
}

module.exports = { scoutOpportunity };
