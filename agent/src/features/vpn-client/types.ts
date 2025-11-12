/**
 * VPN Client Types for Device Agent
 * Integration with Iotistic VPN Server infrastructure
 */

export interface VPNClientConfig {
  enabled: boolean;
  serverHost: string;
  serverPort: number;
  protocol: 'udp' | 'tcp';
  deviceId: string;
  customerId: string;
  
  // Certificate and authentication
  deviceCert: string;
  deviceKey: string;
  caCert: string;
  tlsAuthKey: string;
  
  // Connection settings
  autoReconnect: boolean;
  reconnectDelay: number;
  maxReconnectAttempts: number;
  keepalivePing: number;
  keepaliveTimeout: number;
  
  // Routing and networking
  routeAllTraffic: boolean;
  customRoutes: string[];
  enableCompression: boolean;
  
  // Logging and monitoring
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  logFile?: string;
  statusFile?: string;
}

export interface VPNConnectionStatus {
  connected: boolean;
  connecting: boolean;
  vpnIP?: string;
  realIP?: string;
  serverIP?: string;
  connectedAt?: Date;
  lastActivity?: Date;
  bytesReceived: number;
  bytesSent: number;
  connectionAttempts: number;
  lastError?: string;
}

export interface VPNMetrics {
  connectionUptime: number;
  totalBytesReceived: number;
  totalBytesSent: number;
  averageLatency: number;
  connectionDrops: number;
  reconnectAttempts: number;
  lastConnected: Date;
  dataTransferRate: {
    downloadKbps: number;
    uploadKbps: number;
  };
}

export interface VPNProvisioningData {
  deviceId: string;
  customerId: string;
  deviceCert: string;
  deviceKey: string;
  caCert: string;
  tlsAuthKey: string;
  clientConfig: string;
  serverHost: string;
  serverPort: number;
  expiresAt: Date;
}

export interface VPNHealthCheck {
  vpnConnected: boolean;
  internetReachable: boolean;
  vpnServerReachable: boolean;
  dnsResolution: boolean;
  routingWorking: boolean;
  certificateValid: boolean;
  lastCheck: Date;
  errors: string[];
}

export interface VPNLogger {
  debug(message: string, meta?: any): void;
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
}

export interface VPNClientEvents {
  'connecting': () => void;
  'connected': (status: VPNConnectionStatus) => void;
  'disconnected': (reason: string) => void;
  'error': (error: Error) => void;
  'status-change': (status: VPNConnectionStatus) => void;
  'metrics-update': (metrics: VPNMetrics) => void;
}

export interface OpenVPNLogEntry {
  timestamp: Date;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  category?: string;
}

export interface NetworkInterface {
  name: string;
  type: 'physical' | 'virtual' | 'vpn';
  ipAddress?: string;
  gateway?: string;
  dns?: string[];
  active: boolean;
}

export interface VPNClientOptions extends VPNClientConfig {
  logger: VPNLogger;
  configDir: string;
  workingDir: string;
  binaryPath?: string;
}
