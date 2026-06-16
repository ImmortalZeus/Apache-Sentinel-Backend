import "./env";
import cors from 'cors';
import rawConfig from './config.json'; 
import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import nocache from 'nocache';
import cookieParser from 'cookie-parser';
import authRoutes from './routes/auth.routes';
import { seedAdmin } from './seed';

// Services & Utilities
import { logService } from 'services/Log.service';
import { dbService } from "services/db.service";
import { firewallService } from "services/firewall.service";
import { notificationService } from "services/notification.service";
import { configService } from './services/config.service';
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
app.use(cookieParser());

app.use(cors({
  origin: 'http://localhost:5173',
  credentials: true,
})); // Allow the Vite frontend to access this API with credentials

const upload = multer();
app.use(upload.none());
app.use(nocache());

app.use(express.static('public'));
app.set('etag', false);
app.disable('view cache');

// DDoS Event Listeners
ddosDetector.on('ddos-block-ip', async (ip: string) => {
    try {
        await firewallService.block(ip);
    } catch (err) {
        console.error(`[Server] Failed to execute DDoS IP block for ${ip}:`, err);
    }
});

ddosDetector.on('ddos-block-subnet', async (subnet: string) => {
    try {
        await firewallService.blockSubnet(subnet);
    } catch (err) {
        console.error(`[Server] Failed to execute DDoS Subnet block for ${subnet}:`, err);
    }
});

ddosDetector.on('ddos-unblock-ip', async (ip: string) => {
    try {
        await firewallService.unblock(ip);
    } catch (err) {
        console.error(`[Server] Failed to execute DDoS IP unblock for ${ip}:`, err);
    }
});

ddosDetector.on('ddos-unblock-subnet', async (subnet: string) => {
    try {
        await firewallService.unblockSubnet(subnet);
    } catch (err) {
        console.error(`[Server] Failed to execute DDoS Subnet unblock for ${subnet}:`, err);
    }
});

// DoS Event Listeners
dosDetector.on('dos-block-ip', async (ip: string) => {
    try {
        const alreadyBlocked = firewallService.isBlocked(ip);
        await firewallService.block(ip);

        if (!alreadyBlocked) {
            notificationService.notify(ip);
        }
    } catch (err) {
        console.error(`[Server] Failed to execute DoS IP block for ${ip}:`, err);
    }
});

dosDetector.on('dos-unblock-ip', async (ip: string) => {
    try {
        await firewallService.unblock(ip);
    } catch (err) {
        console.error(`[Server] Failed to execute DoS IP unblock for ${ip}:`, err);
    }
});

// GET Route - Health Check
app.get('/', (req: Request, res: Response) => {
    res.send('Hello World! Apache Sentinel is running.');
});

// Auth Routes
app.use('/api/auth', authRoutes);

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

        // 2. DoS Analysis (Per-IP)
        // Event listener handles firewall blocking and notifications
        let isBlocked = false;
        if (lineData.remoteIp) {
            isBlocked = await dosDetector.check(lineData.remoteIp);
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

            // 2. DoS Analysis (Per-IP)
            // Event listener handles firewall blocking and notifications
            let isBlocked = false;
            if (lineData.remoteIp) {
                isBlocked = await dosDetector.check(lineData.remoteIp);
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

// ==========================================
// FRONTEND API CONTRACT ROUTES
// ==========================================

// 1. System Metrics (Dashboard)
app.get('/api/stats', async (req: Request, res: Response) => {
    console.log("[API] Đã nhận được request vào /api/stats"); 
    try {
        const totalLogs = await logService.getTotalCount();
        console.log(`[API] Đếm xong: ${totalLogs}`);
        
        res.json({
            totalLogsAnalyzed: totalLogs,
            activeBlockedIps: firewallService.getBlockedIPs().length,
            currentCpuUsage: dosDetector.getCPUUsage(),
            isDosPanicMode: false,
            isDdosPanicMode: ddosDetector.isUnderAttack(),
            globalThreshold: dosDetector.getGlobalThreshold(),
            trafficHistory: logService.getTrafficHistory()
        });
    } catch (err) {
        console.error("[API] Lỗi khi lấy stats:", err);
        res.status(500).json({ message: "Internal server error" });
    }
});

// 2. Logs Explorer
app.get('/api/logs', async (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 100;
        const limitNum = Math.min(1000, Math.max(10, limit));
        const result = await logService.getLogs({ page, limit: limitNum });

        // Format logs for frontend
        const formattedLogs = result.data.map(log => ({
            id: log._id,
            ip: log.remoteIp,
            method: log.requestMethod || 'UNKNOWN',
            path: log.requestUrl || '-',
            statusCode: log.responseStatusCode,
            timestamp: log.time,
            userAgent: log.userAgent
        }));

        res.json({
            data: formattedLogs,
            pagination: result.pagination
        });
    } catch (err) {
        console.error("[API] Error fetching logs:", err);
        res.status(500).json({ message: "Internal server error" });
    }
});

// 3. Firewall Rules Management
app.get('/api/firewall/rules', (req: Request, res: Response) => {
    try {
        const page = parseInt(req.query.page as string) || 1;
        const limit = parseInt(req.query.limit as string) || 100;

        const blockedIPs = firewallService.getBlockedIPs();
        const total = blockedIPs.length;
        const pageNum = Math.max(1, page);
        const limitNum = Math.min(1000, Math.max(10, limit));
        const skip = (pageNum - 1) * limitNum;

        const paginatedIPs = blockedIPs.slice(skip, skip + limitNum);

        const rules = paginatedIPs.map(ip => {
            const profile = dosDetector.getProfile(ip);
            return {
                ip: ip,
                detector: profile ? 'DOS' : 'MANUAL',
                reason: profile ? `Trust Score depleted (${profile.trustScore})` : 'Added via OS Firewall',
                blockedAt: new Date().toISOString(),
                trustScore: profile ? profile.trustScore : 0
            };
        });

        res.json({
            data: rules,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum)
            }
        });
    } catch (err) {
        console.error("[API] Error fetching firewall rules:", err);
        res.status(500).json({ message: "Internal server error" });
    }
});

