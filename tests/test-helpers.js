/**
 * Shared helpers used by all DDoS test scripts.
 */

const http = require('http');

const SERVER_PORT = 3000;

/**
 * Build an Apache Combined Log Format line.
 * Format: IP - user [DD/Mon/YYYY:HH:MM:SS +0000] "METHOD /path HTTP/1.1" STATUS BYTES "ref" "UA"
 */
function makeLogLine(ip, method = 'GET', path = '/', status = 200) {
    const now = new Date();
    const day   = String(now.getUTCDate()).padStart(2, '0');
    const month = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][now.getUTCMonth()];
    const year  = now.getUTCFullYear();
    const time  = now.toISOString().slice(11, 19); // HH:MM:SS
    const datetime = `${day}/${month}/${year}:${time} +0000`;

    return `${ip} - - [${datetime}] "${method} ${path} HTTP/1.1" ${status} 512 "-" "TestBot/1.0"`;
}

/**
 * Clean up the firewall rule after a test.
 */
async function cleanupFirewall() {
    const { exec } = require('child_process')
    return new Promise(resolve => {
        exec('netsh advfirewall firewall delete rule name="DoS-Block-List"', resolve)
    })
}

/**
 * POST a single log line to the server.
 * Returns a Promise that resolves with the HTTP status code.
 */
function postLog(line) {
    return new Promise((resolve, reject) => {
        const body = line;
        const options = {
            hostname: 'localhost',
            port: SERVER_PORT,
            path: '/log',
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const req = http.request(options, (res) => {
            res.resume();
            resolve(res.statusCode);
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

/**
 * Sleep for ms milliseconds.
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { makeLogLine, postLog, sleep, cleanupFirewall };
