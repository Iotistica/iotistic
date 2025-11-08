/**
 * MQTT Manager for API
 * 
 * Handles incoming MQTT messages from devices:
 * - Sensor data (from sensor-publish feature)
 * - Device shadow updates (from shadow feature)
 * - Container logs (from cloud logging with MQTT backend)
 * - System metrics
 * 
 * Designed to be broker-agnostic (works with local or external MQTT)
 */

import mqtt from 'mqtt';
import { EventEmitter } from 'events';
import logger, { logOperation } from '../utils/logger';

export interface MqttConfig {
  brokerUrl: string;
  clientId?: string;
  username?: string;
  password?: string;
  reconnectPeriod?: number;
  keepalive?: number;
  clean?: boolean;
  qos?: 0 | 1 | 2;
}

export interface SensorData {
  deviceUuid: string;
  sensorName: string;
  timestamp: string;
  data: any;
  metadata?: Record<string, any>;
}

export interface ShadowUpdate {
  deviceUuid: string;
  reported?: any;
  desired?: any;
  timestamp: string;
  version: number;
}

export interface LogMessage {
  deviceUuid: string;
  containerId: string;
  containerName: string;
  message: string;
  timestamp: string;
  level?: string;
  stream?: 'stdout' | 'stderr';
}

export interface MetricsData {
  deviceUuid: string;
  timestamp: string;
  cpu_usage?: number;
  memory_usage?: number;
  memory_total?: number;
  storage_usage?: number;
  storage_total?: number;
  cpu_temp?: number;
  network?: any;
}

/**
 * MQTT Topic Structure (Convention)
 * 
 * IoT Device Format (used by device agent):
 *   Note: No leading $ - topics starting with $ are reserved for MQTT broker system topics
 * 
 *   Sensor Data:        iot/device/{uuid}/sensor/{sensorTopic}
 *   Shadow - Update:    iot/device/{uuid}/shadow/name/{shadowName}/update
 *   Shadow - Accepted:  iot/device/{uuid}/shadow/name/{shadowName}/update/accepted
 *   Shadow - Delta:     iot/device/{uuid}/shadow/name/{shadowName}/update/delta
 *   Shadow - Documents: iot/device/{uuid}/shadow/name/{shadowName}/update/documents
 *   Shadow - Rejected:  iot/device/{uuid}/shadow/name/{shadowName}/update/rejected
 * 
 * Legacy Format (for logs, metrics, status):
 *   Logs:            device/{uuid}/logs/{containerId}
 *   Metrics:         device/{uuid}/metrics
 *   Status:          device/{uuid}/status
 */

export class MqttManager extends EventEmitter {
  private client: mqtt.MqttClient | null = null;
  private config: Required<MqttConfig>;
  private subscriptions: Set<string> = new Set();
  private reconnecting: boolean = false;

  constructor(config: MqttConfig) {
    super();
    
    this.config = {
      brokerUrl: config.brokerUrl,
      clientId: config.clientId || `api-mqtt-${Date.now()}`,
      username: config.username || '',
      password: config.password || '',
      reconnectPeriod: config.reconnectPeriod || 5000,
      keepalive: config.keepalive || 60,
      clean: config.clean !== false,
      qos: config.qos || 1
    };
  }

  /**
   * Connect to MQTT broker
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info('Connecting to MQTT broker', { brokerUrl: this.config.brokerUrl });

      const options: mqtt.IClientOptions = {
        clientId: this.config.clientId,
        username: this.config.username || undefined,
        password: this.config.password || undefined,
        reconnectPeriod: this.config.reconnectPeriod,
        keepalive: this.config.keepalive,
        clean: this.config.clean
      };

      this.client = mqtt.connect(this.config.brokerUrl, options);

      this.client.on('connect', () => {
        logger.info('Connected to MQTT broker', { 
          clientId: this.config.clientId, 
          qos: this.config.qos 
        });
        this.reconnecting = false;
        this.resubscribe();
        resolve();
      });

      this.client.on('error', (error) => {
        logger.error('MQTT connection error', { error });
        if (!this.reconnecting) {
          reject(error);
        }
      });

      this.client.on('reconnect', () => {
        logger.info('Reconnecting to MQTT broker');
        this.reconnecting = true;
      });

      this.client.on('offline', () => {
        logger.warn('MQTT client offline');
      });

      this.client.on('message', (topic, payload) => {
        logger.debug('Raw MQTT message event fired', { topic });
        this.handleMessage(topic, payload);
      });
    });
  }

  /**
   * Disconnect from MQTT broker
   */
  async disconnect(): Promise<void> {
    if (!this.client) {
      return;
    }

    return new Promise((resolve) => {
      this.client!.end(false, {}, () => {
        logger.info('Disconnected from MQTT broker');
        this.client = null;
        resolve();
      });
    });
  }

