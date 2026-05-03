// OpenRouter client — drop-in replacement for prior Anthropic SDK usage.
// Provides generateStructured() (tool_use forcing) + generateText() with same
// signatures as before, so all skill files keep working unchanged.
//
// COST OPTIMIZATION:
// 1. Two-tier model routing — `fast` (Haiku) vs `premium` (Sonnet)
//    Pass tier in opts to choose. Default = 'premium' (safe default).
// 2. Prompt caching — system prompts marked cache_control:ephemeral, gives
//    ~90% input-cost discount on the static preamble after first call.
// 3. Sane max_tokens defaults — most skills don't need 8K output.

const OR_KEY = (process.env.OPENROUTER_API_KEY || "").trim();
const OR_URL = "https://openrouter.ai/api/v1/chat/completions";

if (!OR_KEY) console.warn("[openrouter-client] OPENROUTER_API_KEY missing");

// Configurable per-tier models (override via env if needed)
const MODEL_FAST    = (process.env.OR_MODEL_FAST    || "anthropic/claude-haiku-4.5").trim();
const MODEL_PREMIUM = (process.env.OR_MODEL_PREMIUM || "anthropic/claude-sonnet-4.5").trim();

const REFERER = process.env.OR_REFERER || "https://pharmavoice.app";
const TITLE   = process.env.OR_TITLE   || "PharmaVoice";

function pickModel(tier) {
  if (tier === "fast") return MODEL_FAST;
  if (tier === "premium") return MODEL_PREMIUM;
  // back-compat: old `modelName` arg
  return tier || MODEL_PREMIUM;
}

// Convert Gemini-style schema (UPPERCASE types) → JSON Schema (lowercase) for OpenAI tool format.
function convertSchema(schema) {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(convertSchema);

  const out = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === "type" && typeof v === "string") {
      out.type = v.toLowerCase();
    } else if (k === "properties" && typeof v === "object") {
      out.properties = {};
      for (const [pk, pv] of Object.entries(v)) out.properties[pk] = convertSchema(pv);
    } else if (k === "items" && typeof v === "object") {
      out.items = convertSchema(v);
    } else if (typeof v === "object" && v !== null) {
      out[k] = convertSchema(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function callOpenRouter(body) {
  const res = await fetch(OR_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OR_KEY}`,
      "Content-Type": "application/json",
      "HTTP-Referer": REFERER,
      "X-Title": TITLE
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`[openrouter] ${res.status}: ${errText.slice(0, 500)}`);
  }
  return res.json();
}

/**
 * Build messages with cache_control on system prompt for cost saving on repeated calls.
 * Anthropic models on OpenRouter support content-block array with cache_control.
 */
function buildMessages(systemInstruction, userText) {
  return [
    {
      role: "system",
      content: [
        {
          type: "text",
          text: systemInstruction,
          cache_control: { type: "ephemeral" } // 5-min cache, saves ~90% on repeats
        }
      ]
    },
    { role: "user", content: userText }
  ];
}

/**
 * Generate structured JSON using OpenAI-compatible tool-call forcing.
 * Same signature as before — drop-in compatible with all existing skill files.
 *
 * @param {Object} opts
 * @param {string} opts.systemInstruction
 * @param {Array}  opts.parts      - [{ text }] parts (audio fileData ignored)
 * @param {Object} opts.schema     - Gemini-style schema (auto-converted)
 * @param {number} [opts.temperature=0.2]
 * @param {string} [opts.modelName] - DEPRECATED, use tier
 * @param {string} [opts.tier='premium'] - 'fast' | 'premium'
 * @param {number} [opts.maxOutputTokens=4096]
 */
async function generateStructured({
  systemInstruction,
  parts,
  schema,
  temperature = 0.2,
  modelName,
  tier = "premium",
  maxOutputTokens = 4096
}) {
  const userText = (parts || [])
    .map(p => {
      if (p.text) return p.text;
      if (p.fileData) return `[Audio file: ${p.fileData.fileUri || "unknown"} — note: text-only model, transcribe first.]`;
      return "";
    })
    .filter(Boolean)
    .join("\n\n");

  const inputSchema = convertSchema(schema);
  const tool = {
    type: "function",
    function: {
      name: "emit_result",
      description: "Return the structured analysis result. You MUST call this tool with the complete result.",
      parameters: inputSchema.type ? inputSchema : { type: "object", ...inputSchema }
    }
  };

  const body = {
    model: modelName || pickModel(tier),
    messages: buildMessages(systemInstruction, userText),
    tools: [tool],
    tool_choice: { type: "function", function: { name: "emit_result" } },
    temperature,
    max_tokens: maxOutputTokens
  };

  const data = await callOpenRouter(body);
  const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
  if (!toolCall) {
    throw new Error("[openrouter-client] No tool_call in response: " + JSON.stringify(data).slice(0, 300));
  }

  // Log cost for observability (helps tune tier choices)
  if (data.usage?.cost) {
    const cached = data.usage.prompt_tokens_details?.cached_tokens || 0;
    console.log(`[or-cost] $${data.usage.cost.toFixed(5)} · ${data.usage.prompt_tokens}in (${cached} cached) / ${data.usage.completion_tokens}out · ${body.model}`);
  }

  try {
    return JSON.parse(toolCall.function.arguments);
  } catch (e) {
    throw new Error("[openrouter-client] Tool args not valid JSON: " + toolCall.function.arguments?.slice(0, 200));
  }
}

/**
 * Generate free-form text response (chat advisor mode, summaries).
 */
async function generateText({
  systemInstruction,
  userMessage,
  history = [],
  temperature = 0.4,
  maxTokens = 2048,
  tier = "premium",
  modelName
}) {
  const messages = [
    {
      role: "system",
      content: [
        {
          type: "text",
          text: systemInstruction,
          cache_control: { type: "ephemeral" }
        }
      ]
    },
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: "user", content: userMessage }
  ];

  const body = {
    model: modelName || pickModel(tier),
    messages,
    temperature,
    max_tokens: maxTokens
  };

  const data = await callOpenRouter(body);
  if (data.usage?.cost) {
    const cached = data.usage.prompt_tokens_details?.cached_tokens || 0;
    console.log(`[or-cost] $${data.usage.cost.toFixed(5)} · ${data.usage.prompt_tokens}in (${cached} cached) / ${data.usage.completion_tokens}out · ${body.model}`);
  }
  return data.choices?.[0]?.message?.content || "";
}

module.exports = { generateStructured, generateText, MODEL_FAST, MODEL_PREMIUM, callOpenRouter };
