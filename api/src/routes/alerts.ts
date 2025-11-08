/**
 * Alerts Routes
 * 
 * REST API endpoints for alert rule management and alert instances
 * 
 * Alert Rules:
 * - GET    /api/v1/alert-rules - List all alert rules
 * - POST   /api/v1/alert-rules - Create new alert rule
 * - GET    /api/v1/alert-rules/:id - Get alert rule by ID
 * - PUT    /api/v1/alert-rules/:id - Update alert rule
 * - DELETE /api/v1/alert-rules/:id - Delete alert rule
 * 
 * Alerts:
 * - GET    /api/v1/alerts - List alerts with filters
 * - GET    /api/v1/alerts/:id - Get alert by ID
 * - POST   /api/v1/alerts/:id/acknowledge - Acknowledge alert
 * - POST   /api/v1/alerts/:id/resolve - Resolve alert
 * - GET    /api/v1/alerts/stats - Get alert statistics
 * - POST   /api/v1/alerts/process/:deviceUuid - Manually trigger alert processing
 */

import express from 'express';
import logger from '../utils/logger';
import * as AlertsService from '../services/alerts-service';

export const router = express.Router();

// ============================================================================
// ALERT RULES ENDPOINTS
// ============================================================================

/**
 * Get all alert rules
 * GET /api/v1/alert-rules
 * 
 * Query params:
 * - device_uuid: Filter by device (use 'global' for global rules)
 * - is_enabled: Filter by enabled status (true/false)
 * - severity: Filter by severity (info/warning/critical)
 */
