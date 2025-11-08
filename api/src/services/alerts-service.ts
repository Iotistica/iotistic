/**
 * Alerts Service
 * 
 * Handles log alert rule management and alert instance processing
 */

import { query } from '../db/connection';
import logger from '../utils/logger';

export interface AlertRule {
  id?: number;
  name: string;
  description?: string;
  device_uuid?: string;
  pattern: string;
  pattern_type: 'regex' | 'keyword' | 'exact';
  service_name?: string;
  level?: string;
  trigger_type: 'count' | 'rate' | 'sequence';
  threshold: number;
  time_window: number;
  severity: 'info' | 'warning' | 'critical';
  notify_email: boolean;
  notify_webhook: boolean;
  notify_dashboard: boolean;
  is_enabled: boolean;
}

export interface Alert {
  id?: number;
  rule_id: number;
  device_uuid: string;
  matched_log_ids: number[];
  message: string;
  count: number;
  status: 'active' | 'acknowledged' | 'resolved';
  severity: 'info' | 'warning' | 'critical';
  first_seen: Date;
  last_seen: Date;
  acknowledged_at?: Date;
  acknowledged_by?: string;
  resolved_at?: Date;
}

export interface AlertStats {
  total_active: number;
  total_acknowledged: number;
  total_resolved: number;
  by_severity: {
    critical: number;
    warning: number;
    info: number;
  };
  by_device: Array<{
    device_uuid: string;
    count: number;
  }>;
  recent_trends: Array<{
    date: string;
    count: number;
  }>;
}

/**
 * Get all alert rules with optional filters
 */
export async function getAlertRules(filters?: {
  device_uuid?: string;
  is_enabled?: boolean;
  severity?: string;
}): Promise<AlertRule[]> {
  logger.info('Fetching alert rules', { filters });

  let sql = 'SELECT * FROM log_alert_rules WHERE 1=1';
  const params: any[] = [];
  let paramCount = 0;

  if (filters?.device_uuid !== undefined) {
    paramCount++;
    if (filters.device_uuid === null) {
      sql += ' AND device_uuid IS NULL';
    } else {
      sql += ` AND device_uuid = $${paramCount}`;
      params.push(filters.device_uuid);
    }
  }

  if (filters?.is_enabled !== undefined) {
    paramCount++;
    sql += ` AND is_enabled = $${paramCount}`;
    params.push(filters.is_enabled);
  }

  if (filters?.severity) {
    paramCount++;
    sql += ` AND severity = $${paramCount}`;
    params.push(filters.severity);
  }

  sql += ' ORDER BY created_at DESC';

  const result = await query(sql, params);
  
  logger.info('Alert rules fetched', { count: result.rows.length });
  
  return result.rows;
}

/**
 * Get alert rule by ID
 */
export async function getAlertRuleById(id: number): Promise<AlertRule | null> {
  logger.info('Fetching alert rule by ID', { id });

  const result = await query(
    'SELECT * FROM log_alert_rules WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    logger.warn('Alert rule not found', { id });
    return null;
  }

  return result.rows[0];
}

/**
 * Create new alert rule
 */
export async function createAlertRule(rule: Omit<AlertRule, 'id'>): Promise<AlertRule> {
  logger.info('Creating alert rule', { name: rule.name, pattern: rule.pattern });

  const result = await query(
    `INSERT INTO log_alert_rules (
      name, description, device_uuid, pattern, pattern_type,
      service_name, level, trigger_type, threshold, time_window,
      severity, notify_email, notify_webhook, notify_dashboard, is_enabled
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
    RETURNING *`,
    [
      rule.name,
      rule.description || null,
      rule.device_uuid || null,
      rule.pattern,
      rule.pattern_type,
      rule.service_name || null,
      rule.level || null,
      rule.trigger_type,
      rule.threshold,
      rule.time_window,
      rule.severity,
      rule.notify_email,
      rule.notify_webhook,
      rule.notify_dashboard,
      rule.is_enabled
    ]
  );

  const createdRule = result.rows[0];
  
  logger.info('Alert rule created', { id: createdRule.id, name: createdRule.name });
  
  return createdRule;
}

