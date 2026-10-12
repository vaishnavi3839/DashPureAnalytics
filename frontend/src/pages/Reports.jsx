import { useEffect, useMemo, useState } from 'react';
import { api, can } from '../api.js';
import { Card, DataTable, StatusBadge, Loading, ErrorState, PageHeader, Chip } from '../components/ui.jsx';
import { useApi } from '../useApi.js';
import { fmt } from '../format.js';
import { LineChart } from '../components/charts.jsx';

export function ReportDrawer({ reportId, user, onClose }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const started = performance.now();
    api(`/reports/${reportId}`)
      .then((r) => {
        if (cancelled) return;
        setReport(r);
        // Real client telemetry: report how long this detail view took to load.
        const seconds = Number(((performance.now() - started) / 1000).toFixed(2));
        api('/telemetry', { method: 'POST', body: { report_id: reportId, avg_load_time_sec: seconds } }).catch(() => {});
      })
      .catch((e) => !cancelled && setError(e));
    return () => {
      cancelled = true;
    };
  }, [reportId]);

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()} aria-label={`Report ${reportId}`}>
        <header className="drawer-head">
          <div>
            <div className="eyebrow">{reportId}</div>
            <h2>{report?.report_name ?? '…'}</h2>
          </div>
          <button className="btn btn-sm" onClick={onClose} aria-label="Close">Close</button>
        </header>
        {error && <ErrorState error={error} />}
        {!report && !error && <Loading />}
        {report && (
          <div className="drawer-body">
            <dl className="kv">
              <dt>Owner</dt><dd>{report.owner_email ?? <StatusBadge value="ORPHANED" />}</dd>
              <dt>Last known owner</dt><dd>{report.last_known_owner ?? '—'}</dd>
              <dt>Latest refresh</dt><dd><StatusBadge value={report.last_refresh_status} /></dd>
              <dt>Refresh failure rate</dt><dd>{fmt.pct(report.refresh_failure_rate)}</dd>
              <dt>Load time (latest / p95 / max)</dt><dd>{fmt.sec(report.latest_load_time_sec)} / {fmt.sec(report.p95_load_time_sec)} / {fmt.sec(report.max_load_time_sec)}</dd>
              <dt>Avg monthly active views</dt><dd>{fmt.int(report.avg_monthly_active_views)}</dd>
              {can(user, 'reports:read_cost') && (
                <>
                  <dt>Snowflake credits (rank)</dt><dd>{fmt.num(report.credits_consumed, 0)} (#{report.credit_rank}, {report.credit_share_pct}%)</dd>
                  <dt>Total cost / view</dt><dd>{fmt.usd(report.total_cost_per_view, 3)}</dd>
                </>
              )}
            </dl>
            <h3>Load time across {report.snapshots} snapshots</h3>
            <LineChart
              points={report.history.map((h) => ({ x: h.snapshot_seq, y: h.avg_load_time_sec, row: h }))}
              thresholds={[{ value: 15, label: '15s SLA' }, { value: 30, label: '30s critical' }]}
              yMax={60}
              unit="s"
              formatX={(x) => `S${x}`}
              describe={(p) => (
                <>
                  <b>Snapshot {p.x}</b> · {p.y}s
                  <br />Refresh: {p.row.last_refresh_status}
                  <br />Owner: {p.row.owner_email ?? 'orphaned'}
                </>
              )}
            />
            <h3>Snapshot history</h3>
            <DataTable
              rowKey="row_number"
              rows={[...report.history].reverse()}
              columns={[
                { key: 'snapshot_seq', label: '#' },
                { key: 'last_refresh_status', label: 'Refresh', render: (r) => <StatusBadge value={r.last_refresh_status} /> },
                { key: 'avg_load_time_sec', label: 'Load', align: 'right', render: (r) => fmt.sec(r.avg_load_time_sec) },
                { key: 'monthly_active_views', label: 'Views', align: 'right', render: (r) => fmt.int(r.monthly_active_views) },
                ...(can(user, 'reports:read_cost') ? [{ key: 'snowflake_credits_consumed', label: 'Credits', align: 'right', render: (r) => (r.snowflake_credits_valid === null ? <span title="Negative credits – excluded">⚠ {r.snowflake_credits_consumed}</span> : fmt.num(r.snowflake_credits_consumed, 1)) }] : []),
                { key: 'owner_email', label: 'Owner', render: (r) => r.owner_email ?? <span className="muted">{String(r.owner_email_raw)}</span> },
                { key: 'issues', label: 'Flags', render: (r) => <span className="muted small">{r.issues.filter((i) => !i.startsWith('LATENCY') && i !== 'OWNER_CHANGED').join(', ') || '—'}</span> },
              ]}
            />
          </div>
        )}
      </aside>
    </div>
  );
}

