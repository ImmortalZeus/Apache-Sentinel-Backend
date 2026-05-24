import { exec } from 'child_process'
import { promisify } from 'util'
const execAsync = promisify(exec)

const RULE_NAME = 'DoS-Block-List'
 
export class FirewallService {
    private readonly blockedIPs = new Set<string>()
    
    async syncFromFirewall(): Promise<void> {
        try {
            const { stdout } = await execAsync(
                `netsh advfirewall firewall show rule name="${RULE_NAME}"`,
                { windowsHide: true }
            )

            const match = stdout.match(/RemoteIP:\s+(.+)/)
            if (!match) return  // rule tồn tại nhưng không có IP

            this.blockedIPs.clear();
            const ips = match[1].split(',').map(ip => ip.trim())
            for (const ip of ips) {
                this.blockedIPs.add(ip)
            }
            console.info(`[Firewall] Synced ${ips.length} blocked IPs from firewall`)

        } catch (err: unknown) {
            // Rule chưa tồn tại → bình thường, không phải lỗi
            const output = (err as NodeJS.ErrnoException & { stdout?: string }).stdout ?? ''
            if (output.includes('No rules match')) {
                this.blockedIPs.clear()
                console.info('[Firewall] No existing block rule found, starting fresh')
                return
            }
            // Lỗi thật sự → rethrow
            throw err
        }
    }
    
    /**
     * Block IP — update 1 rule duy nhất chứa toàn bộ danh sách IP.
     * Chặn tất cả protocol (TCP, UDP, ICMP, ...).
     */
    async block(ip: string): Promise<void> {
        if (this.blockedIPs.has(ip)) {
            console.info(`[Firewall] ${ip} đã bị block trước đó, bỏ qua`)
            return
        }
    
        this.blockedIPs.add(ip)
    
        try {
            await this.syncRule()
            console.warn(`[Firewall] Đã block IP: ${ip}`)
        } catch (err) {
            // Rollback nếu sync thất bại
            this.blockedIPs.delete(ip)
            const message = err instanceof Error ? err.message : String(err)
            console.error(`[Firewall] Không thể block ${ip}:`, message)
            throw err
        }
    }
    
    /**
     * Unblock IP - xóa khỏi danh sách và update rule.
     */
    async unblock(ip: string): Promise<void> {
        if (!this.blockedIPs.has(ip)) {
            console.info(`[Firewall] ${ip} không có trong danh sách block`)
            return
        }
    
        this.blockedIPs.delete(ip)
    
        try {
            await this.syncRule()
            console.info(`[Firewall] Đã unblock IP: ${ip}`)
        } catch (err) {
            // Rollback
            this.blockedIPs.add(ip)
            const message = err instanceof Error ? err.message : String(err)
            console.error(`[Firewall] Không thể unblock ${ip}:`, message)
            throw err
        }
    }
    
    isBlocked(ip: string): boolean {
        return this.blockedIPs.has(ip)
    }
    
    getBlockedIPs(): string[] {
        return [...this.blockedIPs]
    }
    
    /**
     * Sync firewall rule với danh sách IP hiện tại.
     * - Nếu danh sách rỗng → xóa rule
     * - Nếu rule chưa tồn tại → tạo mới
     * - Nếu rule đã tồn tại → update remoteip
     */
    private async syncRule(): Promise<void> {
        if (this.blockedIPs.size === 0) {
            await this.deleteRule()
            return
        }
    
        const ipList = [...this.blockedIPs].join(',')
        const ruleExists = await this.ruleExists()
    
        if (ruleExists) {
            // Update rule hiện có
            await execAsync(
                `netsh advfirewall firewall set rule name="${RULE_NAME}" new remoteip=${ipList}`,
                { windowsHide: true }
            )
        } else {
            // Tạo rule mới — protocol=any để chặn TCP, UDP, ICMP, ...
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
            // Rule không tồn tại thì không sao
        }
    }
}

export const firewallService    = new FirewallService()