// Claude client — drop-in replacement for gemini-client's generateStructured().
// Uses Claude's tool_use mechanism to enforce JSON schema (Anthropic's official
// way to get structured output).
const Anthropic = require("@anthropic-ai/sdk");

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) console.warn("[claude-client] ANTHROPIC_API_KEY missing");

const anthropic = new Anthropic({ apiKey: API_KEY });

const MODEL_NAME = process.env.CLAUDE_MODEL || "claude-sonnet-4-5";

/**
 * Convert Gemini-style responseSchema → JSON Schema for Anthropic tool input_schema.
 * Gemini uses uppercase types ("STRING", "OBJECT", "ARRAY", "NUMBER", "INTEGER", "BOOLEAN").
 * JSON Schema uses lowercase ("string", "object", "array", "number", "integer", "boolean").
 */
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

/**
 * Generate structured JSON output using Claude tool_use forcing.
 * Signature mirrors gemini-client.generateStructured for drop-in swap.
 *
 * @param {Object} opts
 * @param {string} opts.systemInstruction
 * @param {Array} opts.parts - { text } parts. (Claude does NOT support audio — audio parts ignored.)
 * @param {Object} opts.schema - Gemini-style responseSchema (auto-converted)
 * @param {number} [opts.temperature=0.2]
 * @param {string} [opts.modelName]
 * @param {number} [opts.maxOutputTokens=8192]
 */
async function generateStructured({
  systemInstruction,
  parts,
  schema,
  temperature = 0.2,
  modelName,
  maxOutputTokens = 8192
}) {
  // Flatten parts → single user message string (Claude can't process audio fileData).
  const userText = (parts || [])
    .map(p => {
      if (p.text) return p.text;
      if (p.fileData) return `[Audio file attached: ${p.fileData.fileUri || "unknown"} — NOTE: Claude cannot process audio directly. Use transcript instead.]`;
      return "";
    })
    .filter(Boolean)
    .join("\n\n");

  const inputSchema = convertSchema(schema);

  // Use tool_use to enforce structured output. Claude will ALWAYS call this tool.
  const tool = {
    name: "emit_result",
    description: "Return the structured analysis result. You MUST call this tool with the complete result.",
    input_schema: inputSchema.type ? inputSchema : { type: "object", ...inputSchema }
  };

  const resp = await anthropic.messages.create({
    model: modelName || MODEL_NAME,
    max_tokens: maxOutputTokens,
    temperature,
    system: systemInstruction,
    tools: [tool],
    tool_choice: { type: "tool", name: "emit_result" },
    messages: [{ role: "user", content: userText }]
  });

  // Extract tool_use block
  const toolUse = resp.content.find(b => b.type === "tool_use");
  if (!toolUse) {
    throw new Error("[claude-client] No tool_use block in response");
  }
  return toolUse.input;
}

/**
 * Generate free-form text response (for chat-agent advisor mode, summaries, etc.)
 */
async function generateText({ systemInstruction, userMessage, history = [], temperature = 0.4, maxTokens = 4096, modelName }) {
  const messages = [
    ...history.map(h => ({ role: h.role, content: h.content })),
    { role: "user", content: userMessage }
  ];

  const resp = await anthropic.messages.create({
    model: modelName || MODEL_NAME,
    max_tokens: maxTokens,
    temperature,
    system: systemInstruction,
    messages
  });

  const textBlock = resp.content.find(b => b.type === "text");
  return textBlock?.text || "";
}

module.exports = { anthropic, generateStructured, generateText, MODEL_NAME };
