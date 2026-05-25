/**
 * TEST 4: DoS Regression (Single IP)
 *
 * Objective: Verify that the original per-IP DoS detector still functions correctly
 *            independently of the new DDoS detection system.
 *
 * Strategy:  Send 150 requests from a single IP within a short window to trigger
 *            the per-IP threshold.
 *
 * Expected:  Console output: [DoS] <IP> | anomaly=... | trust=...
 *            Console output: [DoS] <IP> BLOCKED
 *            Console output: [Firewall] Đã block IP: <IP>
 */

const { makeLogLine, postLog, sleep } = require('./test-helpers');

async function testDosRegression() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('TEST 4: DoS Regression (Single IP)');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Sending 150 requests from a single IP (10.0.0.99)...');
    console.log('Expected: IP blocked by dosDetector (per-IP threshold)');
    console.log('');

    const targetIp = '10.0.0.99';
    const numRequests = 150;

    const startTime = Date.now();

    for (let i = 1; i <= numRequests; i++) {
        const line = makeLogLine(targetIp, 'GET', '/api/user/profile', 200);

        try {
            await postLog(line);

            if (i % 25 === 0) {
                console.log(`Progress: ${i}/${numRequests} requests sent from ${targetIp}`);
            }
        } catch (err) {
            console.error(`Failed to send request ${i}:`, err.message);
        }

        // Extremely small delay to simulate a burst from a single source
        await sleep(5);
    }

    const elapsed = Date.now() - startTime;
    console.log('');
    console.log(`✓ Sent ${numRequests} requests in ${elapsed}ms`);
    console.log(`✓ Check server console for: [DoS] ${targetIp} BLOCKED`);
    console.log('');
}

// Run the test
testDosRegression()
    .then(() => {
        console.log('Test completed successfully');
        process.exit(0);
    })
    .catch(err => {
        console.error('Test failed:', err);
        process.exit(1);
    });
