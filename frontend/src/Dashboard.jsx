import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Dashboard.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

// ── Mini sparkline bar ────────────────────────────────────────
const ScoreBar = ({ score }) => {
    const color = score >= 80 ? '#22c55e' : score >= 60 ? '#f59e0b' : '#ef4444';
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '99px', overflow: 'hidden' }}>
                <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: '99px', transition: 'width 0.8s ease' }} />
            </div>
            <span style={{ fontSize: '12px', fontWeight: 700, color, minWidth: '30px' }}>{score}</span>
        </div>
    );
};

// ── Sentiment badge ───────────────────────────────────────────
const SentimentBadge = ({ sentiment }) => {
    const map = {
        'Tích cực': { color: '#22c55e', bg: 'rgba(34,197,94,0.1)', icon: '😊' },
        'Hợp tác': { color: '#818cf8', bg: 'rgba(129,140,248,0.1)', icon: '🤝' },
        'Tiêu cực': { color: '#ef4444', bg: 'rgba(239,68,68,0.1)', icon: '😠' },
        'Khá khó tính': { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', icon: '😤' },
    };
    const style = map[sentiment] || { color: '#9ca3af', bg: 'rgba(156,163,175,0.1)', icon: '❓' };
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '2px 8px', borderRadius: '99px',
            background: style.bg, color: style.color,
            fontSize: '11px', fontWeight: 600
        }}>
            {style.icon} {sentiment || 'Chưa phân tích'}
        </span>
    );
};

// ── Readiness badge ───────────────────────────────────────────
const ReadinessBadge = ({ level }) => {
    const map = {
        'Cao': { color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
        'Trung Bình': { color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
        'Thấp': { color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
    };
    const style = map[level] || { color: '#9ca3af', bg: 'rgba(156,163,175,0.1)' };
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '2px 8px', borderRadius: '99px',
            background: style.bg, color: style.color,
            fontSize: '11px', fontWeight: 600
        }}>
            🛒 {level || 'N/A'}
        </span>
    );
};

// ── Mini donut chart ──────────────────────────────────────────
const DonutProgress = ({ value, max, color, label }) => {
    const pct = Math.min((value / max) * 100, 100);
    const r = 28, circ = 2 * Math.PI * r;
    const dash = (pct / 100) * circ;
    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
            <svg width="72" height="72" viewBox="0 0 72 72" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
                <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="8"
                    strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                    style={{ transition: 'stroke-dasharray 0.8s ease' }} />
            </svg>
            <div style={{ textAlign: 'center', marginTop: '-62px', position: 'relative', zIndex: 1 }}>
                <div style={{ fontSize: '16px', fontWeight: 800, color }}>{value}</div>
            </div>
            <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '28px', textAlign: 'center' }}>{label}</div>
        </div>
    );
};

