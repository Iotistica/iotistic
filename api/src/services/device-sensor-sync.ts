/**
 * Device Sensor Sync Service
 * 
 * Purpose: Keep device_sensors table in sync with device_target_state.config
 * Pattern: Dual-write - config is source of truth, table for querying
 * 
 * Responsibilities:
 * 1. Sync config → table when target state is updated
 * 2. Sync table → config when sensor is added/updated via API
 * 3. Detect and resolve conflicts
 * 4. Track sync status and version
 */

import { query } from '../db/connection';
import { EventPublisher } from './event-sourcing';
import logger from '../utils/logger';

const eventPublisher = new EventPublisher();

export interface SensorDeviceConfig {
  id?: string; // UUID - generated at creation, persists through lifecycle
  name: string;
  protocol: 'modbus' | 'can' | 'opcua' | 'mqtt';
  enabled: boolean;
  pollInterval: number;
  connection: any;
  dataPoints: any[];
  metadata?: any;
}

export class DeviceSensorSyncService {
  /**
   * Sync sensor devices from config to database table
   * Called during deployment or reconciliation
   * 
   * Flow:
   * - During deployment (userId != 'agent-reconciliation'): Add sensors with deployment_status='pending'
   * - During reconciliation (userId === 'agent-reconciliation'): Update sensors with deployment_status='deployed'
   */
  async syncConfigToTable(
    deviceUuid: string,
    configDevices: SensorDeviceConfig[],
    configVersion: number,
    userId?: string
  ): Promise<void> {
    const isReconciliation = userId === 'agent-reconciliation';
    logger.info(`Syncing ${configDevices.length} sensors from config to table for device ${deviceUuid.substring(0, 8)}... (${isReconciliation ? 'RECONCILIATION' : 'DEPLOYMENT'})`);

    try {
      // Get existing sensors from table
      const existingResult = await query(
        'SELECT name FROM device_sensors WHERE device_uuid = $1',
        [deviceUuid]
      );
      const existingNames = new Set(existingResult.rows.map((r: any) => r.name));
      const configNames = new Set(configDevices.map(d => d.name));

      // 1. Insert or update sensors from config
      for (const sensor of configDevices) {
        if (existingNames.has(sensor.name)) {
          // Update existing
          // If reconciliation from agent, mark as deployed
          // Otherwise, mark as pending (just triggered deployment)
          const deploymentStatus = isReconciliation ? 'deployed' : 'pending';
          
          await query(
            `UPDATE device_sensors SET
              protocol = $1,
              enabled = $2,
              poll_interval = $3,
              connection = $4,
              data_points = $5,
              metadata = $6,
              updated_by = $7,
              config_version = $8,
              synced_to_config = true,
              deployment_status = $9,
              config_id = $10
            WHERE device_uuid = $11 AND name = $12`,
            [
              sensor.protocol,
              sensor.enabled,
              sensor.pollInterval,
              JSON.stringify(sensor.connection),
              JSON.stringify(sensor.dataPoints),
              JSON.stringify(sensor.metadata || {}),
              userId || 'system',
              configVersion,
              deploymentStatus,
              sensor.id || null, // Populate config_id from config JSON
              deviceUuid,
              sensor.name
            ]
          );
          logger.info(`Updated: ${sensor.name} (${sensor.protocol}) - ${deploymentStatus}`);
        } else {
          // Insert new sensor into table
          // If reconciliation from agent, mark as deployed (agent confirms it's running)
          // Otherwise, mark as pending (deployment just triggered, waiting for agent confirmation)
          const deploymentStatus = isReconciliation ? 'deployed' : 'pending';
          
          await query(
            `INSERT INTO device_sensors (
              device_uuid, name, protocol, enabled, poll_interval,
              connection, data_points, metadata, created_by, updated_by,
              config_version, synced_to_config, deployment_status, config_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12, $13)`,
            [
              deviceUuid,
              sensor.name,
              sensor.protocol,
              sensor.enabled,
              sensor.pollInterval,
              JSON.stringify(sensor.connection),
              JSON.stringify(sensor.dataPoints),
              JSON.stringify(sensor.metadata || {}),
              userId || 'system',
              userId || 'system',
              configVersion,
              deploymentStatus,
              sensor.id || null // Populate config_id from config JSON
            ]
          );
          logger.info(`Inserted: ${sensor.name} (${sensor.protocol}) - ${deploymentStatus}`);
        }
      }

      // 2. Delete sensors removed from config
      for (const existingName of existingNames) {
        if (!configNames.has(existingName)) {
          await query(
            'DELETE FROM device_sensors WHERE device_uuid = $1 AND name = $2',
            [deviceUuid, existingName]
          );
          logger.info(`   Deleted: ${existingName} (removed from config)`);
        }
      }

      logger.info(`Sync complete: config → table (version ${configVersion}) - ${isReconciliation ? 'DEPLOYED' : 'PENDING'}`);
    } catch (error) {
      logger.error(' Error syncing config to table:', error);
      throw error;
    }
  }

