# Apache Sentinel — Backend

Node.js + Express + TypeScript API server that:

1. Receives Apache access logs via a pipe child process (`log-collector.ts`)
2. Parses the Combined Log Format into structured records
3. Feeds them into the DoS and DDoS detectors
4. Pushes block decisions to Windows Firewall via `netsh advfirewall`
5. Persists logs to MongoDB in batches
6. Exposes a REST API consumed by the React dashboard

> **Must be run as Administrator** — `netsh advfirewall` requires
> elevation. The server refuses to start without it (see
> `checkAdminPrivilege.ts`).

---

## Quick start (first-time setup)

These five steps get the backend running locally against a fresh
MongoDB. Skip steps you've already completed.

### 1. Prerequisites

| Requirement | Notes |
|---|---|
| Node.js ≥ 18 LTS (24.15 verified) | Use `where.exe node` to confirm |
| MongoDB running on default port 27017 | `mongod` or `net start MongoDB` |
| Windows 10/11 or Server 2016+ | Required for `netsh advfirewall` |
| PowerShell running **as Administrator** | Required for steps 2, 3, 5 |

### 2. Install dependencies

```powershell
cd D:\path\to\Code\backend
npm install
```

### 3. Configure environment

Copy or edit `.env` in the backend folder. Only four variables are
actually read by the code:

```dotenv
MONGO_URI=mongodb://localhost:27017
DB_NAME=project2
JWT_SECRET=your-secure-jwt-secret-minimum-32-characters
NODE_ENV=development
```

The default admin (`admin` / `admin`) is seeded on first launch and
cannot be customized via env. Change the password via the API or
MongoDB after first login.

### 4. Build the TypeScript

```powershell
npm run build
```

Compiles to `dist/`. Required once before Apache's `CustomLog` pipe
can reference `dist/log-collector.js` (see step 5 and
[`docs/apache-setup-guide.md`](docs/apache-setup-guide.md)).

### 5. Start the server

**Open a new PowerShell as Administrator:**

```powershell
npm run dev
```

Wait for:

```
[Privilege] Running with Administrator privileges ✅
✅ MongoDB Connected Successfully! Using Database: project2
[Seed] Admin user created (admin/admin)
[*] Firewall: Synced 0 blocked IPs from firewall
[Server] Sentinel is running on http://localhost:3000
```

If you see `[Privilege] App cần chạy với quyền Administrator`, the
terminal isn't elevated — re-open PowerShell with "Run as
Administrator".

### 6. Verify

```powershell
curl http://localhost:3000/api/config
```

Expected: JSON with `dos.THRESHOLD: 120`, `ddos.GLOBAL_RATE_THRESHOLD: 100`,
`env: "development"`.

Send a synthetic log line to confirm the pipeline:

```powershell
curl -X POST http://localhost:3000/log `
  -H "Content-Type: text/plain" `
  -d '192.168.1.1 - - [21/Jun/2026:12:00:00 +0000] "GET / HTTP/1.1" 200 512 "-" "curl/8"'
```

Then `curl http://localhost:3000/api/stats` should show
`totalLogsAnalyzed ≥ 1`.

### Production-style start (no hot reload)

```powershell
npm run build
npm start
```

Runs `node dist/server.js`. Use this after deploying a new build.

---

## Hot reload during development

`npm run dev` runs `tsx watch`, which rebuilds and restarts on any
`.ts` change under `src/`. If you also changed `src/config.json`,
the live values are picked up on the next detector tick (≤ 10 s for
`globalBaseThreshold`) — no restart needed. Settings page changes
via `PATCH /api/config` apply immediately for all detectors.

---

## Scripts

```bash
npm run dev      # tsx watch src/server.ts — hot reload
npm run build    # tsc + tsc-alias → dist/
npm start        # node dist/server.js — production
npm test         # tsx watch src/test.ts — parser smoke test only
```

Note: `npm test` does **not** run the project's functional test suite —
that lives in `attack-tool/test_suite.js` (see `../attack-tool/README.md`).
The in-repo `src/test.ts` is just a one-liner that parses a single
sample log line and prints the result.

---

## Environment variables

The backend reads `.env` at startup via `dotenv` (see `src/env.ts`).
Only four variables are actually consumed by the code; the `.env`
file shipped in the repo also includes two leftovers from an earlier
auth iteration that are no longer read — they are harmless but you can
remove them if you want a minimal config.

