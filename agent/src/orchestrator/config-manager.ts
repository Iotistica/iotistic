/**
 * CONFIG MANAGER
 * ==============
 * 
 * Manages device configuration reconciliation - separate from container orchestration.
 * Handles sensor (protocol adapter devices) registration, updates, and removal.
 * 
 * This is the config counterpart to ContainerManager, allowing the StateReconciler
 * to manage both containers AND configuration in a unified way.
 */

import { EventEmitter } from 'events';
import _ from 'lodash';
import { models as db } from '../db.js';
import type { AgentLogger } from '../logging/agent-logger.js';
import type {
	DeviceConfig,
	ConfigStep,
	ConfigReconciliationResult,
	ProtocolAdapterDevice,
} from './types.js';

interface ConfigManagerEvents {
	'config-applied': () => void;
	'device-registered': (device: ProtocolAdapterDevice) => void;
	'device-updated': (device: ProtocolAdapterDevice) => void;
	'device-unregistered': (deviceId: string) => void;
}

export class ConfigManager extends EventEmitter {
	private targetConfig: DeviceConfig = {};
	private currentConfig: DeviceConfig = {};
	private logger?: AgentLogger;

	constructor(logger?: AgentLogger) {
		super();
		this.logger = logger;
	}

	/**
	 * Initialize config manager
	 */
	public async init(): Promise<void> {
		this.logger?.infoSync('Initializing ConfigManager', {
			component: 'ConfigManager',
			operation: 'init',
		});
		
		// Load current config from database (persisted reconciled state)
		await this.loadCurrentConfigFromDB();
	}

	/**
	 * Set target configuration
	 */
	public async setTarget(config: DeviceConfig): Promise<void> {
		this.logger?.infoSync('Setting target config', {
			component: 'ConfigManager',
			operation: 'setTarget',
			deviceCount: config.sensors?.length || 0,
			sensorNames: config.sensors?.map(s => s.name) || [],
			hasSensors: !!config.sensors && config.sensors.length > 0,
		});

		this.targetConfig = _.cloneDeep(config);
		
		// Trigger reconciliation
		await this.reconcile();
	}

	/**
	 * Get target configuration
	 */
	public getTargetConfig(): DeviceConfig {
		return _.cloneDeep(this.targetConfig);
	}

	/**
	 * Get current configuration
	 */
	public getCurrentConfig(): DeviceConfig {
		// Log what we're returning (for debugging)
		return _.cloneDeep(this.currentConfig);
	}

