# Sprint 2 — Memory & RAG

## 🚀 Bước 1: Chạy migration Supabase

1. Mở Supabase Dashboard → project `dwkymwwrpulflgbklhqu` → **SQL Editor**
2. Mở file `backend/db/migrations/002_memory_rag.sql`
3. Copy toàn bộ → paste vào SQL Editor → **Run**

Sẽ tạo:
- `customers` — entity KH chuẩn
- `customer_memory` — fact store với versioning & conflict detection
- `calls` — call canonical (song song với `transcriptions` cũ)
- `call_chunks` — pgvector embeddings (768 dims, Gemini text-embedding-004)
- `opportunities`, `compliance_events`
- `match_customer_chunks()` + `match_chunks_global()` RPC cho RAG

## 🧪 Bước 2: Test pipeline V2

### 2.1 Tạo KH test
```bash
curl -X POST http://localhost:5001/api/v2/customers \
  -H "Content-Type: application/json" \
  -d '{"name":"Bảo Long","phone":"0901786262","source":"hotline"}'
# → trả về {"id": "uuid-here", ...}
```

### 2.2 Phân tích call đầu tiên (KH mới, chưa có memory)
- Mở http://localhost:5174
- Chọn KH "Bảo Long" trong picker
- Upload file `~/Downloads/fileghiam/0901786262_27Feb2026_13h56m39s_Ex148.mp3`
- Chờ 60s → xem kết quả (không có 🧠 RAG badge vì chưa có history)

### 2.3 Phân tích call thứ 2 (CÙNG KH)
- Quay lại, chọn cùng KH "Bảo Long"
- Upload 1 file khác → lần này sẽ có **🧠 RAG context active** badge
- Agent sẽ tham chiếu call #1 khi chấm điểm call #2

### 2.4 Xem Customer 360
- Click "👥 Customers" → click "Bảo Long"
- Sẽ thấy:
  - **Memory facts** tự động extract từ 2 call (condition/medication/preference...)
  - **Timeline calls** với quality/opportunity/compliance scores
  - **Opportunities** pipeline
  - Nếu có **conflict** (KH đổi ý) → memory cũ bị supersede, lưu cả 2 version

## 🧠 Luồng RAG hoạt động

```
Upload call #2 cùng KH Bảo Long
    ↓
Diarize → transcript có timestamp
    ↓
buildRagContext(customer_id):
  - Load active customer_memory facts
  - Load 3 call summaries gần nhất
  - Semantic search call_chunks qua pgvector → top-5 đoạn liên quan
    ↓
Inject context vào prompt của 5 skills (quality/needs/opp/compliance/structure)
    ↓
Agent phân tích với AWARENESS of history:
  "KH này call trước đã chê giá, giờ đồng ý mua → buying signal mạnh"
  "KH call trước nói dị ứng X, agent giờ khuyên Y có chứa X → COMPLIANCE RED"
    ↓
Post-processing (async):
  - Extract facts → upsert customer_memory (with conflict detection)
  - Chunk + embed → insert call_chunks
  - Insert opportunities + compliance_events
```

## 🆘 Troubleshooting

**"Could not find the table 'public.customers'"**
→ Migration chưa chạy. Làm Bước 1.

**"vector type does not exist"**
→ pgvector chưa enable. Trong Supabase SQL Editor chạy:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

**Không thấy RAG badge dù đã có nhiều call**
→ Check backend log xem có `[pipeline-v2] embed step failed` không. Gemini embeddings có thể fail nếu quá rate limit.

**Match candidates không chính xác**
→ Hiện dùng name + phone + 1 semantic probe. Với > 20 KH có thể cần tune ngưỡng similarity trong `customer-matcher.js`.

## Next Sprint (sau khi bạn test OK)

1. **Chat Agent RAG**: panel chat ở Customer 360 để hỏi: "KH này lần nào nhắc dị ứng?" → Agent retrieve chunks + trả lời.
2. **Odoo integration**: webhook push khi có opportunity/compliance event.
3. **Manager Dashboard**: team leaderboard, compliance alert queue.
4. **Coach Agent**: weekly trend cho từng rep.
