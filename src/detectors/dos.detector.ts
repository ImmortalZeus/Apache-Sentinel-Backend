import os from 'os'

// ─── Config ────────────────────────────────────────────────────────────────

export interface DoSConfig {
    // Window size (ms) — dùng 3 consecutive windows
    // window0: [now-1x → now]
    // window1: [now-2x → now-1x]
    // window2: [now-3x → now-2x]
    windowMs: number              // default: 10_000 (10 giây)

    // Weights cho anomaly score (tổng = 1.0)
    window0Weight: number         // 0.5 — gần nhất, weight cao nhất
    window1Weight: number         // 0.3
    window2Weight: number         // 0.2

    // Base threshold (req/window)
    baseThreshold: number         // 100

    // Anomaly score để penalize trust (0.0 → 1.0)
    anomalyScoreToPenalize: number  // 0.7

    // Trust score
    initialTrustScore: number       // 50
    trustPenaltyOnAnomaly: number   // 15
    trustRewardOnNormal: number     // 1 (mỗi tick 5s)
    blockTrustThreshold: number     // 20

    // Trust tiers — quyết định mức độ ảnh hưởng của CPU lên threshold
    trustedTrustScore: number       // 70 — không bị ảnh hưởng bởi CPU
    neutralTrustScore: number       // 40 — bị ảnh hưởng nhẹ
    // < neutralTrustScore → suspicious, bị siết theo CPU

    // Khi CPU cao, neutral IP bị giảm threshold xuống bao nhiêu %
    neutralCPUFactor: number        // 0.7

    // Grace period cho IP mới — không bị ảnh hưởng bởi CPU
    gracePeriodMs: number           // 60_000 (1 phút)

    // CPU threshold để kích hoạt throttling
    cpuHighThreshold: number        // 0.80
    cpuCriticalThreshold: number    // 0.90

    // Cleanup
    inactiveTimeoutMs: number       // 30 phút
}

export const DEFAULT_CONFIG: DoSConfig = {
    windowMs: 10_000,

    window0Weight: 0.5,
    window1Weight: 0.3,
    window2Weight: 0.2,

    baseThreshold: 100,

    anomalyScoreToPenalize: 0.7,

    initialTrustScore:     50,
    trustPenaltyOnAnomaly: 15,
    trustRewardOnNormal:   1,
    blockTrustThreshold:   20,

    trustedTrustScore: 70,
    neutralTrustScore: 40,
    neutralCPUFactor:  0.7,

    gracePeriodMs: 60_000,

    cpuHighThreshold:     0.80,
    cpuCriticalThreshold: 0.90,

    inactiveTimeoutMs: 30 * 60_000,
}

// ─── IP Profile ────────────────────────────────────────────────────────────

export interface IPProfile {
    timestamps: number[]
    perIpThreshold: number
    trustScore: number
    isBlocked: boolean
    firstSeen: number
    lastSeen: number
}

// ─── CPU Utility ───────────────────────────────────────────────────────────

let _lastCPUInfo = os.cpus()

function measureCPUUsage(): number {
    const current = os.cpus()
    let totalDelta = 0
    let idleDelta = 0

    for (let i = 0; i < current.length; i++) {
        const prevTotal = Object.values(_lastCPUInfo[i].times).reduce((a, b) => a + b, 0)
        const currTotal = Object.values(current[i].times).reduce((a, b) => a + b, 0)
        totalDelta += currTotal - prevTotal
        idleDelta  += current[i].times.idle - _lastCPUInfo[i].times.idle
    }

    _lastCPUInfo = current
    return totalDelta === 0 ? 0 : 1 - idleDelta / totalDelta  // 0.0 → 1.0
}

// ─── DoS Detector ──────────────────────────────────────────────────────────

export class DoSDetector {
    private readonly profiles = new Map<string, IPProfile>()
    private readonly config: DoSConfig

    // Global threshold — chỉ apply cho IP suspicious, không phải tất cả
    private globalBaseThreshold: number

    // Cache CPU usage để dùng trong calcEffectiveThreshold
    private currentCPUUsage: number = 0

    constructor(config: Partial<DoSConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config }
        this.globalBaseThreshold = this.config.baseThreshold

