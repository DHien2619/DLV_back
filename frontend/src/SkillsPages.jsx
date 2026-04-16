import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import FilterBar, { filtersToQuery } from './FilterBar';
import './SkillsPages.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const fmtVND = (v) => v ? new Intl.NumberFormat('vi-VN').format(v) + 'đ' : '—';
const gradeColor = (g) => ({ A:'#16a34a', B:'#65a30d', C:'#eab308', D:'#f97316', F:'#dc2626' }[g] || '#94a3b8');

function useSkillData(skill, filter) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const qs = filter ? `?${filtersToQuery(filter)}` : '';
    setLoading(true);
    fetch(`${API_URL}/api/v2/skills/${skill}${qs}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [skill, JSON.stringify(filter || {})]);
  return { data, loading };
}

function SkillHeader({ icon, iconBg, title, subtitle, description }) {
  return (
    <div className="sk-header">
      <div className="sk-hero">
        <div className="sk-icon" style={{ background: iconBg }}>{icon}</div>
        <div>
          <h1>{title}</h1>
          <p className="sk-sub">{subtitle}</p>
        </div>
      </div>
      <p className="sk-desc">{description}</p>
    </div>
  );
}

function StatCard({ label, value, suffix, tint, hint }) {
  return (
    <div className="sk-stat" data-tint={tint}>
      <small>{label}</small>
      <b>{value}{suffix && <span>{suffix}</span>}</b>
      {hint && <span className="sk-stat-hint">{hint}</span>}
    </div>
  );
}

// ============================================================
// 📊 QUALITY
// ============================================================
export function QualitySkill() {
  const [filter, setFilter] = useState({ preset: 'month' });
  const { data, loading } = useSkillData('quality', filter);
  const navigate = useNavigate();

  const critLabel = {
    identity_verification: 'Xác minh danh tính',
    medical_discovery: 'Khám phá y khoa',
    indication_appropriateness: 'Phù hợp chỉ định',
    side_effects_disclosure: 'Disclose tác dụng phụ',
    dosage_clarity: 'Liều & cách dùng',
    drug_interaction_check: 'Check tương tác thuốc',
    empathy_listening: 'Empathy & lắng nghe',
    professional_close: 'Close chuyên nghiệp',
    compliance_language: 'Ngôn ngữ tuân thủ'
  };
  const maxDist = data ? Math.max(1, ...Object.values(data.distribution || {})) : 1;

  return (
    <div className="sk-root">
      <SkillHeader
        icon="📊" iconBg="linear-gradient(135deg, #fef2f2, #fecaca)"
        title="Chấm điểm tư vấn"
        subtitle="Pharma Rubric 9 tiêu chí · evidence-backed"
        description="Agent chấm mỗi cuộc gọi theo 9 tiêu chí chuyên ngành dược phẩm với quote + timestamp làm bằng chứng. Trang này tổng hợp pattern chất lượng toàn team."
      />

      <FilterBar value={filter} onChange={setFilter} />

      {loading && <div className="sk-loading">Đang tải…</div>}
      {!loading && !data && <div className="sk-loading">Lỗi load data</div>}
      {!loading && data && <>
      <div className="sk-stats">
        <StatCard label="Tổng calls đã chấm" value={data.total_calls} />
        <StatCard label="Q̄ trung bình" value={data.avg_score} suffix="/100" tint="primary" />
        <StatCard label="Tiêu chí yếu nhất" value={data.criteria[0]?.pct + '%'} hint={critLabel[data.criteria[0]?.key]} tint="warn" />
        <StatCard label="Tiêu chí mạnh nhất" value={data.criteria[data.criteria.length-1]?.pct + '%'} hint={critLabel[data.criteria[data.criteria.length-1]?.key]} tint="ok" />
      </div>

      <div className="sk-grid">
        {/* Distribution */}
        <section className="sk-card">
          <h2>📈 Phân bố điểm</h2>
          <p className="sk-card-sub">Số call theo grade</p>
          <div className="sk-dist">
            {['A','B','C','D','F'].map(g => (
              <div key={g} className="sk-dist-bar">
                <div className="sk-dist-val" style={{ background: gradeColor(g), height: `${(data.distribution[g] / maxDist) * 100}%` }}>
                  {data.distribution[g] > 0 && <span>{data.distribution[g]}</span>}
                </div>
                <small style={{ color: gradeColor(g) }}>{g}</small>
              </div>
            ))}
          </div>
        </section>

        {/* Criteria */}
        <section className="sk-card sk-card-wide">
          <h2>🎯 Chi tiết theo tiêu chí</h2>
          <p className="sk-card-sub">Sắp xếp yếu → mạnh. Team cần training tiêu chí đầu tiên.</p>
          <div className="sk-crit">
            {data.criteria.map(c => (
              <div key={c.key} className="sk-crit-row">
                <span className="sk-crit-label">{critLabel[c.key] || c.key}</span>
                <div className="sk-crit-bar">
                  <div style={{ width: `${c.pct}%`, background: c.pct >= 70 ? 'var(--success)' : c.pct >= 40 ? 'var(--warning)' : 'var(--danger)' }}/>
                </div>
                <span className="sk-crit-val">{c.avg}/{c.max} · <b>{c.pct}%</b></span>
              </div>
            ))}
          </div>
        </section>

        {/* Top calls */}
        <section className="sk-card">
          <h2>🏆 Top 3 calls chất lượng cao</h2>
          {data.best_calls.map(c => (
            <div key={c.id} className="sk-ex" onClick={() => c.customer_id && navigate(`/customers/${c.customer_id}`)}>
              <div className="sk-ex-head">
                <span className="sk-ex-grade" style={{ background: gradeColor(c.grade) }}>{c.grade} · {c.score}</span>
                <small>{c.summary?.slice(0, 80)}…</small>
              </div>
              {c.strengths?.length > 0 && (
                <div className="sk-ex-items">
                  {c.strengths.map((s, i) => <div key={i}>✓ {s}</div>)}
                </div>
              )}
            </div>
          ))}
        </section>

        {/* Worst calls */}
        <section className="sk-card">
          <h2>⚠️ 3 calls cần cải thiện</h2>
          {data.worst_calls.map(c => (
            <div key={c.id} className="sk-ex" onClick={() => c.customer_id && navigate(`/customers/${c.customer_id}`)}>
              <div className="sk-ex-head">
                <span className="sk-ex-grade" style={{ background: gradeColor(c.grade) }}>{c.grade} · {c.score}</span>
                <small>{c.summary?.slice(0, 80)}…</small>
              </div>
              {c.improvements?.length > 0 && (
                <div className="sk-ex-items sk-ex-items-bad">
                  {c.improvements.map((s, i) => <div key={i}>→ {s}</div>)}
                </div>
              )}
            </div>
          ))}
        </section>

        {/* Recurring patterns */}
        <section className="sk-card sk-card-wide">
          <h2>📌 Pattern lặp lại</h2>
          <div className="sk-two-col">
            <div>
              <h4>✅ Điểm mạnh thường xuyên</h4>
              <ul className="sk-list">
                {data.top_strengths.map((s,i) => <li key={i}><span className="sk-freq sk-freq-ok">×{s.count}</span>{s.text}</li>)}
              </ul>
            </div>
            <div>
              <h4>🎯 Cần cải thiện thường xuyên</h4>
              <ul className="sk-list">
                {data.top_improvements.map((s,i) => <li key={i}><span className="sk-freq sk-freq-bad">×{s.count}</span>{s.text}</li>)}
              </ul>
            </div>
          </div>
        </section>
      </div>
      </>}
    </div>
  );
}

// ============================================================
// 💰 OPPORTUNITY
// ============================================================
export function OpportunitySkill() {
  const [filter, setFilter] = useState({ preset: 'month' });
  const { data, loading } = useSkillData('opportunity', filter);
  const navigate = useNavigate();

  const stages = ['cold','qualified','interested','hot','ready_to_buy','objection','lost'];
  const stageLabel = {
    cold: '❄️ Cold', qualified: '✓ Qualified', interested: '👀 Interested',
    hot: '🔥 Hot', ready_to_buy: '🎯 Ready to buy',
    objection: '🛑 Objection', lost: '✕ Lost'
  };
  const signalLabel = {
    price_inquiry: '💵 Hỏi giá', delivery_inquiry: '🚚 Hỏi giao hàng', payment_inquiry: '💳 Hỏi thanh toán',
    quantity_inquiry: '📦 Hỏi số lượng', compare_competitor: '🥊 So sánh đối thủ',
    commitment_language: '✅ Ngôn ngữ cam kết', urgency_language: '⚡ Ngôn ngữ gấp', other: '❓ Khác'
  };
  const objLabel = {
    price: '💵 Giá', trust: '🤔 Tin cậy', timing: '⏰ Thời điểm', need: '❌ Không cần',
    competitor_loyalty: '🔒 Trung thành với đối thủ', side_effect_fear: '😰 Sợ TDP', other: '❓ Khác'
  };
  const funnelMax = data ? Math.max(1, ...stages.map(s => data.funnel?.[s]?.count || 0)) : 1;

  return (
    <div className="sk-root">
      <SkillHeader
        icon="💰" iconBg="linear-gradient(135deg, #f0fdf4, #dcfce7)"
        title="Opportunity Scout"
        subtitle="Sales signals · objections · pipeline value · next best action"
        description="Agent phát hiện buying signals và objections timestamped, ước giá trị đơn hàng, gợi ý hành động tiếp theo cụ thể cho rep."
      />

      <FilterBar value={filter} onChange={setFilter} />

      {loading && <div className="sk-loading">Đang tải…</div>}
      {!loading && !data && <div className="sk-loading">Lỗi load data</div>}
      {!loading && data && <>
      <div className="sk-stats">
        <StatCard label="Tổng opportunities" value={data.total_opportunities} />
        <StatCard label="Đang mở" value={data.open} tint="primary" />
        <StatCard label="Pipeline value" value={fmtVND(data.total_value_vnd)} />
        <StatCard label="Win rate" value={data.win_rate != null ? data.win_rate + '%' : '—'} tint={data.win_rate >= 50 ? 'ok' : 'warn'} hint={`${data.won}W · ${data.lost}L`} />
      </div>

      <div className="sk-grid">
        {/* Funnel */}
        <section className="sk-card sk-card-wide">
          <h2>🔻 Funnel theo stage</h2>
          <div className="sk-funnel">
            {stages.map(s => {
              const f = data.funnel[s] || { count: 0, value: 0 };
              const pct = (f.count / funnelMax) * 100;
              return (
                <div key={s} className="sk-funnel-row">
                  <span className="sk-funnel-label">{stageLabel[s]}</span>
                  <div className="sk-funnel-bar">
                    <div style={{ width: `${pct}%` }} className={`sk-funnel-fill sk-stage-${s}`}>
                      {f.count > 0 && <span>{f.count}</span>}
                    </div>
                  </div>
                  <span className="sk-funnel-val">{fmtVND(f.value)}</span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Signals */}
        <section className="sk-card">
          <h2>📡 Buying signals phổ biến</h2>
          <p className="sk-card-sub">Từ {data.total_opportunities} opportunities</p>
          {data.top_buying_signals.length === 0 ? <p className="sk-empty">Chưa có signal</p> :
            data.top_buying_signals.map(s => (
              <div key={s.type} className="sk-sig-row">
                <span>{signalLabel[s.type] || s.type}</span>
                <b>×{s.count}</b>
              </div>
            ))
          }
        </section>

        {/* Objections */}
        <section className="sk-card">
          <h2>🛑 Objections phổ biến</h2>
          <p className="sk-card-sub">Rep cần training phản bác</p>
          {data.top_objections.length === 0 ? <p className="sk-empty">Chưa có objection</p> :
            data.top_objections.map(o => (
              <div key={o.type} className="sk-sig-row sk-sig-obj">
                <span>{objLabel[o.type] || o.type}</span>
                <b>×{o.count}</b>
              </div>
            ))
          }
        </section>

        {/* Hot list */}
        <section className="sk-card sk-card-wide">
          <h2>🔥 Hot opportunities đang theo dõi</h2>
          {data.hot_opportunities.length === 0 ? <p className="sk-empty">Không có deal hot</p> :
            <div className="sk-hot-list">
              {data.hot_opportunities.map(h => (
                <div key={h.id} className="sk-hot" onClick={() => h.customer_id && navigate(`/customers/${h.customer_id}`)}>
                  <div className="sk-hot-head">
                    <b>{h.customer?.name || 'KH'}</b>
                    <span className="sk-hot-score">{h.score}/100</span>
                  </div>
                  <div className="sk-hot-meta">
                    <span className={`sk-hot-stage sk-stage-${h.stage}`}>{stageLabel[h.stage]}</span>
                    <span>{fmtVND(h.estimated_value_vnd)}</span>
                  </div>
                  {h.next_action && <p className="sk-hot-action">→ {h.next_action}</p>}
                </div>
              ))}
            </div>
          }
        </section>
      </div>
      </>}
    </div>
  );
}

// ============================================================
// ⚠️ COMPLIANCE
// ============================================================
export function ComplianceSkill() {
  const [filter, setFilter] = useState({ preset: 'month' });
  const { data, loading } = useSkillData('compliance', filter);
  const navigate = useNavigate();

  const typeLabel = {
    adverse_event: '⚕️ Adverse event', off_label_claim: '📋 Off-label claim',
    guarantee_cure: '✋ Hứa chữa khỏi', pregnancy_risk_ignored: '🤰 Bỏ qua thai kỳ',
    drug_interaction_missed: '💊 Bỏ qua tương tác', underage_recommendation: '👶 Khuyên trẻ em',
    competitor_disparagement: '🥊 Chê đối thủ', personal_data_leak: '🔓 Lộ dữ liệu', other: '❓ Khác'
  };
  const reviewPct = data && data.total > 0 ? Math.round(data.reviewed / data.total * 100) : 100;

  return (
    <div className="sk-root">
      <SkillHeader
        icon="⚠️" iconBg="linear-gradient(135deg, #fffbeb, #fef3c7)"
        title="Compliance Guardian"
        subtitle="Phát hiện adverse event · off-label · guarantee cure · pharmacovigilance"
        description="Red flag cho mọi vi phạm tuân thủ dược phẩm. Quan trọng nhất: adverse event (PHẢI report pharmacovigilance) và off-label claim (rủi ro pháp lý)."
      />

      <FilterBar value={filter} onChange={setFilter} />

      {loading && <div className="sk-loading">Đang tải…</div>}
      {!loading && !data && <div className="sk-loading">Lỗi load data</div>}
      {!loading && data && <>
      <div className="sk-stats">
        <StatCard label="Tổng events" value={data.total} />
        <StatCard label="🔴 RED" value={data.red} tint="danger" />
        <StatCard label="🟠 ORANGE" value={data.orange} tint="warn" />
        <StatCard label="Tỷ lệ đã review" value={reviewPct + '%'} tint={reviewPct >= 80 ? 'ok' : 'warn'} hint={`${data.reviewed}/${data.total}`} />
      </div>

      <div className="sk-grid">
        {/* By type */}
        <section className="sk-card sk-card-wide">
          <h2>📊 Phân loại vi phạm</h2>
          <p className="sk-card-sub">Team nào có pattern gì nhiều nhất</p>
          {data.by_type.length === 0 ? <p className="sk-empty">Không có vi phạm 🎉</p> :
            <div className="sk-type-table">
              <div className="sk-type-head">
                <span>Loại</span><span>🔴 RED</span><span>🟠 ORANGE</span><span>🟡 YELLOW</span><span>Tổng</span>
              </div>
              {data.by_type.map(t => (
                <div key={t.type} className="sk-type-row">
                  <span>{typeLabel[t.type] || t.type}</span>
                  <span className={t.red > 0 ? 'sk-red' : ''}>{t.red}</span>
                  <span>{t.orange}</span>
                  <span>{t.yellow}</span>
                  <b>{t.total}</b>
                </div>
              ))}
            </div>
          }
        </section>

        {/* By rep */}
        <section className="sk-card">
          <h2>👥 Theo nhân viên</h2>
          {data.by_rep.length === 0 ? <p className="sk-empty">Chưa có data</p> :
            data.by_rep.map(r => (
              <div key={r.rep_user_id || 'u'} className="sk-rep-row" onClick={() => r.rep_user_id && navigate(`/coach?rep=${r.rep_user_id}`)}>
                <b>{r.user?.name || `Rep #${r.rep_user_id || '—'}`}</b>
                <div className="sk-rep-bars">
                  {r.red > 0 && <span className="sk-pill sk-pill-red">🔴 {r.red}</span>}
                  {r.orange > 0 && <span className="sk-pill sk-pill-orange">🟠 {r.orange}</span>}
                  {r.yellow > 0 && <span className="sk-pill sk-pill-yellow">🟡 {r.yellow}</span>}
                </div>
              </div>
            ))
          }
        </section>

        {/* Adverse events — critical */}
        <section className="sk-card sk-card-adverse">
          <h2>⚕️ Adverse Events</h2>
          <p className="sk-card-sub">PHẢI báo cáo pharmacovigilance — cao nhất priority</p>
          {data.adverse_events.length === 0 ? (
            <p className="sk-empty-good">✅ Không có adverse event nào được phát hiện.</p>
          ) : (
            data.adverse_events.map(e => (
              <div key={e.id} className="sk-ae" onClick={() => e.call_id && navigate(`/compliance-queue?severity=red`)}>
                <div className="sk-ae-head">
                  <span className="sk-pill sk-pill-red">RED</span>
                  <b>{new Date(e.created_at).toLocaleDateString('vi-VN')}</b>
                </div>
                <p>"{e.quote?.slice(0, 150)}"</p>
                <small>{e.explanation?.slice(0, 120)}</small>
              </div>
            ))
          )}
        </section>

        {/* Recent RED */}
        <section className="sk-card">
          <h2>🔴 RED events gần đây</h2>
          {data.recent_red.length === 0 ? (
            <p className="sk-empty-good">Không có RED nào.</p>
          ) : (
            data.recent_red.slice(0, 5).map(e => (
              <div key={e.id} className="sk-red-item" onClick={() => navigate('/compliance-queue?severity=red')}>
                <div className="sk-red-type">{typeLabel[e.event_type] || e.event_type}</div>
                <p>"{e.quote?.slice(0, 100)}…"</p>
                <small>{new Date(e.created_at).toLocaleDateString('vi-VN')}</small>
              </div>
            ))
          )}
        </section>
      </div>
      </>}
    </div>
  );
}

