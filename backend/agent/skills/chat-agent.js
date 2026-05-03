// Chat Agent RAG — answer questions about a customer using their history.
//
// Flow:
//   1. Embed user query
//   2. pgvector similarity search on call_chunks (scoped to customer)
//   3. Load active customer_memory
//   4. Load recent call summaries
//   5. Gemini generates answer WITH citations (call_id + timestamp + quote)
//   6. Return structured response for UI to render clickable citations

const { SchemaType } = require("@google/generative-ai");
const { generateStructured } = require("../claude-client");
const { embedText } = require("../embeddings");
const { buildCustomerContext } = require("./memory-agent");

const chatResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    answer: { type: SchemaType.STRING, description: "Cau tra loi bang tieng Viet, ngan gon, di thang van de. Dung markdown nhe nhang (**bold**, bullet) neu can." },
    confidence: { type: SchemaType.STRING, enum: ["high", "medium", "low"], description: "Do tin cay dua tren du lieu co san" },
    citations: {
      type: SchemaType.ARRAY,
      description: "Cac bang chung tu lich su KH (memory fact hoac transcript chunk) duoc dung de tra loi. Moi citation phai TRICH thuc tu context duoc cung cap.",
      items: {
        type: SchemaType.OBJECT,
        properties: {
          source_type: { type: SchemaType.STRING, enum: ["memory", "transcript", "call_summary"] },
          call_id: { type: SchemaType.STRING, description: "UUID cua call neu co (empty string neu la memory fact khong link call)" },
          timestamp_sec: { type: SchemaType.NUMBER, description: "Thoi diem trong call (0 neu la memory fact)" },
          quote: { type: SchemaType.STRING, description: "Trich nguyen van tu source" },
          note: { type: SchemaType.STRING, description: "Giai thich tai sao citation nay ho tro cho answer" }
        },
        required: ["source_type", "quote"]
      }
    },
    suggested_actions: {
      type: SchemaType.ARRAY,
      description: "2-3 hanh dong cu the agent nen lam next, dua tren context. Neu khong phu hop, return [].",
      items: { type: SchemaType.STRING }
    },
    no_info_available: {
      type: SchemaType.BOOLEAN,
      description: "True neu context khong du data de tra loi cau hoi."
    }
  },
  required: ["answer", "confidence", "citations", "no_info_available"]
};

const SYSTEM = `Ban la AI Assistant chuyen nghiep trong he thong CRM duoc pham PharmaVoice.
Nhiem vu: Tra loi cau hoi ve MOT KHACH HANG cu the dua tren:
- Active memory facts (kien thuc ben vung ve KH)
- Tom tat cac cuoc goi gan day
- Cac doan transcript lien quan (retrieved via semantic search)
- Lich su chat (neu co)

NGUYEN TAC TRA LOI:
1. NGAN GON: 2-5 cau. Nguoi dung muon insight, khong phai bai van.
2. DUNG EVIDENCE: Moi khang dinh phai kem citation tu context. Khong bia, khong suy dien ngoai du lieu.
3. TRUNG THUC: Neu context khong du, dat no_info_available=true va noi ro "Chua co du lieu ve [X]. Can xac nhan voi KH trong call tiep theo."
4. NHU NHAN VIEN THUC THU: Noi cu the ("KH da noi dang dung Telfast 2 tuan, hieu qua kem"), khong chung chung ("co the KH dang dung thuoc khac").
5. CITATIONS quan trong nhat: Moi cau tra loi it nhat 1 citation (tru khi no_info_available=true). Citation phai QUOTE NGUYEN VAN tu context.
6. SUGGESTED ACTIONS: Chi suggest neu lien quan ro rang den cau hoi. VD: "Nen follow-up KH trong 3 ngay toi ve tac dung phu Telfast" chu khong phai "Nen cham soc KH".
7. NGON NGU: Tieng Viet tu nhien, su dung thuat ngu duoc pham chinh xac.

VI DU TOT:
Q: "KH co hay bi di ung khong?"
A: {
  answer: "Co. KH da bao di ung **Penicillin** trong call ngay 15/3, va di ung hai san theo call 20/3. Can luu y khi goi y san pham moi.",
  confidence: "high",
  citations: [
    {source_type: "memory", call_id: "uuid", timestamp_sec: 180, quote: "Em di ung Penicillin tu be anh a", note: "Fact ben vung da xac nhan"},
    {source_type: "transcript", call_id: "uuid2", timestamp_sec: 245, quote: "Hai san em cung khong an duoc, toan bi noi me", note: "Ke trong call follow-up"}
  ],
  suggested_actions: ["Check tuong tac cho moi san pham co goc beta-lactam", "Ghi chu warning trong profile"],
  no_info_available: false
}

VI DU KEM:
Q: "KH co con khong?"
A (KHONG CO CONTEXT): {
  answer: "Chua co thong tin ve tinh trang gia dinh cua KH trong lich su.",
  confidence: "low", citations: [],
  suggested_actions: ["Hoi ve tinh trang gia dinh trong call tiep theo neu can tu van san pham cho tre em"],
  no_info_available: true
}`;

