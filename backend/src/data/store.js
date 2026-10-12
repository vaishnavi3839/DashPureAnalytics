import fs from 'node:fs';
import { parse } from 'csv-parse/sync';
import { cleanRows, ISSUE } from './cleaner.js';
import { quantile, sum, mean, round } from './stats.js';

// Loads the CSV once and builds one summary per report.

export function loadRawCsv(file) {
  return parse(fs.readFileSync(file, 'utf8'), { columns: true, skip_empty_lines: true });
}

const count = (rows, predicate) => rows.filter(predicate).length;
const hasIssue = (code) => (row) => row.issues.includes(code);

function summariseOwnership(snapshots, reassignment) {
  const latest = snapshots.at(-1);
  const owner = reassignment ? reassignment.owner_email : latest.owner_email;
  return {
    owner_email: owner,
    is_orphaned: !owner,
    // Most recent non-null owner: the natural person to hand an orphaned report back to.
    last_known_owner: snapshots.findLast((s) => s.owner_email)?.owner_email ?? null,
    orphaned_snapshots: count(snapshots, (s) => s.is_orphaned),
    owner_changes: count(snapshots, hasIssue(ISSUE.OWNER_CHANGED)),
    owner_reassignment: reassignment ?? null,
  };
}

function summariseHealth(snapshots) {
  const latest = snapshots.at(-1);
  const withKnownStatus = snapshots.filter((s) => s.last_refresh_status !== 'UNKNOWN');
  const latencies = snapshots.map((s) => s.avg_load_time_sec).filter((v) => v !== null).sort((a, b) => a - b);
  return {
    last_refresh_status: latest.last_refresh_status,
    refresh_failure_rate: withKnownStatus.length ? round(count(withKnownStatus, (s) => s.is_refresh_failure) / withKnownStatus.length, 3) : null,
    failed_refreshes: count(snapshots, (s) => s.last_refresh_status === 'FAILED'),
    timed_out_refreshes: count(snapshots, (s) => s.last_refresh_status === 'TIMED_OUT'),
    unknown_refreshes: count(snapshots, (s) => s.last_refresh_status === 'UNKNOWN'),
    latest_load_time_sec: latest.avg_load_time_sec,
    latest_latency_band: latest.latency_band,
    avg_load_time_sec: round(mean(latencies), 1),
    p95_load_time_sec: round(quantile(latencies, 0.95), 1),
    max_load_time_sec: latencies.at(-1) ?? null,
    latency_breaches: count(snapshots, hasIssue(ISSUE.LATENCY_BREACH)),
    avg_monthly_active_views: round(mean(snapshots.map((s) => s.monthly_active_views ?? 0)), 0),
    total_views: sum(snapshots.map((s) => s.monthly_active_views ?? 0)),
    peak_concurrent_users: Math.max(...snapshots.map((s) => s.concurrent_user_peak ?? 0)),
  };
}

// Same formula as sql/05. Bad-credit rows are dropped from both the cost and the views.
function summariseCost(snapshots, creditPriceUsd) {
  const validCreditRows = snapshots.filter((s) => s.snowflake_credits_valid !== null);
  const credits = sum(validCreditRows.map((s) => s.snowflake_credits_valid));
  const viewsOnValidRows = sum(validCreditRows.map((s) => s.monthly_active_views ?? 0));
  const queriesOnValidRows = sum(validCreditRows.map((s) => s.query_count_last_30d ?? 0));
  const totalViews = sum(snapshots.map((s) => s.monthly_active_views ?? 0));
  const awsCost = sum(snapshots.map((s) => s.aws_hosting_cost_usd ?? 0));

  const snowflakeCost = credits * creditPriceUsd;
  const snowflakePerView = viewsOnValidRows > 0 ? snowflakeCost / viewsOnValidRows : null;
  const awsPerView = totalViews > 0 ? awsCost / totalViews : null;

  return {
    credits_consumed: round(credits, 2),
    negative_credit_rows_excluded: snapshots.length - validCreditRows.length,
    snowflake_cost_usd: round(snowflakeCost, 2),
    aws_hosting_cost_usd: round(awsCost, 2),
    total_cost_usd: round(snowflakeCost + awsCost, 2),
    snowflake_cost_per_view: round(snowflakePerView, 4),
    aws_cost_per_view: round(awsPerView, 4),
    total_cost_per_view: snowflakePerView !== null && awsPerView !== null ? round(snowflakePerView + awsPerView, 4) : null,
    credits_per_1k_queries: queriesOnValidRows > 0 ? round((credits / queriesOnValidRows) * 1000, 3) : null,
    aws_cost_outlier_snapshots: count(snapshots, hasIssue(ISSUE.AWS_COST_PER_VIEW_OUTLIER)),
    zero_view_snapshots: count(snapshots, hasIssue(ISSUE.ZERO_VIEWS_WITH_COST)),
  };
}

