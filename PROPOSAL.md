# PharmaVoice — Redesign Proposal
**From "AI Chatbot" → "AI Sales Intelligence Agent for Pharma Telesales"**

> Inspired by Gong.io, Chorus.ai, Avoma, Fireflies, plus open-source best practices (WhisperX, pyannote, CrewAI, LangGraph, Mem0).

---

## 1. Khoảng cách hiện tại (Gap Analysis)

| Yêu cầu bài toán | Hiện trạng | Gap |
|---|---|---|
| Phiên âm chính xác tiếng Việt | Gemini upload file | ❌ Không có **speaker diarization** (không biết ai nói gì — agent hay khách) |
| Phân tích ngữ cảnh/cảm xúc | 1 prompt Gemini trả JSON 5 trường | ❌ Phân tích "nông", không timestamped evidence |
| Tóm tắt cuộc gọi | 2-3 câu summary | ⚠️ Thiếu phân đoạn (opening/discovery/pitch/close) |
| Trích xuất nhu cầu KH | `pain_points`, `needs` array | ⚠️ Không link với lịch sử KH |
| Đánh giá chất lượng tư vấn | 4 tiêu chí text tự do | ❌ Không có **rubric pharma-specific** (có nhắc tác dụng phụ? liều lượng? off-label?) |
| Phát hiện cơ hội bán hàng | `readiness_to_buy` 3 mức | ❌ Không có **opportunity pipeline** với product + value + next action |
| KH không SĐT (tổng đài) | ❌ Chưa hỗ trợ | ❌ Cần **fuzzy matching** theo voice/context |
| Đọc lịch sử KH → insight sâu | `customer_wiki` text blob | ❌ Chưa có **RAG** + customer timeline |
| Chat Agent có skill sâu | 2 tool tra wiki | ❌ Chỉ tra cứu, không **phân tích đa bước** |
| Tích hợp CRM khách | ❌ Không có | ❌ Cần webhook + API chuẩn |
| Compliance dược phẩm | ❌ Không có | ❌ Rủi ro lớn — thiếu phát hiện adverse event, off-label claim |

---

## 2. Kiến trúc mới: Multi-Agent System

### 2.1 Tổng quan

```
Rep upload audio + metadata
         │
         ▼
┌──────────────────────┐
│  JOB QUEUE (BullMQ)  │ ← xử lý bất đồng bộ, retry, giám sát
└──────────┬───────────┘
           ▼
┌───────────────────────────────────────────────────────┐
│               ORCHESTRATOR AGENT                      │
│            (Claude Sonnet 4.6 + LangGraph)            │
└──┬────────┬────────┬────────┬────────┬────────┬──────┘
   │        │        │        │        │        │
   ▼        ▼        ▼        ▼        ▼        ▼
┌─────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│ASR+ │ │Seg-  │ │Quali-│ │Needs │ │Oppor-│ │Compl-│
│Dia- │ │menter│ │ty    │ │Extr. │ │tunity│ │iance │
│rize │ │      │ │Asses.│ │      │ │Scout │ │Guard │
└─────┘ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘
   │        │        │        │        │        │
   └────────┴────────┴────────┼────────┴────────┘
                              ▼
                ┌─────────────────────────┐
                │  MEMORY AGENT (RAG)     │
                │  - Embed chunks         │
                │  - Update customer 360  │
                │  - Update rep scorecard │
                └──────────┬──────────────┘
                           ▼
                ┌─────────────────────────┐
                │  COACH AGENT            │
                │  - Feedback actionable  │
                │  - Trend rep-level      │
                └──────────┬──────────────┘
                           ▼
                ┌─────────────────────────┐
                │  CRM WEBHOOK DISPATCHER │
                └─────────────────────────┘
```

### 2.2 Đặc tả từng Agent (Skills thực tế, không generic)

#### A. ASR + Diarization Agent
- **Model**: Deepgram Nova-2 (Vietnamese + diarization + word timestamps) HOẶC WhisperX + pyannote (self-host).
- **Output**: `[{speaker: "AGENT"|"CUSTOMER", start_sec, end_sec, text, confidence}]`
- **Metrics tính sẵn**: talk-ratio, longest monologue, interruption count, avg response latency.
- **Tại sao không dùng Gemini**: Gemini transcribe ok nhưng không phân tách speaker — mất 60% giá trị phân tích.

