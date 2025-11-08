/**
 * Protocol Adapters Feature
 * 
 * Manages industrial protocol adapters (Modbus, CAN, OPC-UA, etc.)
 * Each adapter reads sensor data and publishes to Unix sockets for consumption
 * by the sensor-publish system.
 */

import { BaseFeature, FeatureConfig } from '../index.js';
import { AgentLogger } from '../../logging/agent-logger.js';
import { ModbusAdapter } from './modbus/modbus-adapter.js';
import { ModbusAdapterConfig } from './modbus/types.js';
import { ConfigLoader } from './modbus/config-loader.js';

export interface SensorConfig extends FeatureConfig {
  modbus?: {
    enabled: boolean;
    configPath?: string;
    config?: ModbusAdapterConfig;
  };
  can?: {
    enabled: boolean;
    configPath?: string;
  };
  opcua?: {
    enabled: boolean;
    configPath?: string;
  };
}

export class SensorsFeature extends BaseFeature {
  private modbusAdapter?: ModbusAdapter;

  constructor(
    config: SensorConfig,
    agentLogger: AgentLogger,
    deviceUuid: string
  ) {
    super(config, agentLogger, 'ProtocolAdapters', deviceUuid, false, 'PROTOCOL_ADAPTERS_DEBUG');
  }

  /**
   * Initialize - called by BaseFeature.start() before onStart()
   */
  protected async onInitialize(): Promise<void> {
    // No initialization needed
  }

  /**
   * Start all enabled protocol adapters
   */
  protected async onStart(): Promise<void> {
    // Start Modbus adapter if enabled
    if ((this.config as SensorConfig).modbus?.enabled) {
      await this.startModbusAdapter();
    }

    // TODO: Start CAN adapter when implemented
    if ((this.config as SensorConfig).can?.enabled) {
      this.logger.warn('CAN adapter not yet implemented');
    }

    // TODO: Start OPC-UA adapter when implemented
    if ((this.config as SensorConfig).opcua?.enabled) {
      this.logger.warn('OPC-UA adapter not yet implemented');
    }

    this.emit('started');
  }

  /**
   * Stop all running protocol adapters
   */
  protected async onStop(): Promise<void> {
    // Stop Modbus adapter
    if (this.modbusAdapter) {
      await this.modbusAdapter.stop();
      this.modbusAdapter = undefined;
    }

    // TODO: Stop other adapters

    this.emit('stopped');
  }

  /**
   * Start Modbus adapter
   */
  private async startModbusAdapter(): Promise<void> {
    try {
      let modbusConfig: ModbusAdapterConfig;

      // Load config from file or use provided config
      if (this.config.modbus!.configPath) {
        this.logger.info(`Loading Modbus config from: ${this.config.modbus!.configPath}`);
        modbusConfig = ConfigLoader.loadFromFile(this.config.modbus!.configPath);
      } else if (this.config.modbus!.config) {
        modbusConfig = this.config.modbus!.config;
      } else {
        throw new Error('Modbus adapter enabled but no config provided');
      }

      // Create and start adapter
      this.modbusAdapter = new ModbusAdapter(modbusConfig, this.logger);

      // Setup event listeners
      this.modbusAdapter.on('started', () => {
        this.logger.info('Modbus adapter started');
      });

      this.modbusAdapter.on('device-connected', (deviceName: string) => {
        this.logger.info(`Modbus device connected: ${deviceName}`);
      });

      this.modbusAdapter.on('device-disconnected', (deviceName: string) => {
        this.logger.warn(`Modbus device disconnected: ${deviceName}`);
      });

      this.modbusAdapter.on('device-error', (deviceName: string, error: Error) => {
        this.logger.error(`Modbus device error [${deviceName}]: ${error.message}`);
      });

      await this.modbusAdapter.start();
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to start Modbus adapter: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get Modbus adapter instance (for testing/debugging)
   */
  getModbusAdapter(): ModbusAdapter | undefined {
    return this.modbusAdapter;
  }

  /**
   * Get device statuses from all enabled protocol adapters
   * Returns a map of protocol type to array of device statuses
   */
  getAllDeviceStatuses(): Map<string, any[]> {
    const statuses = new Map<string, any[]>();

    // Collect Modbus device statuses
    if (this.modbusAdapter) {
      const modbusStatuses = this.modbusAdapter.getDeviceStatuses();
      if (modbusStatuses.length > 0) {
        statuses.set('modbus', modbusStatuses);
      }
    }

    // TODO: Add CAN device statuses when implemented
    // if (this.canAdapter) {
    //   const canStatuses = this.canAdapter.getDeviceStatuses();
    //   if (canStatuses.length > 0) {
    //     statuses.set('can', canStatuses);
    //   }
    // }

    // TODO: Add OPC-UA device statuses when implemented
    // if (this.opcuaAdapter) {
    //   const opcuaStatuses = this.opcuaAdapter.getDeviceStatuses();
    //   if (opcuaStatuses.length > 0) {
    //     statuses.set('opcua', opcuaStatuses);
    //   }
    // }

    return statuses;
  }
}