/**
 * Update existing alert rule
 */
export async function updateAlertRule(id: number, updates: Partial<AlertRule>): Promise<AlertRule | null> {
  logger.info('Updating alert rule', { id, updates });

  // Build dynamic UPDATE query
  const fields: string[] = [];
  const params: any[] = [];
  let paramCount = 0;

  Object.entries(updates).forEach(([key, value]) => {
    if (key !== 'id') {
      paramCount++;
      fields.push(`${key} = $${paramCount}`);
      params.push(value);
    }
  });

  if (fields.length === 0) {
    logger.warn('No fields to update', { id });
    return getAlertRuleById(id);
  }

  paramCount++;
  params.push(id);

  const sql = `UPDATE log_alert_rules SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`;

  const result = await query(sql, params);

  if (result.rows.length === 0) {
    logger.warn('Alert rule not found for update', { id });
    return null;
  }

  logger.info('Alert rule updated', { id });
  
  return result.rows[0];
}

/**
 * Delete alert rule
 */
export async function deleteAlertRule(id: number): Promise<boolean> {
  logger.info('Deleting alert rule', { id });

  const result = await query(
    'DELETE FROM log_alert_rules WHERE id = $1 RETURNING id',
    [id]
  );

  const deleted = result.rows.length > 0;
  
  if (deleted) {
    logger.info('Alert rule deleted', { id });
  } else {
    logger.warn('Alert rule not found for deletion', { id });
  }
  
  return deleted;
}

/**
 * Get alerts with filters
 */
export async function getAlerts(filters?: {
  device_uuid?: string;
  status?: 'active' | 'acknowledged' | 'resolved';
  severity?: string;
  limit?: number;
  offset?: number;
}): Promise<{ alerts: Alert[]; total: number }> {
  logger.info('Fetching alerts', { filters });

  let sql = 'SELECT * FROM log_alerts WHERE 1=1';
  const params: any[] = [];
  let paramCount = 0;

  if (filters?.device_uuid) {
    paramCount++;
    sql += ` AND device_uuid = $${paramCount}`;
    params.push(filters.device_uuid);
  }

  if (filters?.status) {
    paramCount++;
    sql += ` AND status = $${paramCount}`;
    params.push(filters.status);
  }

  if (filters?.severity) {
    paramCount++;
    sql += ` AND severity = $${paramCount}`;
    params.push(filters.severity);
  }

  // Get total count
  const countResult = await query(sql.replace('SELECT *', 'SELECT COUNT(*)'), params);
  const total = parseInt(countResult.rows[0].count);

  // Apply pagination
  sql += ' ORDER BY last_seen DESC';
  
  if (filters?.limit) {
    paramCount++;
    sql += ` LIMIT $${paramCount}`;
    params.push(filters.limit);
  }

  if (filters?.offset) {
    paramCount++;
    sql += ` OFFSET $${paramCount}`;
    params.push(filters.offset);
  }

  const result = await query(sql, params);
  
  logger.info('Alerts fetched', { count: result.rows.length, total });
  
  return {
    alerts: result.rows,
    total
  };
}

/**
 * Get alert by ID
 */
export async function getAlertById(id: number): Promise<Alert | null> {
  logger.info('Fetching alert by ID', { id });

  const result = await query(
    'SELECT * FROM log_alerts WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    logger.warn('Alert not found', { id });
    return null;
  }

  return result.rows[0];
}

/**
 * Acknowledge alert
 */
export async function acknowledgeAlert(id: number, acknowledgedBy: string): Promise<Alert | null> {
  logger.info('Acknowledging alert', { id, acknowledgedBy });

  const result = await query(
    `UPDATE log_alerts 
     SET status = 'acknowledged', 
         acknowledged_at = CURRENT_TIMESTAMP,
         acknowledged_by = $2
     WHERE id = $1 AND status = 'active'
     RETURNING *`,
    [id, acknowledgedBy]
  );

  if (result.rows.length === 0) {
    logger.warn('Alert not found or already acknowledged', { id });
    return null;
  }

  logger.info('Alert acknowledged', { id });
  
  return result.rows[0];
}

/**
 * Resolve alert
 */
