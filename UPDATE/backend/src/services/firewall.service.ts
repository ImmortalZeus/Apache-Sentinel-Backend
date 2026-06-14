import { exec } from 'child_process'
import { promisify } from 'util'
import { Mutex } from '../utils/mutex' 
import rawConfig from '../config.json';

const execAsync = promisify(exec)
const RULE_NAME = 'Apache-Sentinel-Block-List'

const env = process.env.NODE_ENV === 'production' ? 'production' : 'development'
const config = {
    ...(rawConfig as any).ddos,
    ...(rawConfig as any).ddos[env]
}

export class FirewallService {
    private readonly blockedIPs = new Set<string>()

    private readonly syncMutex = new Mutex(); // Prevent Race Conditions
    // Tracks offenses for Exponential Backoff: Map<CIDR, { count, lastBlocked }>
    private offenseHistory = new Map<string, { count: number, lastBlocked: number }>();
    
    constructor() {
        //Prevent memory leak by purging offense history older than 48 hours.
        // Runs once every hour (3600000 ms).
        setInterval(() => this.cleanupOffenseHistory(), 3600000);
    }

    private cleanupOffenseHistory(): void {
        const now = Date.now();
        for (const [cidr, history] of this.offenseHistory.entries()) {
            // 172,800,000 ms = 48 hours
            if (now - history.lastBlocked > 172800000) {
                this.offenseHistory.delete(cidr);
            }
        }
    }

    async syncFromFirewall(): Promise<void> {
        try {
            const { stdout } = await execAsync(
                `netsh advfirewall firewall show rule name="${RULE_NAME}"`,
                { windowsHide: true }
            )

            const match = stdout.match(/RemoteIP:\s+(.+)/)
            if (!match) return  // rule exists but no IPs

            const ips = match[1].split(',').map(ip => ip.trim())
            for (const ip of ips) {
                this.blockedIPs.add(ip)
            }
            console.info(`[*] Firewall: Synced ${ips.length} blocked IPs from firewall`)

        } catch (err: unknown) {
            const output = (err as NodeJS.ErrnoException & { stdout?: string }).stdout ?? ''
            if (output.includes('No rules match')) {
                console.info('[*] Firewall: No existing block rule found, starting fresh')
                return
            }
            throw err
        }
    }
    
    public async block(ip: string): Promise<void> {
        if (this.blockedIPs.has(ip)) return;
        this.blockedIPs.add(ip);
    
        try {
            await this.syncRuleSafe(); // Call the thread-safe version
            console.warn(`[+] Firewall: Blocked IP: ${ip}`);
        } catch (err) {
            this.blockedIPs.delete(ip);
            throw err;
        }
    }
    
    public async unblock(ip: string): Promise<void> {
        if (!this.blockedIPs.has(ip)) return;
        this.blockedIPs.delete(ip);
    
        try {
            await this.syncRuleSafe();
            console.info(`[-] Firewall: Unblocked IP: ${ip}`);
        } catch (err) {
            this.blockedIPs.add(ip);
            throw err;
        }
    }

    /**
     * Mutex-wrapped sync operation to prevent race conditions when multiple
     * blocks are triggered simultaneously.
     */
    private async syncRuleSafe(): Promise<void> {
        const unlock = await this.syncMutex.lock();
        try {
            await this.syncRule();
        } finally {
            unlock();
        }
    }
    
    isBlocked(ip: string): boolean {
        return this.blockedIPs.has(ip)
    }
    
    getBlockedIPs(): string[] {
        return [...this.blockedIPs]
    }
    
    
    private async syncRule(): Promise<void> {
        if (this.blockedIPs.size === 0) {
            await this.deleteRule()
            return
        }
    
        const ipList = [...this.blockedIPs].join(',')
        const ruleExists = await this.ruleExists()
    
        if (ruleExists) {
            await execAsync(
                `netsh advfirewall firewall set rule name="${RULE_NAME}" new remoteip=${ipList}`,
                { windowsHide: true }
            )
        } else {
            await execAsync(
                `netsh advfirewall firewall add rule name="${RULE_NAME}" dir=in action=block protocol=any remoteip=${ipList}`,
                { windowsHide: true }
            )
        }
    }
    
    private async ruleExists(): Promise<boolean> {
        try {
            const { stdout } = await execAsync(
                `netsh advfirewall firewall show rule name="${RULE_NAME}"`,
                { windowsHide: true }
            )
            return stdout.includes(RULE_NAME)
        } catch {
            return false
        }
    }
    
    private async deleteRule(): Promise<void> {
        try {
            await execAsync(
                `netsh advfirewall firewall delete rule name="${RULE_NAME}"`,
                { windowsHide: true }
            )
        } catch {
            // Do nothing if rule doesn't exist
        }
    }

    // ==========================================
    // Subnet Mitigation Logic
    // ==========================================

    /**
     * Blocks an entire subnet temporarily.
     * Leverages the existing syncRule() state machine.
     */
    public async blockSubnet(cidr: string): Promise<void> {
        if (this.blockedIPs.has(cidr)) return;

        // 1. Calculate Exponential Backoff
        const now = Date.now();
        const history = this.offenseHistory.get(cidr) || { count: 0, lastBlocked: 0 };
        
        // Reset offense count if it has been more than 48 hours since the last block
        if (now - history.lastBlocked > 172800000) {
            history.count = 0;
        }
        
        history.count += 1;
        history.lastBlocked = now;
        this.offenseHistory.set(cidr, history);

        // Calculate TTL: 15 mins -> 1 hour -> 4 hours -> 16 hours
        // Base is 15 mins (900,000 ms), multiplier is 4.
        //const baseTtl = 900000;
        const baseTtl = config.SUBNET_BLOCK_BASE_TTL_MS;
        const multiplier = Math.pow(4, history.count - 1);
        const ttlMs = Math.min(baseTtl * multiplier, 86400000); // Cap at 24 hours
        
        // 2. Apply Block
        this.blockedIPs.add(cidr);

        try {
            await this.syncRuleSafe();
            console.warn(`[+] Firewall: Blocked subnet ${cidr} (Offense #${history.count}) for ${ttlMs / 60000} minutes.`);

            // 3. Schedule Auto-Unblock
            setTimeout(() => {
                this.unblockSubnet(cidr).catch(err => console.error(err));
            }, ttlMs);

        } catch (err) {
            this.blockedIPs.delete(cidr);
            console.error(`[!] Firewall Error: Failed to block CIDR ${cidr}:`, err);
        }
    }

    private async unblockSubnet(cidr: string): Promise<void> {
        if (!this.blockedIPs.has(cidr)) return;
        this.blockedIPs.delete(cidr);

        try {
            await this.syncRuleSafe();
            console.info(`[-] Firewall: Auto-unblocked subnet ${cidr} (TTL expired).`);
        } catch (err) {
            this.blockedIPs.add(cidr);
            console.error(`[!] Firewall Error: Failed to auto-unblock subnet ${cidr}:`, err);
        }
    }
    public async reset(): Promise<void> {
        this.blockedIPs.clear();
        this.offenseHistory.clear();
        await this.syncRuleSafe();
    }
}

export const firewallService = new FirewallService();