        setInterval(() => this.adjustGlobalThreshold(), 10_000)
        setInterval(() => this.tick(), 5_000)
    }

    // ── Public API ────────────────────────────────────────────────────────────

    syncBlockedIPs(ips: string[]): void {
        for (const ip of ips) {
            const now = Date.now()
            const profile = this.getOrCreateProfile(ip, now)
            profile.isBlocked = true
            profile.trustScore = 0  // đã bị block → trust = 0
        }
        console.info(`[DoS] Synced ${ips.length} blocked IPs from firewall`)
    }

    check(ip: string): boolean {
        const now = Date.now()
        const profile = this.getOrCreateProfile(ip, now)

        if (profile.isBlocked) return true

        profile.timestamps.push(now)
        profile.lastSeen = now

        // Giữ timestamps trong 3x windowMs
        const cutoff = now - this.config.windowMs * 3
        profile.timestamps = profile.timestamps.filter(t => t > cutoff)

        const threshold = this.calcEffectiveThreshold(profile, now)
        const anomalyScore = this.calcAnomalyScore(profile, now, threshold)

        if (anomalyScore >= this.config.anomalyScoreToPenalize) {
            profile.trustScore = Math.max(
                0,
                profile.trustScore - this.config.trustPenaltyOnAnomaly
            )

            profile.perIpThreshold = Math.max(
                this.config.baseThreshold * 0.3,
                profile.perIpThreshold * 0.8
            )

            console.warn(
                `[DoS] ${ip} | anomaly=${anomalyScore.toFixed(2)} | trust=${profile.trustScore} | threshold=${threshold.toFixed(0)} | cpu=${(this.currentCPUUsage * 100).toFixed(0)}%`
            )

            if (profile.trustScore < this.config.blockTrustThreshold) {
                profile.isBlocked = true
                console.warn(`[DoS] ${ip} BLOCKED`)
                return true
            }
        }

        return false
    }

    unblock(ip: string): void {
        const profile = this.profiles.get(ip)
        if (!profile) return
        profile.isBlocked = false
        profile.trustScore = this.config.initialTrustScore
        console.info(`[DoS] ${ip} unblocked`)
    }

    getProfile(ip: string): IPProfile | undefined {
        return this.profiles.get(ip)
    }

    getAllProfiles(): Map<string, IPProfile> {
        return this.profiles
    }

    getGlobalThreshold(): number {
        return this.globalBaseThreshold
    }

    getCPUUsage(): number {
        return this.currentCPUUsage
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private getOrCreateProfile(ip: string, now: number): IPProfile {
        if (!this.profiles.has(ip)) {
            this.profiles.set(ip, {
                timestamps:     [],
                perIpThreshold: this.config.baseThreshold,
                trustScore:     this.config.initialTrustScore,
                isBlocked:      false,
                firstSeen:      now,
                lastSeen:       now,
            })
        }
        return this.profiles.get(ip)!
    }

    /**
     * Tính effective threshold cho từng IP dựa trên trust score và CPU.
     *
     * Mục tiêu: khi CPU cao, chỉ siết IP suspicious — không ảnh hưởng IP tin cậy.
     *
     * | Trust        | CPU bình thường | CPU cao (>80%)              |
     * |--------------|-----------------|------------------------------|
     * | Trusted (≥70)| baseThreshold   | baseThreshold (không đổi)   |
     * | New IP       | baseThreshold   | baseThreshold (grace period) |
     * | Neutral (≥40)| baseThreshold   | baseThreshold * 0.7          |
     * | Suspicious   | perIpThreshold  | globalBaseThreshold (đã giảm)|
     */
    private calcEffectiveThreshold(profile: IPProfile, now: number): number {
        const cpu = this.currentCPUUsage
        const cpuHigh = cpu > this.config.cpuHighThreshold

        // IP tin cậy — không bị ảnh hưởng bởi CPU
        if (profile.trustScore >= this.config.trustedTrustScore) {
            return Math.min(profile.perIpThreshold, this.config.baseThreshold)
        }

        // IP mới (grace period) — chưa đủ data để đánh giá, không siết
        const isNewIP = now - profile.firstSeen < this.config.gracePeriodMs
        if (isNewIP) {
            return this.config.baseThreshold
        }

        // IP neutral — bị ảnh hưởng nhẹ khi CPU cao
        if (profile.trustScore >= this.config.neutralTrustScore) {
            const factor = cpuHigh ? this.config.neutralCPUFactor : 1.0
            return Math.min(profile.perIpThreshold, this.config.baseThreshold * factor)
        }

        // IP suspicious — bị siết chặt theo CPU
        return Math.min(
            profile.perIpThreshold,
            this.globalBaseThreshold  // đã bị giảm theo CPU trong adjustGlobalThreshold
        )
    }

  /**
   * Tính anomaly score từ 3 consecutive windows.
   *
   * window0: [now-1x  → now]       (hiện tại,  weight 0.5)
   * window1: [now-2x  → now-1x]    (trước đó,  weight 0.3)
   * window2: [now-3x  → now-2x]    (xa hơn,    weight 0.2)
   *
   * Burst ngẫu nhiên:  window0 cao, window1/2 thấp → score thấp
   * Sustained attack:  cả 3 windows đều cao        → score cao → penalize
   */
    private calcAnomalyScore(profile: IPProfile, now: number, threshold: number): number {
        const w = this.config.windowMs

        const count0 = profile.timestamps.filter(t => t > now - w).length
        const count1 = profile.timestamps.filter(t => t > now - 2 * w && t <= now - w).length
        const count2 = profile.timestamps.filter(t => t > now - 3 * w && t <= now - 2 * w).length

        const ratio0 = Math.min(count0 / threshold, 1)
        const ratio1 = Math.min(count1 / threshold, 1)
        const ratio2 = Math.min(count2 / threshold, 1)

        // Xác định windows nào có data
        // const hasWindow1 = profile.timestamps.some(t => t <= now - w)
        // const hasWindow2 = profile.timestamps.some(t => t <= now - 2 * w)
        const hasWindow1 = count1 > 0
        const hasWindow2 = count2 > 0

        // Redistribute weight về windows có data
        if (!hasWindow1 && !hasWindow2) {
            // Chỉ có window0 → weight = 1.0
            return ratio0
        }

        if (!hasWindow2) {
            // Chỉ có window0 và window1
            // Normalize lại: 0.5 + 0.3 = 0.8
            const totalWeight01 = this.config.window0Weight + this.config.window1Weight;
            return ratio0 * (this.config.window0Weight / totalWeight01) +
                ratio1 * (this.config.window1Weight / totalWeight01)
        }

        // Đủ cả 3 windows → công thức bình thường
        return (
            ratio0 * this.config.window0Weight +
            ratio1 * this.config.window1Weight +
            ratio2 * this.config.window2Weight
        )
    }

    /**
     * Adjust globalBaseThreshold theo CPU.
     * Chỉ apply cho IP suspicious — IP trusted/neutral không dùng giá trị này.
     */
    private adjustGlobalThreshold(): void {
        this.currentCPUUsage = measureCPUUsage()
        const cpu = this.currentCPUUsage
        const max = this.config.baseThreshold * 1.2
        const min = this.config.baseThreshold * 0.2

        if (cpu > this.config.cpuCriticalThreshold) {
            this.globalBaseThreshold = Math.max(min, this.globalBaseThreshold / 2)
            console.warn(`[DoS] CPU ${(cpu * 100).toFixed(0)}% (critical) → suspicious threshold /2 = ${this.globalBaseThreshold.toFixed(0)}`)
        } else if (cpu > this.config.cpuHighThreshold) {
            this.globalBaseThreshold = Math.max(min, this.globalBaseThreshold * 0.9)
            console.warn(`[DoS] CPU ${(cpu * 100).toFixed(0)}% (high) → suspicious threshold *0.9 = ${this.globalBaseThreshold.toFixed(0)}`)
        } else if (cpu < 0.10) {
            this.globalBaseThreshold = Math.min(max, this.globalBaseThreshold + 20)
        } else if (cpu < 0.30) {
            this.globalBaseThreshold = Math.min(max, this.globalBaseThreshold + 5)
        }
    }

    /**
     * Chạy mỗi 5 giây:
     * - IP behave tốt → reward trust + tăng per-IP threshold từ từ
     * - IP không active → xóa
     */
    private tick(): void {
        const now = Date.now()

        for (const [ip, profile] of this.profiles) {
            if (now - profile.lastSeen > this.config.inactiveTimeoutMs) {
                this.profiles.delete(ip)
                continue
            }

            if (profile.isBlocked) continue

            const threshold = this.calcEffectiveThreshold(profile, now)
            const anomalyScore = this.calcAnomalyScore(profile, now, threshold)

            // Score dưới 50% ngưỡng penalize → behave tốt
            if (anomalyScore < this.config.anomalyScoreToPenalize * 0.5) {
                profile.trustScore = Math.min(
                    100,
                    profile.trustScore + this.config.trustRewardOnNormal
                )
                // Tăng per-IP threshold từ từ, tối đa bằng baseThreshold
                profile.perIpThreshold = Math.min(
                    this.config.baseThreshold,
                    profile.perIpThreshold * 1.05
                )
            }
        }
    }
}

export const dosDetector = new DoSDetector()