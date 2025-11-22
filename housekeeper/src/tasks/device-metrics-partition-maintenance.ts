/**
 * Device Metrics Partition Maintenance Task
 * 
 * Creates future device_metrics partitions and drops old ones to ensure:
 * 1. Metrics are never rejected due to missing partitions
 * 2. Old data is cleaned up according to retention policy
 * 
 * Runs daily at 1am to maintain partition coverage
 */

import { HousekeeperTask } from '../housekeeper';
import { pool } from '../db/connection';
import logger from '../utils/logger';

// Retention period in days (configurable via environment variable)
const RETENTION_DAYS = parseInt(process.env.METRICS_RETENTION_DAYS || '90');

const task: HousekeeperTask = {
  name: 'device-metrics-partition-maintenance',
  // Run daily at 1am
  schedule: '0 1 * * *',
  // Also run on startup to ensure partitions exist immediately
  startup: true,
  
  run: async () => {
    logger.info('Running device metrics partition maintenance...');
    logger.info(`   Retention period: ${RETENTION_DAYS} days\n`);

    try {
      // 1. Create future partitions (next 30 days) + today
      logger.info('Creating future partitions...');
      const createResult = await pool.query(`
        SELECT create_device_metrics_partition((CURRENT_DATE + (i || ' days')::INTERVAL)::DATE) as result
        FROM generate_series(0, 30) AS i
      `);

      const created = createResult.rows.filter((r: any) => r.result?.startsWith('CREATED:')).length;
      const existing = createResult.rows.filter((r: any) => r.result?.startsWith('EXISTS:')).length;

      logger.info(`  ✓ Created: ${created} partitions`);
      logger.info(`  ℹ Already exists: ${existing} partitions`);

      // 2. Drop old partitions
      logger.info(`\nDropping partitions older than ${RETENTION_DAYS} days...`);
      const dropResult = await pool.query(`
        SELECT drop_old_device_metrics_partitions($1) as result
      `, [RETENTION_DAYS]);

      const dropped = dropResult.rows.filter((r: any) => r.result?.startsWith('DROPPED:')).length;

      logger.info(`  Dropped: ${dropped} old partitions`);

      if (dropped > 0) {
        dropResult.rows
          .filter((r: any) => r.result?.startsWith('DROPPED:'))
          .forEach((r: any) => logger.info(`    - ${r.result}`));
      }

      // 3. Show statistics
      const stats = await pool.query(`
        SELECT * FROM get_device_metrics_partition_stats()
      `);

      if (stats.rows.length > 0) {
        logger.info('\nCurrent Partition Statistics:');
        logger.info(`  Total partitions: ${stats.rows.length}`);

        // Show first 5 and last 5 partitions
        const showCount = Math.min(5, stats.rows.length);
        logger.info(`\n  Newest ${showCount} partitions:`);
        stats.rows.slice(0, showCount).forEach((row: any) => {
          logger.info(`    ${row.partition_name}: ${row.row_count} rows, ${row.size}, ${row.age_days} days old`);
        });

        if (stats.rows.length > 10) {
          logger.info(`    ... (${stats.rows.length - 10} partitions omitted)`);
        }

        if (stats.rows.length > showCount) {
          const oldestPartitions = stats.rows.slice(-showCount);
          logger.info(`\n  Oldest ${showCount} partitions:`);
          oldestPartitions.forEach((row: any) => {
            logger.info(`    ${row.partition_name}: ${row.row_count} rows, ${row.size}, ${row.age_days} days old`);
          });
        }

        // Total metrics count
        const totalMetrics = await pool.query(`
          SELECT COUNT(*) as total_metrics FROM device_metrics
        `);
        logger.info(`\n  Total metrics records: ${totalMetrics.rows[0].total_metrics}`);
      }

      logger.info('\nDevice metrics partition maintenance completed successfully!');

    } catch (error: any) {
      logger.error('Failed to maintain device metrics partitions:', error.message);
      throw error;
    }
  }
};

export default task;
