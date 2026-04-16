import React from 'react';
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import './theme.css';
import './App.css';
import './mobile.css';
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
import ComingSoon from './ComingSoon';

// Error boundary to surface runtime errors instead of showing blank page
class ErrorBoundary extends React.Component {
  constructor(p) { super(p); this.state = { err: null }; }
  static getDerivedStateFromError(err) { return { err }; }
  componentDidCatch(err, info) { console.error('[ErrorBoundary]', err, info); }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 40, fontFamily: 'monospace', background: '#fef2f2', minHeight: '100vh' }}>
          <h1 style={{ color: '#b91c1c' }}>⚠️ Lỗi render</h1>
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

const ShellRoute = ({ children }) => <AppShell>{children}</AppShell>;

const App = () => {
  React.useEffect(() => {
    // Bypass login
    localStorage.setItem('user', JSON.stringify({ id: 1, name: 'Test Admin', role: 'admin' }));
    localStorage.setItem('token', 'fake-token');
  }, []);

  return (
    <ErrorBoundary>
    <Router>
      <Routes>
        <Route path="/" element={<ShellRoute><CallWorkspace /></ShellRoute>} />
        <Route path="/analyze" element={<ShellRoute><CallWorkspace /></ShellRoute>} />
        <Route path="/home" element={<ShellRoute><CallAnalyzer /></ShellRoute>} />
        <Route path="/customers" element={<ShellRoute><CustomerList /></ShellRoute>} />
        <Route path="/customers/:id" element={<ShellRoute><CustomerDetail /></ShellRoute>} />
        <Route path="/call/:id"      element={<ShellRoute><CallDetail /></ShellRoute>} />

        {/* Placeholder routes — skills/admin pages chưa build */}
        {/* Management modules (real) */}
        <Route path="/dashboard-v2"       element={<ShellRoute><ManagerDashboard /></ShellRoute>} />
        <Route path="/compliance-queue"   element={<ShellRoute><ComplianceQueue /></ShellRoute>} />
        <Route path="/coach"              element={<ShellRoute><Coach /></ShellRoute>} />

        {/* AI Skills (real) */}
        <Route path="/skills/quality"     element={<ShellRoute><QualitySkill /></ShellRoute>} />
        <Route path="/skills/opportunity" element={<ShellRoute><OpportunitySkill /></ShellRoute>} />
        <Route path="/skills/compliance"  element={<ShellRoute><ComplianceSkill /></ShellRoute>} />
        <Route path="/skills/memory"      element={<ShellRoute><MemorySkill /></ShellRoute>} />

        {/* History */}
        <Route path="/history"            element={<ShellRoute><CallHistory /></ShellRoute>} />
        <Route path="/my/calls"           element={<ShellRoute><CallHistory /></ShellRoute>} />

        {/* Notes */}
        <Route path="/my/drafts"          element={<ShellRoute><Notes /></ShellRoute>} />

        {/* User Guide */}
        <Route path="/guide"              element={<ShellRoute><UserGuide /></ShellRoute>} />

        {/* Legacy / no-shell routes */}
        <Route path="/old-dashboard" element={<Dashboard onBack={() => window.location.href='/'} />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/AudioRecorder" element={<AudioRecorder />} />
        <Route path="/dashboard" element={<Dashboard onBack={() => window.history.back()} />} />

        {/* Catch-all 404 */}
        <Route path="*" element={<ShellRoute><ComingSoon /></ShellRoute>} />
      </Routes>
    </Router>
    </ErrorBoundary>
  );
};

export default App;