// ============================================================
// 🧠 MEMORY
// ============================================================
export function MemorySkill() {
  const [filter, setFilter] = useState({ preset: 'month' });
  const { data, loading } = useSkillData('memory', filter);
  const navigate = useNavigate();

  const typeLabel = {
    condition: '🏥 Tình trạng', medication: '💊 Thuốc', allergy: '⚠️ Dị ứng',
    preference: '🧭 Sở thích', goal: '🎯 Mục tiêu', family: '👨‍👩‍👧 Gia đình',
    purchase: '🛒 Đã mua', contact: '📞 Liên lạc', lifestyle: '🏃 Lối sống'
  };
  const coverage = data && data.total_customers > 0 ? Math.round(data.customers_with_memory / data.total_customers * 100) : 0;

  return (
    <div className="sk-root">
      <SkillHeader
        icon="🧠" iconBg="linear-gradient(135deg, #eff6ff, #dbeafe)"
        title="Memory Agent"
        subtitle="Fact store versioned · pgvector RAG · conflict detection"
        description="Agent tự động trích xuất facts từ mỗi cuộc gọi, lưu vào customer_memory với versioning. Khi KH đổi ý (vd: từ 'không dị ứng' → 'dị ứng penicillin'), memory cũ bị supersede và lưu cả 2 version."
      />

      <FilterBar value={filter} onChange={setFilter} />

      {loading && <div className="sk-loading">Đang tải…</div>}
      {!loading && !data && <div className="sk-loading">Lỗi load data</div>}
      {!loading && data && <>
      <div className="sk-stats">
        <StatCard label="Active facts" value={data.active_facts} tint="primary" hint={`/${data.total_facts} tổng`} />
        <StatCard label="Chunks embedded (RAG)" value={data.chunks_embedded} />
        <StatCard label="Coverage KH" value={coverage + '%'} hint={`${data.customers_with_memory}/${data.total_customers}`} tint={coverage >= 60 ? 'ok' : 'warn'} />
        <StatCard label="Conflicts detected" value={data.superseded_facts} tint={data.superseded_facts > 0 ? 'warn' : 'ok'} hint="facts bị supersede" />
      </div>

      <div className="sk-grid">
        {/* By type */}
        <section className="sk-card sk-card-wide">
          <h2>📂 Phân loại facts</h2>
          <p className="sk-card-sub">Agent lưu facts ben vững theo {data.by_type.length} loại</p>
          {data.by_type.length === 0 ? <p className="sk-empty">Chưa có fact</p> :
            <div className="sk-mem-types">
              {data.by_type.map(t => (
                <div key={t.type} className="sk-mem-type">
                  <b>{t.count}</b>
                  <span>{typeLabel[t.type] || t.type}</span>
                </div>
              ))}
            </div>
          }
        </section>

        {/* Top customers */}
        <section className="sk-card">
          <h2>🏆 KH có memory dày đặc nhất</h2>
          <p className="sk-card-sub">Agent đã học nhiều về họ</p>
          {data.top_customers.length === 0 ? <p className="sk-empty">Chưa có data</p> :
            data.top_customers.map(r => (
              <div key={r.customer.id} className="sk-cust-row" onClick={() => navigate(`/customers/${r.customer.id}`)}>
                <div>
                  <b>{r.customer.name}</b>
                  {r.customer.phone && <small>{r.customer.phone}</small>}
                </div>
                <span className="sk-pill sk-pill-indigo">{r.fact_count} facts</span>
              </div>
            ))
          }
        </section>

        {/* Conflicts */}
        <section className="sk-card sk-card-wide">
          <h2>⚡ Conflict detection (gần đây)</h2>
          <p className="sk-card-sub">KH đổi ý → Agent lưu version mới, mark version cũ superseded</p>
          {data.recent_conflicts.length === 0 ? (
            <p className="sk-empty-good">✅ Chưa có conflict nào. Memory ổn định.</p>
          ) : (
            data.recent_conflicts.map(c => (
              <div key={c.id} className="sk-conflict">
                <div className="sk-conflict-head">
                  <span className="sk-pill sk-pill-yellow">SUPERSEDED</span>
                  <b>{c.fact_key}</b>
                  <small>{new Date(c.created_at).toLocaleDateString('vi-VN')}</small>
                </div>
                <div className="sk-conflict-body">
                  <div>Old value: <code>{JSON.stringify(c.fact_value?.label || c.fact_value)?.slice(0, 80)}</code></div>
                  {c.source_quote && <div className="sk-conflict-quote">"{c.source_quote}"</div>}
                </div>
              </div>
            ))
          )}
        </section>

        {/* How it works */}
        <section className="sk-card">
          <h2>🔬 Cơ chế</h2>
          <ol className="sk-steps">
            <li><b>Extract</b>: Gemini đọc transcript, trích fact bền vững (KHÔNG phải event nhất thời)</li>
            <li><b>Upsert</b>: Match với active facts cùng fact_key</li>
            <li><b>Conflict?</b> Mark cũ superseded (valid_to=now), insert mới</li>
            <li><b>Embed</b>: Chunk transcript → gemini-embedding-001 → pgvector</li>
            <li><b>RAG</b>: Call sau cùng KH, retrieve top-5 chunks liên quan → inject vào prompt</li>
          </ol>
        </section>
      </div>
      </>}
    </div>
  );
}
