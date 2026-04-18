// Memory Agent — extracts durable facts from a call and updates customer_memory
// with conflict detection (when new fact contradicts an existing active fact).
//
// Facts are small, atomic, and stable (not call-specific events):
//   - condition: KH bi benh gi
//   - medication: dang/da dung thuoc gi, hieu qua
//   - allergy: di ung gi
//   - preference: decision_style / budget / contact_time
//   - goal: KH muon dat dieu gi
//   - family: tinh trang gia dinh
//   - purchase: da mua san pham gi tu nhan vien

const { SchemaType } = require("@google/generative-ai");
const { generateStructured } = require("../claude-client");

const factSchema = {
  type: SchemaType.OBJECT,
  properties: {
    facts: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          fact_type: {
            type: SchemaType.STRING,
            enum: ["condition", "medication", "allergy", "preference", "goal", "family", "purchase", "contact", "lifestyle"]
          },
          fact_key: { type: SchemaType.STRING, description: "Dinh danh ngan, stable. VD 'allergy:penicillin', 'condition:hypertension', 'preference:decision_style'" },
          fact_value: {
            type: SchemaType.OBJECT,
            properties: {
              label: { type: SchemaType.STRING, description: "Ten ngan, thong dung" },
              detail: { type: SchemaType.STRING, description: "Chi tiet ngan gon" },
              severity: { type: SchemaType.STRING },
              duration: { type: SchemaType.STRING },
              effectiveness: { type: SchemaType.STRING },
              amount_vnd: { type: SchemaType.NUMBER },
              status: { type: SchemaType.STRING, enum: ["active", "past", "unknown"] }
            },
            required: ["label"]
          },
          confidence: { type: SchemaType.NUMBER, description: "0..1" },
          source_quote: { type: SchemaType.STRING },
          source_timestamp_sec: { type: SchemaType.NUMBER }
        },
        required: ["fact_type", "fact_key", "fact_value", "confidence", "source_quote"]
      }
    }
  },
  required: ["facts"]
};

const SYSTEM = `Ban la Memory Agent cho he thong CRM duoc pham.
Nhiem vu: Doc transcript cuoc goi tu van + context KH da biet, TRICH XUAT cac FACT STABLE (kien thuc ben vung ve KH, khong phai su kien nhat thoi cua cuoc goi).

NGUYEN TAC:
1. Chi trich facts "ben vung" - du dung trong 3 thang toi. KHONG trich:
   - Thoi tiet cuoc goi, cam xuc tai thoi diem cu the.
   - Chi tiet tranh luan gia tam thoi.
   - Su kien chi xay ra 1 lan (cai do la moment, khong phai fact).
2. MOI fact PHAI co source_quote (nguyen van tu transcript) va confidence 0..1.
3. fact_key phai stable (VD: 'allergy:penicillin' khong phai 'di_ung_thang_3'). Cac fact cung loai cho cung nguoi se chung fact_key de detect conflict/update.
4. Neu fact_value trong existing_context mau thuan voi fact moi, van trich xuat fact moi (conflict se duoc xu ly downstream).
5. Neu cuoc goi khong co fact moi nao dang trich (toan chi tiet cu), tra ve facts: [].

VI DU fact_key:
- "condition:viem_xoang" → {label:"Viem xoang man", duration:"3 thang", severity:"trung_binh", status:"active"}
- "allergy:penicillin" → {label:"Di ung Penicillin", status:"active"}
- "medication:telfast" → {label:"Telfast", duration:"2 tuan", effectiveness:"kem", status:"past"}
- "preference:decision_style" → {label:"Can tham khao vo truoc khi mua"}
- "preference:contact_time" → {label:"Ranh buoi chieu sau 14h"}
- "purchase:insu_tea_4hop" → {label:"Tra Insu 4 hop", amount_vnd:950000, status:"active"}
- "family:con_nho" → {label:"Co con nho duoi 5 tuoi"}

Output theo schema.`;

async function extractFacts({ diarizedText, existingContext = "" }) {
  const parts = [
    {
      text: `EXISTING CONTEXT VE KH (cac fact da biet, JSON summary):
${existingContext || "(KH moi, chua co lich su)"}

TRANSCRIPT CUOC GOI HIEN TAI:
${diarizedText}

Trich xuat facts ben vung theo schema.`
    }
  ];

  return generateStructured({
    systemInstruction: SYSTEM,
    parts,
    schema: factSchema,
    temperature: 0.2
  });
}

