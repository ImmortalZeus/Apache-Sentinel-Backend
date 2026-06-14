import readline from "readline";

const rl = readline.createInterface({
    input: process.stdin,
    terminal: false,
});

let batch: string[] = [];

// eslint-disable-next-line @typescript-eslint/no-misused-promises
rl.on("line", (line: string) => {
    batch.push(line);
    if (batch.length >= 100) {
        void flush();
    }
});

setInterval(() => {
    void flush();
}, 1000);

async function flush() {
    if (batch.length === 0) return;
    const lines = batch.splice(0);
    try {
        const res = await fetch("http://localhost:3000/log/batch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ lines }),
        });
        if (!res.ok) {
            console.error(`Failed to send batch: ${res.status}`);
            batch.unshift(...lines);  // put back on failure
        }
    } catch (err) {
        console.error("Error sending batch:", (err as Error).message);
        batch.unshift(...lines);  // put back on network error
    }
}
