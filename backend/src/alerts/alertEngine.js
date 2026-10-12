import { EventEmitter } from 'node:events';

// Alerts fire when a report's state changes, not on every slow sample. Most samples
// are over 15s, so alerting on each one would just be noise.
// Per report and rule: ok -> breach raises, a severity change updates,
// the same severity only bumps a counter, and going back to ok resolves.

export const RULES = Object.freeze({
  LATENCY: 'LATENCY_SLA',
  REFRESH: 'REFRESH_FAILURE',
});

const SEVERITY_RANK = { WARNING: 1, CRITICAL: 2 };
const DEFAULT_HISTORY_LIMIT = 500;

export class AlertEngine extends EventEmitter {
  constructor({ latencyWarnSec = 15, latencyCriticalSec = 30, historyLimit = DEFAULT_HISTORY_LIMIT } = {}) {
    super();
    this.thresholds = { warn: latencyWarnSec, critical: latencyCriticalSec };
    this.historyLimit = historyLimit;
    this.reset();
  }

  reset() {
    this.active = new Map(); // `${report_id}:${rule}` -> open alert
    this.history = []; //       resolved alerts, newest first
    this.nextId = 1;
    this.stats = { samples_evaluated: 0, raised: 0, escalated: 0, de_escalated: 0, resolved: 0, duplicates_suppressed: 0, acknowledged: 0 };
  }

  // null means healthy. Rules the sample has no data for are left out, so an UNKNOWN
  // refresh status neither raises nor clears an alert.
  assess(sample) {
    const verdicts = {};
    const seconds = sample.avg_load_time_sec;
    if (typeof seconds === 'number') {
      const { warn, critical } = this.thresholds;
      if (seconds > critical) {
        verdicts[RULES.LATENCY] = { severity: 'CRITICAL', value: seconds, threshold: critical, message: `Load time ${seconds}s exceeds critical threshold of ${critical}s` };
      } else if (seconds > warn) {
        verdicts[RULES.LATENCY] = { severity: 'WARNING', value: seconds, threshold: warn, message: `Load time ${seconds}s exceeds ${warn}s SLA` };
      } else {
        verdicts[RULES.LATENCY] = null;
      }
    }

    const status = sample.last_refresh_status;
    if (status === 'FAILED') {
      verdicts[RULES.REFRESH] = { severity: 'CRITICAL', value: status, threshold: 'SUCCESS', message: 'Automated data refresh FAILED' };
    } else if (status === 'TIMED_OUT') {
      verdicts[RULES.REFRESH] = { severity: 'WARNING', value: status, threshold: 'SUCCESS', message: 'Automated data refresh TIMED OUT' };
    } else if (status === 'SUCCESS') {
      verdicts[RULES.REFRESH] = null;
    }
    return verdicts;
  }

  evaluate(sample) {
    this.stats.samples_evaluated += 1;
    const now = new Date().toISOString();
    const events = [];

    for (const [rule, verdict] of Object.entries(this.assess(sample))) {
      const key = `${sample.report_id}:${rule}`;
      const open = this.active.get(key);
      let event = null;
      if (verdict && !open) event = this.#raise(key, rule, sample, verdict, now);
      else if (verdict && open) event = this.#update(open, verdict, now);
      else if (!verdict && open) event = this.#resolve(key, open, now);
      if (event) events.push(event);
    }
    return events;
  }

  acknowledge(id, userEmail) {
    const alert = [...this.active.values()].find((a) => a.id === id);
    if (!alert) return null;
    if (alert.status !== 'ACKNOWLEDGED') {
      alert.status = 'ACKNOWLEDGED';
      alert.acknowledged_by = userEmail;
      alert.acknowledged_at = new Date().toISOString();
      this.stats.acknowledged += 1;
      this.#emit('alert.acknowledged', alert);
    }
    return alert;
  }

  list({ status, severity, reportId, limit = 200 } = {}) {
    let alerts = [...this.active.values()].sort((a, b) => b.updated_at.localeCompare(a.updated_at) || b.id.localeCompare(a.id));
    const includeResolved = !status || status === 'RESOLVED' || status === 'ALL';
    if (includeResolved) alerts = alerts.concat(this.history);
    if (status && status !== 'ALL') alerts = alerts.filter((a) => a.status === status);
    if (severity) alerts = alerts.filter((a) => a.severity === severity);
    if (reportId) alerts = alerts.filter((a) => a.report_id === reportId);
    return alerts.slice(0, limit);
  }

  summary() {
    const open = [...this.active.values()];
    return {
      active_total: open.length,
      active_critical: open.filter((a) => a.severity === 'CRITICAL').length,
      active_warning: open.filter((a) => a.severity === 'WARNING').length,
      unacknowledged: open.filter((a) => a.status === 'ACTIVE').length,
      by_rule: Object.fromEntries(Object.values(RULES).map((rule) => [rule, open.filter((a) => a.rule === rule).length])),
      stats: { ...this.stats },
      thresholds: { ...this.thresholds },
    };
  }

  #raise(key, rule, sample, verdict, now) {
    const alert = {
      id: `ALT-${String(this.nextId++).padStart(5, '0')}`,
      key,
      rule,
      report_id: sample.report_id,
      report_name: sample.report_name ?? null,
      severity: verdict.severity,
      message: verdict.message,
      value: verdict.value,
      threshold: verdict.threshold,
      source: sample.source ?? 'simulator',
      snapshot_seq: sample.snapshot_seq ?? null,
      status: 'ACTIVE',
      raised_at: now,
      updated_at: now,
      occurrences: 1,
      acknowledged_by: null,
      acknowledged_at: null,
      resolved_at: null,
    };
    this.active.set(key, alert);
    this.stats.raised += 1;
    return this.#emit('alert.raised', alert);
  }

  #update(alert, verdict, now) {
    alert.occurrences += 1;
    alert.value = verdict.value;
    alert.updated_at = now;
    if (verdict.severity === alert.severity) {
      this.stats.duplicates_suppressed += 1;
      return null;
    }
    const escalated = SEVERITY_RANK[verdict.severity] > SEVERITY_RANK[alert.severity];
    Object.assign(alert, { severity: verdict.severity, message: verdict.message, threshold: verdict.threshold });
    this.stats[escalated ? 'escalated' : 'de_escalated'] += 1;
    return this.#emit('alert.updated', { ...alert, change: escalated ? 'ESCALATED' : 'DE_ESCALATED' });
  }

  #resolve(key, alert, now) {
    Object.assign(alert, { status: 'RESOLVED', resolved_at: now, updated_at: now });
    this.active.delete(key);
    this.history.unshift(alert);
    this.history.length = Math.min(this.history.length, this.historyLimit);
    this.stats.resolved += 1;
    return this.#emit('alert.resolved', alert);
  }

  #emit(type, alert) {
    const event = { type, alert: { ...alert } };
    this.emit('event', event);
    return event;
  }
}
