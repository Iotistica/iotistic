/**
 * Device State Management Routes
 * Handles device target state, current state, and state reporting
 * 
 * Separated from cloud.ts for better organization
 * 
 * Device-Side Endpoints (used by devices themselves):
 * - GET  /api/v1/device/:uuid/state - Device polls for target state (ETag cached)
 * - POST /api/v1/device/:uuid/logs - Device uploads logs
 * - PATCH /api/v1/device/state - Device reports current state + metrics
 * 
 * Management API Endpoints (used by dashboard/admin):
 * - GET /api/v1/devices/:uuid/target-state - Get device target state
 * - POST /api/v1/devices/:uuid/target-state - Set device target state
 * - PUT /api/v1/devices/:uuid/target-state - Update device target state
 * - GET /api/v1/devices/:uuid/current-state - Get device current state
 * - DELETE /api/v1/devices/:uuid/target-state - Clear device target state
 * - GET /api/v1/devices/:uuid/logs - Get device logs
 * - GET /api/v1/devices/:uuid/metrics - Get device metrics
 */

import express from 'express';
import { query } from '../db/connection';
import {
  DeviceModel,
  DeviceLogsModel,
} from '../db/models';

import deviceAuth, { deviceAuthFromBody } from '../middleware/device-auth';


export const router = express.Router();



/**
 * Device uploads logs
 * POST /api/v1/device/:uuid/logs
 * 
 * Accepts both JSON array and NDJSON (newline-delimited JSON) formats
 */
router.post('/device/:uuid/logs', deviceAuth, express.text({ type: 'application/x-ndjson' }), async (req, res) => {
  console.log(`🔵 POST /device/:uuid/logs endpoint hit! UUID: ${req.params.uuid}`);
  try {
    const { uuid } = req.params;
    let logs: any[];

    // Check Content-Type to determine format
    const contentType = req.headers['content-type'] || '';
    
    if (contentType.includes('application/x-ndjson') || contentType.includes('text/plain')) {
      // Parse NDJSON format (newline-delimited JSON)
      const ndjsonText = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      logs = ndjsonText
        .split('\n')
        .filter(line => line.trim().length > 0)
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (e) {
            console.warn(`⚠️  Failed to parse NDJSON line: ${line.substring(0, 100)}`);
            return null;
          }
        })
        .filter(log => log !== null);
      
      console.log(`📥 Received logs from device ${uuid.substring(0, 8)}... (NDJSON format)`);
      console.log(`   Parsed ${logs.length} log entries from NDJSON`);
    } else {
      // Standard JSON array format
      logs = req.body;
      console.log(`📥 Received logs from device ${uuid.substring(0, 8)}... (JSON array format)`);
    }

    console.log(`   Type: ${typeof logs}, Is Array: ${Array.isArray(logs)}, Length: ${logs?.length}`);
    if (logs && logs.length > 0) {
      console.log(`   First log:`, JSON.stringify(logs[0], null, 2));
      console.log(`   First log keys:`, Object.keys(logs[0]));
    }

    // Ensure device exists
    await DeviceModel.getOrCreate(uuid);

    // Store logs
    if (Array.isArray(logs) && logs.length > 0) {
      console.log(`   📝 About to store ${logs.length} logs...`);
      
      // Transform agent log format to API format
      const transformedLogs = logs.map((log: any) => ({
        serviceName: log.serviceName || log.source?.name || null,
        timestamp: log.timestamp ? new Date(log.timestamp) : new Date(),
        message: log.message,
        isSystem: log.isSystem || false,
        isStderr: log.isStderr || log.isStdErr || false // Handle both field names
      }));
      
      await DeviceLogsModel.store(uuid, transformedLogs);
      console.log(`   ✅ Stored ${logs.length} log entries`);
      
      // Publish logs to Redis pub/sub for real-time WebSocket streaming
      try {
        const { redisClient } = await import('../redis/client');
        await redisClient.publish(`device:${uuid}:logs`, JSON.stringify({ logs: transformedLogs }));
        console.log(`   📡 Published ${transformedLogs.length} logs to Redis pub/sub`);
      } catch (error) {
        console.error(`   ⚠️  Failed to publish logs to Redis:`, error);
        // Don't fail the request if Redis publish fails
      }
    } else {
      console.log(`   ⚠️  No logs to store or invalid format`);
    }

    res.json({ status: 'ok', received: Array.isArray(logs) ? logs.length : 0 });
  } catch (error: any) {
    console.error('❌ Error storing logs:', error);
    res.status(500).json({
      error: 'Failed to process logs',
      message: error.message
    });
  }
});


/**
 * Get device logs
 * GET /api/v1/devices/:uuid/logs
 */
router.get('/devices/:uuid/logs', async (req, res) => {
  try {
    const { uuid } = req.params;
    const serviceName = req.query.service as string | undefined;
    const limit = parseInt(req.query.limit as string) || 1000;
    const offset = parseInt(req.query.offset as string) || 0;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;

    // Build filter options
    const filterOptions: any = {
      serviceName,
      limit,
      offset,
    };

    // Add date range filtering
    if (from) {
      filterOptions.since = new Date(from);
    }
    
    // Note: DeviceLogsModel doesn't have 'until' param, so we'll filter by 'since'
    // and rely on limit. For proper date range, we'd need to add 'until' support.

    const logs = await DeviceLogsModel.get(uuid, filterOptions);
    
    // If 'to' is provided, filter results in memory (temporary solution)
    let filteredLogs = logs;
    if (to) {
      const toDate = new Date(to);
      toDate.setHours(23, 59, 59, 999); // End of day
      filteredLogs = logs.filter(log => new Date(log.timestamp) <= toDate);
    }

    res.json({
      count: filteredLogs.length,
      logs: filteredLogs,
    });
  } catch (error: any) {
    console.error('Error getting logs:', error);
    res.status(500).json({
      error: 'Failed to get logs',
      message: error.message
    });
  }
});

/**
 * Get list of services with logs for a device
 * GET /api/v1/devices/:uuid/logs/services
 */
router.get('/devices/:uuid/logs/services', async (req, res) => {
  try {
    const { uuid } = req.params;
    
    const result = await query(
      'SELECT DISTINCT service_name FROM device_logs WHERE device_uuid = $1 ORDER BY service_name ASC',
      [uuid]
    );
    
    const services = result.rows.map(row => row.service_name);
    
    res.json({
      services,
    });
  } catch (error: any) {
    console.error('Error getting log services:', error);
    res.status(500).json({
      error: 'Failed to get log services',
      message: error.message
    });
  }
});



export default router;
