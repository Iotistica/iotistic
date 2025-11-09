/**
 * Trivy Image Scanner Task
 * 
 * Scans approved Docker images for security vulnerabilities using Trivy
 * Runs once per day to update security scan results for all approved images
 */

import { HousekeeperTask } from '../index';
import { pool } from '../../db/connection';
import logger from '../../utils/logger';
import { trivyScanner } from '../../services/trivy-scanner';

const task: HousekeeperTask = {
  name: 'trivy-image-scanner',
  // Run daily at 2am
  schedule: '0 2 * * *',
  
  run: async () => {
    logger.info('Starting Trivy security scanner...');

    const enabled = process.env.TRIVY_ENABLED !== 'false';
    
    if (!enabled) {
      logger.info('Trivy scanner is disabled (TRIVY_ENABLED=false)');
      return;
    }

    // Check if Trivy is available
    const available = await trivyScanner.isAvailable();
    if (!available) {
      logger.warn('Trivy scanner not available, skipping scan');
      return;
    }

    try {
      // Get all approved images with their tags
      const result = await pool.query(
        `SELECT DISTINCT i.id, i.image_name, it.tag
         FROM images i
         JOIN image_tags it ON i.id = it.image_id
         WHERE i.approval_status = 'approved'
         ORDER BY i.image_name, it.tag`
      );

      const imageTags = result.rows;
      
      if (imageTags.length === 0) {
        logger.info('No approved images found to scan');
        return;
      }

      logger.info(`Found ${imageTags.length} image tags to scan`);

      let scannedCount = 0;
      let failedCount = 0;

      for (const imageTag of imageTags) {
        try {
          logger.info(`Scanning ${imageTag.image_name}:${imageTag.tag}...`);
          
          const scanResult = await trivyScanner.scanImage(
            imageTag.image_name, 
            imageTag.tag
          );

          if (scanResult.success) {
            // Update image_tags table with scan results
            await pool.query(
              `UPDATE image_tags 
               SET security_scan_status = $1,
                   vulnerabilities_count = $2,
                   updated_at = NOW()
               WHERE image_id = $3 AND tag = $4`,
              [
                scanResult.scanStatus,
                scanResult.vulnerabilities.total,
                imageTag.id,
                imageTag.tag
              ]
            );

            const summary = trivyScanner.getSecuritySummary(scanResult);
            logger.info(`  ${imageTag.image_name}:${imageTag.tag}: ${summary}`);
            scannedCount++;
          } else {
            logger.warn(`  Scan failed for ${imageTag.image_name}:${imageTag.tag}: ${scanResult.error}`);
            failedCount++;
          }
        } catch (error: any) {
          logger.error(`  Error scanning ${imageTag.image_name}:${imageTag.tag}:`, error.message);
          failedCount++;
        }
      }

      logger.info(`Trivy security scan completed: ${scannedCount} scanned, ${failedCount} failed`);

    } catch (error: any) {
      logger.error('Trivy security scan task failed:', error.message);
      throw error;
    }
  }
};

export default task;