| Variable | Required | Default | Read at | Purpose |
|---|---|---|---|---|
| `MONGO_URI` | yes | — | `src/services/db.service.ts:9` | MongoDB connection string. Server throws on startup if unset. |
| `DB_NAME` | yes | — | `src/services/db.service.ts:10` | Database name. Server throws on startup if unset. |
| `JWT_SECRET` | recommended | `dev-secret-change-in-prod` | `src/services/auth.service.ts:5` | Secret used to sign and verify auth tokens. **Set this to a real ≥ 32-char value in any deployment beyond local dev.** |
| `NODE_ENV` | no | `development` | `src/server.ts:222`, `src/services/config.service.ts:11`, `src/services/firewall.service.ts:9`, `src/routes/auth.routes.ts:28,44,58` | Anything other than the literal string `"production"` is treated as development. Controls: (a) which `config.json` threshold preset is active, (b) whether `POST /debug/reset` and `POST /api/auth/seed` are registered, (c) whether the JWT cookie is set with `secure: true` (HTTPS-only). |

### Variables in the shipped `.env` that are NOT read

The following appear in `.env` but are not referenced anywhere in
`src/`:

| Variable | Status |
|---|---|
| `PORT` | The HTTP listen port is read from `src/config.json:server.PORT`, **not** from `process.env`. The `.env` entry is a leftover and has no effect. |
| `DEBUG_MODE` | Not read. The debug-only endpoints are gated on `NODE_ENV === 'development'` instead. |
| `ADMIN_API_KEY` | Not read. Reserved for a future external API; safe to remove. |
| `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD` | Not read. `src/seed.ts` hardcodes `admin` / `admin`. |

---

## Source layout

```
src/
├── server.ts                     # Express app — registers middleware, routes,
│                                 # event wiring, and starts the listener.
├── log-collector.ts              # Apache pipe entry point. Reads Combined Log
│                                 # Format lines from stdin (one per Apache
│                                 # request), batches up to 100 lines or 1 s,
│                                 # POSTs to /log/batch on the backend.
├── seed.ts                       # One-shot admin bootstrap on first launch.
│                                 # Hardcodes username/password to "admin" and
│                                 # does NOT read SEED_ADMIN_* env vars.
├── env.ts                        # Single line: `dotenv.config()`. Triggers
│                                 # loading of .env from cwd.
│
├── detectors/                    # Detection algorithms
│   ├── dos.detector.ts           # Per-IP trust score + weighted 3-window
│   │                             # anomaly. Emits 'dos-block-ip'.
│   └── ddos.detector.ts          # 3 strategies (global / coordinated /
│                                 # subnet). Emits 'ddos-block-ip' and
│                                 # 'ddos-block-subnet'.
│
├── services/                     # Long-lived singletons + business logic
│   ├── auth.service.ts           # bcrypt hash/verify + JWT sign/verify.
│   │                             # Reads JWT_SECRET from env.
│   ├── config.service.ts         # Live threshold singleton — detectors
│   │                             # call cfg()() on every check so PATCH
│   │                             # /api/config takes effect without restart.
│   ├── db.service.ts             # Mongoose connection lifecycle. Reads
│   │                             # MONGO_URI + DB_NAME from env, throws on
│   │                             # startup if either is unset.
│   ├── firewall.service.ts       # netsh advfirewall wrapper + Mutex-
│   │                             # serialized rule updates + exponential-
│   │                             # backoff subnet TTL (1m → 24h cap).
│   ├── Log.service.ts            # In-memory queue + 5 s batched
│   │                             # insertMany + 12-tick traffic history.
│   │                             # Flush loop started by startFlushLoop()
│   │                             # after MongoDB connects.
│   └── notification.service.ts   # Windows toast via node-notifier.
│                                 # Rate-limited to 1 toast per alert type
│                                 # per second.
│
├── routes/
│   └── auth.routes.ts            # POST /api/auth/login, /logout,
│                                 # POST /api/auth/seed (dev-only),
│                                 # GET /api/auth/me (requires authMiddleware).
│
├── middleware/
│   └── auth.middleware.ts        # Two exports:
│                                 #   authMiddleware          — strict 401
│                                 #   optionalAuthMiddleware   — attaches
│                                 #                              req.user if
│                                 #                              valid, else
│                                 #                              passes through
│                                 # Both verify the auth_token cookie via
│                                 # verifyToken().
│
├── entities/                     # Mongoose schemas
│   ├── Log.entity.ts             # `Log` model — fields, required/optional,
│   │                             # and 3 indexes (remoteIp, time desc,
│   │                             # remoteIp + time).
│   └── User.entity.ts            # `User` model — username, password
│                                 # (hashed), role, createdAt. The
│                                 # toJSON transform strips password.
│
├── dtos/
│   └── log.dto.ts                # Zod schemas:
│                                 #   PublicLogDto  — the shape returned by
│                                 #                    /api/logs
│                                 #   CreateLogDto  — the shape produced by
│                                 #                    the parser
│                                 # Both declare optional geo/device fields
│                                 # (countryShort, browser, os, ...) that
│                                 # are accepted by the schema but never
│                                 # populated by the current parser.
│
├── utils/                        # Internal helpers
│   ├── checkAdminPrivilege.ts    # Startup guard. Runs a PowerShell
│   │                             # EncodedCommand that checks
│   │                             # WindowsBuiltInRole::Administrator.
│   │                             # Throws if not elevated.
│   ├── mutex.ts                  # Promise-chain Mutex. firewallService
│   │                             # uses this to serialize concurrent
│   │                             # netsh advfirewall calls.
│   ├── logParsers/
│   │   └── lineParser.ts         # Single LineParser class. Holds a
│   │                             # master regex that captures all 12
│   │                             # Combined Log Format fields (incl. IPv4
│   │                             # and IPv6 RemoteIp, optional method/
│   │                             # url/httpVer, optional X-Forwarded-For).
│   │                             # run() returns a Mongoose Log document
│   │                             # or null on parse failure.
│   ├── error/
│   │   └── error.ts              # getErrorMessage(err: unknown): string
│   │                             # — safe error.message extraction for
│   │                             # catch blocks on unknown errors.
│   └── index.ts                  # (currently empty; reserved for
│                                 # re-exports)
│
└── test.ts                       # Quick parser smoke-test. `node test.ts`
                                  # parses one sample log line and prints
                                  # the resulting object. Not the test
                                  # suite — see attack-tool/test_suite.js.
```

