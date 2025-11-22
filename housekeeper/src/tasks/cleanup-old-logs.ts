/**
 * Cleanup Old Logs Task
 * 
 * Removes log files older than retention period
 */

import { HousekeeperTask } from '../housekeeper';
import * as fs from 'fs/promises';
import * as path from 'path';
import logger from '../utils/logger';

const task: HousekeeperTask = {
  name: 'cleanup-old-logs',
  // Run daily at 3am
  schedule: '0 3 * * *',
  
  run: async () => {
    logger.info('Cleaning up old logs...');

    const logDir = process.env.LOG_DIRECTORY || path.join(process.cwd(), 'logs');
    const retentionDays = parseInt(process.env.LOG_RETENTION_DAYS || '30', 10);
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    try {
      const files = await fs.readdir(logDir);
      let deletedCount = 0;

      for (const file of files) {
        const filePath = path.join(logDir, file);
        
        try {
          const stats = await fs.stat(filePath);
          
          // Delete if older than retention period
          if (stats.isFile() && stats.mtime < cutoffDate) {
            await fs.unlink(filePath);
            deletedCount++;
            logger.info(`  Deleted: ${file}`);
          }
        } catch (error: any) {
          console.warn(`  Failed to process ${file}:`, error.message);
        }
      }

      logger.info(`Deleted ${deletedCount} old log files (retention: ${retentionDays} days)`);

    } catch (error: any) {
      if (error.code === 'ENOENT') {
        logger.info(`Log directory '${logDir}' does not exist, skipping cleanup`);
      } else {
        logger.error('Failed to cleanup old logs:', error.message);
        throw error;
      }
    }
  }
};

export default task;
