export interface BlockedIP {
  ip: string;
  detector: 'DOS' | 'DDOS' | 'MANUAL';
  reason: string;
  blockedAt: string;
  trustScore: number;
}