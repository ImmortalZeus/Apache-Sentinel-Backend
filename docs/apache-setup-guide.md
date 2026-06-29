# Apache Setup Guide

Step-by-step Windows setup for Apache HTTP Server 2.4 as the front-end
log source for Apache Sentinel. After this guide, every HTTP request
Apache serves will be piped to the backend's `log-collector.ts`, which
parses the Combined Log Format and forwards each line to the detection
pipeline.

> **Run all shell steps below in an Administrator terminal.** Apache
> service install + restart, and `netsh advfirewall` (used by the
> backend), all require elevation. If you skip this, `httpd -k install`
> fails with "Access is denied" or the backend refuses to start.

> **The backend must be running before Apache sends logs.** Otherwise
> Apache will try to pipe into a dead process and Apache's own
> `error.log` will fill up. See `../README.md` for backend startup.

---

## Prerequisites

| Requirement | Verified version |
|---|---|
| Windows 10/11 or Server 2016+ | Windows 11 (any modern build) |
| Node.js (needed to run `log-collector.js` in the pipe) | 24.15.0 |
| Apache HTTP Server (Win64) | 2.4.66 |
| MongoDB (already running before this guide) | 8.2.0 |
| Apache Sentinel backend (already built, will run after Apache) | see `../README.md` |

Node.js is required because Apache's `CustomLog "|..."` pipe runs the
external program directly. We use Node to execute the compiled
collector.

---

## Steps

### 1. Clone or copy the project

