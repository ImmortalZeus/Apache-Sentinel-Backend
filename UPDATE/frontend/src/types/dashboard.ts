export interface SystemMetrics {
  totalLogsAnalyzed: number;
  activeBlockedIps: number;
  currentCpuUsage: number;
  isDosPanicMode: boolean;
  isDdosPanicMode: boolean;
  globalThreshold: number;
  trafficHistory: ChartDataPoint[];
}

export interface ChartDataPoint {
  time: string;
  requests: number;
}