/**
 * Chat with customer's history as context.
 *
 * @param {Object} opts
 * @param {Object} opts.supabase
 * @param {string} opts.customerId - required for scoped chat
 * @param {string} opts.message - user question
 * @param {Array} [opts.history] - [{role: 'user'|'assistant', content}]
 * @param {number} [opts.topK=6] - number of chunks to retrieve
 */
async function chatWithCustomerHistory({ supabase, customerId, message, history = [], topK = 6 }) {
  if (!customerId) throw new Error("customerId required for chat");
  if (!message?.trim()) throw new Error("message required");

  // Parallel context gathering
  const [memoryContext, callsData, queryEmbed] = await Promise.all([
    buildCustomerContext({ supabase, customerId }),
    supabase.from("calls")
      .select("id, created_at, insights, total_quality_score, opportunity_score, compliance_status")
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(r => r.data || []),
    embedText(message, "RETRIEVAL_QUERY")
  ]);

  // Semantic chunk retrieval
  let chunks = [];
  if (queryEmbed) {
    const { data } = await supabase.rpc("match_customer_chunks", {
      query_embedding: queryEmbed,
      customer_filter: customerId,
      match_count: topK,
      similarity_threshold: 0.65
    });
    chunks = data || [];
  }

  // Build context block
  const contextParts = [];

  if (memoryContext) {
    contextParts.push(`### ACTIVE MEMORY FACTS (kien thuc ben vung ve KH):\n${memoryContext}`);
  }

  if (callsData.length) {
    const summaries = callsData.map((c, i) => {
      const summ = c.insights?.structure?.summary_short || "(khong co tom tat)";
      const detail = c.insights?.structure?.summary_detailed || "";
      const date = new Date(c.created_at).toISOString().slice(0, 10);
      return `  CALL #${i + 1} [id=${c.id} date=${date} Q=${c.total_quality_score || "?"} OPP=${c.opportunity_score || "?"} ${c.compliance_status ? `COMP=${c.compliance_status.toUpperCase()}` : ""}]
    Summary: ${summ}
    Detail: ${detail.slice(0, 300)}`;
    });
    contextParts.push(`### RECENT CALLS (${callsData.length} cuoc gan nhat):\n${summaries.join("\n\n")}`);
  }

  if (chunks.length) {
    const chunkLines = chunks.map(ch => {
      return `  [call_id=${ch.call_id} t=${Math.floor(ch.start_sec || 0)}s sim=${(ch.similarity || 0).toFixed(2)} speaker=${ch.speaker || "?"}]
    "${ch.chunk_text}"`;
    });
    contextParts.push(`### RELEVANT TRANSCRIPT CHUNKS (tu semantic search):\n${chunkLines.join("\n\n")}`);
  }

  if (!contextParts.length) {
    contextParts.push("(KH chua co du lieu lich su.)");
  }

  const contextBlock = contextParts.join("\n\n");

  // History as text
  const historyBlock = history.length
    ? history.map(h => `${h.role === "user" ? "USER" : "ASSISTANT"}: ${h.content}`).join("\n")
    : "";

  const userPart = `=== CONTEXT VE KH ===
${contextBlock}

${historyBlock ? `=== LICH SU CHAT ===\n${historyBlock}\n\n` : ""}=== CAU HOI HIEN TAI ===
${message}

Tra loi theo schema. Nho: moi citation PHAI co quote nguyen van tu context phia tren.`;

  const result = await generateStructured({
    systemInstruction: SYSTEM,
    parts: [{ text: userPart }],
    schema: chatResponseSchema,
    temperature: 0.3,
    tier: 'premium', // Customer RAG reasoning + citations — Sonnet
    maxOutputTokens: 3000
  });

  return {
    ...result,
    context_used: {
      memory_chars: memoryContext.length,
      calls_count: callsData.length,
      chunks_retrieved: chunks.length,
      top_similarity: chunks[0]?.similarity || 0
    }
  };
}

/**
 * Chat with call-specific context (insights + transcript injected).
 */