The compiled output of every `.ts` file goes to `dist/` (mirroring the
`src/` tree) via `npm run build`. Apache's `CustomLog` pipe invokes
`dist/log-collector.js`, **not** `dist/server.js` — the collector is a
separate small program that forwards into the backend's HTTP API.

---

## REST API

The Express server exposes endpoints under two prefixes:

- **`/api/*`** — JSON contract consumed by the React dashboard (auth-gated conceptually; only `/api/auth/*` actually enforces the JWT middleware today).
- **`/log`, `/log/batch`, `/`, `/debug/reset`** — operational endpoints (Apache pipe ingestion, health check, dev-only reset).

### CORS

The server allows requests from `http://localhost:5173` and
`http://127.0.0.1:5173` with `credentials: true`. The frontend's
axios client must send `withCredentials: true` so the `auth_token`
httpOnly cookie is included.

### Auth cookie shape

`POST /api/auth/login` sets a cookie with these attributes:

| Attribute | Value |
|---|---|
| Name | `auth_token` |
| `httpOnly` | `true` |
| `secure` | `true` only in production (`NODE_ENV === 'production'`), `false` in dev so it works over plain HTTP |
| `sameSite` | `strict` |
| `maxAge` | 24 hours (`24 * 60 * 60 * 1000`) |

### Endpoints

#### Operational

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| `GET`  | `/` | — | `Hello World! Apache Sentinel is running.` | Health check for Apache / curl |
| `POST` | `/log` | Apache Combined Log Format line, `text/plain` | `200` / `400 {message: "Failed to parse log"}` / `500` | Single-line ingestion |
| `POST` | `/log/batch` | `{lines: ["…", "…", …]}` (JSON) | `200` / `500` | Bulk ingestion; each line parsed and analyzed independently. Silently skips unparseable lines. |
| `POST` | `/debug/reset` | — | `200` | **Development only** — endpoint is registered only when `NODE_ENV === 'development'`. Calls `dosDetector.reset()`, `ddosDetector.reset()`, `firewallService.reset()`. |

#### Auth (`/api/auth/*`)

| Method | Path | Body | Response |
|---|---|---|---|
| `POST` | `/api/auth/login` | `{username, password}` | `200 {message: 'Login successful', user: {username, role}}` + `Set-Cookie: auth_token=...` / `400` (missing fields) / `401 {message: 'Invalid credentials'}` |
| `POST` | `/api/auth/logout` | — | `200` + cleared cookie |
| `GET`  | `/api/auth/me` | — | `200 {username, role}` (requires `authMiddleware`) / `401` |
| `POST` | `/api/auth/seed` | — | `200 {message: 'Admin already exists' \| 'Admin created'}` / `404` in production / `500` |