	/**
	 * Main reconciliation logic
	 */
	public async reconcile(): Promise<ConfigReconciliationResult> {
		this.logger?.infoSync('Starting config reconciliation', {
			component: 'ConfigManager',
			operation: 'reconcile',
		});

		const result: ConfigReconciliationResult = {
			success: true,
			devicesRegistered: 0,
			devicesUpdated: 0,
			devicesUnregistered: 0,
			errors: [],
			timestamp: new Date(),
		};

		try {
			// First, copy all non-sensor fields from target to current config
			// This ensures logging, features, settings, etc. are always up-to-date
			const { sensors: _targetSensors, ...otherTargetFields } = this.targetConfig;
			const { sensors: currentSensors, ...otherCurrentFields } = this.currentConfig;
			
			console.log('[ConfigManager] reconcile - Before Object.assign:', {
				currentConfigKeys: Object.keys(this.currentConfig),
				targetConfigKeys: Object.keys(this.targetConfig),
				otherTargetFields: Object.keys(otherTargetFields),
				hasCurrentLogging: !!this.currentConfig.logging,
				hasTargetLogging: !!this.targetConfig.logging,
			});
			
			// Merge non-sensor fields into current config
			Object.assign(this.currentConfig, otherTargetFields);
			
			console.log('[ConfigManager] reconcile - After Object.assign:', {
				currentConfigKeys: Object.keys(this.currentConfig),
				hasLogging: !!this.currentConfig.logging,
				hasFeatures: !!this.currentConfig.features,
				hasSettings: !!this.currentConfig.settings,
				loggingValue: this.currentConfig.logging,
			});
			
			// Restore sensors array (will be reconciled separately)
			if (currentSensors) {
				this.currentConfig.sensors = currentSensors;
			}
			
			// Calculate steps for sensor reconciliation
			const steps = this.calculateSteps();

			if (steps.length === 0) {
				this.logger?.infoSync('No sensor config changes needed', {
					component: 'ConfigManager',
					operation: 'reconcile',
				});
				
				// Even if no sensor changes, save current config to persist other field updates
				await this.saveCurrentConfigToDB();
				
				return result;
			}

			this.logger?.infoSync('Generated config reconciliation steps', {
				component: 'ConfigManager',
				operation: 'reconcile',
				stepsCount: steps.length,
			});

			// Execute steps
			for (const step of steps) {
				try {
					await this.executeStep(step);

					// Update result counters
					if (step.action === 'registerDevice') {
						result.devicesRegistered++;
					} else if (step.action === 'updateDevice') {
						result.devicesUpdated++;
					} else if (step.action === 'unregisterDevice') {
						result.devicesUnregistered++;
					}
				} catch (error: any) {
					this.logger?.errorSync(
						'Config step failed',
						error instanceof Error ? error : new Error(String(error)),
						{
							component: 'ConfigManager',
							operation: 'reconcile',
							action: step.action,
							deviceId: step.device?.id || step.deviceId,
						}
					);
					
					result.success = false;
					result.errors.push({
						deviceId: step.device?.id || step.deviceId || 'unknown',
						error: error.message,
					});
					
					// Continue with remaining steps (K8s style)
				}
			}

		this.logger?.infoSync('Config reconciliation complete', {
			component: 'ConfigManager',
			operation: 'reconcile',
			devicesRegistered: result.devicesRegistered,
			devicesUpdated: result.devicesUpdated,
			devicesUnregistered: result.devicesUnregistered,
			errors: result.errors.length,
		});

		// Save updated config to local database
		await this.saveCurrentConfigToDB();

		this.emit('config-applied');
	} catch (error) {
			this.logger?.errorSync(
				'Critical error during config reconciliation',
				error instanceof Error ? error : new Error(String(error)),
				{
					component: 'ConfigManager',
					operation: 'reconcile',
				}
			);
			result.success = false;
			throw error;
		}

		return result;
	}

	/**
	 * Calculate what config changes are needed
	 */
	private calculateSteps(): ConfigStep[] {
		const steps: ConfigStep[] =[];
		
		const targetDevices = this.targetConfig.sensors || [];
		const currentDevices = this.currentConfig.sensors || [];
		
		// Debug logging
		this.logger?.infoSync('Calculating config steps', {
			component: 'ConfigManager',
			operation: 'calculateSteps',
			targetDevicesCount: targetDevices.length,
			currentDevicesCount: currentDevices.length,
			targetDeviceIds: targetDevices.map(d => d.id),
			currentDeviceIds: currentDevices.map(d => d.id),
		});
		
		// Build maps for easier comparison
		const targetMap = new Map(targetDevices.map(d => [d.id, d]));
		const currentMap = new Map(currentDevices.map(d => [d.id, d]));

		// Devices to add (in target but not in current)
		for (const device of targetDevices) {
			if (!currentMap.has(device.id)) {
				this.logger?.debugSync('Device needs to be registered', {
					component: 'ConfigManager',
					operation: 'calculateSteps',
					deviceId: device.id,
					deviceName: device.name,
				});
				
				steps.push({
					action: 'registerDevice',
					device: device,
				});
			}
		}

		// Devices to remove (in current but not in target)
		for (const device of currentDevices) {
			if (!targetMap.has(device.id)) {
				this.logger?.debugSync('Device needs to be unregistered', {
					component: 'ConfigManager',
					operation: 'calculateSteps',
					deviceId: device.id,
					deviceName: device.name,
				});
				
				steps.push({
					action: 'unregisterDevice',
					deviceId: device.id,
				});
			}
		}

		// Devices to update (config changed)
		for (const targetDevice of targetDevices) {
			const currentDevice = currentMap.get(targetDevice.id);
			if (currentDevice && !_.isEqual(targetDevice, currentDevice)) {
				this.logger?.debugSync('Device needs to be updated', {
					component: 'ConfigManager',
					operation: 'calculateSteps',
					deviceId: targetDevice.id,
					deviceName: targetDevice.name,
				});
				
				steps.push({
					action: 'updateDevice',
					device: targetDevice,
				});
			}
		}

		return steps;
	}

