import ModbusRTU from 'modbus-serial';
import {
  ModbusDevice,
  ModbusConnectionType,
  ModbusFunctionCode,
  ModbusDataType,
  Endianness
} from './types';
import { SensorDataPoint, Logger } from '../common/types';

/**
 * Modbus Client wrapper that handles different connection types and data reading
 */
export class ModbusClient {
  private client: ModbusRTU;
  private device: ModbusDevice;
  private logger: Logger;
  private connected = false;
  private reconnectTimer?: NodeJS.Timeout;

  constructor(device: ModbusDevice, logger: Logger) {
    this.device = device;
    this.logger = logger;
    this.client = new ModbusRTU();
    this.setupErrorHandlers();
  }

  /**
   * Connect to the Modbus device
   */
  async connect(): Promise<void> {
    try {
      this.logger.info(`Connecting to Modbus device: ${this.device.name}`);
      
      const { connection } = this.device;
      
      switch (connection.type) {
        case ModbusConnectionType.TCP:
          if (!connection.host) {
            throw new Error('TCP connection requires host');
          }
          await this.client.connectTCP(connection.host, { port: connection.port });
          break;
          
        case ModbusConnectionType.RTU:
          if (!connection.serialPort) {
            throw new Error('RTU connection requires serialPort');
          }
          await this.client.connectRTUBuffered(connection.serialPort, {
            baudRate: connection.baudRate,
            dataBits: connection.dataBits,
            stopBits: connection.stopBits,
            parity: connection.parity
          });
          break;
          
        case ModbusConnectionType.ASCII:
          if (!connection.serialPort) {
            throw new Error('ASCII connection requires serialPort');
          }
          await this.client.connectAsciiSerial(connection.serialPort, {
            baudRate: connection.baudRate,
            dataBits: connection.dataBits,
            stopBits: connection.stopBits,
            parity: connection.parity
          });
          break;
          
        default:
          throw new Error(`Unsupported connection type: ${connection.type}`);
      }

      // Set slave ID
      this.client.setID(this.device.slaveId);
      
      // Set timeout
      this.client.setTimeout(connection.timeout);
      
      this.connected = true;
      this.logger.info(`Connected to Modbus device: ${this.device.name}`);
      
    } catch (error) {
      this.connected = false;
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to connect to Modbus device ${this.device.name}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Disconnect from the Modbus device
   */
  async disconnect(): Promise<void> {
    try {
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
      }
      
      if (this.client.isOpen) {
        this.client.close(() => {
          this.logger.info(`Disconnected from Modbus device: ${this.device.name}`);
        });
      }
      
      this.connected = false;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error disconnecting from Modbus device ${this.device.name}: ${errorMessage}`);
    }
  }

  /**
   * Read all configured registers and return sensor data points
   */
  async readAllRegisters(): Promise<SensorDataPoint[]> {
    if (!this.connected) {
      // Device not connected - return BAD quality for all registers
      return this.createBadQualityDataPoints('DEVICE_OFFLINE');
    }

    const dataPoints: SensorDataPoint[] = [];
    const timestamp = new Date().toISOString();

    for (const register of this.device.registers) {
      try {
        const value = await this.readRegister(register);
        
        dataPoints.push({
          deviceName: this.device.name,
          registerName: register.name,
          value: value,
          unit: register.unit || '',
          timestamp: timestamp,
          quality: 'GOOD'  // ✅ Successful read
        });
        
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed to read register ${register.name} from device ${this.device.name}: ${errorMessage}`);
        
        // Extract quality code from error message
        const qualityCode = this.extractQualityCode(errorMessage);
        
        dataPoints.push({
          deviceName: this.device.name,
          registerName: register.name,
          value: null,  // ✅ null when quality is BAD
          unit: register.unit || '',
          timestamp: timestamp,
          quality: 'BAD',  // ✅ Failed read
          qualityCode: qualityCode  // ✅ Include error code
        });
      }
    }

