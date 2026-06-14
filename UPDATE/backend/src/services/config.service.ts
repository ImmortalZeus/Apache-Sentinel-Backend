/**
 * ConfigService — Live configuration singleton.
 *
 * The detectors reference this service instead of importing config.json directly.
 * This allows the frontend Settings page to update thresholds at runtime via
 * PATCH /api/config without restarting the server.
 */

import rawConfig from '../config.json';

const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';

// ─── Exported shape ───────────────────────────────────────────────────────

export interface LiveDdosConfig {
    GLOBAL_RATE_THRESHOLD:             number;
    GLOBAL_RATE_WINDOW_MS:             number;
    COORDINATED_DISTINCT_IP_THRESHOLD: number;
    COORDINATED_ERROR_RATIO_THRESHOLD: number;
    SUBNET_PREFIX_LENGTH:              number;
    SUBNET_RATE_THRESHOLD:             number;
    SUBNET_BLOCK_BASE_TTL_MS:          number;
    PANIC_MODE_DURATION_MS:            number;
    PANIC_MODE_COOLDOWN_MS:            number;
}

export interface LiveDosConfig {
    WINDOW_MS:  number;
    THRESHOLD:  number;
}

export interface LiveConfig {
    dos:  LiveDosConfig;
    ddos: LiveDdosConfig;
    env:  string;
}

// ─── Config Service class ─────────────────────────────────────────────────

class ConfigService {
    private _dos: LiveDosConfig;
    private _ddos: LiveDdosConfig;

    constructor() {
        const envDdos = (rawConfig.ddos as any)[env] as Record<string, number>;

        this._dos = {
            WINDOW_MS: rawConfig.dos.WINDOW_MS,
            THRESHOLD: rawConfig.dos.THRESHOLD,
        };

        this._ddos = {
            GLOBAL_RATE_THRESHOLD:             envDdos.GLOBAL_RATE_THRESHOLD,
            GLOBAL_RATE_WINDOW_MS:             envDdos.GLOBAL_RATE_WINDOW_MS,
            COORDINATED_DISTINCT_IP_THRESHOLD: envDdos.COORDINATED_DISTINCT_IP_THRESHOLD,
            COORDINATED_ERROR_RATIO_THRESHOLD: rawConfig.ddos.COORDINATED_ERROR_RATIO_THRESHOLD,
            SUBNET_PREFIX_LENGTH:              rawConfig.ddos.SUBNET_PREFIX_LENGTH,
            SUBNET_RATE_THRESHOLD:             envDdos.SUBNET_RATE_THRESHOLD,
            SUBNET_BLOCK_BASE_TTL_MS:          envDdos.SUBNET_BLOCK_BASE_TTL_MS,
            PANIC_MODE_DURATION_MS:            envDdos.PANIC_MODE_DURATION_MS,
            PANIC_MODE_COOLDOWN_MS:            envDdos.PANIC_MODE_COOLDOWN_MS,
        };
    }

    // ── Getters ──────────────────────────────────────────────────────────

    get dos(): Readonly<LiveDosConfig>  { return this._dos; }
    get ddos(): Readonly<LiveDdosConfig> { return this._ddos; }

    getAll(): LiveConfig {
        return {
            dos:  { ...this._dos },
            ddos: { ...this._ddos },
            env,
        };
    }

    // ── Updater (called from PATCH /api/config) ───────────────────────────

    /**
     * Merge a partial update into the live config.
     * Only known keys are accepted; unknown keys are silently ignored.
     */
    update(patch: Partial<LiveDosConfig & LiveDdosConfig>): LiveConfig {
        // DoS keys
        if (patch.WINDOW_MS  !== undefined) this._dos.WINDOW_MS  = patch.WINDOW_MS;
        if (patch.THRESHOLD   !== undefined) this._dos.THRESHOLD   = patch.THRESHOLD;

        // DDoS keys
        const ddosKeys: Array<keyof LiveDdosConfig> = [
            'GLOBAL_RATE_THRESHOLD',
            'GLOBAL_RATE_WINDOW_MS',
            'COORDINATED_DISTINCT_IP_THRESHOLD',
            'COORDINATED_ERROR_RATIO_THRESHOLD',
            'SUBNET_PREFIX_LENGTH',
            'SUBNET_RATE_THRESHOLD',
            'SUBNET_BLOCK_BASE_TTL_MS',
            'PANIC_MODE_DURATION_MS',
            'PANIC_MODE_COOLDOWN_MS',
        ];

        for (const key of ddosKeys) {
            if (patch[key] !== undefined) {
                this._ddos[key] = patch[key] as number;
            }
        }

        console.info('[Config] Live config updated:', patch);
        return this.getAll();
    }
}

export const configService = new ConfigService();
