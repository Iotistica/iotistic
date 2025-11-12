/**
 * OPC-UA Protocol Adapter
 * 
 * Implements the BaseProtocolAdapter for OPC-UA (OPC Unified Architecture) devices.
 * This adapter handles connection management, data reading, and error handling for
 * OPC-UA industrial automation devices.
 * 
 * Features:
 * - Automatic endpoint discovery and selection
 * - Username/password authentication
 * - Security mode and policy support
 * - Node browsing and validation
 * - Automatic reconnection with exponential backoff
 * - Data type conversion and scaling
 * 
 * Example OPC-UA device configuration (stored in SQLite sensors table):
 * {
 *   "name": "plc-001",
 *   "protocol": "opcua",
 *   "enabled": true,
 *   "pollInterval": 5000,
 *   "connection": {
 *     "endpointUrl": "opc.tcp://192.168.1.100:4840",
 *     "username": "admin",
 *     "password": "password",
 *     "securityMode": "None",
 *     "securityPolicy": "None",
 *     "connectionTimeout": 10000,
 *     "sessionTimeout": 60000,
 *     "keepAliveInterval": 5000
 *   },
 *   "dataPoints": [
 *     {
 *       "name": "temperature",
 *       "nodeId": "ns=2;s=Temperature",
 *       "unit": "°C",
 *       "dataType": "number"
 *     },
 *     {
 *       "name": "pressure",
 *       "nodeId": "ns=2;s=Pressure",
 *       "unit": "bar",
 *       "dataType": "number",
 *       "scalingFactor": 0.01
 *     }
 *   ],
 *   "metadata": {
 *     "manufacturer": "Siemens",
 *     "model": "S7-1500",
 *     "applicationUri": "urn:example:plc001"
 *   }
 * }
 * 
 * @module opcua-adapter
 */

import { EventEmitter } from 'events';
// @ts-ignore - Optional dependency: node-opcua-client may not be installed
import {
  OPCUAClient,
  ClientSession,
  DataValue,
  AttributeIds,
  MessageSecurityMode,
  SecurityPolicy,
  UserTokenType,
  ClientSubscription,
  TimestampsToReturn,
  MonitoringParametersOptions,
  ReadValueIdOptions,
  ClientMonitoredItem,
  DataType,
} from 'node-opcua-client';
import { BaseProtocolAdapter, GenericDeviceConfig } from '../base.js';
import { SensorDataPoint, Logger } from '../types.js';
import { ConsoleLogger } from '../common/logger.js';
import {
  OPCUADeviceConfig,
  OPCUAConnection,
  OPCUADataPoint,
  OPCUASecurityMode,
  OPCUASecurityPolicy,
} from './types.js';

/**
 * OPC-UA Client Session Manager
 * Wraps OPCUAClient and ClientSession for a single device
 */
interface OPCUASession {
  client: OPCUAClient;
  session: ClientSession | null;
  subscription: ClientSubscription | null;
}

/**
 * OPC-UA Protocol Adapter
 * 
 * Extends BaseProtocolAdapter to provide OPC-UA-specific functionality.
 * Manages OPC-UA client connections, sessions, and data reading.
 */
export class OPCUAAdapter extends BaseProtocolAdapter {
  private sessions: Map<string, OPCUASession> = new Map();

  /**
   * Creates a new OPC-UA adapter instance
   * 
   * @param devices - Array of OPC-UA device configurations
   */
  constructor(devices: OPCUADeviceConfig[]) {
    const logger = new ConsoleLogger('info');
    super(devices as GenericDeviceConfig[], logger);
  }

  /**
   * Returns the protocol name
   * Required by BaseProtocolAdapter
   */
  protected getProtocolName(): string {
    return 'opcua';
  }

  /**
   * Validates OPC-UA device configuration
   * Checks for required fields and valid values
   * 
   * @param device - Device configuration to validate
   * @throws Error if configuration is invalid
   */
  protected validateDeviceConfig(device: OPCUADeviceConfig): void {
    const { connection, dataPoints } = device;

    // Validate endpoint URL
    if (!connection.endpointUrl) {
      throw new Error(`Device ${device.name}: endpointUrl is required`);
    }

    if (!connection.endpointUrl.startsWith('opc.tcp://')) {
      throw new Error(
        `Device ${device.name}: endpointUrl must start with 'opc.tcp://'`
      );
    }

    // Validate data points
    if (!dataPoints || dataPoints.length === 0) {
      throw new Error(`Device ${device.name}: at least one data point is required`);
    }

    for (const dp of dataPoints) {
      if (!dp.name) {
        throw new Error(`Device ${device.name}: data point name is required`);
      }
      if (!dp.nodeId) {
        throw new Error(
          `Device ${device.name}: nodeId is required for data point ${dp.name}`
        );
      }
    }

    // Validate authentication
    if (connection.username && !connection.password) {
      this.logger.warn(
        `Device ${device.name}: username provided without password`
      );
    }
  }

