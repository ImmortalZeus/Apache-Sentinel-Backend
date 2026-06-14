export interface ApacheLog {
  id: string;
  ip: string;
  method: string;
  path: string;
  statusCode: number;
  timestamp: string;
  userAgent: string;
}