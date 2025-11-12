/**
 * Network Module
 * ==============
 * 
 * Connection monitoring and firewall management
 */

// Connection health monitoring (online/offline tracking)
export { ConnectionMonitor } from './connection-monitor';
export type { ConnectionState, ConnectionHealth } from './connection-monitor';

// Firewall management (iptables rules)
export { AgentFirewall } from './firewall';
