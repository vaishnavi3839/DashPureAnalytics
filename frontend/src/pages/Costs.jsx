import { useState } from 'react';
import { Card, StatTile, DataTable, Loading, ErrorState, PageHeader, Chip } from '../components/ui.jsx';
import { useApi } from '../useApi.js';
import { fmt } from '../format.js';
import { HBarStacked } from '../components/charts.jsx';

const SERIES = [
  { name: 'Snowflake compute / view', color: 'var(--series-1)' },
  { name: 'AWS hosting / view', color: 'var(--series-2)' },
];

export default function Costs() {
  const summary = useApi('/costs/summary');
  const [sort, setSort] = useState({ key: 'total_cost_per_view', order: 'desc' });
  const reports = useApi(`/costs/reports?limit=500&sort=${sort.key}&order=${sort.order}`);
  const disc = useApi('/costs/discrepancies');
  const [view, setView] = useState('chart');

  const err = summary.error || reports.error || disc.error;
  if (err) return <ErrorState error={err} />;
  if (!summary.data || !reports.data || !disc.data) return <Loading />;
  const s = summary.data;

  const top = [...reports.data.items].sort((a, b) => b.total_cost_per_view - a.total_cost_per_view).slice(0, 15);
  const onSort = (key) => setSort((p) => ({ key, order: p.key === key && p.order === 'desc' ? 'asc' : 'desc' }));

  return (
    <div className="page">
      <PageHeader title="Cost allocation">
        <Chip><b>{fmt.usd(s.credit_price_usd, 2)}</b> per credit</Chip>
        <Chip tone="sage"><b>{s.negative_credit_rows_excluded}</b> negative-credit rows excluded</Chip>
      </PageHeader>

      <div className="tiles">
        <StatTile label="Snowflake credits" value={fmt.int(s.total_credits)} sub={`${fmt.usdCompact(s.total_snowflake_cost_usd)} compute`} />
        <StatTile label="AWS hosting" value={fmt.usdCompact(s.total_aws_hosting_cost_usd)} sub="across 100 reports" />
        <StatTile label="Usage vs AWS cost correlation" value={`r = ${s.corr_views_vs_aws_cost}`} sub="≈0 → hosting spend does not track usage" tone="orange" />
        <StatTile label="AWS cost discrepancies" value={disc.data.total} sub={`fence $${disc.data.fence}/view (Q3 + 1.5×IQR)`} tone="peach" />
      </div>

      <Card
        title="Unit cost per active user view – top 15"
        actions={
          <div className="seg-toggle" role="tablist">
            <button role="tab" aria-selected={view === 'chart'} className={view === 'chart' ? 'on' : ''} onClick={() => setView('chart')}>Chart</button>
            <button role="tab" aria-selected={view === 'table'} className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Table</button>
          </div>
        }
      >
        {view === 'chart' ? (
          <HBarStacked
            series={SERIES}
            format={(v) => `$${v.toFixed(2)}`}
            rows={top.map((r) => ({ id: r.report_id, label: r.report_id, sub: r.report_name, values: [r.snowflake_cost_per_view, r.aws_cost_per_view] }))}
          />
        ) : (
          <DataTable
            rows={top}
            columns={[
              { key: 'report_id', label: 'Report' },
              { key: 'snowflake_cost_per_view', label: 'Snowflake / view', align: 'right', render: (r) => fmt.usd(r.snowflake_cost_per_view, 4) },
              { key: 'aws_cost_per_view', label: 'AWS / view', align: 'right', render: (r) => fmt.usd(r.aws_cost_per_view, 4) },
              { key: 'total_cost_per_view', label: 'Total / view', align: 'right', render: (r) => fmt.usd(r.total_cost_per_view, 4) },
            ]}
          />
        )}
      </Card>

      <div className="grid-2">
        <Card title="Usage vs AWS hosting discrepancies">
          <DataTable
            rows={disc.data.items}
            columns={[
              { key: 'report_id', label: 'Report', render: (r) => <><b>{r.report_id}</b><div className="muted small">{r.owner_email ?? 'orphaned'}</div></> },
              { key: 'aws_cost_per_view', label: 'AWS / view', align: 'right', render: (r) => fmt.usd(r.aws_cost_per_view, 3) },
              { key: 'reasons', label: 'Why flagged', render: (r) => <ul className="reasons">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul> },
            ]}
          />
        </Card>
        <Card title="Worst individual snapshots">
          <DataTable
            rowKey="row_number"
            rows={disc.data.worst_snapshots}
            columns={[
              { key: 'report_id', label: 'Report', render: (r) => `${r.report_id} · S${r.snapshot_seq}` },
              { key: 'monthly_active_views', label: 'Views', align: 'right' },
              { key: 'aws_hosting_cost_usd', label: 'AWS $', align: 'right', render: (r) => fmt.usd(r.aws_hosting_cost_usd, 2) },
              { key: 'aws_cost_per_view', label: '$ / view', align: 'right', render: (r) => fmt.usd(r.aws_cost_per_view, 2) },
            ]}
          />
        </Card>
      </div>

      <Card className="table-scroll" title="Full cost attribution">
        <DataTable
          rows={reports.data.items}
          sort={sort}
          onSort={onSort}
          columns={[
            { key: 'credit_rank', label: 'Rank', align: 'right' },
            { key: 'report_id', label: 'Report' },
            { key: 'owner_email', label: 'Owner', render: (r) => r.owner_email ?? <span className="muted">orphaned</span> },
            { key: 'credits_consumed', label: 'Credits', align: 'right', render: (r) => fmt.num(r.credits_consumed, 0) },
            { key: 'credit_share_pct', label: 'Share', align: 'right', render: (r) => `${r.credit_share_pct}%` },
            { key: 'snowflake_cost_usd', label: 'Snowflake $', align: 'right', render: (r) => fmt.usd(r.snowflake_cost_usd) },
            { key: 'aws_hosting_cost_usd', label: 'AWS $', align: 'right', render: (r) => fmt.usd(r.aws_hosting_cost_usd) },
            { key: 'total_views', label: 'Views', align: 'right', render: (r) => fmt.int(r.total_views) },
            { key: 'total_cost_per_view', label: 'Total / view', align: 'right', render: (r) => fmt.usd(r.total_cost_per_view, 3) },
            { key: 'credits_per_1k_queries', label: 'Credits / 1k queries', align: 'right', render: (r) => fmt.num(r.credits_per_1k_queries, 1) },
          ]}
        />
      </Card>
    </div>
  );
}
