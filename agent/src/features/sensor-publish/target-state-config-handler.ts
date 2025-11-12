/**
 * Sensor Publish Configuration Handler
 * 
 * Manages sensor publish pipeline configuration updates.
 * 
 * Responsibilities:
 * - Listen for config.sensors changes
 * - Merge with environment-based sensor config
 * - Update sensor publish pipelines dynamically
 */

import { BaseConfigHandler, type ConfigHandlerOptions } from '../../config/handlers/base-handler.js';
import type { ConfigChangeEvent } from '../../config/manager.js';

export interface SensorConfig {
	name: string;
	enabled: boolean;
	addr: string;
	eomDelimiter?: string;
	mqttTopic: string;
	bufferCapacity?: number;
}

export interface SensorPublishManager {
	stop(): Promise<void>;
	start(sensors: SensorConfig[]): Promise<void>;
}

export interface SensorPublishHandlerOptions extends ConfigHandlerOptions {
	sensorPublishManager?: SensorPublishManager;
	envSensors?: SensorConfig[]; // Sensors from SENSOR_PUBLISH_CONFIG env var
}

export class SensorPublishHandler extends BaseConfigHandler {
	private sensorPublishManager?: SensorPublishManager;
	private envSensors: SensorConfig[];

	constructor(options: SensorPublishHandlerOptions) {
		super('sensors', options);
		this.sensorPublishManager = options.sensorPublishManager;
		this.envSensors = options.envSensors || [];
	}

	async handleConfigChange(event: ConfigChangeEvent): Promise<void> {
		const targetSensors = event.value as SensorConfig[] | undefined;

		this.logger?.debug('Sensor configuration detected', {
			category: 'SensorPublishHandler',
			targetSensors: targetSensors?.length || 0,
			envSensors: this.envSensors.length
		});

		try {
			// Merge environment sensors with target state sensors
			// Priority: Target state > Environment
			const mergedSensors = this.mergeSensors(this.envSensors, targetSensors || []);

			this.logger?.info('Merged sensor configuration', {
				category: 'SensorPublishHandler',
				totalSensors: mergedSensors.length,
				targetStateSensors: targetSensors?.length || 0
			});

			// Restart sensor publish with new config
			if (this.sensorPublishManager && mergedSensors.length > 0) {
				await this.sensorPublishManager.stop();
				await this.sensorPublishManager.start(mergedSensors);
			}

		} catch (error) {
			this.logger?.errorSync('Failed to update sensor configuration', error instanceof Error ? error : new Error(String(error)), {
				category: 'SensorPublishHandler'
			});
		}
	}

	/**
	 * Merge sensors from different sources
	 * Target state sensors override environment sensors with same name
	 */
	private mergeSensors(envSensors: SensorConfig[], targetSensors: SensorConfig[]): SensorConfig[] {
		const sensorMap = new Map<string, SensorConfig>();

		// Add environment sensors first
		for (const sensor of envSensors) {
			sensorMap.set(sensor.name, sensor);
		}

		// Override with target state sensors
		for (const sensor of targetSensors) {
			sensorMap.set(sensor.name, sensor);
		}

		return Array.from(sensorMap.values());
	}
}
