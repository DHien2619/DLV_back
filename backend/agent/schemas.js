// Response schemas for Gemini structured output.
// Using Gemini's responseSchema (OpenAPI-subset) — not full JSON Schema.

const { SchemaType } = require("@google/generative-ai");

// ============ DIARIZED TRANSCRIPT ============
const diarizedTranscriptSchema = {
  type: SchemaType.OBJECT,
  properties: {
    language: { type: SchemaType.STRING, description: "Detected language code (e.g. 'vi')" },
    segments: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          speaker: {
            type: SchemaType.STRING,
            enum: ["AGENT", "CUSTOMER", "UNKNOWN"],
            description: "AGENT = telesale/tu van vien; CUSTOMER = khach hang"
          },
          start_sec: { type: SchemaType.NUMBER },
          end_sec: { type: SchemaType.NUMBER },
          text: { type: SchemaType.STRING }
        },
        required: ["speaker", "start_sec", "end_sec", "text"]
      }
    }
  },
  required: ["language", "segments"]
};

// ============ QUALITY RUBRIC (Pharma) ============
const rubricScoreItem = {
  type: SchemaType.OBJECT,
  properties: {
    score: { type: SchemaType.NUMBER, description: "Diem theo thang toi da cua tieu chi" },
    max: { type: SchemaType.NUMBER },
    reasoning: { type: SchemaType.STRING, description: "Ly do cham diem nay, ngan gon" },
    evidence: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          timestamp_sec: { type: SchemaType.NUMBER },
          speaker: { type: SchemaType.STRING },
          quote: { type: SchemaType.STRING }
        },
        required: ["timestamp_sec", "speaker", "quote"]
      }
    }
  },
  required: ["score", "max", "reasoning", "evidence"]
};

const rubricSchema = {
  type: SchemaType.OBJECT,
  properties: {
    identity_verification: rubricScoreItem,        // 5
    medical_discovery: rubricScoreItem,            // 15
    indication_appropriateness: rubricScoreItem,   // 20
    side_effects_disclosure: rubricScoreItem,      // 15
    dosage_clarity: rubricScoreItem,               // 10
    drug_interaction_check: rubricScoreItem,       // 10
    empathy_listening: rubricScoreItem,            // 10
    professional_close: rubricScoreItem,           // 10
    compliance_language: rubricScoreItem,          // 5
    total_score: { type: SchemaType.NUMBER, description: "Tong 0-100" },
    overall_grade: { type: SchemaType.STRING, enum: ["A", "B", "C", "D", "F"] },
    top_strengths: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    top_improvements: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } }
  },
  required: [
    "identity_verification", "medical_discovery", "indication_appropriateness",
    "side_effects_disclosure", "dosage_clarity", "drug_interaction_check",
    "empathy_listening", "professional_close", "compliance_language",
    "total_score", "overall_grade", "top_strengths", "top_improvements"
  ]
};

// ============ NEEDS EXTRACTOR ============
const needsSchema = {
  type: SchemaType.OBJECT,
  properties: {
    medical_conditions: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          duration: { type: SchemaType.STRING },
          severity: { type: SchemaType.STRING, enum: ["nhe", "trung_binh", "nang", "khong_ro"] },
          evidence_quote: { type: SchemaType.STRING },
          evidence_timestamp: { type: SchemaType.NUMBER }
        },
        required: ["name", "severity", "evidence_quote"]
      }
    },
    current_medications: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          name: { type: SchemaType.STRING },
          duration: { type: SchemaType.STRING },
          effectiveness: { type: SchemaType.STRING, enum: ["tot", "trung_binh", "kem", "khong_ro"] },
          evidence_quote: { type: SchemaType.STRING }
        },
        required: ["name", "evidence_quote"]
      }
    },
    allergies: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    lifestyle_factors: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
    unmet_needs: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          need: { type: SchemaType.STRING },
          urgency: { type: SchemaType.STRING, enum: ["cao", "trung_binh", "thap"] },
          evidence_quote: { type: SchemaType.STRING }
        },
        required: ["need", "urgency", "evidence_quote"]
      }
    },
    budget_signals: {
      type: SchemaType.OBJECT,
      properties: {
        price_sensitivity: { type: SchemaType.STRING, enum: ["cao", "trung_binh", "thap", "khong_ro"] },
        mentions_count: { type: SchemaType.NUMBER },
        competitor_prices_mentioned: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        notes: { type: SchemaType.STRING }
      },
      required: ["price_sensitivity", "mentions_count", "notes"]
    },
    decision_style: {
      type: SchemaType.STRING,
      description: "VD: can tham khao nguoi than | quyet nhanh | can thoi gian suy nghi | cho khuyen mai"
    },
    family_context: { type: SchemaType.STRING, description: "Gia dinh, con cai, cham soc cha me... neu co" }
  },
  required: [
    "medical_conditions", "current_medications", "allergies",
    "lifestyle_factors", "unmet_needs", "budget_signals", "decision_style"
  ]
};