export async function resolveAlert(id: number): Promise<Alert | null> {
  logger.info('Resolving alert', { id });

  const result = await query(
    `UPDATE log_alerts 
     SET status = 'resolved',
         resolved_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND status IN ('active', 'acknowledged')
     RETURNING *`,
    [id]
  );

  if (result.rows.length === 0) {
    logger.warn('Alert not found or already resolved', { id });
    return null;
  }

  logger.info('Alert resolved', { id });
  
  return result.rows[0];
}

/**
 * Get alert statistics
 */
export async function getAlertStats(deviceUuid?: string): Promise<AlertStats> {
  logger.info('Fetching alert statistics', { deviceUuid });

  const deviceFilter = deviceUuid ? 'AND device_uuid = $1' : '';
  const params = deviceUuid ? [deviceUuid] : [];

  // Get counts by status
  const statusResult = await query(
    `SELECT 
       COUNT(*) FILTER (WHERE status = 'active') as total_active,
       COUNT(*) FILTER (WHERE status = 'acknowledged') as total_acknowledged,
       COUNT(*) FILTER (WHERE status = 'resolved') as total_resolved,
       COUNT(*) FILTER (WHERE severity = 'critical') as critical,
       COUNT(*) FILTER (WHERE severity = 'warning') as warning,
       COUNT(*) FILTER (WHERE severity = 'info') as info
     FROM log_alerts
     WHERE 1=1 ${deviceFilter}`,
    params
  );

  const stats = statusResult.rows[0];

  // Get counts by device
  const deviceResult = await query(
    `SELECT device_uuid, COUNT(*) as count
     FROM log_alerts
     WHERE status = 'active' ${deviceFilter}
     GROUP BY device_uuid
     ORDER BY count DESC
     LIMIT 10`,
    params
  );

  // Get recent trends (last 7 days)
  const trendsResult = await query(
    `SELECT 
       DATE(created_at) as date,
       COUNT(*) as count
     FROM log_alerts
     WHERE created_at > CURRENT_TIMESTAMP - INTERVAL '7 days' ${deviceFilter}
     GROUP BY DATE(created_at)
     ORDER BY date DESC`,
    params
  );

  logger.info('Alert statistics fetched', {
    total_active: stats.total_active,
    total_acknowledged: stats.total_acknowledged,
    total_resolved: stats.total_resolved
  });

  return {
    total_active: parseInt(stats.total_active),
    total_acknowledged: parseInt(stats.total_acknowledged),
    total_resolved: parseInt(stats.total_resolved),
    by_severity: {
      critical: parseInt(stats.critical),
      warning: parseInt(stats.warning),
      info: parseInt(stats.info)
    },
    by_device: deviceResult.rows.map(row => ({
      device_uuid: row.device_uuid,
      count: parseInt(row.count)
    })),
    recent_trends: trendsResult.rows.map(row => ({
      date: row.date,
      count: parseInt(row.count)
    }))
  };
}

/**
 * Process log entries to check for alert triggers
 * This should be called by a background worker or when new logs arrive
 */