/**
 * Apply extracted facts to customer_memory table with conflict detection.
 * Supabase client is passed in for DI.
 *
 * Strategy:
 * - For each new fact, query existing active (valid_to IS NULL) fact with same fact_key.
 * - If none: insert new.
 * - If existing matches (same label+detail): update confidence (take max) and skip.
 * - If existing conflicts: mark existing as superseded (valid_to=now, superseded_by=new.id) and insert new.
 *
 * Returns { inserted, updated, superseded, conflicts }.
 */
async function applyFacts({ supabase, customerId, callId, facts }) {
  const result = { inserted: 0, updated: 0, superseded: 0, conflicts: [] };
  if (!facts?.length) return result;

  // Load existing active facts for this customer
  const { data: existing } = await supabase
    .from("customer_memory")
    .select("id, fact_key, fact_value, confidence")
    .eq("customer_id", customerId)
    .is("valid_to", null);
  const existingByKey = new Map((existing || []).map(r => [r.fact_key, r]));

  for (const f of facts) {
    const prior = existingByKey.get(f.fact_key);

    if (!prior) {
      const { error } = await supabase.from("customer_memory").insert([{
        customer_id: customerId,
        fact_type: f.fact_type,
        fact_key: f.fact_key,
        fact_value: f.fact_value,
        confidence: f.confidence,
        source_call_id: callId,
        source_quote: f.source_quote,
        source_timestamp_sec: f.source_timestamp_sec || null
      }]);
      if (!error) result.inserted++;
      continue;
    }

    // Compare: same label + detail = non-conflict duplicate
    const sameLabel = (prior.fact_value?.label || "").toLowerCase().trim()
                    === (f.fact_value?.label || "").toLowerCase().trim();
    const sameDetail = (prior.fact_value?.detail || "") === (f.fact_value?.detail || "");

    if (sameLabel && sameDetail) {
      // Just refresh confidence if higher
      if ((f.confidence || 0) > (prior.confidence || 0)) {
        await supabase.from("customer_memory")
          .update({ confidence: f.confidence })
          .eq("id", prior.id);
        result.updated++;
      }
      continue;
    }

    // Conflict: supersede old, insert new
    const { data: newRow } = await supabase.from("customer_memory").insert([{
      customer_id: customerId,
      fact_type: f.fact_type,
      fact_key: f.fact_key,
      fact_value: f.fact_value,
      confidence: f.confidence,
      source_call_id: callId,
      source_quote: f.source_quote,
      source_timestamp_sec: f.source_timestamp_sec || null
    }]).select("id").single();

    if (newRow?.id) {
      await supabase.from("customer_memory")
        .update({ valid_to: new Date().toISOString(), superseded_by: newRow.id })
        .eq("id", prior.id);
      result.superseded++;
      result.conflicts.push({
        fact_key: f.fact_key,
        old: prior.fact_value,
        new: f.fact_value,
        new_quote: f.source_quote
      });
    }
  }

  return result;
}

/**
 * Build a compact "existing context" string to feed into extractFacts / analysis prompts.
 * Groups active facts by type, short labels only.
 */
async function buildCustomerContext({ supabase, customerId }) {
  if (!customerId) return "";
  const { data: facts } = await supabase
    .from("customer_memory")
    .select("fact_type, fact_key, fact_value, confidence, created_at")
    .eq("customer_id", customerId)
    .is("valid_to", null)
    .order("created_at", { ascending: false });

  if (!facts?.length) return "";

  const byType = {};
  for (const f of facts) {
    if (!byType[f.fact_type]) byType[f.fact_type] = [];
    const label = f.fact_value?.label || f.fact_key;
    const extras = [];
    if (f.fact_value?.detail) extras.push(f.fact_value.detail);
    if (f.fact_value?.severity) extras.push(`severity:${f.fact_value.severity}`);
    if (f.fact_value?.duration) extras.push(`duration:${f.fact_value.duration}`);
    if (f.fact_value?.effectiveness) extras.push(`effectiveness:${f.fact_value.effectiveness}`);
    byType[f.fact_type].push(`${label}${extras.length ? ` (${extras.join(", ")})` : ""}`);
  }
  return Object.entries(byType)
    .map(([k, v]) => `- ${k}: ${v.join("; ")}`)
    .join("\n");
}

module.exports = { extractFacts, applyFacts, buildCustomerContext };
