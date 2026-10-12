import { Card, StatTile, DataTable, Loading, ErrorState, PageHeader, Chip } from '../components/ui.jsx';
import { useApi } from '../useApi.js';
import { HBarSimple } from '../components/charts.jsx';

export default function DataQuality() {
  const { data, error, loading, reload } = useApi('/data-quality');
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;

  const issues = [...data.issues].sort((a, b) => b.count - a.count);

  return (
    <div className="page">
      <PageHeader title="Data quality">
        <Chip tone="sage">No rows dropped, every issue flagged</Chip>
      </PageHeader>
      <div className="tiles">
        <StatTile label="Rows ingested" value={data.rows_total.toLocaleString()} sub={`${data.unique_reports} unique reports × ${data.snapshots_per_report.join('/')} snapshots`} />
        <StatTile label="Rows with ≥1 flag" value={data.rows_with_any_issue.toLocaleString()} sub="includes latency breaches" />
        <StatTile label="Orphaned-owner rows" value={Object.values(data.orphaned_owner_raw_values).reduce((a, b) => a + b, 0)} sub={Object.entries(data.orphaned_owner_raw_values).map(([k, v]) => `'${k}' ×${v}`).join(' · ')} tone="orange" />
        <StatTile label="Negative-credit rows" value={data.negative_credit_rows.length} sub="excluded from cost attribution" tone="peach" />
      </div>

      <Card title="Rows affected per rule">
        <HBarSimple
          labelWidth={230}
          rows={issues.map((i) => ({ id: i.code, label: i.code, value: i.count, tip: <><b>{i.code}</b>: {i.count} rows ({i.pct_of_rows}%)<br />{i.description}</> }))}
        />
      </Card>

      <Card title="Rule catalogue">
        <DataTable
          rowKey="code"
          rows={issues}
          columns={[
            { key: 'code', label: 'Rule', render: (r) => <code>{r.code}</code> },
            { key: 'count', label: 'Rows', align: 'right' },
            { key: 'pct_of_rows', label: '% rows', align: 'right', render: (r) => `${r.pct_of_rows}%` },
            { key: 'description', label: 'Meaning & treatment' },
          ]}
        />
      </Card>

      <div className="grid-2">
        <Card title="Negative credit rows">
          <DataTable rowKey="row_number" rows={data.negative_credit_rows} columns={[
            { key: 'row_number', label: 'CSV row', align: 'right' },
            { key: 'report_id', label: 'Report' },
            { key: 'snowflake_credits_consumed', label: 'Credits', align: 'right' },
          ]} />
        </Card>
        <Card title="Assumptions">
          <ul className="assumptions">{data.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
          <h3>Zero-view rows with cost</h3>
          <DataTable rowKey="row_number" rows={data.zero_view_rows} columns={[
            { key: 'row_number', label: 'CSV row', align: 'right' },
            { key: 'report_id', label: 'Report' },
            { key: 'aws_hosting_cost_usd', label: 'AWS $', align: 'right' },
            { key: 'snowflake_credits_consumed', label: 'Credits', align: 'right' },
          ]} />
        </Card>
      </div>
    </div>
  );
}