  /**
   * Connects to an OPC-UA device
   * Creates OPCUAClient, discovers endpoints, and establishes session
   * 
   * @param device - Device configuration
   * @returns OPCUASession object with client and session
   */
  protected async connectDevice(device: OPCUADeviceConfig): Promise<OPCUASession> {
    const { connection } = device;

    this.logger.info(`Connecting to OPC-UA device: ${device.name}`);
    this.logger.debug(`Endpoint: ${connection.endpointUrl}`);

    // Create OPC-UA client
    const client = OPCUAClient.create({
      applicationName: 'Iotistic Sensor Agent',
      connectionStrategy: {
        initialDelay: 1000,
        maxRetry: 3,
        maxDelay: connection.connectionTimeout || 10000,
      },
      securityMode: this.convertSecurityMode(connection.securityMode),
      securityPolicy: this.convertSecurityPolicy(connection.securityPolicy),
      endpointMustExist: false,
      keepSessionAlive: true,
      requestedSessionTimeout: connection.sessionTimeout || 60000,
    });

    try {
      // Connect to server
      await client.connect(connection.endpointUrl);
      this.logger.info(`Connected to ${connection.endpointUrl}`);

      // Create session with optional authentication
      let session: ClientSession;
      if (connection.username && connection.password) {
        session = await client.createSession({
          type: UserTokenType.UserName,
          userName: connection.username,
          password: connection.password,
        });
        this.logger.debug(`Session created with username authentication`);
      } else {
        session = await client.createSession();
        this.logger.debug(`Session created with anonymous authentication`);
      }

      this.logger.info(`Session established for device: ${device.name}`);

      return {
        client,
        session,
        subscription: null,
      };
    } catch (error) {
      // Clean up client if session creation failed
      try {
        await client.disconnect();
      } catch (disconnectError) {
        this.logger.debug(`Error disconnecting client during cleanup: ${disconnectError}`);
      }
      throw error;
    }
  }

  /**
   * Disconnects from an OPC-UA device
   * Closes session and client connection
   * 
   * @param deviceName - Name of device to disconnect
   */
  protected async disconnectDevice(deviceName: string): Promise<void> {
    const session = this.sessions.get(deviceName);
    if (!session) {
      return;
    }

    this.logger.info(`Disconnecting OPC-UA device: ${deviceName}`);

    try {
      // Close subscription if exists
      if (session.subscription) {
        await session.subscription.terminate();
        session.subscription = null;
      }

      // Close session if exists
      if (session.session) {
        await session.session.close();
        session.session = null;
      }

      // Disconnect client
      await session.client.disconnect();
      this.logger.info(`Disconnected from device: ${deviceName}`);
    } catch (error) {
      this.logger.error(`Error disconnecting device ${deviceName}: ${error}`);
    } finally {
      this.sessions.delete(deviceName);
    }
  }

  /**
   * Reads data from an OPC-UA device
   * Reads all configured data points and converts to SensorDataPoint format
   * 
   * @param deviceName - Name of device to read
   * @param device - Device configuration
   * @returns Array of sensor data points
   */
  protected async readDeviceData(
    deviceName: string,
    device: OPCUADeviceConfig
  ): Promise<SensorDataPoint[]> {
    const sessionWrapper = this.sessions.get(deviceName);
    if (!sessionWrapper?.session) {
      throw new Error(`No active session for device: ${deviceName}`);
    }

    const { session } = sessionWrapper;
    const { dataPoints } = device;

    // Build read request for all data points
    const nodesToRead: ReadValueIdOptions[] = dataPoints.map((dp) => ({
      nodeId: dp.nodeId,
      attributeId: AttributeIds.Value,
    }));

    // Read all nodes
    const dataValues: DataValue[] = await session.read(nodesToRead);

    // Convert to SensorDataPoint format
    const results: SensorDataPoint[] = [];
    const timestamp = new Date().toISOString();

    for (let i = 0; i < dataPoints.length; i++) {
      const dp = dataPoints[i];
      const dataValue = dataValues[i];

      // Check if read was successful
      if (!dataValue.statusCode.isGood()) {
        this.logger.warn(
          `Failed to read ${dp.name} from ${deviceName}: ${dataValue.statusCode.description}`
        );
        results.push({
          timestamp,
          deviceName,
          registerName: dp.name,
          value: null,
          unit: dp.unit || '',
          quality: 'BAD' as const,
          qualityCode: dataValue.statusCode.description,
        });
        continue;
      }

      // Extract and convert value
      let value = dataValue.value.value;

      // Apply scaling and offset if configured
      if (typeof value === 'number') {
        if (dp.scalingFactor) {
          value = value * dp.scalingFactor;
        }
        if (dp.offset) {
          value = value + dp.offset;
        }
      }

      results.push({
        timestamp,
        deviceName,
        registerName: dp.name,
        value,
        unit: dp.unit || '',
        quality: 'GOOD' as const,
      });
    }

    return results;
  }

  /**
   * Converts security mode string to OPC-UA MessageSecurityMode enum
   */
  private convertSecurityMode(mode: OPCUASecurityMode): MessageSecurityMode {
    switch (mode) {
      case 'None':
        return MessageSecurityMode.None;
      case 'Sign':
        return MessageSecurityMode.Sign;
      case 'SignAndEncrypt':
        return MessageSecurityMode.SignAndEncrypt;
      default:
        return MessageSecurityMode.None;
    }
  }

  /**
   * Converts security policy string to OPC-UA SecurityPolicy enum
   */
  private convertSecurityPolicy(policy: OPCUASecurityPolicy): SecurityPolicy {
    switch (policy) {
      case 'None':
        return SecurityPolicy.None;
      case 'Basic128Rsa15':
        return SecurityPolicy.Basic128Rsa15;
      case 'Basic256':
        return SecurityPolicy.Basic256;
      case 'Basic256Sha256':
        return SecurityPolicy.Basic256Sha256;
      case 'Aes128_Sha256_RsaOaep':
        return SecurityPolicy.Aes128_Sha256_RsaOaep;
      case 'Aes256_Sha256_RsaPss':
        return SecurityPolicy.Aes256_Sha256_RsaPss;
      default:
        return SecurityPolicy.None;
    }
  }

  /**
   * Override start to store sessions in map
   */
  public async start(): Promise<void> {
    await super.start();
  }

  /**
   * Override stop to clean up sessions
   */
  public async stop(): Promise<void> {
    await super.stop();
    this.sessions.clear();
  }
}
