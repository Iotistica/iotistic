/**
 * Protocol Adapters Feature
 * 
 * Manages industrial protocol adapters (Modbus, CAN, OPC-UA, etc.)
 * Each adapter reads sensor data and emits 'data' events.
 * SensorsFeature manages SocketServers (one per protocol) and routes
 * data from adapters to their respective sockets for consumption by
 * the sensor-publish system.
 * 
 * Architecture:
 * - Protocol Adapters: Socket-agnostic, emit data events
 * - SensorsFeature: Manages SocketServers, routes adapter data to sockets
 * - Sensor-Publish: Reads from sockets, publishes to MQTT
 */

import { BaseFeature, FeatureConfig } from '../index.js';
import { AgentLogger } from '../../logging/agent-logger.js';
import { ModbusAdapter } from './modbus/adapter.js';
import { ModbusAdapterConfig } from './modbus/types.js';
import { SocketServer } from './common/socket-server.js';
import { SensorDataPoint, SocketOutput } from './types.js';
import { SensorOutputModel } from '../../db/models/sensor-outputs.model.js';
import { DeviceSensorModel } from '../../db/models/sensors.model.js';

export interface SensorConfig extends FeatureConfig {
  modbus?: {
    enabled: boolean;
    config?: ModbusAdapterConfig; // Optional: provide config directly, otherwise load from database
  };
  can?: {
    enabled: boolean;
  };
  opcua?: {
    enabled: boolean;
  };
}

export class SensorsFeature extends BaseFeature {
  private modbusAdapter?: ModbusAdapter;
  private socketServers: Map<string, SocketServer> = new Map();

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
   * Stop all running protocol adapters and socket servers
   */
  protected async onStop(): Promise<void> {
    // Stop Modbus adapter
    if (this.modbusAdapter) {
      await this.modbusAdapter.stop();
      this.modbusAdapter = undefined;
    }

    // Stop all socket servers
    for (const [protocol, server] of this.socketServers) {
      this.logger.info(`Stopping ${protocol} socket server`);
      await server.stop();
    }
    this.socketServers.clear();

    // TODO: Stop other adapters

    this.emit('stopped');
  }

  /**
   * Start Modbus adapter
   */
  private async startModbusAdapter(): Promise<void> {
    try {
      let modbusConfig: ModbusAdapterConfig;
      let outputConfig: SocketOutput;

      // Load config from provided config object or database
      if (this.config.modbus!.config) {
        // Use provided config
        modbusConfig = this.config.modbus!.config;
      } else {
        // Load devices from database
        const dbDevices = await DeviceSensorModel.getEnabled('modbus');
        if (dbDevices.length === 0) {
          this.logger.warn('No Modbus devices found in database');
          return;
        }
        
        // Convert database format to ModbusAdapterConfig
        // Database stores the full ModbusDevice config in connection and data_points fields
        modbusConfig = {
          devices: dbDevices.map(d => ({
            name: d.name,
            enabled: d.enabled,
            slaveId: d.connection.slaveId || 1,
            connection: d.connection as any, // Connection config stored in database
            pollInterval: d.poll_interval,
            registers: d.data_points || []
          }) as any), // Type assertion - database stores full ModbusDevice config
          logging: {
            level: 'info',
            enableConsole: false,
            enableFile: false
          }
        };
      }

      // Load output config from database
      const dbOutput = await SensorOutputModel.getOutput('modbus');
      if (!dbOutput) {
        throw new Error('Modbus output configuration not found in database');
      }
      outputConfig = {
        socketPath: dbOutput.socket_path,
        dataFormat: dbOutput.data_format as 'json' | 'csv',
        delimiter: dbOutput.delimiter,
        includeTimestamp: dbOutput.include_timestamp,
        includeDeviceName: dbOutput.include_device_name
      };

      // Create socket server for Modbus protocol
      const modbusSocket = new SocketServer(outputConfig, this.logger);
      await modbusSocket.start();
      this.socketServers.set('modbus', modbusSocket);
      this.logger.info(`Modbus socket server started at: ${outputConfig.socketPath}`);

      // Create Modbus adapter (socket-agnostic)
      this.modbusAdapter = new ModbusAdapter(modbusConfig, this.logger);

      // Wire up event handlers
      this.modbusAdapter.on('started', () => {
        this.logger.info('Modbus adapter started');
      });

      this.modbusAdapter.on('data', (dataPoints: SensorDataPoint[]) => {
        // Route data from adapter to socket server
        modbusSocket.sendData(dataPoints);
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

      // Start adapter
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
