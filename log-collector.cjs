// Apache Sentinel - Log Collector Wrapper
// Apache pipes each access log line to this script via CustomLog.
// This script reads stdin line-by-line, batches them, and POSTs
// to the backend's /log/batch endpoint every second or every 100 lines.

const readline = require("readline");

const rl = readline.createInterface({
  input: process.stdin,
  terminal: false,
});

let batch = [];

rl.on("line", (line) => {
  batch.push(line);
  if (batch.length >= 100) {
    flush();
  }
});

setInterval(flush, 1000);

function flush() {
  if (batch.length === 0) return;
  const lines = batch.splice(0);
  const body = JSON.stringify({ lines });

  // Use built-in http module — no dependencies needed
  const http = require("http");
  const req = http.request(
    {
      hostname: "localhost",
      port: 3000,
      path: "/log/batch",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    },
    (res) => {
      if (res.statusCode !== 200) {
        process.stderr.write(`[log-collector] batch failed: ${res.statusCode}\n`);
        batch.unshift(...lines); // put back on failure
      }
      res.resume(); // drain
    }
  );

  req.on("error", (err) => {
    process.stderr.write(`[log-collector] error: ${err.message}\n`);
    batch.unshift(...lines); // put back on network error
  });

  req.write(body);
  req.end();
}