router.get('/alert-rules', async (req, res) => {
  try {
    const filters: any = {};

    if (req.query.device_uuid) {
      filters.device_uuid = req.query.device_uuid === 'global' ? null : req.query.device_uuid;
    }

    if (req.query.is_enabled !== undefined) {
      filters.is_enabled = req.query.is_enabled === 'true';
    }

    if (req.query.severity) {
      filters.severity = req.query.severity;
    }

    const rules = await AlertsService.getAlertRules(filters);

    res.json({
      count: rules.length,
      rules
    });
  } catch (error) {
    logger.error('Error fetching alert rules', {
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({
      error: 'Failed to fetch alert rules',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get alert rule by ID
 * GET /api/v1/alert-rules/:id
 */
router.get('/alert-rules/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid rule ID' });
    }

    const rule = await AlertsService.getAlertRuleById(id);

    if (!rule) {
      return res.status(404).json({ error: 'Alert rule not found' });
    }

    res.json(rule);
  } catch (error) {
    logger.error('Error fetching alert rule', {
      id: req.params.id,
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({
      error: 'Failed to fetch alert rule',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Create new alert rule
 * POST /api/v1/alert-rules
 * 
 * Body:
 * {
 *   "name": "Critical Errors",
 *   "description": "Detect critical errors",
 *   "device_uuid": "...", // Optional, null for global
 *   "pattern": "ERROR|CRITICAL",
 *   "pattern_type": "keyword",
 *   "service_name": "api", // Optional
 *   "level": "error", // Optional
 *   "trigger_type": "count",
 *   "threshold": 1,
 *   "time_window": 300,
 *   "severity": "critical",
 *   "notify_email": false,
 *   "notify_webhook": false,
 *   "notify_dashboard": true,
 *   "is_enabled": true
 * }
 */
router.post('/alert-rules', async (req, res) => {
  try {
    const rule = req.body;

    // Validate required fields
    if (!rule.name || !rule.pattern || !rule.pattern_type || !rule.trigger_type || !rule.severity) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['name', 'pattern', 'pattern_type', 'trigger_type', 'severity']
      });
    }

    // Validate pattern_type
    if (!['regex', 'keyword', 'exact'].includes(rule.pattern_type)) {
      return res.status(400).json({
        error: 'Invalid pattern_type',
        allowed: ['regex', 'keyword', 'exact']
      });
    }

    // Validate trigger_type
    if (!['count', 'rate', 'sequence'].includes(rule.trigger_type)) {
      return res.status(400).json({
        error: 'Invalid trigger_type',
        allowed: ['count', 'rate', 'sequence']
      });
    }

    // Validate severity
    if (!['info', 'warning', 'critical'].includes(rule.severity)) {
      return res.status(400).json({
        error: 'Invalid severity',
        allowed: ['info', 'warning', 'critical']
      });
    }

    const createdRule = await AlertsService.createAlertRule(rule);

    logger.info('Alert rule created via API', {
      id: createdRule.id,
      name: createdRule.name
    });

    res.status(201).json(createdRule);
  } catch (error) {
    logger.error('Error creating alert rule', {
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({
      error: 'Failed to create alert rule',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Update alert rule
 * PUT /api/v1/alert-rules/:id
 */
router.put('/alert-rules/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid rule ID' });
    }

    const updates = req.body;

    // Validate pattern_type if provided
    if (updates.pattern_type && !['regex', 'keyword', 'exact'].includes(updates.pattern_type)) {
      return res.status(400).json({
        error: 'Invalid pattern_type',
        allowed: ['regex', 'keyword', 'exact']
      });
    }

    // Validate trigger_type if provided
    if (updates.trigger_type && !['count', 'rate', 'sequence'].includes(updates.trigger_type)) {
      return res.status(400).json({
        error: 'Invalid trigger_type',
        allowed: ['count', 'rate', 'sequence']
      });
    }

    // Validate severity if provided
    if (updates.severity && !['info', 'warning', 'critical'].includes(updates.severity)) {
      return res.status(400).json({
        error: 'Invalid severity',
        allowed: ['info', 'warning', 'critical']
      });
    }

    const updatedRule = await AlertsService.updateAlertRule(id, updates);

    if (!updatedRule) {
      return res.status(404).json({ error: 'Alert rule not found' });
    }

    logger.info('Alert rule updated via API', {
      id: updatedRule.id,
      name: updatedRule.name
    });

    res.json(updatedRule);
  } catch (error) {
    logger.error('Error updating alert rule', {
      id: req.params.id,
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({
      error: 'Failed to update alert rule',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Delete alert rule
 * DELETE /api/v1/alert-rules/:id
 */
router.delete('/alert-rules/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid rule ID' });
    }

    const deleted = await AlertsService.deleteAlertRule(id);

    if (!deleted) {
      return res.status(404).json({ error: 'Alert rule not found' });
    }

    logger.info('Alert rule deleted via API', { id });

    res.json({ success: true, message: 'Alert rule deleted' });
  } catch (error) {
    logger.error('Error deleting alert rule', {
      id: req.params.id,
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({
      error: 'Failed to delete alert rule',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// ============================================================================
// ALERTS ENDPOINTS
// ============================================================================

/**
 * Get alerts with filters
 * GET /api/v1/alerts
 * 
 * Query params:
 * - device_uuid: Filter by device
 * - status: Filter by status (active/acknowledged/resolved)
 * - severity: Filter by severity (info/warning/critical)
 * - limit: Number of results (default: 100)
 * - offset: Pagination offset (default: 0)
 */
router.get('/alerts', async (req, res) => {
  try {
    const filters: any = {};

    if (req.query.device_uuid) {
      filters.device_uuid = req.query.device_uuid;
    }

    if (req.query.status) {
      filters.status = req.query.status;
    }

    if (req.query.severity) {
      filters.severity = req.query.severity;
    }

    filters.limit = parseInt(req.query.limit as string) || 100;
    filters.offset = parseInt(req.query.offset as string) || 0;

    const result = await AlertsService.getAlerts(filters);

    res.json({
      count: result.alerts.length,
      total: result.total,
      alerts: result.alerts
    });
  } catch (error) {
    logger.error('Error fetching alerts', {
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({
      error: 'Failed to fetch alerts',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get alert by ID
 * GET /api/v1/alerts/:id
 */
router.get('/alerts/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid alert ID' });
    }

    const alert = await AlertsService.getAlertById(id);

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found' });
    }

    res.json(alert);
  } catch (error) {
    logger.error('Error fetching alert', {
      id: req.params.id,
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({
      error: 'Failed to fetch alert',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Acknowledge alert
 * POST /api/v1/alerts/:id/acknowledge
 * 
 * Body:
 * {
 *   "acknowledged_by": "username"
 * }
 */
router.post('/alerts/:id/acknowledge', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid alert ID' });
    }

    const acknowledgedBy = req.body.acknowledged_by || 'system';

    const alert = await AlertsService.acknowledgeAlert(id, acknowledgedBy);

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found or already acknowledged' });
    }

    logger.info('Alert acknowledged via API', {
      id: alert.id,
      acknowledgedBy
    });

    res.json(alert);
  } catch (error) {
    logger.error('Error acknowledging alert', {
      id: req.params.id,
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({
      error: 'Failed to acknowledge alert',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Resolve alert
 * POST /api/v1/alerts/:id/resolve
 */
router.post('/alerts/:id/resolve', async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid alert ID' });
    }

    const alert = await AlertsService.resolveAlert(id);

    if (!alert) {
      return res.status(404).json({ error: 'Alert not found or already resolved' });
    }

    logger.info('Alert resolved via API', { id: alert.id });

    res.json(alert);
  } catch (error) {
    logger.error('Error resolving alert', {
      id: req.params.id,
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({
      error: 'Failed to resolve alert',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Get alert statistics
 * GET /api/v1/alerts/stats
 * 
 * Query params:
 * - device_uuid: Filter stats by device (optional)
 */
router.get('/alerts/stats', async (req, res) => {
  try {
    const deviceUuid = req.query.device_uuid as string | undefined;

    const stats = await AlertsService.getAlertStats(deviceUuid);

    res.json(stats);
  } catch (error) {
    logger.error('Error fetching alert statistics', {
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({
      error: 'Failed to fetch alert statistics',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * Manually trigger alert processing for a device
 * POST /api/v1/alerts/process/:deviceUuid
 * 
 * Useful for testing or forcing immediate alert evaluation
 */
router.post('/alerts/process/:deviceUuid', async (req, res) => {
  try {
    const { deviceUuid } = req.params;

    logger.info('Manual alert processing triggered via API', { deviceUuid });

    await AlertsService.processLogAlerts(deviceUuid);

    res.json({
      success: true,
      message: 'Alert processing completed',
      deviceUuid
    });
  } catch (error) {
    logger.error('Error processing alerts', {
      deviceUuid: req.params.deviceUuid,
      error: error instanceof Error ? error.message : String(error)
    });
    res.status(500).json({
      error: 'Failed to process alerts',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
