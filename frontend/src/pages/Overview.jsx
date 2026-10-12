import { useState } from 'react';
import { can } from '../api.js';
import { useApi } from '../useApi.js';
import { fmt } from '../format.js';
import { Card, Chip, Loading, ErrorState } from '../components/ui.jsx';
import { LiveLatencyChart, CapsuleBar, RingGauge } from '../components/charts.jsx';
import { FleetMap } from '../components/FleetMap.jsx';
import { Icon } from '../components/icons.jsx';
import { ReportDrawer } from './Reports.jsx';

function greeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

const ALERT_ICON = { 'alert.raised': '‼', 'alert.updated': '↑', 'alert.resolved': '✓', 'alert.acknowledged': '◐' };

function LiveAlertsCard({ summary, feed, onOpen }) {
  return (
    <Card tone="orange" className="alerts-card span-4" title="Live alerts">
      <div className="alerts-count">
        <b>{summary?.active_total ?? '—'}</b>
        <span className="muted">open · {summary?.active_critical ?? 0} critical</span>
      </div>
      <ul className="alerts-list">
        {feed.slice(0, 5).map((event) => (
          <li key={event.key}>
            <span className={event.type === 'alert.resolved' ? 'ai ok' : 'ai'} aria-hidden="true">{ALERT_ICON[event.type]}</span>
            <span className="at">
              <b>{event.alert.report_id}</b> {event.type === 'alert.resolved' ? 'recovered' : event.alert.message}
              <small>{event.alert.severity.toLowerCase()} · {fmt.time(event.at)}</small>
            </span>
          </li>
        ))}
        {feed.length === 0 && <li className="empty">Listening for alert events…</li>}
      </ul>
      <button className="btn btn-sm" style={{ marginTop: 16 }} onClick={onOpen}>Open alert queue <Icon name="arrow" size={14} /></button>
    </Card>
  );
}

export default function Overview({ user, realtime, navigate }) {
  const health = useApi('/health/summary');
  const reports = useApi('/reports?limit=500&sort=report_id&order=asc');
  const costs = useApi(can(user, 'costs:read') ? '/costs/summary' : null);
  const [selected, setSelected] = useState(null);

  if (health.error) return <ErrorState error={health.error} onRetry={health.reload} />;
  if (!health.data || !reports.data) return <Loading />;
  const h = health.data;
  const summary = realtime.summary ?? h.alerts;
  const status = h.latest_refresh_status;
  const firstName = user.name.split(' ')[0];

  return (
    <div className="page">
      <section className="hero">
        <div>
          <div className="hero-date">
            <Chip>{new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}</Chip>
            <Chip tone="sage">● {realtime.simulator?.running ? 'Telemetry streaming' : 'Telemetry paused'}</Chip>
          </div>
          <h1>{greeting()}, {firstName}</h1>
        </div>
        <div className="mega-stats">
          <div className="mega"><span className="mega-icon"><Icon name="reports" /></span><b>{h.reports_monitored}</b><small>Reports</small></div>
          <div className="mega"><span className="mega-icon"><Icon name="alerts" /></span><b>{summary.active_total}</b><small>Open alerts</small></div>
          {costs.data ? (
            <div className="mega"><span className="mega-icon"><Icon name="costs" /></span><b>{fmt.usdCompact(costs.data.total_snowflake_cost_usd + costs.data.total_aws_hosting_cost_usd)}</b><small>Cloud cost</small></div>
          ) : (
            <div className="mega"><span className="mega-icon"><Icon name="orphaned" /></span><b>{h.orphaned_reports}</b><small>Orphaned</small></div>
          )}
        </div>
      </section>

      <CapsuleBar
        segments={[
          { label: 'Refresh success', value: status.SUCCESS, tone: 'good' },
          { label: 'Timed out', value: status.TIMED_OUT, tone: 'serious' },
          { label: 'Failed', value: status.FAILED, tone: 'critical' },
          { label: 'Unknown', value: status.UNKNOWN, tone: 'neutral' },
        ]}
      />

      <div className="bento">
        <Card className="span-8" title="Report fleet" actions={<Chip>Click a bay to inspect</Chip>}>
          <FleetMap reports={reports.data.items} samples={realtime.samples} onSelect={setSelected} />
        </Card>

        <Card tone="sage" className="span-4" title="SLA compliance">
          <div className="ring-wrap">
            <RingGauge value={1 - h.latency_breach_rate_all_snapshots} label={`loads within ${h.thresholds.latency_warn_sec}s`} />
            <div className="ring-stats">
              <Chip>avg <b>{fmt.sec(h.avg_load_time_sec)}</b></Chip>
              <Chip>refresh ok <b>{fmt.pct(h.refresh_success_rate_all_snapshots, 0)}</b></Chip>
              <Chip tone="orange">critical now <b>{h.latest_latency_bands.CRITICAL}</b></Chip>
            </div>
          </div>
        </Card>

        <Card
          className="span-8"
          title="Live load time"
          actions={realtime.samples.at(-1) && <Chip>latest <b>{realtime.samples.at(-1).report_id}</b></Chip>}
        >
          {realtime.samples.length === 0 ? (
            <div className="state-msg">Waiting for telemetry…</div>
          ) : (
            <LiveLatencyChart samples={realtime.samples} warn={h.thresholds.latency_warn_sec} critical={h.thresholds.latency_critical_sec} height={300} />
          )}
        </Card>

        <LiveAlertsCard summary={summary} feed={realtime.feed} onOpen={() => navigate('alerts')} />
      </div>

      {selected && <ReportDrawer reportId={selected} user={user} onClose={() => setSelected(null)} />}
    </div>
  );
}
