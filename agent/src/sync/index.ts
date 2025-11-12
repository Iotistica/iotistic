/**
 * API BINDER - Device ↔ Cloud Communication
 * ==========================================
 * 
 * Implements balena-supervisor style communication pattern:
 * 1. POLL cloud for target state (what SHOULD be running)
 * 2. REPORT current state + metrics to cloud (what IS running)
 * 
 * Features:
 * - ETag caching to avoid unnecessary downloads
 * - Diff-based reporting (only send what changed)
 * - Rate limiting (10s for state, 5min for metrics)
 * - Exponential backoff with jitter on errors
 * - State caching to survive restarts
 * - Connection monitoring (online/offline tracking)
 * - Offline queue for failed reports
 */

import { EventEmitter } from 'events';
import { gzip } from 'zlib';
import { promisify } from 'util';
import type { StateReconciler, DeviceState } from '../drivers/state-reconciler';
import type { DeviceManager } from '../provisioning';
import * as systemMetrics from '../system/metrics';
import { ConnectionMonitor } from '../network/connection-monitor';
import { OfflineQueue } from '../logging/offline-queue';
import type { AgentLogger } from '../logging/agent-logger';
import { buildDeviceEndpoint, buildApiEndpoint } from '../utils/api-utils';
import { HttpClient, FetchHttpClient } from '../lib/http-client';
import { RetryPolicy } from '../utils/retry-policy';

const gzipAsync = promisify(gzip);

interface DeviceStateReport {
	[deviceUuid: string]: {
		apps: { [appId: string]: any };
		config?: { [key: string]: any };
		version?: number; // Which target_state version this device has applied
		cpu_usage?: number;
		memory_usage?: number;
	memory_total?: number;
	storage_usage?: number;
	storage_total?: number;
	temperature?: number;
	is_online?: boolean;
	local_ip?: string;
	os_version?: string;
	agent_version?: string;
	uptime?: number;
		top_processes?: Array<{
			pid: number;
			name: string;
			cpu: number;
			mem: number;
			command?: string;
		}>;
		network_interfaces?: Array<{
			name: string;
			ip4: string | null;
			ip6: string | null;
			mac: string | null;
			type: string | null;
			default: boolean;
			virtual: boolean;
			operstate: string | null;
			ssid?: string;
			signalLevel?: number;
		}>;
	};
}

interface ApiBinderConfig {
	cloudApiEndpoint: string;
	pollInterval?: number; // Default: 60000ms (60s)
	reportInterval?: number; // Default: 10000ms (10s)
	metricsInterval?: number; // Default: 300000ms (5min)
	apiTimeout?: number; // Default: 30000ms (30s)
}

interface TargetStateResponse {
	[deviceUuid: string]: {
		apps: { [appId: string]: any };
		config?: { [key: string]: any };
		version?: number;
		needs_deployment?: boolean;
		last_deployed_at?: string;
	};
}

export class ApiBinder extends EventEmitter {
	private stateReconciler: StateReconciler;
	private deviceManager: DeviceManager;
	private config: Required<ApiBinderConfig>;
	private httpClient: HttpClient;
	
	// State management
	private targetState: DeviceState = { apps: {}, config: {} };
	private currentVersion: number = 0; // Track which version we've applied
	private lastReport: DeviceStateReport = {};
	private lastReportTime: number = -Infinity;
	private lastMetricsTime: number = -Infinity;
	
	// Static field tracking (only send when changed)
	private lastOsVersion?: string;
	private lastAgentVersion?: string;
	private lastLocalIp?: string;
	
	// ETag caching for target state
	private targetStateETag?: string;
	
	// Polling control
	private pollTimer?: NodeJS.Timeout;
	private reportTimer?: NodeJS.Timeout;
	private isPolling: boolean = false;
	private isReporting: boolean = false;
	
	// Error tracking (kept for compatibility)
	private pollErrors: number = 0;
	private reportErrors: number = 0;
	
	// Connection monitoring & offline queue
	private connectionMonitor: ConnectionMonitor;
	private reportQueue: OfflineQueue<DeviceStateReport>;
	private logger?: AgentLogger;
	private sensorPublish?: any; // Optional sensor-publish feature for health reporting
	private protocolAdapters?: any; // Optional protocol-adapters feature for health reporting
	private mqttManager?: any; // Optional MQTT manager for state reporting
	
