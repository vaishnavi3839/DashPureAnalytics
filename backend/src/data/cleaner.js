import { upperTukeyFence } from './stats.js';

// Turns raw CSV rows into typed rows. Nothing is dropped: problems are listed in row.issues
// and the code that uses the rows decides what to skip.

export const ISSUE_DESCRIPTIONS = Object.freeze({
  ORPHANED_OWNER: "Report has no owner (blank, 'nan' or 'ORPHANED_REPORT' placeholder).",
  INVALID_OWNER_EMAIL: 'Owner value is present but is not a valid email address.',
  NEGATIVE_CREDITS: 'Negative Snowflake credit consumption is impossible; kept for audit, excluded from cost maths.',
  NON_NUMERIC_VALUE: 'A numeric column contained a non-numeric value; set to null.',
  UNKNOWN_REFRESH_STATUS: "Refresh status is 'UNKNOWN' or not one of SUCCESS / FAILED / TIMED_OUT.",
  LATENCY_BREACH: 'Average load time is above the SLA warning threshold.',
  LATENCY_CRITICAL: 'Average load time is above the critical threshold.',
  ZERO_VIEWS_WITH_COST: 'Report incurred AWS/Snowflake cost but had zero active views.',
  AWS_COST_PER_VIEW_OUTLIER: 'AWS hosting cost per active view is a statistical outlier (> Q3 + 1.5×IQR).',
  OWNER_CHANGED: 'Owner email changed compared with the previous snapshot of the same report.',
});

export const ISSUE = Object.freeze(Object.fromEntries(Object.keys(ISSUE_DESCRIPTIONS).map((code) => [code, code])));

const ORPHAN_PLACEHOLDERS = new Set(['', 'nan', 'null', 'none', 'n/a', 'orphaned_report', 'unknown']);
const REFRESH_STATUSES = new Set(['SUCCESS', 'FAILED', 'TIMED_OUT']);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NUMERIC_COLUMNS = [
  'monthly_active_views',
  'snowflake_credits_consumed',
  'avg_load_time_sec',
  'aws_hosting_cost_usd',
  'query_count_last_30d',
  'concurrent_user_peak',
];

export function isValidEmail(value) {
  return typeof value === 'string' && EMAIL_PATTERN.test(value);
}

function parseNumber(raw) {
  const text = String(raw ?? '').trim();
  if (text === '' || text.toLowerCase() === 'nan') return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

export function normaliseOwner(raw) {
  const text = String(raw ?? '').trim().toLowerCase();
  if (ORPHAN_PLACEHOLDERS.has(text)) return { owner: null, isOrphaned: true, issue: ISSUE.ORPHANED_OWNER };
  if (!isValidEmail(text)) return { owner: null, isOrphaned: true, issue: ISSUE.INVALID_OWNER_EMAIL };
  return { owner: text, isOrphaned: false, issue: null };
}

export function normaliseStatus(raw) {
  const status = String(raw ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_');
  return REFRESH_STATUSES.has(status) ? status : 'UNKNOWN';
}

export function latencyBand(seconds, { warn, critical }) {
  if (seconds === null) return 'UNKNOWN';
  if (seconds > critical) return 'CRITICAL';
  if (seconds > warn) return 'WARNING';
  return 'OK';
}

function cleanRow(raw, index, snapshotSeq, previousOwner, thresholds) {
  const issues = [];
  const { owner, isOrphaned, issue: ownerIssue } = normaliseOwner(raw.owner_email);
  if (ownerIssue) issues.push(ownerIssue);
  if (snapshotSeq > 1 && previousOwner !== owner) issues.push(ISSUE.OWNER_CHANGED);

  const status = normaliseStatus(raw.last_refresh_status);
  if (status === 'UNKNOWN') issues.push(ISSUE.UNKNOWN_REFRESH_STATUS);

  const numbers = {};
  for (const column of NUMERIC_COLUMNS) {
    numbers[column] = parseNumber(raw[column]);
    if (numbers[column] === null && String(raw[column] ?? '').trim() !== '') issues.push(ISSUE.NON_NUMERIC_VALUE);
  }

  const credits = numbers.snowflake_credits_consumed;
  if (credits !== null && credits < 0) issues.push(ISSUE.NEGATIVE_CREDITS);

  const band = latencyBand(numbers.avg_load_time_sec, thresholds);
  if (band === 'WARNING' || band === 'CRITICAL') issues.push(ISSUE.LATENCY_BREACH);
  if (band === 'CRITICAL') issues.push(ISSUE.LATENCY_CRITICAL);

  const views = numbers.monthly_active_views;
  const awsCost = numbers.aws_hosting_cost_usd;
  if (views === 0 && ((awsCost ?? 0) > 0 || (credits ?? 0) > 0)) issues.push(ISSUE.ZERO_VIEWS_WITH_COST);

  return {
    row_number: index + 1, // 1-based position in the source file, for traceability
    snapshot_seq: snapshotSeq,
    report_id: String(raw.report_id ?? '').trim().toUpperCase(),
    report_name: String(raw.report_name ?? '').trim(),
    owner_email: owner,
    owner_email_raw: raw.owner_email,
    is_orphaned: isOrphaned,
    last_refresh_status: status,
    is_refresh_failure: status === 'FAILED' || status === 'TIMED_OUT',
    monthly_active_views: views,
    snowflake_credits_consumed: credits,
    snowflake_credits_valid: credits !== null && credits >= 0 ? credits : null,
    avg_load_time_sec: numbers.avg_load_time_sec,
    latency_band: band,
    aws_hosting_cost_usd: awsCost,
    aws_cost_per_view: views > 0 && awsCost !== null ? awsCost / views : null,
    query_count_last_30d: numbers.query_count_last_30d,
    concurrent_user_peak: numbers.concurrent_user_peak,
    issues,
  };
}

// The file has no dates, so the nth time a report appears is treated as its nth snapshot.
export function cleanRows(rawRows, thresholds) {
  const snapshotsSeen = new Map();
  const lastOwner = new Map();

  const rows = rawRows.map((raw, index) => {
    const reportId = String(raw.report_id ?? '').trim().toUpperCase();
    const snapshotSeq = (snapshotsSeen.get(reportId) ?? 0) + 1;
    snapshotsSeen.set(reportId, snapshotSeq);
    const row = cleanRow(raw, index, snapshotSeq, lastOwner.get(reportId), thresholds);
    lastOwner.set(reportId, row.owner_email);
    return row;
  });

  // Users-vs-AWS-cost discrepancy needs the whole population, so it is a second pass.
  const awsCostPerViewFence = upperTukeyFence(rows.map((r) => r.aws_cost_per_view));
  if (awsCostPerViewFence !== null) {
    for (const row of rows) {
      if (row.aws_cost_per_view > awsCostPerViewFence) row.issues.push(ISSUE.AWS_COST_PER_VIEW_OUTLIER);
    }
  }

  return { rows, awsCostPerViewFence };
}
