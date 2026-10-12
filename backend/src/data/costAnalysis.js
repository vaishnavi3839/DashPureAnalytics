import { ISSUE } from './cleaner.js';
import { pearson, upperTukeyFence, sum, round } from './stats.js';

// Overall cost numbers and the usage-vs-AWS-cost discrepancy list (same logic as sql/06).
// Roughly 10% of snapshots sit above the fence by construction, so 2–3 per report
// (of 20) is noise; 5+ is well above that expectation and signals a persistent problem.

const PERSISTENT_OUTLIER_MIN_SNAPSHOTS = 5;
const WORST_SNAPSHOT_LIMIT = 10;

export function costSummary(store) {
  const reports = store.listReports();
  const negativeRows = store.rows.filter((r) => r.issues.includes(ISSUE.NEGATIVE_CREDITS));
  // Same population as sql/06: snapshots with at least one view.
  const withViews = store.rows.filter((r) => r.monthly_active_views > 0 && r.aws_hosting_cost_usd !== null);
  const withViewsAndValidCredits = withViews.filter((r) => r.snowflake_credits_valid !== null);
  const reportFence = upperTukeyFence(reports.map((r) => r.aws_cost_per_view));
  const totalCredits = sum(reports.map((r) => r.credits_consumed));

  return {
    credit_price_usd: store.creditPriceUsd,
    total_credits: round(totalCredits, 2),
    total_snowflake_cost_usd: round(totalCredits * store.creditPriceUsd, 2),
    total_aws_hosting_cost_usd: round(sum(reports.map((r) => r.aws_hosting_cost_usd)), 2),
    negative_credit_rows_excluded: negativeRows.length,
    negative_credits_sum: round(sum(negativeRows.map((r) => r.snowflake_credits_consumed)), 2),
    // If hosting spend followed demand this would be clearly positive.
    corr_views_vs_aws_cost: round(pearson(withViews.map((r) => r.monthly_active_views), withViews.map((r) => r.aws_hosting_cost_usd)), 3),
    corr_views_vs_credits: round(pearson(withViewsAndValidCredits.map((r) => r.monthly_active_views), withViewsAndValidCredits.map((r) => r.snowflake_credits_valid)), 3),
    snapshot_aws_cost_per_view_fence: round(store.awsCostPerViewFence, 4),
    report_aws_cost_per_view_fence: round(reportFence, 4),
    reports_over_fence: reports.filter((r) => r.aws_cost_per_view > reportFence).map((r) => r.report_id),
  };
}

function discrepancyReasons(report, fence) {
  const reasons = [];
  if (report.aws_cost_per_view > fence) {
    reasons.push(`AWS cost/view $${report.aws_cost_per_view} above report-level fence $${fence}`);
  }
  if (report.aws_cost_outlier_snapshots >= PERSISTENT_OUTLIER_MIN_SNAPSHOTS) {
    reasons.push(`${report.aws_cost_outlier_snapshots} of ${report.snapshots} snapshots with outlier AWS cost/view`);
  }
  if (report.zero_view_snapshots > 0) {
    reasons.push(`${report.zero_view_snapshots} snapshot(s) with cost but zero active views`);
  }
  return reasons;
}

export function costDiscrepancies(store) {
  const summary = costSummary(store);
  const fence = summary.report_aws_cost_per_view_fence;

  const reports = store
    .listReports()
    .map((r) => ({
      report_id: r.report_id,
      report_name: r.report_name,
      owner_email: r.owner_email,
      total_views: r.total_views,
      aws_hosting_cost_usd: r.aws_hosting_cost_usd,
      aws_cost_per_view: r.aws_cost_per_view,
      aws_cost_outlier_snapshots: r.aws_cost_outlier_snapshots,
      zero_view_snapshots: r.zero_view_snapshots,
      reasons: discrepancyReasons(r, fence),
    }))
    .filter((r) => r.reasons.length > 0)
    .sort((a, b) => b.aws_cost_per_view - a.aws_cost_per_view);

  const worstSnapshots = store.rows
    .filter((s) => s.issues.includes(ISSUE.AWS_COST_PER_VIEW_OUTLIER))
    .sort((a, b) => b.aws_cost_per_view - a.aws_cost_per_view)
    .slice(0, WORST_SNAPSHOT_LIMIT)
    .map((s) => ({
      row_number: s.row_number,
      report_id: s.report_id,
      snapshot_seq: s.snapshot_seq,
      monthly_active_views: s.monthly_active_views,
      aws_hosting_cost_usd: s.aws_hosting_cost_usd,
      aws_cost_per_view: round(s.aws_cost_per_view, 2),
    }));

  return {
    fence,
    snapshot_fence: summary.snapshot_aws_cost_per_view_fence,
    corr_views_vs_aws_cost: summary.corr_views_vs_aws_cost,
    total: reports.length,
    items: reports,
    worst_snapshots: worstSnapshots,
  };
}
