import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import FilterBar, { filtersToQuery } from './FilterBar';
import { IconAlertTriangle, IconArrowRight, IconChartLine, IconCheck, IconClose, IconCompliance, IconDollar, IconEye, IconFire, IconMoney, IconPhone2, IconStop, IconTrophy, IconWarning } from './icons';
import './ManagerDashboard.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';
const fmtVND = (v) => v ? new Intl.NumberFormat('vi-VN').format(v) + 'đ' : '—';
const gradeColor = (g) => ({ A:'#16a34a', B:'#65a30d', C:'#eab308', D:'#f97316', F:'#dc2626' }[g] || '#94a3b8');

export default function ManagerDashboard() {
  const [filter, setFilter] = useState({ preset: 'week' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    setLoading(true);
    const qs = filtersToQuery(filter);
    fetch(`${API_URL}/api/v2/dashboard/manager?${qs}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [JSON.stringify(filter)]);

  if (loading && !data) return <div className="md-loading">Đang tải dashboard…</div>;
  if (!data) return <div className="md-loading">Không load được data.</div>;

  const { team = {}, leaderboard = [], trend = [], compliance = {}, pipeline = {} } = data;

  // Calculate trend extremes for sparkline
  const maxCalls = Math.max(1, ...trend.map(t => t.calls));
  const maxQ = Math.max(100, ...trend.map(t => t.avg_quality));

  return (
    <div className="md-root">
      <div className="md-header">
        <div>
          <h1><IconChartLine size={16}/> Dashboard quản lý</h1>
          <p>{team.calls} cuộc gọi trong bộ lọc hiện tại{filter.customerName && <> · KH <b>{filter.customerName}</b></>}</p>
        </div>
        <div className="md-header-actions">
          <Link to="/compliance-queue" className="md-btn-alert">
            <IconWarning size={14}/> {compliance.total_unreviewed} cần review
          </Link>
          <Link to="/coach" className="md-btn-ghost">🎓 Coach</Link>
        </div>
      </div>

      <FilterBar value={filter} onChange={setFilter} />

      {/* KPI strip */}
      <div className="md-kpis">
        <div className="md-kpi">
          <small><IconPhone2 size={16}/> Cuộc gọi tuần</small>
          <b>{team.calls}</b>
        </div>
        <div className="md-kpi">
          <small><IconChartLine size={16}/> Q̄ chất lượng</small>
          <b style={{ color: gradeColor(qualityGrade(team.avg_quality)) }}>{team.avg_quality}</b>
          <span>/100</span>
        </div>
        <div className="md-kpi">
          <small><IconMoney size={16}/> Opp̄</small>
          <b>{team.avg_opportunity}</b>
          <span>/100</span>
        </div>
        <div className="md-kpi md-kpi-compliance">
          <small><IconCompliance size={16}/> Tuân thủ</small>
          <b>{team.clean_pct}%</b>
          <span>sạch</span>
          {team.red > 0 && <small className="md-kpi-bad"><IconAlertTriangle size={14}/> {team.red} RED</small>}
        </div>
        <div className="md-kpi">
          <small><IconDollar size={14}/> Pipeline</small>
          <b style={{ fontSize: 18 }}>{fmtVND(pipeline.total_value_vnd)}</b>
          <span>{pipeline.total_opportunities} deals</span>
        </div>
      </div>

      <div className="md-grid">
        {/* Leaderboard */}
        <section className="md-card md-card-wide">
          <h2><IconTrophy size={16}/> Leaderboard tuần</h2>
          <p className="md-sub">Xếp hạng theo quality score trung bình</p>
          {leaderboard.length === 0 ? (
            <div className="md-empty">Chưa có data tuần này</div>
          ) : (
            <div className="md-leaderboard">
              <div className="md-lb-row md-lb-head">
                <span>#</span><span>Nhân viên</span><span>Calls</span>
                <span>Q̄</span><span>Opp̄</span><span>RED</span><span>Grade</span>
              </div>
              {leaderboard.map((r, i) => (
                <div key={r.rep_user_id || i} className="md-lb-row"
                     onClick={() => navigate(`/coach?rep=${r.rep_user_id}`)}>
                  <span className="md-rank">{i + 1}</span>
                  <span className="md-rep-name">
                    <span className="md-avatar">{(r.rep?.name || '?').slice(0,2).toUpperCase()}</span>
                    <b>{r.rep?.name || `Rep #${r.rep_user_id}`}</b>
                  </span>
                  <span>{r.calls}</span>
                  <span><b>{r.avg_quality}</b></span>
                  <span>{r.avg_opportunity}</span>
                  <span className={r.red > 0 ? 'md-red-cell' : ''}>{r.red || '—'}</span>
                  <span className="md-grade" style={{ background: gradeColor(r.grade) }}>{r.grade}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Compliance summary */}
        <section className="md-card">
          <h2><IconWarning size={14}/> Compliance</h2>
          <p className="md-sub">Events chưa review</p>
          <div className="md-comp-buckets">
            <Link to="/compliance-queue?severity=red" className="md-bucket md-bucket-red">
              <b>{compliance.red}</b><span>RED</span>
            </Link>
            <Link to="/compliance-queue?severity=orange" className="md-bucket md-bucket-orange">
              <b>{compliance.orange}</b><span>ORANGE</span>
            </Link>
            <Link to="/compliance-queue?severity=yellow" className="md-bucket md-bucket-yellow">
              <b>{compliance.yellow}</b><span>YELLOW</span>
            </Link>
          </div>
          <Link to="/compliance-queue" className="md-bucket-all">
            Xem hàng đợi <IconArrowRight size={14}/> ({compliance.total_unreviewed})
          </Link>
        </section>

        {/* Trend 30d */}
        <section className="md-card md-card-wide">
          <h2><IconChartLine size={16}/> Xu hướng 30 ngày</h2>
          <p className="md-sub">Số cuộc gọi + quality trung bình theo ngày</p>
          {trend.length === 0 ? (
            <div className="md-empty">Chưa có data</div>
          ) : (
            <div className="md-trend">
              <div className="md-trend-chart">
                {trend.map((t, i) => (
                  <div key={i} className="md-trend-day" title={`${t.date}: ${t.calls} calls, Q̄=${t.avg_quality}`}>
                    <div className="md-trend-bar-wrap">
                      <div
                        className="md-trend-bar"
                        style={{
                          height: `${(t.calls / maxCalls) * 100}%`,
                          background: t.red > 0 ? 'var(--danger)' : 'var(--primary)'
                        }}
                      />
                    </div>
                    <div
                      className="md-trend-q"
                      style={{ bottom: `${(t.avg_quality / maxQ) * 100}%` }}
                    />
                    <small>{t.date.slice(5)}</small>
                  </div>
                ))}
              </div>
              <div className="md-trend-legend">
                <span><span className="md-dot" style={{ background: 'var(--primary)' }}/> Calls count</span>
                <span><span className="md-dot" style={{ background: 'var(--danger)' }}/> Có RED event</span>
                <span><span className="md-dot" style={{ background: '#eab308' }}/> Q line</span>
              </div>
            </div>
          )}
        </section>

        {/* Pipeline */}
        <section className="md-card">
          <h2><IconMoney size={16}/> Pipeline</h2>
          <p className="md-sub">Cơ hội đang mở</p>
          <div className="md-pipeline-total">
            <b>{fmtVND(pipeline.total_value_vnd)}</b>
            <span>{pipeline.total_opportunities} deals open</span>
          </div>
          <div className="md-pipeline-stages">
            {Object.entries(pipeline.by_stage || {}).map(([stage, count]) => (
              <div key={stage} className={`md-stage md-stage-${stage}`}>
                <span>{stageLabel(stage)}</span>
                <b>{count}</b>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function qualityGrade(s) {
  if (s == null) return 'F';
  if (s >= 90) return 'A'; if (s >= 75) return 'B'; if (s >= 60) return 'C'; if (s >= 40) return 'D'; return 'F';
}
function stageLabel(s) {
  return { ready_to_buy: '🔥 Ready to buy', hot: '🔥 Hot', interested: '👀 Interested',
           qualified: '✓ Qualified', cold: '❄ Cold', objection: '🛑 Objection', lost: '✕ Lost' }[s] || s;
}
