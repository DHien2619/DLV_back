require('dotenv').config();
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const os = require('os');
const supabase = require('./db/supabaseClient');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { GoogleAIFileManager } = require("@google/generative-ai/server");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const fileManager = new GoogleAIFileManager(process.env.GEMINI_API_KEY);

const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Sửa lỗi CORS triệt để cho Vercel & Railway
const corsOptions = {
    origin: [/https:\/\/.*\.vercel\.app$/, "https://dlv-back.vercel.app", "http://localhost:5173", "http://localhost:3000"],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    credentials: true,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Middleware for token authentication
const authenticateToken = (req, res, next) => {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.sendStatus(401);

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(401);
        req.user = user;
        next();
    });
};

// --- LLM WIKI UPDATERS ---
async function updateEmployeeWiki(employeePhone, newTranscriptionText) {
    try {
        console.log(`[LLM Wiki] Bắt đầu cập nhật wiki cho SĐT: ${employeePhone}`);
        const { data: existingWiki } = await supabase.from('employee_wiki').select('*').eq('employee_phone', employeePhone).single();
        let oldWikiContent = existingWiki ? existingWiki.wiki_content : "Chưa có thông tin.";
        let totalCalls = existingWiki ? existingWiki.total_calls : 0;

        const prompt = `Bạn là hệ thống Kho Trí Thức LLM Wiki. Cập nhật hồ sơ nhân viên ${employeePhone} dựa trên cuộc gọi mới:\nOld: ${oldWikiContent}\nNew: ${newTranscriptionText}`;
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        const result = await model.generateContent(prompt);
        const newWikiContent = result.response.text();

        await supabase.from('employee_wiki').upsert({
            employee_phone: employeePhone,
            wiki_content: newWikiContent,
            total_calls: totalCalls + 1,
            last_updated: new Date()
        }, { onConflict: 'employee_phone' });
    } catch (e) { console.error(e); }
}

async function updateCustomerWiki(customerIdentifier, newTranscriptionText) {
    if (!customerIdentifier) return;
    try {
        const { data: existingWiki } = await supabase.from('customer_wiki').select('*').eq('customer_phone', customerIdentifier).single();
        let oldWikiContent = existingWiki ? existingWiki.wiki_content : "Khách hàng mới.";
        let totalCalls = existingWiki ? existingWiki.total_calls : 0;

        const prompt = `Cập nhật hồ sơ y tế khách hàng [${customerIdentifier}]. Tổng hợp bệnh lý, lịch sử mua hàng:\nOld: ${oldWikiContent}\nNew: ${newTranscriptionText}`;
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        const result = await model.generateContent(prompt);

        await supabase.from('customer_wiki').upsert({
            customer_phone: customerIdentifier,
            wiki_content: result.response.text(),
            total_calls: totalCalls + 1,
            last_updated: new Date()
        }, { onConflict: 'customer_phone' });
    } catch (e) { console.error(e); }
}

// --- ROUTES ---
app.get('/', (req, res) => res.json({ message: 'PharmaVoice API is live!' }));

app.post('/register', async (req, res) => {
    try {
        const { name, email, password, image } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const { data: newUser } = await supabase.from('users').insert([{ name, email, password: hashedPassword, image, role: 'user' }]).select().single();
        const token = jwt.sign({ userId: newUser.id }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.status(201).json({ token, user: newUser });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const { data: user } = await supabase.from('users').select('*').eq('email', email).single();
        if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ message: 'Invalid' });
        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ token, user });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 200 * 1024 * 1024 } });

app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const { userId, customerHint } = req.body;
        if (!req.file) return res.status(400).json({ message: "No file" });

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        const uploadResponse = await fileManager.uploadFile(req.file.path, { mimeType: req.file.mimetype, displayName: "Media" });

        const prompt = `Phân tích cuộc gọi y tế, tóm tắt tóm lược, rút ra 3 insight và chấm điểm nhân viên. Trình bày Markdown đẹp mắt.`;
        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        const resultStream = await model.generateContentStream([{ fileData: { mimeType: uploadResponse.file.mimeType, fileUri: uploadResponse.file.uri } }, { text: prompt }]);

        let transcriptionText = '';
        for await (const chunk of resultStream.stream) {
            const chunkText = chunk.text();
            transcriptionText += chunkText;
            res.write(chunkText);
        }
        res.end();

        await supabase.from('transcriptions').insert([{ audioURL: req.file.originalname, transcription: transcriptionText, status: 'completed', user_id: userId }]);
        
        // Background Wiki Updates
        const phoneMatch = req.file.originalname.match(/^(\d{10,11})/);
        if (phoneMatch) updateEmployeeWiki(phoneMatch[1], transcriptionText);
        if (customerHint) {
            const r = await genAI.getGenerativeModel({ model: "gemini-flash-latest" }).generateContent(`Trích xuất ID khách hàng từ: "${customerHint}". Chỉ in kết quả.`);
            updateCustomerWiki(r.response.text().trim(), transcriptionText);
        }
    } catch (error) { res.status(500).end(error.message); }
});