  /**
   * Subscribe to device topics
   * 
   * @param deviceUuid - Device UUID or '*' for all devices
   * @param topics - Array of topic types: 'sensor', 'shadow', 'logs', 'metrics', 'status'
   */
  subscribe(deviceUuid: string, topics: string[]): void {
    if (!this.client) {
      throw new Error('MQTT client not connected');
    }

    // Convert '*' to MQTT wildcard '+'
    // MQTT wildcards: + (single level), # (multi-level)
    const mqttDevicePattern = deviceUuid === '*' ? '+' : deviceUuid;

    const topicPatterns = topics.map(type => {
      switch (type) {
        case 'sensor':
          return `iot/device/${mqttDevicePattern}/sensor/+`;
        case 'state':
          return `iot/device/${mqttDevicePattern}/state`;
      }
    });

    logger.info('Subscribing to MQTT topic patterns', { 
      count: topicPatterns.length, 
      patterns: topicPatterns 
    });
    
    // Use Promise.all to track all subscriptions
    const subscriptionPromises = topicPatterns.map(pattern => {
      return new Promise<void>((resolve, reject) => {
        this.client!.subscribe(pattern, { qos: this.config.qos }, (err) => {
          if (err) {
            logger.error('Failed to subscribe to MQTT topic', { pattern, error: err });
            reject(err);
          } else {
            logger.debug('Subscribed to MQTT topic', { pattern, qos: this.config.qos });
            this.subscriptions.add(pattern);
            resolve();
          }
        });
      });
    });

    // Wait for all subscriptions and log summary
    Promise.all(subscriptionPromises)
      .then(() => {
        logger.info('Successfully subscribed to all MQTT topics', { count: topicPatterns.length });
      })
      .catch(err => {
        logger.error('Some MQTT subscriptions failed', { error: err });
      });
  }

  /**
   * Subscribe to all devices
   */
  subscribeToAll(topics: string[]): void {
    this.subscribe('*', topics);
  }

  /**
   * Unsubscribe from topics
   */
  unsubscribe(patterns: string[]): void {
    if (!this.client) {
      return;
    }

    patterns.forEach(pattern => {
      this.client!.unsubscribe(pattern, {}, (err) => {
        if (err) {
          logger.error('Failed to unsubscribe from MQTT topic', { pattern, error: err });
        } else {
          logger.debug('Unsubscribed from MQTT topic', { pattern });
          this.subscriptions.delete(pattern);
        }
      });
    });
  }

  /**
   * Publish message to device topic
   */
  publish(topic: string, message: any): void {
    if (!this.client) {
      throw new Error('MQTT client not connected');
    }

    const payload = typeof message === 'string' ? message : JSON.stringify(message);

    this.client.publish(topic, payload, { qos: this.config.qos }, (err) => {
      if (err) {
        logger.error('Failed to publish MQTT message', { topic, error: err });
      }
    });
  }

  /**
   * Re-subscribe to all topics after reconnection
   */
  private resubscribe(): void {
    if (!this.client || this.subscriptions.size === 0) {
      return;
    }
    const topics = Array.from(this.subscriptions);

    this.client.subscribe(topics, { qos: this.config.qos }, (err) => {
      if (err) {
        logger.error('Failed to re-subscribe:', err);
      } else {
        logger.info('Re-subscribed to MQTT topics', { count: topics.length });
      }
    });
  }

