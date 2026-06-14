import { useState, useEffect } from 'react';
import { Save, RotateCcw, Loader2, CheckCircle, AlertCircle, Info } from 'lucide-react';
import { useConfig, useUpdateConfig } from '../../hooks/useConfig';
import type { ConfigPatch } from '../../types/config';

// ─── Param definitions ────────────────────────────────────────────────────

interface ParamDef {
    key:     keyof ConfigPatch;
    label:   string;
    desc:    string;
    unit:    string;
    min:     number;
    max:     number;
    step:    number;
    section: 'dos' | 'ddos';
    display?: (v: number) => string;   // optional custom display (e.g. ms → s)
}

const PARAMS: ParamDef[] = [
    // ── DoS ──────────────────────────────────────────────────────────────
    {
        key: 'WINDOW_MS', label: 'Detection Window', unit: 's', section: 'dos',
        min: 1000, max: 60000, step: 1000,
        display: v => `${(v / 1000).toFixed(0)} s`,
        desc: 'Sliding time window used to measure request bursts per IP.',
    },
    {
        key: 'THRESHOLD', label: 'Per-IP Base Threshold', unit: 'req', section: 'dos',
        min: 10, max: 500, step: 5,
        display: v => `${v} req / window`,
        desc: 'Max requests allowed from one IP per window before anomaly scoring begins.',
    },

    // ── DDoS ─────────────────────────────────────────────────────────────
    {
        key: 'GLOBAL_RATE_THRESHOLD', label: 'Global Flood Threshold', unit: 'req', section: 'ddos',
        min: 50, max: 10000, step: 50,
        display: v => `${v} req / window`,
        desc: 'Total requests across ALL IPs per window to trigger DDoS Stage 1 (Panic Mode).',
    },
    {
        key: 'GLOBAL_RATE_WINDOW_MS', label: 'Global Rate Window', unit: 's', section: 'ddos',
        min: 1000, max: 60000, step: 1000,
        display: v => `${(v / 1000).toFixed(0)} s`,
        desc: 'Sliding window for the global volumetric counter.',
    },
    {
        key: 'COORDINATED_DISTINCT_IP_THRESHOLD', label: 'Botnet IP Threshold', unit: 'IPs', section: 'ddos',
        min: 3, max: 200, step: 1,
        display: v => `${v} distinct IPs`,
        desc: 'Minimum distinct IPs targeting one endpoint to flag as coordinated botnet.',
    },
    {
        key: 'COORDINATED_ERROR_RATIO_THRESHOLD', label: 'Botnet Error Ratio', unit: '%', section: 'ddos',
        min: 0.3, max: 1.0, step: 0.05,
        display: v => `${(v * 100).toFixed(0)} %`,
        desc: 'Minimum fraction of 4xx/5xx errors in coordinated traffic to confirm botnet (vs. flash crowd).',
    },
    {
        key: 'SUBNET_RATE_THRESHOLD', label: 'Subnet Flood Threshold', unit: 'req', section: 'ddos',
        min: 10, max: 2000, step: 10,
        display: v => `${v} req / window`,
        desc: 'Total requests from one /24 subnet to trigger a CIDR-level firewall block.',
    },
    {
        key: 'SUBNET_BLOCK_BASE_TTL_MS', label: 'Subnet Block TTL', unit: 's', section: 'ddos',
        min: 30000, max: 7200000, step: 30000,
        display: v => v >= 60000 ? `${(v / 60000).toFixed(0)} min` : `${(v / 1000).toFixed(0)} s`,
        desc: 'Duration a /24 subnet remains blocked. Doubles on repeated offences (exponential backoff).',
    },
    {
        key: 'PANIC_MODE_DURATION_MS', label: 'Panic Mode Duration', unit: 's', section: 'ddos',
        min: 30000, max: 3600000, step: 30000,
        display: v => v >= 60000 ? `${(v / 60000).toFixed(0)} min` : `${(v / 1000).toFixed(0)} s`,
        desc: 'How long Panic Mode (load shedding) stays active after a global flood is detected.',
    },
    {
        key: 'PANIC_MODE_COOLDOWN_MS', label: 'Panic Mode Cooldown', unit: 's', section: 'ddos',
        min: 30000, max: 1800000, step: 30000,
        display: v => v >= 60000 ? `${(v / 60000).toFixed(0)} min` : `${(v / 1000).toFixed(0)} s`,
        desc: 'Minimum quiet time before Panic Mode can be re-triggered after deactivation.',
    },
];

