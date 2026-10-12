import { WebSocketServer } from 'ws';
import { verifyToken } from './auth/rbac.js';
import { redactSnapshot } from './auth/redaction.js';

// WebSocket server on /ws. Browsers can't set headers on a WebSocket, so the JWT comes in
// the query string and is checked during the upgrade. Bad tokens never get a connection.

const HEARTBEAT_MS = 30_000;
const SUMMARY_INTERVAL_MS = 5_000; // lets a client that missed an event re-sync its counters

export function attachWebSocket(server, { alertEngine, simulator }) {
  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws') return socket.destroy();
    let user;
    try {
      user = verifyToken(url.searchParams.get('token') ?? '');
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      return socket.destroy();
    }
    return wss.handleUpgrade(req, socket, head, (ws) => {
      ws.user = user;
      wss.emit('connection', ws);
    });
  });

  const send = (ws, type, data) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify({ type, ts: new Date().toISOString(), data }));
  };
  const broadcast = (type, dataFor) => {
    for (const ws of wss.clients) send(ws, type, typeof dataFor === 'function' ? dataFor(ws.user) : dataFor);
  };

  wss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    // The only client message is an application-level ping; all state changes go through REST.
    ws.on('message', (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return send(ws, 'error', { message: 'Invalid JSON' });
      }
      if (message.type === 'ping') send(ws, 'pong', { echo: message.data ?? null });
      return undefined;
    });
    send(ws, 'hello', {
      user: { email: ws.user.email, role: ws.user.role },
      alerts: alertEngine.list({ limit: 50 }),
      summary: alertEngine.summary(),
      simulator: simulator.status(),
    });
  });

  alertEngine.on('event', ({ type, alert }) => broadcast(type, alert));
  simulator.on('telemetry', (snapshot) => broadcast('telemetry', (user) => redactSnapshot(user, snapshot)));
  simulator.on('status', (status) => broadcast('simulator.status', status));

  const summaryTimer = setInterval(() => broadcast('alert.summary', alertEngine.summary()), SUMMARY_INTERVAL_MS);
  const heartbeatTimer = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  // Timers must not keep the process alive on their own (tests, graceful shutdown).
  summaryTimer.unref();
  heartbeatTimer.unref();
  wss.on('close', () => {
    clearInterval(summaryTimer);
    clearInterval(heartbeatTimer);
  });

  return { wss, clientCount: () => wss.clients.size };
}
