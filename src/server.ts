import "./env";
import rawConfig from './config.json'; 
import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import nocache from 'nocache';

// Services & Utilities
import { logService } from 'services/Log.service';
import { dbService } from "services/db.service";
import { firewallService } from "services/firewall.service";
import { notificationService } from "services/notification.service";
import { lineParser } from 'utils/logParsers/lineParser';
import { checkAdminPrivilege } from "utils/checkAdminPrivilege";

// Detectors
import { dosDetector } from './detectors/dos.detector';
import { ddosDetector } from './detectors/ddos.detector';

// Configuration
const serverConfig   = rawConfig.server

const app = express();
const port: number = serverConfig.PORT;

// Global Middleware
app.use(express.text());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer();
app.use(upload.none());
app.use(nocache());

app.use(express.static('public'));
app.set('etag', false);
app.disable('view cache');

// DDoS Event Listeners
ddosDetector.on('block-ip', async (ip: string) => {
    try {
        await firewallService.block(ip);
    } catch (err) {
        console.error(`[Server] Failed to execute DDoS IP block for ${ip}:`, err);
    }
});

ddosDetector.on('block-subnet', async (subnet: string) => {
    try {
        await firewallService.blockSubnet(subnet);
    } catch (err) {
        console.error(`[Server] Failed to execute DDoS Subnet block for ${subnet}:`, err);
    }
});

// GET Route - Health Check
app.get('/', (req: Request, res: Response) => {
    res.send('Hello World! Apache Sentinel is running.');
});

// [PANIC MODE] Load Shedding Middleware
// During Stage 1 DDoS, we block heavy processing to save the server
app.use((req: Request, res: Response, next: NextFunction) => {
    if (ddosDetector.isUnderAttack()) {
        const heavyPaths = ['/api/stats', '/api/export', '/api/search'];
        if (heavyPaths.some(path => req.path.startsWith(path))) {
            res.status(503).send({
                message: "System is under heavy load (Panic Mode). This feature is temporarily disabled."
            });
            return;
        }
    }
    next();
});

// POST Route - Consolidated Log Processing
app.post('/log', async (req: Request, res: Response) => {
    try {
        const line: string = req.body ? req.body as string : "";
        const lineData = lineParser.run(line);

        if (!lineData) {
            res.status(400).send({ message: "Failed to parse log" });
            return;
        }
        
        // Convert Mongoose Document to plain object if necessary to avoid issues with nested properties
        const safeLogData = typeof (lineData as any).toObject === 'function' 
            ? (lineData as any).toObject() 
            : lineData;

        // 1. Check if this IP is already blocked (by subnet or individual block)
        if (lineData.remoteIp && firewallService.isBlocked(lineData.remoteIp)) {
            // Already blocked by firewall — skip all analysis
            //logService.add(lineData);
            logService.add(safeLogData);
            res.sendStatus(200);
            return;
        }

        // 2. DoS Analysis (Per-IP) and Firewall Execution
        let isBlocked = false;
        if (lineData.remoteIp) {
            // Check if this specific IP is spamming
            const shouldBlock = await dosDetector.check(lineData.remoteIp);

            if (shouldBlock) {
                isBlocked = true;
                const alreadyBlocked = firewallService.isBlocked(lineData.remoteIp);

                // Block the IP at the Layer 3 network level
                await firewallService.block(lineData.remoteIp);

                if (!alreadyBlocked) {
                    // Dispatch a notification only upon the initial block event
                    notificationService.notify(lineData.remoteIp);
                }
            }
        }

        // 3. DDoS Analysis (Global, Coordinated, Subnet Strategies)
        // We ONLY count the request towards DDoS thresholds if it didn't come from an already-blocked DoS spammer
        if (!isBlocked) {
            ddosDetector.check(lineData);
        }

        // 4. Save Log to Database
        logService.add(safeLogData);

        res.sendStatus(200);
    } catch (err) {
        console.error("[Server] Error processing incoming log:", err);
        res.status(500).send('Internal Server Error');
    }
});

// POST Route - Batch Log Processing
app.post('/log/batch', async (req: Request, res: Response) => {
    try {
        const lines: string[] = req.body.lines || [];
        for (const line of lines) {
            const lineData = lineParser.run(line);

            if (!lineData) continue;

            // Convert Mongoose Document to plain object if necessary to avoid issues with nested properties
            const safeLogData = typeof (lineData as any).toObject === 'function' 
                ? (lineData as any).toObject() 
                : lineData;

            // 1. Check if this IP is already blocked (by subnet or individual block)
            if (lineData.remoteIp && firewallService.isBlocked(lineData.remoteIp)) {
                // Already blocked by firewall — skip all analysis
                logService.add(safeLogData);
                continue;
            }

            // 2. DoS Analysis (Per-IP) and Firewall Execution
            let isBlocked = false;
            if (lineData.remoteIp) {
                const shouldBlock = await dosDetector.check(lineData.remoteIp);

                if (shouldBlock) {
                    isBlocked = true;
                    const alreadyBlocked = firewallService.isBlocked(lineData.remoteIp);

                    // Block the IP at the Layer 3 network level
                    await firewallService.block(lineData.remoteIp);

                    if (!alreadyBlocked) {
                        // Dispatch a notification only upon the initial block event
                        notificationService.notify(lineData.remoteIp);
                    }
                }
            }

            // 3. DDoS Analysis (Global, Coordinated, Subnet Strategies)
            // We ONLY count the request towards DDoS thresholds if it didn't come from an already-blocked DoS spammer
            if (!isBlocked) {
                ddosDetector.check(lineData);
            }

            // 4. Save Log to Database
            logService.add(safeLogData);
        }
        res.sendStatus(200);
    } catch (err) {
        console.error("[Server] Error processing incoming log batch:", err);
        res.status(500).send('Internal Server Error');
    }
});

if (process.env.NODE_ENV === 'development') {
    app.post('/debug/reset', async (req: Request, res: Response) => {
        // Reset detectors and firewall state for testing purposes
        dosDetector.reset();
        ddosDetector.reset();
        await firewallService.reset();
        res.sendStatus(200);
    });
}

// 404 Error Handling Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
    const error = new Error('Not Found') as Error & { status?: number };
    error.status = 404;
    next(error);
});

// Global Error Handling Middleware
app.use((error: Error & { status?: number }, req: Request, res: Response, next: NextFunction) => {
    res.status(error.status || 500);
    res.send({ message: error.message });
});

// System Initialization
async function startServer() {
    try {
        // 1. Establish Database Connection
        await dbService.connect();

        // 2. Verify Administrator Privileges (Required for executing netsh commands)
        await checkAdminPrivilege();
        
        // 3. Synchronize Firewall State
        await firewallService.syncFromFirewall();

        // This synchronizes the internal detector state with the OS firewall state.
        dosDetector.syncBlockedIPs(firewallService.getBlockedIPs());

        // 4. Initialize the HTTP Listener
        app.listen(port, () => {
            console.log(`[Server] Sentinel is running on http://localhost:${port}`);
        });
    } catch (error) {
        console.error("[Server] Failed to start the application:", error);
        process.exit(1);
    }
}

startServer();

// Graceful Shutdown Handler
let shuttingDown = false;

const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\n[Server] Received ${signal}. Initiating graceful shutdown...`);
    try {
        // Flush any remaining logs from memory to the database before exiting
        await logService.flush(); 
        await dbService.disconnect();
    } catch (err) {
        console.error('[Server] Error encountered during shutdown sequence:', err);
    } finally {
        process.exit(0);
    }
};

['SIGINT', 'SIGTERM'].forEach(sig => {
    process.on(sig, shutdown);
});