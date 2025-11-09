/**
 * Traffic Stats Cleanup Task
 * 
 * Removes old device traffic statistics based on retention policy
 * Uses PostgreSQL stored function for efficient cleanup
 */

import { HousekeeperTask } from '../index';
import poolWrapper from '../../db/connection';
import logger from '../../utils/logger';

const task: HousekeeperTask = {
  name: 'traffic-stats-cleanup',
  // Run daily at 1am
  schedule: '0 1 * * *',
  // Run on startup after 5 minutes delay
  startup: 300000,
  
  run: async () => {
    const retentionDays = parseInt(process.env.TRAFFIC_RETENTION_DAYS || '90', 10);
    
    logger.info(`Cleaning up traffic stats older than ${retentionDays} days`);
    
    try {
      const result = await poolWrapper.query(
        'SELECT cleanup_old_traffic_stats($1)',
        [retentionDays]
      );
      
      const deletedCount = result.rows[0]?.cleanup_old_traffic_stats || 0;
      
      if (deletedCount > 0) {
        logger.info(`Deleted ${deletedCount} old traffic records`);
      } else {
        logger.debug('No old traffic records to delete');
      }
    } catch (error: any) {
      logger.error('Failed to cleanup old traffic stats', { error: error.message });
      throw error;
    }
  }
};

export default task;
