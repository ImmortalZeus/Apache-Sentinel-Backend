import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import type { SystemMetrics } from '../types/dashboard';

// Fetches the core system metrics from the Express server
const fetchMetrics = async (): Promise<SystemMetrics> => {
  const { data } = await api.get<SystemMetrics>('/api/stats');
  return data;
};

export function useMetrics() {
  return useQuery<SystemMetrics>({
    queryKey: ['metrics'],
    queryFn: fetchMetrics,
    refetchInterval: 5000, // Automatic polling every 5000ms
    placeholderData: (previousData) => previousData, // Smooth UI transitions during updates
  });
}