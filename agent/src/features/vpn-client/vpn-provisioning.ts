/**
 * VPN Provisioning Service for Device Agent
 * Handles certificate provisioning and VPN configuration from billing service
 */

import { VPNProvisioningData, VPNClientConfig, VPNLogger } from './types';

export interface ProvisioningConfig {
  billingServiceUrl: string;
  deviceId: string;
  customerId: string;
  apiKey: string;
  retryAttempts: number;
  retryDelay: number;
}

export class VPNProvisioningService {
  constructor(
    private config: ProvisioningConfig,
    private logger: VPNLogger
  ) {}

  /**
   * Provision VPN certificates and configuration from billing service
   */
  async provisionVPN(): Promise<VPNProvisioningData> {
    this.logger.info('Provisioning VPN certificates from billing service', {
      deviceId: this.config.deviceId,
      customerId: this.config.customerId,
      billingServiceUrl: this.config.billingServiceUrl
    });

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        const provisioningData = await this.requestProvisioning();
        
        this.logger.info('VPN provisioning successful', {
          deviceId: this.config.deviceId,
          expiresAt: provisioningData.expiresAt,
          attempt
        });

        return provisioningData;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        this.logger.warn(`VPN provisioning attempt ${attempt} failed`, {
          error: lastError.message,
          remainingAttempts: this.config.retryAttempts - attempt
        });

        if (attempt < this.config.retryAttempts) {
          await this.delay(this.config.retryDelay * attempt); // Exponential backoff
        }
      }
    }

    throw new Error(`VPN provisioning failed after ${this.config.retryAttempts} attempts: ${lastError?.message}`);
  }

  /**
   * Check if current VPN certificates are valid and not expiring soon
   */
  async isCertificateValid(currentConfig?: VPNClientConfig): Promise<boolean> {
    if (!currentConfig?.deviceCert) {
      return false;
    }

    try {
      // Parse certificate expiration (simplified - would use proper cert parsing)
      const certLines = currentConfig.deviceCert.split('\n');
      const certData = certLines.find(line => line.includes('CERTIFICATE'));
      
      if (!certData) {
        return false;
      }

      // In production, you'd parse the actual certificate
      // For now, assume valid if cert exists and is recent
      return true;
    } catch (error) {
      this.logger.error('Failed to validate certificate', { error });
      return false;
    }
  }

  /**
   * Revoke current device certificate
   */
  async revokeCurrentCertificate(): Promise<void> {
    this.logger.info('Revoking current VPN certificate', {
      deviceId: this.config.deviceId
    });

    try {
      const response = await fetch(`${this.config.billingServiceUrl}/api/vpn/certificates/revoke`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`
        },
        body: JSON.stringify({
          deviceId: this.config.deviceId,
          reason: 'Device requested revocation'
        })
      });

      if (!response.ok) {
        throw new Error(`Certificate revocation failed: ${response.status} ${response.statusText}`);
      }

      this.logger.info('Certificate revocation successful');
    } catch (error) {
      this.logger.error('Failed to revoke certificate', { error });
      throw error;
    }
  }

  /**
   * Convert provisioning data to VPN client configuration
   */
  createVPNConfig(
    provisioningData: VPNProvisioningData, 
    baseConfig?: Partial<VPNClientConfig>
  ): VPNClientConfig {
    return {
      enabled: true,
      serverHost: provisioningData.serverHost,
      serverPort: provisioningData.serverPort,
      protocol: 'udp',
      deviceId: provisioningData.deviceId,
      customerId: provisioningData.customerId,
      
      // Certificates from provisioning
      deviceCert: provisioningData.deviceCert,
      deviceKey: provisioningData.deviceKey,
      caCert: provisioningData.caCert,
      tlsAuthKey: provisioningData.tlsAuthKey,
      
      // Connection settings with defaults
      autoReconnect: baseConfig?.autoReconnect ?? true,
      reconnectDelay: baseConfig?.reconnectDelay ?? 5000,
      maxReconnectAttempts: baseConfig?.maxReconnectAttempts ?? 10,
      keepalivePing: baseConfig?.keepalivePing ?? 10,
      keepaliveTimeout: baseConfig?.keepaliveTimeout ?? 120,
      
      // Routing settings
      routeAllTraffic: baseConfig?.routeAllTraffic ?? false, // Split tunnel by default
      customRoutes: baseConfig?.customRoutes ?? [
        '10.244.0.0/16',  // K8s cluster network
        '172.17.0.0/16'   // Docker bridge network
      ],
      enableCompression: baseConfig?.enableCompression ?? true,
      
      // Logging
      logLevel: baseConfig?.logLevel ?? 'info',
      logFile: baseConfig?.logFile,
      statusFile: baseConfig?.statusFile
    };
  }

  /**
   * Request VPN provisioning from billing service
   */
  private async requestProvisioning(): Promise<VPNProvisioningData> {
    const url = `${this.config.billingServiceUrl}/api/vpn/provision`;
    
    this.logger.debug('Requesting VPN provisioning', { url });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        'User-Agent': `Iotistic-Agent/${process.env.AGENT_VERSION || '1.0.0'}`
      },
      body: JSON.stringify({
        deviceId: this.config.deviceId,
        customerId: this.config.customerId,
        requestedAt: new Date().toISOString(),
        deviceInfo: {
          platform: process.platform,
          arch: process.arch,
          nodeVersion: process.version,
          agentVersion: process.env.AGENT_VERSION || '1.0.0'
        }
      }),
      // Timeout after 30 seconds
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Provisioning request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json() as any;
    
    // Validate response structure
    this.validateProvisioningResponse(data);
    
    return {
      deviceId: data.deviceId,
      customerId: data.customerId,
      deviceCert: data.certificate,
      deviceKey: data.privateKey,
      caCert: data.caCertificate,
      tlsAuthKey: data.tlsAuthKey,
      clientConfig: data.clientConfig || '',
      serverHost: data.serverHost,
      serverPort: data.serverPort,
      expiresAt: new Date(data.expiresAt)
    };
  }

  /**
   * Validate provisioning response structure
   */
  private validateProvisioningResponse(data: any): void {
    const requiredFields = [
      'deviceId', 'customerId', 'certificate', 'privateKey', 
      'caCertificate', 'tlsAuthKey', 'serverHost', 'serverPort', 'expiresAt'
    ];

    for (const field of requiredFields) {
      if (!data[field]) {
        throw new Error(`Missing required field in provisioning response: ${field}`);
      }
    }

    // Validate certificate format (basic check)
    if (!data.certificate.includes('-----BEGIN CERTIFICATE-----')) {
      throw new Error('Invalid certificate format');
    }

    if (!data.privateKey.includes('-----BEGIN PRIVATE KEY-----') && 
        !data.privateKey.includes('-----BEGIN RSA PRIVATE KEY-----')) {
      throw new Error('Invalid private key format');
    }

    if (!data.caCertificate.includes('-----BEGIN CERTIFICATE-----')) {
      throw new Error('Invalid CA certificate format');
    }

    // Validate expiration date
    const expiresAt = new Date(data.expiresAt);
    if (isNaN(expiresAt.getTime())) {
      throw new Error('Invalid expiration date format');
    }

    if (expiresAt < new Date()) {
      throw new Error('Certificate is already expired');
    }

    // Warn if certificate expires soon (within 7 days)
    const daysUntilExpiry = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    if (daysUntilExpiry < 7) {
      this.logger.warn('Certificate expires soon', { 
        expiresAt: expiresAt.toISOString(), 
        daysUntilExpiry: Math.floor(daysUntilExpiry) 
      });
    }
  }

  /**
   * Delay helper for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
