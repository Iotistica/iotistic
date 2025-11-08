/**
 * ORCHESTRATOR ABSTRACTION TYPES
 * ================================
 * 
 * Common types used across all orchestrator drivers (Docker, K3s, etc.)
 * This allows the agent to work with any container orchestration platform
 * using a unified interface.
 */

import type { Stream } from 'stream';

// ============================================================================
// COMMON TYPES (shared across all drivers)
// ============================================================================

/**
 * Container service definition - driver-agnostic
 */
export interface ServiceConfig {
	serviceId: number;
	serviceName: string;
	imageName: string;
	appId: number;
	appName: string;
	
	// Desired container state (Docker-native approach)
	// "running" = container should be running (default)
	// "stopped" = container exists but stopped (docker stop)
	// "paused" = container frozen/suspended (docker pause)
	// undefined = defaults to "running"
	state?: 'running' | 'stopped' | 'paused';

	// Container configuration
	config: {
		image: string;
		environment?: Record<string, string>;
		ports?: string[]; // e.g., ["80:80", "443:443"]
		volumes?: string[]; // e.g., ["data:/var/lib/data"]
		networks?: string[]; // e.g., ["frontend", "backend"]
		networkMode?: string;
		restart?: string;
		labels?: Record<string, string>;
		command?: string[];
		entrypoint?: string[];
		workingDir?: string;
		user?: string;
		hostname?: string;
		domainname?: string;
		
		// Resource limits (K8s-style)
		resources?: {
			limits?: {
				cpu?: string;    // e.g., "0.5" = 50% of 1 CPU, "2" = 2 CPUs
				memory?: string; // e.g., "512M", "1G", "256Mi"
			};
			requests?: {
				cpu?: string;
				memory?: string;
			};
		};
		
		// Health probes (K8s-style)
		livenessProbe?: HealthProbe;
		readinessProbe?: HealthProbe;
		startupProbe?: HealthProbe;
	};

	// Runtime state
	containerId?: string;
	status?: ServiceStatus;
	
	// Error tracking
	serviceStatus?: 'pending' | 'running' | 'stopped' | 'error';
	error?: ServiceError;
}

/**
 * Health probe configuration
 */
export interface HealthProbe {
	type: 'http' | 'tcp' | 'exec';
	
	// HTTP specific
	path?: string;
	port?: number;
	scheme?: 'http' | 'https';
	headers?: Record<string, string>;
	expectedStatus?: number[];
	
	// TCP specific
	tcpPort?: number;
	
	// Exec specific
	command?: string[];
	
	// Common settings
	initialDelaySeconds?: number;
	periodSeconds?: number;
	timeoutSeconds?: number;
	successThreshold?: number;
	failureThreshold?: number;
}

/**
 * Service status information
 */
export interface ServiceStatus {
	state: 'creating' | 'running' | 'stopped' | 'error' | 'unknown';
	startedAt?: Date;
	finishedAt?: Date;
	exitCode?: number;
	restartCount?: number;
	health?: 'healthy' | 'unhealthy' | 'starting' | 'unknown';
	message?: string;
}

/**
 * Service error information
 */
export interface ServiceError {
	type: 'ImagePullBackOff' | 'ErrImagePull' | 'StartFailure' | 'CrashLoopBackOff' | 'Unknown';
	message: string;
	timestamp: string;
	retryCount: number;
	nextRetry?: string;
}

/**
 * Application definition
 */
export interface AppConfig {
	appId: number;
	appName: string;
	appUuid?: string;
	services: ServiceConfig[];
	networks?: NetworkConfig[];
	volumes?: VolumeConfig[];
}

/**
 * Network configuration
 */
export interface NetworkConfig {
	name: string;
	driver?: string;
	internal?: boolean;
	ipam?: {
		driver: string;
		config: Array<{
			subnet?: string;
			gateway?: string;
		}>;
	};
}

/**
 * Volume configuration
 */
export interface VolumeConfig {
	name: string;
	driver?: string;
	labels?: Record<string, string>;
	driverOpts?: Record<string, string>;
}

/**
 * Target state for orchestrator
 */
export interface TargetState {
	local?: {
		apps?: Record<string, AppConfig>;
	};
	config?: {
		settings?: {
			// Orchestrator selection
			orchestrator?: 'docker' | 'k3s';
			
			// Orchestrator-specific config
			k3s?: {
				kubeconfigPath?: string;
				namespace?: string;
				inCluster?: boolean;
			};
			
			// Interval configurations
			reconciliationIntervalMs?: number;
			targetStatePollIntervalMs?: number;
			deviceReportIntervalMs?: number;
			metricsIntervalMs?: number;
			cloudJobsPollingIntervalMs?: number;
			shadowPublishIntervalMs?: number;
		};
		features?: {
			enableCloudJobs?: boolean;
			enableJobEngine?: boolean;
			enableDeviceJobs?: boolean;
			enableShadow?: boolean;
			enableLogs?: boolean;
		};
		logging?: {
			level?: string;
		};
	};
}

/**
 * Current state from orchestrator
 */
export interface CurrentState {
	apps: Record<string, AppConfig>;
	timestamp: Date;
}

/**
 * Log stream options
 */
export interface LogStreamOptions {
	follow?: boolean;
	tail?: number;
	since?: Date;
	timestamps?: boolean;
	stdout?: boolean;
	stderr?: boolean;
}

/**
 * Container metrics
 */
export interface ContainerMetrics {
	containerId: string;
	serviceName: string;
	cpu: {
		usage: number; // Percentage
		cores?: number;
	};
	memory: {
		usage: number; // Bytes
		limit?: number; // Bytes
		percentage?: number;
	};
	network?: {
		rxBytes: number;
		txBytes: number;
	};
	timestamp: Date;
}

/**
 * Reconciliation result
 */
export interface ReconciliationResult {
	success: boolean;
	servicesCreated: number;
	servicesUpdated: number;
	servicesRemoved: number;
	errors: Array<{
		serviceName: string;
		error: string;
	}>;
	timestamp: Date;
}

// ============================================================================
// CONFIG MANAGEMENT TYPES
// ============================================================================

/**
 * Protocol adapter device configuration
 */
export interface ProtocolAdapterDevice {
	id: string;
	name: string;
	protocol: string;
	connectionString: string;
	pollInterval: number;
	enabled: boolean;
	metadata?: Record<string, any>;
}

/**
 * Device configuration state
 */
export interface DeviceConfig {
	sensors?: ProtocolAdapterDevice[];
	features?: Record<string, any>;
	[key: string]: any;
}

/**
 * Config reconciliation step
 */
export interface ConfigStep {
	action: 'registerDevice' | 'unregisterDevice' | 'updateDevice';
	device?: ProtocolAdapterDevice;
	deviceId?: string;
}

/**
 * Config reconciliation result
 */
export interface ConfigReconciliationResult {
	success: boolean;
	devicesRegistered: number;
	devicesUpdated: number;
	devicesUnregistered: number;
	errors: Array<{
		deviceId: string;
		error: string;
	}>;
	timestamp: Date;
}
