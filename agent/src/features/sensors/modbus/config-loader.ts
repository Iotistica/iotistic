import * as fs from 'fs';
import * as path from 'path';
import { ModbusAdapterConfig, ModbusAdapterConfigSchema, ModbusConnectionType, ModbusFunctionCode, ModbusDataType, Endianness } from './types';

/**
 * Configuration loader for Modbus Adapter
 */
export class ConfigLoader {
  
  /**
   * Load configuration from file
   */
  static loadFromFile(configPath: string): ModbusAdapterConfig {
    try {
      if (!fs.existsSync(configPath)) {
        throw new Error(`Configuration file not found: ${configPath}`);
      }

      const configData = fs.readFileSync(configPath, 'utf8');
      const rawConfig = JSON.parse(configData);
      
      // Validate configuration against schema
      const config = ModbusAdapterConfigSchema.parse(rawConfig);
      
      return config;
      
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load configuration: ${error.message}`);
      }
      throw new Error(`Failed to load configuration: ${String(error)}`);
    }
  }

  /**
   * Load configuration from environment variables
   */
  static loadFromEnv(): ModbusAdapterConfig {
    try {
      const configJson = process.env.MODBUS_ADAPTER_CONFIG;
      if (!configJson) {
        throw new Error('MODBUS_ADAPTER_CONFIG environment variable not set');
      }

      const rawConfig = JSON.parse(configJson);
      const config = ModbusAdapterConfigSchema.parse(rawConfig);
      
      return config;
      
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load configuration from environment: ${error.message}`);
      }
      throw new Error(`Failed to load configuration from environment: ${String(error)}`);
    }
  }

  /**
   * Load configuration from SQLite database
   */
  static async loadFromDatabase(): Promise<ModbusAdapterConfig> {
    try {
      const { DeviceSensorModel: DeviceSensorModel } = await import('../../../models/sensors.model.js');
      
      // Get all Modbus devices from database
      const dbDevices = await DeviceSensorModel.getAll('modbus');
      
      // Get output configuration
      const dbOutput = await DeviceSensorModel.getOutput('modbus');
      
      if (!dbOutput) {
        throw new Error('Modbus output configuration not found in database');
      }

      // Convert database records to ModbusAdapterConfig format
      const devices = dbDevices.map((dbDevice: any) => ({
        name: dbDevice.name,
        slaveId: dbDevice.metadata?.slaveId || 1,
        connection: typeof dbDevice.connection === 'string' 
          ? JSON.parse(dbDevice.connection) 
          : dbDevice.connection,
        registers: dbDevice.data_points 
          ? (typeof dbDevice.data_points === 'string' 
              ? JSON.parse(dbDevice.data_points) 
              : dbDevice.data_points)
          : [],
        pollInterval: dbDevice.poll_interval,
        enabled: dbDevice.enabled
      }));

      const config: ModbusAdapterConfig = {
        devices,
        output: {
          socketPath: dbOutput.socket_path,
          dataFormat: dbOutput.data_format as any,
          delimiter: dbOutput.delimiter,
          includeTimestamp: dbOutput.include_timestamp,
          includeDeviceName: dbOutput.include_device_name
        },
        logging: dbOutput.logging 
          ? (typeof dbOutput.logging === 'string' 
              ? JSON.parse(dbOutput.logging) 
              : dbOutput.logging)
          : {
              level: 'info' as any,
              enableConsole: true,
              enableFile: false
            }
      };

      // Validate configuration
      return ModbusAdapterConfigSchema.parse(config);
      
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to load configuration from database: ${error.message}`);
      }
      throw new Error(`Failed to load configuration from database: ${String(error)}`);
    }
  }

  /**
   * Create example configuration
   */
  static createExampleConfig(): ModbusAdapterConfig {
    return {
      devices: [
        {
          name: 'temperature-sensor',
          slaveId: 1,
          connection: {
            type: ModbusConnectionType.TCP,
            host: '192.168.1.100',
            port: 502,
            timeout: 5000,
            retryAttempts: 3,
            retryDelay: 1000
          } as any,
          registers: [
            {
              name: 'temperature',
              address: 40001,
              functionCode: ModbusFunctionCode.READ_HOLDING_REGISTERS,
              dataType: ModbusDataType.FLOAT32,
              count: 2,
              endianness: Endianness.BIG,
              scale: 0.1,
              offset: 0,
              unit: '°C',
              description: 'Temperature reading'
            },
            {
              name: 'humidity',
              address: 40003,
              functionCode: ModbusFunctionCode.READ_HOLDING_REGISTERS,
              dataType: ModbusDataType.FLOAT32,
              count: 2,
              endianness: Endianness.BIG,
              scale: 0.1,
              offset: 0,
              unit: '%',
              description: 'Humidity reading'
            }
          ],
          pollInterval: 5000,
          enabled: true
        },
        {
          name: 'pressure-sensor',
          slaveId: 2,
          connection: {
            type: ModbusConnectionType.RTU,
            serialPort: '/dev/ttyUSB0',
            baudRate: 9600,
            dataBits: 8,
            stopBits: 1,
            parity: 'none',
            timeout: 5000,
            retryAttempts: 3,
            retryDelay: 1000
          } as any,
          registers: [
            {
              name: 'pressure',
              address: 30001,
              functionCode: ModbusFunctionCode.READ_INPUT_REGISTERS,
              dataType: ModbusDataType.UINT32,
              count: 2,
              endianness: Endianness.BIG,
              scale: 0.001,
              offset: 0,
              unit: 'bar',
              description: 'Pressure reading'
            }
          ],
          pollInterval: 3000,
          enabled: true
        }
      ],
      output: {
        socketPath: '/tmp/sensors/modbus.sock',
        dataFormat: 'json' as any,
        delimiter: '\n',
        includeTimestamp: true,
        includeDeviceName: true
      },
      logging: {
        level: 'info' as any,
        enableConsole: true,
        enableFile: false
      }
    };
  }

  /**
   * Save configuration to file
   */
  static saveToFile(config: ModbusAdapterConfig, configPath: string): void {
    try {
      // Ensure directory exists
      const configDir = path.dirname(configPath);
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      // Validate configuration
      ModbusAdapterConfigSchema.parse(config);

      // Save to file
      const configJson = JSON.stringify(config, null, 2);
      fs.writeFileSync(configPath, configJson, 'utf8');
      
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to save configuration: ${error.message}`);
      }
      throw new Error(`Failed to save configuration: ${String(error)}`);
    }
  }

  /**
   * Validate configuration
   */
  static validate(config: any): ModbusAdapterConfig {
    return ModbusAdapterConfigSchema.parse(config);
  }
}
