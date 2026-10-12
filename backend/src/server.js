import { config } from './config.js';
import { createServer } from './createServer.js';

const { server, store, simulator, websocket } = createServer(config);

server.listen(config.port, () => {
  const flaggedRows = store.rows.filter((r) => r.issues.length > 0).length;
  console.log(`DashPureAnalytics listening on http://localhost:${config.port}`);
  console.log(`  REST /api · WebSocket ws://localhost:${config.port}/ws?token=<JWT>`);
  console.log(`  Loaded ${store.rows.length} rows for ${store.listReports().length} reports; ${flaggedRows} rows carry data-quality flags`);
  if (config.simulatorAutoStart) {
    simulator.start();
    console.log(`  Telemetry simulator replaying one row every ${config.simulatorTickMs}ms`);
  }
});

function shutdown() {
  simulator.stop();
  websocket.wss.close();
  server.close(() => process.exit(0));
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