#### B. Segmenter Agent (Call Structure)
Chia call thành 6 phase sales chuẩn:
1. **Opening** (greeting, identity confirm)
2. **Discovery** (symptoms, current meds, allergies, lifestyle)
3. **Product Pitch**
4. **Objection Handling**
5. **Close** (next step, payment, delivery)
6. **Wrap-up**

Mỗi phase có `start/end/summary/quality_sub_score`.

#### C. Quality Assessor Agent — **Pharma Rubric** (đây là điểm KHÁC BIỆT)

Không chấm chung chung "empathy: 8/10". Chấm theo rubric dược phẩm cụ thể:

| Tiêu chí | Điểm | Evidence-based check |
|---|---|---|
| **Xác minh danh tính KH** | 5 | Đúng tên? xác nhận SĐT? |
| **Discovery y khoa** | 15 | Hỏi triệu chứng, thời gian, mức độ? hỏi thuốc đang dùng? dị ứng? thai kỳ? |
| **Tính phù hợp chỉ định** | 20 | Sản phẩm gợi ý có match triệu chứng không? Có đưa ra **off-label claim** không? (flag đỏ) |
| **Disclose tác dụng phụ** | 15 | Chủ động nhắc? Giải thích cách xử lý? |
| **Liều & cách dùng** | 10 | Nêu rõ liều, tần suất, duration, cách uống (trước/sau ăn)? |
| **Tương tác thuốc** | 10 | Có hỏi về thuốc đang dùng để check tương tác? |
| **Empathy & lắng nghe** | 10 | Phản hồi cảm xúc KH? dùng tên KH? reflective listening? |
| **Close chuyên nghiệp** | 10 | Xác nhận đơn, next step rõ ràng, thời gian follow-up? |
| **Tuân thủ** | 5 | KHÔNG hứa "chữa khỏi 100%"? KHÔNG so sánh xấu đối thủ? |

**Mỗi điểm phải kèm `evidence: [{timestamp, quote}]`** — mọi insight trích dẫn được từ transcript.

#### D. Needs Extractor Agent
Output structured:
```json
{
  "medical_conditions": [{"name": "viêm xoang mạn", "duration": "3 tháng", "severity": "trung bình", "evidence": {...}}],
  "current_medications": [{"name": "Telfast", "duration": "2 tuần", "effectiveness": "kém"}],
  "allergies": [...],
  "lifestyle_factors": ["stress cao", "ngủ ít"],
  "unmet_needs": [...],
  "budget_signals": ["hỏi giá 3 lần", "so sánh giá competitor"],
  "decision_style": "cần tham khảo vợ / quyết nhanh / chờ khuyến mãi"
}
```

#### E. Opportunity Scout Agent — **Sales Intelligence**
Detect các buying signal timestamped:
- Hỏi giá (3 lần = hot)
- Hỏi "có giao tận nơi?", "thanh toán thế nào?"
- Nhắc competitor ("đang dùng Telfast của bên kia")
- Commit ("chị lấy thử 1 hộp xem")

Output:
```json
{
  "score": 0-100,
  "stage": "qualified|interested|hot|won|lost",
  "product_fit": [{"sku": "PRD001", "confidence": 0.85, "reason": "..."}],
  "estimated_value_vnd": 2400000,
  "next_best_action": "Gọi lại sau 2 ngày, đề xuất combo + freeship",
  "objections_to_address": [...],
  "close_timing": "within 7 days"
}
```

#### F. Compliance Guardian Agent — **CRITICAL cho pharma**
Phát hiện:
- **Adverse Event** KH báo phản ứng phụ → PHẢI LOG pharmacovigilance
- **Off-label claim** (agent nói sản phẩm chữa bệnh không trong chỉ định)
- **Thai kỳ/cho con bú** được nhắc nhưng agent không warning
- **Tương tác thuốc** nguy hiểm bị bỏ sót
- Lời hứa không có cơ sở ("100% khỏi", "chữa được ung thư")

Severity: `red | orange | yellow`. Red = auto-notify compliance officer.

