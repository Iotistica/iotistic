import { EventEmitter } from 'events';
import { ModbusAdapterConfig, ModbusDevice } from './types';
import { SensorDataPoint, DeviceStatus, Logger } from '../common/types';
import { ModbusClient } from './modbus-client';
import { SocketServer } from '../common/socket-server';

/**
 * Main Modbus Adapter class that coordinates Modbus devices and Unix socket output
 */
export class ModbusAdapter extends EventEmitter {
  private config: ModbusAdapterConfig;
  private logger: Logger;
  private clients: Map<string, ModbusClient> = new Map();
  private socketServer: SocketServer;
  private pollTimers: Map<string, NodeJS.Timeout> = new Map();
  private deviceStatuses: Map<string, DeviceStatus> = new Map();
  private running = false;

  constructor(config: ModbusAdapterConfig, logger: Logger) {
    super();
    this.config = config;
    this.logger = logger;
    this.socketServer = new SocketServer(config.output, logger);
    
    this.initializeDeviceStatuses();
  }

  /**
   * Start the Modbus adapter
   */
  async start(): Promise<void> {
    if (this.running) {
      return;
    }

    try {
      this.logger.info('Starting Modbus Adapter...');

      // Start socket server
      await this.socketServer.start();

      // Initialize and connect all enabled devices
      for (const deviceConfig of this.config.devices) {
        if (deviceConfig.enabled) {
          await this.initializeDevice(deviceConfig);
        }
      }

      this.running = true;
      this.logger.info('Modbus Adapter started successfully');
      this.emit('started');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to start Modbus Adapter: ${errorMessage}`);
      await this.stop();
      throw error;
    }
  }

  /**
   * Stop the Modbus adapter
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      this.logger.info('Stopping Modbus Adapter...');

      // Stop all polling timers
      for (const [deviceName, timer] of this.pollTimers) {
        clearTimeout(timer);
        this.pollTimers.delete(deviceName);
      }

      // Disconnect all devices
      const disconnectPromises = Array.from(this.clients.values()).map(client => 
        client.disconnect().catch(error => 
          this.logger.warn(`Error disconnecting device: ${error}`)
        )
      );
      await Promise.all(disconnectPromises);
      this.clients.clear();

      // Stop socket server
      await this.socketServer.stop();

      this.running = false;
      this.logger.info('Modbus Adapter stopped successfully');
      this.emit('stopped');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error stopping Modbus Adapter: ${errorMessage}`);
    }
  }

  /**
   * Get status of all devices
   */
  getDeviceStatuses(): DeviceStatus[] {
    return Array.from(this.deviceStatuses.values());
  }

  /**
   * Get status of a specific device
   */
  getDeviceStatus(deviceName: string): DeviceStatus | undefined {
    return this.deviceStatuses.get(deviceName);
  }

  /**
   * Enable a device
   */
  async enableDevice(deviceName: string): Promise<void> {
    const deviceConfig = this.config.devices.find(d => d.name === deviceName);
    if (!deviceConfig) {
      throw new Error(`Device not found: ${deviceName}`);
    }

    if (deviceConfig.enabled) {
      this.logger.warn(`Device ${deviceName} is already enabled`);
      return;
    }

    deviceConfig.enabled = true;
    
    if (this.running) {
      await this.initializeDevice(deviceConfig);
    }

    this.logger.info(`Device ${deviceName} enabled`);
    this.emit('device-enabled', deviceName);
  }

  /**
   * Disable a device
   */
  async disableDevice(deviceName: string): Promise<void> {
    const deviceConfig = this.config.devices.find(d => d.name === deviceName);
    if (!deviceConfig) {
      throw new Error(`Device not found: ${deviceName}`);
    }

    if (!deviceConfig.enabled) {
      this.logger.warn(`Device ${deviceName} is already disabled`);
      return;
    }

    deviceConfig.enabled = false;
    
    if (this.running) {
      await this.cleanupDevice(deviceName);
    }

    this.logger.info(`Device ${deviceName} disabled`);
    this.emit('device-disabled', deviceName);
  }

  /**
   * Check if adapter is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get number of connected socket clients
   */
  getSocketClientCount(): number {
    return this.socketServer.getClientCount();
  }

  /**
   * Initialize device statuses
   */
  private initializeDeviceStatuses(): void {
    for (const device of this.config.devices) {
      this.deviceStatuses.set(device.name, {
        deviceName: device.name,
        connected: false,
        lastPoll: null,
        errorCount: 0,
        lastError: null
      });
    }
  }

  /**
   * Initialize and start polling for a device
   */
  private async initializeDevice(deviceConfig: ModbusDevice): Promise<void> {
    try {
      this.logger.info(`Initializing device: ${deviceConfig.name}`);

      // Create Modbus client
      const client = new ModbusClient(deviceConfig, this.logger);
      this.clients.set(deviceConfig.name, client);

      // Connect to device
      await client.connect();

      // Update device status
      const status = this.deviceStatuses.get(deviceConfig.name)!;
      status.connected = true;
      status.lastError = null;

      // Start polling
      this.startPolling(deviceConfig);

      this.logger.info(`Device ${deviceConfig.name} initialized successfully`);
      this.emit('device-connected', deviceConfig.name);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to initialize device ${deviceConfig.name}: ${errorMessage}`);

      // Update device status
      const status = this.deviceStatuses.get(deviceConfig.name)!;
      status.connected = false;
      status.errorCount++;
      status.lastError = errorMessage;

      this.emit('device-error', deviceConfig.name, error);
      
      // ✅ Start polling even when disconnected (to send BAD quality data)
      this.startPolling(deviceConfig);
      
      // Schedule retry
      this.scheduleDeviceRetry(deviceConfig);
    }
  }

  /**
   * Cleanup device resources
   */
  private async cleanupDevice(deviceName: string): Promise<void> {
    // Stop polling timer
    const timer = this.pollTimers.get(deviceName);
    if (timer) {
      clearTimeout(timer);
      this.pollTimers.delete(deviceName);
    }

    // Disconnect client
    const client = this.clients.get(deviceName);
    if (client) {
      await client.disconnect();
      this.clients.delete(deviceName);
    }

    // Update device status
    const status = this.deviceStatuses.get(deviceName);
    if (status) {
      status.connected = false;
      status.lastPoll = null;
    }

    this.emit('device-disconnected', deviceName);
  }

  /**
   * Start polling for a device
   */
  private startPolling(deviceConfig: ModbusDevice): void {
    const pollDevice = async () => {
      try {
        const client = this.clients.get(deviceConfig.name);
        if (!client || !client.isConnected()) {
          this.logger.warn(`Device ${deviceConfig.name} is not connected, skipping poll`);
          
          // ✅ Still send BAD quality data points to indicate device is offline
          const timestamp = new Date().toISOString();
          const badDataPoints = deviceConfig.registers.map(register => ({
            deviceName: deviceConfig.name,
            registerName: register.name,
            value: null,
            unit: register.unit || '',
            timestamp: timestamp,
            quality: 'BAD' as const,
            qualityCode: 'DEVICE_OFFLINE'
          }));
          
          if (badDataPoints.length > 0) {
            this.socketServer.sendData(badDataPoints);
          }
          
          return;
        }

        // Read all registers
        const dataPoints = await client.readAllRegisters();

        // Update device status
        const status = this.deviceStatuses.get(deviceConfig.name)!;
        status.lastPoll = new Date();

        // Send data to socket server (includes both GOOD and BAD quality points)
        if (dataPoints.length > 0) {
          this.socketServer.sendData(dataPoints);
          this.emit('data-received', deviceConfig.name, dataPoints);
        }

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error(`Error polling device ${deviceConfig.name}: ${errorMessage}`);

        // Update device status
        const status = this.deviceStatuses.get(deviceConfig.name)!;
        status.connected = false;
        status.errorCount++;
        status.lastError = errorMessage;

        this.emit('device-error', deviceConfig.name, error);
        
        // ✅ Send BAD quality data points with error code
        const timestamp = new Date().toISOString();
        const qualityCode = this.extractQualityCode(errorMessage);
        const badDataPoints = deviceConfig.registers.map(register => ({
          deviceName: deviceConfig.name,
          registerName: register.name,
          value: null,
          unit: register.unit || '',
          timestamp: timestamp,
          quality: 'BAD' as const,
          qualityCode: qualityCode
        }));
        
        if (badDataPoints.length > 0) {
          this.socketServer.sendData(badDataPoints);
        }
        
        // Try to reconnect
        this.scheduleDeviceRetry(deviceConfig);
        return;
      }

      // Schedule next poll
      const timer = setTimeout(pollDevice, deviceConfig.pollInterval);
      this.pollTimers.set(deviceConfig.name, timer);
    };

    // Start first poll immediately
    setTimeout(pollDevice, 100);
  }

  /**
   * Extract quality code from error message
   */
  private extractQualityCode(errorMessage: string): string {
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
    
    return 'DEVICE_ERROR';
  }

  /**
   * Schedule device retry
   */
  private scheduleDeviceRetry(deviceConfig: ModbusDevice): void {
    const retryDelay = deviceConfig.connection.retryDelay || 5000;
    
    setTimeout(async () => {
      if (this.running && deviceConfig.enabled) {
        this.logger.info(`Retrying connection to device: ${deviceConfig.name}`);
        await this.cleanupDevice(deviceConfig.name);
        await this.initializeDevice(deviceConfig);
      }
    }, retryDelay);
  }
}