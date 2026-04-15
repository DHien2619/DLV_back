require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Khởi tạo Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Khởi tạo Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function extractAndSaveInsights(transcriptionId, transcriptionText) {
    if (!transcriptionId || !transcriptionText) return;
    try {
        console.log(`\n[+] Đang xử lý Record ID: ${transcriptionId}...`);
        const prompt = `Từ nội dung phân tích cuộc gặp/cuộc gọi y tế dưới đây, hãy trích xuất dữ liệu thành cấu trúc chuẩn JSON (bắt buộc đúng format, không kèm markdown \`\`\`json):

NỘI DUNG GỐC:
"""
${transcriptionText.substring(0, 10000)}
"""

YÊU CẦU ĐẦU RA JSON CÓ CÁC TRƯỜNG SAU:
{
  "call_score": <số nguyên từ 0-100 đánh giá chất lượng cuộc gọi/tư vấn>,
  "readiness_to_buy": "<Cao | Trung Bình | Thấp>",
  "pain_points": ["<Nỗi đau 1>", "<Nỗi đau 2>"],
  "needs": ["<Nhu cầu 1>", "<Nhu cầu 2>"],
  "competitors_mentioned": ["<Tên đối thủ/nhãn hiệu khác nếu có>"],
  "customer_sentiment": "<Tích cực | Tiêu cực | Khá khó tính | Hợp tác>"
}`;

        const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });
        const result = await model.generateContent(prompt);
        let rawText = result.response.text();
        rawText = rawText.replace(/```json/gi, '').replace(/```/g, '').trim();
        
        let insightsData;
        try {
            insightsData = JSON.parse(rawText);
        } catch(parseErr) {
            console.error(" -> [Lỗi] Không parse được JSON từ AI. Dữ liệu thô:", rawText);
            return false;
        }

        // Cập nhật DB
        const { error: dbError } = await supabase.from('transcriptions').update({
            insights: insightsData
        }).eq('id', transcriptionId);

        if (dbError) {
            console.error(` -> [Lỗi DB]:`, dbError.message);
            return false;
        } else {
            console.log(` -> Thành công! Score: ${insightsData.call_score}, Sentiment: ${insightsData.customer_sentiment}`);
            return true;
        }
    } catch (e) {
        console.error(" -> [Lỗi gọi AI]:", e.message);
        return false;
    }
}

async function startBackfill() {
    console.log("=== BẮT ĐẦU ĐỒNG BỘ INSIGHTS ===");
    
    // Lấy tối đa 50 dòng chưa có insights
    const { data: records, error } = await supabase
        .from('transcriptions')
        .select('id, transcription')
        .is('insights', null)
        .limit(50);
        
    if (error) {
        console.error("Lỗi lấy dữ liệu:", error);
        return;
    }
    
    if (!records || records.length === 0) {
        console.log("Tuyệt vời! Không còn file nào bị thiếu insights.");
        return;
    }
    
    console.log(`Tìm thấy ${records.length} dòng bị thiếu insights. Bắt đầu phân tích...`);
    
    let successCount = 0;
    for (let i = 0; i < records.length; i++) {
        const record = records[i];
        if (record.transcription) {
            const ok = await extractAndSaveInsights(record.id, record.transcription);
            if (ok) successCount++;
            
            // Wait 2 seconds to avoid Gemini Rate Limit
            await new Promise(r => setTimeout(r, 2000));
        } else {
            console.log(`\n[-] Bỏ qua Record ID: ${record.id} vì không có nội dung transcription.`);
        }
    }
    
    console.log(`\n=== ĐÃ XONG! Thành công: ${successCount}/${records.length} ===`);
    console.log("Mở lại bảng Supabase để xem cột insights đã có JSON nha!");
}

startBackfill();