  /**
   * Handle incoming MQTT messages
   */
  private handleMessage(topic: string, payload: Buffer): void {
    const message = payload.toString();
    
    try {
      // Parse standard topic format: iot/device/{uuid}/{type}/...
      const parts = topic.split('/');
      const deviceUuid = parts[2];
      const messageType = parts[3];
      
      // START operation
      logOperation.start('mqtt-message', `Received ${messageType}`, {
        topic,
        deviceUuid: deviceUuid?.substring(0, 8) + '...',
        messageType,
        payloadSize: payload.length
      });

      // Parse JSON payload
      let data: any;
      try {
        data = JSON.parse(message);
      } catch {
        // Non-JSON payload (e.g., raw log messages)
        data = message;
        logOperation.step('mqtt-message', 'Non-JSON payload detected', { 
          messageType,
          preview: message.substring(0, 100)
        });
      }

      // Route message based on type
      switch (messageType) {
        case 'sensor':
          logOperation.step('mqtt-message', 'Routing to sensor handler', { deviceUuid: deviceUuid?.substring(0, 8) + '...' });
          this.handleSensorData(deviceUuid, parts[3], data);
          break;
        case 'state':
          logOperation.step('mqtt-message', 'Processing state update', { 
            deviceUuid: deviceUuid.substring(0, 8) + '...',
            hasVersion: 'version' in data
          });
          this.emit('state', data);
          break;
        case 'shadow':
          logOperation.step('mqtt-message', 'Routing to shadow handler', { deviceUuid: deviceUuid?.substring(0, 8) + '...' });
          this.handleShadowUpdate(deviceUuid, parts[3], data);
          break;
        case 'logs':
          logOperation.step('mqtt-message', 'Routing to log handler', { deviceUuid: deviceUuid?.substring(0, 8) + '...' });
          this.handleLogMessage(deviceUuid, parts[3], data);
          break;
        case 'metrics':
          logOperation.step('mqtt-message', 'Routing to metrics handler', { deviceUuid: deviceUuid?.substring(0, 8) + '...' });
          this.handleMetrics(deviceUuid, data);
          break;
        case 'status':
          logOperation.step('mqtt-message', 'Routing to status handler', { deviceUuid: deviceUuid?.substring(0, 8) + '...' });
          this.handleStatus(deviceUuid, data);
          break;
        default:
          logger.warn(`Unknown message type`, {
            operation: 'mqtt-message',
            messageType,
            topic
          });
          this.emit('unknown', { topic, deviceUuid, data });
      }
      
      // DONE operation
      logOperation.complete('mqtt-message', `Message handled`, { messageType });

    } catch (error) {
      logOperation.error('mqtt-message', 'Failed to handle message', error as Error, { topic });
    }
  }

  /**
   * Handle IoT Shadow message
   * Topic formats:
   *   - Device publishes: iot/device/{uuid}/shadow/name/{shadowName}/update
   *   - Cloud responses: iot/device/{uuid}/shadow/name/{shadowName}/update/{accepted|delta|rejected|documents}
   */
  private handleIotShadowMessage(topic: string, message: string): void {
    try {
      // Parse IoT Shadow topic
      const parts = topic.split('/');
      
      if (parts.length < 6 || parts[0] !== 'iot' || parts[1] !== 'device') {
        console.warn('⚠️  Invalid IoT Shadow topic:', topic);
        return;
      }

      const deviceUuid = parts[2];
      const shadowName = parts[4];
      const updateType = parts[6] || 'update'; // 'update' (device publish), 'accepted', 'delta', etc.

      // Parse JSON payload
      let data: any;
      try {
        data = JSON.parse(message);
      } catch (error) {
        console.error('❌ Failed to parse shadow message:', error);
        return;
      }

      console.log(`🔔 Shadow message: ${deviceUuid}/${shadowName} [${updateType}]`);

      // Handle different shadow update types
      if (updateType === 'update') {
        // Device publishing state update (treat as reported state)
        this.handleShadowReported(deviceUuid, shadowName, data);
      } else if (updateType === 'accepted') {
        // Device successfully reported state
        this.handleShadowReported(deviceUuid, shadowName, data);
      } else if (updateType === 'delta') {
        // Cloud set desired state (desired !== reported)
        this.handleShadowDelta(deviceUuid, shadowName, data);
      } else if (updateType === 'documents') {
        // Complete shadow document
        this.handleShadowDocuments(deviceUuid, shadowName, data);
      } else if (updateType === 'rejected') {
        // Shadow update was rejected
        console.error(`❌ Shadow update rejected for ${deviceUuid}/${shadowName}:`, data.message);
      }

    } catch (error) {
      console.error('❌ Error handling AWS IoT Shadow message:', error);
    }
  }

  /**
   * Handle shadow reported state (from device)
   */
  private handleShadowReported(deviceUuid: string, shadowName: string, data: any): void {
    // Extract reported state from shadow update response
    const reported = data.state?.reported || data.state || data;
    
    const shadowUpdate: ShadowUpdate = {
      deviceUuid,
      reported,
      timestamp: data.timestamp || new Date().toISOString(),
      version: data.version || 0
    };

    console.log(`🌓 Shadow reported from ${deviceUuid}/${shadowName}`);
    this.emit('shadow', shadowUpdate);
    this.emit('shadow:reported', shadowUpdate);
  }

