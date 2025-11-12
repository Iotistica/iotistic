/**
 * VPN Integration for Device Agent
 * Integrates VPN client with existing agent architecture
 */

import * as path from 'path';
import { VPNClientManager } from './vpn-client-manager';
import { VPNProvisioningService } from './vpn-provisioning';
import { VPNClientConfig, VPNConnectionStatus, VPNMetrics, VPNLogger } from './types';

export interface VPNIntegrationConfig {
  enabled: boolean;
  billingServiceUrl: string;
  deviceId: string;
  customerId: string;
  apiKey: string;
  configFile: string;
  logFile?: string;
  statusFile?: string;
  autoProvision: boolean;
  provisioningRetryAttempts: number;
  provisioningRetryDelay: number;
  baseConfig?: Partial<VPNClientConfig>;
}

export interface VPNIntegrationEvents {
  statusChanged: (status: VPNConnectionStatus) => void;
  metricsUpdated: (metrics: VPNMetrics) => void;
  error: (error: Error) => void;
  provisioned: (config: VPNClientConfig) => void;
  certificateExpiring: (expiresAt: Date, daysRemaining: number) => void;
}

/**
 * VPN Integration for Device Agent
 * High-level interface for VPN functionality in the agent
 */
export class VPNIntegration {
  private vpnClient?: VPNClientManager;
  private provisioningService: VPNProvisioningService;
  private currentConfig?: VPNClientConfig;
  private eventHandlers: Partial<VPNIntegrationEvents> = {};
  private certificateCheckInterval?: NodeJS.Timeout;
  private initialized = false;

  constructor(
    private config: VPNIntegrationConfig,
    private logger: VPNLogger
  ) {
    this.provisioningService = new VPNProvisioningService(
      {
        billingServiceUrl: config.billingServiceUrl,
        deviceId: config.deviceId,
        customerId: config.customerId,
        apiKey: config.apiKey,
        retryAttempts: config.provisioningRetryAttempts,
        retryDelay: config.provisioningRetryDelay
      },
      logger
    );
  }

  /**
   * Initialize VPN integration
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.logger.info('Initializing VPN integration', {
      enabled: this.config.enabled,
      deviceId: this.config.deviceId,
      customerId: this.config.customerId
    });

    if (!this.config.enabled) {
      this.logger.info('VPN integration disabled by configuration');
      this.initialized = true;
      return;
    }

    try {
      // Try to load existing configuration
      const existingConfig = await this.loadExistingConfig();
      
      if (existingConfig && await this.provisioningService.isCertificateValid(existingConfig)) {
        this.logger.info('Using existing VPN configuration');
        this.currentConfig = existingConfig;
      } else if (this.config.autoProvision) {
        this.logger.info('Auto-provisioning VPN certificates');
        await this.provisionVPN();
      } else {
        this.logger.warn('No valid VPN configuration found and auto-provisioning is disabled');
        this.initialized = true;
        return;
      }

      // Initialize VPN client
      if (this.currentConfig) {
        await this.initializeVPNClient();
        this.startCertificateMonitoring();
      }

      this.initialized = true;
      this.logger.info('VPN integration initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize VPN integration', { error });
      this.initialized = true; // Mark as initialized to prevent retry loops
      throw error;
    }
  }

  /**
   * Start VPN connection
   */
  async start(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.vpnClient || !this.currentConfig) {
      throw new Error('VPN not properly initialized');
    }