Pick a clean Windows path with no spaces (the `CustomLog` pipe and
Apache's quoted config are both easier without spaces). Example used
throughout this guide:

```
D:\apache-sentinel\
```

### 2. Install backend dependencies and build

Open **PowerShell (Administrator)**:

```powershell
cd D:\apache-sentinel\backend
npm install
npm run build
```

`npm run build` compiles TypeScript via `tsc` + `tsc-alias` and writes
the output to `D:\apache-sentinel\backend\dist\`. You should see
`log-collector.js`, `server.js`, and a populated `dist/` tree.

**Do this before step 5** — the `CustomLog` directive in step 5 points
at `dist\log-collector.js`, which only exists after a successful build.

### 3. Download Apache HTTP Server

Get the Windows 64-bit build from [Apache Lounge](https://www.apachelounge.com/download/). Pick a stable 2.4.x release, e.g.:

```
httpd-2.4.66-260223-Win64-VS18.zip
```

The exact build date / VC++ runtime version in the filename may
differ; any 2.4.x Win64 VS17 or VS18 build works.

### 4. Extract Apache to `C:\Apache24\`

Unzip the archive and move (or copy) the resulting `Apache24` folder to
the root of your C drive:

```
C:\Apache24\
├── bin\
│   ├── httpd.exe
│   └── ...
├── conf\
│   └── httpd.conf
├── htdocs\
├── logs\
└── modules\
```

### 5. Install + start the Apache Windows service

Still in the **Administrator PowerShell**:

```powershell
cd C:\Apache24\bin
httpd.exe -k install
httpd.exe -k start
```

`httpd -k install` registers the service; `httpd -k start` starts it.
The first install may pop a Windows Firewall prompt — allow inbound
HTTP (port 80) for both Private and Domain networks.

To check the service status:

```powershell
Get-Service Apache2.4
```

Expected output: `Status: Running`.

### 6. Configure `CustomLog` to pipe into the collector

Open `C:\Apache24\conf\httpd.conf` in any text editor **as Administrator**
(the file is writable only by Administrators by default).

Find the existing `<IfModule log_config_module>` block. Inside it, add
(or uncomment) the following `CustomLog` directive:

```apache
CustomLog "|C:/Program Files/nodejs/node.exe D:/apache-sentinel/backend/dist/log-collector.js" combined
```

Notes on the path:

- **`C:/Program Files/nodejs/node.exe`** — adjust if Node is installed
  elsewhere. Check with `where.exe node` in PowerShell.
- **`D:/apache-sentinel/backend/dist/log-collector.js`** — adjust to
  your actual project path. The `backend/` segment is required; the
  `dist/` segment requires step 2 (build) to have run.
- **Forward slashes** in the path are intentional — Apache on Windows
  accepts both `/` and `\`, but `/` avoids escaping issues inside the
  quoted pipe command.

The `combined` log format is the Apache default and matches what
`log-collector.ts` parses. Do not change it.

### 7. Validate config + restart Apache

Still in **Administrator PowerShell**:

```powershell
cd C:\Apache24\bin
httpd.exe -t
```

Expected: `Syntax OK`. If you see `Syntax error ...`, re-open
`httpd.conf`, fix the directive, and re-run.

```powershell
httpd.exe -k restart
```

The service restarts and the new `CustomLog` takes effect immediately.

### 8. Start the backend (if not already running)

In a separate terminal:

```powershell
cd D:\apache-sentinel\backend
npm run dev
```

Wait for: `[Server] Sentinel is running on http://localhost:3000`.
Note: the backend also requires Administrator privileges (it uses
`netsh advfirewall`).

### 9. Verify the pipe is working

Hit your Apache server with a request:

```powershell
curl http://localhost/
```

You should see Apache's default `It works!` HTML page.

Check the backend received the log:

```powershell
curl http://localhost:3000/api/stats
```

The `totalLogsAnalyzed` field should be ≥ 1. If it is still 0 after
several seconds, see **Troubleshooting** below.

You can also check Apache's own logs at `C:\Apache24\logs\access.log`
(stdout stream the pipe consumes) and `C:\Apache24\logs\error.log`
(Apache's own diagnostics — any pipe-startup failure will appear here).

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `httpd -k install` fails with "Access is denied" | Terminal not Administrator | Re-open PowerShell as Administrator |
| `httpd -t` reports "Syntax error" | Typo in `CustomLog` directive | Check escaping; use forward slashes in paths inside the quoted pipe command |
| `totalLogsAnalyzed` stays 0 in `/api/stats` | Backend not running, or on wrong port | Confirm backend is running on port 3000; `curl http://localhost:3000/api/config` should return JSON |
| `totalLogsAnalyzed` stays 0 but backend is up | Apache logged a pipe-startup error | Check `C:\Apache24\logs\error.log` for "(32)Broken pipe" or similar |
| Pipe starts but immediately exits | `log-collector.js` script threw at import | Run `node D:/apache-sentinel/backend/dist/log-collector.js` manually from a terminal to see the stack trace |
| Apache refuses to start after edit | Bad `httpd.conf` syntax | `httpd -t` will show the line number; fix and retry |
| Logs are received but nothing is ever blocked | Backend in production mode, thresholds very high | Confirm `NODE_ENV=development` in `backend/.env` |

### Where to look when something is wrong

- **Apache's view:** `C:\Apache24\logs\error.log` (rotated daily)
- **Backend's view:** the terminal running `npm run dev`
- **Detection events:** the backend terminal logs `[DoS] <ip> BLOCKED`,
  `[!] DDoS ALERT: ...`, `[+] Firewall: Blocked ...`
- **OS firewall state:** `netsh advfirewall firewall show rule name="Apache-Sentinel-Block-List"`

---

## Updating the collector after code changes

The `log-collector.js` running inside the Apache pipe is a snapshot of
the compiled JS. If you modify `log-collector.ts` and rebuild, the
running Apache service is **still holding the old compiled file** in
memory. To pick up changes:

```powershell
cd C:\Apache24\bin
httpd.exe -k restart
```

This restarts the service and re-execs the pipe program.

---

## Removing the pipe (revert to file-based logging)

If you need to disable the pipe temporarily (e.g. for debugging):

1. Edit `C:\Apache24\conf\httpd.conf`
2. Comment out the `CustomLog "|..."` line by prefixing with `#`
3. Uncomment the default file-based `CustomLog "logs/access.log" combined` line if present
4. `httpd.exe -t && httpd.exe -k restart`

Apache will resume logging to `C:\Apache24\logs\access.log` and the
backend will receive no further records until you re-enable the pipe.

---

## See also

- [`../README.md`](../README.md) — top-level project overview
- [`apache-log-format.md`](apache-log-format.md) — Combined Log Format reference parsed by the collector
- [`../../../attack-tool/README.md`](../../../attack-tool/README.md) — automated test harness (24 cases + load tester)
- [`../../../Report/main.pdf`](../../../Report/) §4.1 — full log-monitoring implementation walkthrough