  /**
   * Handle shadow delta (desired state from cloud)
   */
  private handleShadowDelta(deviceUuid: string, shadowName: string, data: any): void {
    // Delta contains the difference between desired and reported
    const desired = data.state || data;
    
    const shadowUpdate: ShadowUpdate = {
      deviceUuid,
      desired,
      timestamp: data.timestamp || new Date().toISOString(),
      version: data.version || 0
    };

    console.log(`🌓 Shadow delta for ${deviceUuid}/${shadowName}`);
    this.emit('shadow', shadowUpdate);
    this.emit('shadow:desired', shadowUpdate);
  }

  /**
   * Handle shadow documents (complete shadow state)
   */
  private handleShadowDocuments(deviceUuid: string, shadowName: string, data: any): void {
    const shadowUpdate: ShadowUpdate = {
      deviceUuid,
      reported: data.current?.state?.reported,
      desired: data.current?.state?.desired,
      timestamp: data.timestamp || new Date().toISOString(),
      version: data.current?.version || 0
    };

    console.log(`🌓 Shadow documents for ${deviceUuid}/${shadowName}`);
    this.emit('shadow', shadowUpdate);
  }

  /**
   * Handle IoT sensor message
   * Topic format: iot/device/{uuid}/sensor/{sensorTopic}
   */
  private handleIotSensorMessage(topic: string, message: string): void {
    try {
      // Parse IoT sensor topic: iot/device/{uuid}/sensor/{sensorTopic}
      const parts = topic.split('/');
      
      if (parts.length < 4 || parts[0] !== 'iot' || parts[1] !== 'device') {
        console.warn('⚠️  Invalid IoT sensor topic:', topic);
        return;
      }

      const deviceUuid = parts[2];
      const sensorTopic = parts[4]; // temperature, humidity, etc.

      // Parse JSON payload
      let data: any;
      try {
        data = JSON.parse(message);
      } catch (error) {
        console.error('❌ Failed to parse sensor message:', error);
        return;
      }

      // Extract sensor name from data or use topic as fallback
      const sensorName = data.sensorName || data.sensor || sensorTopic;

      this.handleSensorData(deviceUuid, sensorName, data);

    } catch (error) {
      console.error('❌ Error handling AWS IoT sensor message:', error);
    }
  }

  /**
   * Handle sensor data message
   */
  private handleSensorData(deviceUuid: string, sensorName: string, data: any): void {
    const sensorData: SensorData = {
      deviceUuid,
      sensorName,
      timestamp: data.timestamp || new Date().toISOString(),
      data: data.data || data,
      metadata: data.metadata
    };

    console.log(`📊 Sensor data from ${deviceUuid}/${sensorName}`);
    this.emit('sensor', sensorData);
  }

  /**
   * Handle shadow update message
   */
  private handleShadowUpdate(deviceUuid: string, updateType: string, data: any): void {
    const shadowUpdate: ShadowUpdate = {
      deviceUuid,
      timestamp: data.timestamp || new Date().toISOString(),
      version: data.version || 0,
      ...(updateType === 'reported' ? { reported: data } : { desired: data })
    };

    console.log(`🌓 Shadow update from ${deviceUuid}: ${updateType}`);
    this.emit('shadow', shadowUpdate);
    this.emit(`shadow:${updateType}`, shadowUpdate);
  }

  /**
   * Handle log message
   */
  private handleLogMessage(deviceUuid: string, containerId: string, data: any): void {
    const logMessage: LogMessage = {
      deviceUuid,
      containerId,
      containerName: data.containerName || containerId,
      message: data.message || data,
      timestamp: data.timestamp || new Date().toISOString(),
      level: data.level,
      stream: data.stream
    };

    console.log(`📝 Log from ${deviceUuid}/${containerId}`);
    this.emit('log', logMessage);
  }

  /**
   * Handle metrics message
   */
  private handleMetrics(deviceUuid: string, data: any): void {
    const metrics: MetricsData = {
      deviceUuid,
      timestamp: data.timestamp || new Date().toISOString(),
      cpu_usage: data.cpu_usage,
      memory_usage: data.memory_usage,
      memory_total: data.memory_total,
      storage_usage: data.storage_usage,
      storage_total: data.storage_total,
      cpu_temp: data.cpu_temp,
      network: data.network
    };

    console.log(`📈 Metrics from ${deviceUuid}`);
    this.emit('metrics', metrics);
  }

  /**
   * Handle status message
   */
  private handleStatus(deviceUuid: string, data: any): void {
    console.log(`📡 Status from ${deviceUuid}:`, data.status || data);
    this.emit('status', { deviceUuid, status: data });
  }

  /**
   * Get connection status
   */
  isConnected(): boolean {
    return this.client?.connected || false;
  }

  /**
   * Get active subscriptions
   */
  getSubscriptions(): string[] {
    return Array.from(this.subscriptions);
  }
}

export default MqttManager;
