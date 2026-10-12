import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AlertEngine, RULES } from '../src/alerts/alertEngine.js';

const sample = (o) => ({ report_id: 'RPT_1', report_name: 'R', ...o });

test('raises once on breach, suppresses duplicates, resolves on recovery', () => {
  const e = new AlertEngine();
  const types = [];
  e.on('event', (ev) => types.push(ev.type));

  e.evaluate(sample({ avg_load_time_sec: 10 }));
  e.evaluate(sample({ avg_load_time_sec: 20 })); // raise WARNING
  e.evaluate(sample({ avg_load_time_sec: 22 })); // duplicate -> suppressed
  e.evaluate(sample({ avg_load_time_sec: 55 })); // escalate to CRITICAL
  e.evaluate(sample({ avg_load_time_sec: 5 })); //  resolve

  assert.deepEqual(types, ['alert.raised', 'alert.updated', 'alert.resolved']);
  assert.equal(e.stats.duplicates_suppressed, 1);
  assert.equal(e.stats.escalated, 1);
  assert.equal(e.summary().active_total, 0);
  assert.equal(e.list({ status: 'RESOLVED' })[0].occurrences, 3);
});

test('threshold is strictly greater than 15s', () => {
  const e = new AlertEngine();
  e.evaluate(sample({ avg_load_time_sec: 15 }));
  assert.equal(e.summary().active_total, 0);
  e.evaluate(sample({ avg_load_time_sec: 15.1 }));
  assert.equal(e.summary().active_warning, 1);
});

test('refresh failures alert; UNKNOWN status leaves state unchanged', () => {
  const e = new AlertEngine();
  e.evaluate(sample({ last_refresh_status: 'FAILED' }));
  assert.equal(e.summary().by_rule[RULES.REFRESH], 1);
  e.evaluate(sample({ last_refresh_status: 'UNKNOWN' }));
  assert.equal(e.summary().by_rule[RULES.REFRESH], 1);
  e.evaluate(sample({ last_refresh_status: 'SUCCESS' }));
  assert.equal(e.summary().by_rule[RULES.REFRESH], 0);
});

test('latency and refresh rules are tracked independently per report', () => {
  const e = new AlertEngine();
  e.evaluate(sample({ avg_load_time_sec: 40, last_refresh_status: 'TIMED_OUT' }));
  e.evaluate({ report_id: 'RPT_2', avg_load_time_sec: 40 });
  assert.equal(e.summary().active_total, 3);
});

test('acknowledge marks alert and records user', () => {
  const e = new AlertEngine();
  e.evaluate(sample({ avg_load_time_sec: 40 }));
  const [a] = e.list();
  const acked = e.acknowledge(a.id, 'admin@company.com');
  assert.equal(acked.status, 'ACKNOWLEDGED');
  assert.equal(acked.acknowledged_by, 'admin@company.com');
  assert.equal(e.acknowledge('ALT-99999', 'x'), null);
});