// ============ OPPORTUNITY SCOUT ============
const opportunitySchema = {
  type: SchemaType.OBJECT,
  properties: {
    score: { type: SchemaType.NUMBER, description: "0-100, do hot cua co hoi" },
    stage: {
      type: SchemaType.STRING,
      enum: ["cold", "qualified", "interested", "hot", "ready_to_buy", "objection", "lost"]
    },
    buying_signals: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          timestamp_sec: { type: SchemaType.NUMBER },
          signal_type: {
            type: SchemaType.STRING,
            enum: ["price_inquiry", "delivery_inquiry", "payment_inquiry", "quantity_inquiry",
                   "compare_competitor", "commitment_language", "urgency_language", "other"]
          },
          quote: { type: SchemaType.STRING },
          strength: { type: SchemaType.STRING, enum: ["weak", "medium", "strong"] }
        },
        required: ["timestamp_sec", "signal_type", "quote", "strength"]
      }
    },
    objections: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          timestamp_sec: { type: SchemaType.NUMBER },
          objection_type: {
            type: SchemaType.STRING,
            enum: ["price", "trust", "timing", "need", "competitor_loyalty", "side_effect_fear", "other"]
          },
          quote: { type: SchemaType.STRING },
          handled_well: { type: SchemaType.BOOLEAN },
          agent_response_note: { type: SchemaType.STRING }
        },
        required: ["timestamp_sec", "objection_type", "quote", "handled_well", "agent_response_note"]
      }
    },
    estimated_value_vnd: { type: SchemaType.NUMBER, description: "Gia tri don hang ky vong neu close duoc" },
    confidence: { type: SchemaType.NUMBER, description: "0-1, do tin cay cua du bao" },
    next_best_action: {
      type: SchemaType.STRING,
      description: "Hanh dong cu the next step (VD: 'Goi lai sau 2 ngay, chao combo 3 hop + freeship')"
    },
    close_timing_days: { type: SchemaType.NUMBER, description: "So ngay du kien close duoc" },
    product_interest: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          product_hint: { type: SchemaType.STRING },
          interest_level: { type: SchemaType.STRING, enum: ["low", "medium", "high"] },
          evidence: { type: SchemaType.STRING }
        },
        required: ["product_hint", "interest_level", "evidence"]
      }
    }
  },
  required: ["score", "stage", "buying_signals", "objections", "next_best_action"]
};

// ============ COMPLIANCE GUARDIAN ============
const complianceSchema = {
  type: SchemaType.OBJECT,
  properties: {
    overall_status: { type: SchemaType.STRING, enum: ["clean", "yellow", "orange", "red"] },
    events: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          event_type: {
            type: SchemaType.STRING,
            enum: [
              "adverse_event",              // KH bao tac dung phu
              "off_label_claim",             // Agent noi san pham chua benh khong thuoc chi dinh
              "guarantee_cure",              // Lap cam ket "chua khoi 100%"
              "pregnancy_risk_ignored",      // KH nhac thai ky nhung agent bo qua canh bao
              "drug_interaction_missed",     // Khong hoi/canh bao tuong tac
              "underage_recommendation",     // Khuyen san pham nguoi lon cho tre em
              "competitor_disparagement",    // Noi xau cu the doi thu
              "personal_data_leak",          // Tiet lo thong tin KH khac
              "other"
            ]
          },
          severity: { type: SchemaType.STRING, enum: ["red", "orange", "yellow"] },
          timestamp_sec: { type: SchemaType.NUMBER },
          speaker: { type: SchemaType.STRING },
          quote: { type: SchemaType.STRING },
          explanation: { type: SchemaType.STRING },
          recommended_action: { type: SchemaType.STRING }
        },
        required: ["event_type", "severity", "timestamp_sec", "speaker", "quote", "explanation", "recommended_action"]
      }
    },
    notes: { type: SchemaType.STRING }
  },
  required: ["overall_status", "events"]
};

// ============ MOMENT DETECTOR + SEGMENTER + SUMMARY ============
const callStructureSchema = {
  type: SchemaType.OBJECT,
  properties: {
    summary_short: { type: SchemaType.STRING, description: "1-2 cau tom tat" },
    summary_detailed: { type: SchemaType.STRING, description: "4-6 cau chi tiet theo dong thoi gian" },
    phases: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          phase: {
            type: SchemaType.STRING,
            enum: ["opening", "discovery", "pitch", "objection_handling", "close", "wrap_up"]
          },
          start_sec: { type: SchemaType.NUMBER },
          end_sec: { type: SchemaType.NUMBER },
          summary: { type: SchemaType.STRING },
          quality_note: { type: SchemaType.STRING }
        },
        required: ["phase", "start_sec", "end_sec", "summary"]
      }
    },
    moments: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          timestamp_sec: { type: SchemaType.NUMBER },
          moment_type: {
            type: SchemaType.STRING,
            enum: ["buying_signal", "objection", "adverse_event", "commitment",
                   "question_unanswered", "price_mention", "competitor_mention", "emotional_peak"]
          },
          speaker: { type: SchemaType.STRING },
          quote: { type: SchemaType.STRING },
          note: { type: SchemaType.STRING }
        },
        required: ["timestamp_sec", "moment_type", "speaker", "quote", "note"]
      }
    },
    talk_ratio: {
      type: SchemaType.OBJECT,
      properties: {
        agent_pct: { type: SchemaType.NUMBER },
        customer_pct: { type: SchemaType.NUMBER },
        assessment: { type: SchemaType.STRING }
      },
      required: ["agent_pct", "customer_pct", "assessment"]
    },
    sentiment_arc: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          timestamp_sec: { type: SchemaType.NUMBER },
          sentiment: { type: SchemaType.STRING, enum: ["very_negative", "negative", "neutral", "positive", "very_positive"] },
          note: { type: SchemaType.STRING }
        },
        required: ["timestamp_sec", "sentiment"]
      }
    }
  },
  required: ["summary_short", "summary_detailed", "phases", "moments", "talk_ratio"]
};

module.exports = {
  diarizedTranscriptSchema,
  rubricSchema,
  needsSchema,
  opportunitySchema,
  complianceSchema,
  callStructureSchema
};
