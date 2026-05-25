/**
 * TEST 3: Subnet Volumetric Blocking
 *
 * Objective: Verify that the subnet tracker detects when a single /24 subnet
 *            generates excessive traffic and blocks the entire CIDR.
 *
 * Strategy:  Send 60 requests from IPs within the same /24 subnet (192.168.100.1-60).
 *            Each IP sends only 1 request (well below per-IP threshold).
 *
 * Expected:  1. Console output: [🚨 DDoS ALERT] Subnet Volumetric Attack detected from 192.168.100.0/24
 *            2. Windows Firewall rule shows blocked CIDR
 *            3. After 15 minutes, CIDR is auto-unblocked (not tested here due to time)
 *
 * Config:    development.SUBNET_RATE_THRESHOLD = 50
 *            development.SUBNET_BLOCK_TTL_MS = 900000 (15 minutes)
 *
 * Manual Verification:
 *   Run: netsh advfirewall firewall show rule name="DoS-Block-List"
 *   Look for: RemoteIP: 192.168.100.0/24
 */

const { makeLogLine, postLog, sleep } = require('./test-helpers');

async function testSubnetBlocking() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('TEST 3: Subnet Volumetric Blocking');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Sending 60 requests from 192.168.100.1-60 (same /24 subnet)...');
    console.log('Expected: [🚨 DDoS ALERT] Subnet Volumetric Attack detected');
    console.log('');

    const subnetBase = '192.168.100';
    const numRequests = 60;

    const startTime = Date.now();

    for (let i = 1; i <= numRequests; i++) {
        const ip = `${subnetBase}.${i}`;
        const line = makeLogLine(ip, 'GET', '/api/search', 200);

        try {
            await postLog(line);

            if (i % 10 === 0) {
                console.log(`Progress: ${i}/${numRequests} requests sent from ${subnetBase}.x`);
            }
        } catch (err) {
            console.error(`Failed to send request from ${ip}:`, err.message);
        }

        // Small delay between requests
        await sleep(20);
    }

    const elapsed = Date.now() - startTime;
    console.log('');
    console.log(`✓ Sent ${numRequests} requests in ${elapsed}ms`);
    console.log('✓ Check server console for: [🚨 DDoS ALERT] Subnet Volumetric Attack detected from 192.168.100.0/24');
    console.log('');
    console.log('Manual Verification:');
    console.log('  Run: netsh advfirewall firewall show rule name="DoS-Block-List"');
    console.log('  Expected: RemoteIP should include 192.168.100.0/24');
    console.log('');
    console.log('Note: The subnet will auto-unblock after 15 minutes (SUBNET_BLOCK_TTL_MS)');
    console.log('');
}

// Run the test
testSubnetBlocking()
    .then(() => {
        console.log('Test completed successfully');
        process.exit(0);
    })
    .catch(err => {
        console.error('Test failed:', err);
        process.exit(1);
    });
