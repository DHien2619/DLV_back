import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import './theme.css';
import './App.css';
import './mobile.css';
import { AuthProvider, ProtectedRoute } from './AuthContext';
import { AnalysisProvider } from './AnalysisContext';
import GlobalAnalysisIndicator from './GlobalAnalysisIndicator';
import AppShell from './AppShell';
import Login from './Login';
import Register from './Register';
import AudioRecorder from './AudioRecorder';
import Dashboard from './Dashboard';
import CallAnalyzer from './CallAnalyzer';
import CallWorkspace from './CallWorkspace';
import CallDetail from './CallDetail';
import { CustomerList, CustomerDetail } from './CustomerHub';
import ManagerDashboard from './ManagerDashboard';
import ComplianceQueue from './ComplianceQueue';
import Coach from './Coach';
import { QualitySkill, OpportunitySkill, ComplianceSkill, MemorySkill } from './SkillsPages';
import CallHistory from './CallHistory';
import Notes from './Notes';
import UserGuide from './UserGuide';
import UserManagement from './UserManagement';
import Settings from './Settings';
import ComingSoon from './ComingSoon';
import { IconWarning } from './icons';

// Error boundary to surface runtime errors instead of showing blank page
class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('[ErrorBoundary]', err, info); }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', background: '#fef2f2', minHeight: '100vh' }}>
          <h1 style={{ color: '#b91c1c' }}><IconWarning size={14}/> Lỗi render</h1>
          <pre style={{ background: 'white', padding: 20, borderRadius: 8, overflow: 'auto', fontSize: 13 }}>
{String(this.state.err?.stack || this.state.err)}
          </pre>
          <button onClick={() => { this.setState({ err: null }); window.location.reload(); }}
                  style={{ padding: '10px 20px', background: '#dc2626', color: 'white', border: 0, borderRadius: 8, cursor: 'pointer' }}>
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Shell + auth guard wrapper
const Shell = ({ children, adminOnly }) => (
  <ProtectedRoute adminOnly={adminOnly}>
    <AppShell>{children}</AppShell>
  </ProtectedRoute>
);

// Capability-gated shell (admin always passes via can() helper)
const PermShell = ({ children, perm }) => (
  <ProtectedRoute requirePermission={perm}>
    <AppShell>{children}</AppShell>
  </ProtectedRoute>
);

const App = () => (
  <ErrorBoundary>
    <AuthProvider>
      <Router>
        <AnalysisProvider>
        <Routes>
          {/* Public auth routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Authenticated — Staff + Admin */}
          <Route path="/"            element={<Shell><CallWorkspace /></Shell>} />
          <Route path="/analyze"     element={<Shell><CallWorkspace /></Shell>} />
          <Route path="/home"        element={<Shell><CallAnalyzer /></Shell>} />
          <Route path="/customers"   element={<Shell><CustomerList /></Shell>} />
          <Route path="/customers/:id" element={<Shell><CustomerDetail /></Shell>} />
          <Route path="/call/:id"    element={<Shell><CallDetail /></Shell>} />
          <Route path="/history"     element={<Shell><CallHistory /></Shell>} />
          <Route path="/my/calls"    element={<Shell><CallHistory /></Shell>} />
          <Route path="/my/drafts"   element={<Shell><Notes /></Shell>} />
          <Route path="/guide"       element={<Shell><UserGuide /></Shell>} />
          <Route path="/settings"    element={<Shell><Settings /></Shell>} />

          {/* Capability-gated (admin always passes) */}
          <Route path="/dashboard-v2"       element={<PermShell perm="view_dashboard"><ManagerDashboard /></PermShell>} />
          <Route path="/compliance-queue"   element={<PermShell perm="view_compliance_queue"><ComplianceQueue /></PermShell>} />
          <Route path="/coach"              element={<PermShell perm="coach_team"><Coach /></PermShell>} />
          <Route path="/skills/quality"     element={<PermShell perm="view_skills"><QualitySkill /></PermShell>} />
          <Route path="/skills/opportunity" element={<PermShell perm="view_skills"><OpportunitySkill /></PermShell>} />
          <Route path="/skills/compliance"  element={<PermShell perm="view_skills"><ComplianceSkill /></PermShell>} />
          <Route path="/skills/memory"      element={<PermShell perm="view_skills"><MemorySkill /></PermShell>} />
          <Route path="/admin/users"        element={<PermShell perm="manage_users"><UserManagement /></PermShell>} />

          {/* Legacy / no-shell */}
          <Route path="/old-dashboard" element={<Dashboard onBack={() => window.location.href='/'} />} />
          <Route path="/AudioRecorder" element={<AudioRecorder />} />
          <Route path="/dashboard" element={<Dashboard onBack={() => window.history.back()} />} />

          {/* 404 */}
          <Route path="*" element={<Shell><ComingSoon /></Shell>} />
        </Routes>
        <GlobalAnalysisIndicator />
        </AnalysisProvider>
      </Router>
    </AuthProvider>
  </ErrorBoundary>
);

export default App;
