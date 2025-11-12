/**
 * Configuration Handler Base Interface
 * 
 * All feature-specific config handlers implement this interface.
 * Promotes consistent architecture across features.
 */

import type { ConfigManager, ConfigChangeEvent } from '../manager.js';
import type { AgentLogger } from '../../logging/agent-logger.js';

export interface ConfigHandlerOptions {
	configManager: ConfigManager;
	logger?: AgentLogger;
}

/**
 * Base interface for all configuration handlers
 */
export interface IConfigHandler {
	/**
	 * Initialize handler and subscribe to config events
	 */
	initialize(): Promise<void>;

	/**
	 * Handle configuration changes
	 */
	handleConfigChange(event: ConfigChangeEvent): Promise<void>;

	/**
	 * Cleanup resources
	 */
	destroy(): Promise<void>;
}

/**
 * Abstract base class for config handlers
 * Provides common utilities
 */
export abstract class BaseConfigHandler implements IConfigHandler {
	protected configManager: ConfigManager;
	protected logger?: AgentLogger;
	protected configKey: string;

	constructor(configKey: string, options: ConfigHandlerOptions) {
		this.configKey = configKey;
		this.configManager = options.configManager;
		this.logger = options.logger;
	}

	async initialize(): Promise<void> {
		// Subscribe to specific config key
		this.configManager.on(`config:${this.configKey}`, this.handleConfigChange.bind(this));
		
		this.logger?.debug(`Config handler initialized: ${this.configKey}`, {
			category: 'ConfigHandler',
			handler: this.constructor.name
		});

		// Handle initial config if present
		const initialConfig = this.configManager.getConfig(this.configKey);
		if (initialConfig) {
			await this.handleConfigChange({
				key: this.configKey,
				value: initialConfig,
				timestamp: new Date()
			});
		}
	}

	abstract handleConfigChange(event: ConfigChangeEvent): Promise<void>;

	async destroy(): Promise<void> {
		this.configManager.removeAllListeners(`config:${this.configKey}`);
		this.logger?.debug(`Config handler destroyed: ${this.configKey}`, {
			category: 'ConfigHandler',
			handler: this.constructor.name
		});
	}
}
