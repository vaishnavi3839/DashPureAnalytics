import { EventEmitter } from 'node:events';

// The CSV is static, so this replays it row by row as if the rows were live telemetry.

const MIN_TICK_MS = 50;

export class TelemetrySimulator extends EventEmitter {
  #timer = null;

  constructor({ rows, alertEngine, tickMs = 750, loop = true }) {
    super();
    this.rows = rows;
    this.alertEngine = alertEngine;
    this.tickMs = tickMs;
    this.loop = loop;
    this.position = 0; // index of the next row to replay
    this.cycle = 1;
  }

  get isRunning() {
    return this.#timer !== null;
  }

  status() {
    return {
      running: this.isRunning,
      position: this.position,
      total_rows: this.rows.length,
      cycle: this.cycle,
      tick_ms: this.tickMs,
      loop: this.loop,
      progress_pct: Number(((this.position / this.rows.length) * 100).toFixed(1)),
    };
  }

  start({ tickMs } = {}) {
    if (tickMs) this.tickMs = Math.max(MIN_TICK_MS, Number(tickMs));
    this.#clearTimer();
    this.#timer = setInterval(() => this.step(), this.tickMs);
    return this.#announce();
  }

  stop() {
    this.#clearTimer();
    return this.#announce();
  }

  reset() {
    this.#clearTimer();
    this.position = 0;
    this.cycle = 1;
    this.alertEngine.reset();
    return this.#announce();
  }

  step() {
    if (this.position >= this.rows.length) {
      if (!this.loop) {
        this.stop();
        return null;
      }
      this.position = 0;
      this.cycle += 1;
    }
    const row = this.rows[this.position++];
    const sample = {
      report_id: row.report_id,
      report_name: row.report_name,
      snapshot_seq: row.snapshot_seq,
      row_number: row.row_number,
      avg_load_time_sec: row.avg_load_time_sec,
      latency_band: row.latency_band,
      last_refresh_status: row.last_refresh_status,
      monthly_active_views: row.monthly_active_views,
      concurrent_user_peak: row.concurrent_user_peak,
      snowflake_credits_valid: row.snowflake_credits_valid, // null when the source value was negative
      source: 'simulator',
      ts: new Date().toISOString(),
    };
    this.emit('telemetry', sample);
    this.alertEngine.evaluate(sample);
    return sample;
  }

  #clearTimer() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }

  #announce() {
    const status = this.status();
    this.emit('status', status);
    return status;
  }
}