// ── MAIN DASHBOARD ────────────────────────────────────────────
const Dashboard = ({ onBack }) => {
    const [records, setRecords] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState('all');
    const [searchDate, setSearchDate] = useState('');
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'dark');

    useEffect(() => {
        // ── Admin Guard ──────────────────────────────────────────
        const stored = localStorage.getItem('user');
        const userObj = stored ? JSON.parse(stored) : null;
        if (!userObj || userObj.role !== 'admin') {
            // Redirect về trang chính sau 2 giây
            setTimeout(() => { window.location.href = '/AudioRecorder'; }, 2000);
            setRecords([]);
            setLoading(false);
            return;
        }

        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    useEffect(() => {
        const stored = localStorage.getItem('user');
        const userObj = stored ? JSON.parse(stored) : null;
        if (!userObj || userObj.role !== 'admin') return; // Đã xử lý ở trên

        const token = localStorage.getItem('token');
        axios.get(`${API_URL}/dashboard`, {
            headers: { Authorization: `Bearer ${token}` }
        }).then(res => {
            setRecords(res.data || []);
        }).catch(err => {
            console.error('Dashboard load error:', err);
        }).finally(() => setLoading(false));
    }, []);

    // ── Compute analytics ─────────────────────────────────────
    const analyzed = records.filter(r => r.insights);
    const avgScore = analyzed.length
        ? Math.round(analyzed.reduce((s, r) => s + (r.insights?.call_score || 0), 0) / analyzed.length)
        : 0;
    const highReadiness = analyzed.filter(r => r.insights?.readiness_to_buy === 'Cao').length;
    const sentimentCounts = analyzed.reduce((acc, r) => {
        const s = r.insights?.customer_sentiment || 'Khác';
        acc[s] = (acc[s] || 0) + 1;
        return acc;
    }, {});

    // collect all pain points across all records
    const allPains = analyzed.flatMap(r => r.insights?.pain_points || []);
    const painFreq = allPains.reduce((acc, p) => { acc[p] = (acc[p] || 0) + 1; return acc; }, {});
    const topPains = Object.entries(painFreq).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // collect all competitors
    const allCompetitors = analyzed.flatMap(r => r.insights?.competitors_mentioned || []).filter(c => c && c !== '');
    const compFreq = allCompetitors.reduce((acc, c) => { acc[c] = (acc[c] || 0) + 1; return acc; }, {});
    const topCompetitors = Object.entries(compFreq).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // ── Filter records ────────────────────────────────────────
    const filtered = records.filter(r => {
        if (filter === 'high' && r.insights?.readiness_to_buy !== 'Cao') return false;
        if (filter === 'low_score' && (r.insights?.call_score || 0) >= 70) return false;
        if (filter === 'no_insights' && r.insights) return false;
        if (searchDate && !r.created_at?.startsWith(searchDate)) return false;
        return true;
    });

    // ── Forbidden screen ──────────────────────────────────────
    const stored = localStorage.getItem('user');
    const currentUser = stored ? JSON.parse(stored) : null;
    if (!currentUser || currentUser.role !== 'admin') {
        return (
            <div style={{
                minHeight: '100vh', background: '#0f1117',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Inter, sans-serif', gap: '16px'
            }}>
                <div style={{ fontSize: '64px' }}>🔒</div>
                <h2 style={{ color: '#f1f5f9', fontSize: '24px', fontWeight: 800, margin: 0 }}>Không có quyền truy cập</h2>
                <p style={{ color: '#64748b', fontSize: '14px', margin: 0 }}>Chỉ Admin mới được xem Dashboard.</p>
                <p style={{ color: '#374151', fontSize: '12px' }}>Đang chuyển hướng về trang chính...</p>
            </div>
        );
    }

    if (loading) return (
        <div className="dash-loading">
            <div className="dash-spinner" />
            <p>Đang tải dữ liệu Dashboard...</p>
        </div>
    );

    return (
        <div className="dash-root">
            {/* ── HEADER ── */}
            <header className="dash-header">
                <div className="dash-header-left">
                    <button className="dash-back-btn" onClick={onBack}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="15 18 9 12 15 6" />
                        </svg>
                        Quay lại
                    </button>
                    <div>
                        <h1 className="dash-title">📊 Dashboard Phân Tích</h1>
                        <p className="dash-subtitle">Tổng quan chất lượng tư vấn & Insight khách hàng</p>
                    </div>
                </div>
                <div className="dash-header-right">
                    <span className="dash-badge">{records.length} cuộc gọi</span>
                    <span className="dash-badge analyzed">{analyzed.length} đã phân tích</span>
                </div>
            </header>

            {/* ── KPI CARDS ── */}
            <div className="dash-kpi-grid">
                <div className="dash-kpi-card blue">
                    <div className="kpi-icon">🎯</div>
                    <div className="kpi-value">{avgScore}</div>
                    <div className="kpi-label">Điểm TB Tư Vấn</div>
                    <div className="kpi-sub">/ 100 điểm</div>
                </div>
                <div className="dash-kpi-card green">
                    <div className="kpi-icon">🛒</div>
                    <div className="kpi-value">{highReadiness}</div>
                    <div className="kpi-label">Sẵn Sàng Mua Cao</div>
                    <div className="kpi-sub">trên {analyzed.length} KH phân tích</div>
                </div>
                <div className="dash-kpi-card purple">
                    <div className="kpi-icon">📞</div>
                    <div className="kpi-value">{records.length}</div>
                    <div className="kpi-label">Tổng Cuộc Gọi</div>
                    <div className="kpi-sub">trong hệ thống</div>
                </div>
                <div className="dash-kpi-card orange">
                    <div className="kpi-icon">😊</div>
                    <div className="kpi-value">{sentimentCounts['Tích cực'] || 0}</div>
                    <div className="kpi-label">KH Tích Cực</div>
                    <div className="kpi-sub">cảm xúc tốt</div>
                </div>
            </div>

            {/* ── ANALYTICS ROW ── */}
            <div className="dash-analytics-row">
                {/* Score distribution */}
                <div className="dash-card">
                    <h3 className="dash-card-title">📈 Phân Bố Điểm Chất Lượng</h3>
                    <div className="score-donut-row">
                        <DonutProgress value={analyzed.filter(r => (r.insights?.call_score||0) >= 80).length} max={analyzed.length || 1} color="#22c55e" label="Xuất sắc (≥80)" />
                        <DonutProgress value={analyzed.filter(r => { const s = r.insights?.call_score||0; return s >= 60 && s < 80; }).length} max={analyzed.length || 1} color="#f59e0b" label="Khá (60-79)" />
                        <DonutProgress value={analyzed.filter(r => (r.insights?.call_score||0) < 60).length} max={analyzed.length || 1} color="#ef4444" label="Cần cải thiện (<60)" />
                    </div>
                </div>

                {/* Sentiment pie */}
                <div className="dash-card">
                    <h3 className="dash-card-title">💬 Cảm Xúc Khách Hàng</h3>
                    <div className="sentiment-list">
                        {Object.entries(sentimentCounts).map(([s, count]) => (
                            <div key={s} className="sentiment-row">
                                <SentimentBadge sentiment={s} />
                                <div className="sentiment-bar-wrap">
                                    <div className="sentiment-bar-fill" style={{
                                        width: `${(count / (analyzed.length || 1)) * 100}%`,
                                        background: s === 'Tích cực' ? '#22c55e' : s === 'Hợp tác' ? '#818cf8' : s === 'Tiêu cực' ? '#ef4444' : '#f59e0b'
                                    }} />
                                </div>
                                <span className="sentiment-count">{count}</span>
                            </div>
                        ))}
                        {Object.keys(sentimentCounts).length === 0 && <p className="dash-empty">Chưa có dữ liệu cảm xúc</p>}
                    </div>
                </div>

                {/* Top pain points */}
                <div className="dash-card">
                    <h3 className="dash-card-title">🩺 Nỗi Đau Phổ Biến Nhất</h3>
                    <div className="pain-list">
                        {topPains.map(([pain, freq], idx) => (
                            <div key={idx} className="pain-item">
                                <span className="pain-rank">#{idx + 1}</span>
                                <span className="pain-text">{pain}</span>
                                <span className="pain-freq">{freq}x</span>
                            </div>
                        ))}
                        {topPains.length === 0 && <p className="dash-empty">Chưa có dữ liệu</p>}
                    </div>
                    {topCompetitors.length > 0 && (
                        <>
                            <h3 className="dash-card-title" style={{ marginTop: '16px' }}>🏢 Đối Thủ Được Nhắc</h3>
                            <div className="pain-list">
                                {topCompetitors.map(([comp, freq], idx) => (
                                    <div key={idx} className="pain-item">
                                        <span className="pain-rank" style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444' }}>🏷️</span>
                                        <span className="pain-text">{comp}</span>
                                        <span className="pain-freq" style={{ color: '#ef4444' }}>{freq}x</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* ── CALL TABLE ── */}
            <div className="dash-card dash-table-card">
                <div className="dash-table-header">
                    <h3 className="dash-card-title">📋 Danh Sách Cuộc Gọi</h3>
                    <div className="dash-filters">
                        <input type="date" className="dash-date-input" value={searchDate}
                            onChange={e => setSearchDate(e.target.value)}
                            title="Lọc theo ngày" />
                        <select className="dash-filter-select" value={filter} onChange={e => setFilter(e.target.value)}>
                            <option value="all">Tất cả</option>
                            <option value="high">Sẵn sàng mua cao</option>
                            <option value="low_score">Điểm thấp (&lt;70)</option>
                            <option value="no_insights">Chưa phân tích</option>
                        </select>
                        {(filter !== 'all' || searchDate) && (
                            <button className="dash-clear-btn" onClick={() => { setFilter('all'); setSearchDate(''); }}>✕ Xóa filter</button>
                        )}
                    </div>
                </div>

                <div className="dash-table-wrap">
                    <table className="dash-table">
                        <thead>
                            <tr>
                                <th>Ngày</th>
                                <th>File ghi âm</th>
                                <th>Điểm</th>
                                <th>Sẵn sàng mua</th>
                                <th>Cảm xúc</th>
                                <th>Nỗi đau</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length === 0 && (
                                <tr><td colSpan="7" className="dash-empty" style={{ textAlign: 'center', padding: '32px' }}>Không tìm thấy cuộc gọi nào</td></tr>
                            )}
                            {filtered.map((r, idx) => (
                                <tr key={r.id || idx} className={`dash-tr ${selectedRecord?.id === r.id ? 'active' : ''}`}
                                    onClick={() => setSelectedRecord(selectedRecord?.id === r.id ? null : r)}>
                                    <td className="dash-td-date">
                                        {r.created_at ? new Date(r.created_at).toLocaleDateString('vi-VN') : '—'}
                                    </td>
                                    <td className="dash-td-file">
                                        <span title={r.audioURL}>{r.audioURL?.substring(0, 30) || 'Không có tên'}...</span>
                                    </td>
                                    <td style={{ minWidth: '120px' }}>
                                        {r.insights?.call_score != null
                                            ? <ScoreBar score={r.insights.call_score} />
                                            : <span className="dash-empty">Chưa phân tích</span>}
                                    </td>
                                    <td>
                                        {r.insights?.readiness_to_buy
                                            ? <ReadinessBadge level={r.insights.readiness_to_buy} />
                                            : '—'}
                                    </td>
                                    <td>
                                        {r.insights?.customer_sentiment
                                            ? <SentimentBadge sentiment={r.insights.customer_sentiment} />
                                            : '—'}
                                    </td>
                                    <td className="dash-td-pains">
                                        {(r.insights?.pain_points || []).slice(0, 2).map((p, i) => (
                                            <span key={i} className="pain-tag">{p}</span>
                                        ))}
                                    </td>
                                    <td>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                                            style={{ transform: selectedRecord?.id === r.id ? 'rotate(180deg)' : 'none', transition: '0.2s', color: '#818cf8' }}>
                                            <polyline points="6 9 12 15 18 9" />
                                        </svg>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── DETAIL PANEL ── */}
            {selectedRecord && (
                <div className="dash-detail-panel">
                    <div className="dash-detail-header">
                        <h3>🔍 Chi Tiết Phân Tích</h3>
                        <button className="dash-close-btn" onClick={() => setSelectedRecord(null)}>✕</button>
                    </div>
                    <div className="dash-detail-body">
                        {selectedRecord.insights ? (
                            <div className="dash-detail-grid">
                                <div className="detail-block">
                                    <div className="detail-label">🎯 Điểm Chất Lượng</div>
                                    <div className="detail-score">{selectedRecord.insights.call_score}/100</div>
                                    <ScoreBar score={selectedRecord.insights.call_score} />
                                </div>
                                <div className="detail-block">
                                    <div className="detail-label">🛒 Sẵn Sàng Mua</div>
                                    <div style={{ marginTop: '8px' }}><ReadinessBadge level={selectedRecord.insights.readiness_to_buy} /></div>
                                </div>
                                <div className="detail-block">
                                    <div className="detail-label">💬 Cảm Xúc</div>
                                    <div style={{ marginTop: '8px' }}><SentimentBadge sentiment={selectedRecord.insights.customer_sentiment} /></div>
                                </div>
                                <div className="detail-block full-width">
                                    <div className="detail-label">🩺 Nỗi Đau Khách Hàng</div>
                                    <div className="detail-tags">
                                        {(selectedRecord.insights.pain_points || []).map((p, i) => (
                                            <span key={i} className="pain-tag">{p}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className="detail-block full-width">
                                    <div className="detail-label">💡 Nhu Cầu</div>
                                    <div className="detail-tags">
                                        {(selectedRecord.insights.needs || []).map((n, i) => (
                                            <span key={i} className="need-tag">{n}</span>
                                        ))}
                                    </div>
                                </div>
                                {(selectedRecord.insights.competitors_mentioned || []).length > 0 && (
                                    <div className="detail-block full-width">
                                        <div className="detail-label">🏢 Đối Thủ Được Nhắc Đến</div>
                                        <div className="detail-tags">
                                            {selectedRecord.insights.competitors_mentioned.map((c, i) => (
                                                <span key={i} className="comp-tag">{c}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <p className="dash-empty">Cuộc gọi này chưa được phân tích. Upload lại hoặc chạy backfill.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Dashboard;
