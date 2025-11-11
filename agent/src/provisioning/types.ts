/**
 * Types for device provisioning in standalone container-manager
 * Implements two-phase authentication similar to Balena Supervisor
 */

export interface DeviceInfo {
	uuid: string;
	deviceId?: string;
	deviceName?: string;
	deviceType?: string;
	
	// Two-phase authentication keys
	deviceApiKey?: string;        // Device-specific key (permanent)
	provisioningApiKey?: string;  // Fleet/provisioning key (temporary)
	
	// Legacy field for backward compatibility
	apiKey?: string;
	
	apiEndpoint?: string;
	registeredAt?: number;
	provisioned: boolean;
	
	// Additional metadata
	applicationId?: number;
	macAddress?: string;
	osVersion?: string;
	agentVersion?: string;
	mqttUsername?: string;
	mqttPassword?: string;
	mqttBrokerUrl?: string;
}

export interface ProvisioningConfig {
	uuid?: string;
	deviceName?: string;
	deviceType?: string;
	apiEndpoint?: string;
	
	// Two-phase auth
	provisioningApiKey: string;   // Required: fleet-level key
	deviceApiKey?: string;         // Optional: if not provided, will be generated
	
	// Fleet configuration
	applicationId?: number;
	
	// Device metadata
	macAddress?: string;
	osVersion?: string;
	agentVersion?: string;
}

export interface ProvisionRequest {
	uuid: string;
	deviceName: string;
	deviceType: string;
	deviceApiKey: string;          // Pre-generated device key
	applicationId?: number;
	macAddress?: string;
	osVersion?: string;
	agentVersion?: string;
}

export interface ProvisionResponse {
	id: number;                    // Server-assigned device ID
	uuid: string;
	deviceName: string;
	deviceType: string;
	applicationId?: number;
	mqtt: {
		username: string,
		password: string,
		broker: string,
		topics: {
			publish: string,
			subscribe: string
		}
	}
	vpnConfig?: {
		enabled: boolean;
		ipAddress: string;
		wgConfig: string;  // Complete WireGuard config file content
	}
	createdAt: string;
}

export interface KeyExchangeRequest {
	uuid: string;
	deviceApiKey: string;
}

export interface KeyExchangeResponse {
	status: 'ok' | 'error';
	message: string;
	device?: {
		id: number;
		uuid: string;
		deviceName: string;
	};
}
