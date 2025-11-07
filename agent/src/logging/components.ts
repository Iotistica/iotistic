/**
 * Logging Component Names
 * 
 * Standardized component names for structured logging.
 * Use these constants instead of hardcoded strings to ensure consistency.
 * 
 * Usage:
 *   logger.info('Connection restored', { component: LogComponents.CONNECTION_MONITOR });
 */

export const LogComponents = {
  // Core Agent
  AGENT: 'Agent',
  
  // API Integration
  API_BINDER: 'ApiBinder',
  API_POLLER: 'ApiPoller',
  
  // Connectivity
  CONNECTION_MONITOR: 'ConnectionMonitor',
  
  // State Management
  SYNC: 'Sync',
  STATE_RECONCILER: 'StateReconciler',
  
  // Container Orchestration
  CONTAINER_MANAGER: 'ContainerManager',
  DOCKER_MANAGER: 'DockerManager',
  DOCKER_DRIVER: 'DockerDriver',
  K3S_DRIVER: 'K3sDriver',
  
  // Protocol Adapters
  MODBUS: 'Modbus',
  MODBUS_RTU: 'ModbusRTU',
  MODBUS_TCP: 'ModbusTCP',
  
  // Logging System
  LOG_MONITOR: 'LogMonitor',
  LOCAL_LOG_BACKEND: 'LocalLogBackend',
  CLOUD_LOG_BACKEND: 'CloudLogBackend',
  
  // Device API
  DEVICE_API: 'DeviceAPI',
  CLOUD_API: 'CloudAPI',
  
  // Database
  DATABASE: 'Database',
  MIGRATIONS: 'Migrations',
  
  // System
  SYSTEM_INFO: 'SystemInfo',
  METRICS: 'Metrics',
} as const;

export type LogComponent = typeof LogComponents[keyof typeof LogComponents];
