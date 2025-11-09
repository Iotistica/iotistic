/**
 * Database Vacuum Task
 * 
 * Runs PostgreSQL VACUUM ANALYZE maintenance operation
 */

import { HousekeeperTask } from '../housekeeper';
import { pool } from '../db/connection';
import logger from '../utils/logger';

const task: HousekeeperTask = {
  name: 'database-vacuum',
  // Run weekly on Sunday at 4am
  schedule: '0 4 * * 0',
  
  run: async () => {
    logger.info('🧹 Running database maintenance...');

    try {
      // PostgreSQL VACUUM ANALYZE
      await pool.query('VACUUM ANALYZE');
      logger.info('PostgreSQL VACUUM ANALYZE completed');

    } catch (error: any) {
      logger.error('Failed to run database maintenance:', error.message);
      throw error;
    }
  }
};

export default task;