#### G. Memory Agent (RAG + Customer 360)
- **Embed** mỗi đoạn transcript (semantic chunks) vào pgvector
- **Embed** customer profile, employee wiki
- Khi Agent chat hoặc phân tích call mới → retrieve top-K snippet lịch sử cùng KH
- **Fact extraction**: update customer_insights với facts mới (condition, med, preference)
- Dedupe + merge conflict (ví dụ: KH tháng trước nói "không dị ứng" giờ nói "dị ứng penicillin" → flag để rep xác nhận)

#### H. Coach Agent — Dành cho quản lý & rep
Không chỉ chấm điểm, mà **hướng dẫn cụ thể**:
> "Ở phút 03:42, KH hỏi 'có tác dụng phụ gì không' — em chỉ nói 'không đáng kể'. Next time thử: '*Dạ thông thường có thể buồn ngủ nhẹ trong 2-3 ngày đầu, mình nên uống vào buổi tối*'. Disclose chủ động tăng trust score 23% (data nội bộ)."

Trend analysis: "Tuần này em gặp 5 objection về giá, win rate 20% — thấp hơn team avg 45%. Cần training price framing."

#### I. Orchestrator Agent — Bộ não
- LangGraph state machine: quản lý flow, retry, timeout
- Tool-use: gọi các agent con trên, gọi RAG, gọi CRM webhook
- Khi user chat: tự quyết route nào cần gọi (query lịch sử? phân tích call mới? coach feedback?)

---

## 3. Database Schema mới (Supabase + pgvector)

```sql
-- ============ CORE ============
users (id, email, pwd_hash, role, team_id, name, created_at)

customers (
  id uuid PK,
  code text unique,                    -- mã nội bộ
  name text, phone text, age int, gender,
  source text,                          -- hotline|facebook|referral|walk-in
  health_profile jsonb,                 -- {conditions, allergies, medications, lifestyle}
  preferences jsonb,                    -- decision_style, budget, contact_time
  assigned_rep_id uuid FK,
  lifetime_value numeric DEFAULT 0,
  churn_risk numeric,                   -- 0-1
  next_best_action text,
  tags text[],
  created_at, updated_at
)

-- ============ CALLS ============
calls (
  id uuid PK,
  customer_id uuid FK NULL,             -- NULL khi chưa match được
  rep_id uuid FK,
  audio_url text,
  duration_sec int,
  recorded_at timestamptz,
  channel text,                         -- inbound|outbound|hotline
  metadata jsonb,                       -- {customer_code, tag, campaign}
  customer_identified boolean DEFAULT false,
  match_candidates jsonb,               -- [{customer_id, confidence, reason}]
  transcript_raw text,
  transcript_diarized jsonb,            -- [{speaker, start, end, text, conf}]
  talk_ratio numeric,                   -- 0-1 (agent talk %)
  total_quality_score numeric,          -- 0-100
  opportunity_score numeric,
  sentiment_overall text,
  processing_status text,               -- queued|asr|analyzing|done|failed
  created_at
)

call_segments (                         -- call phases
  id, call_id FK, phase text, 
  start_sec, end_sec, 
  summary text, sub_score numeric, quality_notes jsonb
)

call_moments (                          -- event-level
  id, call_id FK, timestamp_sec,
  moment_type text,                     -- objection|buying_signal|adverse_event|commitment|question|price_mention
  speaker text, quote text,
  handled_well boolean, 
  coach_note text, severity text
)

call_insights (                         -- master JSON insights (có thể là column trong calls)
  call_id FK UNIQUE,
  summary_short text, summary_detail text,
  rubric_scores jsonb,                  -- {identity: 5, discovery: 12, ...}
  needs jsonb, opportunities jsonb,
  compliance_flags jsonb
)

-- ============ EMBEDDINGS (RAG) ============
call_chunks (
  id, call_id FK, customer_id FK,
  chunk_text text, speaker text,
  start_sec, end_sec,
  embedding vector(1536),               -- pgvector
  metadata jsonb
)

customer_memory (                       -- fact store cho agent
  id, customer_id FK, 
  fact_type text,                       -- condition|med|allergy|preference|objection
  fact_value jsonb,
  source_call_id FK, source_quote text,
  confidence numeric,
  valid_from, valid_to, 
  superseded_by uuid,                   -- versioning
  created_at
)

-- ============ SALES ============
opportunities (
  id, customer_id FK, call_id FK,
  product_sku text, product_name text,
  stage text, confidence numeric,
  estimated_value_vnd numeric,
  next_action text, due_date,
  assigned_rep_id FK,
  created_at, closed_at, outcome text
)

-- ============ REP ANALYTICS ============
rep_scorecard_daily (
  rep_id, date,
  calls_count, avg_quality_score, avg_talk_ratio,
  conversion_rate, total_opportunity_value,
  strengths jsonb, weaknesses jsonb
)

-- ============ COMPLIANCE ============
compliance_events (
  id, call_id FK, rep_id FK, customer_id FK,
  event_type text,                      -- adverse_event|off_label|dangerous_interaction|false_promise
  severity text,                        -- red|orange|yellow
  quote text, timestamp_sec int,
  reviewed_by FK, reviewed_at, 
  action_taken text, status text
)

-- ============ CRM INTEGRATION ============
crm_integrations (
  id, tenant_id, crm_type,              -- hubspot|salesforce|zoho|custom_webhook
  config jsonb, webhook_url text, 
  api_key_encrypted text, active boolean
)

crm_sync_log (
  id, call_id FK, integration_id FK, 
  status text, payload jsonb, response jsonb,
  retry_count, synced_at
)
```