	/**
	 * Execute a single config step
	 */
	private async executeStep(step: ConfigStep): Promise<void> {
		switch (step.action) {
			case 'registerDevice':
				if (step.device) {
					await this.registerDevice(step.device);
				}
				break;

			case 'updateDevice':
				if (step.device) {
					await this.updateDevice(step.device);
				}
				break;

			case 'unregisterDevice':
				if (step.deviceId) {
					await this.unregisterDevice(step.deviceId);
				}
				break;
		}
	}

	/**
	 * Register a protocol adapter device
	 */
	private async registerDevice(device: ProtocolAdapterDevice): Promise<void> {
		this.logger?.infoSync('Registering protocol adapter device', {
			component: 'ConfigManager',
			operation: 'registerDevice',
			deviceId: device.id,
			deviceName: device.name,
			protocol: device.protocol,
		});

		// Save device to SQLite sensors table
		try {
			const { DeviceSensorModel: DeviceSensorModel } = await import('../models/sensors.model.js');
			
			// Handle both connectionString and connection formats
			let connection: Record<string, any> = {};
			if (device.connectionString) {
				// Legacy format: parse connection string
				try {
					const url = new URL(device.connectionString);
					connection = {
						host: url.hostname,
						port: parseInt(url.port) || 502,
					};
				} catch {
					connection = { connectionString: device.connectionString };
				}
			} else if ((device as any).connection) {
				// New format: connection object already provided
				connection = (device as any).connection;
			}
			
			// Extract protocol-specific metadata
			let metadata: Record<string, any> = {};
			if (device.protocol === 'modbus' && connection.unitId !== undefined) {
				// For Modbus: store unitId as slaveId in metadata
				metadata = { slaveId: connection.unitId };
			} else if (device.protocol === 'can') {
				// For CAN: add CAN-specific metadata here if needed
				metadata = {};
			} else if (device.protocol === 'opcua') {
				// For OPC-UA: add OPC-UA-specific metadata here if needed
				metadata = {};
			}
			
			// Normalize property names (camelCase → snake_case)
			const normalizedDevice = {
				name: device.name,
				protocol: device.protocol as 'modbus' | 'can' | 'opcua',
				enabled: device.enabled !== undefined ? device.enabled : true,
				poll_interval: device.pollInterval || 5000,
				connection: connection,
				data_points: (device as any).dataPoints || (device as any).registers || [],
				metadata: metadata
			};
			
			await DeviceSensorModel.create(normalizedDevice);
			
			this.logger?.infoSync('Device saved to sensors table', {
				component: 'ConfigManager',
				operation: 'registerDevice',
				deviceName: device.name,
			});
		} catch (error) {
			this.logger?.errorSync('Failed to save device to sensors table', 
				error instanceof Error ? error : new Error(String(error)), {
				component: 'ConfigManager',
				operation: 'registerDevice',
				deviceName: device.name,
			});
			throw error;
		}

		// Update current config to reflect the change
		if (!this.currentConfig.sensors) {
			this.currentConfig.sensors = [];
		}

		this.currentConfig.sensors.push(_.cloneDeep(device));

		// Persist current config to database
		await this.saveCurrentConfigToDB();

		this.emit('device-registered', device);
		
		this.logger?.infoSync('Device registered successfully', {
			component: 'ConfigManager',
			operation: 'registerDevice',
			deviceId: device.id,
		});
	}

