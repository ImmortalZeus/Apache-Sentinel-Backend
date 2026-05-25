/**
 * TEST 2: Coordinated Botnet Pattern Detection
 *
 * Objective: Verify that the coordinated pattern detector identifies when many
 *            distinct IPs target the same endpoint simultaneously.
 *
 * Strategy:  Send 15 requests to /login from 15 different IPs within a short window.
 *
 * Expected:  Console output: [DDoS ALERT] Coordinated botnet attack on /login from 15 distinct IPs
 *
 * Config:    development.COORDINATED_DISTINCT_IP_THRESHOLD = 10
 */

const { makeLogLine, postLog, sleep } = require('./test-helpers');

async function testCoordinatedPattern() {
    console.log('═══════════════════════════════════════════════════════════');
    console.log('TEST 2: Coordinated Botnet Pattern Detection');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Sending 15 requests to /login from 15 distinct IPs...');
    console.log('Expected: [DDoS ALERT] Coordinated botnet attack on /login');
    console.log('');

    const numIPs = 15;
    const targetPath = '/login';

    const startTime = Date.now();

    for (let i = 0; i < numIPs; i++) {
        const ip = `10.0.${Math.floor(i / 254)}.${(i % 254) + 1}`;
        const status = i < 12 ? 404 : 200; // 12/15 = 80% error rate
        const line = makeLogLine(ip, 'POST', targetPath, status);

        try {
            await postLog(line);
            console.log(`[${i + 1}/${numIPs}] Sent request from ${ip} to ${targetPath}`);
        } catch (err) {
            console.error(`Failed to send request from ${ip}:`, err.message);
        }

        // Small delay between requests
        await sleep(50);
    }

    const elapsed = Date.now() - startTime;
    console.log('');
    console.log(`✓ Sent ${numIPs} requests in ${elapsed}ms`);
    console.log('✓ Check server console for: [DDoS ALERT] Coordinated botnet attack on /login from 15 distinct IPs');
    console.log('');
}

// Run the test
testCoordinatedPattern()
    .then(() => {
        console.log('Test completed successfully');
        process.exit(0);
    })
    .catch(err => {
        console.error('Test failed:', err);
        process.exit(1);
    });
