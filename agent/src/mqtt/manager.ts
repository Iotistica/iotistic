import mqtt, { MqttClient, IClientOptions, IClientPublishOptions } from 'mqtt';
import type { AgentLogger } from '../logging/agent-logger';
import { LogComponents } from '../logging/types';

/**
 * Centralized MQTT Manager - Singleton
 * 
 * This manager provides a single MQTT connection shared across the application.
 * Used by jobs, shadows, logging, and other features that need MQTT.
 */
export class MqttManager {
  private static instance: MqttManager;
  private client: MqttClient | null = null;
  private connected = false;
  private messageHandlers: Map<string, Set<(topic: string, payload: Buffer) => void>> = new Map();
  private connectionPromise: Promise<void> | null = null;
  private debug = false;
  private logger?: AgentLogger;

  private constructor() {}

  public static getInstance(): MqttManager {
    if (!MqttManager.instance) {
      MqttManager.instance = new MqttManager();
    }
    return MqttManager.instance;
  }

  /**
   * Set logger for the MQTT manager (singleton pattern)
   */
  public setLogger(logger: AgentLogger | undefined): void {
    this.logger = logger;
  }

  /**
   * Connect to MQTT broker (idempotent - can be called multiple times)
   */
  public async connect(brokerUrl: string, options?: IClientOptions): Promise<void> {
    // If already connected, return
    if (this.client && this.connected) {
      this.debugLog('Already connected to MQTT broker');
      return Promise.resolve();
    }

    // If connection in progress, wait for it
    if (this.connectionPromise) {
      this.debugLog('Connection already in progress, waiting...');
      return this.connectionPromise;
    }

    // Clean up old client if exists (prevent listener leaks on reconnection)
    if (this.client) {
      this.debugLog('Cleaning up old MQTT client before reconnection');
      this.client.removeAllListeners();
      try {
        this.client.end(true);
      } catch (error) {
        this.debugLog(`Error ending old client: ${error}`);
      }
      this.client = null;
    }

    this.debugLog(`Connecting to MQTT broker: ${brokerUrl}`);

    this.connectionPromise = new Promise((resolve, reject) => {
      const connectionTimeout = setTimeout(() => {
        if (!this.connected && this.client) {
          this.debugLog('Connection timeout - MQTT broker not responding');
          this.client.end(true);
          reject(new Error(`MQTT connection timeout after 10s: ${brokerUrl}`));
        }
      }, 10000);

      this.client = mqtt.connect(brokerUrl, {
        ...options,
        clean: true,
        reconnectPeriod: 5000,
        connectTimeout: 10000,
      });

      this.client.on('connect', () => {
        clearTimeout(connectionTimeout);
        this.connected = true;
        this.debugLog('Connected to MQTT broker');
        this.connectionPromise = null;
        resolve();
      });

      this.client.on('error', (err) => {
        this.debugLog(`MQTT error: ${err.message}`);
        if (!this.connected) {
          clearTimeout(connectionTimeout);
          this.connectionPromise = null;
          reject(err);
        }
      });

      this.client.on('reconnect', () => {
        this.debugLog('🔄 Reconnecting to MQTT broker...');
      });

      this.client.on('offline', () => {
        this.connected = false;
        this.debugLog('📴 MQTT client offline');
      });

      this.client.on('close', () => {
        this.connected = false;
        this.debugLog('🔌 MQTT connection closed');
      });

      // Set up global message handler
      this.client.on('message', (topic: string, payload: Buffer) => {
        this.routeMessage(topic, payload);
      });
    });

    return this.connectionPromise;
  }

