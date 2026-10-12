import { useState } from 'react';
import { api, can } from '../api.js';
import { Card, StatTile, StatusBadge, DataTable, PageHeader, Chip } from '../components/ui.jsx';
import { fmt } from '../format.js';

const RULE_LABEL = { LATENCY_SLA: 'Load time SLA', REFRESH_FAILURE: 'Refresh failure' };

function SimulatorControls({ sim }) {
  const [busy, setBusy] = useState(false);
  const call = async (path, body) => {
    setBusy(true);
    try {
      await api(`/simulator/${path}`, { method: 'POST', body });
    } finally {
      setBusy(false);
    }
  };
  if (!sim) return null;
  return (
    <Card title="Telemetry simulator">
      <div className="sim">
        <div className="sim-progress" aria-label={`Replay progress ${sim.progress_pct}%`}>
          <div className="sim-bar" style={{ width: `${sim.progress_pct}%` }} />
        </div>
        <div className="sim-meta muted small">
          {sim.running ? 'Running' : 'Paused'} · row {sim.position.toLocaleString()} / {sim.total_rows.toLocaleString()} · cycle {sim.cycle} · {sim.tick_ms}ms per sample
        </div>
        <div className="btn-row">
          {sim.running ? (
            <button className="btn" disabled={busy} onClick={() => call('stop')}>Pause</button>
          ) : (
            <button className="btn btn-primary" disabled={busy} onClick={() => call('start')}>Start</button>
          )}
          <button className="btn" disabled={busy} onClick={() => call('step')}>Step one sample</button>
          <button className="btn" disabled={busy} onClick={() => call('start', { tick_ms: 150 })}>Fast (150ms)</button>
          <button className="btn" disabled={busy} onClick={() => call('start', { tick_ms: 750 })}>Normal (750ms)</button>
          <button className="btn btn-danger" disabled={busy} onClick={() => call('reset')}>Reset</button>
        </div>
      </div>
    </Card>
  );
}

export default function Alerts({ user, realtime }) {
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [severity, setSeverity] = useState('');
  const [error, setError] = useState(null);
  const s = realtime.summary;

  const rows = realtime.alerts.filter((a) => {
    if (statusFilter === 'OPEN' && a.status === 'RESOLVED') return false;
    if (statusFilter === 'RESOLVED' && a.status !== 'RESOLVED') return false;
    if (severity && a.severity !== severity) return false;
    return true;
  });

  const ack = async (id) => {
    setError(null);
    try {
      realtime.mergeAlert(await api(`/alerts/${id}/ack`, { method: 'POST' }));
    } catch (e) {
      setError(e.message);
    }
  };

  const columns = [
    { key: 'id', label: 'Alert', render: (a) => <span className="nowrap">{a.id}</span> },
    { key: 'severity', label: 'Severity', render: (a) => <StatusBadge value={a.severity} /> },
    { key: 'status', label: 'Status', render: (a) => <StatusBadge value={a.status} /> },
    { key: 'report_id', label: 'Report', render: (a) => <><b>{a.report_id}</b><div className="muted small">{a.report_name}</div></> },
    { key: 'rule', label: 'Rule', render: (a) => RULE_LABEL[a.rule] ?? a.rule },
    { key: 'message', label: 'Detail' },
    { key: 'occurrences', label: 'Samples', align: 'right' },
    { key: 'updated_at', label: 'Updated', render: (a) => <span className="nowrap">{fmt.time(a.updated_at)}</span> },
    ...(can(user, 'alerts:ack')
      ? [{ key: 'actions', label: '', render: (a) => (a.status === 'ACTIVE' ? <button className="btn btn-sm" onClick={() => ack(a.id)}>Acknowledge</button> : a.acknowledged_by ? <span className="muted small">by {a.acknowledged_by.split('@')[0]}</span> : null) }]
      : []),
  ];

  return (
    <div className="page">
      <PageHeader title="Live alerts">
        <Chip>warning &gt; 15s</Chip>
        <Chip tone="orange">critical &gt; 30s or refresh failed</Chip>
      </PageHeader>

      {s && (
        <div className="tiles">
          <StatTile label="Open alerts" value={s.active_total} sub={`${s.unacknowledged} unacknowledged`} tone="orange" />
          <StatTile label="Critical / warning" value={`${s.active_critical} / ${s.active_warning}`} sub={`${s.by_rule.LATENCY_SLA} latency · ${s.by_rule.REFRESH_FAILURE} refresh`} />
          <StatTile label="Raised · resolved" value={`${s.stats.raised} · ${s.stats.resolved}`} sub={`${s.stats.escalated} escalated to critical`} />
          <StatTile label="Duplicate breaches suppressed" value={s.stats.duplicates_suppressed.toLocaleString()} sub={`of ${s.stats.samples_evaluated.toLocaleString()} samples evaluated`} />
        </div>
      )}

      {can(user, 'simulator:control') && <SimulatorControls sim={realtime.simulator} />}

      <Card
        title="Alert queue"
        actions={
          <div className="filters">
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="Status filter">
              <option value="OPEN">Open (active + acknowledged)</option>
              <option value="RESOLVED">Resolved</option>
              <option value="ALL">All</option>
            </select>
            <select value={severity} onChange={(e) => setSeverity(e.target.value)} aria-label="Severity filter">
              <option value="">All severities</option>
              <option value="CRITICAL">Critical</option>
              <option value="WARNING">Warning</option>
            </select>
          </div>
        }
      >
        {error && <div className="form-error">{error}</div>}
        <DataTable columns={columns} rows={rows.slice(0, 150)} rowKey="id" empty="No alerts match these filters." />
        {rows.length > 150 && <p className="muted small">Showing 150 of {rows.length}.</p>}
      </Card>
    </div>
  );
}