  /**
   * Deploy config changes (increment version and sync to table)
   * Called when user clicks "Deploy" button
   * 
   * This triggers:
   * 1. Version increment (tells agent to pick up changes)
   * 2. Sync config → table with deployment_status='pending'
   * 3. Agent will report current state, triggering reconciliation to 'deployed'
   */
  async deployConfig(deviceUuid: string, userId?: string): Promise<any> {
    logger.info(`Deploying config changes for device ${deviceUuid.substring(0, 8)}...`);

    try {
      // 1. Get current target state
      const stateResult = await query(
        'SELECT apps, config, version FROM device_target_state WHERE device_uuid = $1',
        [deviceUuid]
      );

      if (stateResult.rows.length === 0) {
        throw new Error('Device not found');
      }

      const state = stateResult.rows[0];
      const apps = typeof state.apps === 'string' ? JSON.parse(state.apps) : state.apps;
      const config = typeof state.config === 'string' ? JSON.parse(state.config) : state.config;
      const sensors: SensorDeviceConfig[] = config.sensors || [];

      // 2. Increment version and set needs_deployment flag
      const updateResult = await query(
        `UPDATE device_target_state SET
           version = version + 1,
           updated_at = NOW(),
           needs_deployment = true
         WHERE device_uuid = $1
         RETURNING version`,
        [deviceUuid]
      );

      const newVersion = updateResult.rows[0].version;

      // 3. Sync config → table with deployment_status='pending'
      await this.syncConfigToTable(deviceUuid, sensors, newVersion, userId);

      // 4. Publish event
      await eventPublisher.publish(
        'device_config.deployed',
        'device',
        deviceUuid,
        {
          version: newVersion,
          sensor_count: sensors.length
        }
      );

      logger.info(`Deployed config (version: ${newVersion}) - sensors marked as 'pending'`);

      return {
        version: newVersion,
        config,
        message: 'Config deployed. Sensors marked as pending. Waiting for agent confirmation.'
      };
    } catch (error) {
      logger.error('Error deploying config:', error);
      throw error;
    }
  }