function rankByCredits(reports) {
  const totalCredits = sum(reports.map((r) => r.credits_consumed));
  [...reports]
    .sort((a, b) => b.credits_consumed - a.credits_consumed)
    .forEach((report, i) => {
      report.credit_rank = i + 1;
      report.credit_share_pct = totalCredits > 0 ? round((report.credits_consumed / totalCredits) * 100, 2) : null;
    });
}

export function createStore({ rawRows, config }) {
  const thresholds = { warn: config.latencyWarnSec, critical: config.latencyCriticalSec };
  const { rows, awsCostPerViewFence } = cleanRows(rawRows, thresholds);

  const snapshotsByReport = new Map();
  for (const row of rows) {
    if (!snapshotsByReport.has(row.report_id)) snapshotsByReport.set(row.report_id, []);
    snapshotsByReport.get(row.report_id).push(row);
  }

  // Owner reassignments made in the portal. Held in memory for the demo; production
  // would persist these to an OWNER_OVERRIDES table.
  const reassignments = new Map();
  let reportCache = null;

  function buildReports() {
    const reports = [...snapshotsByReport.entries()].map(([reportId, snapshots]) => ({
      report_id: reportId,
      report_name: snapshots.at(-1).report_name,
      snapshots: snapshots.length,
      ...summariseOwnership(snapshots, reassignments.get(reportId)),
      ...summariseHealth(snapshots),
      ...summariseCost(snapshots, config.creditPriceUsd),
    }));
    rankByCredits(reports);
    return new Map(reports.map((r) => [r.report_id, r]));
  }

  function reportsById() {
    reportCache ??= buildReports();
    return reportCache;
  }

  const listReports = () => [...reportsById().values()];

  return {
    rows,
    awsCostPerViewFence,
    creditPriceUsd: config.creditPriceUsd,

    listReports,

    getReport(reportId) {
      const id = reportId.toUpperCase();
      const report = reportsById().get(id);
      return report ? { ...report, history: snapshotsByReport.get(id) } : null;
    },

    reassignOwner(reportId, ownerEmail, actorEmail) {
      const id = reportId.toUpperCase();
      if (!snapshotsByReport.has(id)) return null;
      reassignments.set(id, { owner_email: ownerEmail, reassigned_by: actorEmail, reassigned_at: new Date().toISOString() });
      reportCache = null;
      return reportsById().get(id);
    },

    healthSummary() {
      const latestSnapshots = [...snapshotsByReport.values()].map((s) => s.at(-1));
      const statusCounts = { SUCCESS: 0, FAILED: 0, TIMED_OUT: 0, UNKNOWN: 0 };
      const bandCounts = { OK: 0, WARNING: 0, CRITICAL: 0, UNKNOWN: 0 };
      for (const s of latestSnapshots) {
        statusCounts[s.last_refresh_status] += 1;
        bandCounts[s.latency_band] += 1;
      }
      const withKnownStatus = rows.filter((r) => r.last_refresh_status !== 'UNKNOWN');
      return {
        reports_monitored: snapshotsByReport.size,
        snapshots_ingested: rows.length,
        orphaned_reports: count(listReports(), (r) => r.is_orphaned),
        latest_refresh_status: statusCounts,
        latest_latency_bands: bandCounts,
        refresh_success_rate_all_snapshots: round(count(withKnownStatus, (r) => !r.is_refresh_failure) / withKnownStatus.length, 3),
        latency_breach_rate_all_snapshots: round(count(rows, (r) => r.latency_band !== 'OK') / rows.length, 3),
        avg_load_time_sec: round(mean(rows.map((r) => r.avg_load_time_sec).filter((v) => v !== null)), 1),
        thresholds: { latency_warn_sec: thresholds.warn, latency_critical_sec: thresholds.critical },
      };
    },
  };
}
