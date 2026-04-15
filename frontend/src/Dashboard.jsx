import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './Dashboard.css';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

/* ── Mini score bar ─────────────────────────────────────── */
const ScoreBar = ({ score }) => {
    const color = score >= 80 ? '#4ade80' : score >= 60 ? '#facc15' : '#f87171';
    return (
        <div className="score-bar-wrap">
            <div className="score-bar-track">
                <div className="score-bar-fill" style={{ width: `${score}%`, background: color }} />
            </div>
            <span className="score-bar-label" style={{ color }}>{score}</span>
        </div>
    );
};

/* ── Sentiment badge ────────────────────────────────────── */
const SentimentBadge = ({ sentiment }) => {
    const map = {
        'Tích cực':          { cls: 'badge-green',  icon: '😊' },
        'Hợp tác':           { cls: 'badge-indigo', icon: '🤝' },
        'Tiêu cực':          { cls: 'badge-red',    icon: '😠' },
        'Khá khó tính':      { cls: 'badge-yellow', icon: '😤' },
        'Tích cực và Hợp tác':{ cls: 'badge-green', icon: '😊' },
    };
    const s = map[sentiment] || { cls: 'badge-gray', icon: '❓' };
    return <span className={`badge ${s.cls}`}>{s.icon} {sentiment || 'Chưa rõ'}</span>;
};

/* ── Readiness badge ────────────────────────────────────── */
const ReadinessBadge = ({ level }) => {
    const map = { 'Cao': 'badge-green', 'Trung Bình': 'badge-yellow', 'Thấp': 'badge-red' };
    return <span className={`badge ${map[level] || 'badge-gray'}`}>🛒 {level || 'N/A'}</span>;
};

/* ── SVG Donut ──────────────────────────────────────────── */
const Donut = ({ value, total, color, label }) => {
    const pct = total > 0 ? Math.min((value / total) * 100, 100) : 0;
    const r = 26, c = 2 * Math.PI * r;
    const dash = (pct / 100) * c;
    return (
        <div className="donut-item">
            <div style={{ position: 'relative', width: 68, height: 68 }}>
                <svg viewBox="0 0 68 68" width="68" height="68" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="34" cy="34" r={r} fill="none"
                        stroke="#e2e8f0" strokeWidth="7" />
                    <circle cx="34" cy="34" r={r} fill="none"
                        stroke={color} strokeWidth="7"
                        strokeDasharray={`${dash} ${c}`}
                        strokeLinecap="round"
                        style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4,0,0.2,1)' }} />
                </svg>
                <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                    <span className="donut-value-center" style={{ color }}>{value}</span>
                </div>
            </div>
            <span className="donut-label">{label}</span>
        </div>
    );
};

/* ── Trend Svg ──────────────────────────────────────────── */
const TrendSvg = ({ data }) => {
    if (data.length === 0) return <p className="dash-empty">Không có dữ liệu xu hướng</p>;
    if (data.length === 1) return <div style={{textAlign:'center', marginTop:30}}><span style={{fontSize:24, fontWeight:'bold', color:'#6366f1'}}>{data[0].val}</span><br/><span style={{fontSize:12, color:'#94a3b8'}}>{data[0].label}</span></div>;
    
    const w = 300, h = 100, padX = 20, padY = 20, max = 100, min = 0;
    const getX = i => padX + (i / (data.length - 1)) * (w - padX * 2);
    const getY = v => h - padY - ((v - min) / (max - min)) * (h - padY * 2);
    const pts = data.map((d, i) => `${getX(i)},${getY(d.val)}`).join(' ');

    return (
        <svg viewBox={`0 0 ${w} ${h}`} style={{ width:'100%', height:'auto', minHeight:'100px', display:'block' }}>
            <polyline points={pts} fill="none" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            {data.map((d, i) => (
                <g key={i}>
                    <circle cx={getX(i)} cy={getY(d.val)} r="4" fill="#fff" stroke="#6366f1" strokeWidth="2" />
                    <text x={getX(i)} y={getY(d.val) - 8} fontSize="10" fill="#475569" textAnchor="middle">{d.val}</text>
                    {(i === 0 || i === data.length - 1 || data.length < 6) && (
                        <text x={getX(i)} y={h - 2} fontSize="9" fill="#94a3b8" textAnchor="middle">{d.label}</text>
                    )}
                </g>
            ))}
        </svg>
    );
};

