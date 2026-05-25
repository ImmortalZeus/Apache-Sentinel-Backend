# Apache Sentinel - Attack Simulator Tool

The testing suite has been completely unified into a single, interactive PowerShell tool: `attack_tool.ps1` located at the root of the project.

This tool simulates various DoS and DDoS attack vectors directly against the backend (or against an Apache server sitting in front of the backend) to validate rate-limiting, botnet detection, and automated firewall-blocking capabilities.

## Prerequisites

1. Start the Apache Sentinel backend server (must be run as Administrator on Windows to manipulate the firewall):
   ```bash
   cd Apache-Sentinel-Backend
   npm run dev

   # Also start Apache server
   ./httpd.exe
   ```

2. Wait for the server to be ready (you should see: `[Server] Sentinel is running on http://localhost:3000`)

## Running the Simulator

Open a **new PowerShell terminal** at (`tests/`) and run:

```powershell
.\attack_tool.ps1
```

You will be greeted with an interactive menu.

## Configuration (Menu `0`)
Before launching an attack, you can configure the parameters dynamically without editing the code:
- **Target URL**: (Default: `http://127.0.0.1`) — Set this to your Apache server IP or the backend log endpoint if testing direct injection.
- **Requests**: (Default: 200) — How many requests to fire per attack.
- **Delay (ms)**: (Default: 0) — Set a delay between requests to simulate slow-rate attacks.

---

## Single-IP DoS Scenarios

### `1` Normal Traffic
Simulates legitimate user browsing (sends requests with a 500ms delay).
- **Expected**: Backend allows traffic. Trust Score increases over time.

### `2` Flash Crowd (DoS)
Simulates a single user spamming F5 on the same URL rapidly.
- **Expected**: Backend detects an anomaly. Trust Score drops. IP gets rate-limited, then blocked by the Windows Firewall. A native Toast Notification appears.

### `3` HTTP Flood (DoS)
Simulates a malicious HTTP Flood designed to bypass CDNs/caches by appending random query parameters (e.g., `/?q=AbCdEfGh`).
- **Expected**: IP is blocked at Layer 3 by the Firewall.

---

## Multi-IP DDoS Scenarios

### `4` Global Volumetric Flood (DDoS Stage 1)
Sends massive traffic from completely random, spoofed global IPs (`X-Forwarded-For`).
- **Expected**: Triggers `[!] DDoS ALERT: Global Volumetric Flood detected`.
- **Mitigation**: The system enters **Panic Mode (Load Shedding)** for 15 minutes. Heavy endpoints return `503 Service Unavailable`, and all suspicious IPs are aggressively throttled down to 20% capacity.

### `5` Coordinated Botnet (DDoS Stage 2)
Simulates a bot swarm specifically targeting a non-existent endpoint (`/non-existent-login-path`) from many random IPs to trigger 404 errors.
- **Expected**: Triggers `[!] DDoS ALERT: Coordinated attack`. 
- **Mitigation**: Detects the high error ratio (>80%) and triggers a **Swarm Block**, instantly iterating through the botnet swarm and blocking all participating IPs via the Firewall.

### `6` Subnet Attack (DDoS Stage 3)
Simulates an attack originating entirely from a single Class C subnet (e.g., `10.0.50.0/24`).
- **Expected**: Triggers `[!] DDoS ALERT: Subnet Volumetric Attack`.
- **Mitigation**: The system automatically initiates a temporary block on the entire `/24` subnet. If the subnet attacks again later, the TTL duration increases exponentially (15 mins → 1 hr → 4 hrs).

---

## Cleanup

If you need to reset the system state during testing without restarting the server, you can trigger the debug reset route (only available when `NODE_ENV=development`):

```powershell
Invoke-WebRequest -Method Post -Uri "http://localhost:3000/debug/reset"
```

This will clear all blocked IPs, purge the offense histories, and wipe the Windows Firewall rules.