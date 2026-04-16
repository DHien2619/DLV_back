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
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');

let serviceAccountAuth;
try {
    let clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
    let privateKey = process.env.GOOGLE_PRIVATE_KEY;
    
    if (clientEmail && privateKey) {
        // Hỗ trợ đọc từ biến môi trường (Vercel, Render)
        clientEmail = clientEmail.trim();
        privateKey = privateKey.trim();
        // Xử lý cả 2 trường hợp: literal \n (escaped) hoặc newline thật
        if (!privateKey.includes('\n')) {
            privateKey = privateKey.replace(/\\n/g, '\n');
        }
        serviceAccountAuth = new JWT({
          email: clientEmail,
          key: privateKey,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
    } else {
        // Đọc từ file local khi dev
        const creds = require('./google-credentials.json');
        serviceAccountAuth = new JWT({
          email: creds.client_email,
          key: creds.private_key,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
    }
} catch(e) {
    console.log("No google credentials found (env or local). Google Sheets disabled.");
}

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
async function updateCustomerWiki(customerIdentifier, newTranscriptionText, customerName = '') {
    if (!customerIdentifier) return;
    try {
        const displayName = customerName || customerIdentifier;
        console.log(`[Customer Wiki] Đang cập nhật hồ sơ: ${displayName} (${customerIdentifier})`);

        // ① Try to find record by real phone first
        let { data: existingWiki } = await supabase
            .from('customer_wiki')
            .select('*')
            .eq('customer_phone', customerIdentifier)
            .single();

        // ② If no record found by phone, check if an orphan record exists
        //    where customer_name matches but phone was set to the name (no-phone fallback)
        if (!existingWiki && customerName) {
            const { data: orphanRecords } = await supabase
                .from('customer_wiki')
                .select('*')
                .eq('customer_name', customerName)
                .neq('customer_phone', customerIdentifier);

            if (orphanRecords && orphanRecords.length > 0) {
                // Take the richest orphan (most recent / most content)
                const orphan = orphanRecords.sort((a, b) =>
                    (b.total_calls || 0) - (a.total_calls || 0))[0];

                console.log(`[Customer Wiki] 🔁 Phát hiện hồ sơ trùng lặp (ID: ${orphan.id}). Đang gộp...`);

                // Carry over accumulated call history from orphan
                existingWiki = orphan;

                // Delete all orphan records with same name but wrong phone
                const orphanIds = orphanRecords.map(r => r.id);
                await supabase.from('customer_wiki').delete().in('id', orphanIds);
                console.log(`[Customer Wiki] 🗑️ Đã xóa ${orphanIds.length} bản ghi trùng lặp.`);
            }
        }

        const oldWikiContent = existingWiki ? existingWiki.wiki_content : "Khách hàng mới. Chưa có hồ sơ trước đây.";
        const totalCalls = existingWiki ? (existingWiki.total_calls || 0) : 0;

        const prompt = `Bạn là hệ thống Kho Trí Thức LLM Wiki của PharmaVoice. Nhiệm vụ của bạn là CẬP NHẬT HỒ SƠ Y TẾ / BỆNH LÝ của KHÁCH HÀNG dựa trên các cuộc gọi.

QUAN TRỌNG: Tổng số lần tương tác CHÍNH THỨC theo hệ thống là ${totalCalls + 1} lần. LUÔN dùng con số này, KHÔNG dùng con số từ nội dung ghi âm.

Đây là HỒ SƠ HIỆN TẠI của khách hàng [${displayName}] - SĐT: ${customerIdentifier}:
---
${oldWikiContent}
---

Đây là CHUẨN ĐOÁN / GIAO DỊCH MỚI NHẤT từ cuộc gọi vừa xong:
---
${newTranscriptionText}
---

Yêu Cầu:
Hãy rà soát HỒ SƠ HIỆN TẠI và THÔNG TIN MỚI, sau đó VIẾT LẠI một Hồ Sơ Bệnh Án / Lịch sử mua hàng hoàn chỉnh và súc tích bằng Markdown. Bắt buộc:
- Dòng đầu tiên: # Hồ Sơ Khách Hàng: ${displayName} (${customerIdentifier})
- Ghi nhận Thông tin y tế (Chỉ số huyết áp, bệnh lý, triệu chứng...).
- Lịch sử mua sản phẩm (Đã mua gì, lúc nào).
- Ghi chú nhắc nhở chăm sóc.
- Tổng số lần tương tác: **${totalCalls + 1} lần** (theo hệ thống — KHÔNG thay đổi con số này).`;

        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        const result = await model.generateContent(prompt);
        const newWikiContent = result.response.text();

        // ③ Upsert by real phone — now guaranteed no duplicates
        const { error: upsertErr } = await supabase.from('customer_wiki').upsert({
            customer_phone: customerIdentifier,
            customer_name: customerName || displayName,
            wiki_content: newWikiContent,
            total_calls: totalCalls + 1,
            last_updated: new Date()
        }, { onConflict: 'customer_phone' });

        if (upsertErr) {
            console.error(`[Customer Wiki] Lỗi DB khi cập nhật khách ${customerIdentifier}:`, upsertErr.message);
        } else {
            console.log(`[Customer Wiki] ✅ Đã cập nhật thành công hồ sơ: ${displayName}`);
        }
    } catch (e) {
        console.error("[Customer Wiki] Lỗi trong quá trình cập nhật:", e);
    }
}

// ── LLM INSIGHT EXTRACTOR (FOR ANALYTICS DASHBOARD) ───────────
async function extractAndSaveInsights(transcriptionId, transcriptionText) {
    if (!transcriptionId || !transcriptionText) return;
    try {
        console.log(`[Insight Extractor] Đang trích xuất dữ liệu chuẩn hóa cho biên bản: ${transcriptionId}`);
        const prompt = `Phân tích nội dung cuộc gọi tư vấn dược phẩm dưới đây và trả về JSON chuẩn (KHÔNG kèm markdown).

NỘI DUNG:
"""
${transcriptionText.substring(0, 10000)}
"""

JSON OUTPUT:
{
  "call_score": <0-100, bằng (clarity+professionalism+empathy+problem_solving+efficiency)*2>,
  "scoring_breakdown": {
    "clarity": <0-10>,
    "professionalism": <0-10>,
    "empathy": <0-10>,
    "problem_solving": <0-10>,
    "efficiency": <0-10>
  },
  "scoring_comments": {
    "clarity": "<nhan xet>",
    "professionalism": "<nhan xet>",
    "empathy": "<nhan xet>",
    "problem_solving": "<nhan xet>",
    "efficiency": "<nhan xet>"
  },
  "call_summary": "<tom tat 2-3 cau>",
  "readiness_to_buy": "<Cao|Trung Binh|Thap>",
  "readiness_signals": "<cau/hanh vi cu the trong noi dung lam co so phan loai>",
  "pain_points": [
    {"issue": "<van de>", "severity": "<Nang|Trung binh|Nhe>", "evidence": "<cau KH noi>"}
  ],
  "needs": ["<nhu cau>"],
  "competitors_mentioned": ["<ten doi thu neu co>"],
  "customer_sentiment": "<Tich cuc|Hop tac|Kha kho tinh|Tieu cuc>",
  "sentiment_evidence": "<cau/hanh vi cu the lam co so phan loai>"
}

QUY TAC PHAN LOAI BAT BUOC:

READINESS_TO_BUY:
- CAO: KH chu dong hoi gia/cach dat/dia chi giao hang, noi duoc/dong y/lay/dat/mua/thu, xac nhan so luong hoac thanh toan.
- TRUNG BINH: KH hoi them thanh phan/tac dung/tac dung phu, chua tu choi nhung chua dong y, hen goi lai, dang can nhac.
- THAP: KH tu choi ro (khong can/khong co tien/dang dung cho khac), khong hoi gi ve san pham, chu dong ket thuc som.

CUSTOMER_SENTIMENT:
- Tich cuc: nhiet tinh, chu dong chia se, dong y, cam on, khen ngoi.
- Hop tac: tra loi day du, lang nghe, it phan doi, thai do trung tinh-tich cuc.
- Kha kho tinh: hay ngat loi, dat cau hoi thach thuc/nghi ngo, doi bang chung, nhung VAN DANG NGHE.
- Tieu cuc: buc boi, phan nan, chi trich, muon ket thuc ngay, cup may dot ngot.

PAIN_POINTS severity:
- Nang: de cap nhieu lan, tu ngu cap bach (rat/qua/khong chiu duoc/lau roi/lo lang/so), anh huong sinh hoat hang ngay.
- Trung binh: de cap nhung khong qua lo, da co giai phap tam thoi nhung chua hai long.
- Nhe: chi de cap thoang qua, hoi cho biet them, chua bi anh huong nghiem trong.`;

        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        const result = await model.generateContent(prompt);
        let rawText = result.response.text();
        rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        let insightsData;
        try {
            insightsData = JSON.parse(rawText);
        } catch(parseErr) {
            console.error("[Insight Extractor] Lỗi parse JSON từ LLM:", rawText);
            return;
        }

        // Cập nhật JSON vào cột insights của bảng transcriptions
        const { error: dbError } = await supabase.from('transcriptions').update({
            insights: insightsData
        }).eq('id', transcriptionId);

        if (dbError) {
            console.error(`[Insight Extractor] Lỗi DB khi lưu insights:`, dbError.message);
        } else {
            console.log(`[Insight Extractor] ✅ Đã lưu JSON insights (5 tiêu chí) thành công: ${transcriptionId}`);
        }
    } catch (e) {
        console.error("[Insight Extractor] Lỗi:", e.message);
    }
}

// ── Auth Middleware ───────────────────────────────────────────
const requireAdmin = (req, res, next) => {
    req.user = { userId: 1, role: 'admin' };
    next();
};

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

        const token = jwt.sign({ userId: newUser.id, role: newUser.role }, process.env.JWT_SECRET, { expiresIn: '8h' });
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

        const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '8h' });
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
3. Trích xuất chính xác 3 NHU CẦU CỐT LÕI hoặc NỖI ĐAU (Pain points) lớn nhất của khách hàng được tiết lộ trong cuộc gọi (viết thành câu rõ ràng, không dùng từ khóa tóm tắt).
4. Chấm điểm nhân viên y tế theo 5 tiêu chí (Rõ ràng, Chuyên nghiệp, Thấu cảm, Xử lý vấn đề, Hiệu quả) trên thang 10 điểm.

Vui lòng TRÌNH BÀY ĐẸP, chia xuống dòng rõ ràng theo đúng format sau:



📝 **TÓM TẮT DỊCH VỤ (SUMMARY):**
(Tóm tắt nội dung...)

💡 **3 NHU CẦU / NỖI ĐAU CỦA KHÁCH HÀNG:**
1. (Giải nghĩa nhu cầu 1...)
2. (Giải nghĩa nhu cầu 2...)
3. (Giải nghĩa nhu cầu 3...)

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
            const { data: savedRecord, error: dbError } = await supabase.from('transcriptions').insert([{
                audioURL: req.file ? req.file.originalname : '',
                transcription: transcriptionText,
                status: 'completed',
                user_id: userId
            }]).select().single();
            
            if (dbError) {
                console.error("Lỗi lưu DB:", dbError);
            } else if (savedRecord && savedRecord.id) {
                // Async: Trích xuất và lưu Insight JSON phục vụ Dashboard (không block UI)
                extractAndSaveInsights(savedRecord.id, transcriptionText).catch(e => 
                    console.error("Lỗi chạy nền Insights:", e)
                );
            }

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

// ── Dashboard Analytics endpoint (Admin only) ──────────────
app.get('/dashboard', requireAdmin, async (req, res) => {
    try {
        const userId = req.user.userId;

        const { data, error } = await supabase
            .from('transcriptions')
            .select('id, audioURL, transcription, status, created_at, insights, user_id')
            .order('created_at', { ascending: false })
            .limit(200);  // Admin thấy TẤT CẢ nhân viên

        if (error) throw error;
        
        // Join with users table
        const { data: usersData } = await supabase.from('users').select('id, name');
        const usersMap = {};
        if (usersData) {
            usersData.forEach(u => usersMap[u.id] = u.name);
        }
        
        const enhancedData = data ? data.map(d => ({
            ...d,
            employee_name: usersMap[d.user_id] || 'N/A'
        })) : [];

        res.json(enhancedData);
    } catch (error) {
        console.error("Dashboard API error:", error.message);
        res.status(500).json({ message: "Lỗi lấy dữ liệu Dashboard", error: error.message });
    }
});

// EXPORT TO GOOGLE SHEETS
app.post('/export-sheets', requireAdmin, async (req, res) => {
    try {
        const { rows, exportName } = req.body;
        if (!serviceAccountAuth) return res.status(500).json({ message: "Chưa cấu hình Google Credentials trên Server" });
        if (!rows || !rows.length) return res.status(400).json({ message: "Không có dữ liệu để xuất" });

        const SPREADSHEET_ID = '1hhIMdrlbA1fuOvW9Ky7jUfV2t3VrSBjbDWJ-YY4EZSc';
        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        await doc.loadInfo(); 
        
        const sheetTitle = `Báo cáo ${exportName || 'Mới'}`;
        
        let targetSheet = doc.sheetsByTitle[sheetTitle];
        if (!targetSheet) {
            targetSheet = await doc.addSheet({ title: sheetTitle, headerValues: ['Ngày', 'Nhân Viên', 'File Cuộc Gọi', 'ID Cuộc Gọi', 'Điểm KPI', 'Tỷ Lệ Mua', 'Cảm Xúc', 'Nỗi Đau / Nhu Cầu'] });
        }
        
        const rowsToAdd = rows.map(r => [
            r.date, r.employeeName, r.fileName, r.id, r.score, r.readiness, r.sentiment, r.pains
        ]);

        await targetSheet.addRows(rowsToAdd);
        res.json({ 
            message: "Đã đồng bộ lên Google Sheets thành công!", 
            sheetUrl: `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=${targetSheet.sheetId}` 
        });

    } catch (e) {
        console.error("Lỗi Export Sheet:", e);
        res.status(500).json({ message: "Lỗi kết nối API Google Sheets. Hãy mờ Share cho client_email", error: e.message });
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
    const { identifier, transcription, customerName } = req.body;
    if (!identifier || !transcription) return res.status(400).json({ message: "Missing data" });
    try {
        await updateCustomerWiki(identifier, transcription, customerName);
        res.json({ message: "Cập nhật thành công!" });
    } catch (error) {
        res.status(500).json({ message: "Lỗi", error: error.message });
    }
});

// ── Get customers list for search dropdown ────────────────────
app.get('/customers', async (req, res) => {
    try {
        const { data, error } = await supabase.from('customer_wiki')
            .select('customer_phone, customer_name, last_updated')
            .order('last_updated', { ascending: false });
        if (error) throw error;
        res.json(data);
    } catch (error) {
        res.status(500).json({ message: "Lỗi", error: error.message });
    }
});

// ============================================================
// V2 API — Deep Call Analysis Agent (POC)
// ============================================================
const { analyzeCall } = require('./agent/pipeline');
const { analyzeCallV2 } = require('./agent/pipeline-v2');
const { findCandidates } = require('./agent/skills/customer-matcher');
const { buildCustomerContext } = require('./agent/skills/memory-agent');
const { chatWithCustomerHistory, chatWithCallContext, chatAdvisor } = require('./agent/skills/chat-agent');

// ---------- Chat Agent RAG (scoped per customer) ----------
app.post('/api/v2/customers/:id/chat', async (req, res) => {
    const t0 = Date.now();
    try {
        const { message, history = [] } = req.body;
        if (!message) return res.status(400).json({ message: 'message required' });

        console.log(`[chat] customer=${req.params.id} msg="${message.slice(0, 80)}"`);

        const result = await chatWithCustomerHistory({
            supabase,
            customerId: req.params.id,
            message,
            history: Array.isArray(history) ? history.slice(-10) : []
        });

        console.log(`[chat] Done in ${Date.now() - t0}ms, citations=${result.citations?.length || 0}, conf=${result.confidence}`);
        res.json({ success: true, ...result, response_ms: Date.now() - t0 });
    } catch (e) {
        console.error('[chat] FAILED:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// ---------- Customers CRUD ----------
app.get('/api/v2/customers', async (req, res) => {
    try {
        const { q, limit = 50 } = req.query;
        let query = supabase.from('customers').select('*').order('updated_at', { ascending: false }).limit(limit);
        if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,code.ilike.%${q}%`);
        const { data, error } = await query;
        if (error) throw error;
        res.json(data || []);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/v2/customers', async (req, res) => {
    try {
        const { name, phone, code, age, gender, address, source, tags } = req.body;
        if (!name) return res.status(400).json({ message: 'name is required' });
        const { data, error } = await supabase.from('customers').insert([{
            name, phone, code, age, gender, address, source, tags
        }]).select().single();
        if (error) throw error;
        res.json(data);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.get('/api/v2/customers/:id', async (req, res) => {
    try {
        const [{ data: customer }, { data: calls }, { data: memory }, { data: opps }] = await Promise.all([
            supabase.from('customers').select('*').eq('id', req.params.id).single(),
            supabase.from('calls').select('id, created_at, total_quality_score, opportunity_score, compliance_status, insights, audio_filename')
                    .eq('customer_id', req.params.id).order('created_at', { ascending: false }).limit(20),
            supabase.from('customer_memory').select('*').eq('customer_id', req.params.id).is('valid_to', null)
                    .order('created_at', { ascending: false }),
            supabase.from('opportunities').select('*').eq('customer_id', req.params.id)
                    .order('created_at', { ascending: false }).limit(10)
        ]);
        if (!customer) return res.status(404).json({ message: 'Customer not found' });
        res.json({ customer, calls: calls || [], memory: memory || [], opportunities: opps || [] });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// ---------- Unified Agent Chat (all modes) ----------
app.post('/api/v2/agent/chat', async (req, res) => {
    const t0 = Date.now();
    try {
        const { message, history = [], customerId, callId, mode } = req.body;
        if (!message) return res.status(400).json({ message: 'message required' });

        let result;
        const effectiveMode = mode || (callId ? 'call' : customerId ? 'customer' : 'advisor');

        console.log(`[agent/chat] mode=${effectiveMode} cust=${customerId||'—'} call=${callId||'—'} msg="${message.slice(0,60)}"`);

        if (effectiveMode === 'call' && callId) {
            result = await chatWithCallContext({ supabase, callId, customerId, message, history: (history || []).slice(-10) });
        } else if (effectiveMode === 'customer' && customerId) {
            result = await chatWithCustomerHistory({ supabase, customerId, message, history: (history || []).slice(-10) });
        } else {
            result = await chatAdvisor({ message, history: (history || []).slice(-10) });
        }

        console.log(`[agent/chat] Done in ${Date.now() - t0}ms mode=${effectiveMode}`);
        res.json({ success: true, mode: effectiveMode, ...result, response_ms: Date.now() - t0 });
    } catch (e) {
        console.error('[agent/chat] FAILED:', e);
        res.status(500).json({ success: false, message: e.message });
    }
});

// ---------- V2 Analyze STREAMING (NDJSON progress events) ----------
app.post('/api/v2/calls/analyze-stream', upload.single('file'), async (req, res) => {
    const t0 = Date.now();
    // NDJSON streaming
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.setHeader('Transfer-Encoding', 'chunked');

    const emit = (event) => {
        try {
            res.write(JSON.stringify({ ts: Date.now(), ...event }) + '\n');
            if (res.flush) res.flush();
        } catch (_) {}
    };

    try {
        if (!req.file) {
            emit({ step: 'error', status: 'error', message: 'No file uploaded' });
            return res.end();
        }
        const { userId, customerId, notes } = req.body;
        const mimeType = detectAudioMime(req);

        emit({ step: 'init', status: 'ok', file: req.file.originalname, size: req.file.size, mime: mimeType });

        const result = await analyzeCallV2({
            filePath: req.file.path,
            mimeType,
            supabase,
            customerId: customerId || null,
            repUserId: userId || null,
            metadata: {
                filename: req.file.originalname,
                notes: notes || null,
                uploaded_at: new Date().toISOString()
            },
            persist: true,
            onProgress: (step, status, data) => {
                emit({ step, status, ...(data || {}) });
            }
        });

        emit({ step: 'complete', status: 'ok', total_ms: Date.now() - t0, result });
        res.end();
    } catch (error) {
        console.error('[analyze-stream] FATAL:', error);
        emit({ step: 'error', status: 'error', message: error.message });
        res.end();
    } finally {
        if (req.file && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (_) {}
        }
    }
});

// ---------- V2 Analyze (RAG-aware) ----------
const EXT_TO_MIME = {
    mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4', mp4: 'audio/mp4',
    aac: 'audio/aac', ogg: 'audio/ogg', flac: 'audio/flac', webm: 'audio/webm'
};
const detectAudioMime = (req) => {
    const m = req.file.mimetype;
    if (m && m.startsWith('audio/')) return m;
    const ext = (req.file.originalname || '').split('.').pop()?.toLowerCase();
    return EXT_TO_MIME[ext] || 'audio/mpeg';
};

app.post('/api/v2/calls/analyze-v2', upload.single('file'), async (req, res) => {
    const t0 = Date.now();
    try {
        if (!req.file) return res.status(400).json({ message: 'No file uploaded.' });
        const { userId, customerId, notes } = req.body;
        const mimeType = detectAudioMime(req);

        console.log(`[v2-analyze] Start: file=${req.file.originalname} customer=${customerId || 'UNKNOWN'}`);

        const result = await analyzeCallV2({
            filePath: req.file.path,
            mimeType,
            supabase,
            customerId: customerId || null,
            repUserId: userId || null,
            metadata: {
                filename: req.file.originalname,
                notes: notes || null,
                uploaded_at: new Date().toISOString()
            },
            persist: true,
            onProgress: (step, status) => console.log(`[v2-analyze] ${step}: ${status}`)
        });

        console.log(`[v2-analyze] Done in ${Date.now() - t0}ms, call_id=${result.saved_call_id}`);
        res.json({ success: true, total_ms: Date.now() - t0, ...result });
    } catch (error) {
        console.error('[v2-analyze] FATAL:', error);
        res.status(500).json({ success: false, message: error.message });
    } finally {
        if (req.file && fs.existsSync(req.file.path)) { try { fs.unlinkSync(req.file.path); } catch (_) {} }
    }
});

// ---------- Rep Today Dashboard ----------
app.get('/api/v2/rep/:userId/today', async (req, res) => {
    try {
        const userId = req.params.userId;
        const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
        const startOfWeek = new Date(); startOfWeek.setDate(startOfWeek.getDate() - 7);

        const [{ data: todayCalls }, { data: weekCalls }, { data: compAlerts }, { data: hotOpps }] = await Promise.all([
            supabase.from('calls')
                .select('id, customer_id, created_at, total_quality_score, opportunity_score, compliance_status, insights, audio_filename')
                .eq('rep_user_id', userId)
                .gte('created_at', startOfDay.toISOString())
                .order('created_at', { ascending: false }).limit(50),
            supabase.from('calls')
                .select('total_quality_score, opportunity_score, compliance_status')
                .eq('rep_user_id', userId)
                .gte('created_at', startOfWeek.toISOString()),
            supabase.from('compliance_events')
                .select('id, severity, event_type, call_id, customer_id, created_at, explanation')
                .eq('rep_user_id', userId)
                .eq('reviewed', false)
                .in('severity', ['red', 'orange'])
                .order('created_at', { ascending: false }).limit(10),
            supabase.from('opportunities')
                .select('id, customer_id, product_hint, stage, score, estimated_value_vnd, next_action, due_date, created_at')
                .eq('assigned_rep_id', userId)
                .is('outcome', null)
                .in('stage', ['hot', 'ready_to_buy', 'interested'])
                .order('score', { ascending: false }).limit(10)
        ]);

        const week = weekCalls || [];
        const weekStats = {
            calls: week.length,
            avg_quality: week.length ? Math.round(week.reduce((s, c) => s + (c.total_quality_score || 0), 0) / week.length) : 0,
            avg_opportunity: week.length ? Math.round(week.reduce((s, c) => s + (c.opportunity_score || 0), 0) / week.length) : 0,
            red_count: week.filter(c => c.compliance_status === 'red').length
        };

        // Attach customer names to list items
        const custIds = new Set();
        (todayCalls || []).forEach(c => c.customer_id && custIds.add(c.customer_id));
        (compAlerts || []).forEach(c => c.customer_id && custIds.add(c.customer_id));
        (hotOpps || []).forEach(c => c.customer_id && custIds.add(c.customer_id));
        let custMap = {};
        if (custIds.size) {
            const { data: customers } = await supabase.from('customers')
                .select('id, name, phone').in('id', [...custIds]);
            (customers || []).forEach(c => custMap[c.id] = c);
        }
        const attach = (rows) => (rows || []).map(r => ({ ...r, customer: r.customer_id ? custMap[r.customer_id] : null }));

        res.json({
            today_calls: attach(todayCalls).map(c => ({
                ...c,
                summary: c.insights?.structure?.summary_short || null,
                insights: undefined
            })),
            week_stats: weekStats,
            compliance_alerts: attach(compAlerts),
            hot_opportunities: attach(hotOpps)
        });
    } catch (e) {
        console.error('[today] FAILED:', e);
        res.status(500).json({ message: e.message });
    }
});

// ============================================================
// FILTER HELPERS — date range + customer + rep
// ============================================================
function getDateRange(q) {
    // Accepts from/to ISO, or preset: today|week|month|quarter|year|all
    if (q.from || q.to) {
        return { from: q.from || null, to: q.to || null };
    }
    const now = new Date();
    const preset = (q.preset || 'week').toLowerCase();
    const map = {
        today: () => { const d = new Date(); d.setHours(0,0,0,0); return d; },
        week:  () => { const d = new Date(); d.setDate(d.getDate() - 7); return d; },
        month: () => { const d = new Date(); d.setDate(d.getDate() - 30); return d; },
        quarter: () => { const d = new Date(); d.setDate(d.getDate() - 90); return d; },
        year:  () => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d; },
        all:   () => null
    };
    const fn = map[preset] || map.week;
    const from = fn();
    return { from: from ? from.toISOString() : null, to: null, preset };
}
function applyCallFilters(q, filters) {
    if (filters.from) q = q.gte('created_at', filters.from);
    if (filters.to)   q = q.lte('created_at', filters.to);
    if (filters.customerId) q = q.eq('customer_id', filters.customerId);
    if (filters.repId)      q = q.eq('rep_user_id', filters.repId);
    return q;
}

// ============================================================
// CALL HISTORY — list all calls with filters + pagination
// ============================================================
app.get('/api/v2/calls/history', async (req, res) => {
    try {
        const { from, to } = getDateRange(req.query);
        const filters = { from, to, customerId: req.query.customerId, repId: req.query.repId };
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const offset = parseInt(req.query.offset) || 0;
        const compliance = req.query.compliance; // clean|yellow|orange|red|any
        const minQuality = parseInt(req.query.minQuality);
        const maxQuality = parseInt(req.query.maxQuality);
        const search = req.query.search;

        let q = supabase.from('calls')
            .select('id, customer_id, rep_user_id, audio_filename, created_at, recorded_at, duration_sec, total_quality_score, opportunity_score, compliance_status, insights', { count: 'exact' })
            .order('created_at', { ascending: false });
        q = applyCallFilters(q, filters);
        if (compliance && compliance !== 'any') q = q.eq('compliance_status', compliance);
        if (!isNaN(minQuality)) q = q.gte('total_quality_score', minQuality);
        if (!isNaN(maxQuality)) q = q.lte('total_quality_score', maxQuality);
        if (search) q = q.ilike('transcript_raw', `%${search}%`);
        q = q.range(offset, offset + limit - 1);

        const { data, count, error } = await q;
        if (error) throw error;

        // Attach customer + rep names
        const custIds = [...new Set((data||[]).map(c => c.customer_id).filter(Boolean))];
        const repIds = [...new Set((data||[]).map(c => c.rep_user_id).filter(Boolean))];
        const [{ data: customers }, { data: users }] = await Promise.all([
            custIds.length ? supabase.from('customers').select('id,name,phone').in('id', custIds) : Promise.resolve({ data: [] }),
            repIds.length ? supabase.from('users').select('id,name').in('id', repIds) : Promise.resolve({ data: [] })
        ]);
        const cMap = Object.fromEntries((customers||[]).map(c => [c.id, c]));
        const uMap = Object.fromEntries((users||[]).map(u => [u.id, u]));

        res.json({
            total: count || 0,
            limit, offset,
            items: (data || []).map(c => ({
                id: c.id,
                customer: c.customer_id ? cMap[c.customer_id] : null,
                rep: c.rep_user_id ? uMap[c.rep_user_id] : null,
                audio_filename: c.audio_filename,
                created_at: c.created_at,
                recorded_at: c.recorded_at,
                duration_sec: c.duration_sec,
                quality_score: c.total_quality_score,
                quality_grade: c.insights?.quality?.overall_grade,
                opportunity_score: c.opportunity_score,
                opportunity_stage: c.insights?.opportunity?.stage,
                compliance_status: c.compliance_status,
                compliance_events_count: c.insights?.compliance?.events?.length || 0,
                summary: c.insights?.structure?.summary_short
            }))
        });
    } catch (e) {
        console.error('[history]', e);
        res.status(500).json({ message: e.message });
    }
});

// ============================================================
// MANAGER / COACH / COMPLIANCE endpoints
// ============================================================

// Helper: quality grade from score
const gradeOf = (s) => { if (s==null) return '—'; if (s>=90) return 'A'; if (s>=75) return 'B'; if (s>=60) return 'C'; if (s>=40) return 'D'; return 'F'; };

app.get('/api/v2/dashboard/manager', async (req, res) => {
    try {
        const { from, to } = getDateRange(req.query);
        const filters = { from, to, customerId: req.query.customerId };
        const start30d = new Date(); start30d.setDate(start30d.getDate() - 30);

        // "weekCalls" now means "calls within filter window"
        let wq = supabase.from('calls')
            .select('id, rep_user_id, customer_id, created_at, total_quality_score, opportunity_score, compliance_status');
        wq = applyCallFilters(wq, filters);

        let mq = supabase.from('calls')
            .select('created_at, total_quality_score, opportunity_score, compliance_status')
            .gte('created_at', start30d.toISOString());
        if (filters.customerId) mq = mq.eq('customer_id', filters.customerId);

        let compQ = supabase.from('compliance_events').select('id, severity').eq('reviewed', false);
        if (filters.customerId) compQ = compQ.eq('customer_id', filters.customerId);

        let oppQ = supabase.from('opportunities').select('id, stage, estimated_value_vnd, outcome').is('outcome', null);
        if (filters.customerId) oppQ = oppQ.eq('customer_id', filters.customerId);

        const [{ data: weekCalls }, { data: month30d }, { data: openComp }, { data: openOpps }] = await Promise.all([
            wq, mq, compQ, oppQ
        ]);

        const wc = weekCalls || [];

        // Team stats (current week)
        const team = {
            calls: wc.length,
            avg_quality: wc.length ? Math.round(wc.reduce((s,c)=>s+(c.total_quality_score||0),0)/wc.length) : 0,
            avg_opportunity: wc.length ? Math.round(wc.reduce((s,c)=>s+(c.opportunity_score||0),0)/wc.length) : 0,
            red: wc.filter(c=>c.compliance_status==='red').length,
            orange: wc.filter(c=>c.compliance_status==='orange').length,
            clean_pct: wc.length ? Math.round(wc.filter(c=>c.compliance_status==='clean'||!c.compliance_status).length / wc.length * 100) : 100
        };

        // Per-rep leaderboard
        const byRep = {};
        for (const c of wc) {
            const key = c.rep_user_id || 'unassigned';
            if (!byRep[key]) byRep[key] = { rep_user_id: c.rep_user_id, calls: 0, q_sum: 0, opp_sum: 0, red: 0 };
            byRep[key].calls++;
            if (c.total_quality_score) byRep[key].q_sum += c.total_quality_score;
            if (c.opportunity_score) byRep[key].opp_sum += c.opportunity_score;
            if (c.compliance_status === 'red') byRep[key].red++;
        }
        const leaderboard = Object.values(byRep).map(r => ({
            rep_user_id: r.rep_user_id,
            calls: r.calls,
            avg_quality: Math.round(r.q_sum / r.calls),
            avg_opportunity: Math.round(r.opp_sum / r.calls),
            red: r.red,
            grade: gradeOf(r.q_sum / r.calls)
        })).sort((a,b) => b.avg_quality - a.avg_quality);

        // Attach rep names
        const repIds = leaderboard.map(r => r.rep_user_id).filter(Boolean);
        if (repIds.length) {
            const { data: users } = await supabase.from('users').select('id, name, email').in('id', repIds);
            const map = Object.fromEntries((users||[]).map(u => [u.id, u]));
            leaderboard.forEach(r => { r.rep = map[r.rep_user_id] || { name: `Rep #${r.rep_user_id}` }; });
        }

        // 30-day daily trend
        const daily = {};
        for (const c of (month30d || [])) {
            const d = new Date(c.created_at).toISOString().slice(0, 10);
            if (!daily[d]) daily[d] = { date: d, calls: 0, q_sum: 0, opp_sum: 0, red: 0 };
            daily[d].calls++;
            if (c.total_quality_score) daily[d].q_sum += c.total_quality_score;
            if (c.opportunity_score) daily[d].opp_sum += c.opportunity_score;
            if (c.compliance_status === 'red') daily[d].red++;
        }
        const trend = Object.values(daily).map(d => ({
            date: d.date, calls: d.calls,
            avg_quality: d.calls ? Math.round(d.q_sum/d.calls) : 0,
            avg_opportunity: d.calls ? Math.round(d.opp_sum/d.calls) : 0,
            red: d.red
        })).sort((a,b) => a.date.localeCompare(b.date));

        // Compliance queue summary
        const comp = openComp || [];
        const compliance = {
            red: comp.filter(e=>e.severity==='red').length,
            orange: comp.filter(e=>e.severity==='orange').length,
            yellow: comp.filter(e=>e.severity==='yellow').length,
            total_unreviewed: comp.length
        };

        // Pipeline value
        const opps = openOpps || [];
        const pipeline = {
            total_opportunities: opps.length,
            total_value_vnd: opps.reduce((s,o)=>s+(o.estimated_value_vnd||0),0),
            by_stage: opps.reduce((acc,o) => { acc[o.stage] = (acc[o.stage]||0)+1; return acc; }, {})
        };

        res.json({ team, leaderboard, trend, compliance, pipeline });
    } catch (e) {
        console.error('[dashboard] FAILED:', e);
        res.status(500).json({ message: e.message });
    }
});

// Compliance queue — list unreviewed events
app.get('/api/v2/compliance/events', async (req, res) => {
    try {
        const { severity, reviewed } = req.query;
        let q = supabase.from('compliance_events')
            .select('id, call_id, customer_id, rep_user_id, event_type, severity, timestamp_sec, speaker, quote, explanation, recommended_action, reviewed, reviewed_at, review_note, created_at')
            .order('created_at', { ascending: false })
            .limit(200);
        if (severity) q = q.eq('severity', severity);
        if (reviewed === 'true') q = q.eq('reviewed', true);
        else if (reviewed === 'false') q = q.eq('reviewed', false);
        const { data, error } = await q;
        if (error) throw error;

        // Attach customer + call info
        const custIds = [...new Set((data||[]).map(e=>e.customer_id).filter(Boolean))];
        const callIds = [...new Set((data||[]).map(e=>e.call_id).filter(Boolean))];
        const [{ data: customers }, { data: calls }] = await Promise.all([
            custIds.length ? supabase.from('customers').select('id,name,phone').in('id', custIds) : Promise.resolve({ data: [] }),
            callIds.length ? supabase.from('calls').select('id,audio_filename,created_at').in('id', callIds) : Promise.resolve({ data: [] })
        ]);
        const cMap = Object.fromEntries((customers||[]).map(c=>[c.id, c]));
        const callMap = Object.fromEntries((calls||[]).map(c=>[c.id, c]));

        res.json((data||[]).map(e => ({
            ...e,
            customer: e.customer_id ? cMap[e.customer_id] : null,
            call: e.call_id ? callMap[e.call_id] : null
        })));
    } catch (e) {
        console.error('[compliance/events] FAILED:', e);
        res.status(500).json({ message: e.message });
    }
});

// Mark compliance event reviewed
app.post('/api/v2/compliance/events/:id/review', async (req, res) => {
    try {
        const { note, reviewerId } = req.body;
        const { data, error } = await supabase.from('compliance_events').update({
            reviewed: true,
            reviewed_at: new Date().toISOString(),
            reviewed_by: reviewerId || null,
            review_note: note || null
        }).eq('id', req.params.id).select().single();
        if (error) throw error;
        res.json({ success: true, event: data });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// Coach view per rep
app.get('/api/v2/coach/rep/:userId', async (req, res) => {
    try {
        const userId = req.params.userId;
        const start30d = new Date(); start30d.setDate(start30d.getDate() - 30);

        const [{ data: user }, { data: calls }] = await Promise.all([
            supabase.from('users').select('id,name,email').eq('id', userId).single(),
            supabase.from('calls')
                .select('id, created_at, total_quality_score, opportunity_score, compliance_status, insights')
                .eq('rep_user_id', userId)
                .gte('created_at', start30d.toISOString())
                .order('created_at', { ascending: false })
        ]);

        const rows = calls || [];
        const n = rows.length;

        // Per-criterion scores averaged
        const critKeys = ['identity_verification','medical_discovery','indication_appropriateness',
                          'side_effects_disclosure','dosage_clarity','drug_interaction_check',
                          'empathy_listening','professional_close','compliance_language'];
        const critAgg = {};
        critKeys.forEach(k => critAgg[k] = { sum: 0, max_sum: 0, count: 0 });

        // Collect strengths / improvements
        const strengthFreq = {};
        const improveFreq = {};

        for (const c of rows) {
            const q = c.insights?.quality;
            if (q) {
                for (const k of critKeys) {
                    if (q[k]) { critAgg[k].sum += q[k].score || 0; critAgg[k].max_sum += q[k].max || 0; critAgg[k].count++; }
                }
                (q.top_strengths || []).forEach(s => strengthFreq[s] = (strengthFreq[s]||0)+1);
                (q.top_improvements || []).forEach(s => improveFreq[s] = (improveFreq[s]||0)+1);
            }
        }

        const criteria = critKeys.map(k => ({
            key: k,
            avg_score: critAgg[k].count ? +(critAgg[k].sum / critAgg[k].count).toFixed(1) : 0,
            max_score: critAgg[k].count ? critAgg[k].max_sum / critAgg[k].count : 0,
            pct: critAgg[k].max_sum ? Math.round(critAgg[k].sum / critAgg[k].max_sum * 100) : 0,
            count: critAgg[k].count
        }));
        // Sort criteria by pct to find weakest
        criteria.sort((a,b) => a.pct - b.pct);

        // Top frequent strengths/improvements
        const topBy = (map) => Object.entries(map).map(([k,v])=>({text:k,count:v})).sort((a,b)=>b.count-a.count).slice(0,5);

        const summary = {
            rep: user || { id: userId, name: `Rep #${userId}` },
            period_days: 30,
            calls: n,
            avg_quality: n ? Math.round(rows.reduce((s,c)=>s+(c.total_quality_score||0),0)/n) : 0,
            avg_opportunity: n ? Math.round(rows.reduce((s,c)=>s+(c.opportunity_score||0),0)/n) : 0,
            red_count: rows.filter(c=>c.compliance_status==='red').length,
            criteria,
            top_strengths: topBy(strengthFreq),
            top_improvements: topBy(improveFreq),
            recent_calls: rows.slice(0, 10).map(c => ({
                id: c.id, created_at: c.created_at,
                quality: c.total_quality_score,
                opportunity: c.opportunity_score,
                compliance: c.compliance_status,
                summary: c.insights?.structure?.summary_short
            }))
        };

        res.json(summary);
    } catch (e) {
        console.error('[coach] FAILED:', e);
        res.status(500).json({ message: e.message });
    }
});

// List reps for coach picker
app.get('/api/v2/coach/reps', async (req, res) => {
    try {
        const start30d = new Date(); start30d.setDate(start30d.getDate() - 30);
        const { data: calls } = await supabase.from('calls')
            .select('rep_user_id, total_quality_score, compliance_status')
            .gte('created_at', start30d.toISOString());

        const agg = {};
        for (const c of (calls||[])) {
            if (!c.rep_user_id) continue;
            if (!agg[c.rep_user_id]) agg[c.rep_user_id] = { rep_user_id: c.rep_user_id, calls: 0, q_sum: 0, red: 0 };
            agg[c.rep_user_id].calls++;
            if (c.total_quality_score) agg[c.rep_user_id].q_sum += c.total_quality_score;
            if (c.compliance_status === 'red') agg[c.rep_user_id].red++;
        }
        const reps = Object.values(agg);
        const ids = reps.map(r => r.rep_user_id);
        if (ids.length) {
            const { data: users } = await supabase.from('users').select('id,name,email').in('id', ids);
            const m = Object.fromEntries((users||[]).map(u=>[u.id,u]));
            reps.forEach(r => { r.user = m[r.rep_user_id] || { name: `Rep #${r.rep_user_id}` }; r.avg_quality = Math.round(r.q_sum/r.calls); });
        }
        res.json(reps.sort((a,b)=>b.calls-a.calls));
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// ============================================================
// AI SKILLS — Aggregate analytics pages
// ============================================================

const CRIT_KEYS = ['identity_verification','medical_discovery','indication_appropriateness',
                   'side_effects_disclosure','dosage_clarity','drug_interaction_check',
                   'empathy_listening','professional_close','compliance_language'];

// Quality skill — rubric aggregates, distribution, worst criteria, top examples
app.get('/api/v2/skills/quality', async (req, res) => {
    try {
        const { from, to } = getDateRange(req.query);
        const filters = { from, to, customerId: req.query.customerId, repId: req.query.repId };
        let q = supabase.from('calls')
            .select('id, customer_id, created_at, total_quality_score, insights')
            .order('created_at', { ascending: false }).limit(500);
        q = applyCallFilters(q, filters);
        const { data: calls } = await q;
        const rows = calls || [];

        // Distribution buckets
        const dist = { A: 0, B: 0, C: 0, D: 0, F: 0 };
        let qSum = 0, qCount = 0;
        for (const c of rows) {
            if (c.total_quality_score == null) continue;
            qSum += c.total_quality_score; qCount++;
            const s = c.total_quality_score;
            if (s >= 90) dist.A++;
            else if (s >= 75) dist.B++;
            else if (s >= 60) dist.C++;
            else if (s >= 40) dist.D++;
            else dist.F++;
        }

        // Criteria aggregate
        const critAgg = {};
        CRIT_KEYS.forEach(k => critAgg[k] = { sum: 0, max_sum: 0, count: 0, min_score: 100, max_score: 0 });
        const strengthFreq = {}, improveFreq = {};
        for (const c of rows) {
            const q = c.insights?.quality; if (!q) continue;
            for (const k of CRIT_KEYS) {
                if (q[k]) {
                    critAgg[k].sum += q[k].score || 0;
                    critAgg[k].max_sum += q[k].max || 0;
                    critAgg[k].count++;
                    critAgg[k].min_score = Math.min(critAgg[k].min_score, q[k].score || 0);
                    critAgg[k].max_score = Math.max(critAgg[k].max_score, q[k].score || 0);
                }
            }
            (q.top_strengths || []).forEach(s => strengthFreq[s] = (strengthFreq[s]||0)+1);
            (q.top_improvements || []).forEach(s => improveFreq[s] = (improveFreq[s]||0)+1);
        }
        const criteria = CRIT_KEYS.map(k => ({
            key: k,
            avg: critAgg[k].count ? +(critAgg[k].sum / critAgg[k].count).toFixed(1) : 0,
            max: critAgg[k].count ? critAgg[k].max_sum / critAgg[k].count : 0,
            pct: critAgg[k].max_sum ? Math.round(critAgg[k].sum / critAgg[k].max_sum * 100) : 0,
            count: critAgg[k].count
        })).sort((a,b) => a.pct - b.pct);

        // Top/bottom calls by quality
        const sorted = rows.filter(c => c.total_quality_score != null)
                          .sort((a,b) => b.total_quality_score - a.total_quality_score);
        const top3 = sorted.slice(0, 3).map(c => ({
            id: c.id, customer_id: c.customer_id,
            score: c.total_quality_score, grade: c.insights?.quality?.overall_grade,
            summary: c.insights?.structure?.summary_short,
            strengths: c.insights?.quality?.top_strengths?.slice(0,2)
        }));
        const bottom3 = sorted.slice(-3).reverse().map(c => ({
            id: c.id, customer_id: c.customer_id,
            score: c.total_quality_score, grade: c.insights?.quality?.overall_grade,
            summary: c.insights?.structure?.summary_short,
            improvements: c.insights?.quality?.top_improvements?.slice(0,2)
        }));

        const topBy = m => Object.entries(m).map(([k,v])=>({text:k,count:v})).sort((a,b)=>b.count-a.count).slice(0,10);

        res.json({
            total_calls: qCount,
            avg_score: qCount ? Math.round(qSum / qCount) : 0,
            distribution: dist,
            criteria,
            top_strengths: topBy(strengthFreq),
            top_improvements: topBy(improveFreq),
            best_calls: top3,
            worst_calls: bottom3
        });
    } catch (e) { console.error('[skills/quality]', e); res.status(500).json({ message: e.message }); }
});

// Opportunity skill — funnel, signals, objections, value trend
app.get('/api/v2/skills/opportunity', async (req, res) => {
    try {
        const { from, to } = getDateRange(req.query);
        const filters = { from, to, customerId: req.query.customerId, repId: req.query.repId };

        let oq = supabase.from('opportunities').select('*').order('created_at', { ascending: false }).limit(500);
        if (from) oq = oq.gte('created_at', from);
        if (to) oq = oq.lte('created_at', to);
        if (filters.customerId) oq = oq.eq('customer_id', filters.customerId);

        let cq = supabase.from('calls').select('id, opportunity_score, insights, created_at, customer_id').order('created_at', { ascending: false }).limit(500);
        cq = applyCallFilters(cq, filters);

        const [{ data: opps }, { data: calls }] = await Promise.all([oq, cq]);
        const o = opps || []; const c = calls || [];

        // Funnel by stage
        const funnel = {};
        const stages = ['cold','qualified','interested','hot','ready_to_buy','objection','lost'];
        stages.forEach(s => funnel[s] = { count: 0, value: 0 });
        for (const row of o) {
            const st = row.stage || 'cold';
            if (!funnel[st]) funnel[st] = { count: 0, value: 0 };
            funnel[st].count++;
            funnel[st].value += row.estimated_value_vnd || 0;
        }

        // Buying signals & objections from call insights
        const sigFreq = {}, objFreq = {};
        for (const row of c) {
            const op = row.insights?.opportunity; if (!op) continue;
            (op.buying_signals || []).forEach(s => sigFreq[s.signal_type] = (sigFreq[s.signal_type]||0)+1);
            (op.objections || []).forEach(ob => objFreq[ob.objection_type] = (objFreq[ob.objection_type]||0)+1);
        }

        // Hot examples
        const hot = o.filter(row => row.stage === 'hot' || row.stage === 'ready_to_buy').slice(0, 10);
        const custIds = [...new Set(hot.map(h => h.customer_id).filter(Boolean))];
        let cMap = {};
        if (custIds.length) {
            const { data: cs } = await supabase.from('customers').select('id,name,phone').in('id', custIds);
            cMap = Object.fromEntries((cs||[]).map(x => [x.id, x]));
        }

        const totalValue = o.reduce((s,r) => s + (r.estimated_value_vnd || 0), 0);
        const openOpps = o.filter(r => !r.outcome);
        const wonOpps = o.filter(r => r.outcome === 'won');
        const lostOpps = o.filter(r => r.outcome === 'lost');

        res.json({
            total_opportunities: o.length,
            open: openOpps.length,
            won: wonOpps.length,
            lost: lostOpps.length,
            win_rate: (wonOpps.length + lostOpps.length) > 0 ? Math.round(wonOpps.length / (wonOpps.length + lostOpps.length) * 100) : null,
            total_value_vnd: totalValue,
            funnel,
            top_buying_signals: Object.entries(sigFreq).map(([k,v])=>({type:k,count:v})).sort((a,b)=>b.count-a.count),
            top_objections: Object.entries(objFreq).map(([k,v])=>({type:k,count:v})).sort((a,b)=>b.count-a.count),
            hot_opportunities: hot.map(h => ({ ...h, customer: h.customer_id ? cMap[h.customer_id] : null }))
        });
    } catch (e) { console.error('[skills/opportunity]', e); res.status(500).json({ message: e.message }); }
});

// Compliance skill — events by type, severity trend, top violators
app.get('/api/v2/skills/compliance', async (req, res) => {
    try {
        const { from, to } = getDateRange(req.query);
        let q = supabase.from('compliance_events')
            .select('*').order('created_at', { ascending: false }).limit(500);
        if (from) q = q.gte('created_at', from);
        if (to) q = q.lte('created_at', to);
        if (req.query.customerId) q = q.eq('customer_id', req.query.customerId);
        if (req.query.repId) q = q.eq('rep_user_id', req.query.repId);
        const { data: events } = await q;
        const e = events || [];

        // By type
        const byType = {};
        for (const ev of e) {
            if (!byType[ev.event_type]) byType[ev.event_type] = { type: ev.event_type, red: 0, orange: 0, yellow: 0, total: 0 };
            byType[ev.event_type][ev.severity]++;
            byType[ev.event_type].total++;
        }

        // By rep
        const byRep = {};
        for (const ev of e) {
            const k = ev.rep_user_id || 'unassigned';
            if (!byRep[k]) byRep[k] = { rep_user_id: ev.rep_user_id, red: 0, orange: 0, yellow: 0, total: 0 };
            byRep[k][ev.severity]++;
            byRep[k].total++;
        }
        const repIds = Object.values(byRep).map(r => r.rep_user_id).filter(Boolean);
        let userMap = {};
        if (repIds.length) {
            const { data: users } = await supabase.from('users').select('id,name').in('id', repIds);
            userMap = Object.fromEntries((users||[]).map(u => [u.id, u]));
        }

        const reviewed = e.filter(x => x.reviewed).length;
        const unreviewed = e.length - reviewed;

        // Recent adverse events (critical for pharma)
        const adverse = e.filter(x => x.event_type === 'adverse_event').slice(0, 5);

        res.json({
            total: e.length,
            reviewed,
            unreviewed,
            red: e.filter(x => x.severity === 'red').length,
            orange: e.filter(x => x.severity === 'orange').length,
            yellow: e.filter(x => x.severity === 'yellow').length,
            by_type: Object.values(byType).sort((a,b) => b.total - a.total),
            by_rep: Object.values(byRep)
                .map(r => ({ ...r, user: r.rep_user_id ? userMap[r.rep_user_id] : null }))
                .sort((a,b) => b.red - a.red || b.total - a.total),
            adverse_events: adverse,
            recent_red: e.filter(x => x.severity === 'red').slice(0, 8)
        });
    } catch (e) { console.error('[skills/compliance]', e); res.status(500).json({ message: e.message }); }
});

// Memory skill — facts across all customers
app.get('/api/v2/skills/memory', async (req, res) => {
    try {
        const { from, to } = getDateRange(req.query);
        let q = supabase.from('customer_memory')
            .select('id, customer_id, fact_type, fact_key, fact_value, confidence, valid_to, superseded_by, source_quote, created_at')
            .order('created_at', { ascending: false }).limit(500);
        if (from) q = q.gte('created_at', from);
        if (to) q = q.lte('created_at', to);
        if (req.query.customerId) q = q.eq('customer_id', req.query.customerId);
        const { data: memory } = await q;

        const m = memory || [];
        const active = m.filter(x => !x.valid_to);
        const superseded = m.filter(x => x.valid_to);

        // By type
        const byType = {};
        for (const f of active) {
            byType[f.fact_type] = (byType[f.fact_type] || 0) + 1;
        }

        // By customer — top customers with most facts
        const byCust = {};
        for (const f of active) {
            byCust[f.customer_id] = (byCust[f.customer_id] || 0) + 1;
        }
        const topCustIds = Object.entries(byCust).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([k])=>k);
        let cMap = {};
        if (topCustIds.length) {
            const { data: cs } = await supabase.from('customers').select('id,name,phone').in('id', topCustIds);
            cMap = Object.fromEntries((cs||[]).map(c => [c.id, c]));
        }
        const top_customers = topCustIds.map(id => ({
            customer: cMap[id] || { id, name: 'unknown' },
            fact_count: byCust[id]
        }));

        // Conflicts — memory that got superseded
        const conflicts = superseded.slice(0, 10);

        // Chunk stats
        const { count: chunksCount } = await supabase.from('call_chunks')
            .select('*', { count: 'exact', head: true });

        const { count: customersCount } = await supabase.from('customers')
            .select('*', { count: 'exact', head: true });

        res.json({
            total_facts: m.length,
            active_facts: active.length,
            superseded_facts: superseded.length,
            chunks_embedded: chunksCount || 0,
            customers_with_memory: Object.keys(byCust).length,
            total_customers: customersCount || 0,
            by_type: Object.entries(byType).map(([k,v])=>({type:k,count:v})).sort((a,b)=>b.count-a.count),
            top_customers,
            recent_conflicts: conflicts
        });
    } catch (e) { console.error('[skills/memory]', e); res.status(500).json({ message: e.message }); }
});

// ---------- Get saved call (v2 canonical) ----------
app.get('/api/v2/calls2/:id', async (req, res) => {
    try {
        const { data: call, error } = await supabase.from('calls').select('*').eq('id', req.params.id).single();
        if (error || !call) return res.status(404).json({ message: 'Not found' });
        let customer = null;
        if (call.customer_id) {
            const { data } = await supabase.from('customers').select('*').eq('id', call.customer_id).single();
            customer = data;
        }
        res.json({ call, customer });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// ---------- Confirm customer match after analysis ----------
app.post('/api/v2/calls2/:id/assign-customer', async (req, res) => {
    try {
        const { customer_id } = req.body;
        if (!customer_id) return res.status(400).json({ message: 'customer_id required' });
        const { data, error } = await supabase.from('calls')
            .update({ customer_id, customer_identified: true })
            .eq('id', req.params.id).select().single();
        if (error) throw error;
        // Also link call_chunks
        await supabase.from('call_chunks').update({ customer_id }).eq('call_id', req.params.id);
        res.json({ success: true, call: data });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// Analyze uploaded audio file and return full structured analysis.
// Optionally persists to transcriptions table (new columns) if user_id provided.
app.post('/api/v2/calls/analyze', upload.single('file'), async (req, res) => {
    const t0 = Date.now();
    try {
        if (!req.file) return res.status(400).json({ message: "No file uploaded." });
        const { userId, customerCode, notes } = req.body;

        console.log(`[v2/analyze] Start: file=${req.file.originalname}, size=${req.file.size}b`);

        const metadata = {
            customer_code: customerCode || null,
            notes: notes || null,
            rep_user_id: userId || null,
            filename: req.file.originalname
        };

        const mimeType = req.file.mimetype || 'audio/mpeg';
        const result = await analyzeCall(req.file.path, {
            mimeType,
            metadata,
            onProgress: (step, status) => console.log(`[v2/analyze] ${step}: ${status}`)
        });

        // Persist to DB if userId given (optional - can also be pure analysis API)
        let savedId = null;
        if (userId) {
            try {
                const { data: saved, error: dbErr } = await supabase.from('transcriptions').insert([{
                    audioURL: req.file.originalname,
                    transcription: result.transcript_text,
                    status: 'analyzed',
                    user_id: userId,
                    insights: {
                        analysis_version: result.analysis_version,
                        quality: result.quality,
                        needs: result.needs,
                        opportunity: result.opportunity,
                        compliance: result.compliance,
                        structure: result.structure,
                        diarized: result.diarized,
                        timings: result.timings,
                        metadata
                    }
                }]).select().single();
                if (dbErr) console.error("[v2/analyze] DB save error:", dbErr.message);
                else savedId = saved.id;
            } catch (e) { console.error("[v2/analyze] DB save exception:", e.message); }
        }

        const totalMs = Date.now() - t0;
        console.log(`[v2/analyze] Done in ${totalMs}ms, saved id=${savedId}`);

        res.json({
            success: true,
            saved_id: savedId,
            total_ms: totalMs,
            ...result
        });
    } catch (error) {
        console.error("[v2/analyze] FATAL:", error);
        res.status(500).json({ success: false, message: error.message || String(error) });
    } finally {
        if (req.file && fs.existsSync(req.file.path)) {
            try { fs.unlinkSync(req.file.path); } catch (_) {}
        }
    }
});

// Fetch a previously-analyzed call by transcription id (returns insights JSON)
app.get('/api/v2/calls/:id', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('transcriptions')
            .select('*')
            .eq('id', req.params.id)
            .single();
        if (error || !data) return res.status(404).json({ message: 'Not found' });
        res.json(data);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// ============================================================
// NOTES / REMINDERS / FOLLOW-UP
// ============================================================
app.get('/api/v2/notes', async (req, res) => {
    try {
        const { status, type, customerId, priority, due, limit = 100 } = req.query;
        const user = JSON.parse(req.headers['x-user'] || '{}');
        let q = supabase.from('notes')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(Math.min(parseInt(limit) || 100, 500));
        if (status && status !== 'all') q = q.eq('status', status);
        if (type && type !== 'all') q = q.eq('note_type', type);
        if (customerId) q = q.eq('customer_id', customerId);
        if (priority && priority !== 'all') q = q.eq('priority', priority);
        if (due === 'overdue') { q = q.lt('due_date', new Date().toISOString()).eq('status', 'open'); }
        if (due === 'today') {
            const start = new Date(); start.setHours(0,0,0,0);
            const end = new Date(); end.setHours(23,59,59,999);
            q = q.gte('due_date', start.toISOString()).lte('due_date', end.toISOString());
        }
        if (due === 'week') {
            const end = new Date(); end.setDate(end.getDate() + 7);
            q = q.lte('due_date', end.toISOString()).gte('due_date', new Date().toISOString());
        }
        const { data, error } = await q;
        if (error) throw error;

        // Attach customer names
        const custIds = [...new Set((data||[]).map(n => n.customer_id).filter(Boolean))];
        let cMap = {};
        if (custIds.length) {
            const { data: cs } = await supabase.from('customers').select('id,name,phone').in('id', custIds);
            cMap = Object.fromEntries((cs||[]).map(c => [c.id, c]));
        }
        res.json((data||[]).map(n => ({ ...n, customer: n.customer_id ? cMap[n.customer_id] : null })));
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.post('/api/v2/notes', async (req, res) => {
    try {
        const { title, body, note_type, priority, due_date, customer_id, call_id, tags } = req.body;
        if (!title) return res.status(400).json({ message: 'title required' });
        const { data, error } = await supabase.from('notes').insert([{
            title, body: body || null,
            note_type: note_type || 'note',
            priority: priority || 'medium',
            due_date: due_date || null,
            customer_id: customer_id || null,
            call_id: call_id || null,
            tags: tags || [],
            user_id: req.body.userId || 1,
            status: 'open'
        }]).select().single();
        if (error) throw error;
        res.json(data);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.put('/api/v2/notes/:id', async (req, res) => {
    try {
        const updates = {};
        const allowed = ['title','body','note_type','priority','status','due_date','customer_id','call_id','tags'];
        for (const k of allowed) { if (req.body[k] !== undefined) updates[k] = req.body[k]; }
        if (updates.status === 'done') updates.completed_at = new Date().toISOString();
        if (updates.status === 'open') updates.completed_at = null;
        const { data, error } = await supabase.from('notes').update(updates).eq('id', req.params.id).select().single();
        if (error) throw error;
        res.json(data);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

app.delete('/api/v2/notes/:id', async (req, res) => {
    try {
        const { error } = await supabase.from('notes').delete().eq('id', req.params.id);
        if (error) throw error;
        res.json({ success: true });
    } catch (e) { res.status(500).json({ message: e.message }); }
});

// Quick toggle done/open
app.post('/api/v2/notes/:id/toggle', async (req, res) => {
    try {
        const { data: note } = await supabase.from('notes').select('status').eq('id', req.params.id).single();
        if (!note) return res.status(404).json({ message: 'not found' });
        const newStatus = note.status === 'done' ? 'open' : 'done';
        const { data, error } = await supabase.from('notes').update({
            status: newStatus,
            completed_at: newStatus === 'done' ? new Date().toISOString() : null
        }).eq('id', req.params.id).select().single();
        if (error) throw error;
        res.json(data);
    } catch (e) { res.status(500).json({ message: e.message }); }
});

const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1') {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}

module.exports = app;
