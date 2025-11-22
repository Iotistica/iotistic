/**
 * Security Scan Images Task
 * 
 * Scans approved Docker images for vulnerabilities using Trivy
 * Runs periodically to detect newly discovered CVEs
 */

import { HousekeeperTask } from '../housekeeper';
import { pool } from '../db/connection';
import { trivyScanner } from '../services/trivy-scanner';
import logger from '../utils/logger';

const task: HousekeeperTask = {
  name: 'security-scan-images',
  // Run daily at 4am
  schedule: '0 4 * * *',
  // Run 5 minutes after startup
  startup: 5 * 60 * 1000,
  
  run: async () => {
    logger.info('Starting security scan of approved images...');

    try {
      // Check if Trivy is available
      const isAvailable = await trivyScanner.isAvailable();
      if (!isAvailable) {
        logger.warn('Trivy scanner not available, skipping security scans');
        return;
      }

      // Get all approved images from registry
      const result = await pool.query(
        `SELECT id, image_name, tag, approved_at, approved_by
         FROM image_registry
         WHERE status = 'approved'
         ORDER BY approved_at DESC`
      );

      if (result.rows.length === 0) {
        logger.info('No approved images found to scan');
        return;
      }

      logger.info('Found approved images to scan', { count: result.rows.length });

      let scannedCount = 0;
      let failedCount = 0;
      let warningCount = 0;

      for (const image of result.rows) {
        try {
          logger.info('Scanning image', {
            imageId: image.id,
            imageName: image.image_name,
            tag: image.tag
          });

          // Run Trivy scan
          const scanResult = await trivyScanner.scanImage(image.image_name, image.tag);

          // Store scan results in database
          await pool.query(
            `INSERT INTO image_security_scans 
             (image_id, scanned_at, vulnerabilities, scan_status, details, error)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [
              image.id,
              scanResult.scannedAt,
              JSON.stringify(scanResult.vulnerabilities),
              scanResult.scanStatus,
              scanResult.details ? JSON.stringify(scanResult.details) : null,
              scanResult.error || null
            ]
          );

          scannedCount++;

          // Log results
          const summary = trivyScanner.getSecuritySummary(scanResult);
          logger.info('Scan result', {
            image: `${image.image_name}:${image.tag}`,
            status: scanResult.scanStatus,
            summary
          });

          if (scanResult.scanStatus === 'failed') {
            failedCount++;
          } else if (scanResult.scanStatus === 'warning') {
            warningCount++;
          }

          // Small delay between scans to avoid overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 1000));

        } catch (error: any) {
          logger.error('Failed to scan image', {
            imageId: image.id,
            imageName: image.image_name,
            tag: image.tag,
            error: error.message
          });
          failedCount++;
        }
      }

      logger.info('Security scan complete', {
        totalImages: result.rows.length,
        scanned: scannedCount,
        failed: failedCount,
        warnings: warningCount,
        passed: scannedCount - failedCount - warningCount
      });

    } catch (error: any) {
      logger.error('Security scan task failed', { error: error.message });
      throw error;
    }
  }
};

export default task;
