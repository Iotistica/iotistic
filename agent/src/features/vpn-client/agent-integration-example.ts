/**
 * Example: Integrating VPN Client with Main Agent
 * This shows how to add VPN functionality to your existing agent
 */

import { 
  VPNIntegration, 
  VPNIntegrationConfig, 
  VPNConnectionStatus, 
  VPNMetrics, 
  VPNClientConfig 
} from './index';
import * as path from 'path';

export class Agent {
  private vpn?: VPNIntegration;
  private deviceId: string;
  private customerId: string;
  private dataDir: string;
  private logger: any; // Your existing logger

  constructor(deviceId: string, customerId: string, dataDir: string, logger: any) {
    this.deviceId = deviceId;
    this.customerId = customerId;
    this.dataDir = dataDir;
    this.logger = logger;
  }

  /**
   * Initialize agent with VPN support
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing agent with VPN support');

    // ... existing agent initialization code ...

    // Initialize VPN if enabled
    if (this.isVPNEnabled()) {
      await this.initializeVPN();
    }
  }

  /**
   * Start agent services
   */
  async start(): Promise<void> {
    this.logger.info('Starting agent services');

    // ... existing service startup code ...

    // Start VPN connection
    if (this.vpn?.isEnabled()) {
      try {
        await this.vpn.start();
        this.logger.info('VPN connection established');
      } catch (error) {
        this.logger.error('Failed to start VPN connection', { error });
        // Continue without VPN (fallback to existing connectivity)
      }
    }
  }

  /**
   * Stop agent services gracefully
   */
  async stop(): Promise<void> {
    this.logger.info('Stopping agent services');

    // Stop VPN first
    if (this.vpn) {
      try {
        await this.vpn.stop();
        this.logger.info('VPN connection stopped');
      } catch (error) {
        this.logger.error('Error stopping VPN', { error });
      }
    }

    // ... existing service shutdown code ...
  }

  /**
   * Shutdown agent completely
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down agent');

    await this.stop();

    // Cleanup VPN resources
    if (this.vpn) {
      try {
        await this.vpn.shutdown();
        this.vpn = undefined;
        this.logger.info('VPN integration shutdown complete');
      } catch (error) {
        this.logger.error('Error during VPN shutdown', { error });
      }
    }

    // ... existing cleanup code ...
  }

  /**
   * Get comprehensive agent status including VPN
   */
  getStatus(): any {
    const status = {
      // ... existing status fields ...
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      
      // VPN status
      vpn: this.vpn ? {
        enabled: this.vpn.isEnabled(),
        connected: this.vpn.isConnected(),
        status: this.vpn.getStatus(),
        metrics: this.vpn.getMetrics()
      } : {
        enabled: false,
        connected: false,
        status: null,
        metrics: null
      }
    };

    return status;
  }

  /**
   * Initialize VPN integration
   */
  private async initializeVPN(): Promise<void> {
    const vpnConfig: VPNIntegrationConfig = {
      enabled: true,
      billingServiceUrl: process.env.BILLING_SERVICE_URL || 'https://billing.iotistic.cloud',
      deviceId: this.deviceId,
      customerId: this.customerId,
      apiKey: process.env.DEVICE_API_KEY!,
      configFile: path.join(this.dataDir, 'vpn', 'config.json'),
      logFile: path.join(this.dataDir, 'vpn', 'openvpn.log'),
      statusFile: path.join(this.dataDir, 'vpn', 'status.log'),
      autoProvision: true,
      provisioningRetryAttempts: 3,
      provisioningRetryDelay: 5000,
      baseConfig: {
        logLevel: (process.env.VPN_LOG_LEVEL as any) || 'info',
        autoReconnect: true,
        reconnectDelay: 5000,
        maxReconnectAttempts: 10,
        keepalivePing: 10,
        keepaliveTimeout: 120,
        routeAllTraffic: false, // Split tunneling by default
        customRoutes: [
          '10.244.0.0/16',  // K8s cluster network
          '172.17.0.0/16'   // Docker bridge network
        ],
        enableCompression: true
      }
    };

    this.vpn = new VPNIntegration(vpnConfig, this.logger);

    // Register VPN event handlers
    this.setupVPNEventHandlers();

    try {
      await this.vpn.initialize();
      this.logger.info('VPN integration initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize VPN integration', { error });
      // Continue without VPN - don't fail agent startup
      this.vpn = undefined;
    }
  }

