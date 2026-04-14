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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};
app.use(cors(corsOptions));

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

// ── LLM WIKI UPDATER: EMPLOYEE ────────────────────────────────
async function updateEmployeeWiki(employeePhone, newTranscriptionText) {
    try {
        console.log(`[LLM Wiki] Bắt đầu cập nhật wiki cho SĐT: ${employeePhone}`);

        const { data: existingWiki } = await supabase
            .from('employee_wiki')
            .select('*')
            .eq('employee_phone', employeePhone)
            .single();

        const oldWikiContent = existingWiki ? existingWiki.wiki_content : "Chưa có thông tin về nhân viên này trước đây.";
        const totalCalls = existingWiki ? existingWiki.total_calls : 0;

        const prompt = `Bạn là hệ thống Kho Trí Thức LLM Wiki của PharmaVoice. Nhiệm vụ của bạn là CẬP NHẬT hồ sơ của nhân viên y tế / telesale dựa trên các cuộc gọi.

Đây là HỒ SƠ HIỆN TẠI của nhân viên ${employeePhone}:
---
${oldWikiContent}
---

Đây là ĐÁNH GIÁ MỚI NHẤT từ cuộc gọi vừa xong:
---
${newTranscriptionText}
---

Hãy tổng hợp 2 thông tin trên để VIẾT LẠI một "Trang Wiki Hồ Sơ Nhân Viên" hoàn chỉnh, bằng ngôn ngữ Markdown chuyên nghiệp.
Yêu Cầu:
- Luôn giữ lại và cập nhật các phần: Điểm mạnh, điểm yếu, xu hướng nghề nghiệp, các insight cốt lõi.
- Đừng xóa các thông tin quan trọng cũ, hãy TÍCH HỢP chúng lại một cách mạch lạc.
- Tính đến hiện tại, tổng số cuộc gọi là: ${totalCalls + 1}. Hãy cập nhật con số này vào Wiki.
- Nếu cuộc gọi mới có điểm số (1-10), hãy tính toán / ước lượng lại sự thay đổi hiệu suất một cách tự nhiên.`;

        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        const result = await model.generateContent(prompt);
        const newWikiContent = result.response.text();

        const { error: upsertErr } = await supabase.from('employee_wiki').upsert({
            employee_phone: employeePhone,
            wiki_content: newWikiContent,
            total_calls: totalCalls + 1,
            last_updated: new Date()
        }, { onConflict: 'employee_phone' });

        if (upsertErr) {
            console.error(`[LLM Wiki] Lỗi DB khi cập nhật SĐT ${employeePhone}:`, upsertErr.message);
        } else {
            console.log(`[LLM Wiki] ✅ Đã cập nhật thành công hồ sơ SĐT: ${employeePhone}`);
        }
    } catch (e) {
        console.error("[LLM Wiki] Lỗi trong quá trình cập nhật:", e);
    }
}

