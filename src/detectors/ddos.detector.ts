import rawConfig from '../config.json';
import { firewallService } from '../services/firewall.service';
import { ILog } from '../entities/Log.entity';

// Load environment-specific config
const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';
const ddosConfig     = { 
    ...rawConfig.ddos,                      // shared values
    ...(rawConfig.ddos as any)[env]         // environment-specific values
}

class DDoSDetector {
    // Strategy 1: Global Volumetric Tracker
    private globalTimestamps: number[] = [];

    // Strategy 2: Coordinated Pattern Map<normalizedUrl, { timestamps, errorTimestamps, ipLastSeen }>
    // UPDATED: Now tracks errorCount to differentiate Flash Crowds from true botnets
    private urlPatterns = new Map<string, { timestamps: number[], errorTimestamps: number[], ipLastSeen: Map<string, number> }>();
    
    // Strategy 3: Proactive Subnet Volume Tracking Map<subnetCidr, timestamps[]>
    private subnetVolumeTracker = new Map<string, number[]>();

    constructor() {
        // Run garbage collection every 5 seconds to prevent memory leaks
        setInterval(() => this.cleanup(), 5000);
    }

    /**
     * Main entry point called for every log line
     */
    public check(log: ILog): void {
        const now = Date.now();
        this.checkGlobalRate(now);
        
        if (log.requestUrl && log.remoteIp) {
            this.checkCoordinatedPattern(log.requestUrl, log.remoteIp, log.responseStatusCode, now);
            this.checkSubnetVolume(log.remoteIp, now);
        }
    }

    private checkGlobalRate(now: number): void {
        /*
        * Strategy 1: Global Volumetric Tracker
            * - Maintains a sliding window of recent request timestamps.
            * - If total requests in the window exceed a threshold, triggers a global alert.
        */
        this.globalTimestamps.push(now);
        if (this.globalTimestamps.length > ddosConfig.GLOBAL_RATE_THRESHOLD) {
            console.warn(`[!] DDoS ALERT: Global Volumetric Flood detected: >${ddosConfig.GLOBAL_RATE_THRESHOLD} reqs / ${ddosConfig.GLOBAL_RATE_WINDOW_MS}ms.`);
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

        if (data.ipLastSeen.size > ddosConfig.COORDINATED_DISTINCT_IP_THRESHOLD) {
            const totalRequests = data.timestamps.length;
            const errorRatio = data.errorTimestamps.length / totalRequests; // Calculate from array length
            const errorRatioThreshold = ddosConfig.COORDINATED_ERROR_RATIO_THRESHOLD ?? 0.8;

            if (errorRatio >= errorRatioThreshold) {
                console.warn(`[!] DDoS ALERT: Coordinated attack on ${url}. IPs: ${data.ipLastSeen.size}. Error Rate: ${(errorRatio * 100).toFixed(1)}%`);
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

        if (timestamps.length > ddosConfig.SUBNET_RATE_THRESHOLD) {
            console.warn(`[!] DDoS ALERT: Subnet Volumetric Attack detected from ${subnet}. Initiating temporary block.`);
            
            // Trigger Layer 3 block with TTL
            firewallService.blockSubnet(subnet)
                .catch(err => console.error(err));

            // Remove from tracking to avoid duplicate block commands
            this.subnetVolumeTracker.delete(subnet);
        }
    }

    // --- Mitigation & Utility Methods ---

    private cleanup(): void {
        const cutoff = Date.now() - ddosConfig.GLOBAL_RATE_WINDOW_MS;

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
        return `${octets[0]}.${octets[1]}.${octets[2]}.0/${ddosConfig.SUBNET_PREFIX_LENGTH}`;
    }
}

export const ddosDetector = new DDoSDetector();