	/**
	 * Update a protocol adapter device
	 */
	private async updateDevice(device: ProtocolAdapterDevice): Promise<void> {
		this.logger?.infoSync('Updating protocol adapter device', {
			component: 'ConfigManager',
			operation: 'updateDevice',
			deviceId: device.id,
			deviceName: device.name,
		});

		// Update device in SQLite sensors table (or create if doesn't exist)
		try {
			const { DeviceSensorModel: DeviceSensorModel } = await import('../models/sensors.model.js');
			
			// Handle both connectionString and connection formats
			let connection: Record<string, any> = {};
			if (device.connectionString) {
				// Legacy format: parse connection string
				try {
					const url = new URL(device.connectionString);
					connection = {
						host: url.hostname,
						port: parseInt(url.port) || 502,
					};
				} catch {
					connection = { connectionString: device.connectionString };
				}
			} else if ((device as any).connection) {
				// New format: connection object already provided
				connection = (device as any).connection;
			}
			
			// Extract protocol-specific metadata
			let metadata: Record<string, any> = {};
			if (device.protocol === 'modbus' && connection.unitId !== undefined) {
				// For Modbus: store unitId as slaveId in metadata
				metadata = { slaveId: connection.unitId };
			} else if (device.protocol === 'can') {
				// For CAN: add CAN-specific metadata here if needed
				metadata = {};
			} else if (device.protocol === 'opcua') {
				// For OPC-UA: add OPC-UA-specific metadata here if needed
				metadata = {};
			}
			
			// Normalize property names (camelCase → snake_case)
			const normalizedDevice = {
				protocol: device.protocol as 'modbus' | 'can' | 'opcua',
				enabled: device.enabled !== undefined ? device.enabled : true,
				poll_interval: device.pollInterval || 5000,
				connection: connection,
				data_points: (device as any).dataPoints || (device as any).registers || [],
				metadata: metadata
			};
			
			// Try to update first
			const existing = await DeviceSensorModel.getByName(device.name);
			
			if (existing) {
				// Device exists - update it
				await DeviceSensorModel.update(device.name, normalizedDevice);
				
				this.logger?.infoSync('Device updated in sensors table', {
					component: 'ConfigManager',
					operation: 'updateDevice',
					deviceName: device.name,
				});
			} else {
				// Device doesn't exist - create it (upsert behavior)
				await DeviceSensorModel.create({
					name: device.name,
					...normalizedDevice
				});
				
				this.logger?.infoSync('Device created in sensors table (was missing)', {
					component: 'ConfigManager',
					operation: 'updateDevice',
					deviceName: device.name,
				});
			}
		} catch (error) {
			this.logger?.errorSync('Failed to update device in sensors table', 
				error instanceof Error ? error : new Error(String(error)), {
				component: 'ConfigManager',
				operation: 'updateDevice',
				deviceName: device.name,
			});
			throw error;
		}

		// Update current config
		if (!this.currentConfig.sensors) {
			this.currentConfig.sensors = [];
		}

		const index = this.currentConfig.sensors.findIndex(
			d => d.id === device.id
		);

		if (index !== -1) {
			this.currentConfig.sensors[index] = _.cloneDeep(device);
		}

		// Persist current config to database
		await this.saveCurrentConfigToDB();

		this.emit('device-updated', device);
		
		this.logger?.infoSync('Device updated successfully', {
			component: 'ConfigManager',
			operation: 'updateDevice',
			deviceId: device.id,
		});
	}

	/**
	 * Unregister a protocol adapter device
	 */
	private async unregisterDevice(deviceId: string): Promise<void> {
		this.logger?.infoSync('Unregistering protocol adapter device', {
			component: 'ConfigManager',
			operation: 'unregisterDevice',
			deviceId,
		});

		// Find device name from current config
		const device = this.currentConfig.sensors?.find(d => d.id === deviceId);
		
		// Remove device from SQLite sensors table
		if (device) {
			try {
				const { DeviceSensorModel: DeviceSensorModel } = await import('../models/sensors.model.js');
				await DeviceSensorModel.delete(device.name);
				
				this.logger?.infoSync('Device removed from sensors table', {
					component: 'ConfigManager',
					operation: 'unregisterDevice',
					deviceName: device.name,
				});
			} catch (error) {
				this.logger?.errorSync('Failed to remove device from sensors table', 
					error instanceof Error ? error : new Error(String(error)), {
					component: 'ConfigManager',
					operation: 'unregisterDevice',
					deviceName: device.name,
				});
				throw error;
			}
		}

		// Update current config
		if (this.currentConfig.sensors) {
			this.currentConfig.sensors = 
				this.currentConfig.sensors.filter(d => d.id !== deviceId);
		}

		// Persist current config to database
		await this.saveCurrentConfigToDB();

		this.emit('device-unregistered', deviceId);
		
		this.logger?.infoSync('Device unregistered successfully', {
			component: 'ConfigManager',
			operation: 'unregisterDevice',
			deviceId,
		});
	}

