require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");

const fs = require('fs');
const path = require('path');

async function run() {
    try {
        console.log("Checking API key...");
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);
        
        console.log("API Key loaded:", process.env.GEMINI_API_KEY.substring(0,10) + "...");
        
        // List models
        // Create an HTTP request since the SDK might not expose listModels clearly.
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${process.env.GEMINI_API_KEY}`);
        const data = await response.json();
        console.log("AVAILABLE MODELS:", data.models.map(m=>m.name).join(', '));
        
        // create a dummy file
        const dummyPath = path.join(__dirname, 'dummy.txt');
        fs.writeFileSync(dummyPath, "Hello world, this is a test audio file");
        
        console.log("Uploading test file to Gemini...");
        const uploadResult = await fileManager.uploadFile(dummyPath, {
            mimeType: "text/plain",
            displayName: "Test File",
        });
        console.log("Upload Success! URI:", uploadResult.file.uri);
        
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });
        const result = await model.generateContent([
            {
                fileData: {
                    mimeType: uploadResult.file.mimeType,
                    fileUri: uploadResult.file.uri
                }
            },
            { text: "Just reply 'OK'." }
        ]);
        
        console.log("Model response:", result.response.text());
        fs.unlinkSync(dummyPath);
    } catch (e) {
        console.error("Error occurred:", e);
    }
}
run();
