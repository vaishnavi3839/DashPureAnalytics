import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanRows, normaliseOwner, normaliseStatus, ISSUE } from '../src/data/cleaner.js';
import { loadRawCsv, createStore } from '../src/data/store.js';
import { dataQualityReport } from '../src/data/qualityReport.js';
import { config } from '../src/config.js';

const T = { warn: 15, critical: 30 };
const raw = (o) => ({
  report_id: 'RPT_1', report_name: 'R', owner_email: 'a@company.com', last_refresh_status: 'SUCCESS',
  monthly_active_views: '100', snowflake_credits_consumed: '10', avg_load_time_sec: '5',
  aws_hosting_cost_usd: '50', query_count_last_30d: '10', concurrent_user_peak: '3', ...o,
});

test('orphan placeholders normalise to null owner', () => {
  for (const v of ['nan', 'NaN', 'ORPHANED_REPORT', '', '  ', null, undefined]) {
    const r = normaliseOwner(v);
    assert.equal(r.owner, null, `value ${v}`);
    assert.equal(r.isOrphaned, true);
  }
  assert.deepEqual(normaliseOwner(' User_7@Company.com '), { owner: 'user_7@company.com', isOrphaned: false, issue: null });
  assert.equal(normaliseOwner('not-an-email').issue, ISSUE.INVALID_OWNER_EMAIL);
});

test('refresh status normalisation', () => {
  assert.equal(normaliseStatus(' timed out '), 'TIMED_OUT');
  assert.equal(normaliseStatus('failed'), 'FAILED');
  assert.equal(normaliseStatus('weird'), 'UNKNOWN');
});

test('negative credits are flagged and excluded from valid credits', () => {
  const { rows } = cleanRows([raw({ snowflake_credits_consumed: '-4.2' })], T);
  assert.ok(rows[0].issues.includes(ISSUE.NEGATIVE_CREDITS));
  assert.equal(rows[0].snowflake_credits_consumed, -4.2); // raw value kept for audit
  assert.equal(rows[0].snowflake_credits_valid, null);
});

test('latency bands at thresholds (strictly greater than)', () => {
  const { rows } = cleanRows([raw({ avg_load_time_sec: '15' }), raw({ avg_load_time_sec: '15.1' }), raw({ avg_load_time_sec: '30.1' })], T);
  assert.deepEqual(rows.map((r) => r.latency_band), ['OK', 'WARNING', 'CRITICAL']);
});

test('zero views with cost is flagged and does not divide by zero', () => {
  const { rows } = cleanRows([raw({ monthly_active_views: '0' })], T);
  assert.ok(rows[0].issues.includes(ISSUE.ZERO_VIEWS_WITH_COST));
  assert.equal(rows[0].aws_cost_per_view, null);
});

test('snapshot sequence increments per report', () => {
  const { rows } = cleanRows([raw({}), raw({ report_id: 'RPT_2' }), raw({ owner_email: 'b@company.com' })], T);
  assert.deepEqual(rows.map((r) => r.snapshot_seq), [1, 1, 2]);
  assert.ok(rows[2].issues.includes(ISSUE.OWNER_CHANGED));
});

test('real dataset: injected anomalies are all detected', () => {
  const store = createStore({ rawRows: loadRawCsv(config.dataFile), config });
  const dq = dataQualityReport(store);
  const count = (code) => dq.issues.find((i) => i.code === code).count;
  assert.equal(dq.rows_total, 2000);
  assert.equal(dq.unique_reports, 100);
  assert.equal(count(ISSUE.ORPHANED_OWNER), 245); // 128 'nan' + 117 'ORPHANED_REPORT'
  assert.equal(count(ISSUE.NEGATIVE_CREDITS), 24);
  assert.equal(count(ISSUE.UNKNOWN_REFRESH_STATUS), 100);
  assert.equal(count(ISSUE.LATENCY_BREACH), 1490);
  assert.equal(count(ISSUE.ZERO_VIEWS_WITH_COST), 4);
  // Cost maths never includes negative credits
  for (const r of store.listReports()) assert.ok(r.credits_consumed >= 0);
});
