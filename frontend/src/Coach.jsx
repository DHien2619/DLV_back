import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { IconAlertTriangle, IconArrowLeft, IconArrowRight, IconChartLine, IconCheck, IconPhone2, IconTarget } from './icons';
import './Coach.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const gradeColor = (s) => { if (s>=90) return '#16a34a'; if (s>=75) return '#65a30d'; if (s>=60) return '#eab308'; if (s>=40) return '#f97316'; return '#dc2626'; };

const CRITERIA_LABEL = {
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

export default function Coach() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [reps, setReps] = useState([]);
  const [selectedRep, setSelectedRep] = useState(searchParams.get('rep') || null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetch(`${API_URL}/api/v2/coach/reps`)
      .then(r => r.json())
      .then(list => {
        setReps(list);
        if (!selectedRep && list.length > 0) {
          setSelectedRep(String(list[0].rep_user_id));
        }
      });
  }, []);

  useEffect(() => {
    if (!selectedRep) return;
    setLoading(true);
    fetch(`${API_URL}/api/v2/coach/rep/${selectedRep}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedRep]);

  const pickRep = (id) => {
    setSelectedRep(String(id));
    setSearchParams({ rep: String(id) });
  };

  return (
    <div className="cc-root">
      <div className="cc-header">
        <div>
          <h1>🎓 Coach</h1>
          <p>Phản hồi actionable cho từng nhân viên · 30 ngày qua</p>
        </div>
      </div>

      <div className="cc-layout">
        {/* Sidebar — rep list */}
        <aside className="cc-reps">
          <h3>Nhân viên</h3>
          {reps.length === 0 ? (
            <p className="cc-empty-small">Chưa có rep nào có call</p>
          ) : (
            reps.map(r => (
              <button
                key={r.rep_user_id}
                className={`cc-rep ${String(r.rep_user_id) === String(selectedRep) ? 'active' : ''}`}
                onClick={() => pickRep(r.rep_user_id)}
              >
                <div className="cc-rep-avatar" style={{ background: gradeColor(r.avg_quality) }}>
                  {(r.user?.name || '?').slice(0,2).toUpperCase()}
                </div>
                <div className="cc-rep-info">
                  <b>{r.user?.name || `Rep #${r.rep_user_id}`}</b>
                  <small>{r.calls} calls · Q̄ {r.avg_quality}{r.red > 0 ? ` ·  ${r.red}` : ''}</small>
                </div>
              </button>
            ))
          )}
        </aside>

        {/* Main panel */}
        <main className="cc-main">
          {loading ? (
            <div className="cc-loading">Đang tải…</div>
          ) : !data ? (
            <div className="cc-loading"><IconArrowLeft size={14}/> Chọn rep để xem</div>
          ) : (
            <>
              <div className="cc-rep-header">
                <div>
                  <h2>{data.rep?.name || `Rep #${selectedRep}`}</h2>
                  <p>{data.calls} cuộc gọi · {data.period_days} ngày qua</p>
                </div>
                <div className="cc-rep-scores">
                  <div>
                    <small>Q̄ Chất lượng</small>
                    <b style={{ color: gradeColor(data.avg_quality) }}>{data.avg_quality}</b>
                  </div>
                  <div>
                    <small>Opp̄</small>
                    <b>{data.avg_opportunity}</b>
                  </div>
                  {data.red_count > 0 && (
                    <div>
                      <small><IconAlertTriangle size={14}/> RED</small>
                      <b style={{ color: 'var(--danger)' }}>{data.red_count}</b>
                    </div>
                  )}
                </div>
              </div>

              {/* Criteria breakdown */}
              <section className="cc-card">
                <h3><IconChartLine size={16}/> Phân tích theo tiêu chí</h3>
                <p className="cc-sub">Trung bình các tiêu chí rubric trên {data.calls} calls. Sắp xếp từ yếu nhất <IconArrowRight size={14}/> mạnh nhất.</p>
                <div className="cc-criteria">
                  {data.criteria.map(c => (
                    <div key={c.key} className="cc-crit">
                      <div className="cc-crit-head">
                        <span>{CRITERIA_LABEL[c.key] || c.key}</span>
                        <b>{c.avg_score.toFixed(1)}/{c.max_score}</b>
                      </div>
                      <div className="cc-crit-bar">
                        <div
                          style={{
                            width: `${c.pct}%`,
                            background: c.pct >= 70 ? 'var(--success)' : c.pct >= 40 ? 'var(--warning)' : 'var(--danger)'
                          }}
                        />
                      </div>
                      <small>{c.pct}% · {c.count} calls đánh giá</small>
                    </div>
                  ))}
                </div>
              </section>

              <div className="cc-row">
                {/* Strengths */}
                <section className="cc-card">
                  <h3><IconCheck size={14}/> Điểm mạnh thường xuyên</h3>
                  {data.top_strengths.length === 0 ? (
                    <p className="cc-empty-small">Chưa đủ data</p>
                  ) : (
                    <ul className="cc-list">
                      {data.top_strengths.map((s, i) => (
                        <li key={i}>
                          <span className="cc-freq">×{s.count}</span>
                          {s.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>

                {/* Improvements */}
                <section className="cc-card cc-card-improve">
                  <h3><IconTarget size={16}/> Cần cải thiện</h3>
                  {data.top_improvements.length === 0 ? (
                    <p className="cc-empty-small">Chưa đủ data</p>
                  ) : (
                    <ul className="cc-list">
                      {data.top_improvements.map((s, i) => (
                        <li key={i}>
                          <span className="cc-freq cc-freq-red">×{s.count}</span>
                          {s.text}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              </div>

              {/* Recent calls */}
              <section className="cc-card">
                <h3><IconPhone2 size={16}/> 10 cuộc gọi gần nhất</h3>
                <div className="cc-calls">
                  {data.recent_calls.map(c => (
                    <div key={c.id} className="cc-call" onClick={() => navigate(`/call/${c.id}`)}>
                      <div className="cc-call-date">{new Date(c.created_at).toLocaleDateString('vi-VN')}</div>
                      <div className="cc-call-body">
                        <p>{c.summary || '—'}</p>
                      </div>
                      <div className="cc-call-scores">
                        <span className="cc-cq" style={{ background: gradeColor(c.quality) }}>Q {c.quality || '—'}</span>
                        <span className="cc-copp">Opp {c.opportunity || '—'}</span>
                        {c.compliance && c.compliance !== 'clean' && (
                          <span className={`cc-csev cc-csev-${c.compliance}`}>{c.compliance.toUpperCase()}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
