import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  terminal: false,
});

// eslint-disable-next-line @typescript-eslint/no-misused-promises
rl.on("line", async (line: string) => {
    try {
        const res = await fetch("http://localhost:3000/log", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: line,
        });

        if (!res.ok) {
            console.error(`Failed to send log: ${res.status} ${res.statusText}`);
        }
    } catch (err) {
        console.error("Error sending log:", (err as Error).message);
    }
});
