# Update Summary

## 1. Configuration & Environments
- **`config.json` Overhaul**: Replaced a flat configuration structure with nested, domain-specific configs (`server`, `database`, `dos`, `ddos`).
- **Environment-Specific DDoS Rules**: Added explicit configs for `development` and `production` inside the DDoS section, allowing for different thresholds (e.g., `GLOBAL_RATE_THRESHOLD`, `SUBNET_RATE_THRESHOLD`) depending on the environment.
- **`.env.example`**: Added `NODE_ENV=development` reference.

## 2. Server & Routing (`server.ts`)
- **Batch Processing**: Added a new `POST /log/batch` endpoint to ingest logs in bulk, improving throughput.
- **Integration of Detectors**: Connected the `ddosDetector` and `dosDetector` directly into the request pipeline.
- **Active Firewall Blocking**: The server now awaits `dosDetector.check(remoteIp)` and actively instructs the `firewallService` to block malicious IPs. Notifications are dispatched only upon the initial block event.
- **Graceful Boot & Shutdown**: 
  - Boot sequence now explicitly checks for Admin Privileges (`checkAdminPrivilege`) and synchronizes existing firewall states into the `dosDetector`.
  - Shutdown sequence was improved to cleanly disconnect from the DB.
- **Dev Debugging**: Added a `POST /debug/reset` route in `development` environments to wipe firewall and history states for easy testing.

## 3. Log Ingestion (`log-collector.ts`)
- **Batch Buffering**: Transformed the collector from making single HTTP POSTs per log line to aggregating logs into batches of 100 lines (or flushing every 1 second).
- **Fault Tolerance**: If the network request to `/log/batch` fails, the collector puts the unsent batch back into the buffer to try again, preventing data loss during temporary network blips.

## 4. Firewall & Mitigation (`firewall.service.ts`)
- **Thread Safety**: Introduced a `Mutex` wrapper (`syncRuleSafe`) around the `netsh` execution to prevent race conditions when multiple blocks trigger concurrently.
- **Subnet Blocking**: Added the `blockSubnet(cidr)` function to block entire `/24` subnets dynamically.
- **Exponential Backoff TTL**: Implemented an `offenseHistory` tracker that automatically increases the block duration (TTL) for repeat offenders (e.g., 15 mins → 1 hour → 4 hours). Includes a scheduled cleanup task to purge old histories.
- **Auto-Unblocking**: Blocked subnets are now automatically removed when their TTL expires.

## 5. Log Parsing & Models (`lineParser.ts`, `Log.entity.ts`)
- **Robust Date Parsing**: Replaced string replacement hacks with a `parseApacheDate` utility using regex and a month-map. Properly parses Apache timestamp formats like `20/Oct/2023:14:00:00 +0700` into valid JavaScript `Date` objects.
- **Error Handling**: Instead of throwing an error when a line fails to parse, it returns `null` and logs to the console, preventing crash-loops when batch processing corrupted log lines.
- **Database Schema Optimization**: Removed unused geographic and user-agent parsed fields from the `Log` schema. Added high-performance indexes on `remoteIp` and `time`.
- **Side Effect Removal**: Removed the hidden `logService.add(log)` side effect directly from inside the parser.

## 6. Services Updates (`db.service.ts`, `Log.service.ts`, `notification.service.ts`)
- **Explicit Loop Initialization**: `startFlushLoop` is now explicitly exported and started only *after* a successful MongoDB connection in `db.service.ts`.
- **DDoS Notifications**: Added a new `notifyDDoS` method to spawn specific Windows Toast notifications for DDoS alerts.

---