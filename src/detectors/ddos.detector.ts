import { EventEmitter } from 'events'; 
import { notificationService } from '../services/notification.service';
import { configService } from '../services/config.service';
import { ILog } from '../entities/Log.entity';

// All thresholds are read from configService.ddos at call-time so that
// PATCH /api/config is reflected immediately without a server restart.
const cfg = () => configService.ddos;

class DDoSDetector extends EventEmitter{
    // Strategy 1: Global Volumetric Tracker
    private globalTimestamps: number[] = [];

    // Strategy 2: Coordinated Pattern Map<normalizedUrl, { timestamps, errorTimestamps, ipLastSeen }>
    // UPDATED: Now tracks errorCount to differentiate Flash Crowds from true botnets
    private urlPatterns = new Map<string, { timestamps: number[], errorTimestamps: number[], ipLastSeen: Map<string, number> }>();

    // Strategy 3: Proactive Subnet Volume Tracking Map<subnetCidr, timestamps[]>
    private subnetVolumeTracker = new Map<string, number[]>();

    // ─── Panic Mode (Stage 1 Mitigation) ───
    private panicModeActive = false;
    private panicModeStartTime = 0;
    // Panic mode timings are read from cfg() at runtime — not cached as readonly.

    constructor() {
        super(); 

        // Run garbage collection every 5 seconds to prevent memory leaks
        setInterval(() => this.cleanup(), 5000);

        // Check Panic Mode expiration every 10 seconds
        setInterval(() => this.checkPanicModeStatus(), 10000);
    }
    /**
     * Main entry point called for every log line.
     * Uses the actual Apache log timestamp to prevent replay false-positives.
     */
    public check(log: ILog): void {
        // Extract the actual log time — falling back to current time only if missing
        const now = log.time ? new Date(log.time).getTime() : Date.now();
        this.checkGlobalRate(now);

        if (log.requestUrl && log.remoteIp) {
            this.checkCoordinatedPattern(log.requestUrl, log.remoteIp, log.responseStatusCode, now);
            this.checkSubnetVolume(log.remoteIp, now);
        }
    }

    // ─── Global State Access ───
    public isUnderAttack(): boolean {
        return this.panicModeActive;
    }

    private triggerPanicMode(now: number): void {
        if (this.panicModeActive) return;

        // Prevent rapid re-triggering (Cooldown)
        if (now - this.panicModeStartTime < cfg().PANIC_MODE_DURATION_MS + cfg().PANIC_MODE_COOLDOWN_MS) {
            return;
        }

        this.panicModeActive = true;
        this.panicModeStartTime = now;

        console.warn(`[!!!] SYSTEM ENTERING PANIC MODE [!!!]`);
        console.warn(`All systems hyper-aggressive for the next ${cfg().PANIC_MODE_DURATION_MS / 60000} minutes.`);
    }

    private checkPanicModeStatus(): void {
        if (!this.panicModeActive) return;

        if (Date.now() - this.panicModeStartTime > cfg().PANIC_MODE_DURATION_MS) {
            this.panicModeActive = false;
            console.info(`[v] Panic Mode Deactivated. Traffic has normalized.`);
            notificationService.notifyDDoS("System Normal", "Panic Mode Deactivated. Traffic has normalized.");
        }
    }

    private checkGlobalRate(now: number): void {
        /*
        * Strategy 1: Global Volumetric Tracker
            * - Maintains a sliding window of recent request timestamps.
            * - If total requests in the window exceed a threshold, triggers a global alert.
        */
        this.globalTimestamps.push(now);
        
        // Remove timestamps outside the sliding window 
        const cutoff = now - cfg().GLOBAL_RATE_WINDOW_MS
        this.globalTimestamps = this.globalTimestamps.filter(t => t > cutoff)

        if (this.globalTimestamps.length > cfg().GLOBAL_RATE_THRESHOLD) {
            const msg = `[!] DDoS ALERT: Global Volumetric Flood detected: >${cfg().GLOBAL_RATE_THRESHOLD} reqs / ${cfg().GLOBAL_RATE_WINDOW_MS}ms.`;
            console.warn(msg);
            notificationService.notifyDDoS("Volumetric Flood", msg);

            // Trigger Panic Mode
            this.triggerPanicMode(now);

            // Flush to prevent console spam
            this.globalTimestamps = [];
        }
    }

