import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  IconAnalyze, IconHome, IconHistory, IconCustomers, IconSparkles,
  IconQuality, IconOpportunity, IconCompliance, IconMemory,
  IconDashboard, IconCoach, IconComplianceQ, IconDraft,
  IconUpload, IconSearch, IconFilter, IconChevronDown, IconChevronUp,
  IconCheck, IconArrowRight, IconPlay, IconMic, IconBook,
  IconChat, IconTarget, IconActivity, IconPill, IconHeart,
  IconTrendUp, IconStar, IconLightbulb, IconAlert, IconInfo,
  IconSettings, IconCustomer, IconHeadphones, IconDatabase, IconWorkflow,
  IconRefresh
} from './icons';
import './UserGuide.css';

/* ── one expandable section (controlled) ─────────────── */
function Section({ id, icon, title, subtitle, children, isOpen, onToggle }) {
  return (
    <div className={`ug-section ${isOpen ? 'open' : ''}`} id={id}>
      <button className="ug-section-head" onClick={onToggle}>
        <span className="ug-section-icon">{icon}</span>
        <div className="ug-section-text">
          <b>{title}</b>
          <small>{subtitle}</small>
        </div>
        <span className="ug-section-chevron">{isOpen ? <IconChevronUp size={18}/> : <IconChevronDown size={18}/>}</span>
      </button>
      {isOpen && <div className="ug-section-body">{children}</div>}
    </div>
  );
}

function Step({ n, children }) {
  return <div className="ug-step"><span className="ug-step-n">{n}</span><div>{children}</div></div>;
}

function Tip({ children }) {
  return <div className="ug-tip"><IconLightbulb size={15}/> <span>{children}</span></div>;
}

function Warning({ children }) {
  return <div className="ug-warn"><IconAlert size={15}/> <span>{children}</span></div>;
}

function Badge({ tone = 'indigo', children }) {
  return <span className={`ug-badge ug-badge-${tone}`}>{children}</span>;
}

// Inline icon helper for h4/h5 inside section body
function H({ icon, children }) {
  return (
    <span className="ug-h-icon"><span>{icon}</span> {children}</span>
  );
}

function FeatureCard({ icon, title, desc, to }) {
  return (
    <Link to={to} className="ug-fcard">
      <span className="ug-fcard-icon">{icon}</span>
      <b>{title}</b>
      <small>{desc}</small>
      <IconArrowRight size={14} className="ug-fcard-arrow"/>
    </Link>
  );
}