// ─── Sub-components ───────────────────────────────────────────────────────

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
    return (
        <div style={{ marginBottom: '1rem' }}>
            <div className="term-panel-title" style={{ fontSize: '0.72rem', marginBottom: '0.2rem' }}>
                <span className="term-panel-title-prefix">$</span>
                {title}
            </div>
            <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', margin: 0 }}>{subtitle}</p>
        </div>
    );
}

interface ParamRowProps {
    def:      ParamDef;
    value:    number;
    original: number;
    onChange: (key: keyof ConfigPatch, val: number) => void;
}

function ParamRow({ def, value, original, onChange }: ParamRowProps) {
    const isDirty   = value !== original;
    const displayed = def.display ? def.display(value) : `${value} ${def.unit}`;

    const clamp = (v: number) => Math.min(def.max, Math.max(def.min, v));

    const handleSlider = (e: React.ChangeEvent<HTMLInputElement>) => {
        onChange(def.key, clamp(parseFloat(e.target.value)));
    };

    const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
        const raw = parseFloat(e.target.value);
        if (!isNaN(raw)) onChange(def.key, clamp(raw));
    };

    const pct = ((value - def.min) / (def.max - def.min)) * 100;

    return (
        <div style={{
            padding: '0.875rem 1.25rem',
            borderBottom: '1px solid rgba(0,255,65,0.05)',
            transition: 'background 0.12s',
            background: isDirty ? 'rgba(0,255,65,0.025)' : 'transparent',
        }}>
            {/* Label row */}
            <div className="flex items-center justify-between" style={{ marginBottom: '0.5rem' }}>
                <div className="flex items-center gap-2">
                    <span style={{
                        fontSize: '0.72rem',
                        fontWeight: 600,
                        color: isDirty ? 'var(--green)' : 'var(--text-primary)',
                        textShadow: isDirty ? '0 0 6px rgba(0,255,65,0.35)' : 'none',
                    }}>
                        {def.label}
                    </span>
                    {isDirty && (
                        <span style={{
                            fontSize: '0.58rem',
                            background: 'rgba(0,255,65,0.1)',
                            color: 'var(--green)',
                            border: '1px solid rgba(0,255,65,0.3)',
                            borderRadius: '2px',
                            padding: '0.05rem 0.35rem',
                            letterSpacing: '0.06em',
                        }}>
                            MODIFIED
                        </span>
                    )}
                </div>
                {/* Numeric input */}
                <input
                    type="number"
                    value={value}
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    onChange={handleInput}
                    style={{
                        width: '90px',
                        background: 'rgba(0,0,0,0.5)',
                        border: `1px solid ${isDirty ? 'rgba(0,255,65,0.35)' : 'rgba(0,255,65,0.12)'}`,
                        borderRadius: '3px',
                        padding: '0.25rem 0.5rem',
                        fontFamily: 'var(--font)',
                        fontSize: '0.75rem',
                        color: isDirty ? 'var(--green)' : 'var(--text-primary)',
                        textAlign: 'right',
                        outline: 'none',
                    }}
                />
            </div>

            {/* Slider */}
            <div style={{ position: 'relative', marginBottom: '0.35rem' }}>
                <input
                    type="range"
                    min={def.min}
                    max={def.max}
                    step={def.step}
                    value={value}
                    onChange={handleSlider}
                    style={{ width: '100%', cursor: 'pointer' }}
                />
                {/* Custom track fill overlay */}
                <div style={{
                    position: 'absolute',
                    bottom: '50%',
                    left: 0,
                    width: `${pct}%`,
                    height: '3px',
                    background: isDirty ? 'var(--green)' : 'rgba(0,255,65,0.3)',
                    boxShadow: isDirty ? '0 0 6px var(--green)' : 'none',
                    borderRadius: '2px',
                    pointerEvents: 'none',
                    transform: 'translateY(50%)',
                    transition: 'width 0.05s',
                }} />
            </div>

            {/* Min / current display / max row */}
            <div className="flex justify-between items-center">
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                    {def.display ? def.display(def.min) : `${def.min} ${def.unit}`}
                </span>
                <span style={{
                    fontSize: '0.68rem',
                    fontFamily: 'var(--font)',
                    color: isDirty ? 'var(--green)' : 'var(--cyan)',
                    fontWeight: 600,
                    textShadow: isDirty ? '0 0 8px rgba(0,255,65,0.4)' : 'none',
                }}>
                    {displayed}
                </span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                    {def.display ? def.display(def.max) : `${def.max} ${def.unit}`}
                </span>
            </div>

            {/* Description */}
            <p style={{ fontSize: '0.65rem', color: 'var(--text-muted)', margin: '0.4rem 0 0 0', lineHeight: 1.5 }}>
                <Info size={10} style={{ display: 'inline', marginRight: '0.3rem', verticalAlign: 'middle', color: 'rgba(0,212,255,0.5)' }} />
                {def.desc}
            </p>
        </div>
    );
}