  /**
   * Sync sensor devices from table to config
   * Called when sensor is added/updated via API
   */
  async syncTableToConfig(deviceUuid: string, userId?: string): Promise<any> {
    logger.info(`Syncing sensors from table to config for device ${deviceUuid.substring(0, 8)}...`);

    try {
      // Get all sensors from table
      const result = await query(
        `SELECT id, name, protocol, enabled, poll_interval, connection, data_points, metadata
         FROM device_sensors
         WHERE device_uuid = $1
         ORDER BY created_at`,
        [deviceUuid]
      );

      // Convert to config format
      const configDevices = result.rows.map((row: any) => ({
        id: row.id.toString(), // Convert database id to string for consistency
        name: row.name,
        protocol: row.protocol,
        enabled: row.enabled,
        pollInterval: row.poll_interval,
        connection: typeof row.connection === 'string' ? JSON.parse(row.connection) : row.connection,
        dataPoints: typeof row.data_points === 'string' ? JSON.parse(row.data_points) : row.data_points,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata
      }));

      // Get current target state
      const stateResult = await query(
        'SELECT apps, config, version FROM device_target_state WHERE device_uuid = $1',
        [deviceUuid]
      );

      let apps = {};
      let config: any = {};

      if (stateResult.rows.length > 0) {
        const state = stateResult.rows[0];
        apps = typeof state.apps === 'string' ? JSON.parse(state.apps) : state.apps;
        config = typeof state.config === 'string' ? JSON.parse(state.config) : state.config;
      }

      // Update config with sensors from table
      config.sensors = configDevices;

      // Save updated target state
      const updateResult = await query(
        `INSERT INTO device_target_state (device_uuid, apps, config, version, updated_at, needs_deployment)
         VALUES ($1, $2, $3, 1, NOW(), true)
         ON CONFLICT (device_uuid) DO UPDATE SET
           apps = $2,
           config = $3,
           version = device_target_state.version + 1,
           updated_at = NOW(),
           needs_deployment = true
         RETURNING version`,
        [deviceUuid, JSON.stringify(apps), JSON.stringify(config)]
      );

      const newVersion = updateResult.rows[0].version;

      // Update table records with new version
      await query(
        'UPDATE device_sensors SET config_version = $1, synced_to_config = true WHERE device_uuid = $2',
        [newVersion, deviceUuid]
      );

      logger.info(`Sync complete: table → config (version ${newVersion})`);

      return { version: newVersion, config };
    } catch (error) {
      logger.error('Error syncing table to config:', error);
      throw error;
    }
  }

  /**
   * Sync agent's current state to table (RECONCILIATION)
   * Called when agent reports its actual running configuration
   * This closes the Event Sourcing loop: config → agent → current state → table
   */
  async syncCurrentStateToTable(deviceUuid: string, currentState: any): Promise<void> {
    logger.info(`Reconciling current state from agent for device ${deviceUuid.substring(0, 8)}...`);

    try {
      // Extract running sensors from agent's current state
      const config = typeof currentState.config === 'string' 
        ? JSON.parse(currentState.config) 
        : currentState.config;
      
      const runningSensors: SensorDeviceConfig[] = config?.sensors || [];
      const currentVersion = currentState.version || 0;

      logger.info(`Agent reports ${runningSensors.length} running sensors (version ${currentVersion})`);

      // Sync table to match agent's reality (not desired state!)
      await this.syncConfigToTable(deviceUuid, runningSensors, currentVersion, 'agent-reconciliation');

      logger.info(`Reconciliation complete: agent reality → table (version ${currentVersion})`);
    } catch (error) {
      logger.error('Error reconciling current state to table:', error);
      throw error;
    }
  }

  /**
   * Get sensor devices from TABLE (deployed state for UI)
   * Reads from device_sensors table which represents agent's actual running state
   * Table is kept in sync via reconciliation when agent reports current state
   */
  async getSensors(deviceUuid: string, protocol?: string): Promise<any[]> {
    try {
      // Read from TABLE (deployed/running state)
      let sql = `
        SELECT id, device_uuid, name, protocol, enabled, poll_interval,
               connection, data_points, metadata, config_version, synced_to_config,
               deployment_status, last_deployed_at, deployment_error, deployment_attempts,
               config_id, created_at, updated_at, created_by, updated_by
        FROM device_sensors 
        WHERE device_uuid = $1
      `;
      const params: any[] = [deviceUuid];

      // Filter by protocol if specified
      if (protocol) {
        sql += ' AND protocol = $2';
        params.push(protocol);
      }

      sql += ' ORDER BY created_at';

      const result = await query(sql, params);

      // Return sensors in API format
      return result.rows.map((row: any) => ({
        id: row.id,
        configId: row.config_id, // UUID from config JSON
        name: row.name,
        protocol: row.protocol,
        enabled: row.enabled,
        pollInterval: row.poll_interval,
        connection: typeof row.connection === 'string' ? JSON.parse(row.connection) : row.connection,
        dataPoints: typeof row.data_points === 'string' ? JSON.parse(row.data_points) : row.data_points,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
        configVersion: row.config_version,
        syncedToConfig: row.synced_to_config,
        deploymentStatus: row.deployment_status,
        lastDeployedAt: row.last_deployed_at,
        deploymentError: row.deployment_error,
        deploymentAttempts: row.deployment_attempts,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        createdBy: row.created_by,
        updatedBy: row.updated_by
      }));
    } catch (error) {
      logger.error('Error getting sensors from table:', error);
      throw error;
    }
  }