// ── LLM WIKI UPDATER: CUSTOMER ────────────────────────────────
async function updateCustomerWiki(customerIdentifier, newTranscriptionText) {
    if (!customerIdentifier) return;
    try {
        console.log(`[Customer Wiki] Đang cập nhật hồ sơ khách hàng: ${customerIdentifier}`);

        const { data: existingWiki } = await supabase
            .from('customer_wiki')
            .select('*')
            .eq('customer_phone', customerIdentifier)
            .single();

        const oldWikiContent = existingWiki ? existingWiki.wiki_content : "Khách hàng mới. Chưa có hồ sơ trước đây.";
        const totalCalls = existingWiki ? existingWiki.total_calls : 0;

        const prompt = `Bạn là hệ thống Kho Trí Thức LLM Wiki của PharmaVoice. Nhiệm vụ của bạn là CẬP NHẬT HỒ SƠ Y TẾ / BỆNH LÝ của KHÁCH HÀNG dựa trên các cuộc gọi.

Đây là HỒ SƠ HIỆN TẠI của khách hàng [${customerIdentifier}]:
---
${oldWikiContent}
---

Đây là CHUẨN ĐOÁN / GIAO DỊCH MỚI NHẤT từ cuộc gọi vừa xong:
---
${newTranscriptionText}
---

Yêu Cầu:
Hãy rà soát HỒ SƠ HIỆN TẠI và THÔNG TIN MỚI, sau đó VIẾT LẠI một Hồ Sơ Bệnh Án / Lịch sử mua hàng hoàn chỉnh và súc tích bằng Markdown. Bắt buộc:
- Ghi nhận Thông tin y tế (Chỉ số huyết áp, bệnh lý, triệu chứng...).
- Lịch sử mua sản phẩm (Đã mua gì, lúc nào).
- Ghi chú nhắc nhở chăm sóc (Ví dụ: Khách nhắc tuần sau giao, dặn dò uống thuốc...).
- Tính đến nay, khách đã tương tác ${totalCalls + 1} lần.`;

        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        const result = await model.generateContent(prompt);
        const newWikiContent = result.response.text();

        const { error: upsertErr } = await supabase.from('customer_wiki').upsert({
            customer_phone: customerIdentifier,
            wiki_content: newWikiContent,
            total_calls: totalCalls + 1,
            last_updated: new Date()
        }, { onConflict: 'customer_phone' });

        if (upsertErr) {
            console.error(`[Customer Wiki] Lỗi DB khi cập nhật khách ${customerIdentifier}:`, upsertErr.message);
        } else {
            console.log(`[Customer Wiki] ✅ Đã cập nhật thành công hồ sơ khách: ${customerIdentifier}`);
        }
    } catch (e) {
        console.error("[Customer Wiki] Lỗi trong quá trình cập nhật:", e);
    }
}

// ── ROUTES ────────────────────────────────────────────────────

app.get('/', (req, res) => {
    res.status(200).json({ message: 'API is running and ready for testing!' });
});

// User registration
app.post('/register', async (req, res) => {
    try {
        const { name, email, password, image } = req.body;
        if (!name || !email || !password || !image) {
            return res.status(400).json({ message: 'All fields are required' });
        }
        const { data: existingUser } = await supabase.from('users').select('*').eq('email', email).single();
        if (existingUser) return res.status(400).json({ message: 'User already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);
        const { data: newUser, error: insertErr } = await supabase.from('users').insert([{
            name, email, password: hashedPassword, image, role: 'user'
        }]).select().single();
        if (insertErr) throw insertErr;

        const token = jwt.sign({ userId: newUser.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.status(201).json({ token, user: { id: newUser.id, name: newUser.name, email: newUser.email, image: newUser.image, role: newUser.role } });
    } catch (error) {
        console.error("Error registering user:", error.message);
        res.status(500).json({ message: 'Error registering user', error: error.message });
    }
});

// User login
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const { data: user, error: fetchErr } = await supabase.from('users').select('*').eq('email', email).single();
        if (!user || fetchErr) return res.status(401).json({ message: 'Invalid credentials' });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(401).json({ message: 'Invalid credentials' });

        const token = jwt.sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, user: { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role } });
    } catch (error) {
        console.error("Error logging in user:", error.message);
        res.status(500).json({ message: 'Error logging in user', error: error.message });
    }
});

// File upload and transcription
const upload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: 200 * 1024 * 1024 }
});

