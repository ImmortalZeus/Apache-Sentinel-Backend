import { RateLimiterMemory } from 'rate-limiter-flexible';
import { ILog } from '../entities/Log.entity';

class SentinelEngine {
    private rateLimiter: RateLimiterMemory;

    constructor() {
        this.rateLimiter = new RateLimiterMemory({
            points: 150,           // Ngưỡng: 150 requests
            duration: 5,           // Khung thời gian: 5 giây
            blockDuration: 60,     // Theo dõi IP 60 giây
        });
    }

    public async analyze(log: ILog): Promise<void> {
        // Lấy IP từ forwardFor (nếu đi qua proxy), nếu không lấy remoteIp gốc
        const attackerIp = (log as any).forwardFor || log.remoteIp;

        if (!attackerIp || attackerIp === "-") return;

        try {
            await this.rateLimiter.consume(attackerIp);
        } catch (rateLimiterRes: any) {
            // Chỉ in alert 1 lần ngay khi chạm ngưỡng để tránh spam console
            if (rateLimiterRes.consumedPoints === 151) {
                console.log(`\n=================================================`);
                console.log(`[IDS ALERT] PHÁT HIỆN LƯU LƯỢNG BẤT THƯỜNG!`);
                console.log(`- Nguồn tấn công (IP) : ${attackerIp}`);
                console.log(`- Hành vi           : Vượt ngưỡng 150 requests / 5 giây`);
                console.log(`- Trạng thái        : Đã ghi nhận, chờ xử lý...`);
                console.log(`=================================================\n`);
            }
        }
    }
}

export const sentinelEngine = new SentinelEngine();