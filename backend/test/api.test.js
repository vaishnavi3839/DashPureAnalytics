import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { config } from '../src/config.js';
import { createServer } from '../src/createServer.js';

let server;
let base;
let port;
const tokens = {};

before(async () => {
  ({ server } = createServer({ ...config, logRequests: false, simulatorTickMs: 20 }));
  await new Promise((resolve) => server.listen(0, resolve));
  port = server.address().port;
  base = `http://localhost:${port}/api`;
  for (const role of ['admin', 'finops', 'viewer']) {
    const res = await post('/auth/login', { email: `${role}@company.com`, password: `${role}123` });
    tokens[role] = (await res.json()).token;
  }
});

after(() => new Promise((resolve) => {
  server.closeAllConnections?.();
  server.close(resolve);
}));

const get = (path, role) => fetch(base + path, { headers: role ? { authorization: `Bearer ${tokens[role]}` } : {} });
const post = (path, body, role, method = 'POST') =>
  fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(role ? { authorization: `Bearer ${tokens[role]}` } : {}) }, body: JSON.stringify(body ?? {}) });

test('login rejects bad credentials', async () => {
  const res = await post('/auth/login', { email: 'admin@company.com', password: 'nope' });
  assert.equal(res.status, 401);
});

test('unauthenticated requests get 401', async () => {
  assert.equal((await get('/reports')).status, 401);
  assert.equal((await fetch(base + '/reports', { headers: { authorization: 'Bearer garbage' } })).status, 401);
});

test('RBAC permission matrix', async () => {
  const matrix = [
    ['/costs/summary', { admin: 200, finops: 200, viewer: 403 }],
    ['/data-quality', { admin: 200, finops: 403, viewer: 403 }],
    ['/reports', { admin: 200, finops: 200, viewer: 200 }],
    ['/alerts', { admin: 200, finops: 200, viewer: 200 }],
  ];
  for (const [path, expected] of matrix) {
    for (const [role, status] of Object.entries(expected)) {
      assert.equal((await get(path, role)).status, status, `${role} ${path}`);
    }
  }
});

test('viewer does not receive cost fields', async () => {
  const viewer = await (await get('/reports/RPT_200', 'viewer')).json();
  const finops = await (await get('/reports/RPT_200', 'finops')).json();
  assert.equal(viewer.snowflake_cost_usd, undefined);
  assert.equal(viewer.history[0].snowflake_credits_consumed, undefined);
  assert.equal(typeof finops.snowflake_cost_usd, 'number');
});

test('orphaned reports list and admin-only reassignment', async () => {
  const { items } = await (await get('/reports/orphaned', 'viewer')).json();
  assert.ok(items.length > 0);
  const id = items[0].report_id;
  assert.equal((await post(`/reports/${id}/owner`, { owner_email: 'x@company.com' }, 'finops', 'PATCH')).status, 403);
  assert.equal((await post(`/reports/${id}/owner`, { owner_email: 'bad' }, 'admin', 'PATCH')).status, 400);
  const res = await post(`/reports/${id}/owner`, { owner_email: 'New.Owner@company.com' }, 'admin', 'PATCH');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.owner_email, 'new.owner@company.com');
  assert.equal(body.is_orphaned, false);
  assert.equal(body.owner_reassignment.reassigned_by, 'admin@company.com');
});

test('reports support filtering, sorting and rejects unknown sort field', async () => {
  const res = await (await get('/reports?status=FAILED&sort=avg_load_time_sec&order=desc&limit=5', 'admin')).json();
  assert.ok(res.items.every((r) => r.last_refresh_status === 'FAILED'));
  assert.ok(res.items[0].avg_load_time_sec >= res.items.at(-1).avg_load_time_sec);
  assert.equal((await get('/reports?sort=drop_table', 'admin')).status, 400);
});

test('unknown /api paths do not reveal whether a route exists', async () => {
  assert.equal((await get('/no-such-route')).status, 401);
  assert.equal((await get('/no-such-route', 'admin')).status, 404);
});

test('finops sees credits in WebSocket telemetry', async () => {
  const ws = new WebSocket(`ws://localhost:${port}/ws?token=${tokens.finops}`);
  const telemetry = new Promise((resolve) => ws.on('message', (m) => {
    const msg = JSON.parse(m.toString());
    if (msg.type === 'telemetry') resolve(msg);
  }));
  await new Promise((r) => ws.on('open', r));
  await post('/simulator/step', {}, 'admin');
  const msg = await telemetry;
  assert.ok('snowflake_credits_valid' in msg.data);
  ws.close();
});

test('cost endpoints: unit cost per view consistent with totals', async () => {
  const { items } = await (await get('/costs/reports?limit=500', 'finops')).json();
  for (const r of items) {
    assert.ok(r.credits_consumed >= 0);
    assert.ok(Math.abs(r.snowflake_cost_usd - r.credits_consumed * config.creditPriceUsd) < 0.05);
  }
  const disc = await (await get('/costs/discrepancies', 'finops')).json();
  assert.ok(disc.items.length > 0 && disc.items.length < 30);
  assert.ok(disc.worst_snapshots[0].aws_cost_per_view > 100);
});

test('telemetry endpoint raises a live alert pushed over WebSocket', async () => {
  const ws = new WebSocket(`ws://localhost:${port}/ws?token=${tokens.viewer}`);
  const messages = [];
  await new Promise((resolve, reject) => {
    ws.on('message', (m) => messages.push(JSON.parse(m.toString())));
    ws.on('open', resolve);
    ws.on('error', reject);
  });
  const res = await post('/telemetry', { report_id: 'RPT_250', avg_load_time_sec: 42 }, 'viewer');
  assert.equal(res.status, 202);
  await new Promise((r) => setTimeout(r, 100));
  const alert = messages.find((m) => m.type === 'alert.raised' && m.data.report_id === 'RPT_250');
  assert.ok(alert, 'alert.raised received');
  assert.equal(alert.data.severity, 'CRITICAL');
  assert.equal(messages[0].type, 'hello');
  ws.close();
});

test('websocket rejects missing/invalid token', async () => {
  const ws = new WebSocket(`ws://localhost:${port}/ws?token=bad`);
  const err = await new Promise((resolve) => ws.on('error', resolve));
  assert.match(String(err.message), /401/);
});

test('viewer telemetry over WebSocket is cost-redacted; simulator control is admin-only', async () => {
  assert.equal((await post('/simulator/step', {}, 'viewer')).status, 403);
  const ws = new WebSocket(`ws://localhost:${port}/ws?token=${tokens.viewer}`);
  const got = new Promise((resolve) => ws.on('message', (m) => {
    const msg = JSON.parse(m.toString());
    if (msg.type === 'telemetry') resolve(msg);
  }));
  await new Promise((r) => ws.on('open', r));
  assert.equal((await post('/simulator/step', {}, 'admin')).status, 200);
  const msg = await got;
  assert.equal(msg.data.snowflake_credits_valid, undefined);
  assert.ok(msg.data.report_id);
  ws.close();
});
