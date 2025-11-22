/**
 * API Key Rotation Task
 * 
 * Runs periodic checks for devices needing API key rotation
 * and automatically rotates keys before they expire.
 * 
 * Migrated from api/src/services/rotation-scheduler.ts
 */

import { pool } from '../db/connection';
import logger from '../utils/logger';
import { HousekeeperTask } from '../housekeeper';

/**
 * Rotate expired API keys
 */
async function rotateExpiredKeys(): Promise<number> {
  logger.info('Starting automatic API key rotation');

  // Get devices needing rotation (keys expiring soon)
  const result = await pool.query(
    `SELECT uuid, device_name, 
       EXTRACT(DAY FROM (api_key_expires_at - NOW())) as days_until_expiry
     FROM devices_needing_rotation
     ORDER BY api_key_expires_at ASC`
  );

  if (result.rows.length === 0) {
    logger.info('No devices need key rotation at this time');
    return 0;
  }

  logger.info('Found devices needing rotation', { count: result.rows.length });

  let successCount = 0;

  for (const device of result.rows) {
    try {
      // Call the stored procedure to rotate the key
      await pool.query(
        `SELECT rotate_device_api_key($1) as rotation_result`,
        [device.uuid]
      );
      
      successCount++;
      
      logger.info('Device key rotation successful', {
        deviceName: device.device_name,
        daysUntilExpiry: device.days_until_expiry
      });
    } catch (error) {
      logger.error('Device key rotation failed', {
        deviceName: device.device_name,
        error: (error as Error).message
      });
      
      // Log failure to audit log
      await pool.query(
        `INSERT INTO audit_logs (event_type, device_uuid, severity, details)
         VALUES ($1, $2, $3, $4)`,
        [
          'rotation_failed', 
          device.uuid, 
          'error', 
          JSON.stringify({ error: (error as Error).message })
        ]
      ).catch(err => {
        logger.error('Failed to log rotation failure', { error: err.message });
      });
    }
  }

  logger.info('Rotation complete', {
    successful: successCount,
    total: result.rows.length
  });
  
  return successCount;
}

/**
 * Revoke old API keys that are past grace period
 */
async function revokeExpiredKeys(): Promise<number> {
  logger.info('Revoking expired API keys');

  const result = await pool.query(
    `UPDATE device_api_key_history
     SET 
       is_active = false,
       revoked_at = NOW(),
       revoked_reason = 'Grace period expired'
     WHERE 
       is_active = true
       AND expires_at IS NOT NULL
       AND expires_at <= NOW()
     RETURNING device_uuid`
  );

  if (result.rows.length > 0) {
    logger.info('Revoked expired API keys', { count: result.rows.length });
    
    // Log revocation events
    for (const row of result.rows) {
      await pool.query(
        `INSERT INTO audit_logs (event_type, device_uuid, severity, details)
         VALUES ($1, $2, $3, $4)`,
        [
          'old_key_revoked',
          row.device_uuid,
          'info',
          JSON.stringify({ reason: 'Grace period expired' })
        ]
      ).catch(err => {
        logger.error('Failed to log revocation event', { error: err.message });
      });
    }
  }

  return result.rows.length;
}

/**
 * API Key Rotation Task
 * 
 * Runs every hour (configurable via env) to check for devices
 * needing key rotation and automatically rotates keys before expiry.
 */
const task: HousekeeperTask = {
  name: 'api-key-rotation',
  schedule: process.env.ROTATION_CHECK_SCHEDULE || '0 * * * *', // Default: Every hour
  startup: false, // Don't run on startup
  
  run: async () => {
    const rotationEnabled = process.env.ENABLE_API_KEY_ROTATION !== 'false';
    const revocationEnabled = process.env.ENABLE_API_KEY_REVOCATION !== 'false';

    if (!rotationEnabled && !revocationEnabled) {
      logger.info('API key rotation and revocation both disabled');
      return;
    }

    let rotatedCount = 0;
    let revokedCount = 0;

    if (rotationEnabled) {
      logger.info('Running scheduled API key rotation check...');
      rotatedCount = await rotateExpiredKeys();
      
      if (rotatedCount > 0) {
        logger.info(`Rotation check complete: ${rotatedCount} keys rotated`);
      }
    }

    if (revocationEnabled) {
      logger.info('Running scheduled API key revocation check...');
      revokedCount = await revokeExpiredKeys();
      
      if (revokedCount > 0) {
        logger.info(`Revocation check complete: ${revokedCount} old keys revoked`);
      }
    }

    if (rotatedCount === 0 && revokedCount === 0) {
      logger.info('No keys needed rotation or revocation');
    }
  }
};

export default task;