  /**
   * Setup VPN event handlers
   */
  private setupVPNEventHandlers(): void {
    if (!this.vpn) return;

    this.vpn.on('statusChanged', (status: VPNConnectionStatus) => {
      this.logger.info('VPN status changed', status);
      
      // Emit agent-level event for external monitoring
      this.emit('vpnStatusChanged', status);
    });

    this.vpn.on('metricsUpdated', (metrics: VPNMetrics) => {
      this.logger.debug('VPN metrics updated', metrics);
      
      // Could integrate with existing metrics collection
      this.recordVPNMetrics(metrics);
    });

    this.vpn.on('error', (error: Error) => {
      this.logger.error('VPN error occurred', { error: error.message });
      
      // Could trigger alerts or fallback connectivity
      this.handleVPNError(error);
    });

    this.vpn.on('provisioned', (config: VPNClientConfig) => {
      this.logger.info('VPN certificate provisioned', {
        deviceId: config.deviceId,
        customerId: config.customerId,
        serverHost: config.serverHost
      });
    });

    this.vpn.on('certificateExpiring', (expiresAt: Date, daysRemaining: number) => {
      this.logger.warn('VPN certificate expiring soon', {
        expiresAt: expiresAt.toISOString(),
        daysRemaining
      });
      
      // Could trigger proactive certificate renewal
    });
  }

  /**
   * Check if VPN is enabled via environment
   */
  private isVPNEnabled(): boolean {
    return process.env.VPN_ENABLED === 'true';
  }

  /**
   * Record VPN metrics (integrate with existing metrics system)
   */
  private recordVPNMetrics(metrics: any): void {
    // Example: Send to existing metrics collector
    // this.metricsCollector.record('vpn.uptime', metrics.connectionUptime);
    // this.metricsCollector.record('vpn.bytes_received', metrics.totalBytesReceived);
    // this.metricsCollector.record('vpn.bytes_sent', metrics.totalBytesSent);
    // this.metricsCollector.record('vpn.latency', metrics.averageLatency);
  }

  /**
   * Handle VPN errors (integrate with existing error handling)
   */
  private handleVPNError(error: Error): void {
    // Example: Fallback to SSH tunnels
    // if (error.message.includes('connection refused')) {
    //   this.logger.info('VPN failed, falling back to SSH tunnel');
    //   this.enableSSHTunnel();
    // }
    
    // Example: Alert external monitoring
    // this.alertingService.sendAlert('VPN connection failed', error);
  }

  /**
   * Manually provision new VPN certificate
   */
  async provisionVPNCertificate(): Promise<void> {
    if (!this.vpn) {
      throw new Error('VPN integration not initialized');
    }

    await this.vpn.provisionVPN();
  }

  /**
   * Manually revoke VPN certificate (for security)
   */
  async revokeVPNCertificate(): Promise<void> {
    if (!this.vpn) {
      throw new Error('VPN integration not initialized');
    }

    await this.vpn.revokeCertificate();
  }

  /**
   * Health check including VPN connectivity
   */
  async healthCheck(): Promise<any> {
    const health = {
      // ... existing health checks ...
      vpn: null as any
    };

    if (this.vpn?.isEnabled()) {
      try {
        health.vpn = await this.vpn.getMetrics();
      } catch (error) {
        health.vpn = { error: error instanceof Error ? error.message : String(error) };
      }
    }

    return health;
  }

  // EventEmitter methods (if your agent extends EventEmitter)
  emit(event: string, ...args: any[]): boolean {
    // Your existing event emission logic
    return true;
  }
}

// Example usage
async function main() {
  const agent = new Agent(
    process.env.DEVICE_ID || 'device-123',
    process.env.CUSTOMER_ID || 'customer-abc',
    process.env.DATA_DIR || '/app/data',
    console // Replace with your logger
  );

  // Graceful shutdown handling
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully');
    await agent.shutdown();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully');
    await agent.shutdown();
    process.exit(0);
  });

  try {
    await agent.initialize();
    await agent.start();
    
    console.log('Agent started successfully');
    console.log('Agent status:', JSON.stringify(agent.getStatus(), null, 2));
  } catch (error) {
    console.error('Failed to start agent:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}
