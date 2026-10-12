---
title: "DashPureAnalytics"
subtitle: "REST API and WebSocket Specification"
---

Case Study 3: Technical Data AI Validation – Monetization

# 1. Overview

The backend is a Node.js / Express server with two parts:

- **REST API** at `/api`, used for reports, owners, alerts, costs and data quality.
- **WebSocket** at `/ws?token=<JWT>`, used for live alerts and live telemetry.

All requests and responses are JSON. Times are in UTC (ISO-8601) and money is in US dollars.

## 1.1 How it works

1. The browser calls the REST API with a login token. The server checks the token, then checks that the user's role has permission for that route.
2. The route runs. Any cost fields the role isn't allowed to see are removed before the response goes back.
3. The data comes from the case-study CSV, which is cleaned when the server starts.
4. A small simulator feeds the CSV rows in one at a time, as if they were live. The alert engine checks each row and pushes any new alert to every open browser over the WebSocket.

## 1.2 General rules

**Login token.** Send `Authorization: Bearer <token>` with every request, except login (`POST /api/auth/login`) and the health check (`GET /api/system/health`).

**Lists.** Use `limit` (default 100, max 500) and `offset` to page through results, and `sort=<field>&order=asc` or `desc` to sort. An unknown sort field returns 400.

**Errors.** Every error has the same shape:

    { "error": "FORBIDDEN", "message": "Requires permission 'costs:read'", "role": "viewer" }

The status codes used are:

- **400** (`VALIDATION_ERROR` or `BAD_REQUEST`): bad input, an unknown sort field or broken JSON.
- **401** (`UNAUTHENTICATED`, `INVALID_TOKEN` or `INVALID_CREDENTIALS`): no token, an expired token or a wrong password. Unknown `/api` paths also return 401, so route names aren't revealed.
- **403** (`FORBIDDEN`): the user is logged in but their role isn't allowed.
- **404** (`NOT_FOUND`): the report or alert doesn't exist.
- **500** (`INTERNAL_ERROR`): something unexpected. The details are only logged on the server.

# 2. Roles and permissions

There are three roles. Routes check permissions, not role names, so adding a role only means changing one list.

- **Admin** can do everything: view all reports and costs, see data quality, reassign owners, acknowledge alerts and control the simulator.
- **FinOps** can view reports, alerts and all cost data.
- **Viewer** can view reports and alerts only. All cost data is hidden.

The permissions behind this are:

- `reports:read` (all roles): health, the report list and details, and the orphaned list
- `reports:read_cost` (Admin, FinOps): seeing cost fields on reports
- `reports:reassign` (Admin): changing a report's owner
- `costs:read` (Admin, FinOps): the `/costs` endpoints
- `quality:read` (Admin): the data quality page
- `alerts:read` (all roles): alerts and the live alert stream
- `alerts:ack` (Admin): acknowledging alerts
- `simulator:control` (Admin): starting, stopping and resetting the simulator

The demo accounts are `admin@company.com / admin123`, `finops@company.com / finops123` and `viewer@company.com / viewer123`. Passwords are stored hashed (scrypt). In a real deployment, users would come from the company's single sign-on.

If a user doesn't have `reports:read_cost`, the cost fields are removed from report responses *and* from the live WebSocket telemetry. Both use the same code in `backend/src/auth/redaction.js`.

# 3. REST endpoints

## 3.1 Login and system

**POST /api/auth/login** (no token needed)

Request:

    { "email": "admin@company.com", "password": "admin123" }

Response (200):

    { "token": "eyJhbGciOi...",
      "user": { "email": "admin@company.com", "name": "Vaishnavi", "role": "admin",
                "permissions": ["reports:read", "..."] } }

A wrong password returns 401 `INVALID_CREDENTIALS`. Tokens last 8 hours.

**GET /api/auth/me** returns the logged-in user.

**GET /api/system/health** (no token needed) is a quick "is it running" check:

    { "status": "ok", "uptime_sec": 412, "websocket_clients": 3, "reports_loaded": 100,
      "simulator": { "running": true, "position": 137 } }

## 3.2 Health and reports

**GET /api/health/summary** (needs `reports:read`) returns the numbers for the overview page:

    { "reports_monitored": 100, "snapshots_ingested": 2000, "orphaned_reports": 14,
      "latest_refresh_status": { "SUCCESS": 70, "FAILED": 16, "TIMED_OUT": 9, "UNKNOWN": 5 },
      "latest_latency_bands": { "OK": 24, "WARNING": 33, "CRITICAL": 43 },
      "refresh_success_rate_all_snapshots": 0.703,
      "latency_breach_rate_all_snapshots": 0.745,
      "avg_load_time_sec": 27.9,
      "thresholds": { "latency_warn_sec": 15, "latency_critical_sec": 30 } }