    this.logger.info('Starting VPN connection');
    await this.vpnClient.connect();
  }

  /**
   * Stop VPN connection
   */
  async stop(): Promise<void> {
    if (this.vpnClient) {
      this.logger.info('Stopping VPN connection');
      await this.vpnClient.disconnect();
    }
  }

  /**
   * Get current VPN status
   */
  getStatus(): VPNConnectionStatus {
    return this.vpnClient?.getStatus() ?? {
      connected: false,
      connecting: false,
      vpnIP: undefined,
      realIP: undefined,
      serverIP: undefined,
      connectedAt: undefined,
      lastActivity: undefined,
      bytesReceived: 0,
      bytesSent: 0,
      connectionAttempts: 0,
      lastError: undefined
    };
  }

  /**
   * Get VPN metrics
   */
  getMetrics(): VPNMetrics {
    return this.vpnClient?.getMetrics() ?? {
      connectionUptime: 0,
      totalBytesReceived: 0,
      totalBytesSent: 0,
      averageLatency: 0,
      connectionDrops: 0,
      reconnectAttempts: 0,
      lastConnected: new Date(0),
      dataTransferRate: {
        downloadKbps: 0,
        uploadKbps: 0
      }
    };
  }

  /**
   * Check if VPN is connected
   */
  isConnected(): boolean {
    return this.getStatus().connected;
  }

  /**
   * Check if VPN is enabled and configured
   */
  isEnabled(): boolean {
    return this.config.enabled && !!this.currentConfig;
  }

  /**
   * Provision new VPN certificates
   */
  async provisionVPN(): Promise<void> {
    this.logger.info('Provisioning VPN certificates');

    try {
      const provisioningData = await this.provisioningService.provisionVPN();
      
      this.currentConfig = this.provisioningService.createVPNConfig(
        provisioningData, 
        this.config.baseConfig
      );

      await this.saveConfiguration(this.currentConfig);
      
      this.eventHandlers.provisioned?.(this.currentConfig);
      
      this.logger.info('VPN provisioning completed successfully', {
        expiresAt: provisioningData.expiresAt.toISOString()
      });
    } catch (error) {
      this.logger.error('VPN provisioning failed', { error });
      throw error;
    }
  }

  /**
   * Revoke current VPN certificate
   */
  async revokeCertificate(): Promise<void> {
    this.logger.info('Revoking VPN certificate');

    try {
      await this.provisioningService.revokeCurrentCertificate();
      
      // Stop VPN if running
      if (this.vpnClient) {
        await this.vpnClient.disconnect();
      }

      // Clear current configuration
      this.currentConfig = undefined;
      await this.clearConfiguration();

      this.logger.info('VPN certificate revoked successfully');
    } catch (error) {
      this.logger.error('Failed to revoke VPN certificate', { error });
      throw error;
    }
  }

  /**
   * Register event handler
   */
  on<K extends keyof VPNIntegrationEvents>(event: K, handler: VPNIntegrationEvents[K]): void {
    this.eventHandlers[event] = handler;
  }

  /**
   * Shutdown VPN integration
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down VPN integration');

    // Stop certificate monitoring
    if (this.certificateCheckInterval) {
      clearInterval(this.certificateCheckInterval);
      this.certificateCheckInterval = undefined;
    }

    // Stop VPN client
    if (this.vpnClient) {
      await this.vpnClient.cleanup();
      this.vpnClient = undefined;
    }

    this.initialized = false;
    this.logger.info('VPN integration shutdown complete');
  }

  /**
   * Initialize VPN client with current configuration
   */
  private async initializeVPNClient(): Promise<void> {
    if (!this.currentConfig) {
      throw new Error('No VPN configuration available');
    }

    // Create VPNClientOptions from VPNClientConfig
    const vpnClientOptions = {
      ...this.currentConfig,
      logger: this.logger,
      configDir: path.dirname(this.config.configFile),
      workingDir: path.dirname(this.config.configFile),
      binaryPath: process.env.VPN_BINARY_PATH || 'openvpn'
    };

    this.vpnClient = new VPNClientManager(vpnClientOptions);

    // Register event handlers
    this.vpnClient.on('statusChanged', (status) => {
      this.eventHandlers.statusChanged?.(status);
    });

    this.vpnClient.on('metricsUpdated', (metrics) => {
      this.eventHandlers.metricsUpdated?.(metrics);
    });

    this.vpnClient.on('error', (error) => {
      this.eventHandlers.error?.(error);
    });

    await this.vpnClient.initialize();
  }

  /**
   * Start monitoring certificate expiration
   */
  private startCertificateMonitoring(): void {
    if (this.certificateCheckInterval) {
      clearInterval(this.certificateCheckInterval);
    }

    // Check certificate every 6 hours
    this.certificateCheckInterval = setInterval(async () => {
      await this.checkCertificateExpiration();
    }, 6 * 60 * 60 * 1000);

    // Initial check
    this.checkCertificateExpiration().catch((error) => {
      this.logger.error('Certificate expiration check failed', { error });
    });
  }

  /**
   * Check if certificate is expiring soon
   */
  private async checkCertificateExpiration(): Promise<void> {
    if (!this.currentConfig) {
      return;
    }

    try {
      const isValid = await this.provisioningService.isCertificateValid(this.currentConfig);
      
      if (!isValid) {
        this.logger.warn('VPN certificate is no longer valid');
        
        if (this.config.autoProvision) {
          this.logger.info('Auto-provisioning new certificate');
          await this.provisionVPN();
          
          if (this.vpnClient && this.currentConfig) {
            const vpnClientOptions = {
              ...this.currentConfig,
              logger: this.logger,
              configDir: path.dirname(this.config.configFile),
              workingDir: path.dirname(this.config.configFile),
              binaryPath: process.env.VPN_BINARY_PATH || 'openvpn'
            };
            
            await this.vpnClient.updateConfig(vpnClientOptions);
          }
        }
      }
    } catch (error) {
      this.logger.error('Certificate expiration check failed', { error });
    }
  }

  /**
   * Load existing VPN configuration from file
   */
  private async loadExistingConfig(): Promise<VPNClientConfig | undefined> {
    try {
      const fs = await import('fs').then(m => m.promises);
      const configData = await fs.readFile(this.config.configFile, 'utf8');
      return JSON.parse(configData) as VPNClientConfig;
    } catch (error) {
      this.logger.debug('No existing VPN configuration found', { error });
      return undefined;
    }
  }

  /**
   * Save VPN configuration to file
   */
  private async saveConfiguration(config: VPNClientConfig): Promise<void> {
    const fs = await import('fs').then(m => m.promises);
    const path = await import('path');
    
    // Ensure directory exists
    const configDir = path.dirname(this.config.configFile);
    await fs.mkdir(configDir, { recursive: true });
    
    // Save configuration
    await fs.writeFile(
      this.config.configFile, 
      JSON.stringify(config, null, 2), 
      'utf8'
    );
  }

  /**
   * Clear saved VPN configuration
   */
  private async clearConfiguration(): Promise<void> {
    try {
      const fs = await import('fs').then(m => m.promises);
      await fs.unlink(this.config.configFile);
    } catch (error) {
      // Ignore error if file doesn't exist
      this.logger.debug('Failed to clear configuration file', { error });
    }
  }
}
