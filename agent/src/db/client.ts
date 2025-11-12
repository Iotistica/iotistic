/**
 * Database Client Interface for Device Manager
 * =============================================
 * 
 * Abstraction layer over Knex database operations to make device-manager testable.
 * Allows easy mocking in tests without stubbing database calls.
 */

import * as db from './connection';

export interface DeviceRecord {
	uuid: string;
	deviceId?: number | null;
	deviceName?: string | null;
	deviceType?: string | null;
	deviceApiKey?: string | null;
	provisioningApiKey?: string | null;
	apiKey?: string | null;
	apiEndpoint?: string | null;
	registeredAt?: number | null;
	provisioned: number; // 0 or 1
	applicationId?: number | null; // Changed from string to number to match DeviceInfo
	macAddress?: string | null;
	osVersion?: string | null;
	agentVersion?: string | null;
	mqttUsername?: string | null;
	mqttPassword?: string | null;
	mqttBrokerUrl?: string | null;
	createdAt?: string;
	updatedAt?: string;
}

export interface DatabaseClient {
	/**
	 * Load device record from database
	 */
	loadDevice(): Promise<DeviceRecord | null>;
	
	/**
	 * Save device record to database (insert or update)
	 */
	saveDevice(data: Omit<DeviceRecord, 'createdAt'>): Promise<void>;
}

/**
 * Default implementation using Knex database
 */
export class KnexDatabaseClient implements DatabaseClient {
	async loadDevice(): Promise<DeviceRecord | null> {
		const rows = await db.models('device').select('*').limit(1);
		if (rows.length > 0) {
			return rows[0] as DeviceRecord;
		}
		return null;
	}
	
	async saveDevice(data: Omit<DeviceRecord, 'createdAt'>): Promise<void> {
		const existing = await db.models('device').select('*').limit(1);
		
		if (existing.length > 0) {
			await db.models('device').update(data);
		} else {
			await db.models('device').insert({
				...data,
				createdAt: new Date().toISOString(),
			});
		}
	}
}