async function chatWithCallContext({ supabase, callId, customerId, message, history = [] }) {
  if (!callId) throw new Error("callId required");

  // Load call data
  const { data: call } = await supabase.from("calls")
    .select("id, customer_id, transcript_raw, insights, total_quality_score, opportunity_score, compliance_status")
    .eq("id", callId).single();
  if (!call) throw new Error("Call not found");

  const effectiveCustId = customerId || call.customer_id;

  // Build context from call insights
  const callContext = [];
  if (call.insights?.structure?.summary_detailed) callContext.push(`TOM TAT CUOC GOI:\n${call.insights.structure.summary_detailed}`);
  if (call.insights?.quality) {
    const q = call.insights.quality;
    callContext.push(`CHAT LUONG: ${q.overall_grade} ${q.total_score}/100\nDiem manh: ${(q.top_strengths||[]).join('; ')}\nCan cai thien: ${(q.top_improvements||[]).join('; ')}`);
  }
  if (call.insights?.opportunity) {
    const o = call.insights.opportunity;
    callContext.push(`CO HOI: score=${o.score} stage=${o.stage} value=${o.estimated_value_vnd||0}vnd\nNBA: ${o.next_best_action||'—'}`);
  }
  if (call.insights?.compliance?.events?.length) {
    callContext.push(`TUAN THU: ${call.insights.compliance.overall_status}\n${call.insights.compliance.events.map(e=>`[${e.severity}] ${e.event_type}: "${e.quote?.slice(0,80)}"`).join('\n')}`);
  }

  // Also get customer memory if available
  let memContext = "";
  if (effectiveCustId) {
    memContext = await buildCustomerContext({ supabase, customerId: effectiveCustId });
  }

  const fullContext = [
    callContext.length ? `=== PHAN TICH CUOC GOI HIEN TAI ===\n${callContext.join('\n\n')}` : "",
    memContext ? `=== KIEN THUC VE KH ===\n${memContext}` : "",
    call.transcript_raw ? `=== TRANSCRIPT (rut gon) ===\n${call.transcript_raw.slice(0, 3000)}` : ""
  ].filter(Boolean).join("\n\n");

  const historyBlock = history.length
    ? history.map(h => `${h.role === "user" ? "USER" : "ASSISTANT"}: ${h.content}`).join("\n")
    : "";

  const userPart = `${fullContext}\n\n${historyBlock ? `=== LICH SU CHAT ===\n${historyBlock}\n\n` : ""}=== CAU HOI ===\n${message}`;

  const result = await generateStructured({
    systemInstruction: SYSTEM,
    parts: [{ text: userPart }],
    schema: chatResponseSchema,
    temperature: 0.3,
    tier: 'premium', // Call-context reasoning — Sonnet
    maxOutputTokens: 3000
  });

  return { ...result, context_used: { call_id: callId, customer_id: effectiveCustId, mode: "call" } };
}

/**
 * General advisor chat — no specific customer/call, just pharma sales expertise.
 */
async function chatAdvisor({ message, history = [] }) {
  const advisorSystem = `Ban la co van ban hang duoc pham chuyen nghiep cua PharmaVoice AI.
Nhiem vu: Tra loi cau hoi ve:
- Ky nang telesale duoc pham (cach mo dau, discovery, xu ly phan doi, chot don)
- Kien thuc san pham thao duoc, thuc pham chuc nang
- Quy dinh tuan thu quang cao duoc pham tai Viet Nam
- Best practices coaching doi ngu ban hang
- Phan tich so lieu ban hang, KPI
- Cham soc khach hang, follow-up

NGUYEN TAC:
1. Tra loi bang tieng Viet, ngan gon, thuc te.
2. Dua ra vi du cu the khi co the.
3. Neu khong biet, noi ro rang.
4. Goi y hanh dong cu the (khong chung chung).`;

  const historyBlock = history.length
    ? history.map(h => `${h.role === "user" ? "USER" : "ASSISTANT"}: ${h.content}`).join("\n")
    : "";

  const result = await generateStructured({
    systemInstruction: advisorSystem,
    parts: [{ text: `${historyBlock ? `LICH SU:\n${historyBlock}\n\n` : ""}CAU HOI: ${message}` }],
    schema: chatResponseSchema,
    temperature: 0.4,
    tier: 'fast', // General advisor Q&A — Haiku is plenty
    maxOutputTokens: 2000
  });

  return { ...result, context_used: { mode: "advisor" } };
}

module.exports = { chatWithCustomerHistory, chatWithCallContext, chatAdvisor };
