/**
 * Logging Module
 * ==============
 * 
 * Provides container and system log collection, storage, and retrieval.
 */

export * from './types';
export { LocalLogBackend } from './local-backend';
export { ContainerLogMonitor } from './docker-monitor';
export { AgentLogger } from './agent-logger';

/**
 * Log system events (for network operations, etc.)
 */
export function logSystemEvent(eventType: string, data: any): void {
  const timestamp = new Date().toISOString();
  console.log(`[SYSTEM_EVENT] ${timestamp} - ${eventType}:`, JSON.stringify(data, null, 2));
}
