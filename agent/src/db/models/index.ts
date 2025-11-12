/**
 * Data Models
 * ===========
 * 
 * Database models for sensors and outputs
 */

// Device model (provisioning and registration)
export { DeviceModel } from './device.model';
export type { Device } from './device.model';

// Sensor device models (CRUD operations)
export { DeviceSensorModel } from './sensors.model';
export type { DeviceSensor } from './sensors.model';

// Sensor output configuration (protocol adapter outputs)
export { SensorOutputModel } from './sensor-outputs.model';
export type { DeviceSensorOutput } from './sensor-outputs.model';
