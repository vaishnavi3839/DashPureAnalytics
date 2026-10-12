import { useState } from 'react';
import { api, can } from '../api.js';
import { Card, DataTable, StatusBadge, Loading, ErrorState, PageHeader, Chip } from '../components/ui.jsx';
import { useApi } from '../useApi.js';
import { fmt } from '../format.js';

function ReassignForm({ report, onDone }) {
  const [email, setEmail] = useState(report.last_known_owner ?? '');
  const [state, setState] = useState({ busy: false, error: null });
  const submit = async (e) => {
    e.preventDefault();
    setState({ busy: true, error: null });
    try {
      await api(`/reports/${report.report_id}/owner`, { method: 'PATCH', body: { owner_email: email } });
      onDone();
    } catch (err) {
      setState({ busy: false, error: err.message });
    }
  };
  return (
    <form className="inline-form" onSubmit={submit}>
      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="new.owner@company.com" aria-label={`New owner for ${report.report_id}`} required />
      <button className="btn btn-sm btn-primary" disabled={state.busy}>Assign</button>
      {state.error && <span className="form-error small">{state.error}</span>}
    </form>
  );
}

export default function Orphaned({ user }) {
  const { data, error, loading, reload } = useApi('/reports/orphaned');
  const [assigned, setAssigned] = useState([]);
  const showCost = can(user, 'reports:read_cost');
  const canAssign = can(user, 'reports:reassign');

  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading && !data) return <Loading />;

  const items = [...data.items].sort((a, b) => (b.total_cost_usd ?? 0) - (a.total_cost_usd ?? 0) || b.refresh_failure_rate - a.refresh_failure_rate);

  const columns = [
    { key: 'report_id', label: 'Report', render: (r) => <><b>{r.report_id}</b><div className="muted small">{r.report_name}</div></> },
    { key: 'last_known_owner', label: 'Last known owner', render: (r) => r.last_known_owner ?? '—' },
    { key: 'orphaned_snapshots', label: 'Orphaned snapshots', align: 'right', render: (r) => `${r.orphaned_snapshots} / ${r.snapshots}` },
    { key: 'last_refresh_status', label: 'Last refresh', render: (r) => <StatusBadge value={r.last_refresh_status} /> },
    { key: 'latest_load_time_sec', label: 'Latest load', align: 'right', render: (r) => fmt.sec(r.latest_load_time_sec) },
    ...(showCost ? [{ key: 'total_cost_usd', label: 'Total cost', align: 'right', render: (r) => fmt.usd(r.total_cost_usd) }] : []),
    ...(canAssign ? [{ key: 'assign', label: 'Reassign owner', render: (r) => <ReassignForm report={r} onDone={() => { setAssigned((a) => [...a, r.report_id]); reload(); }} /> }] : []),
  ];

  return (
    <div className="page">
      <PageHeader title="Orphaned reports">
        <Chip tone="orange"><b>{items.length}</b> without an owner</Chip>
        {canAssign && <Chip>last known owner pre-filled</Chip>}
      </PageHeader>
      {assigned.length > 0 && <div className="notice">Reassigned this session: {assigned.join(', ')}</div>}
      <Card title="Reassignment queue">
        <DataTable columns={columns} rows={items} empty="No orphaned reports 🎉" />
      </Card>
    </div>
  );
}