  /**
   * Add a new sensor device (DRAFT PATTERN: Save to config first, deploy adds to table)
   * Draft workflow:
   * 1. User adds sensor → Saved to device_target_state.config only (not to table yet)
   * 2. User clicks "Deploy" → Increments version AND adds sensor to table with deployment_status='pending'
   * 3. Agent reports current state → Reconciliation updates table to deployment_status='deployed'
   * 
   * This makes the table a pure read model - only populated after deployment is triggered.
   */
  async addSensor(
    deviceUuid: string,
    sensor: SensorDeviceConfig,
    userId?: string
  ): Promise<any> {
    logger.info(`Adding sensor "${sensor.name}" (${sensor.protocol}) for device ${deviceUuid.substring(0, 8)}... (draft mode - config only)`);

    try {
      // ALWAYS save to config first (draft in config, not in table yet)
      // 1. Get current target state
      const stateResult = await query(
        'SELECT apps, config, version FROM device_target_state WHERE device_uuid = $1',
        [deviceUuid]
      );

      let apps = {};
      let config: any = {};
      let existingDevices: SensorDeviceConfig[] = [];

      if (stateResult.rows.length > 0) {
        const state = stateResult.rows[0];
        apps = typeof state.apps === 'string' ? JSON.parse(state.apps) : state.apps;
        config = typeof state.config === 'string' ? JSON.parse(state.config) : state.config;
        existingDevices = config.sensors || [];
      }

      // 2. Check for duplicate name in config
      if (existingDevices.some(d => d.name === sensor.name)) {
        throw new Error(`Sensor with name "${sensor.name}" already exists`);
      }

      // 3. Add sensor to config (SOURCE OF TRUTH)
      existingDevices.push(sensor);
      config.sensors = existingDevices;

      // 4. Save updated config WITHOUT incrementing version (draft state)
      // Version stays the same until user clicks "Deploy"
      // Set needs_deployment = true so Deploy button appears in UI
      await query(
        `INSERT INTO device_target_state (device_uuid, apps, config, version, updated_at, needs_deployment)
         VALUES ($1, $2, $3, 1, NOW(), true)
         ON CONFLICT (device_uuid) DO UPDATE SET
           config = $3,
           updated_at = NOW(),
           needs_deployment = true
         RETURNING version`,
        [deviceUuid, JSON.stringify(apps), JSON.stringify(config)]
      );

      // 5. Publish event (draft saved)
      await eventPublisher.publish(
        'device_sensor.draft_saved',
        'device',
        deviceUuid,
        {
          sensor_name: sensor.name,
          protocol: sensor.protocol
        }
      );

      logger.info(`Added sensor "${sensor.name}" to config as DRAFT (not deployed yet)`);
      logger.info(`User must click "Deploy" to trigger deployment and add to sensors table`);

      return {
        sensor,
        isDraft: true,
        message: 'Sensor saved to config. Click "Deploy" to trigger deployment.'
      };
    } catch (error) {
      logger.error('Error adding sensor:', error);
      throw error;
    }
  }