	constructor(
		stateReconciler: StateReconciler,
		deviceManager: DeviceManager,
		config: ApiBinderConfig,
		logger?: AgentLogger,
		sensorPublish?: any,
		protocolAdapters?: any,
		mqttManager?: any,
		httpClient?: HttpClient  // NEW: Inject HTTP client for testability
	) {
		super();
		this.stateReconciler = stateReconciler;
		this.deviceManager = deviceManager;
		this.logger = logger;
		this.sensorPublish = sensorPublish;
		this.protocolAdapters = protocolAdapters;
		this.mqttManager = mqttManager;
		this.httpClient = httpClient || new FetchHttpClient(); // Default to real fetch
		
		// Set defaults
		this.config = {
			cloudApiEndpoint: config.cloudApiEndpoint,
			pollInterval: config.pollInterval || 60000, // 60s
			reportInterval: config.reportInterval || 10000, // 10s
			metricsInterval: config.metricsInterval || 300000, // 5min
			apiTimeout: config.apiTimeout || 30000, // 30s
		};
		
		// Initialize connection monitor (with logger)
		this.connectionMonitor = new ConnectionMonitor(logger);
		
		// Initialize offline queue for reports
		this.reportQueue = new OfflineQueue<DeviceStateReport>('state-reports', 1000);
		
		// Listen to connection events
		this.setupConnectionEventListeners();
	}
	
	/**
	 * Setup connection event listeners
	 */
	private setupConnectionEventListeners(): void {
		this.connectionMonitor.on('online', () => {
			this.logger?.infoSync('Connection restored - flushing offline queue', { 
				component: 'Synch',
				queueSize: this.reportQueue.size()
			});
			this.flushOfflineQueue().catch(error => {
				this.logger?.errorSync('Failed to flush offline queue', error instanceof Error ? error : new Error(String(error)), {
					component: 'Sync'
				});
			});
		});
		
		this.connectionMonitor.on('offline', () => {
			const health = this.connectionMonitor.getHealth();
			this.logger?.errorSync('Connection lost', undefined, {
				component: 'Sync',
				offlineDurationSeconds: Math.floor(health.offlineDuration / 1000),
				status: health.status,
				pollSuccessRate: health.pollSuccessRate,
				reportSuccessRate: health.reportSuccessRate,
				note: 'Reports will be queued until connection is restored'
			});
		});
		
		this.connectionMonitor.on('degraded', () => {
			this.logger?.warnSync('Connection degraded (experiencing failures)', {
				component: 'Sync'
			});
		});
	}
	
	/**
	 * Start polling cloud for target state
	 */
	public async startPoll(): Promise<void> {
		if (this.isPolling) {
			this.logger?.warnSync('API Binder already polling', { component: 'Sync' });
			return;
		}
		
		// Initialize offline queue
		await this.reportQueue.init();
		
		this.isPolling = true;
		this.logger?.infoSync('Starting target state polling', {
			component: 'Sync',
			endpoint: this.config.cloudApiEndpoint,
			intervalMs: this.config.pollInterval
		});
		
		// Start polling loop
		await this.pollLoop();
	}
	
	/**
	 * Start reporting current state to cloud
	 */
	public async startReporting(): Promise<void> {
		if (this.isReporting) {
			this.logger?.warnSync('API Binder already reporting', { component: 'Sync' });
			return;
		}
		
		this.isReporting = true;
		this.logger?.infoSync('Starting state reporting', {
			component: 'Sync',
			endpoint: this.config.cloudApiEndpoint,
			intervalMs: this.config.reportInterval
		});
		
		// Listen for state changes from reconciler
		this.stateReconciler.on('reconciliation-complete', () => {
			this.scheduleReport('state-change');
		});
		
		// Start reporting loop
		await this.reportLoop();
	}
	
	/**
	 * Stop polling and reporting
	 */
	public async stop(): Promise<void> {
		this.logger?.infoSync('Stopping API Binder', { component: 'Sync' });
		
		this.isPolling = false;
		this.isReporting = false;
		
		if (this.pollTimer) {
			clearTimeout(this.pollTimer);
		}
		if (this.reportTimer) {
			clearTimeout(this.reportTimer);
		}
		
		this.removeAllListeners();
	}
	