/* ── MAIN ─────────────────────────────────────────────── */
export default function UserGuide() {
  const [activeSection, setActiveSection] = useState('overview');
  const [openSections, setOpenSections] = useState(() => new Set(['overview']));

  const isOpen = (id) => openSections.has(id);
  const toggle = (id) => setOpenSections(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const openSection = (id) => setOpenSections(prev => new Set(prev).add(id));

  const TOC = [
    { id: 'overview',     label: 'Tổng quan' },
    { id: 'whats-new',    label: 'Nhật ký cập nhật', badge: 'v2.3' },
    { id: 'analyze',      label: 'Phân tích cuộc gọi' },
    { id: 'audio',        label: 'Nghe lại audio' },
    { id: 'results',      label: 'Xem kết quả phân tích' },
    { id: 'history',      label: 'Lịch sử phân tích' },
    { id: 'customers',    label: 'Quản lý khách hàng' },
    { id: 'agent',        label: 'Agent AI (3 modes)' },
    { id: 'rbac',         label: 'Phân quyền & Vai trò', badge: 'NEW' },
    { id: 'settings',     label: 'Cài đặt tài khoản', badge: 'NEW' },
    { id: 'usermgmt',     label: 'Quản lý người dùng', badge: 'NEW' },
    { id: 'skills',       label: 'Kỹ năng AI' },
    { id: 'management',   label: 'Quản lý & Coaching' },
    { id: 'notes',        label: 'Ghi chú' },
    { id: 'tech-stack',   label: 'Công nghệ AI bên trong' },
    { id: 'mobile',       label: 'Sử dụng trên Mobile' },
    { id: 'faq',          label: 'Câu hỏi thường gặp' },
  ];

  const scrollTo = (id) => {
    openSection(id); // auto-expand on tab click
    // wait one tick for expansion to render before scrolling
    requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  // Scroll-spy for TOC highlighting
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(e => {
          if (e.isIntersecting) setActiveSection(e.target.id);
        });
      },
      { rootMargin: '-30% 0px -60% 0px' }
    );
    TOC.forEach(t => {
      const el = document.getElementById(t.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <div className="ug-root">
      {/* Hero */}
      <div className="ug-hero">
        <div className="ug-hero-icon"><IconBook size={32}/></div>
        <h1>Hướng dẫn sử dụng</h1>
        <p>PharmaVoice — Trợ lý AI phân tích cuộc gọi bán hàng dược phẩm</p>
        <div className="ug-hero-meta">
          <span><IconDatabase size={12}/> v2.3 · Claude + Groq Stack</span>
          <span><IconWorkflow size={12}/> 9 modules · 8 permissions · 3 chat modes</span>
        </div>
      </div>

      {/* Quick nav cards */}
      <div className="ug-quick-nav">
        <h3>Truy cập nhanh</h3>
        <div className="ug-fcards">
          <FeatureCard icon={<IconAnalyze size={20}/>} title="Phân tích cuộc gọi" desc="Upload & AI phân tích tự động" to="/"/>
          <FeatureCard icon={<IconSparkles size={20}/>} title="Agent AI" desc="Hỏi đáp thông minh" to="#"/>
          <FeatureCard icon={<IconCustomers size={20}/>} title="Khách hàng" desc="Hồ sơ & trí nhớ KH" to="/customers"/>
          <FeatureCard icon={<IconHistory size={20}/>} title="Lịch sử" desc="Tra cứu cuộc gọi cũ" to="/history"/>
          <FeatureCard icon={<IconSettings size={20}/>} title="Cài đặt" desc="Đổi info, mật khẩu, avatar" to="/settings"/>
          <FeatureCard icon={<IconDraft size={20}/>} title="Ghi chú" desc="Task & follow-up" to="/my/drafts"/>
        </div>
      </div>

      {/* Horizontal sticky TOC tabs */}
      <nav className="ug-toc-tabs">
        <div className="ug-toc-tabs-inner">
          {TOC.map((t, i) => (
            <button
              key={t.id}
              className={`ug-toc-tab ${activeSection === t.id ? 'active' : ''}`}
              onClick={() => scrollTo(t.id)}
            >
              <span className="ug-toc-n">{String(i + 1).padStart(2, '0')}</span>
              <span className="ug-toc-label">{t.label}</span>
              {t.badge && <span className="ug-toc-badge">{t.badge}</span>}
            </button>
          ))}
        </div>
      </nav>

      {/* Content full-width */}
      <div className="ug-layout">
        <div className="ug-content">

          {/* ── 1. OVERVIEW ─────────────────────── */}
          <Section id="overview" isOpen={isOpen('overview')} onToggle={() => toggle('overview')} icon={<IconInfo size={20}/>} title="Tổng quan hệ thống" subtitle="PharmaVoice là gì và có gì đặc biệt">
            <p>
              <b>PharmaVoice</b> là nền tảng AI phân tích cuộc gọi bán hàng dược phẩm, biến mỗi cuộc điện thoại
              thành dữ liệu hành động: chấm điểm chất lượng, phát hiện cơ hội bán hàng, kiểm tra tuân thủ, ghi nhớ
              khách hàng — tự động trong vài phút.
            </p>

            <h4>Giá trị mang lại</h4>
            <ul>
              <li><b>Phân tích tự động 100% cuộc gọi</b> — không cần QA review thủ công</li>
              <li><b>Chấm điểm rubric 9 tiêu chí</b> — feedback chi tiết với evidence + timestamp</li>
              <li><b>Phát hiện cơ hội bán hàng</b> — buying signals + giai đoạn bán + giá trị ước tính</li>
              <li><b>Kiểm tra tuân thủ tự động</b> — phát hiện vi phạm Luật Quảng cáo Dược phẩm VN</li>
              <li><b>Trí nhớ khách hàng</b> — RAG semantic search trên toàn bộ lịch sử KH</li>
              <li><b>Agent AI thông minh</b> — 3 chế độ hỏi đáp dựa trên ngữ cảnh thực tế</li>
              <li><b>Phân quyền chi tiết</b> — Admin cấp 8 capability cho từng staff</li>
            </ul>

            <h4>9 module chính</h4>
            <div className="ug-module-grid">
              <div className="ug-mod"><IconAnalyze size={18}/> <b>Phân tích cuộc gọi</b><br/><small>Upload & AI phân tích real-time</small></div>
              <div className="ug-mod"><IconHome size={18}/> <b>Dashboard Hôm nay</b><br/><small>Tổng hợp hiệu suất hàng ngày</small></div>
              <div className="ug-mod"><IconHistory size={18}/> <b>Lịch sử phân tích</b><br/><small>Tra cứu toàn bộ cuộc gọi</small></div>
              <div className="ug-mod"><IconCustomers size={18}/> <b>Quản lý khách hàng</b><br/><small>CRM + trí nhớ AI</small></div>
              <div className="ug-mod"><IconSparkles size={18}/> <b>Agent AI</b><br/><small>Trợ lý hỏi đáp thông minh</small></div>
              <div className="ug-mod"><IconDashboard size={18}/> <b>Bảng điều khiển</b><br/><small>Phân tích hiệu suất đội ngũ</small></div>
              <div className="ug-mod"><IconCoach size={18}/> <b>Huấn luyện viên</b><br/><small>AI coaching cá nhân hóa</small></div>
              <div className="ug-mod"><IconDraft size={18}/> <b>Ghi chú</b><br/><small>Quản lý task & follow-up</small></div>
              <div className="ug-mod"><IconSettings size={18}/> <b>Cài đặt</b><br/><small>Profile, mật khẩu, quyền</small></div>
            </div>
          </Section>

          {/* ── 2. WHAT'S NEW — visual changelog ─────────────────────── */}
          <Section id="whats-new" isOpen={isOpen('whats-new')} onToggle={() => toggle('whats-new')} icon={<IconStar size={20}/>} title="Nhật ký cập nhật" subtitle="Lịch sử các phiên bản — mới nhất ở trên cùng">

            <div className="ug-changelog">

              {/* ── Release v2.3 (current) ─────── */}
              <article className="ug-release ug-release-current">
                <header className="ug-release-head">
                  <div className="ug-release-version-block">
                    <span className="ug-release-version">v2.3</span>
                    <span className="ug-release-flag">MỚI NHẤT</span>
                  </div>
                  <div className="ug-release-title-block">
                    <h3>Bảo mật & Robustness</h3>
                    <span className="ug-release-date">03/05/2026</span>
                  </div>
                </header>

                <div className="ug-release-grid">
                  <div className="ug-change ug-change-security">
                    <div className="ug-change-icon"><IconCompliance size={16}/></div>
                    <div className="ug-change-cat">Bảo mật · Critical fix</div>
                    <h5>JWT auth bắt buộc trên toàn API</h5>
                    <p>Tất cả 27 endpoints <code>/api/v2/*</code> nay yêu cầu xác thực JWT. Trước đây bất kỳ ai cũng có thể upload, xem dữ liệu, xóa note — đã đóng hoàn toàn lỗ hổng này.</p>
                  </div>

                  <div className="ug-change ug-change-security">
                    <div className="ug-change-icon"><IconSettings size={16}/></div>
                    <div className="ug-change-cat">Bảo mật · Permission</div>
                    <h5>Capability check theo role</h5>
                    <p>4 trang Skills cần <code>view_skills</code>, Dashboard cần <code>view_dashboard</code>, Coach cần <code>coach_team</code>, Compliance Queue cần <code>view_compliance_queue</code>. Có cache permissions 60s trên server để giảm DB hit.</p>
                  </div>

                  <div className="ug-change ug-change-ai">
                    <div className="ug-change-icon"><IconMic size={16}/></div>
                    <div className="ug-change-cat">AI Pipeline · Diarize</div>
                    <h5>Fallback diarize thông minh hơn</h5>
                    <p>Khi Claude labeling fail, chuyển từ alternating ngây thơ sang heuristic regex tiếng Việt: nhận diện AGENT qua "em/nhà thuốc/sản phẩm", CUSTOMER qua "tôi/đau/bao nhiêu". Phát hiện turn-change qua silence &gt; 1.2s hoặc câu hỏi.</p>
                  </div>

                  <div className="ug-change ug-change-ai">
                    <div className="ug-change-icon"><IconSearch size={16}/></div>
                    <div className="ug-change-cat">AI Pipeline · Matching</div>
                    <h5>Customer matcher fuzzy theo tiếng Việt</h5>
                    <p>Levenshtein distance trên tên đã strip dấu + lowercase. Match được "Lan" với "Nguyễn Thị Lan", chịu được typo, thiếu dấu. Threshold 0.55 cơ bản, boost &gt; 0.85.</p>
                  </div>

                  <div className="ug-change ug-change-reliability">
                    <div className="ug-change-icon"><IconRefresh size={16}/></div>
                    <div className="ug-change-cat">Reliability · Retry</div>
                    <h5>Auto retry async persist</h5>
                    <p>Embed chunks, insert vào <code>call_chunks</code>, extract memory facts giờ retry 3 lần với exponential backoff (300/900/2700ms). Không còn silent failure khi Supabase tạm lag.</p>
                  </div>

                  <div className="ug-change ug-change-ux">
                    <div className="ug-change-icon"><IconRefresh size={16}/></div>
                    <div className="ug-change-cat">UX · Auth flow</div>
                    <h5>Auto redirect khi token hết hạn</h5>
                    <p>Frontend patch global <code>fetch</code>: tự động inject JWT cho mọi request <code>/api/v2/*</code>, và auto redirect về <code>/login</code> khi nhận 401. Không còn phải copy token thủ công, không còn màn hình trắng.</p>
                  </div>
                </div>

                <Tip>Bản này tự động kích hoạt. Nếu bạn đang đăng nhập sẵn, chỉ cần reload — token cũ vẫn dùng được.</Tip>
              </article>

              {/* ── Release v2.2 ─────── */}
              <article className="ug-release">
                <header className="ug-release-head">
                  <div className="ug-release-version-block">
                    <span className="ug-release-version">v2.2</span>
                    <span className="ug-release-flag-stable">STABLE</span>
                  </div>
                  <div className="ug-release-title-block">
                    <h3>RBAC + Audio playback + Stack AI mới</h3>
                    <span className="ug-release-date">04/2026</span>
                  </div>
                </header>

                <div className="ug-release-grid">
                  <div className="ug-change ug-change-feature">
                    <div className="ug-change-icon"><IconHeadphones size={16}/></div>
                    <div className="ug-change-cat">Tính năng mới</div>
                    <h5>Phát lại audio trong transcript</h5>
                    <p>Tab "Phiên âm" có audio player đầy đủ: play/pause, seek, skip ±10s, speed 0.75x–2x, mute. Mỗi đoạn transcript có nút play riêng nhảy tới timestamp.</p>
                  </div>

                  <div className="ug-change ug-change-security">
                    <div className="ug-change-icon"><IconCompliance size={16}/></div>
                    <div className="ug-change-cat">Bảo mật · Foundation</div>
                    <h5>Hệ thống phân quyền (RBAC)</h5>
                    <p>2 roles (Admin/Staff) + 8 capabilities chi tiết. Admin cấp quyền từng phần (dashboard, skills, coach, manage users) cho từng staff.</p>
                  </div>

                  <div className="ug-change ug-change-feature">
                    <div className="ug-change-icon"><IconSettings size={16}/></div>
                    <div className="ug-change-cat">Tính năng mới</div>
                    <h5>Trang Cài đặt tài khoản</h5>
                    <p>Đổi tên, SĐT, chức danh, mật khẩu, upload avatar trực tiếp lên Supabase Storage. Xem các quyền đã được cấp.</p>
                  </div>

                  <div className="ug-change ug-change-feature">
                    <div className="ug-change-icon"><IconCustomers size={16}/></div>
                    <div className="ug-change-cat">Tính năng mới · Admin</div>
                    <h5>Quản lý người dùng</h5>
                    <p>Drawer trượt từ phải với 8 toggles + 3 preset (Cơ bản / Team Lead / Toàn bộ) để cấp quyền nhanh.</p>
                  </div>

                  <div className="ug-change ug-change-ai">
                    <div className="ug-change-icon"><IconSparkles size={16}/></div>
                    <div className="ug-change-cat">AI Stack</div>
                    <h5>Claude Sonnet 4.5 + Groq Whisper</h5>
                    <p>Chuyển 100% sang Claude (qua OpenRouter, tối ưu cost với Haiku tier) + Groq Whisper-large-v3 cho transcribe tiếng Việt. Tăng chất lượng + giảm chi phí ~60%.</p>
                  </div>

                  <div className="ug-change ug-change-ux">
                    <div className="ug-change-icon"><IconStar size={16}/></div>
                    <div className="ug-change-cat">UX · Design system</div>
                    <h5>Flat icon system</h5>
                    <p>Toàn bộ icon chuyển sang lucide-react stroke-only. Giao diện nhất quán mọi trang, tối ưu mobile.</p>
                  </div>
                </div>
              </article>

            </div>

            {/* Legend */}
            <div className="ug-changelog-legend">
              <span className="ug-legend-item"><i className="ug-dot ug-dot-security"/> Bảo mật</span>
              <span className="ug-legend-item"><i className="ug-dot ug-dot-ai"/> AI Pipeline</span>
              <span className="ug-legend-item"><i className="ug-dot ug-dot-reliability"/> Reliability</span>
              <span className="ug-legend-item"><i className="ug-dot ug-dot-feature"/> Tính năng mới</span>
              <span className="ug-legend-item"><i className="ug-dot ug-dot-ux"/> UX</span>
            </div>
          </Section>

          {/* ── 3. ANALYZE ─────────────────────── */}
          <Section id="analyze" isOpen={isOpen('analyze')} onToggle={() => toggle('analyze')} icon={<IconAnalyze size={20}/>} title="Phân tích cuộc gọi" subtitle="Upload file ghi âm và để AI phân tích tự động">
            <h4>Cách phân tích</h4>
            <Step n={1}><b>Chọn khách hàng</b> — Tại trang <Link to="/">Phân tích cuộc gọi</Link>, gõ tên/SĐT để tìm. Nếu chưa có, click <b>"Tạo mới"</b> để thêm nhanh.</Step>
            <Step n={2}><b>Nhập thời gian ghi âm</b> — Quan trọng để timeline chính xác. Có preset "Ngay bây giờ / 1h trước / Sáng nay / Hôm qua".</Step>
            <Step n={3}><b>Upload file</b> — Kéo thả MP3/WAV/M4A/OGG, tối đa 25MB. Có thể upload nhiều file cùng lúc (batch).</Step>
            <Step n={4}>
              <b>Click "Bắt đầu phân tích"</b> — Theo dõi tiến độ realtime qua các bước:
              <ul>
                <li><IconHeadphones size={14}/> Transcribe (Groq Whisper) — tách lời từ audio</li>
                <li><IconMic size={14}/> Diarize (Claude) — gán nhãn AGENT/CUSTOMER cho từng đoạn</li>
                <li><IconQuality size={14}/> Quality — chấm rubric 9 tiêu chí</li>
                <li><IconTarget size={14}/> Opportunity — phát hiện cơ hội + giai đoạn</li>
                <li><IconCompliance size={14}/> Compliance — kiểm tra vi phạm 4 mức</li>
                <li><IconActivity size={14}/> Structure — phân chia phases + moments</li>
                <li><IconMemory size={14}/> Needs — trích xuất nhu cầu y tế</li>
              </ul>
            </Step>
            <Step n={5}><b>Xem kết quả</b> — Canvas 6 tab tự động hiển thị, KH được lưu vào DB cho lần gọi sau.</Step>

            <Tip>Pipeline chạy <b>5 skills song song</b> — tổng thời gian ~30-60s cho cuộc gọi 5 phút.</Tip>
          </Section>

          {/* ── 4. AUDIO PLAYBACK ─────────────────────── */}
          <Section id="audio" isOpen={isOpen('audio')} onToggle={() => toggle('audio')} icon={<IconHeadphones size={20}/>} title="Nghe lại audio + đồng bộ transcript" subtitle="Tính năng mới: phát audio sync với phiên âm">
            <h4>Audio player bar (trên cùng tab Phiên âm)</h4>
            <ul>
              <li><b>Play/Pause</b> — Nút tròn gradient indigo ở giữa</li>
              <li><b>Skip ±10s</b> — Tua tới/lùi 10 giây</li>
              <li><b>Progress bar</b> — Click vào bất kỳ vị trí để nhảy tới đó</li>
              <li><b>Speed control</b> — Cycle: 0.75x → 1x → 1.25x → 1.5x → 2x</li>
              <li><b>Mute</b> — Tắt/bật tiếng nhanh</li>
            </ul>

            <h4>Per-segment play button</h4>
            <p>Mỗi đoạn transcript có <b>nút play nhỏ</b> bên phải. Click → nhảy audio tới timestamp + tự động phát. Đoạn đang phát highlight indigo + auto-scroll vào view.</p>

            <h4>Audio storage</h4>
            <p>File audio được upload lên Supabase Storage bucket <code>call-audio</code> (public, 50MB/file) sau khi phân tích xong. Lần sau xem chi tiết là có thể nghe lại ngay.</p>

            <Warning>Cuộc gọi cũ (trước khi bật tính năng) chưa có <code>audio_url</code> nên sẽ hiện "File audio không còn". Chỉ cuộc gọi mới mới có nút phát.</Warning>
          </Section>

          {/* ── 5. RESULTS ─────────────────────── */}
          <Section id="results" isOpen={isOpen('results')} onToggle={() => toggle('results')} icon={<IconStar size={20}/>} title="Xem kết quả phân tích" subtitle="6 tab kết quả + cách hiểu các chỉ số">
            <div className="ug-result-tabs">
              <div className="ug-rtab"><b><H icon={<IconQuality size={14}/>}>Tổng quan</H></b><p>Tóm tắt cuộc gọi, KPI tổng, summary AI. Click chip "Khoảnh khắc" để nhảy tới timestamp.</p></div>
              <div className="ug-rtab"><b><H icon={<IconMic size={14}/>}>Phiên âm</H></b><p>Bản gỡ băng + audio player + per-segment play. Agent (xanh) vs KH (trắng).</p></div>
              <div className="ug-rtab"><b><H icon={<IconTrendUp size={14}/>}>Chất lượng</H></b><p>9 tiêu chí với điểm/max + reasoning + evidence (timestamp + quote nguyên văn).</p></div>
              <div className="ug-rtab"><b><H icon={<IconTarget size={14}/>}>Cơ hội</H></b><p>Score 0-100, stage (cold/warm/hot/ready_to_buy), buying signals, objections, NBA.</p></div>
              <div className="ug-rtab"><b><H icon={<IconCompliance size={14}/>}>Tuân thủ</H></b><p>Severity 4 mức (clean/yellow/orange/red), evidence quote, recommended_action.</p></div>
              <div className="ug-rtab"><b><H icon={<IconMemory size={14}/>}>Nhu cầu</H></b><p>Medical conditions, medications, allergies, lifestyle, budget signals, decision style.</p></div>
            </div>

            <h4>Hiểu điểm Quality (A-F)</h4>
            <div className="ug-grade-legend">
              <span className="ug-grade" style={{background:'#16a34a'}}>A (90-100)</span>
              <span className="ug-grade" style={{background:'#65a30d'}}>B (75-89)</span>
              <span className="ug-grade" style={{background:'#eab308'}}>C (60-74)</span>
              <span className="ug-grade" style={{background:'#f97316'}}>D (40-59)</span>
              <span className="ug-grade" style={{background:'#dc2626'}}>F (0-39)</span>
            </div>

            <h4>9 tiêu chí Quality</h4>
            <ul>
              <li><b>Identity Verification</b> (5đ) — xác nhận tên + SĐT + giới thiệu</li>
              <li><b>Medical Discovery</b> (15đ) — hỏi triệu chứng, thuốc, dị ứng, thai kỳ</li>
              <li><b>Indication Appropriateness</b> (20đ) — SP có match triệu chứng?</li>
              <li><b>Side Effects Disclosure</b> (15đ) — chủ động nhắc TDP?</li>
              <li><b>Dosage Clarity</b> (10đ) — liều + tần suất + thời điểm + duration</li>
              <li><b>Drug Interaction Check</b> (10đ) — hỏi thuốc đang dùng?</li>
              <li><b>Empathy & Listening</b> (10đ) — dùng tên KH, reflective listening</li>
              <li><b>Professional Close</b> (10đ) — xác nhận đơn + next step + follow-up</li>
              <li><b>Compliance Language</b> (5đ) — không hứa "chữa khỏi 100%"</li>
            </ul>
          </Section>

          {/* ── 6. HISTORY ─────────────────────── */}
          <Section id="history" isOpen={isOpen('history')} onToggle={() => toggle('history')} icon={<IconHistory size={20}/>} title="Lịch sử phân tích" subtitle="Tra cứu, lọc, tìm kiếm cuộc gọi đã phân tích">
            <h4>Bộ lọc</h4>
            <ul>
              <li><b>Thời gian:</b> Hôm nay / 7 ngày / 30 ngày / Quý / Năm / Tất cả</li>
              <li><b>Khách hàng:</b> Autocomplete tên/SĐT</li>
              <li><b>Compliance:</b> Tất cả / Sạch / Vàng / Cam / Đỏ</li>
              <li><b>Tìm trong transcript:</b> Full-text search</li>
            </ul>

            <h4>Bảng kết quả</h4>
            <p>Mỗi dòng: thời gian · KH · tóm tắt · Q (quality grade) · Opp (opportunity score) · Compl (compliance) · thời lượng. Click vào dòng → mở Chi tiết cuộc gọi.</p>

            <Tip>Quyền <code>view_all_calls</code> mới cho phép Staff xem cuộc gọi của mọi rep — mặc định Staff chỉ xem cuộc của mình.</Tip>
          </Section>

          {/* ── 7. CUSTOMERS ─────────────────────── */}
          <Section id="customers" isOpen={isOpen('customers')} onToggle={() => toggle('customers')} icon={<IconCustomers size={20}/>} title="Quản lý khách hàng" subtitle="CRM tích hợp trí nhớ AI">
            <h4>Danh sách KH</h4>
            <p>Hiển thị: tên, SĐT, nguồn, số cuộc gọi, quality avg, compliance status, ngày tương tác gần nhất.</p>

            <h4>Chi tiết KH bao gồm</h4>
            <ul>
              <li><b>Trí nhớ AI</b> — Auto-generated từ mọi cuộc gọi:
                <ul>
                  <li>Bệnh lý + thời gian + mức độ</li>
                  <li>Thuốc đang dùng + hiệu quả</li>
                  <li>Dị ứng</li>
                  <li>Lối sống, sở thích</li>
                  <li>Phong cách quyết định mua</li>
                </ul>
              </li>
              <li><b>Lịch sử cuộc gọi</b> — tất cả cuộc đã phân tích</li>
              <li><b>Pipeline cơ hội</b> — sản phẩm quan tâm + giai đoạn</li>
              <li><b>Notes & follow-up</b></li>
            </ul>

            <h4>Conflict resolution</h4>
            <p>Khi cuộc gọi mới phát hiện fact mâu thuẫn (vd: KH đổi thuốc), Memory Agent tự động đánh dấu fact cũ là <code>valid_to=now()</code> và insert fact mới với <code>source_call_id</code>. Lịch sử được giữ nguyên.</p>
          </Section>

          {/* ── 8. AGENT AI ─────────────────────── */}
          <Section id="agent" isOpen={isOpen('agent')} onToggle={() => toggle('agent')} icon={<IconSparkles size={20}/>} title="Agent AI — Trợ lý 3 chế độ" subtitle="Hỏi đáp thông minh dựa trên dữ liệu thực tế">
            <h4>Mở Agent</h4>
            <p>Click <b>FAB sparkles</b> ở giữa thanh nav (mobile) hoặc nút <b>"Agent AI"</b> ở sidebar (desktop). Sheet slide-up từ dưới hoặc panel góc phải.</p>

            <h4>3 chế độ tự động phát hiện theo route</h4>
            <div className="ug-agent-modes">
              <div className="ug-amode" style={{borderColor:'#16a34a'}}>
                <div className="ug-amode-head"><IconMic size={16}/> <b>Phân tích cuộc gọi</b> · /call/:id</div>
                <p>Agent scope vào cuộc gọi đang xem. System prompt được augment với toàn bộ insights + transcript + memory KH.</p>
                <ul>
                  <li>"Tóm tắt cuộc gọi này"</li>
                  <li>"Điểm yếu nhất của nhân viên?"</li>
                  <li>"Có vi phạm tuân thủ nào?"</li>
                  <li>"Hành động tiếp theo nên làm gì?"</li>
                </ul>
              </div>
              <div className="ug-amode" style={{borderColor:'#4f46e5'}}>
                <div className="ug-amode-head"><IconCustomers size={16}/> <b>Hỏi đáp khách hàng</b> · /customers/:id</div>
                <p>Scope vào KH với active memory facts + last 3 calls + Top-K relevant chunks (RAG cosine similarity).</p>
                <ul>
                  <li>"KH này đang bị bệnh gì?"</li>
                  <li>"Đã mua sản phẩm nào?"</li>
                  <li>"Phong cách quyết định mua?"</li>
                  <li>"Hành động follow-up tiếp theo?"</li>
                </ul>
              </div>
              <div className="ug-amode" style={{borderColor:'#f59e0b'}}>
                <div className="ug-amode-head"><IconLightbulb size={16}/> <b>Cố vấn nghiệp vụ</b> · trang khác</div>
                <p>Cố vấn telesale dược phẩm chung — không cần ngữ cảnh KH cụ thể.</p>
                <ul>
                  <li>"Cách mở đầu cuộc gọi hiệu quả?"</li>
                  <li>"Xử lý khi KH chê giá đắt?"</li>
                  <li>"Quy định quảng cáo dược phẩm VN?"</li>
                  <li>"KPI nào quan trọng nhất?"</li>
                </ul>
              </div>
            </div>

            <h4>Citations clickable</h4>
            <p>Mọi response trong mode call/customer đều có citations với timestamp. Click → nhảy tới đúng đoạn trong transcript.</p>

            <Tip>Quick prompts hiển thị 5 câu hỏi gợi ý cho từng mode — tap nhanh thay vì gõ.</Tip>
          </Section>

          {/* ── 9. RBAC (NEW) ─────────────────────── */}
          <Section id="rbac" isOpen={isOpen('rbac')} onToggle={() => toggle('rbac')} icon={<IconCompliance size={20}/>} title="Phân quyền & Vai trò" subtitle="Hệ thống RBAC mới với 2 roles + 8 capabilities">
            <h4>2 Roles cơ bản</h4>
            <div className="ug-role-grid">
              <div className="ug-role-card ug-role-admin-card">
                <Badge tone="amber">Admin</Badge>
                <p><b>Toàn quyền</b> truy cập mọi tính năng. Quản lý người dùng, cấp quyền cho staff. Tự động khi đăng ký user đầu tiên.</p>
              </div>
              <div className="ug-role-card ug-role-staff-card">
                <Badge tone="indigo">Staff</Badge>
                <p>Mặc định chỉ truy cập module cá nhân (Phân tích, Hôm nay, Lịch sử KH của mình, Notes, Agent). Admin có thể cấp thêm 8 capability.</p>
              </div>
            </div>

            <h4>8 Capabilities chi tiết</h4>
            <table className="ug-table">
              <thead><tr><th>Capability</th><th>Cho phép</th></tr></thead>
              <tbody>
                <tr><td><code>view_dashboard</code></td><td>Xem Bảng điều khiển manager (KPI tổng đội)</td></tr>
                <tr><td><code>view_compliance_queue</code></td><td>Xem & xử lý Hàng đợi tuân thủ</td></tr>
                <tr><td><code>view_skills</code></td><td>Truy cập 4 trang Skills AI</td></tr>
                <tr><td><code>coach_team</code></td><td>Tools Huấn luyện viên cho đội</td></tr>
                <tr><td><code>view_all_calls</code></td><td>Xem cuộc gọi của mọi rep (mặc định chỉ xem của mình)</td></tr>
                <tr><td><code>delete_calls</code></td><td>Xóa cuộc gọi (không phục hồi)</td></tr>
                <tr><td><code>export_data</code></td><td>Download CSV/Excel reports</td></tr>
                <tr><td><code>manage_users</code></td><td>Mời / đổi role / cấp quyền cho user khác</td></tr>
              </tbody>
            </table>

            <h4>Cách hoạt động</h4>
            <p>3 layer enforcement:</p>
            <ol>
              <li><b>Routes</b> — Truy cập trực tiếp URL bị chặn nếu không có quyền</li>
              <li><b>Sidebar nav</b> — Menu items tự động ẩn nếu user không có quyền</li>
              <li><b>Backend API</b> — Mọi endpoint admin đều check role qua JWT</li>
            </ol>
          </Section>

          {/* ── 10. SETTINGS (NEW) ─────────────────────── */}
          <Section id="settings" isOpen={isOpen('settings')} onToggle={() => toggle('settings')} icon={<IconSettings size={20}/>} title="Cài đặt tài khoản" subtitle="Trang /settings — đổi info, mật khẩu, avatar">
            <h4>3 Tabs</h4>

            <h5>1. Hồ sơ</h5>
            <ul>
              <li><b>Avatar upload</b> — Chọn file ảnh JPG/PNG/WebP/GIF ≤ 5MB. Tự động upload lên Supabase Storage bucket <code>avatars</code>, lưu path <code>user-{'{id}'}/{'{timestamp}'}.ext</code></li>
              <li><b>Họ tên</b>, số điện thoại, chức danh</li>
              <li><b>Email</b> read-only (đổi qua Supabase Auth)</li>
              <li><b>Role pill</b> + ngày tham gia (read-only)</li>
            </ul>

            <h5>2. Bảo mật</h5>
            <ul>
              <li>Đổi mật khẩu (verify mật khẩu cũ trước, sau đó update qua Supabase Auth)</li>
              <li>Real-time validation: ≥ 6 ký tự + xác nhận khớp</li>
            </ul>

            <h5>3. Quyền truy cập</h5>
            <ul>
              <li><b>Admin</b> thấy banner: "Bạn là Admin · Toàn quyền"</li>
              <li><b>Staff</b> thấy danh sách 8 capability với badge "Có quyền" / "Chưa có"</li>
            </ul>

            <Tip>Click vào <b>user card</b> ở góc dưới sidebar để mở /settings nhanh.</Tip>
          </Section>

          {/* ── 11. USER MGMT (NEW) ─────────────────────── */}
          <Section id="usermgmt" isOpen={isOpen('usermgmt')} onToggle={() => toggle('usermgmt')} icon={<IconCustomers size={20}/>} title="Quản lý người dùng (Admin only)" subtitle="Trang /admin/users — cấp quyền chi tiết cho staff">
            <h4>Tổng quan</h4>
            <p>3 stat cards: <b>Tổng số</b> · <b>Admin</b> · <b>Staff</b>. List user với avatar, role, "X/8 quyền", title.</p>

            <h4>Đổi role nhanh</h4>
            <p>Dropdown inline trên mỗi row — Admin ↔ Staff. Disable cho chính mình (không tự hạ role).</p>

            <h4>Permission Drawer</h4>
            <p>Click button <b>"Quyền"</b> trên staff → drawer trượt từ phải:</p>
            <ul>
              <li><b>3 nhóm quyền</b> với toggle iOS-style</li>
              <li><b>3 preset shortcut:</b>
                <ul>
                  <li><b>Cơ bản</b> — Tắt hết (staff thuần phân tích)</li>
                  <li><b>Team Lead</b> — Bật view_all_calls, view_dashboard, view_compliance_queue, view_skills, coach_team, export_data</li>
                  <li><b>Toàn bộ</b> — Bật hết 8 quyền (như admin nhưng vẫn role staff)</li>
                </ul>
              </li>
              <li>Click "Lưu thay đổi" — staff đó refresh trang là thấy menu cập nhật</li>
            </ul>

            <Warning>Admin không thể xóa chính mình. Nếu chỉ có 1 admin và đổi role → user đầu tiên đăng ký tiếp theo sẽ thành admin auto.</Warning>
          </Section>

          {/* ── 12. SKILLS ─────────────────────── */}
          <Section id="skills" isOpen={isOpen('skills')} onToggle={() => toggle('skills')} icon={<IconQuality size={20}/>} title="Kỹ năng AI" subtitle="4 trang thống kê chi tiết — cần quyền view_skills">
            <div className="ug-skills-list">
              <div className="ug-skill-item">
                <div className="ug-skill-head"><IconQuality size={18}/> <b>Chấm điểm tư vấn</b></div>
                <p>Phân bố điểm (A/B/C/D/F), xu hướng cải thiện, top rubric cần cải thiện.</p>
                <Link to="/skills/quality" className="ug-skill-link">Xem chi tiết <IconArrowRight size={14}/></Link>
              </div>
              <div className="ug-skill-item">
                <div className="ug-skill-head"><IconOpportunity size={18}/> <b>Phát hiện cơ hội</b></div>
                <p>Pipeline (cold→warm→hot→ready_to_buy), tỷ lệ chuyển đổi, top SP quan tâm, win rate.</p>
                <Link to="/skills/opportunity" className="ug-skill-link">Xem chi tiết <IconArrowRight size={14}/></Link>
              </div>
              <div className="ug-skill-item">
                <div className="ug-skill-head"><IconCompliance size={18}/> <b>Kiểm tra tuân thủ</b></div>
                <p>Tỷ lệ vi phạm theo severity, loại vi phạm phổ biến, xu hướng cải thiện theo tuần/tháng.</p>
                <Link to="/skills/compliance" className="ug-skill-link">Xem chi tiết <IconArrowRight size={14}/></Link>
              </div>
              <div className="ug-skill-item">
                <div className="ug-skill-head"><IconMemory size={18}/> <b>Trí nhớ AI</b></div>
                <p>Số KH có profile, tổng facts, top fact category, conflicts đã resolve.</p>
                <Link to="/skills/memory" className="ug-skill-link">Xem chi tiết <IconArrowRight size={14}/></Link>
              </div>
            </div>
          </Section>

          {/* ── 13. MANAGEMENT ─────────────────────── */}
          <Section id="management" isOpen={isOpen('management')} onToggle={() => toggle('management')} icon={<IconDashboard size={20}/>} title="Quản lý & Coaching" subtitle="Dành cho Team Lead / Manager">
            <h4>Bảng điều khiển</h4>
            <p>Quyền: <code>view_dashboard</code>. Trang <Link to="/dashboard-v2">/dashboard-v2</Link>:</p>
            <ul>
              <li>Tổng cuộc gọi (theo ngày/tuần/tháng/quý)</li>
              <li>Quality average đội ngũ</li>
              <li>Tỷ lệ cơ hội phát hiện</li>
              <li>Tỷ lệ vi phạm tuân thủ</li>
              <li>Top performers</li>
            </ul>

            <h4>Huấn luyện viên</h4>
            <p>Quyền: <code>coach_team</code>. Trang <Link to="/coach">/coach</Link>:</p>
            <ul>
              <li>Điểm mạnh/yếu của từng agent (auto-aggregated)</li>
              <li>AI đề xuất coaching plan cá nhân</li>
              <li>Compare hiệu suất trước/sau coaching</li>
            </ul>

            <h4>Hàng đợi tuân thủ</h4>
            <p>Quyền: <code>view_compliance_queue</code>. Trang <Link to="/compliance-queue">/compliance-queue</Link>:</p>
            <ul>
              <li>Sắp xếp theo severity: Đỏ → Cam → Vàng</li>
              <li>Click → xem evidence + nghe lại + đánh dấu xử lý</li>
              <li>Audit trail đầy đủ</li>
            </ul>
          </Section>

          {/* ── 14. NOTES ─────────────────────── */}
          <Section id="notes" isOpen={isOpen('notes')} onToggle={() => toggle('notes')} icon={<IconDraft size={20}/>} title="Ghi chú" subtitle="Quản lý task, follow-up, ghi nhớ">
            <Step n={1}>Vào <Link to="/my/drafts">Ghi chú</Link> → click <b>"+ Tạo ghi chú"</b></Step>
            <Step n={2}>Type: <b>Task / Follow-up / Note</b></Step>
            <Step n={3}>Priority: <b>Low / Medium / High / Urgent</b></Step>
            <Step n={4}>Gán cho khách hàng + đặt due date</Step>

            <h4>Trạng thái</h4>
            <ul>
              <li><b>Open</b> — Chưa xử lý</li>
              <li><b>In Progress</b> — Đang xử lý</li>
              <li><b>Done</b> — Đã hoàn thành</li>
            </ul>

            <Tip>Toggle nhanh checkbox để Open ↔ Done không cần mở note.</Tip>
          </Section>

          {/* ── 15. TECH STACK ─────────────────────── */}
          <Section id="tech-stack" isOpen={isOpen('tech-stack')} onToggle={() => toggle('tech-stack')} icon={<IconDatabase size={20}/>} title="Công nghệ AI bên trong" subtitle="Stack hybrid tối ưu chất lượng + chi phí">
            <h4>Pipeline phân tích</h4>
            <table className="ug-table">
              <thead><tr><th>Bước</th><th>Service</th><th>Model</th></tr></thead>
              <tbody>
                <tr><td>1. Transcribe audio</td><td>Groq</td><td>Whisper-large-v3</td></tr>
                <tr><td>2. Speaker label</td><td>OpenRouter → Claude</td><td>Haiku 4.5 (fast)</td></tr>
                <tr><td>3. Quality assess</td><td>OpenRouter → Claude</td><td>Sonnet 4.5 (premium)</td></tr>
                <tr><td>4. Compliance check</td><td>OpenRouter → Claude</td><td>Sonnet 4.5 (premium)</td></tr>
                <tr><td>5. Opportunity scout</td><td>OpenRouter → Claude</td><td>Sonnet 4.5 (premium)</td></tr>
                <tr><td>6. Needs extract</td><td>OpenRouter → Claude</td><td>Haiku 4.5 (fast)</td></tr>
                <tr><td>7. Structure analyze</td><td>OpenRouter → Claude</td><td>Haiku 4.5 (fast)</td></tr>
                <tr><td>8. Memory facts</td><td>OpenRouter → Claude</td><td>Haiku 4.5 (fast)</td></tr>
                <tr><td>9. RAG embeddings</td><td>Gemini</td><td>embedding-001 (768-dim)</td></tr>
              </tbody>
            </table>

            <h4>Chiến lược tối ưu chi phí</h4>
            <ul>
              <li><b>2-tier model</b> — Haiku ($1/$5 per MTok) cho extraction, Sonnet ($3/$15 per MTok) cho reasoning</li>
              <li><b>Prompt caching</b> — System prompt cached 5 phút, giảm 90% input cost trên repeat calls</li>
              <li><b>Schema-enforced output</b> — Tool_use forcing 100% đúng JSON, không retry</li>
              <li><b>Parallel skills</b> — 5 skills chạy song song</li>
            </ul>

            <Tip>Cost trung bình ~$0.07 / cuộc gọi 5 phút (giảm 60% so với phiên bản trước).</Tip>
          </Section>

          {/* ── 16. MOBILE ─────────────────────── */}
          <Section id="mobile" isOpen={isOpen('mobile')} onToggle={() => toggle('mobile')} icon={<IconActivity size={20}/>} title="Sử dụng trên Mobile" subtitle="Thiết kế messaging-app, tối ưu một tay">
            <h4>Bottom navigation</h4>
            <div className="ug-mobile-nav-demo">
              <div className="ug-mnav-item"><IconAnalyze size={18}/><small>Phân tích</small></div>
              <div className="ug-mnav-item"><IconHome size={18}/><small>Hôm nay</small></div>
              <div className="ug-mnav-fab"><IconSparkles size={20}/></div>
              <div className="ug-mnav-item"><IconHistory size={18}/><small>Lịch sử</small></div>
              <div className="ug-mnav-item"><IconCustomers size={18}/><small>Khách hàng</small></div>
            </div>

            <h4>AgentSheet swipe-up</h4>
            <p>Click FAB sparkles ở giữa → sheet slide-up chiếm 85% màn hình. Kéo handle xuống để dismiss.</p>

            <Tip>Sidebar trên mobile bị ẩn — truy cập các trang Skills/Dashboard qua URL trực tiếp hoặc desktop.</Tip>
          </Section>

          {/* ── 17. FAQ ─────────────────────── */}
          <Section id="faq" isOpen={isOpen('faq')} onToggle={() => toggle('faq')} icon={<IconChat size={20}/>} title="Câu hỏi thường gặp" subtitle="FAQ — Giải đáp thắc mắc phổ biến">
            <div className="ug-faq">
              <div className="ug-faq-item">
                <b>Q: File ghi âm hỗ trợ định dạng nào?</b>
                <p>A: MP3, WAV, M4A, OGG, WebM, FLAC, Opus. Tối đa 25MB. Khuyến khích MP3 để upload nhanh.</p>
              </div>
              <div className="ug-faq-item">
                <b>Q: Phân tích mất bao lâu?</b>
                <p>A: 30-90s tùy độ dài. Cuộc gọi 5 phút thường xong trong 1 phút (Whisper transcribe ~15s + 5 skills song song ~30s).</p>
              </div>
              <div className="ug-faq-item">
                <b>Q: AI hiểu tiếng Việt tốt không?</b>
                <p>A: Rất tốt. Whisper-large-v3 (Groq) đạt 95%+ accuracy cho tiếng Việt, kể cả giọng địa phương. Claude Sonnet 4.5 hiểu thuật ngữ y tế Việt Nam.</p>
              </div>
              <div className="ug-faq-item">
                <b>Q: Tôi là Staff nhưng cần xem Bảng điều khiển?</b>
                <p>A: Liên hệ Admin để cấp quyền <code>view_dashboard</code>. Admin vào /admin/users → click "Quyền" trên tài khoản của bạn → bật toggle.</p>
              </div>
              <div className="ug-faq-item">
                <b>Q: Đổi mật khẩu thế nào?</b>
                <p>A: Click avatar góc dưới sidebar → /settings → tab "Bảo mật" → nhập mật khẩu cũ + mới.</p>
              </div>
              <div className="ug-faq-item">
                <b>Q: Avatar có upload được không?</b>
                <p>A: Có, từ v2.2. Vào /settings → tab "Hồ sơ" → "Chọn ảnh". JPG/PNG/WebP/GIF ≤ 5MB, lưu tự động lên Supabase Storage.</p>
              </div>
              <div className="ug-faq-item">
                <b>Q: Trí nhớ KH hoạt động ra sao?</b>
                <p>A: Sau mỗi cuộc gọi, Memory Agent (Claude) tự trích facts (bệnh, thuốc, dị ứng, sở thích) → upsert vào <code>customer_memory</code>. Nếu phát hiện conflict (vd: đổi thuốc), fact cũ được đánh dấu <code>valid_to=now()</code> và fact mới được insert.</p>
              </div>
              <div className="ug-faq-item">
                <b>Q: Compliance kiểm tra những gì?</b>
                <p>A: 4 mức (clean/yellow/orange/red) các vi phạm: cam kết chữa khỏi, off-label, thiếu khuyến cáo bác sĩ, gây áp lực mua, hứa hoàn tiền không có cơ sở, so sánh xấu đối thủ, v.v.</p>
              </div>
              <div className="ug-faq-item">
                <b>Q: Nghe lại audio cuộc gọi cũ được không?</b>
                <p>A: Chỉ cuộc gọi phân tích sau khi bật tính năng audio storage (v2.2). Cuộc gọi trước đó chỉ có transcript + insights, không còn file audio.</p>
              </div>
              <div className="ug-faq-item">
                <b>Q: Agent AI có nhớ lịch sử chat?</b>
                <p>A: Trong cùng phiên chat thì có. Đóng và mở lại sheet sẽ reset history.</p>
              </div>
            </div>
          </Section>

          {/* Footer */}
          <div className="ug-footer">
            <p>PharmaVoice v2.3 · Powered by Claude Sonnet 4.5 · Groq Whisper · Supabase</p>
            <small>Có thắc mắc? Mở <b>Agent AI</b> (FAB sparkles) để hỏi bất cứ điều gì.</small>
          </div>
        </div>
      </div>
    </div>
  );
}
