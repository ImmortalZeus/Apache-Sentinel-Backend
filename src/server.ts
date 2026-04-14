import config from 'config.json';
import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import nocache from 'nocache';
import { logService } from 'services/Log.service';
import { connectDB } from 'utils/db.service';
import { lineParser } from 'utils/logParsers/lineParser';

const app = express();
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
app.post('/log', (req: Request, res: Response) => {
    const line: string = req.body ? req.body as string : "";
    console.log("Log received:", line);
    console.log(lineParser.run(line));
    // TODO: parse, ghi DB, phân tích rule/ML
    res.sendStatus(200);
});


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

async function startServer() {
    try {
        // 1. Connect to Database first
        await connectDB();

        // 2. Start server only after DB connection is successful
        app.listen(port, () => {
            app.listen(port, () => {
                console.log(`Server is running on http://localhost:${port}`);
            });
        });
    } catch (error) {
        console.error(
            "Failed to start server due to a database error:",
            error,
        );
        process.exit(1);
    }
}

startServer();

let shuttingDown = false;

const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`Received ${signal}`);
    try {
        await logService.flush();
    } catch (err) {
        console.error('Error during shutdown:', err);
    } finally {
        process.exit(0);
    }
};

['SIGINT', 'SIGTERM'].forEach(sig => {
    process.on(sig, shutdown);
});