export default function Reports({ user, params = {} }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(params.status ?? '');
  const [band, setBand] = useState(params.band ?? '');
  const [sort, setSort] = useState({ key: 'report_id', order: 'asc' });
  const [selected, setSelected] = useState(null);
  const showCost = can(user, 'reports:read_cost');

  const query = useMemo(() => {
    const q = new URLSearchParams({ limit: '500', sort: sort.key, order: sort.order });
    if (search) q.set('search', search);
    if (status) q.set('status', status);
    if (band) q.set('band', band);
    return `/reports?${q}`;
  }, [search, status, band, sort]);
  const { data, error, loading, reload } = useApi(query);

  const onSort = (key) => setSort((s) => ({ key, order: s.key === key && s.order === 'desc' ? 'asc' : 'desc' }));

  const columns = [
    { key: 'report_id', label: 'Report', render: (r) => <><b>{r.report_id}</b><div className="muted small">{r.report_name}</div></> },
    { key: 'owner_email', label: 'Owner', render: (r) => r.owner_email ?? <StatusBadge value="ORPHANED" /> },
    { key: 'last_refresh_status', label: 'Last refresh', render: (r) => <StatusBadge value={r.last_refresh_status} /> },
    { key: 'refresh_failure_rate', label: 'Fail rate', align: 'right', render: (r) => fmt.pct(r.refresh_failure_rate, 0) },
    { key: 'latest_load_time_sec', label: 'Latest load', align: 'right', render: (r) => <span className="nowrap"><StatusBadge value={r.latest_latency_band} label={fmt.sec(r.latest_load_time_sec)} /></span> },
    { key: 'p95_load_time_sec', label: 'p95 load', align: 'right', render: (r) => fmt.sec(r.p95_load_time_sec) },
    { key: 'avg_monthly_active_views', label: 'Avg views', align: 'right', render: (r) => fmt.int(r.avg_monthly_active_views) },
    ...(showCost
      ? [
          { key: 'total_cost_usd', label: 'Total cost', align: 'right', render: (r) => fmt.usd(r.total_cost_usd) },
          { key: 'total_cost_per_view', label: 'Cost / view', align: 'right', render: (r) => fmt.usd(r.total_cost_per_view, 2) },
        ]
      : []),
  ];

  return (
    <div className="page">
      <PageHeader title="Reports">
        <Chip>latest of 20 snapshots</Chip>
        {!showCost && <Chip>cost hidden for your role</Chip>}
      </PageHeader>
      <Card
        actions={
          <div className="filters">
            <input type="search" placeholder="Search id, name, owner…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search reports" />
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Refresh status">
              <option value="">Any refresh status</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILED">Failed</option>
              <option value="TIMED_OUT">Timed out</option>
              <option value="UNKNOWN">Unknown</option>
            </select>
            <select value={band} onChange={(e) => setBand(e.target.value)} aria-label="Latency band">
              <option value="">Any load time</option>
              <option value="OK">OK (≤15s)</option>
              <option value="WARNING">Warning (15–30s)</option>
              <option value="CRITICAL">Critical (&gt;30s)</option>
            </select>
          </div>
        }
      >
        {error ? <ErrorState error={error} onRetry={reload} /> : loading && !data ? <Loading /> : (
          <>
            <p className="muted small">{data.total} reports</p>
            <DataTable columns={columns} rows={data.items} sort={sort} onSort={onSort} onRowClick={(r) => setSelected(r.report_id)} />
          </>
        )}
      </Card>
      {selected && <ReportDrawer reportId={selected} user={user} onClose={() => setSelected(null)} />}
    </div>
  );
}
