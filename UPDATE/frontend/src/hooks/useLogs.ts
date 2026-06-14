import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { ApacheLog } from '../types/logs';

const fetchLogs = async (): Promise<ApacheLog[]> => {
  const { data } = await api.get<ApacheLog[]>('/api/logs');
  return data;
};

export function useLogs() {
  return useQuery<ApacheLog[]>({
    queryKey: ['logs'],
    queryFn: fetchLogs,
    refetchInterval: 5000,
  });
}