import { api } from './client';
import type { BlockedIP } from '../../src/types/firewall';

export const getBlockedIPs = async (): Promise<BlockedIP[]> => {
  const { data } = await api.get<BlockedIP[]>('/api/firewall/rules');
  return data;
};

export const unblockIP = async (ip: string): Promise<void> => {
  await api.post('/api/firewall/unblock', { ip });
};

export const blockIP = async (ip: string, reason: string): Promise<void> => {
  await api.post('/api/firewall/block', { ip, reason });
};