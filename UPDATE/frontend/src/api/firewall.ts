import { api } from './client';
import type { BlockedIP } from '../types/firewall';

export const getBlockedIPs = async (): Promise<BlockedIP[]> => {
  const { data } = await api.get<BlockedIP[]>('/api/firewall/rules');
  return data;
};

export const unblockIP = async (ip: string): Promise<void> => {
  await api.post('/api/firewall/unblock', { ip });
};

export const unblockAll = async (): Promise<{ revoked: number }> => {
  const { data } = await api.post<{ revoked: number }>('/api/firewall/unblock-all', {});
  return data;
};

export const blockIP = async (ip: string, reason: string): Promise<void> => {
  await api.post('/api/firewall/block', { ip, reason });
};
