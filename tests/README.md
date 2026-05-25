# DDoS Detection System - Test Suite

This directory contains test scripts to verify all four detection strategies work correctly.

## Prerequisites

1. Start the Apache Sentinel backend server:
   ```bash
   cd Apache-Sentinel-Backend
   npm run dev
   ```

2. Wait for the server to be ready (you should see: `Sentinel is running on http://localhost:3000`)

## Running Tests

Run each test in a separate terminal while the server is running.

### Test 1: Global Volumetric Flood
```bash
node test-1-global-flood.js
```

**Expected**: `[DDoS ALERT] Global Volumetric Flood detected`

---

### Test 2: Coordinated Pattern Detection
```bash
node test-2-coordinated-pattern.js
```
**Expected**: `[DDoS ALERT] Coordinated botnet attack on /login from 15 distinct IPs`

---

### Test 3: Subnet Volumetric Blocking
```bash
node test-3-subnet-blocking.js
```
**Expected**:
- `[DDoS ALERT] Subnet Volumetric Attack detected from 192.168.100.0/24`
- Verify firewall: `netsh advfirewall firewall show rule name="DoS-Block-List"`

**Note**: The blocked subnet will auto-unblock after 15 minutes.

---

### Test 4: DoS Regression (Single IP)
```bash
node test-4-dos-regression.js
```
**Expected**:
- `[DoS] 10.0.0.99 | anomaly=... | trust=...`
- `[DoS] 10.0.0.99 BLOCKED`
- `[Firewall] Đã block IP: 10.0.0.99`

---

### Run All Tests
```bash
node test-all.js
```

## Test Configuration

All tests use development thresholds defined in `src/config.json`:
- `GLOBAL_RATE_THRESHOLD`: 100 requests
- `COORDINATED_DISTINCT_IP_THRESHOLD`: 10 distinct IPs
- `SUBNET_RATE_THRESHOLD`: 50 requests per subnet

To test with production thresholds, set `NODE_ENV=production` before starting the server.

## Cleanup

After testing, you may want to clear blocked IPs from the firewall:

```powershell
netsh advfirewall firewall delete rule name="DoS-Block-List"
```

Or run the cleanup script (if implemented):

```bash
node cleanup.js
```