RLS policies: multi-tenant `team_id` filter trên mọi bảng.

---

## 4. Xử lý KH không có SĐT (tổng đài)

Flow matching:
1. Rep upload call, chọn "KH chưa xác định"
2. ASR chạy xong → extract từ transcript: tên KH (nếu có), triệu chứng, địa điểm, thuốc đang dùng
3. **Customer Matcher Agent**:
   - Query customer DB với fuzzy matching (pg_trgm) trên tên + địa chỉ
   - Semantic search pgvector trên health_profile vs transcript chunks
   - Voice embedding matching (nếu có lịch sử audio) — optional phase 2
   - Trả về top 5 candidate + confidence
4. UI hiển thị: "Có phải đây là [Nguyễn Thị A — KH từng hỏi về thuốc dạ dày 15/3]?"
5. Rep confirm → lưu mapping; hoặc chọn "tạo KH mới"
6. Agent học từ feedback này → tăng precision

---

## 5. Frontend Redesign

### 5.1 Rep Home (trang chính cho telesale)
- **Today**: calls hôm nay + quick stats
- **Coaching tips** của Coach Agent (3 tip ưu tiên)
- **Hot leads**: KH Opportunity Scout đánh hot nhưng chưa gọi lại
- **Pending callbacks**: deadline tracker

### 5.2 Call Detail Page (trang quan trọng nhất)
Layout 3 cột:
- **Cột trái — Audio player + Transcript đồng bộ**
  - Click câu bất kỳ → jump audio
  - Speaker color-coded (Agent/KH)
  - Highlight moments: 🟢 buying signal / 🔴 objection / ⚠️ compliance
- **Cột giữa — Insights panel**
  - Score bảng rubric (hover = evidence)
  - Phase timeline (opening → close)
  - Sentiment arc biểu đồ theo thời gian
- **Cột phải — AI Agent chat**
  - Chat về cuộc gọi này (RAG scoped)
  - "KH này lần trước nói gì về giá?"
  - "Gợi ý follow-up email cho KH này"

### 5.3 Customer 360
- Timeline tất cả calls + note + đơn hàng
- Health profile (auto-maintained)
- Opportunity board
- Memory facts (có thể edit)

### 5.4 Manager Dashboard
- Team scorecard leaderboard
- Trends: pain points top 10 tuần này, competitor mentions
- Compliance alerts queue (red/orange)
- Revenue forecast từ opportunities
- Heatmap quality theo giờ/ngày/rep

### 5.5 Settings — CRM Integration
- Connect HubSpot/Salesforce/Zoho
- Webhook config
- Field mapping

---

## 6. Tech Stack Final

