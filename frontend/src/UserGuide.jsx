import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  IconAnalyze, IconHome, IconHistory, IconCustomers, IconSparkles,
  IconQuality, IconOpportunity, IconCompliance, IconMemory,
  IconDashboard, IconCoach, IconComplianceQ, IconDraft,
  IconUpload, IconSearch, IconFilter, IconChevronDown, IconChevronUp,
  IconCheck, IconArrowRight, IconPlay, IconMic, IconBook,
  IconChat, IconTarget, IconActivity, IconPill, IconHeart,
  IconTrendUp, IconStar, IconLightbulb, IconAlert, IconInfo
} from './icons';
import './UserGuide.css';

/* ── one expandable section ───────────────────────────── */
function Section({ id, icon, title, subtitle, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`ug-section ${open ? 'open' : ''}`} id={id}>
      <button className="ug-section-head" onClick={() => setOpen(!open)}>
        <span className="ug-section-icon">{icon}</span>
        <div className="ug-section-text">
          <b>{title}</b>
          <small>{subtitle}</small>
        </div>
        <span className="ug-section-chevron">{open ? <IconChevronUp size={18}/> : <IconChevronDown size={18}/>}</span>
      </button>
      {open && <div className="ug-section-body">{children}</div>}
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
  const [tocOpen, setTocOpen] = useState(false);

  const TOC = [
    { id: 'overview',    label: 'Tổng quan hệ thống' },
    { id: 'analyze',     label: 'Phân tích cuộc gọi' },
    { id: 'results',     label: 'Xem kết quả phân tích' },
    { id: 'history',     label: 'Lịch sử phân tích' },
    { id: 'customers',   label: 'Quản lý khách hàng' },
    { id: 'agent',       label: 'Agent AI (Trợ lý)' },
    { id: 'skills',      label: 'Kỹ năng AI' },
    { id: 'management',  label: 'Quản lý & Coaching' },
    { id: 'notes',       label: 'Ghi chú' },
    { id: 'mobile',      label: 'Sử dụng trên Mobile' },
    { id: 'faq',         label: 'Câu hỏi thường gặp' },
  ];

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTocOpen(false);
  };

  return (
    <div className="ug-root">
      {/* Hero */}
      <div className="ug-hero">
        <div className="ug-hero-icon"><IconBook size={32}/></div>
        <h1>Hướng dẫn sử dụng</h1>
        <p>PharmaVoice — Trợ lý AI phân tích cuộc gọi bán hàng dược phẩm</p>
      </div>

      {/* Quick nav */}
      <div className="ug-quick-nav">
        <h3>Truy cập nhanh</h3>
        <div className="ug-fcards">
          <FeatureCard icon={<IconAnalyze size={20}/>} title="Phân tích cuộc gọi" desc="Upload & phân tích tự động" to="/"/>
          <FeatureCard icon={<IconSparkles size={20}/>} title="Agent AI" desc="Hỏi đáp thông minh" to="#"/>
          <FeatureCard icon={<IconCustomers size={20}/>} title="Khách hàng" desc="Hồ sơ & trí nhớ KH" to="/customers"/>
          <FeatureCard icon={<IconHistory size={20}/>} title="Lịch sử" desc="Tra cứu cuộc gọi cũ" to="/history"/>
        </div>
      </div>

      {/* Table of contents (collapsible on mobile) */}
      <div className="ug-toc-wrap">
        <button className="ug-toc-toggle" onClick={() => setTocOpen(!tocOpen)}>
          Mục lục ({TOC.length} phần)
          {tocOpen ? <IconChevronUp size={16}/> : <IconChevronDown size={16}/>}
        </button>
        <ol className={`ug-toc ${tocOpen ? 'open' : ''}`}>
          {TOC.map((t, i) => (
            <li key={t.id}>
              <button onClick={() => scrollTo(t.id)}>
                <span className="ug-toc-n">{i + 1}</span>
                {t.label}
              </button>
            </li>
          ))}
        </ol>
      </div>

      {/* ── SECTIONS ──────────────────────────────── */}

      <Section id="overview" icon={<IconInfo size={20}/>} title="Tổng quan hệ thống" subtitle="PharmaVoice là gì và có gì đặc biệt" defaultOpen>
        <p>
          <b>PharmaVoice</b> là nền tảng AI phân tích cuộc gọi bán hàng dược phẩm, giúp doanh nghiệp:
        </p>
        <ul>
          <li><b>Phân tích tự động</b> — Upload file ghi âm, AI phân tích toàn diện trong vài phút</li>
          <li><b>Chấm điểm chất lượng</b> — Rubric 9 tiêu chí, cho điểm A-F với feedback chi tiết</li>
          <li><b>Phát hiện cơ hội</b> — AI nhận diện tín hiệu mua hàng, giai đoạn bán hàng</li>
          <li><b>Kiểm tra tuân thủ</b> — Tự động phát hiện vi phạm quảng cáo dược phẩm</li>
          <li><b>Trí nhớ khách hàng</b> — Lưu trữ thông tin y tế, sản phẩm đã dùng, sở thích</li>
          <li><b>Agent AI</b> — Hỏi đáp thông minh dựa trên dữ liệu thực tế</li>
        </ul>

        <h4>Các module chính</h4>
        <div className="ug-module-grid">
          <div className="ug-mod"><IconAnalyze size={18}/> <b>Phân tích cuộc gọi</b><br/><small>Upload & AI phân tích real-time</small></div>
          <div className="ug-mod"><IconHome size={18}/> <b>Dashboard Hôm nay</b><br/><small>Tổng hợp hiệu suất hàng ngày</small></div>
          <div className="ug-mod"><IconHistory size={18}/> <b>Lịch sử phân tích</b><br/><small>Tra cứu toàn bộ cuộc gọi</small></div>
          <div className="ug-mod"><IconCustomers size={18}/> <b>Quản lý khách hàng</b><br/><small>CRM + trí nhớ AI</small></div>
          <div className="ug-mod"><IconSparkles size={18}/> <b>Agent AI</b><br/><small>Trợ lý hỏi đáp thông minh</small></div>
          <div className="ug-mod"><IconDashboard size={18}/> <b>Bảng điều khiển</b><br/><small>Phân tích hiệu suất đội ngũ</small></div>
          <div className="ug-mod"><IconCoach size={18}/> <b>Huấn luyện viên</b><br/><small>AI coaching cá nhân hóa</small></div>
          <div className="ug-mod"><IconDraft size={18}/> <b>Ghi chú</b><br/><small>Quản lý task & follow-up</small></div>
        </div>
      </Section>

      <Section id="analyze" icon={<IconAnalyze size={20}/>} title="Phân tích cuộc gọi" subtitle="Upload file ghi âm và để AI phân tích tự động">
        <h4>Cách phân tích cuộc gọi</h4>
        <Step n={1}>
          <b>Chọn khách hàng</b> — Tại trang <Link to="/">Phân tích cuộc gọi</Link>, gõ tên khách hàng vào ô tìm kiếm.
          Nếu chưa có, nhấn <b>"Tạo mới"</b> để thêm nhanh.
        </Step>
        <Step n={2}>
          <b>Upload file ghi âm</b> — Kéo thả file MP3/WAV/M4A vào vùng upload, hoặc nhấn <b>"Chọn file"</b>.
          Hỗ trợ file tối đa 25MB.
        </Step>
        <Step n={3}>
          <b>Nhấn "Bắt đầu phân tích"</b> — AI sẽ xử lý qua các bước:
          <ul>
            <li><IconMic size={14}/> Diarize — Tách lời agent và khách hàng</li>
            <li><IconQuality size={14}/> Quality — Chấm điểm chất lượng tư vấn</li>
            <li><IconTarget size={14}/> Opportunity — Phát hiện cơ hội bán hàng</li>
            <li><IconCompliance size={14}/> Compliance — Kiểm tra tuân thủ</li>
            <li><IconActivity size={14}/> Structure — Phân tích cấu trúc cuộc gọi</li>
          </ul>
        </Step>
        <Step n={4}>
          <b>Xem kết quả</b> — Sau khi phân tích xong, kết quả hiển thị ngay trên trang với các tab chi tiết.
        </Step>

        <Tip>Bạn có thể phân tích nhiều file liên tiếp — mỗi file tự động lưu vào lịch sử.</Tip>
        <Tip>AI sẽ tự động nhận diện ngôn ngữ tiếng Việt và các thuật ngữ dược phẩm.</Tip>

        <h4>Tiến độ phân tích real-time</h4>
        <p>
          Trong quá trình phân tích, bạn sẽ thấy <b>thanh tiến độ</b> hiển thị từng bước AI đang xử lý.
          Mỗi kỹ năng (Quality, Opportunity, Compliance...) được chạy song song để tối ưu thời gian.
        </p>

        <h4>Upload hàng loạt (Batch)</h4>
        <p>
          Chọn nhiều file cùng lúc để phân tích hàng loạt. Hệ thống sẽ xử lý tuần tự và thông báo khi hoàn tất.
        </p>
      </Section>

      <Section id="results" icon={<IconStar size={20}/>} title="Xem kết quả phân tích" subtitle="Hiểu các chỉ số và tab kết quả">
        <h4>Các tab kết quả</h4>

        <div className="ug-result-tabs">
          <div className="ug-rtab">
            <b>Tổng quan</b>
            <p>Tóm tắt cuộc gọi, điểm quality tổng, opportunity score, compliance status. Bao gồm AI summary ngắn gọn về nội dung cuộc gọi.</p>
          </div>
          <div className="ug-rtab">
            <b>Transcript</b>
            <p>Bản gỡ băng đầy đủ với phân biệt Agent (xanh) và Khách hàng (trắng). Có thời gian từng đoạn. Click vào đoạn để nhảy tới vị trí audio.</p>
          </div>
          <div className="ug-rtab">
            <b>Chất lượng</b>
            <p>Chi tiết 9 tiêu chí chấm điểm: Mở đầu, Khám phá nhu cầu, Kiến thức sản phẩm, Xử lý phản đối, Kỹ năng chốt, Ngôn ngữ, Empathy, Luồng cuộc gọi, Tuân thủ. Mỗi tiêu chí có điểm, feedback, và timestamp evidence.</p>
          </div>
          <div className="ug-rtab">
            <b>Cơ hội</b>
            <p>Opportunity score (0-100), giai đoạn bán hàng (cold → ready_to_buy), tín hiệu mua tích cực/tiêu cực, next best action recommended.</p>
          </div>
          <div className="ug-rtab">
            <b>Tuân thủ</b>
            <p>Danh sách các vi phạm (nếu có) với mức độ: <span style={{color:'#eab308'}}>Vàng</span> (nhẹ), <span style={{color:'#f97316'}}>Cam</span> (trung bình), <span style={{color:'#dc2626'}}>Đỏ</span> (nghiêm trọng). Kèm đoạn trích dẫn và đề xuất sửa.</p>
          </div>
          <div className="ug-rtab">
            <b>Nhu cầu</b>
            <p>AI trích xuất các nhu cầu được nhắc đến: triệu chứng, bệnh lý, mong muốn, lo ngại. Giúp hiểu KH cần gì.</p>
          </div>
        </div>

        <h4>Hiểu điểm Quality (A-F)</h4>
        <div className="ug-grade-legend">
          <span className="ug-grade" style={{background:'#16a34a'}}>A (85-100)</span>
          <span className="ug-grade" style={{background:'#65a30d'}}>B (70-84)</span>
          <span className="ug-grade" style={{background:'#eab308'}}>C (55-69)</span>
          <span className="ug-grade" style={{background:'#f97316'}}>D (40-54)</span>
          <span className="ug-grade" style={{background:'#dc2626'}}>F (0-39)</span>
        </div>
        <p>Điểm dựa trên rubric 9 tiêu chí trọng số khác nhau, phản ánh chất lượng tư vấn thực tế.</p>

        <Tip>Nhấn vào từng tiêu chí quality để xem feedback chi tiết và timestamp trong bản ghi.</Tip>
      </Section>

      <Section id="history" icon={<IconHistory size={20}/>} title="Lịch sử phân tích" subtitle="Tra cứu, lọc, tìm kiếm cuộc gọi đã phân tích">
        <h4>Tìm kiếm & Lọc</h4>
        <Step n={1}>
          <b>Bộ lọc thời gian</b> — Chọn: Hôm nay / Tuần này / Tháng này / Quý này / Năm nay, hoặc khoảng ngày tùy chỉnh.
        </Step>
        <Step n={2}>
          <b>Lọc theo khách hàng</b> — Gõ tên khách hàng để lọc cuộc gọi của riêng KH đó.
        </Step>
        <Step n={3}>
          <b>Lọc Compliance</b> — Chọn Tất cả / Sạch / Vàng / Cam / Đỏ để lọc theo mức vi phạm.
        </Step>
        <Step n={4}>
          <b>Tìm trong transcript</b> — Gõ từ khóa vào ô tìm kiếm để tìm cuộc gọi có nhắc đến từ khóa đó.
        </Step>

        <h4>Xem chi tiết</h4>
        <p>Nhấn vào bất kỳ dòng nào trong bảng để mở trang <b>Chi tiết cuộc gọi</b> với đầy đủ kết quả phân tích.</p>

        <Tip>Trang chi tiết hiển thị header với Quality · Opportunity · Compliance cùng lúc, giúp đánh giá nhanh.</Tip>
      </Section>

      <Section id="customers" icon={<IconCustomers size={20}/>} title="Quản lý khách hàng" subtitle="CRM tích hợp trí nhớ AI">
        <h4>Danh sách khách hàng</h4>
        <p>
          Trang <Link to="/customers">Khách hàng</Link> hiển thị tất cả KH với:
        </p>
        <ul>
          <li>Tên, số điện thoại, nguồn (hotline/web/referral)</li>
          <li>Số cuộc gọi đã phân tích, quality trung bình</li>
          <li>Compliance status tổng hợp</li>
          <li>Ngày tương tác gần nhất</li>
        </ul>

        <h4>Chi tiết khách hàng</h4>
        <p>Click vào KH để xem:</p>
        <ul>
          <li><b>Trí nhớ AI</b> — Hệ thống tự động lưu: bệnh lý, thuốc đang dùng, dị ứng, sở thích, phong cách quyết định</li>
          <li><b>Danh sách cuộc gọi</b> — Tất cả cuộc gọi đã phân tích với KH này</li>
          <li><b>Cơ hội bán hàng</b> — Opportunity pipeline, sản phẩm quan tâm</li>
          <li><b>Ghi chú</b> — Notes và follow-up liên quan KH</li>
        </ul>

        <h4>Thêm khách hàng mới</h4>
        <Step n={1}>Cách 1: Tại trang <Link to="/">Phân tích cuộc gọi</Link>, gõ tên → nhấn <b>"Tạo mới"</b></Step>
        <Step n={2}>Cách 2: Tại trang <Link to="/customers">Khách hàng</Link>, nhấn nút <b>"+ Thêm KH"</b></Step>

        <Tip>Trí nhớ AI tự động cập nhật sau mỗi cuộc gọi — không cần nhập tay!</Tip>
      </Section>

      <Section id="agent" icon={<IconSparkles size={20}/>} title="Agent AI (Trợ lý thông minh)" subtitle="Hỏi đáp dựa trên dữ liệu thực tế — sử dụng mọi lúc, mọi nơi">
        <h4>Mở Agent</h4>
        <p>
          Nhấn nút <b>sparkles</b> ở giữa thanh navigation (mobile) hoặc nút <b>"Agent AI"</b> ở sidebar (desktop).
          Agent sẽ slide lên từ dưới (mobile) hoặc mở panel bên phải (desktop).
        </p>

        <h4>3 chế độ Agent</h4>
        <div className="ug-agent-modes">
          <div className="ug-amode" style={{borderColor:'#16a34a'}}>
            <div className="ug-amode-head"><IconMic size={16}/> <b>Phân tích cuộc gọi</b></div>
            <p>Khi bạn đang xem <b>Chi tiết cuộc gọi</b> (/call/:id), Agent tự động scope vào cuộc gọi đó. Hỏi:</p>
            <ul>
              <li>"Tóm tắt cuộc gọi này"</li>
              <li>"Điểm yếu nhất của nhân viên?"</li>
              <li>"Có vi phạm tuân thủ nào?"</li>
              <li>"Hành động tiếp theo nên làm gì?"</li>
            </ul>
          </div>
          <div className="ug-amode" style={{borderColor:'#4f46e5'}}>
            <div className="ug-amode-head"><IconCustomers size={16}/> <b>Hỏi đáp khách hàng</b></div>
            <p>Khi bạn đang xem <b>Chi tiết khách hàng</b> (/customers/:id), Agent scope vào KH đó. Hỏi:</p>
            <ul>
              <li>"KH này đang bị bệnh gì?"</li>
              <li>"Đã mua sản phẩm nào?"</li>
              <li>"Phong cách quyết định mua?"</li>
              <li>"Hành động follow-up tiếp theo?"</li>
            </ul>
          </div>
          <div className="ug-amode" style={{borderColor:'#f59e0b'}}>
            <div className="ug-amode-head"><IconLightbulb size={16}/> <b>Cố vấn nghiệp vụ</b></div>
            <p>Ở mọi trang khác, Agent hoạt động như <b>cố vấn bán hàng dược phẩm</b>. Hỏi:</p>
            <ul>
              <li>"Cách mở đầu cuộc gọi hiệu quả?"</li>
              <li>"Xử lý khi KH chê giá đắt?"</li>
              <li>"Quy định quảng cáo dược phẩm VN?"</li>
              <li>"KPI nào quan trọng nhất?"</li>
            </ul>
          </div>
        </div>

        <Tip>Agent tự động phát hiện context dựa trên trang bạn đang xem — không cần cấu hình gì!</Tip>
        <Tip>Kéo thanh handle xuống dưới hoặc nhấn nút X để đóng Agent sheet.</Tip>
      </Section>

      <Section id="skills" icon={<IconQuality size={20}/>} title="Kỹ năng AI" subtitle="Xem thống kê chi tiết từng kỹ năng AI">
        <div className="ug-skills-list">
          <div className="ug-skill-item">
            <div className="ug-skill-head"><IconQuality size={18}/> <b>Chấm điểm tư vấn</b></div>
            <p>Xem phân bố điểm quality (A/B/C/D/F), xu hướng cải thiện theo thời gian, top rubric cần cải thiện.</p>
            <Link to="/skills/quality" className="ug-skill-link">Xem chi tiết <IconArrowRight size={14}/></Link>
          </div>
          <div className="ug-skill-item">
            <div className="ug-skill-head"><IconOpportunity size={18}/> <b>Phát hiện cơ hội</b></div>
            <p>Xem pipeline cơ hội (cold → warm → hot → ready_to_buy), tỷ lệ chuyển đổi, top sản phẩm quan tâm.</p>
            <Link to="/skills/opportunity" className="ug-skill-link">Xem chi tiết <IconArrowRight size={14}/></Link>
          </div>
          <div className="ug-skill-item">
            <div className="ug-skill-head"><IconCompliance size={18}/> <b>Kiểm tra tuân thủ</b></div>
            <p>Xem tỷ lệ vi phạm, loại vi phạm phổ biến, xu hướng cải thiện. Đặc biệt quan trọng cho ngành dược.</p>
            <Link to="/skills/compliance" className="ug-skill-link">Xem chi tiết <IconArrowRight size={14}/></Link>
          </div>
          <div className="ug-skill-item">
            <div className="ug-skill-head"><IconMemory size={18}/> <b>Trí nhớ AI</b></div>
            <p>Xem tổng hợp memory: bao nhiêu KH có profile, bao nhiêu facts đã lưu, top category.</p>
            <Link to="/skills/memory" className="ug-skill-link">Xem chi tiết <IconArrowRight size={14}/></Link>
          </div>
        </div>
      </Section>

      <Section id="management" icon={<IconDashboard size={20}/>} title="Quản lý & Coaching" subtitle="Dành cho Team Lead / Manager">
        <h4>Bảng điều khiển (Manager Dashboard)</h4>
        <p>
          Trang <Link to="/dashboard-v2">Bảng điều khiển</Link> tổng hợp KPI của cả đội:
        </p>
        <ul>
          <li>Tổng cuộc gọi đã phân tích (theo ngày/tuần/tháng/quý)</li>
          <li>Điểm quality trung bình đội ngũ</li>
          <li>Tỷ lệ cơ hội phát hiện</li>
          <li>Tỷ lệ vi phạm tuân thủ</li>
          <li>Top agent (hiệu suất cao nhất)</li>
        </ul>

        <h4>Huấn luyện viên AI (Coach)</h4>
        <p>
          Trang <Link to="/coach">Huấn luyện viên</Link> giúp manager:
        </p>
        <ul>
          <li>Xem điểm mạnh/yếu của từng agent</li>
          <li>AI đề xuất coaching plan cá nhân hóa</li>
          <li>So sánh hiệu suất trước/sau coaching</li>
        </ul>

        <h4>Hàng đợi tuân thủ (Compliance Queue)</h4>
        <p>
          Trang <Link to="/compliance-queue">Hàng đợi tuân thủ</Link> liệt kê các cuộc gọi có vi phạm cần review:
        </p>
        <ul>
          <li>Ưu tiên theo mức độ: Đỏ → Cam → Vàng</li>
          <li>Nhấn vào để xem chi tiết vi phạm + nghe lại</li>
          <li>Đánh dấu đã xử lý hoặc escalate</li>
        </ul>
      </Section>

      <Section id="notes" icon={<IconDraft size={20}/>} title="Ghi chú" subtitle="Quản lý task, follow-up, và ghi nhớ">
        <h4>Tạo ghi chú</h4>
        <Step n={1}>Vào <Link to="/my/drafts">Ghi chú</Link> → nhấn <b>"+ Tạo ghi chú"</b></Step>
        <Step n={2}>Nhập tiêu đề và nội dung. Chọn loại: <b>Task / Follow-up / Note</b></Step>
        <Step n={3}>Đặt mức ưu tiên: <b>Low / Medium / High / Urgent</b></Step>
        <Step n={4}>Gán cho khách hàng (nếu có) và đặt ngày deadline</Step>

        <h4>Quản lý trạng thái</h4>
        <ul>
          <li><b>Open</b> — Chưa xử lý</li>
          <li><b>In Progress</b> — Đang xử lý</li>
          <li><b>Done</b> — Đã hoàn thành (nhấn nhanh nút toggle)</li>
        </ul>

        <Tip>Nhấn đúp vào checkbox trạng thái để toggle nhanh Open ↔ Done mà không cần mở note.</Tip>
      </Section>

      <Section id="mobile" icon={<IconActivity size={20}/>} title="Sử dụng trên Mobile" subtitle="Thiết kế tối ưu cho điện thoại">
        <h4>Thanh navigation</h4>
        <p>Trên mobile, thanh navigation nằm ở <b>dưới cùng màn hình</b> với 5 mục:</p>
        <div className="ug-mobile-nav-demo">
          <div className="ug-mnav-item"><IconAnalyze size={18}/><small>Phân tích</small></div>
          <div className="ug-mnav-item"><IconHome size={18}/><small>Hôm nay</small></div>
          <div className="ug-mnav-fab"><IconSparkles size={20}/></div>
          <div className="ug-mnav-item"><IconHistory size={18}/><small>Lịch sử</small></div>
          <div className="ug-mnav-item"><IconCustomers size={18}/><small>Khách hàng</small></div>
        </div>

        <h4>Agent trên Mobile</h4>
        <p>
          Nhấn nút <b>sparkles</b> ở giữa → Agent sheet slide lên chiếm 85% màn hình.
          Kéo thanh handle xuống để đóng (swipe down gesture).
        </p>

        <h4>Các trang khác trên Mobile</h4>
        <p>
          Để truy cập các module khác (Skills, Dashboard, Coach, Notes...):
          sử dụng nút hamburger menu ở góc trái hoặc truy cập trực tiếp qua URL.
        </p>

        <Tip>Giao diện mobile được thiết kế theo phong cách messaging app — tối ưu cho thao tác một tay.</Tip>
      </Section>

      <Section id="faq" icon={<IconChat size={20}/>} title="Câu hỏi thường gặp" subtitle="FAQ — Giải đáp thắc mắc phổ biến">
        <div className="ug-faq">
          <div className="ug-faq-item">
            <b>Q: File ghi âm hỗ trợ định dạng nào?</b>
            <p>A: MP3, WAV, M4A, OGG, WEBM. Kích thước tối đa 25MB. Nên dùng MP3 để tối ưu tốc độ upload.</p>
          </div>
          <div className="ug-faq-item">
            <b>Q: Phân tích mất bao lâu?</b>
            <p>A: Trung bình 1-3 phút tùy độ dài cuộc gọi. Cuộc gọi dưới 10 phút thường xong trong 1 phút.</p>
          </div>
          <div className="ug-faq-item">
            <b>Q: AI có nghe được tiếng Việt không?</b>
            <p>A: Có! Hệ thống sử dụng Gemini AI với khả năng nhận diện tiếng Việt tốt, kể cả giọng địa phương.</p>
          </div>
          <div className="ug-faq-item">
            <b>Q: Trí nhớ KH hoạt động như thế nào?</b>
            <p>A: Sau mỗi cuộc gọi, AI tự động trích xuất thông tin quan trọng (bệnh lý, thuốc, sở thích...) và lưu vào hồ sơ KH. Lần gọi tiếp theo, agent có thể tra cứu ngay.</p>
          </div>
          <div className="ug-faq-item">
            <b>Q: Compliance kiểm tra những gì?</b>
            <p>A: AI kiểm tra các quy định quảng cáo dược phẩm Việt Nam: cam kết chữa bệnh, quảng cáo sai sự thật, thiếu khuyến cáo bác sĩ, gây áp lực mua hàng, hứa hoàn tiền không hợp lệ, v.v.</p>
          </div>
          <div className="ug-faq-item">
            <b>Q: Có thể xóa cuộc gọi đã phân tích không?</b>
            <p>A: Hiện tại chưa hỗ trợ xóa trực tiếp trên giao diện. Liên hệ admin để xử lý.</p>
          </div>
          <div className="ug-faq-item">
            <b>Q: Agent AI có nhớ cuộc hội thoại trước không?</b>
            <p>A: Agent nhớ nội dung trong cùng một phiên chat. Khi đóng và mở lại, lịch sử sẽ được reset.</p>
          </div>
        </div>
      </Section>

      {/* Footer */}
      <div className="ug-footer">
        <p>PharmaVoice v2.0 — AI-powered call analytics for pharmaceutical sales</p>
        <small>Có thắc mắc? Sử dụng <b>Agent AI</b> (nút sparkles) để hỏi bất cứ điều gì.</small>
      </div>
    </div>
  );
}
