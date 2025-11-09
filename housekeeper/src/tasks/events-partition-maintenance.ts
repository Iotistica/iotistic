/**
 * Events Partition Maintenance Task
 * 
 * Creates future events partitions and drops old ones to ensure:
 * 1. Events are never rejected due to missing partitions
 * 2. Old data is cleaned up according to retention policy
 * 
 * Runs daily at 2am to maintain partition coverage
 */

import { HousekeeperTask } from '../housekeeper';
import { pool } from '../db/connection';
import logger from '../utils/logger';

// Retention period in days (configurable via environment variable)
const RETENTION_DAYS = parseInt(process.env.EVENTS_RETENTION_DAYS || '90');

const task: HousekeeperTask = {
  name: 'events-partition-maintenance',
  // Run daily at 2am
  schedule: '0 2 * * *',
  // Also run on startup to ensure partitions exist immediately
  startup: true,
  
  run: async () => {
    logger.info('Running events partition maintenance...');
    logger.info(`   Retention period: ${RETENTION_DAYS} days\n`);

    try {
      // 1. Create future partitions (next 30 days)
      logger.info('Creating future partitions...');
      const createResult = await pool.query(`
        SELECT create_events_partition((CURRENT_DATE + (i || ' days')::INTERVAL)::DATE) as result
        FROM generate_series(0, 30) AS i
      `);

      const created = createResult.rows.filter((r: any) => r.result?.startsWith('CREATED:')).length;
      const existing = createResult.rows.filter((r: any) => r.result?.startsWith('EXISTS:')).length;

      logger.info(`Created: ${created} partitions`);
      logger.info(`  ℹ Already exists: ${existing} partitions`);

      // 2. Drop old partitions
      logger.info(`\n🗑️  Dropping partitions older than ${RETENTION_DAYS} days...`);
      const dropResult = await pool.query(`
        SELECT drop_old_event_partitions($1) as result
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
        SELECT 
          COUNT(*) as total_partitions,
          MIN(TO_DATE(SUBSTRING(tablename FROM 'events_(.*)'), 'YYYY_MM_DD')) as oldest_date,
          MAX(TO_DATE(SUBSTRING(tablename FROM 'events_(.*)'), 'YYYY_MM_DD')) as newest_date
        FROM pg_tables 
        WHERE schemaname = 'public' 
        AND tablename LIKE 'events_%'
        AND tablename ~ '^events_[0-9]{4}_[0-9]{2}_[0-9]{2}$'
      `);

      const eventCounts = await pool.query(`
        SELECT 
          COUNT(*) as total_events,
          COUNT(DISTINCT DATE(timestamp)) as days_with_events,
          MIN(timestamp) as oldest_event,
          MAX(timestamp) as newest_event
        FROM events
      `);

      logger.info('\nCurrent Status:');
      logger.info(`  Partitions: ${stats.rows[0].total_partitions}`);
      logger.info(`  Date range: ${stats.rows[0].oldest_date} to ${stats.rows[0].newest_date}`);
      logger.info(`  Total events: ${eventCounts.rows[0].total_events}`);
      logger.info(`  Days with events: ${eventCounts.rows[0].days_with_events}`);

      const totalEvents = parseInt(eventCounts.rows[0].total_events);
      if (totalEvents > 0) {
        logger.info(`  Oldest event: ${eventCounts.rows[0].oldest_event}`);
        logger.info(`  Newest event: ${eventCounts.rows[0].newest_event}`);
      }

      // 4. Check for event types distribution (last 7 days)
      const typeStats = await pool.query(`
        SELECT 
          event_type,
          COUNT(*) as count
        FROM events
        WHERE timestamp > NOW() - INTERVAL '7 days'
        GROUP BY event_type
        ORDER BY count DESC
        LIMIT 10
      `);

      if (typeStats.rows.length > 0) {
        logger.info('\n Top 10 Event Types (last 7 days):');
        typeStats.rows.forEach((row: any) => {
          logger.info(`  ${row.event_type}: ${row.count} events`);
        });
      }

      logger.info('\nEvents partition maintenance completed successfully!');

    } catch (error: any) {
      logger.error('Failed to maintain events partitions:', error.message);
      throw error;
    }
  }
};

export default task;
