import { useState } from 'react';
import { api, session } from '../api.js';

// Seeded demo users from backend/src/auth/rbac.js, shown so evaluators can try each role.
const DEMO_ACCOUNTS = [
  { email: 'admin@company.com', password: 'admin123', role: 'Admin', note: 'Everything: reassign owners, acknowledge alerts, run the simulator' },
  { email: 'finops@company.com', password: 'finops123', role: 'FinOps', note: 'Health, alerts and full cost allocation' },
  { email: 'viewer@company.com', password: 'viewer123', role: 'Viewer', note: 'Health and alerts; cost data hidden' },
];

export default function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e, creds) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { token, user } = await api('/auth/login', { method: 'POST', body: creds ?? { email, password } });
      session.save(token, user);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login">
      <section className="login-hero">
        <span className="chip"><span className="brand-mark" style={{ width: 18, height: 18 }} aria-hidden="true" />DashPureAnalytics · Admin console</span>
        <h1>Every report.<br />Every credit.<br /><span className="accent">One view.</span></h1>
        <div className="login-fleet" aria-hidden="true">
          {Array.from({ length: 72 }, (_, i) => <span key={i} />)}
        </div>
        <div className="login-stats">
          <span className="chip"><b>15s</b> load-time SLA</span>
          <span className="chip chip-sage"><b>Live</b> WebSocket alerts</span>
          <span className="chip chip-orange"><b>$ / view</b> cost attribution</span>
        </div>
      </section>
      <section className="login-card">
        <h2 style={{ fontSize: 28, fontWeight: 400, letterSpacing: '-0.03em' }}>Welcome back</h2>
        <form onSubmit={submit} className="form">
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="you@company.com" required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••" required /></label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <div className="demo-accounts">
          <div className="eyebrow">Or try a demo role</div>
          {DEMO_ACCOUNTS.map((d) => (
            <button key={d.email} className="demo-btn" onClick={(e) => submit(e, { email: d.email, password: d.password })} disabled={busy}>
              <span className="avatar" aria-hidden="true">{d.role.slice(0, 2)}</span>
              <strong>{d.role}</strong>
              <span className="go" aria-hidden="true">→</span>
              <span className="muted small">{d.note}</span>
            </button>
          ))}
          <p className="muted small" style={{ margin: '4px 0 0' }}>Passwords: admin123 · finops123 · viewer123</p>
        </div>
      </section>
    </main>
  );
}