app.post('/getall/:id', async (req, res) => {
    try {
        const { data: transcriptions } = await supabase.from('transcriptions').select('*').eq('user_id', req.params.id);
        res.json({ transcriptions: transcriptions.map(t => ({ ...t, _id: t.id })) });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

// --- AGENT TOOLS ---
async function getEmployeeWikiApi(query) {
    const { data } = await supabase.from('employee_wiki').select('*').or(`employee_phone.ilike.%${query}%,wiki_content.ilike.%${query}%`).limit(2);
    return data && data.length > 0 ? JSON.stringify(data) : "Không tìm thấy NV.";
}

async function getCustomerWikiApi(query) {
    const { data } = await supabase.from('customer_wiki').select('*').or(`customer_phone.ilike.%${query}%,wiki_content.ilike.%${query}%`).limit(2);
    return data && data.length > 0 ? JSON.stringify(data) : "Không tìm thấy KH.";
}

const agentTools = {
    getEmployeeWiki: ({ query }) => getEmployeeWikiApi(query),
    getCustomerWiki: ({ query }) => getCustomerWikiApi(query)
};

// --- CHAT ENDPOINT ---
app.post('/chat', async (req, res) => {
    try {
        const { message, history = [] } = req.body;
        if (!message) return res.status(400).json({ message: 'Message is required' });

        const model = genAI.getGenerativeModel({
            model: 'gemini-flash-latest',
            systemInstruction: `Bạn là PharmaVoice AI. Bạn có quyền tra cứu vĩnh cửu. 
            - Nếu hỏi nhân viên: dùng getEmployeeWiki.
            - Nếu hỏi khách hàng: dùng getCustomerWiki.
            Hãy dùng Tool ngầm TRƯỚC khi trả lời Boss. Trình bày Markdown cực kỳ ngắn gọn, chuyên nghiệp.`,
            tools: [{ functionDeclarations: [
                { name: "getEmployeeWiki", description: "Tra cứu wiki NV", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } },
                { name: "getCustomerWiki", description: "Tra cứu wiki KH (Bệnh lý, lịch sử mua hàng, tương tác)", parameters: { type: "OBJECT", properties: { query: { type: "STRING" } }, required: ["query"] } }
            ]}]
        });

        // Chuẩn hóa lịch sử: Bắt buộc xen kẽ user/model
        const normalizedHistory = [];
        let lastRole = null;
        for (const h of history) {
            const role = h.role === 'assistant' ? 'model' : 'user';
            if (!h.content) continue;
            if (role === lastRole) {
                normalizedHistory[normalizedHistory.length - 1].parts[0].text += "\n\n" + h.content;
            } else {
                normalizedHistory.push({ role, parts: [{ text: h.content }] });
                lastRole = role;
            }
        }

        // SỬA LỖI: Gemini bắt buộc tin nhắn đầu tiên phải là 'user'
        if (normalizedHistory.length > 0 && normalizedHistory[0].role === 'model') {
            normalizedHistory.unshift({ role: 'user', parts: [{ text: "Chào bạn, tôi vừa gửi file và bạn đã phân tích nội dung đó. Hãy nhớ các thông tin này để hỗ trợ tôi." }] });
        }

        // Gemini yêu cầu history không được kết thúc bằng 'user' nếu ta sắp gửi tin nhắn 'user' mới
        if (normalizedHistory.length > 0 && normalizedHistory[normalizedHistory.length - 1].role === 'user') {
            const lastUserMsg = normalizedHistory.pop();
            // Gộp tin nhắn cuối vào nội dung gửi mới
            var finalMessage = lastUserMsg.parts[0].text + "\n\nTiếp theo: " + message;
        } else {
            var finalMessage = message;
        }

        const chat = model.startChat({ history: normalizedHistory });
        console.log(`[CHAT] Đang gửi message: "${finalMessage.substring(0, 50)}..."`);
        let result = await chat.sendMessage(finalMessage);

        // Xử lý Function Call (Agent Tool)
        const call = result.response.functionCall;
        if (call && agentTools[call.name]) {
            try {
                console.log(`[CHAT AGENT] Đang tra cứu DB cho: ${call.name} -> ${JSON.stringify(call.args)}`);
                const apiRes = await agentTools[call.name](call.args);
                console.log(`[CHAT AGENT] Kết quả DB: ${apiRes.substring(0, 50)}...`);
                
                // Gửi kết quả tool lại cho AI và yêu cầu trả lời ngay
                result = await chat.sendMessage([{ functionResponse: { name: call.name, response: { content: apiRes } } }]);
                
                // Nếu sau khi gửi kết quả mà AI vẫn không trả lời bằng text, ta ép nó trả lời
                if (!result.response.text()) {
                    result = await chat.sendMessage("Dựa trên dữ liệu bạn vừa tìm thấy, hãy trả lời câu hỏi của tôi một cách chi tiết.");
                }
            } catch (toolErr) {
                console.error('[CHAT AGENT] Lỗi khi chạy Tool:', toolErr);
            }
        }

        let reply = "";
        try {
            reply = result.response.text();
        } catch (e) {
            console.error("[CHAT] Lỗi khi lấy văn bản phản hồi:", e);
            reply = "Tôi đã tra cứu xong thông tin bạn cần nhưng gặp khó khăn khi trình bày. Bạn hãy hỏi lại cụ thể hơn nhé!";
        }

        console.log(`[CHAT] AI phản hồi: "${reply.substring(0, 50)}..."`);
        res.json({ reply: reply || "AI không trả về nội dung, vui lòng thử lại." });
    } catch (error) {
        console.error('Chat error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/update-customer-wiki', async (req, res) => {
    const { identifier, transcription } = req.body;
    await updateCustomerWiki(identifier, transcription);
    res.json({ message: "OK" });
});

app.get('/customers', async (req, res) => {
    const { data } = await supabase.from('customer_wiki').select('customer_phone, last_updated').order('last_updated', { ascending: false });
    res.json(data);
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server started on ${PORT}`));
