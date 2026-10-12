import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../src/config.js';
import { loadRawCsv, createStore } from '../src/data/store.js';
import { costSummary, costDiscrepancies } from '../src/data/costAnalysis.js';

const store = createStore({ rawRows: loadRawCsv(config.dataFile), config });

test('negative credits never reach the cost totals', () => {
  const summary = costSummary(store);
  assert.equal(summary.negative_credit_rows_excluded, 24);
  const validCredits = store.rows.reduce((total, r) => total + (r.snowflake_credits_valid ?? 0), 0);
  assert.ok(Math.abs(summary.total_credits - validCredits) < 0.01);
});

test('every flagged discrepancy carries at least one reason and sorts by AWS cost per view', () => {
  const { items, worst_snapshots: worst } = costDiscrepancies(store);
  assert.equal(items.length, 11); // matches sql/06 RPT_AWS_COST_DISCREPANCY
  assert.ok(items.every((r) => r.reasons.length > 0));
  for (let i = 1; i < items.length; i++) assert.ok(items[i - 1].aws_cost_per_view >= items[i].aws_cost_per_view);
  assert.deepEqual(worst[0], { row_number: 402, report_id: 'RPT_201', snapshot_seq: 5, monthly_active_views: 2, aws_hosting_cost_usd: 359.15, aws_cost_per_view: 179.58 });
});

test('unit cost per view matches the SQL definition for RPT_223', () => {
  const report = store.getReport('RPT_223');
  assert.equal(report.total_cost_per_view, 4.9934); // sql/05 RPT_UNIT_COST
  assert.equal(report.credit_rank, 1);
});

test('usage-vs-cost correlations match sql/06 (snapshots with at least one view)', () => {
  const summary = costSummary(store);
  assert.equal(summary.corr_views_vs_aws_cost, -0.029);
  assert.equal(summary.corr_views_vs_credits, 0.045);
});
