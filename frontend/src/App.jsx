import { useCallback, useEffect, useRef, useState } from 'react';
import { session, setUnauthorizedHandler, can } from './api.js';
import { useRealtime } from './useRealtime.js';
import Login from './pages/Login.jsx';
import Overview from './pages/Overview.jsx';
import Alerts from './pages/Alerts.jsx';
import Reports from './pages/Reports.jsx';
import Orphaned from './pages/Orphaned.jsx';
import Costs from './pages/Costs.jsx';
import DataQuality from './pages/DataQuality.jsx';
import { Icon } from './components/icons.jsx';

// Navigation is permission-driven: a page only appears if the role holds its permission.
const PAGES = [
  { id: 'overview', label: 'Overview', permission: 'reports:read', component: Overview },
  { id: 'alerts', label: 'Alerts', permission: 'alerts:read', component: Alerts },
  { id: 'reports', label: 'Reports', permission: 'reports:read', component: Reports },
  { id: 'orphaned', label: 'Orphaned', permission: 'reports:read', component: Orphaned },
  { id: 'costs', label: 'Costs', permission: 'costs:read', component: Costs },
  { id: 'quality', label: 'Data quality', permission: 'quality:read', component: DataQuality },
];

const ROLE_LABEL = { admin: 'Admin', finops: 'FinOps', viewer: 'Viewer' };
const CONN = { live: 'Live', connecting: 'Connecting…', reconnecting: 'Reconnecting…', closed: 'Offline' };

function Shell({ user, onLogout }) {
  const [route, setRoute] = useState({ id: 'overview', params: {} });
  const [toast, setToast] = useState(null); // { alert, more }
  const toastTimer = useRef(null);

  // Pop-up only for new/escalated CRITICAL alerts. While a toast is showing, further
  // criticals are folded into a "+N more" counter instead of stacking up.
  const onAlert = useCallback((type, alert) => {
    if (type !== 'alert.raised' && !(type === 'alert.updated' && alert.change === 'ESCALATED')) return;
    if (alert.severity !== 'CRITICAL') return;
    setToast((t) => (t ? { ...t, more: t.more + 1 } : { alert, more: 0 }));
    if (!toastTimer.current) {
      toastTimer.current = setTimeout(() => {
        setToast(null);
        toastTimer.current = null;
      }, 5000);
    }
  }, []);
  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const realtime = useRealtime(session.token, { onAlert });
  const pages = PAGES.filter((p) => can(user, p.permission));
  const Page = (pages.find((p) => p.id === route.id) ?? pages[0]).component;
  const navigate = (id, params = {}) => setRoute({ id, params });
  const openAlerts = realtime.summary?.active_total;

  const initials = user.name.split(' ').map((w) => w[0]).join('').slice(0, 2);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand-pill"><span className="brand-mark" aria-hidden="true" />DashPureAnalytics</div>
        <nav className="nav-pills" aria-label="Main">
          {pages.map((p) => (
            <button key={p.id} className={route.id === p.id ? 'nav-pill on' : 'nav-pill'} onClick={() => navigate(p.id)} aria-current={route.id === p.id ? 'page' : undefined}>
              <Icon name={p.id} />
              {p.label}
              {p.id === 'alerts' && openAlerts > 0 && <span className="count">{openAlerts}</span>}
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          <span className={`live-pill conn-${realtime.status}`}><span className="dot" aria-hidden="true" />{CONN[realtime.status]}</span>
          <div className="user-chip" title={user.email}>
            <span className="avatar" aria-hidden="true">{initials}</span>
            <span className="user-meta"><b>{user.name}</b><small>{ROLE_LABEL[user.role] ?? user.role}</small></span>
          </div>
          <button className="icon-btn" onClick={onLogout} aria-label="Sign out" title="Sign out"><Icon name="logout" /></button>
        </div>
      </header>
      <main className="main">
        <Page key={`${route.id}-${JSON.stringify(route.params)}`} user={user} realtime={realtime} navigate={navigate} params={route.params} />
      </main>
      <div className="toasts" aria-live="assertive">
        {toast && (
          <div className="toast" role="alert">
            <span className="badge tone-critical"><span className="badge-icon">‼</span>Critical alert</span>
            <div><b>{toast.alert.report_id}</b> {toast.alert.message}</div>
            {toast.more > 0 && <div className="muted small">+{toast.more} more critical alert{toast.more > 1 ? 's' : ''}</div>}
            <button className="link-btn small" onClick={() => { setToast(null); navigate('alerts'); }}>Open alert queue →</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState(session.user);
  const logout = useCallback(() => {
    session.clear();
    setUser(null);
  }, []);
  useEffect(() => setUnauthorizedHandler(logout), [logout]);
  return user ? <Shell user={user} onLogout={logout} /> : <Login onLogin={setUser} />;
}
