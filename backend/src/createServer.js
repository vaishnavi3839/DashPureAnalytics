import http from 'node:http';
import { loadRawCsv, createStore } from './data/store.js';
import { AlertEngine } from './alerts/alertEngine.js';
import { TelemetrySimulator } from './alerts/telemetrySimulator.js';
import { attachWebSocket } from './websocket.js';
import { createApp } from './app.js';

export function createServer(config) {
  const store = createStore({ rawRows: loadRawCsv(config.dataFile), config });
  const alertEngine = new AlertEngine({ latencyWarnSec: config.latencyWarnSec, latencyCriticalSec: config.latencyCriticalSec });
  const simulator = new TelemetrySimulator({ rows: store.rows, alertEngine, tickMs: config.simulatorTickMs, loop: config.simulatorLoop });

  // The REST app reports the WebSocket client count, but the hub needs the HTTP server
  // first, so it is attached after creation and filled in on the shared deps object.
  const deps = { config, store, alertEngine, simulator, websocket: null };
  const server = http.createServer(createApp(deps));
  deps.websocket = attachWebSocket(server, { alertEngine, simulator });

  return { server, ...deps };
}