  /**
   * Publish message to MQTT topic
   */
  public async publish(
    topic: string,
    payload: string | Buffer,
    options?: IClientPublishOptions
  ): Promise<void> {
    if (!this.client || !this.connected) {
      throw new Error('MQTT client not connected');
    }

    return new Promise((resolve, reject) => {
      this.client!.publish(topic, payload, options || {}, (error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }

  /**
   * Subscribe to MQTT topic with optional handler
   */
  public async subscribe(
    topic: string,
    options?: mqtt.IClientSubscribeOptions,
    handler?: (topic: string, payload: Buffer) => void
  ): Promise<void> {
    if (!this.client || !this.connected) {
      throw new Error('MQTT client not connected');
    }

    return new Promise((resolve, reject) => {
      this.client!.subscribe(topic, options || {}, (error, granted) => {
        if (error) {
          const errorMsg = `Subscribe error: ${error.message || 'Unspecified error'}`;
          this.debugLog(`❌ ${errorMsg} for topic: ${topic}`);
          console.error(`[MqttManager] Subscribe failed:`, {
            topic,
            error: error.message,
            errorCode: (error as any).code,
            errorName: error.name,
            granted
          });
          reject(new Error(errorMsg));
        } else if (!granted || granted.length === 0) {
          const errorMsg = `Subscribe failed: No subscription granted for topic: ${topic}`;
          this.debugLog(`❌ ${errorMsg}`);
          console.error(`[MqttManager] No subscription granted:`, { topic, granted });
          reject(new Error(errorMsg));
        } else if (granted[0].qos === 128) {
          // QoS 128 means subscription failed (rejected by broker)
          const errorMsg = `Subscribe rejected by broker (QoS=128) for topic: ${topic}`;
          this.debugLog(`❌ ${errorMsg}`);
          console.error(`[MqttManager] Subscription rejected:`, { topic, granted });
          reject(new Error(errorMsg));
        } else {
          // Register handler for message routing
          if (handler) {
            if (!this.messageHandlers.has(topic)) {
              this.messageHandlers.set(topic, new Set());
            }
            this.messageHandlers.get(topic)!.add(handler);
          }
          this.debugLog(`📥 Subscribed to topic: ${topic} (QoS=${granted[0].qos})`);
          resolve();
        }
      });
    });
  }

  /**
   * Unsubscribe from MQTT topic
   */
  public async unsubscribe(topic: string): Promise<void> {
    if (!this.client) {
      throw new Error('MQTT client not initialized');
    }

    return new Promise((resolve, reject) => {
      this.client!.unsubscribe(topic, (error) => {
        if (error) {
          reject(error);
        } else {
          this.messageHandlers.delete(topic);
          this.debugLog(`📤 Unsubscribed from topic: ${topic}`);
          resolve();
        }
      });
    });
  }

  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  /**
   * Disconnect from MQTT broker
   */
  public async disconnect(): Promise<void> {
    if (!this.client) return;

    return new Promise((resolve) => {
      this.client!.end(false, {}, () => {
        this.connected = false;
        this.messageHandlers.clear();
        this.debugLog('Disconnected from MQTT broker');
        resolve();
      });
    });
  }

  /**
   * Get the underlying MQTT client (for advanced usage)
   */
  public getClient(): MqttClient | null {
    return this.client;
  }

  /**
   * Enable/disable debug logging
   */
  public setDebug(enabled: boolean): void {
    this.debug = enabled;
  }

  /**
   * Route incoming messages to registered handlers
   */
  private routeMessage(topic: string, payload: Buffer): void {
    for (const [subscribedTopic, handlers] of this.messageHandlers.entries()) {
      if (this.topicMatches(subscribedTopic, topic)) {
        handlers.forEach((handler) => {
          try {
            handler(topic, payload);
          } catch (error) {
            console.error(`Error in MQTT message handler for topic ${topic}:`, error);
          }
        });
      }
    }
  }

  /**
   * Check if a topic matches a subscription pattern (supports wildcards)
   */
  private topicMatches(pattern: string, topic: string): boolean {
    const patternParts = pattern.split('/');
    const topicParts = topic.split('/');

    if (patternParts.length !== topicParts.length && !pattern.includes('#')) {
      return false;
    }

    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === '#') {
        return true; // Multi-level wildcard matches everything after
      }
      if (patternParts[i] === '+') {
        continue; // Single-level wildcard matches any value at this level
      }
      if (patternParts[i] !== topicParts[i]) {
        return false;
      }
    }

    return patternParts.length === topicParts.length;
  }

  private debugLog(message: string): void {
    if (this.debug) {
      this.logger?.debugSync(message, {
        component: LogComponents.mqtt
      });
    }
  }
}

/**
 * Usage:
 * 
 * import { MqttManager } from './mqtt/mqtt-manager';
 * 
 * const mqttManager = MqttManager.getInstance();
 * await mqttManager.connect('mqtt://mosquitto:1883');
 * 
 * // Subscribe with handler
 * await mqttManager.subscribe('sensor/temperature', { qos: 1 }, (topic, payload) => {
 *   console.log('Received:', payload.toString());
 * });
 * 
 * // Publish
 * await mqttManager.publish('sensor/temperature', '25.5', { qos: 1 });
 */
