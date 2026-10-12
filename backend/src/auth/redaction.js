import { can, PERMISSIONS } from './rbac.js';

// Only roles with reports:read_cost may see cost fields. Used by both REST and WebSocket.

const REPORT_COST_FIELDS = new Set([
  'credits_consumed', 'negative_credit_rows_excluded', 'snowflake_cost_usd', 'aws_hosting_cost_usd', 'total_cost_usd',
  'snowflake_cost_per_view', 'aws_cost_per_view', 'total_cost_per_view', 'credits_per_1k_queries',
  'aws_cost_outlier_snapshots', 'credit_rank', 'credit_share_pct',
]);
const SNAPSHOT_COST_FIELDS = new Set(['snowflake_credits_consumed', 'snowflake_credits_valid', 'aws_hosting_cost_usd', 'aws_cost_per_view']);

const without = (obj, fields) => Object.fromEntries(Object.entries(obj).filter(([key]) => !fields.has(key)));

export function redactReport(user, report) {
  if (can(user, PERMISSIONS.REPORTS_READ_COST)) return report;
  const visible = without(report, REPORT_COST_FIELDS);
  if (report.history) visible.history = report.history.map((snapshot) => without(snapshot, SNAPSHOT_COST_FIELDS));
  return visible;
}

export function redactSnapshot(user, snapshot) {
  return can(user, PERMISSIONS.REPORTS_READ_COST) ? snapshot : without(snapshot, SNAPSHOT_COST_FIELDS);
}
