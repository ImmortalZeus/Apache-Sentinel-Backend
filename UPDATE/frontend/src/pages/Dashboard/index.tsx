import { ShieldAlert, Cpu, Users, Activity, Gauge, Loader2, Siren } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area,
  XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts';
import { useMetrics } from '../../hooks/useMetrics';

export default function Dashboard() {
  const { data: metrics, isLoading, error } = useMetrics();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center" style={{ height: '60vh', flexDirection: 'column', gap: '1rem' }}>
        <Loader2 size={28} className="animate-spin text-green" />
        <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem', letterSpacing: '0.08em' }}>
          ESTABLISHING CONNECTION...
        </p>
      </div>
    );
  }

  if (error || !metrics) {
    return (
      <div className="feedback feedback-err" style={{ margin: '2rem 0' }}>
        <ShieldAlert size={16} />
        <span>Failed to connect to Sentinel backend daemon. Is the backend running?</span>
      </div>
    );
  }

  const isDdosPanic = metrics.isDdosPanicMode;
  const isDosPanic  = metrics.isDosPanicMode;
  const isPanic     = isDdosPanic || isDosPanic;

  const chartColor   = isDdosPanic ? '#ff5555' : isDosPanic ? '#ffb86c' : '#00ff41';
  const chartGradId  = isDdosPanic ? 'grad-red'  : isDosPanic ? 'grad-amber' : 'grad-green';
  const chartOpacity = isPanic ? 0.28 : 0.18;

  return (
    <div className="animate-fadeIn space-y-6">

      {/* ── DDoS Panic Mode — full-width alarm banner ─────────── */}
      {isDdosPanic && (
        <div className="panic-banner panic-banner-ddos">
          <div className="panic-banner-icon">
            <Siren size={20} />
          </div>
          <div className="panic-banner-body">
            <p className="panic-banner-title">⚠ STAGE 1 · VOLUMETRIC DDoS FLOOD DETECTED</p>
            <p className="panic-banner-desc">
              Panic Mode active — load shedding engaged on heavy endpoints.
              Global rate thresholds dynamically tightened.
            </p>
          </div>
          <div className="panic-banner-badge">PANIC</div>
        </div>
      )}

      {/* ── DoS Panic Mode banner ─────────────────────────────── */}
      {isDosPanic && !isDdosPanic && (
        <div className="panic-banner panic-banner-dos">
          <div className="panic-banner-icon">
            <ShieldAlert size={20} />
          </div>
          <div className="panic-banner-body">
            <p className="panic-banner-title">⚠ DoS PANIC MODE ACTIVE</p>
            <p className="panic-banner-desc">
              Per-IP anomaly thresholds tightened. Suspicious IPs under accelerated trust degradation.
            </p>
          </div>
          <div className="panic-banner-badge">PANIC</div>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <h1 className="page-title">
          <span className="page-title-prefix">//</span>
          System Overview
          {isPanic && (
            <span className="panic-title-badge">
              <span className="panic-dot" />
              INCIDENT ACTIVE
            </span>
          )}
        </h1>
        <p className="page-subtitle">Real-time Apache traffic monitoring and threat mitigation status</p>
      </div>

      {/* Metric Cards */}
      <div className="metrics-grid">

        {/* Logs Analyzed */}
        <div className="metric-card">
          <div>
            <p className="metric-label">Logs Analyzed</p>
            <p className="metric-value">{metrics.totalLogsAnalyzed.toLocaleString()}</p>
          </div>
          <div className="metric-icon metric-icon-green"><Activity size={20} /></div>
        </div>

        {/* Mitigated IPs */}
        <div className="metric-card">
          <div>
            <p className="metric-label">Mitigated IPs</p>
            <p className="metric-value" style={{ color: metrics.activeBlockedIps > 0 ? 'var(--threat)' : 'var(--green)', textShadow: metrics.activeBlockedIps > 0 ? '0 0 12px var(--threat-glow)' : undefined }}>
              {metrics.activeBlockedIps}
            </p>
          </div>
          <div className="metric-icon" style={{ background: metrics.activeBlockedIps > 0 ? 'var(--threat-subtle)' : 'var(--green-subtle)', color: metrics.activeBlockedIps > 0 ? 'var(--threat)' : 'var(--green)', border: `1px solid ${metrics.activeBlockedIps > 0 ? 'rgba(255,85,85,0.2)' : 'rgba(0,255,65,0.2)'}` }}>
            <Users size={20} />
          </div>
        </div>

        {/* CPU Usage */}
        <div className="metric-card">
          <div>
            <p className="metric-label">CPU Usage</p>
            <p className="metric-value" style={{
              color: metrics.currentCpuUsage > 0.8 ? 'var(--threat)' : metrics.currentCpuUsage > 0.5 ? 'var(--warn)' : 'var(--green)',
              textShadow: '0 0 12px rgba(0,255,65,0.35)'
            }}>
              {(metrics.currentCpuUsage * 100).toFixed(0)}%
            </p>
          </div>
          <div className="metric-icon metric-icon-cyan"><Cpu size={20} /></div>
        </div>

        {/* Adaptive Threshold */}
        <div className="metric-card">
          <div>
            <p className="metric-label">Adaptive Threshold</p>
            <p className="metric-value" style={{ color: isPanic ? 'var(--threat)' : 'var(--purp)', textShadow: isPanic ? '0 0 12px var(--threat-glow)' : '0 0 12px rgba(189,147,249,0.35)' }}>
              {metrics.globalThreshold.toFixed(0)}
            </p>
            <p className="metric-sub">{isPanic ? '⚡ tightened' : 'req / window'}</p>
          </div>
          <div className="metric-icon metric-icon-purple"><Gauge size={20} /></div>
        </div>

      </div>

      {/* Traffic Chart */}
      <div className={`term-panel${isPanic ? ' panic-chart-panel' : ''}`}>
        <div className="term-panel-header">
          <span className="term-panel-title">
            <span className="term-panel-title-prefix">$</span>
            traffic_throughput
          </span>
          <div className="flex items-center gap-3">
            {isPanic && (
              <span style={{ fontSize: '0.65rem', fontFamily: 'var(--font)', color: 'var(--threat)', letterSpacing: '0.1em', animation: 'panic-blink 1s step-end infinite' }}>
                ● ANOMALY
              </span>
            )}
            <div className="status-live">
              <span className="status-live-dot" />
              LIVE
            </div>
          </div>
        </div>
        <div className="term-panel-body">
          <p style={{ fontSize: '0.67rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
            Requests processed per 5-second tick · rolling 60-second window
          </p>
          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={metrics.trafficHistory}
                margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="grad-green" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#00ff41" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#00ff41" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad-red" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ff5555" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#ff5555" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad-amber" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#ffb86c" stopOpacity={0.28} />
                    <stop offset="95%" stopColor="#ffb86c" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isPanic ? 'rgba(255,85,85,0.08)' : 'rgba(0,255,65,0.05)'} />
                <XAxis
                  dataKey="time"
                  tick={{ fill: '#334155', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  tickLine={false}
                  axisLine={{ stroke: isPanic ? 'rgba(255,85,85,0.15)' : 'rgba(0,255,65,0.1)' }}
                />
                <YAxis
                  tick={{ fill: '#334155', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  contentStyle={{
                    background: '#0c1120',
                    border: `1px solid ${isPanic ? 'rgba(255,85,85,0.35)' : 'rgba(0,255,65,0.25)'}`,
                    borderRadius: '3px',
                    color: chartColor,
                    fontSize: '11px',
                    fontFamily: 'JetBrains Mono',
                    boxShadow: `0 0 14px ${isPanic ? 'rgba(255,85,85,0.15)' : 'rgba(0,255,65,0.15)'}`
                  }}
                  labelStyle={{ color: '#64748b', marginBottom: '2px' }}
                />
                <Area
                  type="monotone"
                  dataKey="requests"
                  stroke={chartColor}
                  strokeWidth={isPanic ? 2 : 1.5}
                  fillOpacity={1}
                  fill={`url(#${chartGradId})`}
                  dot={false}
                  activeDot={{ r: 4, fill: chartColor, stroke: 'none' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

    </div>
  );
}