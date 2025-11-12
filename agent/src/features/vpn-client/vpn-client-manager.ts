/**
 * VPN Client Manager for Device Agent
 * Manages OpenVPN client connection to Iotistic VPN Server
 */

import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs/promises';
import * as path from 'path';
import { 
  VPNClientOptions, 
  VPNConnectionStatus, 
  VPNMetrics, 
  VPNHealthCheck,
  VPNClientEvents,
  OpenVPNLogEntry,
  NetworkInterface
} from './types';

export class VPNClientManager extends EventEmitter {
  private process?: ChildProcess;
  private config: VPNClientOptions;
  private status: VPNConnectionStatus;
  private metrics: VPNMetrics;
  private reconnectTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;
  private healthCheckTimer?: NodeJS.Timeout;
  private isShuttingDown = false;

  constructor(config: VPNClientOptions) {
    super();
    this.config = config;
    this.status = {
      connected: false,
      connecting: false,
      bytesReceived: 0,
      bytesSent: 0,
      connectionAttempts: 0
    };
    this.metrics = {
      connectionUptime: 0,
      totalBytesReceived: 0,
      totalBytesSent: 0,
      averageLatency: 0,
      connectionDrops: 0,
      reconnectAttempts: 0,
      lastConnected: new Date(),
      dataTransferRate: {
        downloadKbps: 0,
        uploadKbps: 0
      }
    };
  }

  /**
   * Initialize VPN client
   */
  async initialize(): Promise<void> {
    this.config.logger.info('Initializing VPN client', {
      deviceId: this.config.deviceId,
      customerId: this.config.customerId,
      serverHost: this.config.serverHost,
      serverPort: this.config.serverPort
    });

    try {
      await this.ensureDirectories();
      await this.writeConfigFiles();
      this.startMonitoring();
      
      this.config.logger.info('VPN client initialized successfully');
    } catch (error) {
      this.config.logger.error('Failed to initialize VPN client', { error });
      throw error;
    }
  }

  /**
   * Start VPN connection
   */
  async connect(): Promise<void> {
    if (this.status.connecting || this.status.connected) {
      this.config.logger.warn('VPN connection already in progress or established');
      return;
    }

    if (!this.config.enabled) {
      this.config.logger.info('VPN is disabled in configuration');
      return;
    }

    this.config.logger.info('Starting VPN connection...');
    this.status.connecting = true;
    this.status.connectionAttempts++;
    this.emit('connecting');

    try {
      await this.startOpenVPN();
    } catch (error) {
      this.config.logger.error('Failed to start VPN connection', { error });
      this.status.connecting = false;
      this.status.lastError = error instanceof Error ? error.message : String(error);
      this.emit('error', error instanceof Error ? error : new Error(String(error)));
      
      if (this.config.autoReconnect && !this.isShuttingDown) {
        this.scheduleReconnect();
      }
    }
  }

  /**
   * Stop VPN connection
   */
  async disconnect(): Promise<void> {
    this.config.logger.info('Stopping VPN connection...');
    this.isShuttingDown = true;

    // Clear timers
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    // Stop OpenVPN process
    if (this.process) {
      this.process.kill('SIGTERM');
      
      // Wait for graceful shutdown
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          if (this.process) {
            this.process.kill('SIGKILL');
          }
          resolve();
        }, 5000);

