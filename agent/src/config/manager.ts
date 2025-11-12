/**
 * Configuration Manager
 * 
 * Central event-driven system for distributing configuration updates
 * to individual feature handlers. Replaces monolithic agent.handleConfigUpdate().
 * 
 * Architecture:
 * 1. ConfigManager receives config updates from target state
 * 2. Emits specific events: 'config:logging', 'config:sensors', 'config:protocolAdapters', etc.
 * 3. Feature handlers subscribe to relevant events and manage their own state
 * 
 * Benefits:
 * - Decoupled: Features don't depend on Agent class
 * - Testable: Each handler can be unit tested independently
 * - Scalable: Adding new features doesn't bloat agent.ts
 * - Clear ownership: Each feature owns its config logic
 */

import { EventEmitter } from 'events';
import type { AgentLogger } from '../logging/agent-logger.js';

export interface ConfigChangeEvent {
	key: string;
	value: any;
	previousValue?: any;
	timestamp: Date;
}

export interface ConfigManagerOptions {
	logger?: AgentLogger;
}

/**
 * ConfigManager - Central hub for configuration updates
 * 
 * Emits events:
 * - 'config:changed' - Any config changed (full config object)
 * - 'config:<key>' - Specific config key changed (e.g., 'config:logging', 'config:sensors')
 * - 'config:*:changed' - Wildcard for listening to all specific changes
 */
export class ConfigManager extends EventEmitter {
	private currentConfig: Record<string, any> = {};
	private logger?: AgentLogger;

	constructor(options: ConfigManagerOptions = {}) {
		super();
		this.logger = options.logger;
	}

	/**
	 * Update configuration from target state
	 * Emits events for changed keys only
	 */
	async updateConfig(newConfig: Record<string, any>): Promise<void> {
		this.logger?.info('📋 Processing configuration update', {
			category: 'ConfigManager',
			configKeys: Object.keys(newConfig).length,
			keys: Object.keys(newConfig)
		});

		const changedKeys: string[] = [];

		// Compare each key to detect changes
		for (const [key, value] of Object.entries(newConfig)) {
			const previousValue = this.currentConfig[key];
			const hasChanged = JSON.stringify(previousValue) !== JSON.stringify(value);

			if (hasChanged) {
				changedKeys.push(key);
				
				// Emit specific key event
				const event: ConfigChangeEvent = {
					key,
					value,
					previousValue,
					timestamp: new Date()
				};

				this.logger?.debug(`Config changed: ${key}`, {
					category: 'ConfigManager',
					key,
					hasValue: !!value
				});

				// Emit to specific listeners (e.g., 'config:logging', 'config:sensors')
				this.emit(`config:${key}`, event);
			}
		}

		// Detect deletions (keys removed from config)
		for (const key of Object.keys(this.currentConfig)) {
			if (!(key in newConfig)) {
				changedKeys.push(key);
				this.logger?.debug(`Config removed: ${key}`, {
					category: 'ConfigManager',
					key
				});

				this.emit(`config:${key}`, {
					key,
					value: undefined,
					previousValue: this.currentConfig[key],
					timestamp: new Date()
				} as ConfigChangeEvent);
			}
		}

		// Update stored config
		this.currentConfig = { ...newConfig };

		// Emit global change event with full config
		if (changedKeys.length > 0) {
			this.emit('config:changed', {
				config: this.currentConfig,
				changedKeys,
				timestamp: new Date()
			});

			this.logger?.info('Configuration update complete', {
				category: 'ConfigManager',
				changedKeys: changedKeys.length,
				keys: changedKeys
			});
		} else {
			this.logger?.debug('No configuration changes detected', {
				category: 'ConfigManager'
			});
		}
	}

	/**
	 * Get current config value for a key
	 */
	getConfig(key: string): any {
		return this.currentConfig[key];
	}

	/**
	 * Get full current configuration
	 */
	getCurrentConfig(): Record<string, any> {
		return { ...this.currentConfig };
	}

	/**
	 * Check if a config key exists
	 */
	hasConfig(key: string): boolean {
		return key in this.currentConfig;
	}
}