app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ message: "User ID is required." });
        if (!req.file) return res.status(400).json({ message: "No file uploaded." });

        const filePath = req.file.path;
        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            return res.status(400).json({ message: "File is empty." });
        }

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.flushHeaders();
        res.write(' '.repeat(4096));
        res.write('🔄 Đang phân tích dữ liệu, xin vui lòng đợi trong giây lát...\n\n');

        const keepAliveInterval = setInterval(() => { res.write(' . '); }, 5000);
        let heartBeatStopped = false;

        try {
            console.log("Đang upload file lên Gemini Servers...");
            const uploadResponse = await fileManager.uploadFile(filePath, {
                mimeType: req.file.mimetype,
                displayName: "Medical Media",
            });

            let modeInstruction = "Lắng nghe toàn bộ nội dung hội thoại";
            if (req.file.mimetype.startsWith('image/')) {
                modeInstruction = "Quan sát và đọc kỹ các thông tin trong hình ảnh";
            } else if (req.file.mimetype.startsWith('text/') || req.file.mimetype.includes('pdf') || req.file.mimetype.includes('document')) {
                modeInstruction = "Đọc và phân tích toàn bộ nội dung tài liệu";
            }

            const prompt = `Bạn là hệ thống AI thẩm định Y tế chuyên nghiệp. Quy trình xử lý của bạn:
1. ${modeInstruction} (Tiếng Việt nếu có).
2. Tóm tắt nội dung chính của cuộc trao đổi (Summary).
3. Rút ra 3 Insight quan trọng nhất có thể học hỏi hoặc cải thiện (Insights).
4. Chấm điểm nhân viên y tế theo 5 tiêu chí (Rõ ràng, Chuyên nghiệp, Thấu cảm, Xử lý vấn đề, Hiệu quả) trên thang 10 điểm.

Vui lòng TRÌNH BÀY ĐẸP, chia xuống dòng rõ ràng theo đúng format sau:



📝 **TÓM TẮT (SUMMARY):**
(Tóm tắt nội dung...)

💡 **3 INSIGHT QUAN TRỌNG:**
1. ...
2. ...
3. ...

⭐ **ĐÁNH GIÁ & CHẤM ĐIỂM (SCORING):**
- Sự rõ ràng (Clarity): X/10 - Lời bình: ...
- Tính chuyên nghiệp (Professionalism): Y/10 - Lời bình: ...
- Sự thấu cảm (Empathy): Z/10 - Lời bình: ...
- Giải quyết vấn đề (Problem Solving): N/10 - Lời bình: ...
- Đạt hiệu quả (Efficiency): M/10 - Lời bình: ...
`;

            const modelName = "gemini-flash-latest";
            console.log(`Đang chờ ${modelName} phân tích...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const resultStream = await model.generateContentStream([
                { fileData: { mimeType: uploadResponse.file.mimeType, fileUri: uploadResponse.file.uri } },
                { text: prompt }
            ]);

            let transcriptionText = '';
            for await (const chunk of resultStream.stream) {
                if (!heartBeatStopped) {
                    clearInterval(keepAliveInterval);
                    heartBeatStopped = true;
                    res.write('\n\n');
                }
                const chunkText = chunk.text();
                transcriptionText += chunkText;
                res.write(chunkText);
            }
            res.end();

            console.log("=== Kế hoạch AI Xong ===", transcriptionText.substring(0, 50) + "...");

            try { await fileManager.deleteFile(uploadResponse.file.name); } catch (e) { }

            // Save to database
            const { error: dbError } = await supabase.from('transcriptions').insert([{
                audioURL: req.file ? req.file.originalname : '',
                transcription: transcriptionText,
                status: 'completed',
                user_id: userId
            }]).select().single();
            if (dbError) console.error("Lỗi lưu DB:", dbError);

            // Auto-update Employee Wiki (if filename starts with phone number)
            if (req.file && req.file.originalname) {
                const phoneMatch = req.file.originalname.match(/^(\d{10,11})/);
                if (phoneMatch) {
                    const employeePhone = phoneMatch[1];
                    updateEmployeeWiki(employeePhone, transcriptionText).catch(e =>
                        console.error("Lỗi ngầm Employee Wiki Updater:", e)
                    );
                }
            }

        } finally {
            if (!heartBeatStopped) clearInterval(keepAliveInterval);
        }
    } catch (error) {
        if (!res.headersSent) {
            res.status(500).json({ message: "Error processing audio", error: error.message || String(error) });
        } else {
            res.write(`\n[KHÔNG THỂ DỊCH (STREAM LỖI): ${error.message || String(error)}]\n`);
            res.end();
            console.error("Stream bị đứt giữa chừng:", error.message);
        }
    } finally {
        if (req.file && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (e) { console.error("Cleanup error:", e); }
        }
    }
});

// Get all transcriptions for a user
app.post('/getall/:id', async (req, res) => {
    const userId = req.params.id;
    if (!userId) return res.status(400).json({ message: "User ID is required." });
    try {
        const { data: user, error: userErr } = await supabase.from('users').select('*').eq('id', userId).single();
        if (!user || userErr) return res.status(404).json({ message: "User not found." });

        const { data: transcriptions } = await supabase.from('transcriptions').select('*').eq('user_id', userId);
        const mappedTranscriptions = transcriptions ? transcriptions.map(t => ({ ...t, _id: t.id })) : [];

        res.json({ user: { ...user, _id: user.id }, transcriptions: mappedTranscriptions });
    } catch (error) {
        console.error("Error fetching user data:", error.message);
        res.status(500).json({ message: "Internal server error." });
    }
});

// DELETE transcription
app.delete('/delete/:id', async (req, res) => {
    const { id } = req.params;
    if (!id) return res.status(400).send({ message: "Transcription ID is required" });
    try {
        const { data: transcription, error } = await supabase.from('transcriptions').delete().eq('id', id).select().single();
        if (!transcription || error) return res.status(404).send({ message: "Transcription not found or error deleting" });
        res.send({ message: "Transcription deleted successfully" });
    } catch (error) {
        res.status(500).send({ message: "Error deleting transcription", error });
    }
});

// ── AGENT TOOLS ───────────────────────────────────────────────

async function getEmployeeWikiApi(nameOrPhone) {
    console.log("[AGENT TOOL] Tra employee_wiki:", nameOrPhone);
    const { data } = await supabase.from('employee_wiki').select('*')
        .or(`employee_phone.ilike.%${nameOrPhone}%,wiki_content.ilike.%${nameOrPhone}%`)
        .limit(3);
    if (!data || data.length === 0)
        return "Không tìm thấy nhân viên mang tên hoặc SĐT: " + nameOrPhone + ". Hãy báo người dùng kiểm tra lại.";
    return data.map(d =>
        `[EMPLOYEE_WIKI] ${d.employee_phone}\nCập nhật: ${d.last_updated}\nTổng cuộc gọi: ${d.total_calls}\n\n${d.wiki_content}\n\n---`
    ).join('\n');
}

async function getCustomerWikiApi(nameOrPhone) {
    console.log("[AGENT TOOL] Tra customer_wiki:", nameOrPhone);
    const { data } = await supabase.from('customer_wiki').select('*')
        .or(`customer_phone.ilike.%${nameOrPhone}%,wiki_content.ilike.%${nameOrPhone}%`)
        .limit(3);
    if (!data || data.length === 0)
        return "Không tìm thấy khách hàng mang tên hoặc SĐT: " + nameOrPhone + ". Có thể khách chưa được tạo hồ sơ trong hệ thống.";
    return data.map(d =>
        `[CUSTOMER_WIKI] ${d.customer_phone}\nCập nhật: ${d.last_updated}\nTổng cuộc gọi: ${d.total_calls}\n\n${d.wiki_content}\n\n---`
    ).join('\n');
}

const agentTools = {
    getEmployeeWiki: ({ query }) => getEmployeeWikiApi(query),
    getCustomerWiki: ({ query }) => getCustomerWikiApi(query)
};

// ── CHAT endpoint ─────────────────────────────────────────────
app.post('/chat', async (req, res) => {
    try {
        const { message, history = [] } = req.body;
        if (!message) return res.status(400).json({ message: 'Message is required' });

        const model = genAI.getGenerativeModel({
            model: 'gemini-flash-latest',
            systemInstruction: `Bạn là PharmaVoice AI — trợ lý y tế thông minh và MỘT ĐẶC VỤ TÀI BA (AGENT).
Quy tắc trả lời BẮT BUỘC:
1. Bạn CÓ QUYỀN TRUY CẬP 2 HỆ THỐNG WIKI:
   - Nếu người dùng hỏi về NHÂN VIÊN (năng lực, thành tích, đánh giá): BẮT BUỘC dùng Tool "getEmployeeWiki".
   - Nếu người dùng hỏi về KHÁCH HÀNG (lịch sử mua hàng, bệnh lý, cuộc gọi với khách): BẮT BUỘC dùng Tool "getCustomerWiki".
2. LUÔN NGẮN GỌN & HIỆU QUẢ: Đi thẳng vào vấn đề, không diễn giải dài dòng.
3. DỄ NHÌN & ĐẸP MẮT: Trình bày dạng Bullet points, in đậm keyword.
4. TỰ TIN: Đừng bao giờ nói "Tôi không có quyền". Bạn đã được cấp đầy đủ quyền truy cập.`,
            tools: [{
                functionDeclarations: [
                    {
                        name: "getEmployeeWiki",
                        description: "Tra cứu hồ sơ theo dõi năng lực của NHÂN VIÊN qua Tên hoặc SĐT. Dùng khi hỏi về hiệu suất/năng lực nhân viên.",
                        parameters: {
                            type: "OBJECT",
                            properties: { query: { type: "STRING", description: "Tên HOẶC SĐT của nhân viên" } },
                            required: ["query"]
                        }
                    },
                    {
                        name: "getCustomerWiki",
                        description: "Tra cứu hồ sơ bệnh án, lịch sử mua hàng và lịch sử cuộc gọi của KHÁCH HÀNG qua Tên hoặc SĐT. Dùng khi hỏi về khách hàng.",
                        parameters: {
                            type: "OBJECT",
                            properties: { query: { type: "STRING", description: "Tên HOẶC SĐT của khách hàng" } },
                            required: ["query"]
                        }
                    }
                ]
            }]
        });

        // Normalize history
        const normalizedHistory = [];
        let currentRole = null;
        let currentText = [];
        for (const h of history) {
            const role = h.role === 'assistant' ? 'model' : 'user';
            const text = h.content;
            if (!text) continue;
            if (role === currentRole) {
                currentText.push(text);
            } else {
                if (currentRole !== null && !(normalizedHistory.length === 0 && currentRole === 'model')) {
                    normalizedHistory.push({ role: currentRole, parts: [{ text: currentText.join('\n\n') }] });
                }
                currentRole = role;
                currentText = [text];
            }
        }
        if (currentRole !== null && !(normalizedHistory.length === 0 && currentRole === 'model')) {
            normalizedHistory.push({ role: currentRole, parts: [{ text: currentText.join('\n\n') }] });
        }

        let finalMessage = message;
        if (normalizedHistory.length > 0 && normalizedHistory[normalizedHistory.length - 1].role === 'user') {
            const popped = normalizedHistory.pop();
            finalMessage = popped.parts[0].text + '\n\n' + message;
        }

        const chat = model.startChat({ history: normalizedHistory });
        let result = await chat.sendMessage(finalMessage);

        // Agent loop
        const callArgs = result.response.functionCalls();
        if (callArgs && callArgs.length > 0) {
            const call = callArgs[0];
            if (agentTools[call.name]) {
                console.log(`[AGENT] Gọi tool: ${call.name}, args:`, call.args);
                const apiResponse = await agentTools[call.name](call.args);
                result = await chat.sendMessage([{
                    functionResponse: { name: call.name, response: { content: apiResponse } }
                }]);
            }
        }

        res.json({ reply: result.response.text() });
    } catch (error) {
        console.error('Chat error:', error.message);
        res.status(500).json({ message: 'Lỗi khi chat với AI', error: error.message });
    }
});

// ── Update customer wiki (from frontend form) ─────────────────
app.post('/update-customer-wiki', async (req, res) => {
    const { identifier, transcription } = req.body;
    if (!identifier || !transcription) return res.status(400).json({ message: "Missing data" });
    try {
        await updateCustomerWiki(identifier, transcription);
        res.json({ message: "Cập nhật thành công!" });
    } catch (error) {
        res.status(500).json({ message: "Lỗi", error: error.message });
    }
});

// ── Get customers list for search dropdown ────────────────────
app.get('/customers', async (req, res) => {
    try {
        const { data, error } = await supabase.from('customer_wiki')
            .select('customer_phone, last_updated')
            .order('last_updated', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: "Lỗi", error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
