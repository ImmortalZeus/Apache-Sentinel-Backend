import os from 'os'
import { configService } from '../services/config.service'
import { ddosDetector } from './ddos.detector'

// ─── Config ────────────────────────────────────────────────────────────────

export interface DoSConfig {
    windowMs: number
    window0Weight: number
    window1Weight: number
    window2Weight: number
    baseThreshold: number
    anomalyScoreToPenalize: number
    initialTrustScore: number
    trustPenaltyOnAnomaly: number
    trustRewardOnNormal: number
    blockTrustThreshold: number
    trustedTrustScore: number
    neutralTrustScore: number
    neutralCPUFactor: number
    gracePeriodMs: number
    cpuHighThreshold: number
    cpuCriticalThreshold: number
    inactiveTimeoutMs: number
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
    return totalDelta === 0 ? 0 : 1 - idleDelta / totalDelta
}

// ─── DoS Detector ──────────────────────────────────────────────────────────

export class DoSDetector {
    private readonly profiles = new Map<string, IPProfile>()
    private config: DoSConfig                   // mutable — hot-reload via updateConfig()
    private globalBaseThreshold: number
    private currentCPUUsage: number = 0

    constructor(config: Partial<DoSConfig> = {}) {
        this.config = {
            ...DEFAULT_CONFIG,
            // seed WINDOW_MS and baseThreshold from live config service
            windowMs:      configService.dos.WINDOW_MS,
            baseThreshold: configService.dos.THRESHOLD,
            ...config,
        }
        this.globalBaseThreshold = this.config.baseThreshold

        setInterval(() => this.adjustGlobalThreshold(), 10_000)
        setInterval(() => this.tick(), 5_000)
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Hot-reload DoS thresholds without server restart.
     * Called by PATCH /api/config after configService.update().
     */
    updateConfig(patch: Partial<DoSConfig>): void {
        this.config = { ...this.config, ...patch }
        // Re-anchor globalBaseThreshold if baseThreshold changed
        if (patch.baseThreshold !== undefined) {
            this.globalBaseThreshold = patch.baseThreshold
        }
        console.info('[DoS] Config hot-reloaded:', patch)
    }

    syncBlockedIPs(ips: string[]): void {
        for (const ip of ips) {
            const now = Date.now()
            const profile = this.getOrCreateProfile(ip, now)
            profile.isBlocked = true
            profile.trustScore = 0
        }
        console.info(`[DoS] Synced ${ips.length} blocked IPs from firewall`)
    }

    check(ip: string): boolean {
        const now = Date.now()
        const profile = this.getOrCreateProfile(ip, now)

        if (profile.isBlocked) return true

        profile.timestamps.push(now)
        profile.lastSeen = now

        const cutoff = now - this.config.windowMs * 3
        profile.timestamps = profile.timestamps.filter(t => t > cutoff)

        const threshold    = this.calcEffectiveThreshold(profile, now)
        const anomalyScore = this.calcAnomalyScore(profile, now, threshold)

        if (anomalyScore >= this.config.anomalyScoreToPenalize) {
            profile.trustScore = Math.max(0, profile.trustScore - this.config.trustPenaltyOnAnomaly)
            profile.perIpThreshold = Math.max(
                this.config.baseThreshold * 0.3,
                profile.perIpThreshold * 0.8
            )

            console.warn(
                `[DoS] ${ip} | anomaly=${anomalyScore.toFixed(2)} | trust=${profile.trustScore}` +
                ` | threshold=${threshold.toFixed(0)} | cpu=${(this.currentCPUUsage * 100).toFixed(0)}%`
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

    getProfile(ip: string): IPProfile | undefined { return this.profiles.get(ip) }
    getAllProfiles(): Map<string, IPProfile>       { return this.profiles }
    getGlobalThreshold(): number                  { return this.globalBaseThreshold }
    getCPUUsage(): number                         { return this.currentCPUUsage }

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

    private calcEffectiveThreshold(profile: IPProfile, now: number): number {
        if (ddosDetector.isUnderAttack()) {
            if (profile.trustScore >= this.config.trustedTrustScore) {
                return Math.min(profile.perIpThreshold, this.config.baseThreshold * 0.8)
            }
            return Math.min(profile.perIpThreshold, this.config.baseThreshold * 0.2)
        }

        const cpu     = this.currentCPUUsage
        const cpuHigh = cpu > this.config.cpuHighThreshold

        if (profile.trustScore >= this.config.trustedTrustScore) {
            return Math.min(profile.perIpThreshold, this.config.baseThreshold)
        }

        const isNewIP = now - profile.firstSeen < this.config.gracePeriodMs
        if (isNewIP) return this.config.baseThreshold

        if (profile.trustScore >= this.config.neutralTrustScore) {
            const factor = cpuHigh ? this.config.neutralCPUFactor : 1.0
            return Math.min(profile.perIpThreshold, this.config.baseThreshold * factor)
        }

        return Math.min(profile.perIpThreshold, this.globalBaseThreshold)
    }

    private calcAnomalyScore(profile: IPProfile, now: number, threshold: number): number {
        const w = this.config.windowMs

        const count0 = profile.timestamps.filter(t => t > now - w).length
        const count1 = profile.timestamps.filter(t => t > now - 2 * w && t <= now - w).length
        const count2 = profile.timestamps.filter(t => t > now - 3 * w && t <= now - 2 * w).length

        const ratio0 = Math.min(count0 / threshold, 1)
        const ratio1 = Math.min(count1 / threshold, 1)
        const ratio2 = Math.min(count2 / threshold, 1)

        const hasWindow1 = count1 > 0
        const hasWindow2 = count2 > 0

        if (!hasWindow1 && !hasWindow2) return ratio0

        if (!hasWindow2) {
            const totalWeight01 = this.config.window0Weight + this.config.window1Weight
            return ratio0 * (this.config.window0Weight / totalWeight01) +
                   ratio1 * (this.config.window1Weight / totalWeight01)
        }

        return (
            ratio0 * this.config.window0Weight +
            ratio1 * this.config.window1Weight +
            ratio2 * this.config.window2Weight
        )
    }

    private adjustGlobalThreshold(): void {
        this.currentCPUUsage = measureCPUUsage()
        const cpu = this.currentCPUUsage

        if (ddosDetector.isUnderAttack()) {
            const min = this.config.baseThreshold * 0.2
            this.globalBaseThreshold = Math.max(min, this.globalBaseThreshold * 0.7)
            return
        }

        const max = this.config.baseThreshold * 1.2
        const min = this.config.baseThreshold * 0.2

        if (cpu > this.config.cpuCriticalThreshold) {
            this.globalBaseThreshold = Math.max(min, this.globalBaseThreshold / 2)
            console.warn(`[DoS] CPU ${(cpu * 100).toFixed(0)}% (critical) → threshold /2 = ${this.globalBaseThreshold.toFixed(0)}`)
        } else if (cpu > this.config.cpuHighThreshold) {
            this.globalBaseThreshold = Math.max(min, this.globalBaseThreshold * 0.9)
            console.warn(`[DoS] CPU ${(cpu * 100).toFixed(0)}% (high) → threshold *0.9 = ${this.globalBaseThreshold.toFixed(0)}`)
        } else if (cpu < 0.10) {
            this.globalBaseThreshold = Math.min(max, this.globalBaseThreshold + 20)
        } else if (cpu < 0.30) {
            this.globalBaseThreshold = Math.min(max, this.globalBaseThreshold + 5)
        }
    }

    private tick(): void {
        const now = Date.now()

        for (const [ip, profile] of this.profiles) {
            if (now - profile.lastSeen > this.config.inactiveTimeoutMs) {
                this.profiles.delete(ip)
                continue
            }

            if (profile.isBlocked) continue

            const threshold    = this.calcEffectiveThreshold(profile, now)
            const anomalyScore = this.calcAnomalyScore(profile, now, threshold)

            if (anomalyScore < this.config.anomalyScoreToPenalize * 0.5) {
                profile.trustScore = Math.min(100, profile.trustScore + this.config.trustRewardOnNormal)
                profile.perIpThreshold = Math.min(
                    this.config.baseThreshold,
                    profile.perIpThreshold * 1.05
                )
            }
        }
    }

    public reset(): void {
        this.profiles.clear()
        this.globalBaseThreshold = this.config.baseThreshold
        this.currentCPUUsage = 0
        console.info('[DoS] Detector state reset')
    }
}

export const dosDetector = new DoSDetector()