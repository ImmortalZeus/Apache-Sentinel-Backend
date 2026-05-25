import "./env";
import config from 'config.json';
import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import nocache from 'nocache';
import { logService } from 'services/log.service';
import { lineParser } from 'utils/logParsers/lineParser';
import { dosDetector } from "detectors/dos.detector";
import { checkAdminPrivilege } from "utils/checkAdminPrivilege";
import { firewallService } from "services/firewall.service";
import { dbService } from "services/db.service";
import { notificationService } from "services/notification.service";
import logRoutes from './routes/log.routes';
import blockedIpRoutes from './routes/blocked.ip.routes';

export const app = express();
const port: number = config.PORT;

// Middleware toàn cục (global)
app.use(express.text());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const upload = multer();
app.use(upload.none());

app.use(nocache());

app.use(express.static('public'));
app.set('etag', false);
app.disable('view cache');

// Route GET
app.get('/', (req: Request, res: Response) => {
    res.send('Hello World!');
});

// Route POST
app.post('/log', async (req: Request, res: Response) => {
    const line: string = req.body ? req.body as string : "";
    console.log("Log received:", line);
    const lineData = lineParser.run(line);
    // console.log(dosDetector.check(lineData.remoteIp));
    if (dosDetector.check(lineData.remoteIp)) {
        const alreadyBlocked = firewallService.isBlocked(lineData.remoteIp);
        await firewallService.block(lineData.remoteIp)
        if (!alreadyBlocked) {
            notificationService.notify(lineData.remoteIp)  // không cần await
        }
    }
    // TODO: parse, ghi DB, phân tích rule/ML
    res.sendStatus(200);
});

// API Routes
app.use('/api/logs', logRoutes);
app.use('/api/blocked-ips', blockedIpRoutes);

// Middleware 404
app.use((req: Request, res: Response, next: NextFunction) => {
    const error = new Error('Not Found') as Error & { status?: number };
    error.status = 404;
    next(error);
});

// Error handling middleware
app.use((error: Error & { status?: number }, req: Request, res: Response, next: NextFunction) => {
    res.status(error.status || 500);
    res.send({ message: error.message });
});

export async function startServer() {
    try {
        // 1. Connect to Database first
        await dbService.connect();

        await checkAdminPrivilege();
        await firewallService.syncFromFirewall()          // sync firewall state
        dosDetector.syncBlockedIPs(firewallService.getBlockedIPs())  // sync sang detector
        setInterval(() => {
            firewallService.syncFromFirewall().catch(() => {}).finally(() => {
                dosDetector.syncBlockedIPs(firewallService.getBlockedIPs());
            });
        }, 5_000);

        // 2. Start server only after DB connection is successful
        app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`);
        });
    } catch (error) {
        console.error(
            "Failed to start server due to a database error:",
            error,
        );
        process.exit(1);
    }
}

// Only auto-start when not in test mode
if (process.env.NODE_ENV !== 'test') {
    startServer();
}

let shuttingDown = false;

const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`Received ${signal}`);
    try {
        await logService.flush();
        await dbService.disconnect();
    } catch (err) {
        console.error('Error during shutdown:', err);
    } finally {
        process.exit(0);
    }
};

['SIGINT', 'SIGTERM'].forEach(sig => {
    process.on(sig, shutdown);
});