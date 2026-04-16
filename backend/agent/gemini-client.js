// Shared Gemini client + helpers for structured JSON calls.
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) console.warn("[gemini-client] GEMINI_API_KEY missing");

const genAI = new GoogleGenerativeAI(API_KEY);
const fileManager = new GoogleAIFileManager(API_KEY);

const MODEL_NAME = process.env.GEMINI_MODEL || "gemini-flash-latest";

/**
 * Call Gemini with JSON response schema enforcement.
 * @param {Object} opts
 * @param {string} opts.systemInstruction
 * @param {Array} opts.parts - parts array (text + optional fileData)
 * @param {Object} opts.schema - responseSchema
 * @param {number} opts.temperature
 * @returns {Promise<Object>} parsed JSON
 */
async function generateStructured({ systemInstruction, parts, schema, temperature = 0.2, modelName, maxOutputTokens = 32768 }) {
  const model = genAI.getGenerativeModel({
    model: modelName || MODEL_NAME,
    systemInstruction,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature,
      maxOutputTokens
    }
  });

  const result = await model.generateContent({ contents: [{ role: "user", parts }] });
  const raw = result.response.text();
  try {
    return JSON.parse(raw);
  } catch (e) {
    // Strip potential markdown fences as safety
    const stripped = raw.replace(/```json/gi, "").replace(/```/g, "").trim();
    return JSON.parse(stripped);
  }
}

/**
 * Upload an audio file to Gemini Files API, return {file, cleanup}.
 * cleanup() deletes the file from Gemini to avoid clutter.
 */
async function uploadAudio(filePath, mimeType = "audio/mpeg") {
  const uploadResp = await fileManager.uploadFile(filePath, {
    mimeType,
    displayName: `call-${Date.now()}`
  });
  return {
    file: uploadResp.file,
    fileData: { mimeType: uploadResp.file.mimeType, fileUri: uploadResp.file.uri },
    cleanup: async () => {
      try { await fileManager.deleteFile(uploadResp.file.name); } catch (_) {}
    }
  };
}

module.exports = { genAI, fileManager, generateStructured, uploadAudio, MODEL_NAME };