**GET /api/reports** (needs `reports:read`) lists all reports, one summary each. It can be filtered by `search` (report ID, name or owner), `status` (SUCCESS, FAILED, TIMED_OUT, UNKNOWN), `band` (OK, WARNING, CRITICAL) and `orphaned` (true or false), and it supports sorting and paging.

One report looks like this (shortened). The cost fields only appear for roles that can see cost:

    { "report_id": "RPT_223", "report_name": "Analytics Dashboard 24",
      "owner_email": "user_13@company.com", "is_orphaned": false,
      "last_known_owner": "user_13@company.com",
      "last_refresh_status": "SUCCESS", "refresh_failure_rate": 0.278,
      "latest_load_time_sec": 2.3, "latest_latency_band": "OK",
      "avg_load_time_sec": 28.9, "p95_load_time_sec": 47.6,
      "avg_monthly_active_views": 563, "total_views": 11259,
      "credits_consumed": 17034.76, "snowflake_cost_usd": 51104.28,
      "aws_hosting_cost_usd": 5116.68, "total_cost_per_view": 4.9934,
      "credit_rank": 1, "credit_share_pct": 1.41 }

**GET /api/reports/orphaned** (needs `reports:read`) lists the reports whose latest snapshot has no owner. `last_known_owner` is the suggested new owner.

**GET /api/reports/:id** (needs `reports:read`) returns one report, its 20 snapshots (`history`, each with its list of data problems) and its recent alerts. It returns 404 if the report doesn't exist.

**PATCH /api/reports/:id/owner** (needs `reports:reassign`) gives a report a new owner.

Request:

    { "owner_email": "new.owner@company.com" }

The response is the updated report, which now includes:

    "owner_reassignment": { "owner_email": "new.owner@company.com",
                            "reassigned_by": "admin@company.com",
                            "reassigned_at": "2026-10-12T11:02:10Z" }

It returns 400 if the email isn't valid and 404 if the report doesn't exist. In this demo the change is kept in memory.

## 3.3 Costs

Credits are priced at $3 each (the `CREDIT_PRICE_USD` setting, which is an assumption). Rows with negative credits are left out of both the cost and the view count. The same formula is used in `sql/05`.

**GET /api/costs/summary** (needs `costs:read`):

    { "credit_price_usd": 3, "total_credits": 1206352.48,
      "total_snowflake_cost_usd": 3619057.44, "total_aws_hosting_cost_usd": 461949.25,
      "negative_credit_rows_excluded": 24, "corr_views_vs_aws_cost": -0.029,
      "report_aws_cost_per_view_fence": 0.4261 }

**GET /api/costs/reports** (needs `costs:read`) returns the cost table for every report, sorted by total cost per view by default.

**GET /api/costs/discrepancies** (needs `costs:read`) lists reports where the AWS cost doesn't match the usage. A report is listed if its AWS cost per view is above the outlier line (Q3 + 1.5 × IQR), if 5 or more of its 20 snapshots are outliers, or if it had cost but zero views. Each report comes with the reasons it was listed, and the response also includes the 10 worst single snapshots:

    { "fence": 0.4261, "total": 11,
      "items": [ { "report_id": "RPT_229", "aws_cost_per_view": 0.5153,
                   "reasons": ["AWS cost/view $0.5153 above report-level fence $0.4261"] } ],
      "worst_snapshots": [ { "report_id": "RPT_201", "snapshot_seq": 5,
                             "monthly_active_views": 2, "aws_hosting_cost_usd": 359.15,
                             "aws_cost_per_view": 179.58 } ] }

## 3.4 Data quality

**GET /api/data-quality** (needs `quality:read`) returns:

- every data problem with a row count
- the raw values used for "no owner"
- the rows with negative credits or zero views, with their CSV row numbers
- the assumptions made

## 3.5 Alerts

There are two alert rules:

- **LATENCY_SLA**: a warning when the load time is over 15 seconds, and critical when it is over 30 seconds.
- **REFRESH_FAILURE**: a warning when a refresh times out, and critical when it fails.

A load time of exactly 15.0 seconds does not alert, and an `UNKNOWN` refresh status neither opens nor closes an alert.

Each report and rule has its own alert, which moves like this:

- It opens the first time the report breaks the rule.
- If it gets worse or better (for example warning to critical), the alert is updated.
- If the report stays in the same state, only the `occurrences` counter goes up and no new alert is sent.
- It closes by itself when the report is healthy again.
- An admin can acknowledge an open alert, and it still closes by itself later.

