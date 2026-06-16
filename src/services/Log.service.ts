import rawConfig from 'config.json';
import { CreateLogDtoType } from "dtos/log.dto"
import { Log } from "entities/Log.entity";
import { getErrorMessage } from "utils/error/error";

// Load environment-specific config
const dbConfig = rawConfig.database

class LogService {
    private readonly queue: CreateLogDtoType[] = [];
    private _isFlushing = false;

    // --- BỘ ĐẾM SLIDING WINDOW ---
    private currentTickCount = 0;
    private trafficHistory: { time: string; requests: number }[] = [];

    constructor() {
        // Khởi tạo mảng trống với 12 phần tử (tương đương 60 giây)
        for (let i = 0; i < 12; i++) {
            this.trafficHistory.push({ time: '--:--', requests: 0 });
        }
        
        // Chạy bộ đếm nhịp mỗi 5 giây
        setInterval(() => this.tick(), 5000);
    }

    private tick() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

        // Đẩy nhịp hiện tại vào mảng và xóa nhịp cũ nhất
        this.trafficHistory.push({ time: timeStr, requests: this.currentTickCount });
        if (this.trafficHistory.length > 12) {
            this.trafficHistory.shift(); 
        }

        // Reset bộ đếm cho 5 giây tiếp theo
        this.currentTickCount = 0;
    }

    getTrafficHistory() {
        return this.trafficHistory;
    }
    // ----------------------------

    private get DB_BATCH_SIZE() {
        return dbConfig.DB_BATCH_SIZE;
    }

    private get isFlushing() {
        return this._isFlushing;
    }

    private set isFlushing(value: boolean) {
        this._isFlushing = value;
    }

    add(data: CreateLogDtoType) {
        this.queue.push(data);
        this.currentTickCount++; // CỘNG DỒN REQUEST MỖI KHI CÓ LOG MỚI
    }

    async flush() {
        if (this.isFlushing) return
        if (this.queue.length === 0) return

        this.isFlushing = true

        const queue_copy = this.queue.splice(0)

        while(queue_copy.length > 0)
        {
            const batch = queue_copy.splice(0, Math.min(this.DB_BATCH_SIZE, queue_copy.length))
            try {
                await Log.insertMany(batch)
            } catch (err: any) {
                console.error('Flush failed, re-queuing:', getErrorMessage(err))
                this.queue.unshift(...batch)
            }
        }
        this.isFlushing = false
    }

    async getTotalCount(): Promise<number> {
        const dbCount = await Log.countDocuments();
        return dbCount + this.queue.length; 
    }
    
    async getRecentLogs(limit: number = 100) {
        // Mongoose will fetch the most recent logs based on the 'time' field, combining both the database and in-memory queue.
        return await Log.find().sort({ time: -1 }).limit(limit);
    }

    async getLogs({ page, limit }: { page: number; limit: number }) {
        const pageNum = Math.max(1, page);
        const limitNum = Math.min(1000, Math.max(10, limit));
        const skip = (pageNum - 1) * limitNum;

        const [logs, total] = await Promise.all([
            Log.find().sort({ time: -1 }).skip(skip).limit(limitNum),
            Log.countDocuments()
        ]);

        return {
            data: logs,
            pagination: {
                page: pageNum,
                limit: limitNum,
                total,
                totalPages: Math.ceil(total / limitNum)
            }
        };
    }

}

export const logService = new LogService()

// Flush mỗi 5 giây
export async function startFlushLoop() {
    while (true) {
        await logService.flush()           // chờ flush xong
        await new Promise(res => setTimeout(res, dbConfig.DB_FLUSH_INTERVAL))  // rồi mới delay
    }
}