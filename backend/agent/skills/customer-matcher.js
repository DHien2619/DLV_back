// Customer Matcher — for calls arriving without phone (hotline).
// Strategy:
//   1. Pull hints from diarized transcript (name, phone if mentioned, location, condition).
//   2. Fuzzy trigram match on name + phone candidates.
//   3. Semantic match via pgvector global similarity on early transcript chunk.
//   4. Combine scores, return top-K candidates.
//
// Let humans confirm → the system learns from the confirmation.

const { SchemaType } = require("@google/generative-ai");
const { generateStructured } = require("../claude-client");
const { embedText } = require("../embeddings");

const hintSchema = {
  type: SchemaType.OBJECT,
  properties: {
    customer_name: { type: SchemaType.STRING, description: "Ten KH neu agent co goi/KH co xung, null neu khong co" },
    phone_mentioned: { type: SchemaType.STRING, description: "SDT neu duoc doc ra trong cuoc goi" },
    location_hint: { type: SchemaType.STRING, description: "VD: Ninh Binh, Ha Noi... Neu khong co thi null" },
    primary_condition: { type: SchemaType.STRING, description: "Benh/trieu chung chinh KH de cap" },
    key_medication: { type: SchemaType.STRING, description: "Thuoc KH dang dung hoac duoc agent de xuat" },
    unique_detail: { type: SchemaType.STRING, description: "1-2 chi tiet dac biet dac trung cho KH (vd: 'bo di lam Nhat', 'con gai hoc lop 5')" }
  },
  required: []
};

const HINT_SYSTEM = `Trich xuat dau hieu nhan dang KH tu transcript cuoc goi. Chi lay nhung gi XUAT HIEN RO trong transcript, khong suy dien. Neu khong ro, dat null.`;

// Vietnamese diacritic-strip + lowercase normalize (for fuzzy comparison).
function normalizeVi(s) {
  if (!s) return "";
  return String(s)
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

// Levenshtein distance (small strings → fine without optimizations).
function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[b.length];
}

// Similarity 0..1 from edit distance (Vietnamese-normalized).
function nameSimilarity(a, b) {
  const na = normalizeVi(a), nb = normalizeVi(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const d = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return Math.max(0, 1 - d / maxLen);
}

/**
 * Extract identification hints from diarized text.
 */
async function extractHints(diarizedText) {
  const parts = [{ text: `TRANSCRIPT:\n${diarizedText}\n\nTrich dau hieu nhan dang theo schema.` }];
  return generateStructured({
    systemInstruction: HINT_SYSTEM,
    parts, schema: hintSchema, temperature: 0.0,
    tier: 'fast', // Just extract names/phones — Haiku
    maxOutputTokens: 1000
  });
}

/**
 * Find candidate customers combining fuzzy name/phone + semantic similarity.
 * @returns array of { customer_id, name, phone, score, reasons: [] } sorted desc.
 */
async function findCandidates({ supabase, diarizedText, topK = 5 }) {
  const hints = await extractHints(diarizedText).catch(() => ({}));
  const candidates = new Map(); // id -> { customer, score, reasons }

  const add = (cust, scoreDelta, reason) => {
    if (!cust?.id) return;
    const cur = candidates.get(cust.id) || { customer: cust, score: 0, reasons: [] };
    cur.score += scoreDelta;
    cur.reasons.push(reason);
    candidates.set(cust.id, cur);
  };

  // 1) Exact phone
  if (hints.phone_mentioned) {
    const clean = String(hints.phone_mentioned).replace(/\D/g, "");
    if (clean.length >= 9) {
      const { data } = await supabase.from("customers")
        .select("id,name,phone,code")
        .ilike("phone", `%${clean.slice(-9)}%`).limit(3);
      for (const c of (data || [])) add(c, 0.5, `phone match: ${c.phone}`);
    }
  }

  // 2) Fuzzy name — ilike pre-filter + Vietnamese-normalized Levenshtein re-rank.
  // Pulls a wider candidate set then scores by edit distance on diacritic-stripped
  // names → catches typos, missing dấu, last-name only ("Lan" vs "Nguyen Thi Lan").
  if (hints.customer_name) {
    const name = hints.customer_name.trim();
    const tokens = normalizeVi(name).split(" ").filter(t => t.length >= 2);
    // Build OR filter: name ILIKE %tok1% OR name ILIKE %tok2% ...
    const orFilter = tokens.length
      ? tokens.map(t => `name.ilike.%${t}%`).join(",")
      : `name.ilike.%${name}%`;
    const { data } = await supabase.from("customers")
      .select("id,name,phone,code,address")
      .or(orFilter).limit(20);
    for (const c of (data || [])) {
      const sim = nameSimilarity(name, c.name);
      if (sim >= 0.55) {
        add(c, 0.3 * sim + (sim > 0.85 ? 0.2 : 0), `name fuzzy ${(sim * 100).toFixed(0)}%: ${c.name}`);
      }
    }
  }

  // 3) Semantic search over chunks
  const probe = [hints.customer_name, hints.primary_condition, hints.key_medication, hints.unique_detail]
    .filter(Boolean).join(". ").trim();
  if (probe) {
    try {
      const embedding = await embedText(probe, "RETRIEVAL_QUERY");
      if (embedding) {
        const { data } = await supabase.rpc("match_chunks_global", {
          query_embedding: embedding,
          match_count: 15,
          similarity_threshold: 0.72
        });
        const custFreq = new Map();
        for (const row of (data || [])) {
          custFreq.set(row.customer_id, (custFreq.get(row.customer_id) || 0) + (row.similarity || 0.7));
        }
        for (const [cid, score] of custFreq) {
          const { data: cust } = await supabase.from("customers")
            .select("id,name,phone,code,address").eq("id", cid).single();
          if (cust) add(cust, Math.min(0.4, score * 0.2), `semantic similar (${score.toFixed(2)})`);
        }
      }
    } catch (e) {
      console.warn("[matcher] semantic search skipped:", e.message);
    }
  }

  const sorted = [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, topK);
  return { hints, candidates: sorted };
}

module.exports = { findCandidates, extractHints };
