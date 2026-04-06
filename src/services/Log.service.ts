import config from 'config.json';
import { CreateLogDtoType } from "dto/Log.dto"
import { Log } from "entities/Log.entity";
import { getErrorMessage } from "utils/error/error";

class LogService {
    private readonly queue: CreateLogDtoType[] = []

    private get DB_BATCH_SIZE() {
        return config.DB_BATCH_SIZE;
    }

    private _isFlushing = false

    private get isFlushing() {
        return this._isFlushing
    }

    private set isFlushing(value: boolean) {
        // optional: thêm logging, validation, bảo vệ
        this._isFlushing = value
    }

    add(data: CreateLogDtoType) {
        this.queue.push(data)
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
}

export const logService = new LogService()

// Flush mỗi 5 giây
async function startFlushLoop() {
    while (true) {
        await logService.flush()           // chờ flush xong
        await new Promise(res => setTimeout(res, config.DB_FLUSH_INTERVAL))  // rồi mới delay
    }
}

void startFlushLoop()