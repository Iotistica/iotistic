import { z } from 'zod';

/**
 * Unix Socket Output Configuration Schema (Protocol-agnostic)
 */
export const SocketOutputSchema = z.object({
  socketPath: z.string().min(1),
  dataFormat: z.enum(['json', 'csv']).optional().default('json'),
  delimiter: z.string().optional().default('\n'),
  includeTimestamp: z.boolean().optional().default(true),
  includeDeviceName: z.boolean().optional().default(true)
});

export type SocketOutput = z.infer<typeof SocketOutputSchema>;

/**
 * Sensor Data Point interface
 * Quality model follows OPC UA standard (GOOD, BAD, UNCERTAIN)
 */
export interface SensorDataPoint {
  deviceName: string;
  registerName: string;
  value: number | boolean | string | null;  // null when quality is BAD
  unit: string;
  timestamp: string;
  quality: 'GOOD' | 'BAD' | 'UNCERTAIN';  // OPC UA quality codes
  qualityCode?: string;  // Error code when quality is BAD (e.g., 'ETIMEDOUT', 'DEVICE_OFFLINE')
}

/**
 * Device Status interface
 */
export interface DeviceStatus {
  deviceName: string;
  connected: boolean;
  lastPoll: Date | null;
  errorCount: number;
  lastError: string | null;
}

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, ...args: any[]): void;
}