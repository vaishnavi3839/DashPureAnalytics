import express from 'express';
import { requirePermission, PERMISSIONS } from '../auth/rbac.js';
import { redactReport } from '../auth/redaction.js';
import { isValidEmail } from '../data/cleaner.js';
import { sortAndPaginate } from './listQuery.js';

function matchesFilters(report, { search, status, band, orphaned }) {
  if (search) {
    const q = String(search).toLowerCase();
    const haystack = [report.report_id, report.report_name, report.owner_email ?? ''].join(' ').toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  if (status && report.last_refresh_status !== String(status).toUpperCase()) return false;
  if (band && report.latest_latency_band !== String(band).toUpperCase()) return false;
  if (orphaned === 'true' && !report.is_orphaned) return false;
  if (orphaned === 'false' && report.is_orphaned) return false;
  return true;
}

const notFound = (res, id) => res.status(404).json({ error: 'NOT_FOUND', message: `Report ${id} not found` });

export function reportRoutes({ store, alertEngine }) {
  const router = express.Router();
  const canRead = requirePermission(PERMISSIONS.REPORTS_READ);

  router.get('/reports', canRead, (req, res) => {
    const reports = store.listReports().filter((r) => matchesFilters(r, req.query));
    const page = sortAndPaginate(reports, req.query, { defaultSort: 'report_id', defaultOrder: 'asc' });
    res.json({ ...page, items: page.items.map((r) => redactReport(req.user, r)) });
  });

  // Registered before /reports/:id so "orphaned" is not treated as an id.
  router.get('/reports/orphaned', canRead, (req, res) => {
    const items = store.listReports().filter((r) => r.is_orphaned).map((r) => redactReport(req.user, r));
    res.json({ total: items.length, items });
  });

  router.get('/reports/:id', canRead, (req, res) => {
    const report = store.getReport(req.params.id);
    if (!report) return notFound(res, req.params.id);
    return res.json({ ...redactReport(req.user, report), alerts: alertEngine.list({ reportId: report.report_id, limit: 50 }) });
  });

  router.patch('/reports/:id/owner', requirePermission(PERMISSIONS.REPORTS_REASSIGN), (req, res) => {
    const email = String(req.body?.owner_email ?? '').trim().toLowerCase();
    if (!isValidEmail(email)) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'owner_email must be a valid email address' });
    const report = store.reassignOwner(req.params.id, email, req.user.email);
    if (!report) return notFound(res, req.params.id);
    return res.json(redactReport(req.user, report));
  });

  return router;
}
