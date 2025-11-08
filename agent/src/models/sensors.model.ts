/**
 * Protocol Adapter Device Model
 * Manages Modbus, CAN, OPC-UA device configurations in SQLite
 */

import { models, getKnex } from '../db';
import type { Knex } from 'knex';

export interface DeviceSensor {
  id?: number;
  name: string;
  protocol: 'modbus' | 'can' | 'opcua';
  enabled: boolean;
  poll_interval: number;
  connection: Record<string, any>; // Connection config (host, port, serial, etc.)
  data_points?: any[]; // Protocol-agnostic: Modbus registers, OPC-UA nodes, CAN messages, etc.
  metadata?: Record<string, any>; // Additional protocol-specific config
  created_at?: Date;
  updated_at?: Date;
}

export interface DeviceSensorOutput {
  id?: number;
  protocol: 'modbus' | 'can' | 'opcua';
  socket_path: string;
  data_format: string;
  delimiter: string;
  include_timestamp: boolean;
  include_device_name: boolean;
  logging?: Record<string, any>;
  created_at?: Date;
  updated_at?: Date;
}

export class DeviceSensorModel {
  private static table = 'sensors';
  private static outputTable = 'sensor_outputs';

  /**
   * Get all protocol adapter devices
   */
  static async getAll(protocol?: string): Promise<DeviceSensor[]> {
    const query = models(this.table).select('*');
    if (protocol) {
      query.where('protocol', protocol);
    }
    return await query.orderBy('name');
  }

  /**
   * Get device by name
   */
  static async getByName(name: string): Promise<DeviceSensor | null> {
    const device = await models(this.table)
      .where('name', name)
      .first();
    return device || null;
  }

  /**
   * Get enabled devices for a protocol
   */
  static async getEnabled(protocol: string): Promise<DeviceSensor[]> {
    return await models(this.table)
      .where({ protocol, enabled: true })
      .orderBy('name');
  }

  /**
   * Create new device
   */
  static async create(device: DeviceSensor): Promise<DeviceSensor> {
    const [id] = await models(this.table).insert({
      ...device,
      connection: JSON.stringify(device.connection),
      data_points: device.data_points ? JSON.stringify(device.data_points) : null,
      metadata: device.metadata ? JSON.stringify(device.metadata) : null,
    });

    return await this.getById(id);
  }

  /**
   * Update device
   */
  static async update(name: string, updates: Partial<DeviceSensor>): Promise<DeviceSensor | null> {
    const updateData: any = {
      ...updates,
      updated_at: new Date(),
    };

    if (updates.connection) {
      updateData.connection = JSON.stringify(updates.connection);
    }
    if (updates.data_points) {
      updateData.data_points = JSON.stringify(updates.data_points);
    }
    if (updates.metadata) {
      updateData.metadata = JSON.stringify(updates.metadata);
    }

    await models(this.table)
      .where('name', name)
      .update(updateData);

    return await this.getByName(name);
  }

  /**
   * Delete device
   */
  static async delete(name: string): Promise<boolean> {
    const deleted = await models(this.table)
      .where('name', name)
      .delete();
    return deleted > 0;
  }

  /**
   * Get device by ID
   */
  private static async getById(id: number): Promise<DeviceSensor> {
    return await models(this.table)
      .where('id', id)
      .first();
  }

  /**
   * Get output configuration for a protocol
   */
  static async getOutput(protocol: string): Promise<DeviceSensorOutput | null> {
    const output = await models(this.outputTable)
      .where('protocol', protocol)
      .first();
    return output || null;
  }

  /**
   * Set output configuration for a protocol
   */
  static async setOutput(output: DeviceSensorOutput): Promise<DeviceSensorOutput | null> {
    const existing = await this.getOutput(output.protocol);

    const outputData = {
      ...output,
      logging: output.logging ? JSON.stringify(output.logging) : null,
    };

    if (existing) {
      await models(this.outputTable)
        .where('protocol', output.protocol)
        .update({
          ...outputData,
          updated_at: new Date(),
        });
    } else {
      await models(this.outputTable).insert(outputData);
    }

    return await this.getOutput(output.protocol);
  }

  /**
   * Import devices from JSON config (migration helper)
   */
  static async importFromJson(protocol: string, config: any): Promise<void> {
    const knex = getKnex();
    
    await knex.transaction(async (trx) => {
      // Import devices
      if (config.devices && Array.isArray(config.devices)) {
        for (const device of config.devices) {
          const existing = await trx(this.table).where('name', device.name).first();
          
          if (!existing) {
            await trx(this.table).insert({
              name: device.name,
              protocol,
              enabled: device.enabled !== undefined ? device.enabled : true,
              poll_interval: device.pollInterval || 5000,
              connection: JSON.stringify(device.connection),
              data_points: device.registers ? JSON.stringify(device.registers) : null,
              metadata: device.slaveId ? JSON.stringify({ slaveId: device.slaveId }) : null,
            });
          }
        }
      }

      // Import output config
      if (config.output) {
        const existingOutput = await trx(this.outputTable).where('protocol', protocol).first();
        
        if (!existingOutput) {
          await trx(this.outputTable).insert({
            protocol,
            socket_path: config.output.socketPath || config.output.socket_path,
            data_format: config.output.dataFormat || 'json',
            delimiter: config.output.delimiter || '\n',
            include_timestamp: config.output.includeTimestamp !== false,
            include_device_name: config.output.includeDeviceName !== false,
            logging: config.output.logging ? JSON.stringify(config.output.logging) : null,
          });
        }
      }
    });
  }
}