export async function processLogAlerts(deviceUuid: string): Promise<void> {
  logger.info('Processing log alerts', { deviceUuid });

  // Get enabled rules for this device (global + device-specific)
  const rules = await query(
    `SELECT * FROM log_alert_rules 
     WHERE is_enabled = true 
     AND (device_uuid IS NULL OR device_uuid = $1)`,
    [deviceUuid]
  );

  for (const rule of rules.rows) {
    try {
      await checkRuleMatches(rule, deviceUuid);
    } catch (error) {
      logger.error('Error checking alert rule', {
        ruleId: rule.id,
        ruleName: rule.name,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  logger.info('Log alert processing complete', { deviceUuid, rulesChecked: rules.rows.length });
}

/**
 * Check if a specific rule matches recent logs
 */
async function checkRuleMatches(rule: any, deviceUuid: string): Promise<void> {
  const timeWindow = new Date(Date.now() - rule.time_window * 1000);

  // Build pattern match condition based on pattern_type
  let patternCondition = '';
  if (rule.pattern_type === 'regex') {
    patternCondition = `message ~* $5`;
  } else if (rule.pattern_type === 'keyword') {
    const keywords = rule.pattern.split('|');
    patternCondition = keywords.map((_, i) => `message ILIKE $${5 + i}`).join(' OR ');
  } else if (rule.pattern_type === 'exact') {
    patternCondition = `message = $5`;
  }

  // Build SQL query
  const params: any[] = [deviceUuid, timeWindow];
  let paramCount = 2;

  let sql = `
    SELECT * FROM device_logs
    WHERE device_uuid = $1
    AND timestamp > $2
  `;

  if (rule.service_name) {
    paramCount++;
    sql += ` AND service_name = $${paramCount}`;
    params.push(rule.service_name);
  }

  if (rule.level) {
    paramCount++;
    sql += ` AND level = $${paramCount}`;
    params.push(rule.level);
  }

  // Add pattern condition
  if (rule.pattern_type === 'keyword') {
    const keywords = rule.pattern.split('|');
    keywords.forEach(keyword => {
      paramCount++;
      params.push(`%${keyword.trim()}%`);
    });
    sql += ` AND (${patternCondition})`;
  } else {
    paramCount++;
    params.push(rule.pattern);
    sql += ` AND (${patternCondition})`;
  }

  sql += ' ORDER BY timestamp DESC';

  const matches = await query(sql, params);

  // Check if threshold exceeded
  if (matches.rows.length >= rule.threshold) {
    await createOrUpdateAlert(rule, matches.rows, deviceUuid);
  }
}

/**
 * Create or update alert instance
 */
async function createOrUpdateAlert(rule: any, matchedLogs: any[], deviceUuid: string): Promise<void> {
  const logIds = matchedLogs.map(log => log.id);

  // Check if active alert already exists for this rule
  const existing = await query(
    `SELECT * FROM log_alerts 
     WHERE rule_id = $1 
     AND device_uuid = $2
     AND status = 'active'
     ORDER BY first_seen DESC 
     LIMIT 1`,
    [rule.id, deviceUuid]
  );

  if (existing.rows.length > 0) {
    // Update existing alert
    await query(
      `UPDATE log_alerts 
       SET count = $1, 
           last_seen = $2, 
           matched_log_ids = $3
       WHERE id = $4`,
      [
        matchedLogs.length,
        new Date(matchedLogs[0].timestamp),
        logIds,
        existing.rows[0].id
      ]
    );

    logger.info('Alert updated', {
      alertId: existing.rows[0].id,
      ruleId: rule.id,
      count: matchedLogs.length
    });
  } else {
    // Create new alert
    const result = await query(
      `INSERT INTO log_alerts (
        rule_id, device_uuid, matched_log_ids, message, count, 
        severity, first_seen, last_seen, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'active')
      RETURNING id`,
      [
        rule.id,
        deviceUuid,
        logIds,
        `Alert: "${rule.name}" - ${matchedLogs.length} matches found`,
        matchedLogs.length,
        rule.severity,
        new Date(matchedLogs[matchedLogs.length - 1].timestamp),
        new Date(matchedLogs[0].timestamp)
      ]
    );

    logger.info('Alert created', {
      alertId: result.rows[0].id,
      ruleId: rule.id,
      ruleName: rule.name,
      count: matchedLogs.length
    });

    // TODO: Send notifications based on rule settings
    if (rule.notify_dashboard) {
      // Publish to Redis for WebSocket notification
      await publishAlertNotification(result.rows[0].id, deviceUuid);
    }
  }
}

/**
 * Publish alert notification via Redis pub/sub
 */
async function publishAlertNotification(alertId: number, deviceUuid: string): Promise<void> {
  try {
    const { redisClient } = await import('../redis/client');
    
    const alert = await getAlertById(alertId);
    if (!alert) return;

    await redisClient.publish(
      `device:${deviceUuid}:alerts`,
      JSON.stringify(alert)
    );

    await redisClient.publish(
      'global:alerts',
      JSON.stringify(alert)
    );

    logger.info('Alert notification published', { alertId, deviceUuid });
  } catch (error) {
    logger.error('Failed to publish alert notification', {
      alertId,
      deviceUuid,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