| Layer | Tech | Lý do |
|---|---|---|
| **LLM deep analysis** | Claude Sonnet 4.6 | Best tại complex reasoning + structured output |
| **LLM fast tasks** | Claude Haiku 4.5 | Moment detection, classification |
| **ASR + Diarization** | Deepgram Nova-2 (primary) / WhisperX (fallback) | VN-native, speaker diarization built-in |
| **Embeddings** | OpenAI text-embedding-3-small | Rẻ, chất lượng tốt |
| **Vector DB** | pgvector in Supabase | Đã có, 1 DB duy nhất |
| **Orchestration** | LangGraph (JS) | State machine cho multi-agent |
| **Queue** | BullMQ + Redis | Scale, retry, monitoring |
| **Backend** | Next.js 15 API routes (migrate từ Express) | SSR, edge, tốt hơn để build dashboard |
| **Frontend** | Next.js + Tailwind + shadcn/ui | Đẹp, nhanh build |
| **Audio player** | wavesurfer.js | Waveform + region highlighting |
| **Charts** | Recharts | Simple, đẹp |
| **Auth** | Supabase Auth (migrate từ custom JWT) | Less code, RLS tích hợp |

---

## 7. Roadmap triển khai (4 sprint × 2 tuần)

### Sprint 1 — Foundation (Tuần 1-2)
- [ ] DB schema mới (migration từ cũ)
- [ ] Tích hợp Deepgram Nova-2 (replace Gemini transcribe)
- [ ] Claude Sonnet 4.6 cho orchestrator
- [ ] Job queue + pipeline async
- [ ] Migrate `transcriptions` → `calls` + `call_segments`

### Sprint 2 — Deep Agent Skills (Tuần 3-4)
- [ ] Quality Assessor với pharma rubric 9 tiêu chí
- [ ] Needs Extractor + Opportunity Scout
- [ ] Compliance Guardian
- [ ] Moment Detector (timestamped events)
- [ ] Evidence-backed output (quote + timestamp everywhere)

### Sprint 3 — Memory & RAG (Tuần 5-6)
- [ ] Embed call chunks vào pgvector
- [ ] Customer Memory Agent (fact extraction)
- [ ] Customer Matcher cho call không SĐT
- [ ] RAG-powered chat Agent
- [ ] Coach Agent trend analysis

### Sprint 4 — UI/UX + CRM (Tuần 7-8)
- [ ] Call Detail page với transcript đồng bộ audio
- [ ] Customer 360, Rep Home, Manager Dashboard
- [ ] CRM webhook dispatcher (HubSpot first)
- [ ] Compliance alert email/Slack
- [ ] Polish + load test

---

## 8. Open-source references đã khảo sát

| Project | Bài học áp dụng |
|---|---|
| [Gong.io patents](https://patents.google.com/?assignee=gong.io) | Moment detection, rubric-based scoring |
| [fireflies-ai/transcript-analyzer](https://github.com/fireflies-ai) | Action items extraction pattern |
| [pyannote/pyannote-audio](https://github.com/pyannote/pyannote-audio) | Speaker diarization open-source |
| [m-bain/whisperX](https://github.com/m-bain/whisperX) | Whisper + word timestamps + diarization |
| [langchain-ai/langgraph](https://github.com/langchain-ai/langgraph) | Multi-agent state machine |
| [mem0ai/mem0](https://github.com/mem0ai/mem0) | Long-term memory cho agent |
| [reddit r/LocalLLaMA](https://reddit.com/r/LocalLLaMA) Call Analysis threads | Best prompts cho rubric scoring |
| [crewAIInc/crewAI](https://github.com/crewAIInc/crewAI) | Role-based agent collaboration |

---

## 9. Câu hỏi cần confirm trước khi code

1. **Budget ASR**: Deepgram ~$0.0043/phút × expected volume/tháng = ? Nếu >$500/tháng → cân nhắc self-host WhisperX.
2. **Volume calls/ngày**: ước tính để scale queue.
3. **CRM khách đang dùng gì?** (Hubspot/Sales/Zoho/custom) → ưu tiên integration trước.
4. **Team size** (số rep, số manager, multi-tenant không?) → ảnh hưởng RLS design.
5. **Sản phẩm dược của KH** có catalog không? (dùng cho product_fit matching)
6. **Compliance officer workflow**: email alert hay dashboard review?
7. **Giữ Gemini** cho phần nào không, hay Claude all-in?
