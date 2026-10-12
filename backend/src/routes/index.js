import express from 'express';
import { requireAuth } from '../auth/rbac.js';
import { authRoutes } from './auth.js';
import { systemRoutes, healthRoutes } from './health.js';
import { reportRoutes } from './reports.js';
import { costRoutes } from './costs.js';
import { alertRoutes } from './alerts.js';

export function createApiRouter(deps) {
  const router = express.Router();
  router.use(authRoutes());
  router.use(systemRoutes(deps));
  router.use(requireAuth);
  router.use(healthRoutes(deps));
  router.use(reportRoutes(deps));
  router.use(costRoutes(deps));
  router.use(alertRoutes(deps));
  return router;
}
