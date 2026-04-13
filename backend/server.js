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
    origin: '*', // Cho phép mọi Vercel Domain truy cập (tránh lỗi ngẫu nhiên khi Vercel sinh link mới)
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

// Test API root endpoint
app.get('/', (req, res) => {
    res.status(200).json({ message: 'API is running and ready for testing!' });
});

// User registration endpoint
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

// User login endpoint
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

// Configure multer for file storage using cross-platform OS temp dir
const upload = multer({
    dest: os.tmpdir(), // Thay vì cứng nhắc '/tmp' gây lỗi trên Windows
    limits: { fileSize: 200 * 1024 * 1024 } // Set limits to 200 MB
});

// Audio upload and transcription endpoint
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const { userId } = req.body;
        if (!userId) {
            return res.status(400).json({ message: "User ID is required." });
        }

        if (!req.file) {
            return res.status(400).json({ message: "No file uploaded." });
        }

        const filePath = req.file.path; // Now pointing to /tmp

        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
            return res.status(400).json({ message: "File is empty." });
        }

        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.flushHeaders(); 
        res.write(' '.repeat(4096)); 
        res.write('🔄 Đang phân tích dữ liệu, xin vui lòng đợi trong giây lát...\n\n');

        const keepAliveInterval = setInterval(() => {
            res.write(' . ');
        }, 5000);
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

            const modelName = "gemini-flash-latest"; // Dùng Flash để tăng tốc xử lý transcription
            console.log(`Đang chờ ${modelName} phân tích và phân rã các lớp dữ liệu PRD...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const resultStream = await model.generateContentStream([
                {
                    fileData: {
                        mimeType: uploadResponse.file.mimeType,
                        fileUri: uploadResponse.file.uri
                    }
                },
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
                res.write(chunkText); // Stream ra màn hình ngay lập tức để giữ mạng sống
            }
            res.end();

            console.log("=== Kế hoạch AI Xong ===", transcriptionText.substring(0, 50) + "...");

            // Xoá file trên cache của hệ thống Gemini giải phóng bộ nhớ
            try { await fileManager.deleteFile(uploadResponse.file.name); } catch (e) { }

            const audioUrl = "file_not_hosted_by_openai_yet"; // Placeholder vì OpenAI ko tự lưu file

            // Save transcription details to the database (Supabase)
            const { data: transcriptionData, error: dbError } = await supabase.from('transcriptions').insert([{
                audioURL: audioUrl,
                transcription: transcriptionText,
                status: 'completed',
                user_id: userId
            }]).select().single();

            if (dbError) console.error("Lỗi lưu DB mồ côi:", dbError);
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
            try {
                fs.unlinkSync(req.file.path); // Clean up the uploaded file
            } catch (e) {
                console.error("Cleanup error:", e);
            }
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

        const { data: transcriptions, error: transErr } = await supabase.from('transcriptions').select('*').eq('user_id', userId);

        // Cấu trúc lại kết quả để frontend cũ đọc được id -> _id
        const mappedTranscriptions = transcriptions ? transcriptions.map(t => ({ ...t, _id: t.id })) : [];

        res.json({ user: { ...user, _id: user.id }, transcriptions: mappedTranscriptions });
    } catch (error) {
        console.error("Error fetching user data:", error.message);
        res.status(500).json({ message: "Internal server error." });
    }
});

// DELETE endpoint to delete a transcription by ID
app.delete('/delete/:id', async (req, res) => {
    const { id } = req.params;
    if (!id) {
        return res.status(400).send({ message: "Transcription ID is required" });
    }

    try {
        const { data: transcription, error } = await supabase.from('transcriptions').delete().eq('id', id).select().single();
        if (!transcription || error) {
            return res.status(404).send({ message: "Transcription not found or error deleting" });
        }
        res.send({ message: "Transcription deleted successfully" });
    } catch (error) {
        res.status(500).send({ message: "Error deleting transcription", error });
    }
});

// ============================================================
// CHAT endpoint — hội thoại đa lượt với Gemini (có nhớ context)
// Body: { message: string, history: [{role:'user'|'model', content:string}] }
// ============================================================
app.post('/chat', async (req, res) => {
    try {
        const { message, history = [] } = req.body;
        if (!message) return res.status(400).json({ message: 'Message is required' });

        const model = genAI.getGenerativeModel({
            model: 'gemini-3.1-pro-preview',
            systemInstruction: `Bạn là PharmaVoice AI — trợ lý y tế thông minh, chuyên nghiệp và vắn tắt.
Quy tắc trả lời BẮT BUỘC:
1. LUÔN NGẮN GỌN & HIỆU QUẢ: Đi thẳng vào vấn đề, tuyệt đối KHÔNG viết diễn giải dài dòng.
2. DỄ NHÌN & ĐẸP MẮT: LUÔN trình bày dưới dạng Bullet points, in đậm các keyword.
3. SỬ DỤNG EMOJI: Áp dụng các emoji (🎯, 💡, 🔴, ✅, 💊) vào đầu ý chính để nội dung dễ đọc, không bị ngán chữ.
4. CẤU TRÚC PHÂN TÍCH CHUẨN: Ví dụ: [🎯 Vấn đề chính], [💡 Triệu chứng/Thông tin chắt lọc], [✅ Kết luận/Hướng xử lý].
Hãy nhớ: Càng súc tích và dễ lướt đọc càng tốt!`,
        });

        // Normalize history to strictly alternate user/model and start with user
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
                if (currentRole !== null) {
                    // Skip leading 'model' messages
                    if (!(normalizedHistory.length === 0 && currentRole === 'model')) {
                        normalizedHistory.push({ role: currentRole, parts: [{ text: currentText.join('\n\n') }] });
                    }
                }
                currentRole = role;
                currentText = [text];
            }
        }
        if (currentRole !== null) {
            if (!(normalizedHistory.length === 0 && currentRole === 'model')) {
                normalizedHistory.push({ role: currentRole, parts: [{ text: currentText.join('\n\n') }] });
            }
        }

        // Must end with 'model' if we are about to send a 'user' message, 
        // wait, the API allows sending 'user' message if history ends with 'model' or is empty.
        // But if normalizedHistory ends with 'user', we must pop it or combine it with the new message!
        let finalMessage = message;
        if (normalizedHistory.length > 0 && normalizedHistory[normalizedHistory.length - 1].role === 'user') {
            const popped = normalizedHistory.pop();
            finalMessage = popped.parts[0].text + '\n\n' + message;
        }

        const chat = model.startChat({ history: normalizedHistory });
        const result = await chat.sendMessage(finalMessage);
        const responseText = result.response.text();

        res.json({ reply: responseText });
    } catch (error) {
        console.error('Chat error:', error.message);
        res.status(500).json({ message: 'Lỗi khi chat với AI', error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
