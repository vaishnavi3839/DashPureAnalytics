import express from 'express';
import { requirePermission, PERMISSIONS } from '../auth/rbac.js';
import { dataQualityReport } from '../data/qualityReport.js';

// No auth: used by uptime checks.
export function systemRoutes({ store, simulator, websocket }) {
  const router = express.Router();
  router.get('/system/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime_sec: Math.round(process.uptime()),
      websocket_clients: websocket?.clientCount() ?? 0,
      simulator: simulator.status(),
      reports_loaded: store.listReports().length,
    });
  });
  return router;
}

export function healthRoutes({ store, alertEngine }) {
  const router = express.Router();
  router.get('/auth/me', (req, res) => res.json({ user: req.user }));
  router.get('/health/summary', requirePermission(PERMISSIONS.REPORTS_READ), (_req, res) => {
    res.json({ ...store.healthSummary(), alerts: alertEngine.summary() });
  });
  router.get('/data-quality', requirePermission(PERMISSIONS.QUALITY_READ), (_req, res) => res.json(dataQualityReport(store)));
  return router;
}