	/**
	 * Get current target state
	 */
	public getTargetState(): DeviceState {
		return this.targetState;
	}
	
	/**
	 * Get connection health
	 */
	public getConnectionHealth() {
		return this.connectionMonitor.getHealth();
	}
	
	/**
	 * Check if currently online
	 */
	public isOnline(): boolean {
		return this.connectionMonitor.isOnline();
	}
	
	// ============================================================================
	// POLLING LOGIC
	// ============================================================================
	
	private async pollLoop(): Promise<void> {
		if (!this.isPolling) {
			return;
		}
		
		try {
			await this.pollTargetState();
			this.pollErrors = 0; // Reset on success
			this.connectionMonitor.markSuccess('poll'); // Track success
		} catch (error) {
			this.pollErrors++;
			this.connectionMonitor.markFailure('poll', error as Error); // Track failure
			this.logger?.errorSync('Failed to poll target state', error instanceof Error ? error : new Error(String(error)), {
				component: 'Sync',
				operation: 'poll',
				errorCount: this.pollErrors
			});
		}
		
		// Calculate next poll interval (exponential backoff with jitter on errors)
		let interval: number;
		if (this.pollErrors > 0) {
			// Use retry policy helper for exponential backoff with jitter
			interval = RetryPolicy.calculateBackoffWithJitter(
				this.pollErrors,
				15000,           // Base delay: 15s
				2,               // Backoff multiplier: 2x
				15 * 60 * 1000,  // Max delay: 15 minutes
				0.3              // Jitter: ±30%
			);
			
			this.logger?.debugSync('Poll backing off due to errors', {
				component: 'Sync',
				backoffSeconds: Math.floor(interval / 1000),
				attempt: this.pollErrors
			});
		} else {
			interval = this.config.pollInterval;
		}
		
		// Schedule next poll
		this.pollTimer = setTimeout(() => this.pollLoop(), interval);
	}
	
	private async pollTargetState(): Promise<void> {
		const deviceInfo = this.deviceManager.getDeviceInfo();
		
		if (!deviceInfo.provisioned) {
			this.logger?.debugSync('Device not provisioned, skipping target state poll', {
				component: 'Sync',
				operation: 'poll'
			});
			return;
		}
		
		const endpoint = buildDeviceEndpoint(this.config.cloudApiEndpoint, deviceInfo.uuid, '/state');
		
		try {
			this.logger?.debugSync('Polling target state', {
				component: 'Sync',
				operation: 'poll',
				endpoint,
				currentETag: this.targetStateETag || 'none'
			});
			
			// Use injected HTTP client instead of global fetch
			const response = await this.httpClient.get(endpoint, {
				headers: {
					'Content-Type': 'application/json',
					'X-Device-API-Key': deviceInfo.apiKey || '',
					...(this.targetStateETag && { 'if-none-match': this.targetStateETag }),
				},
				timeout: this.config.apiTimeout
			});
		
			this.logger?.debugSync('Poll response received', {
				component: 'Sync',
				operation: 'poll',
				status: response.status
			});
		
			// 304 Not Modified - target state unchanged
			if (response.status === 304) {
				return;
			}
		
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
		
		// Get ETag for next request
		const etag = response.headers.get('etag');
		this.logger?.debugSync('ETag received from server', {
			component: 'Sync',
			operation: 'poll',
			etag: etag || 'none'
		});
		if (etag) {
			this.targetStateETag = etag;
		}
		
		// Parse response
		const targetStateResponse = await response.json() as TargetStateResponse;

		const deviceState = targetStateResponse[deviceInfo.uuid];
		
		if (!deviceState) {
			this.logger?.warnSync('No target state for this device in response', {
				component: 'Sync',
				operation: 'poll',
				deviceUuid: deviceInfo.uuid,
				availableUUIDs: Object.keys(targetStateResponse)
			});
			return;
		}			
		
		// Extract version from response  
		const targetVersion = deviceState.version || 1;
		
		// Always update currentVersion to match target, even if state unchanged
		// This ensures version tracking works after agent restarts
		this.currentVersion = targetVersion;
		
		// Check if target state changed
		const newTargetState: DeviceState = { 
			apps: deviceState.apps || {},
			config: deviceState.config || {}
		};
	
	
	// Compare states to detect changes
	const currentStateStr = JSON.stringify(this.targetState);
	const newStateStr = JSON.stringify(newTargetState);
	
	if (currentStateStr !== newStateStr) {
			this.logger?.infoSync('New target state received from cloud', {
				component: 'Sync',
				operation: 'poll',
				deviceStateKeys: Object.keys(deviceState),
				version: targetVersion,
				appCount: Object.keys(newTargetState.apps).length,
				configKeyCount: Object.keys(newTargetState.config || {}).length,
				sensorsCount: deviceState.config?.sensors?.length || 0,
		        newTargetStateApps: Object.keys(newTargetState.apps).length,
		        newTargetStateConfigKeys: Object.keys(newTargetState.config || {}).length,
				hasChanges: true
			});
			
			this.targetState = newTargetState;
			
			// Apply target state to state reconciler (handles both containers and config)
			await this.stateReconciler.setTarget(this.targetState);
			
			// Trigger reconciliation
			this.emit('target-state-changed', this.targetState);
			
			this.logger?.infoSync('Target state applied', {
				component: 'Sync',
				operation: 'apply-state',
				version: this.currentVersion
			});
		} else {
			this.logger?.debugSync('Target state fetched (no changes)', {
				component: 'Sync',
				operation: 'poll',
				version: this.currentVersion
			});
		}		} catch (error) {
			if ((error as Error).name === 'AbortError') {
				throw new Error('Target state poll timeout');
			}
			throw error;
		}
	}
	
