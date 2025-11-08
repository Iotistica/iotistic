/**
 * Provisioning Key Management
 * Handles validation, creation, and lifecycle of fleet provisioning keys
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { query } from '../db/connection';
import { logAuditEvent, AuditEventType, AuditSeverity } from './audit-logger';

const BCRYPT_ROUNDS = 10;

export interface ProvisioningKey {
  id: string;
  key_hash: string;
  fleet_id: string;
  description?: string;
  max_devices: number;
  devices_provisioned: number;
  expires_at: Date;
  is_active: boolean;
  created_at: Date;
  created_by?: string;
  last_used_at?: Date;
}

export interface ProvisioningKeyValidationResult {
  valid: boolean;
  keyRecord?: ProvisioningKey;
  error?: string;
}

/**
 * Validate a provisioning key against the database
 */
export async function validateProvisioningKey(
  key: string,
  ipAddress?: string
): Promise<ProvisioningKeyValidationResult> {
  try {
    // Fetch all active, non-expired provisioning keys
    const result = await query<ProvisioningKey>(
      `SELECT * FROM provisioning_keys 
       WHERE is_active = true 
       AND expires_at > NOW()`
    );

    if (result.rows.length === 0) {
      await logAuditEvent({
        eventType: AuditEventType.PROVISIONING_KEY_INVALID,
        ipAddress,
        severity: AuditSeverity.WARNING,
        details: { reason: 'No active provisioning keys found' }
      });
      return { valid: false, error: 'No active provisioning keys available' };
    }

    // Check provided key against each hashed key in database
    for (const record of result.rows) {
      const matches = await bcrypt.compare(key, record.key_hash);
      
      if (matches) {
        // Check device limit
        if (record.devices_provisioned >= record.max_devices) {
          await logAuditEvent({
            eventType: AuditEventType.PROVISIONING_LIMIT_EXCEEDED,
            ipAddress,
            severity: AuditSeverity.WARNING,
            details: {
              keyId: record.id,
              fleetId: record.fleet_id,
              limit: record.max_devices,
              provisioned: record.devices_provisioned
            }
          });
          return { 
            valid: false, 
            error: 'Provisioning key device limit exceeded',
            keyRecord: record // Include key record for audit logging
          };
        }

        // Check expiration (double-check)
        if (new Date(record.expires_at) < new Date()) {
          await logAuditEvent({
            eventType: AuditEventType.PROVISIONING_KEY_EXPIRED,
            ipAddress,
            severity: AuditSeverity.WARNING,
            details: {
              keyId: record.id,
              fleetId: record.fleet_id,
              expiredAt: record.expires_at
            }
          });
          return { 
            valid: false, 
            error: 'Provisioning key has expired',
            keyRecord: record // Include key record for audit logging
          };
        }

        // Update last used timestamp
        await query(
          `UPDATE provisioning_keys 
           SET last_used_at = NOW() 
           WHERE id = $1`,
          [record.id]
        );

        return { valid: true, keyRecord: record };
      }
    }

    // No matching key found
    await logAuditEvent({
      eventType: AuditEventType.PROVISIONING_KEY_INVALID,
      ipAddress,
      severity: AuditSeverity.WARNING,
      details: { reason: 'Key does not match any active provisioning keys' }
    });

    return { valid: false, error: 'Invalid provisioning key' };
  } catch (error: any) {
    await logAuditEvent({
      eventType: AuditEventType.PROVISIONING_FAILED,
      ipAddress,
      severity: AuditSeverity.ERROR,
      details: { error: error.message }
    });
    throw error;
  }
}

/**
 * Increment the devices_provisioned counter for a provisioning key
 */
export async function incrementProvisioningKeyUsage(keyId: string): Promise<void> {
  await query(
    `UPDATE provisioning_keys 
     SET devices_provisioned = devices_provisioned + 1 
     WHERE id = $1`,
    [keyId]
  );
}

/**
 * Create a new provisioning key
 */
export async function createProvisioningKey(
  fleetId: string,
  maxDevices: number = 100,
  expiresInDays: number = 365,
  description?: string,
  createdBy?: string
): Promise<{ id: string; key: string }> {
  // Generate a secure random key
  const key = crypto.randomBytes(32).toString('hex');
  const keyHash = await bcrypt.hash(key, BCRYPT_ROUNDS);
  
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + expiresInDays);

  const result = await query<{ id: string }>(
    `INSERT INTO provisioning_keys (key_hash, fleet_id, description, max_devices, expires_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [keyHash, fleetId, description, maxDevices, expiresAt, createdBy]
  );

  const keyId = result.rows[0].id;

  await logAuditEvent({
    eventType: AuditEventType.API_KEY_CREATED,
    userId: createdBy,
    severity: AuditSeverity.INFO,
    details: {
      keyId,
      fleetId,
      maxDevices,
      expiresAt: expiresAt.toISOString()
    }
  });

  return { id: keyId, key };
}

/**
 * Revoke a provisioning key
 */
export async function revokeProvisioningKey(keyId: string, reason?: string): Promise<void> {
  await query(
    `UPDATE provisioning_keys 
     SET is_active = false 
     WHERE id = $1`,
    [keyId]
  );

  await logAuditEvent({
    eventType: AuditEventType.API_KEY_REVOKED,
    severity: AuditSeverity.INFO,
    details: { keyId, reason }
  });
}

/**
 * List all provisioning keys for a fleet
 */
export async function listProvisioningKeys(fleetId: string): Promise<ProvisioningKey[]> {
  const result = await query<ProvisioningKey>(
    `SELECT * FROM provisioning_keys 
     WHERE fleet_id = $1 
     ORDER BY created_at DESC`,
    [fleetId]
  );

  return result.rows;
}

export default {
  validateProvisioningKey,
  incrementProvisioningKeyUsage,
  createProvisioningKey,
  revokeProvisioningKey,
  listProvisioningKeys
};
