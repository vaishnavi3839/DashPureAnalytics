import express from 'express';
import { requirePermission, PERMISSIONS } from '../auth/rbac.js';
import { costSummary, costDiscrepancies } from '../data/costAnalysis.js';
import { sortAndPaginate } from './listQuery.js';

const COST_TABLE_FIELDS = [
  'report_id', 'report_name', 'owner_email', 'is_orphaned', 'credits_consumed', 'credit_share_pct', 'credit_rank',
  'snowflake_cost_usd', 'aws_hosting_cost_usd', 'total_cost_usd', 'total_views', 'snowflake_cost_per_view',
  'aws_cost_per_view', 'total_cost_per_view', 'credits_per_1k_queries', 'negative_credit_rows_excluded',
];
const pick = (obj, fields) => Object.fromEntries(fields.map((f) => [f, obj[f]]));

export function costRoutes({ store }) {
  const router = express.Router();
  router.use('/costs', requirePermission(PERMISSIONS.COSTS_READ));

  router.get('/costs/summary', (_req, res) => res.json(costSummary(store)));

  router.get('/costs/reports', (req, res) => {
    const rows = store.listReports().map((r) => pick(r, COST_TABLE_FIELDS));
    res.json(sortAndPaginate(rows, req.query, { defaultSort: 'total_cost_per_view' }));
  });

  router.get('/costs/discrepancies', (_req, res) => res.json(costDiscrepancies(store)));

  return router;
}