#### Stats & logs

| Method | Path | Query / Body | Response | 503 during Panic Mode? |
|---|---|---|---|---|
| `GET`  | `/api/stats` | — | `{totalLogsAnalyzed, activeBlockedIps, currentCpuUsage, isDosPanicMode: false, isDdosPanicMode, globalThreshold, trafficHistory[]}` | **Yes** — load-shed |
| `GET`  | `/api/logs` | `?page=N&limit=M` (limit clamped to 10–1000, default page=1, limit=100) | `{data: [{id, ip, method, path, statusCode, timestamp, userAgent}], pagination: {page, limit, total, totalPages}}` | **No** — `/api/logs` is **not** in `heavyPaths`; returns 200 normally |
| `GET`  | `/api/config` | — | `{dos: {...}, ddos: {...}, env: 'development' \| 'production'}` | No |
| `PATCH` | `/api/config` | Flat JSON of threshold overrides (e.g. `{THRESHOLD: 200, PANIC_MODE_DURATION_MS: 900000}`) | `200 {dos: {...}, ddos: {...}, env}` / `400 {message: 'Invalid value for "X": must be a positive number.'}` / `400 {message: 'Request body must be a flat JSON object of threshold overrides.'}` | No |

#### Firewall (`/api/firewall/*`)

| Method | Path | Body | Response |
|---|---|---|---|
| `GET`  | `/api/firewall/rules` | `?page=N&limit=M` | `{data: [{ip, detector: 'DOS'\|'MANUAL', reason, blockedAt, trustScore}], pagination: {page, limit, total, totalPages}}` |
| `POST` | `/api/firewall/block` | `{ip, reason?}` | `200` / `400 {message: 'IP address is required'}` / `500` |
| `POST` | `/api/firewall/unblock` | `{ip}` | `200` / `400` / `500` |
| `POST` | `/api/firewall/unblock-all` | — | `200 {revoked: N}` / `500` |

Note on the `detector` field: it is derived per-row from
`dosDetector.getProfile(ip)` returning a non-null profile (`'DOS'`) or
null (`'MANUAL'`). Since `dosDetector` does not track IPs that were
blocked via DDoS events or subnet events, DDoS-blocked IPs and
subnet blocks also show `'MANUAL'`.

### Load shedding (Panic Mode)

When `ddosDetector.isUnderAttack()` is true, the middleware at
`server.ts:117` returns **503** for requests to paths starting with
`/api/stats`, `/api/export`, `/api/search`. Other routes (including
`/api/logs`, `/api/config`, `/api/firewall/*`) keep responding 200.

---

## Detection algorithm summary

### DoS detector (`detectors/dos.detector.ts`)

**Per-IP trust score model**

- New IP starts at trust = 50 (`initialTrustScore`).
- On each `check(ip)`: push timestamp to a per-profile array; filter to last 3 × windowMs (30 s).
- Compute anomaly score against the per-IP effective threshold (see below).
- If anomaly ≥ 0.7: `trust -= 15` (clamped to 0), `perIpThreshold *= 0.8` (floor at `baseThreshold × 0.3`).
- If `trust < 20`: set `isBlocked = true`, emit `'dos-block-ip'`.
- Periodic `tick()` every 5 s: if `anomaly < 0.35` for an unblocked IP, `trust += 1` (cap 100), `perIpThreshold *= 1.05`.

**Three-window weighted anomaly score**

Timestamps are bucketed by age from "now" rather than three rotated
arrays:

```
window0 = timestamps in (now - 10s, now]
window1 = timestamps in (now - 20s, now - 10s]
window2 = timestamps in (now - 30s, now - 20s]
```

For each window, `ratio = min(count / threshold, 1)`. The anomaly score
is:

- If `window1 == 0` and `window2 == 0`: return `ratio0` (no dilution)
- If only `window2 == 0`: `ratio0 × (0.5 / 0.8) + ratio1 × (0.3 / 0.8)`
- Otherwise: `ratio0 × 0.5 + ratio1 × 0.3 + ratio2 × 0.2`

So a single-window burst gets judged by its own ratio, but a request
that joins an existing second-window pattern is judged with weights
re-normalized to sum to 1.

**Effective threshold (`calcEffectiveThreshold`)**

