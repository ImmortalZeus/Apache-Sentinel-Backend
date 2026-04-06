import config from 'config.json';
import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import nocache from 'nocache';
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

// Start server
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});