    private checkCoordinatedPattern(rawUrl: string, ip: string, statusCode: number | undefined, now: number): void {
        /*
        * Strategy 2: Coordinated Pattern Map
            * - Tracks request patterns per normalized URL.
            * - If a URL receives requests from many distinct IPs with a high error ratio, flags as potential botnet attack.
             * - Differentiates from Flash Crowds by analyzing error rates (e.g., 80%+ errors likely indicate bots).
        */
        const url = this.normalizeUrl(rawUrl);

        if (!this.urlPatterns.has(url)) {
            this.urlPatterns.set(url, { timestamps: [], errorTimestamps: [], ipLastSeen: new Map<string, number>() });
        }

        const data = this.urlPatterns.get(url)!;
        data.timestamps.push(now);
        data.ipLastSeen.set(ip, now);

        if (statusCode !== undefined && statusCode >= 400) {
            data.errorTimestamps.push(now); // Push timestamp instead of adding 1
        }

        if (data.ipLastSeen.size > cfg().COORDINATED_DISTINCT_IP_THRESHOLD) {
            const totalRequests = data.timestamps.length;
            const errorRatio = data.errorTimestamps.length / totalRequests;
            const errorRatioThreshold = cfg().COORDINATED_ERROR_RATIO_THRESHOLD ?? 0.8;

            if (errorRatio >= errorRatioThreshold) {
                const msg = `[!] DDoS ALERT: Coordinated attack on ${url}. IPs: ${data.ipLastSeen.size}. Error Rate: ${(errorRatio * 100).toFixed(1)}%`;
                console.warn(msg);
                notificationService.notifyDDoS("Coordinated Botnet", msg);

                // [EVENT EMIT] Broadcast the IPs to block instead of calling firewall directly
                for (const attackerIp of data.ipLastSeen.keys()) {
                    this.emit('ddos-block-ip', attackerIp);
                }
            } else {
                console.info(`[v] Flash Crowd: High traffic on ${url}, but error rate is normal (${(errorRatio * 100).toFixed(1)}%). Allowed.`);
            }

            data.ipLastSeen.clear();
            data.timestamps = [];
            data.errorTimestamps = []; // Reset array
        }
    }

    private checkSubnetVolume(ip: string, now: number): void {
        
        /*
        * Strategy 3: Proactive Subnet Volume Tracking
            * - Extracts subnet from incoming IP (e.g., /24).
            * - Tracks request volume per subnet in a sliding window.
            * - If a subnet exceeds a request threshold, triggers a temporary block via firewall service with TTL.
        */
        
        const subnet = this.extractSubnet(ip);
        if (!subnet) return; // Ignore IPv6

        if (!this.subnetVolumeTracker.has(subnet)) {
            this.subnetVolumeTracker.set(subnet, []);
        }

        const timestamps = this.subnetVolumeTracker.get(subnet)!;
        timestamps.push(now);

        // Remove timestamps outside the sliding window
        const cutoff = now - cfg().GLOBAL_RATE_WINDOW_MS
        const recent = timestamps.filter(t => t > cutoff)
        this.subnetVolumeTracker.set(subnet, recent)

        if (timestamps.length > cfg().SUBNET_RATE_THRESHOLD) {
            const msg = `[!] DDoS ALERT: Subnet Volumetric Attack detected from ${subnet}.`;
            console.warn(msg);
            notificationService.notifyDDoS("Subnet Attack", msg);

            // [EVENT EMIT] Broadcast the subnet to block
            this.emit('ddos-block-subnet', subnet);

            // Remove from tracking to avoid duplicate block commands
            this.subnetVolumeTracker.delete(subnet);
        }
    }

    // --- Mitigation & Utility Methods ---

    private cleanup(): void {
        const cutoff = Date.now() - cfg().GLOBAL_RATE_WINDOW_MS;

        // 1. Clean Global Tracker
        this.globalTimestamps = this.globalTimestamps.filter(t => t > cutoff);

        // 2. Clean URL Patterns Tracker
        for (const [url, data] of this.urlPatterns.entries()) {
            data.timestamps = data.timestamps.filter(t => t > cutoff);
            data.errorTimestamps = data.errorTimestamps.filter(t => t > cutoff); // Clean old errors

            for (const [ip, lastSeen] of data.ipLastSeen.entries()) {
                if (lastSeen <= cutoff) data.ipLastSeen.delete(ip);
            }

            if (data.timestamps.length === 0) {
                this.urlPatterns.delete(url);
            }
        }
        
        // 3. Clean Subnet Volume Tracker
        for (const [subnet, timestamps] of this.subnetVolumeTracker.entries()) {
            const activeTimestamps = timestamps.filter(t => t > cutoff);
            if (activeTimestamps.length === 0) {
                this.subnetVolumeTracker.delete(subnet);
            } else {
                this.subnetVolumeTracker.set(subnet, activeTimestamps);
            }
        }
    }

    private normalizeUrl(rawUrl: string): string {
        try {
            const url = new URL(rawUrl, 'http://dummy.local');
            return url.pathname; // Strips ?query and #hash
        } catch {
            return rawUrl.split('?')[0].split('#')[0];
        }
    }

    private isIPv4(ip: string): boolean {
        return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(ip);
    }

    private extractSubnet(ip: string): string | null {
        if (!this.isIPv4(ip)) return null;
        const octets = ip.split('.');
        return `${octets[0]}.${octets[1]}.${octets[2]}.0/${cfg().SUBNET_PREFIX_LENGTH}`;
    }

    // --- Unblock Methods ---

    public unblockIp(ip: string): void {
        console.info(`[DDoS] Unblocking IP: ${ip}`);
        this.emit('ddos-unblock-ip', ip);
    }

    public unblockSubnet(subnet: string): void {
        console.info(`[DDoS] Unblocking subnet: ${subnet}`);
        this.emit('ddos-unblock-subnet', subnet);
    }

    public reset(): void {
        this.globalTimestamps = []
        this.urlPatterns.clear()
        this.subnetVolumeTracker.clear()
        this.panicModeActive = false
        this.panicModeStartTime = 0
        console.info('[DDoS] Detector state reset')
    }
}

export const ddosDetector = new DDoSDetector();