/* ═══ MAIN DASHBOARD ═══════════════════════════════════════ */
const Dashboard = ({ onBack }) => {
    const [records,        setRecords]        = useState([]);
    const [loading,        setLoading]        = useState(true);
    const [filter,         setFilter]         = useState('all');
    const [searchDate,     setSearchDate]     = useState('');
    const [searchName,     setSearchName]     = useState('');
    const [selectedRecord, setSelectedRecord] = useState(null);
    const [exportingSheet, setExportingSheet] = useState(false);
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportDateFrom,  setExportDateFrom]  = useState('');
    const [exportDateTo,    setExportDateTo]    = useState('');
    const [exportEmployee,  setExportEmployee]  = useState('');

    /* ── Admin guard ── */
    const stored     = localStorage.getItem('user');
    const currentUser = stored ? JSON.parse(stored) : null;

    useEffect(() => {
        if (!currentUser || currentUser.role !== 'admin') {
            setTimeout(() => { window.location.href = '/AudioRecorder'; }, 2000);
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!currentUser || currentUser.role !== 'admin') return;
        const token = localStorage.getItem('token');
        
        const fetchData = () => {
            axios.get(`${API_URL}/dashboard`, { headers: { Authorization: `Bearer ${token}` } })
                .then(r => setRecords(r.data || []))
                .catch(console.error)
                .finally(() => setLoading(false));
        };

        // Fetch immediately
        fetchData();

        // ── AUTO REFRESH (Real-time polling) ──
        // Refresh API every 5 seconds only when tab is active
        const interval = setInterval(() => {
            if (!document.hidden) {
                fetchData();
            }
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    /* ── Forbidden ── */
    if (!currentUser || currentUser.role !== 'admin') {
        return (
            <div style={{
                minHeight: '100vh', background: '#f8fafc',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Inter, sans-serif', gap: '14px'
            }}>
                <div style={{ fontSize: '56px' }}>🔒</div>
                <h2 style={{ color: '#0f172a', fontSize: '22px', fontWeight: 800 }}>Không có quyền truy cập</h2>
                <p style={{ color: '#475569', fontSize: '13px' }}>Chỉ Admin mới được xem Dashboard.</p>
                <p style={{ color: '#94a3b8', fontSize: '12px' }}>Đang chuyển hướng về trang chính...</p>
            </div>
        );
    }

    /* ── Loading ── */
    if (loading) return (
        <div className="dash-loading">
            <div className="dash-spinner" />
            <p style={{ color: '#475569', fontSize: '13px' }}>Đang tải dữ liệu...</p>
        </div>
    );

    /* ── Analytics compute ── */
    const analyzed   = records.filter(r => r.insights);
    const n          = analyzed.length || 1;
    const avgScore   = analyzed.length
        ? Math.round(analyzed.reduce((s, r) => s + (r.insights?.call_score || 0), 0) / analyzed.length)
        : 0;
    const highReady  = analyzed.filter(r => r.insights?.readiness_to_buy === 'Cao').length;
    const positive   = analyzed.filter(r => ['Tích cực','Tích cực và Hợp tác'].includes(r.insights?.customer_sentiment)).length;

    const sentimentMap = analyzed.reduce((a, r) => {
        const s = r.insights?.customer_sentiment || 'Khác';
        a[s] = (a[s] || 0) + 1; return a;
    }, {});

    const allPains  = analyzed.flatMap(r => r.insights?.pain_points || []);
    const painFreq  = allPains.reduce((a, p) => { a[p] = (a[p]||0)+1; return a; }, {});
    const topPains  = Object.entries(painFreq).sort((a,b)=>b[1]-a[1]).slice(0,5);

    const allComps  = analyzed.flatMap(r => r.insights?.competitors_mentioned || []).filter(Boolean);
    const compFreq  = allComps.reduce((a, c) => { a[c] = (a[c]||0)+1; return a; }, {});
    const topComps  = Object.entries(compFreq).sort((a,b)=>b[1]-a[1]).slice(0,4);

    const excellent = analyzed.filter(r => (r.insights?.call_score||0) >= 80).length;
    const good      = analyzed.filter(r => { const s=r.insights?.call_score||0; return s>=60&&s<80; }).length;
    const poor      = analyzed.filter(r => (r.insights?.call_score||0) < 60 && r.insights).length;

    /* ── Filtered list ── */
    const filtered = records.filter(r => {
        if (filter === 'high'       && r.insights?.readiness_to_buy !== 'Cao') return false;
        if (filter === 'low_score'  && (r.insights?.call_score||0) >= 70)       return false;
        if (filter === 'no_insights'&& r.insights)                               return false;
        if (searchDate && !r.created_at?.startsWith(searchDate))                 return false;
        if (searchName) {
            const term = searchName.toLowerCase();
            const fileName = (r.audioURL || '').toLowerCase();
            const empName = (r.employee_name || '').toLowerCase();
            if (!fileName.includes(term) && !empName.includes(term)) return false;
        }
        return true;
    });

    /* ── Trend Data ── */
    const trendMap = {};
    [...analyzed].sort((a,b) => new Date(a.created_at) - new Date(b.created_at)).forEach(r => {
        const d = new Date(r.created_at).toLocaleDateString('vi-VN', { month:'2-digit', day:'2-digit' });
        if (!trendMap[d]) trendMap[d] = { sum: 0, count: 0 };
        trendMap[d].sum += (r.insights?.call_score || 0);
        trendMap[d].count += 1;
    });
    const trendData = Object.keys(trendMap).map(l => ({ label: l, val: Math.round(trendMap[l].sum / trendMap[l].count) }));

    const exportCSV = () => {
        const headers = ["Ngày", "Nhân viên", "File Khách Hàng", "Điểm", "Sẵn sàng mua", "Cảm xúc", "Nỗi đau"];
        const rows = filtered.map(r => {
            const date = r.created_at ? new Date(r.created_at).toLocaleDateString('vi-VN') : '';
            const emp = r.employee_name || 'N/A';
            const file = r.audioURL || 'N/A';
            const score = r.insights?.call_score || '';
            const ready = r.insights?.readiness_to_buy || '';
            const sent = r.insights?.customer_sentiment || '';
            const pains = (r.insights?.pain_points || []).join('; ');
            return [date, emp, file, score, ready, sent, pains].map(v => `"${v}"`).join(',');
        });
        const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + [headers.join(','), ...rows].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `baocao_cuocgoi.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Lấy danh sách nhân viên duy nhất từ records
    const employeeList = [...new Set(records.map(r => r.employee_name).filter(Boolean))];

    const exportToGoogleSheets = async () => {
        if (!currentUser || currentUser.role !== 'admin') {
            alert("Chỉ Quản trị viên mới có quyền đẩy dữ liệu lên Google Sheets.");
            return;
        }

        // Lọc data dựa theo lựa chọn trong modal
        let exportRows = [...records];
        if (exportDateFrom) {
            exportRows = exportRows.filter(r => r.created_at && new Date(r.created_at) >= new Date(exportDateFrom));
        }
        if (exportDateTo) {
            const end = new Date(exportDateTo);
            end.setHours(23, 59, 59, 999);
            exportRows = exportRows.filter(r => r.created_at && new Date(r.created_at) <= end);
        }
        if (exportEmployee) {
            exportRows = exportRows.filter(r => r.employee_name === exportEmployee);
        }

        if (exportRows.length === 0) {
            alert("Không có dữ liệu phù hợp với bộ lọc bạn chọn.");
            return;
        }

        // Tạo tên Tab Sheet
        let exportName = '';
        if (exportEmployee) exportName += exportEmployee + ' ';
        if (exportDateFrom && exportDateTo) exportName += `${exportDateFrom} đến ${exportDateTo}`;
        else if (exportDateFrom) exportName += `từ ${exportDateFrom}`;
        else if (exportDateTo) exportName += `đến ${exportDateTo}`;
        if (!exportName.trim()) exportName = 'Tổng Hợp';

        try {
            setShowExportModal(false);
            setExportingSheet(true);
            const token = localStorage.getItem('token');
            const rowsPayload = exportRows.map(r => ({
                date: r.created_at ? new Date(r.created_at).toLocaleDateString('vi-VN') : '',
                employeeName: r.employee_name || 'N/A',
                fileName: r.audioURL || 'N/A',
                id: r.id || '',
                score: r.insights?.call_score || '',
                readiness: r.insights?.readiness_to_buy || '',
                sentiment: r.insights?.customer_sentiment || '',
                pains: (r.insights?.pain_points || []).join('; ')
            }));

            const res = await axios.post(`${API_URL}/export-sheets`,
                { rows: rowsPayload, exportName: exportName.trim() },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (window.confirm(`${res.data.message} (${exportRows.length} dòng)\n\nMở Google Sheets ngay không?`)) {
                window.open(res.data.sheetUrl, '_blank');
            }
        } catch (err) {
            console.error(err);
            alert("Lỗi xuất Google Sheets: " + (err.response?.data?.message || err.message));
        } finally {
            setExportingSheet(false);
        }
    };

    /* ── Sentiment color helper ── */
    const sentColor = s => ({
        'Tích cực':'#4ade80','Tích cực và Hợp tác':'#4ade80',
        'Hợp tác':'#818cf8','Tiêu cực':'#f87171','Khá khó tính':'#facc15'
    }[s] || '#475569');

    return (
        <div className="dash-root">

            {/* ══ HEADER ══════════════════════════════════════ */}
            <header className="dash-header">
                <div className="dash-header-left">
                    <button className="dash-back-btn" onClick={onBack}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="15 18 9 12 15 6"/>
                        </svg>
                        Quay lại
                    </button>
                    <div>
                        <div className="dash-title">📊 Dashboard Phân Tích</div>
                        <div className="dash-subtitle">Tổng quan chất lượng tư vấn &amp; Insight khách hàng</div>
                    </div>
                </div>
                <div className="dash-header-right" style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <button className="dash-back-btn" disabled={exportingSheet}
                        style={{ background: '#059669', color: 'white', border: 'none', padding: '6px 14px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600, fontSize: '13px', boxShadow: '0 2px 4px rgba(5,150,105,0.2)' }}
                        onClick={() => setShowExportModal(true)}>
                        {exportingSheet ? 'Đang xuất dữ liệu...' : 'Xuất Báo Cáo'}
                    </button>
                    <span className="dash-badge">{records.length} cuộc gọi</span>
                    <span className="dash-badge analyzed">{analyzed.length} đã phân tích</span>
                </div>
            </header>

            {/* ══ EXPORT MODAL ════════════════════════════════ */}
            {showExportModal && (
                <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.45)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <div style={{ background:'#fff', borderRadius:'12px', padding:'32px', width:'420px', boxShadow:'0 20px 60px rgba(0,0,0,0.2)', fontFamily:'Inter, sans-serif' }}>
                        <div style={{ fontSize:'16px', fontWeight:700, color:'#0f172a', marginBottom:'6px' }}>Xuất Báo Cáo lên Google Sheets</div>
                        <div style={{ fontSize:'13px', color:'#64748b', marginBottom:'24px' }}>Chọn khoảng thời gian và nhân viên cần xuất</div>

                        <div style={{ marginBottom:'14px' }}>
                            <label style={{ fontSize:'12px', fontWeight:600, color:'#475569', display:'block', marginBottom:'6px' }}>Từ ngày</label>
                            <input type="date" value={exportDateFrom} onChange={e => setExportDateFrom(e.target.value)}
                                style={{ width:'100%', padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'13px', boxSizing:'border-box' }} />
                        </div>

                        <div style={{ marginBottom:'14px' }}>
                            <label style={{ fontSize:'12px', fontWeight:600, color:'#475569', display:'block', marginBottom:'6px' }}>Đến ngày</label>
                            <input type="date" value={exportDateTo} onChange={e => setExportDateTo(e.target.value)}
                                style={{ width:'100%', padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'13px', boxSizing:'border-box' }} />
                        </div>

                        <div style={{ marginBottom:'24px' }}>
                            <label style={{ fontSize:'12px', fontWeight:600, color:'#475569', display:'block', marginBottom:'6px' }}>Nhân viên</label>
                            <select value={exportEmployee} onChange={e => setExportEmployee(e.target.value)}
                                style={{ width:'100%', padding:'8px 10px', border:'1px solid #e2e8f0', borderRadius:'6px', fontSize:'13px', background:'#fff', boxSizing:'border-box' }}>
                                <option value="">-- Tất cả nhân viên --</option>
                                {employeeList.map(emp => <option key={emp} value={emp}>{emp}</option>)}
                            </select>
                        </div>

                        <div style={{ display:'flex', gap:'10px', justifyContent:'flex-end' }}>
                            <button onClick={() => setShowExportModal(false)}
                                style={{ padding:'8px 16px', borderRadius:'6px', border:'1px solid #e2e8f0', background:'#f8fafc', color:'#475569', fontWeight:600, fontSize:'13px', cursor:'pointer' }}>
                                Huỷ
                            </button>
                            <button onClick={exportToGoogleSheets} disabled={exportingSheet}
                                style={{ padding:'8px 16px', borderRadius:'6px', border:'none', background:'#059669', color:'white', fontWeight:600, fontSize:'13px', cursor:'pointer' }}>
                                Xác nhận Xuất
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <div className="dash-body">

                {/* ══ KPI ═════════════════════════════════════ */}
                <div className="dash-kpi-grid">
                    {[
                        { cls:'blue',   icon:'🎯', label:'Điểm TB Tư Vấn',    val:avgScore, sub:'/ 100 điểm' },
                        { cls:'green',  icon:'🛒', label:'Sẵn Sàng Mua Cao',  val:highReady,sub:`trên ${analyzed.length} KH phân tích` },
                        { cls:'purple', icon:'📞', label:'Tổng Cuộc Gọi',     val:records.length, sub:'trong hệ thống' },
                        { cls:'orange', icon:'😊', label:'KH Tích Cực',       val:positive, sub:'cảm xúc tốt' },
                    ].map(({ cls, icon, label, val, sub }) => (
                        <div key={label} className={`dash-kpi-card ${cls}`}>
                            <div className="kpi-top-row">
                                <span className="kpi-label">{label}</span>
                                <span className="kpi-icon-wrap">{icon}</span>
                            </div>
                            <div className="kpi-value">{val}</div>
                            <div className="kpi-sub">{sub}</div>
                        </div>
                    ))}
                </div>

                {/* ══ ANALYTICS ROW ═══════════════════════════ */}
                <div className="dash-analytics-row">

                    {/* Score distribution */}
                    <div className="dash-card">
                        <div className="dash-card-title">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                            Phân bố điểm chất lượng
                        </div>
                        <div className="score-donut-row">
                            <Donut value={excellent} total={analyzed.length} color="#4ade80" label={`Xuất sắc (≥80)`} />
                            <Donut value={good}      total={analyzed.length} color="#facc15" label={`Khá (60–79)`} />
                            <Donut value={poor}      total={analyzed.length} color="#f87171" label={`Cần cải thiện`} />
                        </div>
                    </div>

                    {/* Trend Chart */}
                    <div className="dash-card">
                        <div className="dash-card-title">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                            Xu hướng điểm TB
                        </div>
                        <div style={{ paddingTop: '10px' }}>
                            <TrendSvg data={trendData} />
                        </div>
                    </div>

                    {/* Sentiment */}
                    <div className="dash-card">
                        <div className="dash-card-title">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
                            Cảm xúc khách hàng
                        </div>
                        <div className="sentiment-list">
                            {Object.entries(sentimentMap).sort((a,b)=>b[1]-a[1]).map(([s, cnt]) => (
                                <div key={s} className="sentiment-row">
                                    <span className="sentiment-name">{s}</span>
                                    <div className="sentiment-bar-wrap">
                                        <div className="sentiment-bar-fill"
                                            style={{ width:`${(cnt/n)*100}%`, background: sentColor(s) }} />
                                    </div>
                                    <span className="sentiment-count">{cnt}</span>
                                </div>
                            ))}
                            {Object.keys(sentimentMap).length === 0 &&
                                <p className="dash-empty">Chưa có dữ liệu</p>}
                        </div>
                    </div>

                    {/* Pain points & Competitors */}
                    <div className="dash-card">
                        <div className="dash-card-title">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                            Nỗi đau phổ biến
                        </div>
                        <div className="pain-list">
                            {topPains.map(([pain, freq], idx) => (
                                <div key={idx} className="pain-item">
                                    <span className="pain-rank">#{idx+1}</span>
                                    <span className="pain-text">{pain}</span>
                                    <span className="pain-freq">{freq}x</span>
                                </div>
                            ))}
                            {topPains.length === 0 && <p className="dash-empty">Chưa có dữ liệu</p>}
                        </div>

                        {topComps.length > 0 && (
                            <>
                                <div className="dash-section-divider" style={{ margin: '14px 0 12px' }} />
                                <div className="dash-card-title">
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
                                    Đối thủ được nhắc
                                </div>
                                <div className="pain-list">
                                    {topComps.map(([comp, freq], idx) => (
                                        <div key={idx} className="pain-item">
                                            <span className="pain-rank" style={{ background:'rgba(245,158,11,0.1)', color:'#fcd34d' }}>🏷</span>
                                            <span className="pain-text">{comp}</span>
                                            <span className="pain-freq" style={{ color:'#fcd34d' }}>{freq}x</span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* ══ CALL TABLE ══════════════════════════════ */}
                <div className="dash-card dash-table-card">
                    <div className="dash-table-header">
                        <div className="dash-card-title" style={{ margin:0 }}>
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#475569" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                            Danh sách cuộc gọi
                        </div>
                        <div className="dash-filters">
                            <input type="text" className="dash-date-input" placeholder="Tìm theo tên KH/nhân viên..." value={searchName}
                                onChange={e => setSearchName(e.target.value)} style={{ minWidth:'180px' }} />
                            <input type="date" className="dash-date-input" value={searchDate}
                                onChange={e => setSearchDate(e.target.value)} />
                            <select className="dash-filter-select" value={filter} onChange={e => setFilter(e.target.value)}>
                                <option value="all">Tất cả</option>
                                <option value="high">Sẵn sàng mua cao</option>
                                <option value="low_score">Điểm thấp (&lt;70)</option>
                                <option value="no_insights">Chưa phân tích</option>
                            </select>
                            {(filter !== 'all' || searchDate || searchName) && (
                                <button className="dash-clear-btn" onClick={() => { setFilter('all'); setSearchDate(''); setSearchName(''); }}>
                                    ✕ Xóa filter
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="dash-table-wrap">
                        <table className="dash-table">
                            <thead>
                                <tr>
                                    <th>Ngày</th>
                                    <th>Nhân viên</th>
                                    <th>File KH</th>
                                    <th>Điểm</th>
                                    <th>Sẵn sàng mua</th>
                                    <th>Cảm xúc</th>
                                    <th>Nỗi đau</th>
                                    <th></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.length === 0 && (
                                    <tr><td colSpan="7" className="dash-empty" style={{ padding:'28px', textAlign:'center' }}>
                                        Không tìm thấy cuộc gọi nào
                                    </td></tr>
                                )}
                                {filtered.map((r, idx) => (
                                    <tr key={r.id || idx}
                                        className={`dash-tr ${selectedRecord?.id === r.id ? 'active' : ''}`}
                                        onClick={() => setSelectedRecord(selectedRecord?.id === r.id ? null : r)}>
                                        <td className="dash-td-date">
                                            {r.created_at ? new Date(r.created_at).toLocaleDateString('vi-VN') : '—'}
                                        </td>
                                        <td style={{ fontSize:'13px', fontWeight:500, color:'#0f172a' }}>
                                            {r.employee_name || 'N/A'}
                                        </td>
                                        <td className="dash-td-file" title={r.audioURL}>
                                            {(r.audioURL || 'N/A').substring(0, 28)}…
                                        </td>
                                        <td style={{ minWidth: 110 }}>
                                            {r.insights?.call_score != null
                                                ? <ScoreBar score={r.insights.call_score} />
                                                : <span className="dash-empty">—</span>}
                                        </td>
                                        <td>{r.insights?.readiness_to_buy
                                            ? <ReadinessBadge level={r.insights.readiness_to_buy} />
                                            : <span className="dash-empty">—</span>}</td>
                                        <td>{r.insights?.customer_sentiment
                                            ? <SentimentBadge sentiment={r.insights.customer_sentiment} />
                                            : <span className="dash-empty">—</span>}</td>
                                        <td className="dash-td-pains">
                                            {(r.insights?.pain_points || []).slice(0,2).map((p,i) => (
                                                <span key={i} className="pain-tag">{p}</span>
                                            ))}
                                        </td>
                                        <td>
                                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#334155" strokeWidth="2"
                                                style={{ transform: selectedRecord?.id === r.id ? 'rotate(180deg)':'none', transition:'0.2s' }}>
                                                <polyline points="6 9 12 15 18 9"/>
                                            </svg>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* ══ DETAIL PANEL ════════════════════════════ */}
                {selectedRecord && (
                    <div className="dash-detail-panel">
                        <div className="dash-detail-header">
                            <h3>🔍 Chi tiết phân tích</h3>
                            <button className="dash-close-btn" onClick={() => setSelectedRecord(null)}>✕</button>
                        </div>
                        <div className="dash-detail-body">
                            {selectedRecord.insights ? (
                                <div className="dash-detail-grid">
                                    <div className="detail-block">
                                        <div className="detail-label">🎯 Điểm chất lượng</div>
                                        <div className="detail-score">{selectedRecord.insights.call_score}<span style={{ fontSize:'14px', color:'#334155' }}>/100</span></div>
                                        <ScoreBar score={selectedRecord.insights.call_score} />
                                    </div>
                                    <div className="detail-block">
                                        <div className="detail-label">🛒 Sẵn sàng mua</div>
                                        <div style={{ marginTop:'10px' }}>
                                            <ReadinessBadge level={selectedRecord.insights.readiness_to_buy} />
                                        </div>
                                    </div>
                                    <div className="detail-block">
                                        <div className="detail-label">💬 Cảm xúc KH</div>
                                        <div style={{ marginTop:'10px' }}>
                                            <SentimentBadge sentiment={selectedRecord.insights.customer_sentiment} />
                                        </div>
                                    </div>
                                    <div className="detail-block full-width">
                                        <div className="detail-label">🩺 Nỗi đau khách hàng</div>
                                        <div className="detail-tags">
                                            {(selectedRecord.insights.pain_points || []).map((p,i) =>
                                                <span key={i} className="pain-tag">{p}</span>)}
                                        </div>
                                    </div>
                                    <div className="detail-block full-width">
                                        <div className="detail-label">💡 Nhu cầu</div>
                                        <div className="detail-tags">
                                            {(selectedRecord.insights.needs || []).map((n,i) =>
                                                <span key={i} className="need-tag">{n}</span>)}
                                        </div>
                                    </div>
                                    {(selectedRecord.insights.competitors_mentioned || []).filter(Boolean).length > 0 && (
                                        <div className="detail-block full-width">
                                            <div className="detail-label">🏢 Đối thủ được nhắc</div>
                                            <div className="detail-tags">
                                                {selectedRecord.insights.competitors_mentioned.map((c,i) =>
                                                    <span key={i} className="comp-tag">{c}</span>)}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <p className="dash-empty">Cuộc gọi này chưa được phân tích.</p>
                            )}
                        </div>
                    </div>
                )}

            </div>{/* end dash-body */}
        </div>
    );
};

export default Dashboard;