// ─── Main Settings component ──────────────────────────────────────────────

export default function Settings() {
    const { data: config, isLoading, error } = useConfig();
    const { mutate: updateConfig, isPending: isSaving } = useUpdateConfig();

    // Local draft — tracks unsaved edits
    const [draft, setDraft] = useState<ConfigPatch>({});
    const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

    // Seed draft from fetched config
    useEffect(() => {
        if (config) {
            setDraft({
                WINDOW_MS:                          config.dos.WINDOW_MS,
                THRESHOLD:                          config.dos.THRESHOLD,
                GLOBAL_RATE_THRESHOLD:              config.ddos.GLOBAL_RATE_THRESHOLD,
                GLOBAL_RATE_WINDOW_MS:              config.ddos.GLOBAL_RATE_WINDOW_MS,
                COORDINATED_DISTINCT_IP_THRESHOLD:  config.ddos.COORDINATED_DISTINCT_IP_THRESHOLD,
                COORDINATED_ERROR_RATIO_THRESHOLD:  config.ddos.COORDINATED_ERROR_RATIO_THRESHOLD,
                SUBNET_RATE_THRESHOLD:              config.ddos.SUBNET_RATE_THRESHOLD,
                SUBNET_BLOCK_BASE_TTL_MS:           config.ddos.SUBNET_BLOCK_BASE_TTL_MS,
                PANIC_MODE_DURATION_MS:             config.ddos.PANIC_MODE_DURATION_MS,
                PANIC_MODE_COOLDOWN_MS:             config.ddos.PANIC_MODE_COOLDOWN_MS,
            });
        }
    }, [config]);

    const handleChange = (key: keyof ConfigPatch, val: number) => {
        setDraft(prev => ({ ...prev, [key]: val }));
    };

    // Determine which keys are actually changed from server values
    const getDirtyPatch = (): ConfigPatch => {
        if (!config) return {};
        const serverFlat: ConfigPatch = {
            WINDOW_MS: config.dos.WINDOW_MS,
            THRESHOLD: config.dos.THRESHOLD,
            ...config.ddos,
        };
        const dirty: ConfigPatch = {};
        for (const [k, v] of Object.entries(draft) as [keyof ConfigPatch, number][]) {
            if (serverFlat[k] !== v) (dirty as any)[k] = v;
        }
        return dirty;
    };

    const dirtyPatch  = getDirtyPatch();
    const hasDirty    = Object.keys(dirtyPatch).length > 0;

    const handleSave = () => {
        if (!hasDirty) return;
        updateConfig(dirtyPatch, {
            onSuccess: () => {
                setToast({ type: 'ok', msg: `${Object.keys(dirtyPatch).length} parameter(s) applied to live system.` });
                setTimeout(() => setToast(null), 4000);
            },
            onError: () => {
                setToast({ type: 'err', msg: 'Backend rejected the update. Check parameter ranges.' });
                setTimeout(() => setToast(null), 5000);
            },
        });
    };

    const handleReset = () => {
        if (config) {
            setDraft({
                WINDOW_MS:                          config.dos.WINDOW_MS,
                THRESHOLD:                          config.dos.THRESHOLD,
                GLOBAL_RATE_THRESHOLD:              config.ddos.GLOBAL_RATE_THRESHOLD,
                GLOBAL_RATE_WINDOW_MS:              config.ddos.GLOBAL_RATE_WINDOW_MS,
                COORDINATED_DISTINCT_IP_THRESHOLD:  config.ddos.COORDINATED_DISTINCT_IP_THRESHOLD,
                COORDINATED_ERROR_RATIO_THRESHOLD:  config.ddos.COORDINATED_ERROR_RATIO_THRESHOLD,
                SUBNET_RATE_THRESHOLD:              config.ddos.SUBNET_RATE_THRESHOLD,
                SUBNET_BLOCK_BASE_TTL_MS:           config.ddos.SUBNET_BLOCK_BASE_TTL_MS,
                PANIC_MODE_DURATION_MS:             config.ddos.PANIC_MODE_DURATION_MS,
                PANIC_MODE_COOLDOWN_MS:             config.ddos.PANIC_MODE_COOLDOWN_MS,
            });
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center" style={{ height: '60vh', flexDirection: 'column', gap: '1rem' }}>
                <Loader2 size={28} className="animate-spin text-green" />
                <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', letterSpacing: '0.08em' }}>
                    FETCHING LIVE CONFIG...
                </p>
            </div>
        );
    }

    if (error || !config) {
        return (
            <div className="feedback feedback-err" style={{ margin: '2rem 0' }}>
                <AlertCircle size={16} />
                <span>Could not load config from backend. Is the server running?</span>
            </div>
        );
    }

    const dosDefs  = PARAMS.filter(p => p.section === 'dos');
    const ddosDefs = PARAMS.filter(p => p.section === 'ddos');

    const getValue = (key: keyof ConfigPatch): number => (draft as any)[key] ?? 0;

    const getOriginal = (key: keyof ConfigPatch): number => {
        const dosKey = key as keyof typeof config.dos;
        if (dosKey in config.dos) return (config.dos as any)[dosKey];
        return (config.ddos as any)[key] ?? 0;
    };

    return (
        <div className="animate-fadeIn space-y-6">

            {/* Header */}
            <div className="page-header flex items-center justify-between" style={{ marginBottom: '1.25rem' }}>
                <div>
                    <h1 className="page-title">
                        <span className="page-title-prefix">//</span>
                        Settings
                    </h1>
                    <p className="page-subtitle">
                        Live detection thresholds — changes apply immediately, no restart required.
                        Environment: <span style={{ color: config.env === 'production' ? 'var(--threat)' : 'var(--green)' }}>
                            {config.env}
                        </span>
                    </p>
                </div>

                {/* Action buttons */}
                <div className="flex gap-3 shrink-0">
                    <button
                        className="btn btn-ghost btn-sm"
                        onClick={handleReset}
                        disabled={!hasDirty || isSaving}
                    >
                        <RotateCcw size={13} />
                        discard
                    </button>
                    <button
                        id="save-config-btn"
                        className="btn btn-primary btn-sm"
                        onClick={handleSave}
                        disabled={!hasDirty || isSaving}
                    >
                        {isSaving
                            ? <><Loader2 size={13} className="animate-spin" /> applying...</>
                            : <><Save size={13} /> apply changes</>
                        }
                    </button>
                </div>
            </div>

            {/* Toast feedback */}
            {toast && (
                <div className={`feedback ${toast.type === 'ok' ? 'feedback-ok' : 'feedback-err'}`}
                    style={{ marginBottom: '0.5rem' }}>
                    {toast.type === 'ok'
                        ? <CheckCircle size={14} style={{ flexShrink: 0 }} />
                        : <AlertCircle  size={14} style={{ flexShrink: 0 }} />
                    }
                    <span>{toast.msg}</span>
                </div>
            )}

            {/* Dirty summary banner */}
            {hasDirty && !toast && (
                <div style={{
                    padding: '0.5rem 0.875rem',
                    background: 'rgba(0,255,65,0.04)',
                    border: '1px solid rgba(0,255,65,0.2)',
                    borderRadius: '3px',
                    fontSize: '0.72rem',
                    color: 'var(--green)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                }}>
                    <span className="status-live-dot" />
                    {Object.keys(dirtyPatch).length} unsaved change(s) — click
                    <strong>apply changes</strong> to push to the live system.
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', alignItems: 'start' }}>

                {/* ── DoS Column ─────────────────────────────────────── */}
                <div className="term-panel">
                    <div className="term-panel-header">
                        <span className="term-panel-title">
                            <span className="term-panel-title-prefix">$</span>
                            dos_config
                        </span>
                        <span className="det-badge det-badge-dos">Per-IP</span>
                    </div>
                    <SectionHeader
                        title=""
                        subtitle="Controls single-IP trust-score degradation and block threshold."
                    />
                    {dosDefs.map(def => (
                        <ParamRow
                            key={def.key}
                            def={def}
                            value={getValue(def.key)}
                            original={getOriginal(def.key)}
                            onChange={handleChange}
                        />
                    ))}
                </div>

                {/* ── DDoS Column ────────────────────────────────────── */}
                <div className="term-panel">
                    <div className="term-panel-header">
                        <span className="term-panel-title">
                            <span className="term-panel-title-prefix">$</span>
                            ddos_config
                        </span>
                        <span className="det-badge det-badge-ddos">Multi-IP</span>
                    </div>
                    <SectionHeader
                        title=""
                        subtitle="Controls global flood, coordinated botnet, and subnet attack detection."
                    />
                    {ddosDefs.map(def => (
                        <ParamRow
                            key={def.key}
                            def={def}
                            value={getValue(def.key)}
                            original={getOriginal(def.key)}
                            onChange={handleChange}
                        />
                    ))}
                </div>

            </div>

            {/* Read-only reference table */}
            <div className="term-panel">
                <div className="term-panel-header">
                    <span className="term-panel-title">
                        <span className="term-panel-title-prefix">$</span>
                        live_config_snapshot
                    </span>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>read-only · current server values</span>
                </div>
                <div className="term-table-wrap">
                    <table className="term-table">
                        <thead>
                            <tr>
                                <th>Parameter</th>
                                <th>Section</th>
                                <th style={{ textAlign: 'right' }}>Server Value</th>
                                <th style={{ textAlign: 'right' }}>Draft Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            {PARAMS.map(def => {
                                const srv   = getOriginal(def.key);
                                const local = getValue(def.key);
                                const changed = srv !== local;
                                return (
                                    <tr key={def.key}>
                                        <td style={{ fontFamily: 'var(--font)', fontSize: '0.72rem', color: 'var(--cyan)' }}>
                                            {def.key}
                                        </td>
                                        <td>
                                            <span className={`det-badge det-badge-${def.section}`}>
                                                {def.section.toUpperCase()}
                                            </span>
                                        </td>
                                        <td style={{ textAlign: 'right', fontFamily: 'var(--font)', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                                            {def.display ? def.display(srv) : `${srv} ${def.unit}`}
                                        </td>
                                        <td style={{
                                            textAlign: 'right',
                                            fontFamily: 'var(--font)',
                                            fontSize: '0.72rem',
                                            color: changed ? 'var(--green)' : 'var(--text-muted)',
                                            fontWeight: changed ? 600 : 400,
                                            textShadow: changed ? '0 0 6px rgba(0,255,65,0.3)' : 'none',
                                        }}>
                                            {def.display ? def.display(local) : `${local} ${def.unit}`}
                                            {changed && <span style={{ marginLeft: '0.35rem', fontSize: '0.58rem', opacity: 0.7 }}>✎</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="term-panel-footer">
                    <span>Changes are applied in-memory only — they reset to config.json on server restart</span>
                    <span style={{ color: config.env === 'production' ? 'var(--threat)' : 'var(--green)' }}>
                        env: {config.env}
                    </span>
                </div>
            </div>

        </div>
    );
}
