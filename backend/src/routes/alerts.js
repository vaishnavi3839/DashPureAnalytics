import express from 'express';
import { requirePermission, PERMISSIONS } from '../auth/rbac.js';
import { normaliseStatus } from '../data/cleaner.js';

const MAX_ALERT_LIMIT = 1000;
const MAX_REPORTED_LOAD_SEC = 3600;
const REPORT_ID_PATTERN = /^RPT_\d+$/i;

const validationError = (res, message) => res.status(400).json({ error: 'VALIDATION_ERROR', message });

export function alertRoutes({ store, alertEngine, simulator }) {
  const router = express.Router();
  const canRead = requirePermission(PERMISSIONS.ALERTS_READ);
  const canControlSimulator = requirePermission(PERMISSIONS.SIMULATOR_CONTROL);

  router.get('/alerts', canRead, (req, res) => {
    const { status, severity, report_id: reportId } = req.query;
    const limit = Math.min(Number.parseInt(req.query.limit, 10) || 200, MAX_ALERT_LIMIT);
    const items = alertEngine.list({ status: status?.toUpperCase(), severity: severity?.toUpperCase(), reportId: reportId?.toUpperCase(), limit });
    res.json({ total: items.length, items });
  });

  router.get('/alerts/summary', canRead, (_req, res) => res.json(alertEngine.summary()));

  router.post('/alerts/:id/ack', requirePermission(PERMISSIONS.ALERTS_ACK), (req, res) => {
    const alert = alertEngine.acknowledge(req.params.id, req.user.email);
    if (!alert) return res.status(404).json({ error: 'NOT_FOUND', message: `No active alert ${req.params.id}` });
    return res.json(alert);
  });

  // Real client-side measurements: the dashboard reports how long a report view took to load.
  router.post('/telemetry', (req, res) => {
    const { report_id: reportId, avg_load_time_sec: loadTime, last_refresh_status: status } = req.body ?? {};
    if (!reportId || !REPORT_ID_PATTERN.test(reportId)) return validationError(res, 'report_id must look like RPT_123');
    if (loadTime === undefined && status === undefined) return validationError(res, 'Provide avg_load_time_sec and/or last_refresh_status');
    if (loadTime !== undefined && (typeof loadTime !== 'number' || loadTime < 0 || loadTime > MAX_REPORTED_LOAD_SEC)) {
      return validationError(res, `avg_load_time_sec must be a number between 0 and ${MAX_REPORTED_LOAD_SEC}`);
    }
    const events = alertEngine.evaluate({
      report_id: reportId.toUpperCase(),
      report_name: store.getReport(reportId)?.report_name ?? null,
      avg_load_time_sec: loadTime,
      last_refresh_status: status === undefined ? undefined : normaliseStatus(status),
      source: `client:${req.user.email}`,
    });
    return res.status(202).json({ accepted: true, events: events.map((e) => ({ type: e.type, alert_id: e.alert.id, severity: e.alert.severity })) });
  });

  router.get('/simulator', canRead, (_req, res) => res.json(simulator.status()));
  router.post('/simulator/start', canControlSimulator, (req, res) => res.json(simulator.start({ tickMs: req.body?.tick_ms })));
  router.post('/simulator/stop', canControlSimulator, (_req, res) => res.json(simulator.stop()));
  router.post('/simulator/reset', canControlSimulator, (_req, res) => res.json(simulator.reset()));
  router.post('/simulator/step', canControlSimulator, (_req, res) => res.json({ sample: simulator.step(), status: simulator.status() }));

  return router;
}