// 4. Manual Unblock
app.post('/api/firewall/unblock', async (req: Request, res: Response) => {
    const { ip } = req.body;
    if (!ip) {
        res.status(400).json({ message: "IP address is required" });
        return;
    }
    
    try {
        // Both: event listener handles unblock + direct call as safety net for missing profile
        dosDetector.unblock(ip);
        await firewallService.unblock(ip); // Safety net: ensures firewall is updated
        res.sendStatus(200);
    } catch (err) {
        console.error(`[API] Failed to unblock ${ip}:`, err);
        res.status(500).json({ message: "Failed to unblock IP" });
    }
});

// 4b. Revoke All Blocks
app.post('/api/firewall/unblock-all', async (req: Request, res: Response) => {
    try {
        const blocked = firewallService.getBlockedIPs();
        let revoked = 0;
        for (const ip of blocked) {
            await firewallService.unblock(ip);
            dosDetector.unblock(ip);
            revoked++;
        }
        console.log(`[API] Revoked all ${revoked} firewall block rules`);
        res.json({ revoked });
    } catch (err) {
        console.error('[API] Failed to unblock all:', err);
        res.status(500).json({ message: "Failed to revoke all blocks" });
    }
});


// 5. Manual Block
app.post('/api/firewall/block', async (req: Request, res: Response) => {
    const { ip, reason } = req.body;
    if (!ip) {
        res.status(400).json({ message: "IP address is required" });
        return;
    }

    try {
        await firewallService.block(ip);
        // Force the internal state to recognize the block
        dosDetector.syncBlockedIPs([ip]); 
        res.sendStatus(200);
    } catch (err) {
        console.error(`[API] Failed to block ${ip}:`, err);
        res.status(500).json({ message: "Failed to block IP" });
    }
});

// 6. GET current live config (for Settings page)
app.get('/api/config', (_req: Request, res: Response) => {
    res.json(configService.getAll());
});

// 7. PATCH live config (from Settings page — hot-reload, no restart needed)
app.patch('/api/config', (req: Request, res: Response) => {
    try {
        const patch = req.body;

        if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
            res.status(400).json({ message: 'Request body must be a flat JSON object of threshold overrides.' });
            return;
        }

        // Validate all values are positive numbers
        for (const [key, val] of Object.entries(patch)) {
            if (typeof val !== 'number' || val <= 0) {
                res.status(400).json({ message: `Invalid value for "${key}": must be a positive number.` });
                return;
            }
        }

        // 1. Update the config service (source of truth)
        const updated = configService.update(patch);

        // 2. Hot-reload DoS detector if DoS params changed
        const dosKeys = ['WINDOW_MS', 'THRESHOLD'];
        const dosPatch: Record<string, number> = {};
        if (patch.WINDOW_MS  !== undefined) dosPatch.windowMs      = patch.WINDOW_MS;
        if (patch.THRESHOLD   !== undefined) dosPatch.baseThreshold = patch.THRESHOLD;
        if (Object.keys(dosPatch).length > 0) dosDetector.updateConfig(dosPatch);

        // DDoS detector reads cfg() on every call — no explicit reload needed.

        console.info('[API] Config patched via UI:', patch);
        res.json(updated);
    } catch (err) {
        console.error('[API] Failed to patch config:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// ==========================================

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

        // 2. Seed admin user
        await seedAdmin();

        // 3. Verify Administrator Privileges (Required for executing netsh commands)
        await checkAdminPrivilege();

        // 4. Synchronize Firewall State
        await firewallService.syncFromFirewall();

        // This synchronizes the internal detector state with the OS firewall state.
        dosDetector.syncBlockedIPs(firewallService.getBlockedIPs());

        // 5. Initialize the HTTP Listener
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