        if (this.process) {
          this.process.on('exit', () => {
            clearTimeout(timeout);
            resolve();
          });
        } else {
          clearTimeout(timeout);
          resolve();
        }
      });

      this.process = undefined;
    }

    this.status.connected = false;
    this.status.connecting = false;
    this.status.vpnIP = undefined;
    this.status.connectedAt = undefined;

    this.config.logger.info('VPN connection stopped');
    this.emit('disconnected', 'Manual disconnect');
  }

  /**
   * Get current connection status
   */
  getStatus(): VPNConnectionStatus {
    return { ...this.status };
  }

  /**
   * Get connection metrics
   */
  getMetrics(): VPNMetrics {
    return { ...this.metrics };
  }

  /**
   * Perform VPN health check
   */
  async healthCheck(): Promise<VPNHealthCheck> {
    const health: VPNHealthCheck = {
      vpnConnected: this.status.connected,
      internetReachable: false,
      vpnServerReachable: false,
      dnsResolution: false,
      routingWorking: false,
      certificateValid: false,
      lastCheck: new Date(),
      errors: []
    };

    try {
      // Check internet connectivity
      health.internetReachable = await this.checkInternetConnectivity();
      
      // Check VPN server reachability
      health.vpnServerReachable = await this.checkVPNServerReachability();
      
      // Check DNS resolution
      health.dnsResolution = await this.checkDNSResolution();
      
      // Check routing
      health.routingWorking = await this.checkRouting();
      
      // Check certificate validity
      health.certificateValid = await this.checkCertificateValidity();
      
    } catch (error) {
      health.errors.push(error instanceof Error ? error.message : String(error));
    }

    return health;
  }

  /**
   * Get VPN IP address
   */
  async getVPNIP(): Promise<string | null> {
    try {
      const interfaces = await this.getNetworkInterfaces();
      const vpnInterface = interfaces.find(iface => iface.type === 'vpn' && iface.active);
      return vpnInterface?.ipAddress || null;
    } catch (error) {
      this.config.logger.error('Failed to get VPN IP', { error });
      return null;
    }
  }

  /**
   * Restart VPN connection
   */
  async restart(): Promise<void> {
    this.config.logger.info('Restarting VPN connection...');
    await this.disconnect();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
    await this.connect();
  }

  /**
   * Update VPN configuration
   */
  async updateConfig(newConfig: Partial<VPNClientOptions>): Promise<void> {
    this.config.logger.info('Updating VPN configuration...');
    
    const wasConnected = this.status.connected;
    
    // Update configuration
    Object.assign(this.config, newConfig);
    
    // Rewrite config files if certificates changed
    if (newConfig.deviceCert || newConfig.deviceKey || newConfig.caCert) {
      await this.writeConfigFiles();
    }
    
    // Restart connection if it was active
    if (wasConnected) {
      await this.restart();
    }
    
    this.config.logger.info('VPN configuration updated successfully');
  }

  /**
   * Start OpenVPN process
   */
  private async startOpenVPN(): Promise<void> {
    const configPath = path.join(this.config.configDir, 'client.conf');
    const binaryPath = this.config.binaryPath || 'openvpn';

    this.config.logger.debug('Starting OpenVPN process', { configPath, binaryPath });

    return new Promise((resolve, reject) => {
      this.process = spawn(binaryPath, [
        '--config', configPath,
        '--cd', this.config.configDir,
        '--daemon',
        '--writepid', path.join(this.config.workingDir, 'openvpn.pid')
      ]);

      let connectionEstablished = false;

      this.process.stdout?.on('data', (data) => {
        this.handleOpenVPNOutput(data.toString());
      });

      this.process.stderr?.on('data', (data) => {
        this.handleOpenVPNOutput(data.toString(), true);
      });

      this.process.on('exit', (code, signal) => {
        this.config.logger.info('OpenVPN process exited', { code, signal });
        this.handleProcessExit(code, signal);
      });

      this.process.on('error', (error) => {
        this.config.logger.error('OpenVPN process error', { error });
        if (!connectionEstablished) {
          reject(error);
        }
      });

      // Wait for connection establishment or timeout
      const connectionTimeout = setTimeout(() => {
        if (!connectionEstablished) {
          this.config.logger.error('VPN connection timeout');
          reject(new Error('VPN connection timeout'));
        }
      }, 30000); // 30 second timeout

      // Monitor for successful connection
      const checkConnection = setInterval(async () => {
        if (await this.isVPNConnected()) {
          connectionEstablished = true;
          clearTimeout(connectionTimeout);
          clearInterval(checkConnection);
          
          this.status.connected = true;
          this.status.connecting = false;
          this.status.connectedAt = new Date();
          this.status.vpnIP = (await this.getVPNIP()) || undefined;
          this.metrics.lastConnected = new Date();
          
          this.config.logger.info('VPN connection established', {
            vpnIP: this.status.vpnIP,
            serverHost: this.config.serverHost
          });
          
          this.emit('connected', this.getStatus());
          resolve();
        }
      }, 2000);
    });
  }

  /**
   * Handle OpenVPN process output
   */
  private handleOpenVPNOutput(data: string, isError = false): void {
    const lines = data.split('\n').filter(line => line.trim());
    
    for (const line of lines) {
      const logEntry = this.parseOpenVPNLog(line);
      
      if (logEntry) {
        // Log at appropriate level
        const logLevel = isError ? 'error' : logEntry.level.toLowerCase();
        if (logLevel in this.config.logger) {
          (this.config.logger as any)[logLevel](`OpenVPN: ${logEntry.message}`, {
            category: logEntry.category,
            timestamp: logEntry.timestamp
          });
        }
        
        // Update status based on log messages
        this.updateStatusFromLog(logEntry);
      }
    }
  }

  /**
   * Parse OpenVPN log entry
   */
  private parseOpenVPNLog(line: string): OpenVPNLogEntry | null {
    // Parse timestamp and level from OpenVPN log format
    const match = line.match(/^(\w+\s+\w+\s+\d+\s+\d+:\d+:\d+\s+\d+)\s+(\w+):\s*(.+)$/);
    
    if (match) {
      return {
        timestamp: new Date(match[1]),
        level: match[2] as any,
        message: match[3]
      };
    }
    
    // Fallback for simple messages
    return {
      timestamp: new Date(),
      level: 'INFO',
      message: line.trim()
    };
  }

  /**
   * Update status based on OpenVPN log messages
   */
  private updateStatusFromLog(entry: OpenVPNLogEntry): void {
    const message = entry.message.toLowerCase();
    
    if (message.includes('initialization sequence completed')) {
      this.status.connected = true;
      this.status.connecting = false;
    } else if (message.includes('connection reset')) {
      this.status.connected = false;
      this.metrics.connectionDrops++;
    } else if (message.includes('bytes')) {
      // Parse data transfer information
      const bytesMatch = message.match(/(\d+)\s+bytes/);
      if (bytesMatch) {
        const bytes = parseInt(bytesMatch[1]);
        if (message.includes('received')) {
          this.status.bytesReceived += bytes;
          this.metrics.totalBytesReceived += bytes;
        } else if (message.includes('sent')) {
          this.status.bytesSent += bytes;
          this.metrics.totalBytesSent += bytes;
        }
      }
    }
  }

  /**
   * Handle OpenVPN process exit
   */
  private handleProcessExit(code: number | null, signal: string | null): void {
    this.process = undefined;
    this.status.connected = false;
    this.status.connecting = false;
    this.status.vpnIP = undefined;

    const reason = signal ? `Signal: ${signal}` : `Exit code: ${code}`;
    this.config.logger.info('VPN connection terminated', { code, signal });
    
    this.emit('disconnected', reason);

    // Auto-reconnect if enabled and not shutting down
    if (this.config.autoReconnect && !this.isShuttingDown && code !== 0) {
      this.metrics.connectionDrops++;
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isShuttingDown) {
      return;
    }

    const delay = this.config.reconnectDelay * Math.min(this.metrics.reconnectAttempts + 1, 10); // Exponential backoff with cap
    
    this.config.logger.info(`Scheduling VPN reconnect in ${delay}ms`, {
      attempt: this.metrics.reconnectAttempts + 1
    });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      this.metrics.reconnectAttempts++;
      this.connect().catch(error => {
        this.config.logger.error('Reconnection attempt failed', { error });
      });
    }, delay);
  }

  /**
   * Check if VPN is connected
   */
  private async isVPNConnected(): Promise<boolean> {
    try {
      const vpnIP = await this.getVPNIP();
      return vpnIP !== null;
    } catch {
      return false;
    }
  }

  /**
   * Check internet connectivity
   */
  private async checkInternetConnectivity(): Promise<boolean> {
    try {
      // Implement ping or HTTP check to public server
      return true; // Placeholder
    } catch {
      return false;
    }
  }

  /**
   * Check VPN server reachability
   */
  private async checkVPNServerReachability(): Promise<boolean> {
    try {
      // Implement ping to VPN server
      return true; // Placeholder
    } catch {
      return false;
    }
  }

  /**
   * Check DNS resolution
   */
  private async checkDNSResolution(): Promise<boolean> {
    try {
      // Implement DNS lookup test
      return true; // Placeholder
    } catch {
      return false;
    }
  }

  /**
   * Check routing functionality
   */
  private async checkRouting(): Promise<boolean> {
    try {
      // Implement route table check
      return true; // Placeholder
    } catch {
      return false;
    }
  }

  /**
   * Check certificate validity
   */
  private async checkCertificateValidity(): Promise<boolean> {
    try {
      // Implement certificate expiration check
      return true; // Placeholder
    } catch {
      return false;
    }
  }

  /**
   * Get network interfaces
   */
  private async getNetworkInterfaces(): Promise<NetworkInterface[]> {
    // Implement network interface enumeration
    return []; // Placeholder
  }

  /**
   * Ensure required directories exist
   */
  private async ensureDirectories(): Promise<void> {
    await fs.mkdir(this.config.configDir, { recursive: true });
    await fs.mkdir(this.config.workingDir, { recursive: true });
  }

  /**
   * Write OpenVPN configuration files
   */
  private async writeConfigFiles(): Promise<void> {
    const configPath = path.join(this.config.configDir, 'client.conf');
    const certPath = path.join(this.config.configDir, 'client.crt');
    const keyPath = path.join(this.config.configDir, 'client.key');
    const caPath = path.join(this.config.configDir, 'ca.crt');
    const taPath = path.join(this.config.configDir, 'ta.key');

    // Write certificates and keys
    await fs.writeFile(certPath, this.config.deviceCert);
    await fs.writeFile(keyPath, this.config.deviceKey, { mode: 0o600 });
    await fs.writeFile(caPath, this.config.caCert);
    await fs.writeFile(taPath, this.config.tlsAuthKey);

    // Generate OpenVPN client configuration
    const config = this.generateClientConfig();
    await fs.writeFile(configPath, config);

    this.config.logger.debug('VPN configuration files written', { configPath });
  }

  /**
   * Generate OpenVPN client configuration
   */
  private generateClientConfig(): string {
    return `# OpenVPN Client Configuration for Device ${this.config.deviceId}
client
dev tun
proto ${this.config.protocol}
remote ${this.config.serverHost} ${this.config.serverPort}
resolv-retry infinite
nobind
persist-key
persist-tun

# Certificate files
ca ca.crt
cert client.crt
key client.key
tls-auth ta.key 1

# Security settings
remote-cert-tls server
cipher AES-256-GCM
auth SHA256
tls-version-min 1.2

# Compression
${this.config.enableCompression ? 'comp-lzo adaptive' : '# comp-lzo disabled'}

# Logging
verb ${this.config.logLevel === 'debug' ? '4' : '3'}
${this.config.logFile ? `log-append ${this.config.logFile}` : ''}
${this.config.statusFile ? `status ${this.config.statusFile} 30` : ''}

# Connection settings
ping ${this.config.keepalivePing}
ping-restart ${this.config.keepaliveTimeout}
ping-timer-rem
persist-remote-ip

# Performance tuning
sndbuf 0
rcvbuf 0

# Routing
${this.config.routeAllTraffic ? 'redirect-gateway def1' : '# Split tunnel mode'}
${this.config.customRoutes.map(route => `route ${route}`).join('\n')}

# Device identification
setenv DEVICE_ID ${this.config.deviceId}
setenv CUSTOMER_ID ${this.config.customerId}

# Prevent DNS leaks
${this.config.routeAllTraffic ? 'block-outside-dns' : ''}
`;
  }

  /**
   * Start monitoring timers
   */
  private startMonitoring(): void {
    // Metrics collection every 30 seconds
    this.metricsTimer = setInterval(() => {
      this.updateMetrics();
    }, 30000);

    // Health check every 5 minutes
    this.healthCheckTimer = setInterval(async () => {
      const health = await this.healthCheck();
      if (health.errors.length > 0) {
        this.config.logger.warn('VPN health check issues detected', { errors: health.errors });
      }
    }, 300000);
  }

  /**
   * Update connection metrics
   */
  private updateMetrics(): void {
    if (this.status.connected && this.status.connectedAt) {
      this.metrics.connectionUptime = Date.now() - this.status.connectedAt.getTime();
    }

    // Calculate data transfer rates (simplified)
    const now = Date.now();
    const timeDiff = now - (this.metrics.lastConnected?.getTime() || now);
    if (timeDiff > 0) {
      this.metrics.dataTransferRate.downloadKbps = (this.status.bytesReceived * 8) / (timeDiff / 1000) / 1024;
      this.metrics.dataTransferRate.uploadKbps = (this.status.bytesSent * 8) / (timeDiff / 1000) / 1024;
    }

    this.emit('metrics-update', this.getMetrics());
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    this.isShuttingDown = true;
    
    // Clear all timers
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.metricsTimer) clearInterval(this.metricsTimer);
    if (this.healthCheckTimer) clearInterval(this.healthCheckTimer);
    
    // Disconnect VPN
    await this.disconnect();
    
    this.config.logger.info('VPN client cleanup completed');
  }
}