    return dataPoints;
  }

  /**
   * Create BAD quality data points for all registers when device is offline
   */
  private createBadQualityDataPoints(qualityCode: string): SensorDataPoint[] {
    const timestamp = new Date().toISOString();
    return this.device.registers.map(register => ({
      deviceName: this.device.name,
      registerName: register.name,
      value: null,
      unit: register.unit || '',
      timestamp: timestamp,
      quality: 'BAD' as const,
      qualityCode: qualityCode
    }));
  }

  /**
   * Extract quality code from error message
   */
  private extractQualityCode(errorMessage: string): string {
    // Common Modbus error patterns
    if (errorMessage.includes('ETIMEDOUT') || errorMessage.includes('timeout')) {
      return 'TIMEOUT';
    }
    if (errorMessage.includes('ECONNREFUSED')) {
      return 'CONNECTION_REFUSED';
    }
    if (errorMessage.includes('EHOSTUNREACH')) {
      return 'HOST_UNREACHABLE';
    }
    if (errorMessage.includes('ECONNRESET')) {
      return 'CONNECTION_RESET';
    }
    if (errorMessage.includes('File not found') || errorMessage.includes('ENOENT')) {
      return 'PORT_NOT_FOUND';
    }
    if (errorMessage.includes('Exception')) {
      return 'MODBUS_EXCEPTION';
    }
    
    // Default
    return 'READ_ERROR';
  }

  /**
   * Read a single register
   */
  private async readRegister(register: any): Promise<number | boolean | string> {
    let rawData: any;

    switch (register.functionCode) {
      case ModbusFunctionCode.READ_COILS:
        rawData = await this.client.readCoils(register.address, register.count);
        return this.parseCoilData(rawData, register);

      case ModbusFunctionCode.READ_DISCRETE_INPUTS:
        rawData = await this.client.readDiscreteInputs(register.address, register.count);
        return this.parseCoilData(rawData, register);

      case ModbusFunctionCode.READ_HOLDING_REGISTERS:
        rawData = await this.client.readHoldingRegisters(register.address, register.count);
        return this.parseRegisterData(rawData, register);

      case ModbusFunctionCode.READ_INPUT_REGISTERS:
        rawData = await this.client.readInputRegisters(register.address, register.count);
        return this.parseRegisterData(rawData, register);

      default:
        throw new Error(`Unsupported function code: ${register.functionCode}`);
    }
  }

  /**
   * Parse coil/discrete input data
   */
  private parseCoilData(data: any, register: any): boolean {
    if (register.dataType === ModbusDataType.BOOLEAN) {
      return data.data[0] || false;
    }
    throw new Error(`Invalid data type ${register.dataType} for coil/discrete input`);
  }

  /**
   * Parse register data based on data type
   */
  private parseRegisterData(data: any, register: any): number | string {
    const buffer = Buffer.alloc(register.count * 2);
    
    for (let i = 0; i < register.count; i++) {
      if (register.endianness === Endianness.BIG) {
        buffer.writeUInt16BE(data.data[i], i * 2);
      } else {
        buffer.writeUInt16LE(data.data[i], i * 2);
      }
    }

    let value: number;

    switch (register.dataType) {
      case ModbusDataType.INT16:
        value = buffer.readInt16BE(0);
        break;
      case ModbusDataType.UINT16:
        value = buffer.readUInt16BE(0);
        break;
      case ModbusDataType.INT32:
        value = register.endianness === Endianness.BIG ? buffer.readInt32BE(0) : buffer.readInt32LE(0);
        break;
      case ModbusDataType.UINT32:
        value = register.endianness === Endianness.BIG ? buffer.readUInt32BE(0) : buffer.readUInt32LE(0);
        break;
      case ModbusDataType.FLOAT32:
        value = register.endianness === Endianness.BIG ? buffer.readFloatBE(0) : buffer.readFloatLE(0);
        break;
      case ModbusDataType.STRING:
        return buffer.toString('ascii').replace(/\0/g, '');
      default:
        throw new Error(`Unsupported data type: ${register.dataType}`);
    }

    // Apply scaling and offset
    return (value * register.scale) + register.offset;
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.connected && this.client.isOpen;
  }

  /**
   * Setup error handlers
   */
  private setupErrorHandlers(): void {
    this.client.on('error', (error: unknown) => {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Modbus client error for device ${this.device.name}: ${errorMessage}`);
      this.connected = false;
      this.scheduleReconnect();
    });

    this.client.on('close', () => {
      this.logger.warn(`Modbus connection closed for device ${this.device.name}`);
      this.connected = false;
      this.scheduleReconnect();
    });
  }

  /**
   * Schedule automatic reconnection
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    const delay = this.device.connection.retryDelay || 5000;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = undefined;
      try {
        await this.connect();
      } catch (error) {
        this.logger.error(`Reconnection failed for device ${this.device.name}`);
        this.scheduleReconnect();
      }
    }, delay);
  }
}