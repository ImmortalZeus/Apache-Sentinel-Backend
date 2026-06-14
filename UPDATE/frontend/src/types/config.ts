// Mirrors the shape returned by GET /api/config and PATCH /api/config

export interface DosConfigValues {
    WINDOW_MS:  number;
    THRESHOLD:  number;
}

export interface DdosConfigValues {
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

export interface LiveConfig {
    dos:  DosConfigValues;
    ddos: DdosConfigValues;
    env:  string;
}

/** Flat union of all patchable keys */
export type ConfigPatch = Partial<DosConfigValues & DdosConfigValues>;