	// ============================================================================
	// REPORTING LOGIC
	// ============================================================================
	
	private async reportLoop(): Promise<void> {
		if (!this.isReporting) {
			return;
		}
		
		try {
			await this.reportCurrentState();
			this.reportErrors = 0; // Reset on success
			this.connectionMonitor.markSuccess('report'); // Track success
			
			// Try to flush offline queue after successful report
			if (!this.reportQueue.isEmpty()) {
				await this.flushOfflineQueue();
			}
		} catch (error) {
			this.reportErrors++;
			this.connectionMonitor.markFailure('report', error as Error); // Track failure
			this.logger?.errorSync('Failed to report current state', error instanceof Error ? error : new Error(String(error)), {
				component: 'Sync',
				operation: 'report',
				errorCount: this.reportErrors
			});
		}
		
		// Calculate next report interval (exponential backoff with jitter on errors)
		let interval: number;
		if (this.reportErrors > 0) {
			// Use retry policy helper for exponential backoff with jitter
			interval = RetryPolicy.calculateBackoffWithJitter(
				this.reportErrors,
				15000,           // Base delay: 15s
				2,               // Backoff multiplier: 2x
				15 * 60 * 1000,  // Max delay: 15 minutes
				0.3              // Jitter: ±30%
			);
			
			this.logger?.debugSync('Report backing off due to errors', {
				component: 'Sync',
				backoffSeconds: Math.floor(interval / 1000),
				attempt: this.reportErrors
			});
		} else {
			interval = this.config.reportInterval;
		}
		
		// Schedule next report
		this.reportTimer = setTimeout(() => this.reportLoop(), interval);
	}
	
	private scheduleReport(reason: 'state-change' | 'metrics' | 'scheduled'): void {
		// Just emit event, actual reporting happens in reportLoop
		this.emit('report-scheduled', reason);
	}
	
