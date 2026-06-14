import { useState } from 'react';
import { ShieldAlert, ShieldCheck, Unlock, Plus, AlertOctagon, Loader2, Terminal, Trash2 } from 'lucide-react';
import { useBlockedIPs, useFirewallActions } from '../../hooks/useFirewall';

const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

function isValidIPv4(ip: string): boolean {
  if (!IPV4_REGEX.test(ip)) return false;
  return ip.split('.').every((oct) => parseInt(oct, 10) <= 255);
}

function DetectorBadge({ detector }: { detector: string }) {
  if (detector === 'DOS')    return <span className="det-badge det-badge-dos">DoS</span>;
  if (detector === 'DDOS')   return <span className="det-badge det-badge-ddos">DDoS</span>;
  if (detector === 'MANUAL') return <span className="det-badge det-badge-manual">Manual</span>;
  return null;
}

export default function Firewall() {
  const { data: realIPs, isLoading } = useBlockedIPs();
  const { unblock, isUnblocking, unblockAll, isUnblockingAll, block, isBlocking } = useFirewallActions();

  const blockedIPs = realIPs || [];

  const [ipToBlock,     setIpToBlock]     = useState('');
  const [blockFeedback, setBlockFeedback] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const handleUnblock = (ip: string) => {
    if (window.confirm(`Revoke firewall block for ${ip}?`)) {
      unblock(ip);
    }
  };

  const handleRevokeAll = () => {
    if (blockedIPs.length === 0) return;
    if (window.confirm(`Revoke ALL ${blockedIPs.length} active block rules? This cannot be undone.`)) {
      unblockAll(undefined, {
        onSuccess: (data) => setBlockFeedback({ type: 'ok', msg: `Revoked ${data.revoked} block rule(s).` }),
        onError:   ()     => setBlockFeedback({ type: 'err', msg: 'Failed to revoke all. Check backend logs.' }),
      });
    }
  };

  const handleBlock = () => {
    const ip = ipToBlock.trim();
    if (!isValidIPv4(ip)) {
      setBlockFeedback({ type: 'err', msg: `Invalid IPv4: "${ip}" — expected format: 203.0.113.50` });
      return;
    }
    setBlockFeedback(null);
    block(
      { ip, reason: 'Manual Override' },
      {
        onSuccess: () => { setIpToBlock(''); setBlockFeedback({ type: 'ok', msg: `Block rule enforced for ${ip}.` }); },
        onError:   () => { setBlockFeedback({ type: 'err', msg: `Backend rejected block for ${ip}. Check logs.` }); },
      }
    );
  };

  return (
    <div className="animate-fadeIn space-y-6">

      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">
          <span className="page-title-prefix">//</span>
          <ShieldAlert size={22} style={{ color: 'var(--threat)' }} />
          Active Mitigations
        </h1>
        <p className="page-subtitle">Manage IP addresses quarantined by the Sentinel subsystem</p>
      </div>

      <div className="flex gap-6" style={{ alignItems: 'flex-start' }}>

        {/* ── Left: Quarantine Table ────────────────────────────── */}
        <div className="term-panel flex-1 overflow-hidden">
          <div className="term-panel-header">
            <span className="term-panel-title">
              <span className="term-panel-title-prefix">$</span>
              quarantine_list
            </span>
            <div className="flex items-center gap-3">
              <span className={`count-badge ${blockedIPs.length > 0 ? 'count-badge-red' : 'count-badge-green'}`}>
                {blockedIPs.length} active rule{blockedIPs.length !== 1 ? 's' : ''}
              </span>
              {/* Revoke All */}
              <button
                id="revoke-all-btn"
                className="btn btn-danger btn-sm"
                onClick={handleRevokeAll}
                disabled={blockedIPs.length === 0 || isUnblockingAll || isUnblocking}
                title="Revoke all active block rules at once"
              >
                {isUnblockingAll
                  ? <><Loader2 size={12} className="animate-spin" /> revoking...</>
                  : <><Trash2 size={12} /> revoke all</>
                }
              </button>
            </div>
          </div>

          <div className="term-table-wrap">
            <table className="term-table">
              <thead>
                <tr>
                  <th>IP Address</th>
                  <th>Detector</th>
                  <th>Reason</th>
                  <th>Trust Score</th>
                  <th className="td-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '2.5rem', color: 'var(--text-muted)', fontSize: '0.78rem' }}>
                      <Loader2 size={18} className="animate-spin" style={{ margin: '0 auto 0.5rem', display: 'block' }} />
                      syncing with OS firewall...
                    </td>
                  </tr>
                ) : blockedIPs.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="empty-state">
                        <ShieldCheck size={44} className="empty-state-icon" />
                        <p className="empty-state-title">No active firewall rules</p>
                        <p className="empty-state-desc">Quarantine list populates as threats are detected.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  blockedIPs.map((rule) => (
                    <tr key={rule.ip}>
                      <td className="td-ip whitespace-nowrap">{rule.ip}</td>
                      <td>
                        <DetectorBadge detector={rule.detector} />
                      </td>
                      <td>
                        <span
                          className="td-truncate"
                          style={{ display: 'block', maxWidth: '200px', color: 'var(--text-muted)', fontSize: '0.72rem' }}
                          title={rule.reason}
                        >
                          {rule.reason}
                        </span>
                      </td>
                      <td>
                        <span style={{ fontFamily: 'var(--font)', color: 'var(--warn)', fontSize: '0.8rem' }}>
                          {rule.trustScore}
                        </span>
                      </td>
                      <td className="td-right">
                        <button
                          id={`unblock-${rule.ip.replace(/\./g, '-')}`}
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleUnblock(rule.ip)}
                          disabled={isUnblocking || isUnblockingAll}
                        >
                          {isUnblocking
                            ? <Loader2 size={13} className="animate-spin" />
                            : <Unlock size={13} />
                          }
                          revoke
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="term-panel-footer">
            <span>{blockedIPs.length} entries · synced from Windows Firewall</span>
            <span>auto-refresh 10s</span>
          </div>
        </div>

        {/* ── Right: Manual Override ───────────────────────────── */}
        <div className="term-panel" style={{ width: '300px', flexShrink: 0 }}>
          <div className="term-panel-header">
            <span className="term-panel-title">
              <span className="term-panel-title-prefix">$</span>
              manual_override
            </span>
            <AlertOctagon size={14} style={{ color: 'var(--warn)' }} />
          </div>
          <div className="term-panel-body space-y-4">

            <p className="form-note">
              Bypass automated detection and drop a persistent Windows Firewall block rule immediately.
            </p>

            <div>
              <label htmlFor="block-ip-input" className="form-label">Target IPv4 address</label>
              <input
                id="block-ip-input"
                type="text"
                className="form-input"
                value={ipToBlock}
                onChange={(e) => { setIpToBlock(e.target.value); setBlockFeedback(null); }}
                onKeyDown={(e) => e.key === 'Enter' && handleBlock()}
                placeholder="203.0.113.50"
              />
            </div>

            {blockFeedback && (
              <div className={`feedback ${blockFeedback.type === 'ok' ? 'feedback-ok' : 'feedback-err'}`}>
                <Terminal size={12} style={{ marginTop: '2px', flexShrink: 0 }} />
                <span>{blockFeedback.msg}</span>
              </div>
            )}

            <button
              id="enforce-block-btn"
              className="btn btn-danger btn-full"
              onClick={handleBlock}
              disabled={!ipToBlock.trim() || isBlocking}
            >
              {isBlocking
                ? <><Loader2 size={14} className="animate-spin" /> enforcing...</>
                : <><Plus size={14} /> enforce block rule</>
              }
            </button>

          </div>
        </div>

      </div>
    </div>
  );
}