  /**
   * Update sensor device (CORRECT PATTERN: Update config first)
   */
  async updateSensor(
    deviceUuid: string,
    sensorName: string,
    updates: Partial<SensorDeviceConfig>,
    userId?: string
  ): Promise<any> {
    logger.info(`Updating sensor "${sensorName}" for device ${deviceUuid.substring(0, 8)}...`);

    try {
      // 1. Get current target state
      const stateResult = await query(
        'SELECT apps, config, version FROM device_target_state WHERE device_uuid = $1',
        [deviceUuid]
      );

      if (stateResult.rows.length === 0) {
        throw new Error('Device not found');
      }

      const state = stateResult.rows[0];
      const apps = typeof state.apps === 'string' ? JSON.parse(state.apps) : state.apps;
      const config = typeof state.config === 'string' ? JSON.parse(state.config) : state.config;
      const existingDevices: SensorDeviceConfig[] = config.sensors || [];

      // 2. Find and update sensor in config (SOURCE OF TRUTH)
      const sensorIndex = existingDevices.findIndex(d => d.name === sensorName);
      if (sensorIndex === -1) {
        throw new Error(`Sensor "${sensorName}" not found`);
      }

      existingDevices[sensorIndex] = {
        ...existingDevices[sensorIndex],
        ...updates
      };
      config.sensors = existingDevices;

      // 3. Save updated target state
      const updateResult = await query(
        `UPDATE device_target_state SET
           apps = $1,
           config = $2,
           version = version + 1,
           updated_at = NOW(),
           needs_deployment = true
         WHERE device_uuid = $3
         RETURNING version`,
        [JSON.stringify(apps), JSON.stringify(config), deviceUuid]
      );

      const newVersion = updateResult.rows[0].version;

      // 4. Sync config → table
      await this.syncConfigToTable(deviceUuid, existingDevices, newVersion, userId);

      // 5. Publish event
      await eventPublisher.publish(
        'device_sensor.updated',
        'device',
        deviceUuid,
        {
          sensor_name: sensorName,
          updates,
          version: newVersion
        }
      );

      logger.info(`Updated sensor "${sensorName}" in config (version: ${newVersion})`);

      return {
        sensor: existingDevices[sensorIndex],
        version: newVersion
      };
    } catch (error) {
      logger.error('Error updating sensor:', error);
      throw error;
    }
  }

  /**
   * Delete sensor device (CORRECT PATTERN: Delete from config first)
   */
  async deleteSensor(
    deviceUuid: string,
    sensorName: string,
    userId?: string
  ): Promise<any> {
    logger.info(`Deleting sensor "${sensorName}" for device ${deviceUuid.substring(0, 8)}...`);

    try {
      // 1. Get current target state
      const stateResult = await query(
        'SELECT apps, config, version FROM device_target_state WHERE device_uuid = $1',
        [deviceUuid]
      );

      if (stateResult.rows.length === 0) {
        throw new Error('Device not found');
      }

      const state = stateResult.rows[0];
      const apps = typeof state.apps === 'string' ? JSON.parse(state.apps) : state.apps;
      const config = typeof state.config === 'string' ? JSON.parse(state.config) : state.config;
      let existingDevices: SensorDeviceConfig[] = config.sensors || [];

      // 2. Remove sensor from config (SOURCE OF TRUTH)
      existingDevices = existingDevices.filter(d => d.name !== sensorName);
      config.sensors = existingDevices;

      // 3. Save updated target state
      const updateResult = await query(
        `UPDATE device_target_state SET
           apps = $1,
           config = $2,
           version = version + 1,
           updated_at = NOW(),
           needs_deployment = true
         WHERE device_uuid = $3
         RETURNING version`,
        [JSON.stringify(apps), JSON.stringify(config), deviceUuid]
      );

      const newVersion = updateResult.rows[0].version;

      // 4. Sync config → table (will delete from table)
      await this.syncConfigToTable(deviceUuid, existingDevices, newVersion, userId);

      // 5. Publish event
      await eventPublisher.publish(
        'device_sensor.deleted',
        'device',
        deviceUuid,
        {
          sensor_name: sensorName,
          version: newVersion
        }
      );

      logger.info(`Deleted sensor "${sensorName}" from config (version: ${newVersion})`);

      return {
        version: newVersion
      };
    } catch (error) {
      logger.error('Error deleting sensor:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const deviceSensorSync = new DeviceSensorSyncService();

// Export standalone function for backward compatibility
export const syncTableToConfig = (deviceUuid: string, userId?: string) => 
  deviceSensorSync.syncTableToConfig(deviceUuid, userId);
