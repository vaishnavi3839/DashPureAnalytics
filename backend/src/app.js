import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { createApiRouter } from './routes/index.js';

export function createApp(deps) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: deps.config.corsOrigin.split(','), credentials: false }));
  app.use(express.json({ limit: '100kb' }));

  if (deps.config.logRequests) {
    app.use((req, res, next) => {
      const start = process.hrtime.bigint();
      res.on('finish', () => {
        const ms = Number(process.hrtime.bigint() - start) / 1e6;
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`);
      });
      next();
    });
  }

  app.use('/api', createApiRouter(deps));

  // Production: serve the built React app (frontend/dist) from the same origin.
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../frontend/dist');
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get(/^(?!\/api|\/ws).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  app.use((_req, res) => res.status(404).json({ error: 'NOT_FOUND', message: 'Route not found' }));

  // Client errors (bad JSON, bad sort field) echo their message; anything else is logged
  // server-side and returned as a generic 500 so internals never leak to the client.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    const status = err.status ?? (err.type === 'entity.parse.failed' ? 400 : 500);
    if (status >= 500) {
      console.error(err);
      return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unexpected server error' });
    }
    return res.status(status).json({ error: 'BAD_REQUEST', message: err.message });
  });

  return app;
}
