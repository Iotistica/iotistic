/**
 * Centralized MQTT Module
 * 
 * Single MQTT connection shared across all features (jobs, shadows, logging).
 * 
 * Documentation: See agent/docs/mqtt/README.md
 * Quick Start: See agent/docs/mqtt/QUICK-START.md
 * 
 * Exports:
 * - MqttManager: Singleton MQTT connection manager
 * 
 * Usage:
 * ```typescript
 * import { MqttManager } from './mqtt';
 * 
 * const mqttManager = MqttManager.getInstance();
 * await mqttManager.publish(topic, payload, { qos: 1 });
 * ```
 */

export { MqttManager } from './manager';
