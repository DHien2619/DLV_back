// Centralized permission catalog — used by Settings page (display) and
// UserManagement (editor). Keep keys in sync with backend ALLOWED_PERMISSIONS.

export const PERMISSIONS = [
  {
    group: 'Truy cập trang quản lý',
    items: [
      { key: 'view_dashboard',         label: 'Bảng điều khiển',     desc: 'Xem KPI tổng đội ngũ' },
      { key: 'view_compliance_queue',  label: 'Hàng đợi tuân thủ',   desc: 'Xem & xử lý vi phạm' },
      { key: 'view_skills',            label: 'Trang Kỹ năng AI',    desc: 'Quality, Opportunity, Compliance, Memory analytics' },
      { key: 'coach_team',             label: 'Huấn luyện viên',     desc: 'Tools coaching cho đội' },
    ]
  },
  {
    group: 'Phạm vi dữ liệu',
    items: [
      { key: 'view_all_calls', label: 'Xem cuộc gọi của tất cả nhân viên', desc: 'Mặc định staff chỉ xem cuộc gọi của mình' },
    ]
  },
  {
    group: 'Hành động',
    items: [
      { key: 'delete_calls',  label: 'Xóa cuộc gọi',          desc: 'Xóa records không phục hồi' },
      { key: 'export_data',   label: 'Xuất dữ liệu',          desc: 'Download CSV/Excel reports' },
      { key: 'manage_users',  label: 'Quản lý người dùng',    desc: 'Mời / đổi role / cấp quyền' },
    ]
  }
];

export const PERMISSION_KEYS = PERMISSIONS.flatMap(g => g.items.map(i => i.key));

// Default presets
export const PRESET_FULL_ACCESS = Object.fromEntries(PERMISSION_KEYS.map(k => [k, true]));
export const PRESET_BASIC      = Object.fromEntries(PERMISSION_KEYS.map(k => [k, false]));
export const PRESET_TEAM_LEAD = {
  view_all_calls: true, view_dashboard: true, view_compliance_queue: true,
  view_skills: true, coach_team: true, manage_users: false,
  delete_calls: false, export_data: true
};
