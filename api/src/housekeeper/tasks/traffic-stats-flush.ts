/**
 * Traffic Stats Flush Task
 * 
 * Periodically flushes in-memory device traffic statistics to PostgreSQL
 * using time-series buckets for efficient historical storage.
 */

import { HousekeeperTask } from '../index';
import poolWrapper from '../../db/connection';
import { getTrafficStats } from '../../middleware/traffic-logger';
import logger from '../../utils/logger';

/**
 * Truncate timestamp to hourly bucket
 */
function getHourlyBucket(date: Date = new Date()): Date {
  const bucket = new Date(date);
  bucket.setMinutes(0, 0, 0);
  return bucket;
}

/**
 * Flush current in-memory stats to database
 */
async function flushTrafficStats(): Promise<void> {
  const stats = getTrafficStats();
  
  if (stats.length === 0) {
    logger.debug('No traffic stats to flush');
    return;
  }

  const timeBucket = getHourlyBucket();
  
  logger.info(`Flushing ${stats.length} traffic entries to database`);

  try {
    // Use transaction for atomic upsert
    await poolWrapper.transaction(async (client) => {
      for (const stat of stats) {
        // Upsert: insert or update on conflict
        await client.query(`
          INSERT INTO device_traffic_stats (
            device_id,
            endpoint,
            method,
            time_bucket,
            request_count,
            total_bytes,
            total_time,
            success_count,
            failed_count,
            status_codes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
          ON CONFLICT (device_id, endpoint, method, time_bucket)
          DO UPDATE SET
            request_count = device_traffic_stats.request_count + EXCLUDED.request_count,
            total_bytes = device_traffic_stats.total_bytes + EXCLUDED.total_bytes,
            total_time = device_traffic_stats.total_time + EXCLUDED.total_time,
            success_count = device_traffic_stats.success_count + EXCLUDED.success_count,
            failed_count = device_traffic_stats.failed_count + EXCLUDED.failed_count,
            status_codes = (
              SELECT jsonb_object_agg(
                key,
                COALESCE((device_traffic_stats.status_codes->>key)::int, 0) + 
                COALESCE((EXCLUDED.status_codes->>key)::int, 0)
              )
              FROM (
                SELECT key FROM jsonb_object_keys(device_traffic_stats.status_codes) AS key
                UNION
                SELECT key FROM jsonb_object_keys(EXCLUDED.status_codes) AS key
              ) AS all_keys
            ),
            updated_at = NOW()
        `, [
          stat.deviceId,
          stat.endpoint,
          stat.method,
          timeBucket,
          stat.count,
          stat.totalBytes,
          stat.totalTime,
          stat.success,
          stat.failed,
          JSON.stringify(stat.statuses)
        ]);
      }
    });

    logger.info(`Successfully flushed ${stats.length} traffic entries`);
  } catch (error: any) {
    logger.error('Failed to flush traffic stats', { error: error.message });
    throw error;
  }
}

const task: HousekeeperTask = {
  name: 'traffic-stats-flush',
  // Run every 15 minutes by default (or use TRAFFIC_FLUSH_INTERVAL_MINUTES env var)
  schedule: `*/${process.env.TRAFFIC_FLUSH_INTERVAL_MINUTES || '15'} * * * *`,
  // Run on startup after 1 minute delay
  startup: 60000,
  
  run: async () => {
    await flushTrafficStats();
  }
};

export default task;