	/**
	 * Strip unnecessary data from report before queueing for offline storage
	 * Removes verbose environment variables, labels, and duplicate metrics
	 * to reduce storage footprint and bandwidth when queue is flushed.
	 */
	private stripReportForQueue(report: DeviceStateReport): DeviceStateReport {
		const stripped: DeviceStateReport = {};
		
		for (const [uuid, deviceState] of Object.entries(report)) {
			stripped[uuid] = {
				apps: {},
				is_online: deviceState.is_online,
			};
			
			// Copy config (already minimal)
			if (deviceState.config) {
				stripped[uuid].config = deviceState.config;
			}
			
			// Copy static fields if present
			if (deviceState.os_version !== undefined) {
				stripped[uuid].os_version = deviceState.os_version;
			}
			if (deviceState.agent_version !== undefined) {
				stripped[uuid].agent_version = deviceState.agent_version;
			}
			if (deviceState.local_ip !== undefined) {
				stripped[uuid].local_ip = deviceState.local_ip;
			}
			
			// Strip verbose data from apps/services
			if (deviceState.apps) {
				for (const [appId, app] of Object.entries(deviceState.apps)) {
					stripped[uuid].apps[appId] = {
						appId: app.appId,
						appName: app.appName,
						services: app.services.map((svc: any) => ({
							appId: svc.appId,
							appName: svc.appName,
							serviceId: svc.serviceId,
							serviceName: svc.serviceName,
							status: svc.status,
							containerId: svc.containerId,
							imageName: svc.imageName,
							// Strip config.environment (verbose, rarely changes)
							// Strip config.labels (redundant metadata)
							config: {
								image: svc.config.image,
								restart: svc.config.restart,
								networkMode: svc.config.networkMode,
								ports: svc.config.ports,
								volumes: svc.config.volumes,
								networks: svc.config.networks,
								// environment: STRIPPED (50-100 lines per service)
								// labels: STRIPPED (redundant)
							}
						}))
					};
				}
			}
			
			// Include metrics only if present (but strip top_processes if queue gets large)
			if (deviceState.cpu_usage !== undefined) {
				stripped[uuid].cpu_usage = deviceState.cpu_usage;
			}
			if (deviceState.memory_usage !== undefined) {
				stripped[uuid].memory_usage = deviceState.memory_usage;
			}
			if (deviceState.memory_total !== undefined) {
				stripped[uuid].memory_total = deviceState.memory_total;
			}
			if (deviceState.storage_usage !== undefined) {
				stripped[uuid].storage_usage = deviceState.storage_usage;
			}
			if (deviceState.storage_total !== undefined) {
				stripped[uuid].storage_total = deviceState.storage_total;
			}
			if (deviceState.temperature !== undefined) {
				stripped[uuid].temperature = deviceState.temperature;
			}
			if (deviceState.uptime !== undefined) {
				stripped[uuid].uptime = deviceState.uptime;
			}
			
			// Strip top_processes (most verbose: 10 processes × 4 fields = 40 fields per report)
			// When queue has multiple reports, this becomes huge waste
			// The API doesn't need historical top_processes - only latest matters
			// Savings: ~2-5 KB per report depending on process names
		}
		
		return stripped;
	}
	