	/**
	 * Load current config from database
	 * This restores the last reconciled state so we don't re-register devices on restart
	 */
	private async loadCurrentConfigFromDB(): Promise<void> {
		try {
			const snapshots = await db('stateSnapshot')
				.where({ type: 'config' })
				.orderBy('createdAt', 'desc')
				.limit(1);

			if (snapshots.length > 0) {
				this.currentConfig = JSON.parse(snapshots[0].state);

			this.logger?.infoSync('Loaded current config from database', {
				component: 'ConfigManager',
				operation: 'loadCurrentConfig',
				deviceCount: this.currentConfig.sensors?.length || 0,
			});
			} else {
				this.logger?.debugSync('No current config in database, starting fresh', {
					component: 'ConfigManager',
					operation: 'loadCurrentConfig',
				});
			}
		} catch (error) {
			this.logger?.errorSync(
				'Failed to load current config from DB',
				error instanceof Error ? error : new Error(String(error)),
				{
					component: 'ConfigManager',
					operation: 'loadCurrentConfig',
				}
			);
		}
	}

	/**
	 * Save current config to database
	 * This persists the reconciled state so we can restore it on restart
	 */
	private async saveCurrentConfigToDB(): Promise<void> {
		try {
			// Debug: Log what we're about to save
			console.log('[ConfigManager] saveCurrentConfigToDB - About to save:', {
				keys: Object.keys(this.currentConfig),
				hasLogging: !!this.currentConfig.logging,
				hasFeatures: !!this.currentConfig.features,
				hasSettings: !!this.currentConfig.settings,
				hasSensors: !!this.currentConfig.sensors,
				sensorCount: this.currentConfig.sensors?.length || 0,
				loggingValue: this.currentConfig.logging,
				featuresValue: this.currentConfig.features,
				settingsValue: this.currentConfig.settings
			});
			
			const configJson = JSON.stringify(this.currentConfig);

			this.logger?.infoSync('Saving current config to database', {
				component: 'ConfigManager',
				operation: 'saveCurrentConfig',
				deviceCount: this.currentConfig.sensors?.length || 0,
				configKeys: Object.keys(this.currentConfig),
				hasLogging: !!this.currentConfig.logging,
				hasFeatures: !!this.currentConfig.features,
				hasSettings: !!this.currentConfig.settings,
			});
			
			// Delete old config snapshots and insert new
			await db('stateSnapshot')
				.where({ type: 'config' })
				.delete();

			await db('stateSnapshot').insert({
				type: 'config',
				state: configJson,
			});

			this.logger?.infoSync('Current config saved to database', {
				component: 'ConfigManager',
				operation: 'saveCurrentConfig',
			});
		} catch (error) {
			this.logger?.errorSync(
				'Failed to save current config to DB',
				error instanceof Error ? error : new Error(String(error)),
				{
					component: 'ConfigManager',
					operation: 'saveCurrentConfig',
				}
			);
		}
	}

	// Typed event emitter methods
	public on<K extends keyof ConfigManagerEvents>(
		event: K,
		listener: ConfigManagerEvents[K],
	): this {
		return super.on(event, listener as any);
	}

	public emit<K extends keyof ConfigManagerEvents>(
		event: K,
		...args: Parameters<ConfigManagerEvents[K]>
	): boolean {
		return super.emit(event, ...args);
	}
}

