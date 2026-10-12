import { ISSUE, ISSUE_DESCRIPTIONS } from './cleaner.js';
import { round } from './stats.js';

export function dataQualityReport(store) {
  const { rows } = store;
  const snapshotCounts = new Map();
  for (const row of rows) snapshotCounts.set(row.report_id, (snapshotCounts.get(row.report_id) ?? 0) + 1);

  const issueCounts = Object.fromEntries(Object.keys(ISSUE).map((code) => [code, 0]));
  for (const row of rows) for (const code of new Set(row.issues)) issueCounts[code] += 1;

  const orphanedRawValues = {};
  for (const row of rows.filter((r) => r.is_orphaned)) {
    const raw = String(row.owner_email_raw ?? '').trim() || '(blank)';
    orphanedRawValues[raw] = (orphanedRawValues[raw] ?? 0) + 1;
  }

  const rowsWith = (code) => rows.filter((r) => r.issues.includes(code));

  return {
    rows_total: rows.length,
    rows_with_any_issue: rows.filter((r) => r.issues.length > 0).length,
    unique_reports: snapshotCounts.size,
    snapshots_per_report: [...new Set(snapshotCounts.values())],
    issues: Object.entries(issueCounts).map(([code, count]) => ({
      code,
      count,
      pct_of_rows: round((count / rows.length) * 100, 1),
      description: ISSUE_DESCRIPTIONS[code],
    })),
    orphaned_owner_raw_values: orphanedRawValues,
    negative_credit_rows: rowsWith(ISSUE.NEGATIVE_CREDITS).map((r) => ({
      row_number: r.row_number,
      report_id: r.report_id,
      snowflake_credits_consumed: r.snowflake_credits_consumed,
    })),
    zero_view_rows: rowsWith(ISSUE.ZERO_VIEWS_WITH_COST).map((r) => ({
      row_number: r.row_number,
      report_id: r.report_id,
      aws_hosting_cost_usd: r.aws_hosting_cost_usd,
      snowflake_credits_consumed: r.snowflake_credits_consumed,
    })),
    assumptions: [
      'Each report_id appears 20 times in file order (RPT_200..RPT_299 repeated). With no timestamp column, each repeat is treated as a successive monitoring snapshot (snapshot_seq 1..20); the last one is the "current" state.',
      `Snowflake credits are priced at $${store.creditPriceUsd.toFixed(2)}/credit (configurable via CREDIT_PRICE_USD).`,
      'Rows with negative credits are kept for audit but excluded from cost attribution (numerator AND denominator).',
      "Owner placeholders ('nan', 'ORPHANED_REPORT', blank) are normalised to NULL and the report flagged as orphaned.",
    ],
  };
}
