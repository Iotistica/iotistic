/**
 * Device Model
 * Manages device provisioning and registration data in SQLite
 */

import { models } from '../connection';

export interface Device {
  id?: number;
  uuid: string;
  deviceId?: number | null;
  deviceName?: string | null;
  deviceType?: string | null;
  deviceApiKey?: string | null;
  provisioningApiKey?: string | null;
  apiKey?: string | null;
  apiEndpoint?: string | null;
  registeredAt?: number | null;
  provisioned: boolean;
  applicationId?: number | null;
  macAddress?: string | null;
  osVersion?: string | null;
  agentVersion?: string | null;
  mqttUsername?: string | null;
  mqttPassword?: string | null;
  mqttBrokerUrl?: string | null;
  mqttBrokerConfig?: string | null; // JSON string of MqttBrokerConfig
  apiTlsConfig?: string | null;     // JSON string of ApiTlsConfig
  createdAt?: Date;
  updatedAt?: Date;
}

export class DeviceModel {
  private static table = 'device';

  /**
   * Get device record (single device per agent)
   */
  static async get(): Promise<Device | null> {
    const device = await models(this.table)
      .select('*')
      .first();
    
    if (!device) {
      return null;
    }

    // Convert provisioned to boolean
    const provisioned = !!device.provisioned;

    return {
      ...device,
      provisioned,
    };
  }

  /**
   * Create device record
   */
  static async create(device: Omit<Device, 'id' | 'createdAt' | 'updatedAt'>): Promise<Device> {
    await models(this.table).insert({
      ...device,
      provisioned: device.provisioned ? 1 : 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    return await this.get() as Device;
  }

  /**
   * Update device record
   */
  static async update(updates: Partial<Device>): Promise<Device | null> {
    const updateData: any = {
      ...updates,
      updatedAt: new Date().toISOString(),
    };

    if (updates.provisioned !== undefined) {
      updateData.provisioned = updates.provisioned ? 1 : 0;
    }

    await models(this.table).update(updateData);

    return await this.get();
  }

  /**
   * Save device record (insert or update)
   */
  static async save(data: Omit<Device, 'id' | 'createdAt' | 'updatedAt'>): Promise<Device | null> {
    const existing = await this.get();

    if (existing) {
      return await this.update(data);
    } else {
      return await this.create(data);
    }
  }

  /**
   * Delete device record
   */
  static async delete(): Promise<boolean> {
    const deleted = await models(this.table).delete();
    return deleted > 0;
  }

  /**
   * Check if device is provisioned
   */
  static async isProvisioned(): Promise<boolean> {
    const device = await this.get();
    return !!device?.provisioned;
  }

  /**
   * Get device UUID
   */
  static async getUuid(): Promise<string | null> {
    const device = await this.get();
    return device?.uuid || null;
  }

  /**
   * Update provisioning status
   */
  static async setProvisioned(provisioned: boolean): Promise<Device | null> {
    return await this.update({ provisioned });
  }
}