An alert looks like this:

    { "id": "ALT-00125", "rule": "LATENCY_SLA", "report_id": "RPT_236",
      "severity": "CRITICAL", "message": "Load time 43.6s exceeds critical threshold of 30s",
      "value": 43.6, "threshold": 30, "status": "ACTIVE", "occurrences": 1,
      "raised_at": "2026-10-12T11:01:36Z", "acknowledged_by": null }

**GET /api/alerts** (needs `alerts:read`) lists open alerts first (newest first), then closed ones. It can be filtered by `status`, `severity`, `report_id` and `limit`.

**GET /api/alerts/summary** (needs `alerts:read`) returns the number of open alerts by severity and rule, plus running totals (raised, resolved and repeats skipped).

**POST /api/alerts/:id/ack** (needs `alerts:ack`) acknowledges an alert. It returns 404 if there's no open alert with that ID.

**POST /api/telemetry** (any logged-in user) accepts a real load time or refresh result. The dashboard uses it to report how long a report page took to load.

Request (at least one of the two values is needed):

    { "report_id": "RPT_210", "avg_load_time_sec": 18.2, "last_refresh_status": "FAILED" }

Response (202):

    { "accepted": true,
      "events": [ { "type": "alert.raised", "alert_id": "ALT-00126", "severity": "CRITICAL" } ] }

The `report_id` must look like `RPT_123`, and the load time must be between 0 and 3600 seconds.

**The simulator** replays the CSV as live data:

- **GET /api/simulator** (`alerts:read`) shows its current status.
- **POST /api/simulator/start** (`simulator:control`) starts it. An optional speed can be given, e.g. `{ "tick_ms": 150 }`.
- **POST /api/simulator/stop** (`simulator:control`) pauses it.
- **POST /api/simulator/step** (`simulator:control`) sends exactly one row.
- **POST /api/simulator/reset** (`simulator:control`) goes back to row 1 and clears all alerts.

# 4. WebSocket

The address is `ws://<host>/ws?token=<JWT>`, or `wss://` when deployed.

Browsers can't send headers when opening a WebSocket, so the login token goes in the URL. The server checks it before accepting the connection, and a missing or wrong token is refused with a 401. In production you would use `wss://` and keep tokens short-lived.

Every message from the server has this shape:

    { "type": "alert.raised", "ts": "2026-10-12T11:01:36Z", "data": { ... } }

The message types are:

- **hello**: sent right after connecting, with the user, recent alerts, alert counts and the simulator status
- **alert.raised**: a new alert has opened
- **alert.updated**: an open alert got worse or better (`change` is ESCALATED or DE_ESCALATED)
- **alert.resolved**: an alert has closed
- **alert.acknowledged**: an admin acknowledged an alert
- **alert.summary**: sent every 5 seconds, so a client that missed something can catch up
- **telemetry**: a new data sample
- **simulator.status**: the simulator started, stopped or reset
- **pong**: the reply to a `{"type":"ping"}` from the client
- **error**: the client sent something that isn't valid JSON

A telemetry message looks like this:

    { "report_id": "RPT_279", "snapshot_seq": 2, "avg_load_time_sec": 46.4,
      "latency_band": "CRITICAL", "last_refresh_status": "TIMED_OUT",
      "monthly_active_views": 308, "snowflake_credits_valid": 803.94 }

`snowflake_credits_valid` is removed for users who can't see cost, and is `null` when the original value was negative.

The client only ever sends `ping`. Every change, such as acknowledging an alert or reassigning a report, goes through the REST API, so it gets the normal permission checks. The server pings each connection every 30 seconds and drops ones that don't answer. The dashboard reconnects by itself (waiting 1s, then 2s, then 4s and so on, up to 30s), and the `hello` message restores its state.

# 5. Other notes

**Avoiding too many alerts.** Alerts only fire when something changes. Over the full 2,000 rows, 2,054 slow-load and failed-refresh events become 847 alerts, and 622 repeats are skipped.

**Security.** Passwords are hashed, tokens are signed, every route checks permissions, cost data is hidden by role, request bodies are limited to 100 KB, inputs are checked, and only known fields can be used for sorting.

**Running more than one server.** One server is enough for an admin tool. With several servers, the alert engine would need something like Redis pub/sub so every server sends the same alerts.

**How fresh the data is.** Snowflake's usage data lags by a few hours, so cost reports would run daily (`sql/08`), while speed and refresh alerts are live.

**Tests.** There are 32 automated tests (`npm test`). They cover cleaning, the maths, costs (checked against the SQL results), alerts, permissions, hidden cost data and the WebSocket.

**Rounding.** Numbers are rounded the same way as SQL's `ROUND()`, so the API and the SQL always give the same result.
