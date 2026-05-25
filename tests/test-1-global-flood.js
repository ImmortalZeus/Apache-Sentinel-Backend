/**
 * TEST 1: Global Volumetric Flood Detection
 *
 * Objective: Verify that the global rate limiter detects volumetric floods
 *            across multiple IPs before any single IP triggers per-IP threshold.
 *
 * Strategy:  Send 150+ requests within 10 seconds, distributed across 50 different IPs.
 *            Each IP sends only 3 requests (well below per-IP threshold of 100).
 *
 * Expected:  Console output: [DDoS ALERT] Global Volumetric Flood detected
 *
 * Config:    development.GLOBAL_RATE_THRESHOLD = 100
 *            development.GLOBAL_RATE_WINDOW_MS = 10000
 */

const { makeLogLine, postLog, sleep } = require('./test-helpers');

async function testGlobalVolumetricFlood() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('TEST 1: Global Volumetric Flood Detection');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Sending 150 requests from 50 distinct IPs (3 req/IP)...');
    console.log('Expected: [DDoS ALERT] Global Volumetric Flood detected');
    console.log('');

    const totalRequests = 150;
    const numIPs = 50;
    const requestsPerIP = Math.ceil(totalRequests / numIPs);

    let sent = 0;
    const startTime = Date.now();

    for (let i = 0; i < numIPs && sent < totalRequests; i++) {
        const ip = `192.168.${Math.floor(i / 254)}.${(i % 254) + 1}`;

        const batch = [];
        for (let j = 0; j < requestsPerIP && sent < totalRequests; j++) {
            const line = makeLogLine(ip, 'GET', '/api/data', 200);
            batch.push(postLog(line));
            sent++;
        }
        await Promise.all(batch);

        if (sent % 30 === 0) {
            console.log(`Progress: ${sent}/${totalRequests} requests sent`);
        }
    }

    const elapsed = Date.now() - startTime;
    console.log('');
    console.log(`✓ Sent ${sent} requests in ${elapsed}ms`);
    console.log('✓ Check server console for: [DDoS ALERT] Global Volumetric Flood detected');
    console.log('');
}

// Run the test
testGlobalVolumetricFlood()
    .then(() => {
        console.log('Test completed successfully');
        process.exit(0);
    })
    .catch(err => {
        console.error('Test failed:', err);
        process.exit(1);
    });
