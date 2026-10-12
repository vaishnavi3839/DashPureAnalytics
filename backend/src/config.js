import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Settings, all overridable with env vars (see .env.example).

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEV_JWT_SECRET = 'dev-only-secret-change-me';

function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number, got '${raw}'`);
  return value;
}

const booleanFromEnv = (name, fallback) => (process.env[name] === undefined ? fallback : process.env[name] === 'true');

export const config = {
  port: numberFromEnv('PORT', 4000),
  dataFile: process.env.DATA_FILE || path.join(backendDir, 'data', 'pure_insights_monitoring.csv'),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  logRequests: process.env.NODE_ENV !== 'test',

  jwtSecret: process.env.JWT_SECRET || DEV_JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',

  // The brief sets the 15s SLA; the 30s tier is ours, to rank severity among breaches.
  latencyWarnSec: numberFromEnv('LATENCY_WARN_SEC', 15),
  latencyCriticalSec: numberFromEnv('LATENCY_CRITICAL_SEC', 30),

  // Assumed Snowflake on-demand price per credit; replace with the contracted rate.
  creditPriceUsd: numberFromEnv('CREDIT_PRICE_USD', 3.0),

  simulatorAutoStart: booleanFromEnv('SIMULATOR_AUTOSTART', true),
  simulatorTickMs: numberFromEnv('SIMULATOR_TICK_MS', 750),
  simulatorLoop: booleanFromEnv('SIMULATOR_LOOP', true),
};

if (config.jwtSecret === DEV_JWT_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error('JWT_SECRET must be set in production');
}