```
if panicModeActive:
    trusted IP  → min(perIpThreshold, baseThreshold × 0.8)
    untrusted IP → min(perIpThreshold, baseThreshold × 0.2)
elif trustScore >= 70 (trusted band):
    → min(perIpThreshold, baseThreshold)
elif age < 60s (grace period):
    → baseThreshold            // perIpThreshold ignored during grace
elif trustScore >= 40 (neutral band):
    factor = 0.7 if CPU > 80% else 1.0
    → min(perIpThreshold, baseThreshold × factor)
else (suspicious band):
    → min(perIpThreshold, globalBaseThreshold)
```

**CPU-adaptive global threshold (`adjustGlobalThreshold`)**

Runs every 10 s. Reads current CPU and applies one rule:

- Panic mode → `globalBaseThreshold *= 0.7` (capped at `baseThreshold × 0.2` floor)
- CPU > 90% (critical) → `globalBaseThreshold /= 2` (capped at floor)
- CPU > 80% (high) → `globalBaseThreshold *= 0.9` (capped at floor)
- CPU < 10% → `globalBaseThreshold += 20` (capped at `baseThreshold × 1.2` ceiling)
- CPU < 30% → `globalBaseThreshold += 5` (capped at ceiling)

### DDoS detector (`detectors/ddos.detector.ts`)

Three independent strategies run on every log line. Each strategy
reads its thresholds from `cfg() = configService.ddos` at call time so
`PATCH /api/config` takes effect immediately without restart.

**Strategy 1 — Global volumetric**

Push `log.time` into `globalTimestamps[]`; prune anything older than
`GLOBAL_RATE_WINDOW_MS`. If the remaining count exceeds
`GLOBAL_RATE_THRESHOLD`, call `triggerPanicMode(now)`.

**Strategy 2 — Coordinated pattern**

For each log: bucket by `normalizeUrl(requestUrl)`; update the URL's
`timestamps[]`, `errorTimestamps[]`, and `ipLastSeen` map. If the URL
has more than `COORDINATED_DISTINCT_IP_THRESHOLD` distinct IPs AND
`errorTimestamps.length / timestamps.length ≥ COORDINATED_ERROR_RATIO_THRESHOLD`,
emit `'ddos-block-ip'` for every IP in `ipLastSeen`, then `ipLastSeen.clear()` and reset counters.

(For dev preset: > 10 distinct IPs with ≥ 80% error ratio.)

**Strategy 3 — Subnet volume**

For each log: extract `/24` from `remoteIp` (IPv4 only; IPv6 ignored).
If the subnet's `timestamps.length > SUBNET_RATE_THRESHOLD` AND
`ipLastSeen.size ≥ SUBNET_DISTINCT_IP_THRESHOLD`, emit
`'ddos-block-subnet'` with the CIDR string. The server wires this to
`firewallService.blockSubnet(cidr)` which applies exponential backoff
TTL: `baseTtl × 4^(count-1)`, capped at 24 hours.

(For dev preset: > 50 req from /24 with ≥ 5 distinct IPs.)

**Panic Mode**

- Triggered by Strategy 1 (or via DDoS-detected events). Records
  `panicModeStartTime`; if previous panic is within
  `PANIC_MODE_DURATION_MS + PANIC_MODE_COOLDOWN_MS`, the new trigger
  is rejected (cooldown guard).
- `checkPanicModeStatus()` runs every 10 s; when
  `Date.now() - panicModeStartTime > PANIC_MODE_DURATION_MS`, sets
  `panicModeActive = false` and fires the `'System Normal'`
  notification.
- While active, the Express load-shedding middleware (see REST API
  section) sheds heavy endpoints, and the DoS detector's
  `calcEffectiveThreshold` drops the effective threshold for
  untrusted IPs to 20% of base.

---

## Configuration reference

`src/config.json` is loaded at startup. Hot-reload via `PATCH /api/config`:

```jsonc
{
  "server": { "PORT": 3000 },
  "database": { "DB_BATCH_SIZE": 1000, "DB_FLUSH_INTERVAL": 5000 },
  "dos": { "WINDOW_MS": 10000, "THRESHOLD": 120 },
  "ddos": {
    "COORDINATED_ERROR_RATIO_THRESHOLD": 0.8,
    "SUBNET_PREFIX_LENGTH": 24,
    "SUBNET_DISTINCT_IP_THRESHOLD": 5,
    "development": { /* dev preset */ },
    "production":  { /* prod preset */ }
  }
}
```

---