	private async reportCurrentState(): Promise<void> {
		const deviceInfo = this.deviceManager.getDeviceInfo();
		
		if (!deviceInfo.provisioned) {
			this.logger?.debugSync('Device not provisioned, skipping state report', {
				component: 'Sync',
				operation: 'report'
			});
			return;
		}
		
		const now = Date.now();
		
		// Check if we should report (rate limiting)
		const timeSinceLastReport = now - this.lastReportTime;
		const timeSinceLastMetrics = now - this.lastMetricsTime;
		
		if (timeSinceLastReport < this.config.reportInterval) {
			// Too soon to report
			return;
		}
		
		// Build current state report
		const currentState = await this.stateReconciler.getCurrentState();
		
		// Log what we're about to report (info level for visibility)
		this.logger?.infoSync('Current state config fields', {
			component: 'Sync',
			operation: 'report-debug',
			configKeys: Object.keys(currentState.config || {}),
			sensorCount: ((currentState.config as any)?.sensors || []).length,
			hasLogging: !!(currentState.config as any)?.logging,
			hasFeatures: !!(currentState.config as any)?.features,
			hasSettings: !!(currentState.config as any)?.settings,
		});
		
		// Get metrics if interval elapsed
		const includeMetrics = timeSinceLastMetrics >= this.config.metricsInterval;
		
		// Detect changes in static fields (bandwidth optimization)
		const osVersionChanged = deviceInfo.osVersion !== this.lastOsVersion;
		const agentVersionChanged = deviceInfo.agentVersion !== this.lastAgentVersion;
		
		// Build base state report (always include)
		const stateReport: DeviceStateReport = {
			[deviceInfo.uuid]: {
				apps: currentState.apps,
				config: currentState.config,
				is_online: this.connectionMonitor.isOnline(),
				version: this.currentVersion, // Report which version we've applied
			},
		};
		
		// Only include static fields if changed (bandwidth optimization)
		if (osVersionChanged || this.lastOsVersion === undefined) {
			stateReport[deviceInfo.uuid].os_version = deviceInfo.osVersion;
			this.lastOsVersion = deviceInfo.osVersion;
		}
		if (agentVersionChanged || this.lastAgentVersion === undefined) {
			stateReport[deviceInfo.uuid].agent_version = deviceInfo.agentVersion;
			this.lastAgentVersion = deviceInfo.agentVersion;
		}
		
		// Add metrics if needed
		if (includeMetrics) {
			try {
				const metrics = await systemMetrics.getSystemMetrics();
				stateReport[deviceInfo.uuid].cpu_usage = metrics.cpu_usage;
				stateReport[deviceInfo.uuid].memory_usage = metrics.memory_usage;
				stateReport[deviceInfo.uuid].memory_total = metrics.memory_total;
				stateReport[deviceInfo.uuid].storage_usage = metrics.storage_usage ?? undefined;
				stateReport[deviceInfo.uuid].storage_total = metrics.storage_total ?? undefined;
				stateReport[deviceInfo.uuid].temperature = metrics.cpu_temp ?? undefined;
				stateReport[deviceInfo.uuid].uptime = metrics.uptime;
				stateReport[deviceInfo.uuid].top_processes = metrics.top_processes ?? [];
				stateReport[deviceInfo.uuid].network_interfaces = metrics.network_interfaces ?? [];
				
				// Get IP address from network interfaces (only include if changed)
				const primaryInterface = metrics.network_interfaces.find(i => i.default);
				const currentIp = primaryInterface?.ip4;
				if (currentIp && (currentIp !== this.lastLocalIp || this.lastLocalIp === undefined)) {
					stateReport[deviceInfo.uuid].local_ip = currentIp;
					this.lastLocalIp = currentIp;
				}
				
			
			this.lastMetricsTime = now;
		} catch (error) {
			this.logger?.warnSync('Failed to collect metrics', {
				component: 'Sync',
				operation: 'collect-metrics',
				error: error instanceof Error ? error.message : String(error)
			});
		}
		
		// Add sensor health stats (if sensor-publish is enabled)
		if (this.sensorPublish) {
			try {
				const sensorStats = this.sensorPublish.getStats();
				(stateReport[deviceInfo.uuid] as any).sensor_health = sensorStats;
			} catch (error) {
				this.logger?.warnSync('Failed to collect sensor stats', {
					component: 'Sync',
					operation: 'collect-sensor-stats',
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}
		
		// Add protocol adapter health stats (if protocol-adapters is enabled)
		if (this.protocolAdapters) {
			try {
				const adapterStatuses = this.protocolAdapters.getAllDeviceStatuses();
				if (adapterStatuses && adapterStatuses.size > 0) {
					const protocolHealth: any = {};
					adapterStatuses.forEach((devices: any, protocolType: string) => {
						protocolHealth[protocolType] = devices;
					});
					(stateReport[deviceInfo.uuid] as any).protocol_adapters_health = protocolHealth;
				}
			} catch (error) {
				this.logger?.warnSync('Failed to collect protocol adapter stats', {
					component: 'Sync',
					operation: 'collect-adapter-stats',
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}
	}	// Build state-only report for diff comparison (without metrics)
	const stateOnlyReport: DeviceStateReport = {
		[deviceInfo.uuid]: {
			apps: currentState.apps,
			config: currentState.config,
			is_online: this.connectionMonitor.isOnline(),
			version: this.currentVersion, // Report which version we've applied
		},
	};
	
	// Include static fields in diff comparison if they were included in the report
	if (stateReport[deviceInfo.uuid].os_version !== undefined) {
		stateOnlyReport[deviceInfo.uuid].os_version = stateReport[deviceInfo.uuid].os_version;
	}
	if (stateReport[deviceInfo.uuid].agent_version !== undefined) {
		stateOnlyReport[deviceInfo.uuid].agent_version = stateReport[deviceInfo.uuid].agent_version;
	}		// Calculate diff - only compare app state (no metrics)
		const diff = this.calculateStateDiff(this.lastReport, stateOnlyReport);
		
		// If there are changes OR we need to send metrics, send the full report (with metrics if applicable)
		const shouldReport = Object.keys(diff).length > 0 || includeMetrics;
		
		if (!shouldReport) {
			// No changes to report
			return;
		}
		
		// Prepare report to send (include metrics if needed)
		const reportToSend = includeMetrics ? stateReport : stateOnlyReport;
		
		// Send report to cloud
		try {
			await this.sendReport(reportToSend);
			
			// Update last report (state only, no metrics)
			this.lastReport = stateOnlyReport;
			this.lastReportTime = now;
			
			// Log with bandwidth optimization details
			const optimizationDetails: any = {
				component: 'Sync',
				operation: 'report',
				includeMetrics,
				version: this.currentVersion, // Show which version we're reporting
				reportedVersion: stateReport[deviceInfo.uuid].version // Show version in report
			};
			
			// Track which static fields were included (for debugging)
			if (osVersionChanged || agentVersionChanged || 
			    (includeMetrics && stateReport[deviceInfo.uuid].local_ip !== undefined)) {
				optimizationDetails.staticFieldsIncluded = {
					osVersion: osVersionChanged,
					agentVersion: agentVersionChanged,
					localIp: includeMetrics && stateReport[deviceInfo.uuid].local_ip !== undefined
				};
			} else {
				optimizationDetails.staticFieldsOptimized = true; // Saved bandwidth!
			}
			
			this.logger?.infoSync('Reported current state to cloud', optimizationDetails);
			
		} catch (error) {
			// Failed to send - queue for later (regardless of connection state)
			// This ensures we don't lose reports during degraded/offline states
			const connectionHealth = this.connectionMonitor.getHealth();
			
			this.logger?.debugSync('Report failed, queueing for retry', {
				component: 'Sync',
				operation: 'report',
				connectionStatus: connectionHealth.status,
				queueSize: this.reportQueue.size()
			});
			
			// Strip verbose data before queueing to save storage
			const strippedReport = this.stripReportForQueue(reportToSend);
			const originalSize = JSON.stringify(reportToSend).length;
			const strippedSize = JSON.stringify(strippedReport).length;
			const savings = originalSize - strippedSize;
			const savingsPercent = ((savings / originalSize) * 100).toFixed(1);
			
			this.logger?.infoSync('Queueing report for later', {
				component: 'Sync',
				operation: 'queue-report',
				originalBytes: originalSize,
				strippedBytes: strippedSize,
				savings: `${savings} bytes (${savingsPercent}%)`,
				connectionStatus: connectionHealth.status
			});
			
			await this.reportQueue.enqueue(strippedReport);
			this.logger?.debugSync('Report queued', {
				component: 'Sync',
				queueSize: this.reportQueue.size(),
				connectionStatus: connectionHealth.status
			});
			
			throw error;
		}
	}
	
	/**
	 * Send report to cloud API
	 * Uses MQTT as primary path with HTTP as fallback
	 */
	private async sendReport(report: DeviceStateReport): Promise<void> {
		const deviceInfo = this.deviceManager.getDeviceInfo();
		
		// Try MQTT first if manager is available and connected
		if (this.mqttManager) {
			try {
				const topic = `iot/device/${deviceInfo.uuid}/state`;
				const payload = JSON.stringify(report);
				const payloadSize = Buffer.byteLength(payload, 'utf8');
				
				this.logger?.debugSync('Sending state report via MQTT', {
					component: 'Sync',
					operation: 'mqtt-publish',
					topic,
					bytes: payloadSize,
					transport: 'mqtt'
				});
				
				// Publish with QoS 1 for guaranteed delivery
				await this.mqttManager.publish(topic, payload, { qos: 1 });
				
				this.logger?.debugSync('State report sent via MQTT', {
					component: 'Sync',
					operation: 'mqtt-success',
					bytes: payloadSize,
					transport: 'mqtt'
				});
				
				return; // Success - no need for HTTP fallback
				
			} catch (mqttError) {
				// MQTT failed - log and fall through to HTTP
				this.logger?.warnSync('MQTT publish failed, falling back to HTTP', {
					component: 'Sync',
					operation: 'mqtt-fallback',
					error: mqttError instanceof Error ? mqttError.message : String(mqttError),
					transport: 'mqtt→http'
				});
			}
		}
		
		// MQTT not available or failed - use HTTP fallback
		const endpoint = buildApiEndpoint(this.config.cloudApiEndpoint, '/device/state');
		
		// Convert to JSON
		const jsonPayload = JSON.stringify(report);
		const uncompressedSize = Buffer.byteLength(jsonPayload, 'utf8');
		
		// Compress with gzip
		const compressedPayload = await gzipAsync(jsonPayload);
		const compressedSize = compressedPayload.length;
		
		// Calculate compression ratio for logging
		const compressionRatio = ((1 - compressedSize / uncompressedSize) * 100).toFixed(1);
		
		this.logger?.debugSync('Sending compressed state report via HTTP', {
			component: 'Sync',
			operation: 'http-compress',
			uncompressedBytes: uncompressedSize,
			compressedBytes: compressedSize,
			compressionRatio: `${compressionRatio}%`,
			savings: `${uncompressedSize - compressedSize} bytes`,
			transport: 'http'
		});
		
		const response = await fetch(endpoint, {
			method: 'PATCH',
			headers: {
				'Content-Type': 'application/json',
				'Content-Encoding': 'gzip',
				'X-Device-API-Key': deviceInfo.apiKey || '',
			},
			body: compressedPayload,
			signal: AbortSignal.timeout(this.config.apiTimeout),
		});
		
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}
		
		this.logger?.debugSync('State report sent via HTTP', {
			component: 'Sync',
			operation: 'http-success',
			bytes: compressedSize,
			transport: 'http'
		});
	}
	
	/**
	 * Flush offline queue (send all queued reports)
	 */
	private async flushOfflineQueue(): Promise<void> {
		if (this.reportQueue.isEmpty()) {
			return;
		}
		
		const queueSize = this.reportQueue.size();
		this.logger?.infoSync('Flushing offline queue', {
			component: 'Sync',
			operation: 'flush-queue',
			queueSize
		});
		
		const sentCount = await this.reportQueue.flush(
			async (report) => await this.sendReport(report),
			{ maxRetries: 3, continueOnError: false }
		);
		
		if (sentCount > 0) {
			this.logger?.infoSync('Successfully flushed queued reports', {
				component: 'Sync',
				operation: 'flush-queue',
				sentCount,
				totalCount: queueSize
			});
		}
	}
	
	/**
	 * Compare apps objects, ignoring runtime fields like containerId and status
	 * These fields change when containers are recreated but don't represent config changes
	 */
	private appsChanged(oldApps: any, newApps: any): boolean {
		// Remove runtime fields from services before comparison
		const normalizeService = (service: any) => {
			const { containerId, status, ...configFields } = service;
			return configFields;
		};
		
		const normalizeApp = (app: any) => {
			if (!app || !app.services) return app;
			return {
				...app,
				services: app.services.map(normalizeService),
			};
		};
		
		const normalizedOld: any = {};
		const normalizedNew: any = {};
		
		for (const appId in oldApps) {
			normalizedOld[appId] = normalizeApp(oldApps[appId]);
		}
		
		for (const appId in newApps) {
			normalizedNew[appId] = normalizeApp(newApps[appId]);
		}
		
		const oldStr = JSON.stringify(normalizedOld);
		const newStr = JSON.stringify(normalizedNew);
		
		if (oldStr !== newStr) {
			return true;
		}
		
		return false;
	}
	
	/**
	 * Calculate diff between two state reports
	 * 
	 * Compares only app state and non-metrics fields.
	 * Both states should NOT contain metrics fields.
	 */
	private calculateStateDiff(
		oldState: DeviceStateReport,
		newState: DeviceStateReport,
	): Partial<DeviceStateReport> {
		const diff: any = {};
		
		for (const uuid in newState) {
			const oldDevice = oldState[uuid] || {};
			const newDevice = newState[uuid];
			const deviceDiff: any = {};
			
			// Compare each field in newDevice
			for (const key in newDevice) {
				const oldValue = (oldDevice as any)[key];
				const newValue = (newDevice as any)[key];
				
				// Deep comparison for apps object (excluding runtime fields)
				if (key === 'apps') {
					if (this.appsChanged(oldValue || {}, newValue || {})) {
						deviceDiff[key] = newValue;
					}
				}
				// Shallow comparison for other primitives (is_online, local_ip, etc.)
				else {
					if (oldValue !== newValue) {
						deviceDiff[key] = newValue;
					}
				}
			}
			
			// Only include device if there are changes
			if (Object.keys(deviceDiff).length > 0) {
				diff[uuid] = deviceDiff;
			}
		}
		
		return diff;
	}
}
