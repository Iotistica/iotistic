/**
 * VPN Client Feature Module
 * Export all VPN client components for integration with agent
 */

export { VPNClientManager } from './vpn-client-manager';
export { VPNProvisioningService } from './vpn-provisioning';
export { VPNIntegration } from './vpn-integration';

export type {
  VPNClientConfig,
  VPNClientOptions,
  VPNConnectionStatus,
  VPNMetrics,
  VPNHealthCheck,
  VPNProvisioningData,
  VPNClientEvents,
  VPNLogger,
  OpenVPNLogEntry,
  NetworkInterface
} from './types';

export type {
  VPNIntegrationConfig,
  VPNIntegrationEvents
} from './vpn-integration';

export type {
  ProvisioningConfig
} from './vpn-provisioning';
