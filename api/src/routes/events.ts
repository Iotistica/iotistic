/**
 * Event Sourcing Routes
 * Endpoints for querying device-related events for timeline visualization
 */

import express from 'express';
import { EventStore } from '../services/event-sourcing';

export const router = express.Router();

// ============================================================================
// Event Query Endpoints
// ============================================================================

/**
 * Get events for a specific device
 * GET /api/v1/events/device/:deviceUuid
 * Query params:
 *   - limit: number of events to return (default 50, max 500)
 *   - sinceEventId: get events after this event ID
 *   - eventType: filter by specific event type
 */
router.get('/events/device/:deviceUuid', async (req, res) => {
  try {
    const { deviceUuid } = req.params;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
    const sinceEventId = req.query.sinceEventId ? parseInt(req.query.sinceEventId as string) : undefined;
    const eventType = req.query.eventType as string | undefined;

    console.log(`[Events API] Fetching events for device: ${deviceUuid}`);

    // Get events for this device
    let events = await EventStore.getAggregateEvents('device', deviceUuid, sinceEventId);

    // Filter by event type if specified
    if (eventType) {
      events = events.filter(e => e.event_type === eventType);
    }

    // Apply limit
    events = events.slice(0, limit);

    // Transform events for timeline display
    const timelineEvents = events.map(event => ({
      id: event.id,
      event_id: event.event_id,
      timestamp: event.timestamp,
      type: event.event_type,
      category: categorizeEvent(event.event_type),
      title: generateEventTitle(event.event_type),
      description: generateEventDescription(event),
      data: event.data,
      metadata: event.metadata,
      source: event.source,
      correlation_id: event.correlation_id,
    }));

    res.json({
      success: true,
      count: timelineEvents.length,
      deviceUuid,
      events: timelineEvents,
    });
  } catch (error) {
    console.error('[Events API] Error fetching device events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch device events',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get event chain by correlation ID
 * GET /api/v1/events/chain/:correlationId
 */
router.get('/events/chain/:correlationId', async (req, res) => {
  try {
    const { correlationId } = req.params;

    console.log(`[Events API] Fetching event chain for correlation: ${correlationId}`);

    const events = await EventStore.getEventChain(correlationId);

    const timelineEvents = events.map(event => ({
      id: event.id,
      event_id: event.event_id,
      timestamp: event.timestamp,
      type: event.event_type,
      category: categorizeEvent(event.event_type),
      title: generateEventTitle(event.event_type),
      description: generateEventDescription(event),
      aggregate_type: event.aggregate_type,
      aggregate_id: event.aggregate_id,
      data: event.data,
      metadata: event.metadata,
      source: event.source,
    }));

    res.json({
      success: true,
      count: timelineEvents.length,
      correlationId,
      events: timelineEvents,
    });
  } catch (error) {
    console.error('[Events API] Error fetching event chain:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch event chain',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get recent events across all devices
 * GET /api/v1/events/recent
 * Query params:
 *   - limit: number of events to return (default 100, max 500)
 *   - aggregateType: filter by aggregate type (e.g., 'device', 'app')
 */
router.get('/events/recent', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
    const aggregateType = req.query.aggregateType as string | undefined;

    console.log(`[Events API] Fetching recent events (limit: ${limit})`);

    const events = await EventStore.getRecentEvents(limit, aggregateType);

    const timelineEvents = events.map(event => ({
      id: event.id,
      event_id: event.event_id,
      timestamp: event.timestamp,
      type: event.event_type,
      category: categorizeEvent(event.event_type),
      title: generateEventTitle(event.event_type),
      description: generateEventDescription(event),
      aggregate_type: event.aggregate_type,
      aggregate_id: event.aggregate_id,
      data: event.data,
      metadata: event.metadata,
      source: event.source,
    }));

    res.json({
      success: true,
      count: timelineEvents.length,
      events: timelineEvents,
    });
  } catch (error) {
    console.error('[Events API] Error fetching recent events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent events',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get event statistics
 * GET /api/v1/events/stats
 * Query params:
 *   - daysBack: number of days to look back (default 7)
 */
router.get('/events/stats', async (req, res) => {
  try {
    const daysBack = parseInt(req.query.daysBack as string) || 7;

    console.log(`[Events API] Fetching event stats (${daysBack} days)`);

    const stats = await EventStore.getStats(daysBack);

    res.json({
      success: true,
      daysBack,
      stats,
    });
  } catch (error) {
    console.error('[Events API] Error fetching event stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch event statistics',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Replay events within time window (for debugging)
 * POST /api/v1/events/device/:deviceUuid/replay
 * Body:
 *   - fromTime: ISO timestamp
 *   - toTime: ISO timestamp
 */
router.post('/events/device/:deviceUuid/replay', async (req, res) => {
  try {
    const { deviceUuid } = req.params;
    const { fromTime, toTime } = req.body;

    if (!fromTime || !toTime) {
      return res.status(400).json({
        success: false,
        error: 'fromTime and toTime are required',
      });
    }

    console.log(`[Events API] Replaying events for device ${deviceUuid} from ${fromTime} to ${toTime}`);

    const result = await EventStore.replayEvents(
      deviceUuid,
      new Date(fromTime),
      new Date(toTime)
    );

    res.json({
      success: true,
      deviceUuid,
      fromTime,
      toTime,
      ...result,
    });
  } catch (error) {
    console.error('[Events API] Error replaying events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to replay events',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Create snapshot of device state at specific point in time
 * POST /api/v1/events/device/:deviceUuid/snapshot
 * Body:
 *   - timestamp: ISO timestamp
 */
router.post('/events/device/:deviceUuid/snapshot', async (req, res) => {
  try {
    const { deviceUuid } = req.params;
    const { timestamp } = req.body;

    if (!timestamp) {
      return res.status(400).json({
        success: false,
        error: 'timestamp is required',
      });
    }

    console.log(`[Events API] Creating snapshot for device ${deviceUuid} at ${timestamp}`);

    const snapshot = await EventStore.createSnapshot(
      deviceUuid,
      new Date(timestamp)
    );

    res.json({
      success: true,
      ...snapshot,
    });
  } catch (error) {
    console.error('[Events API] Error creating snapshot:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create snapshot',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Compare device state between two points in time
 * POST /api/v1/events/device/:deviceUuid/compare
 * Body:
 *   - time1: ISO timestamp (earlier time)
 *   - time2: ISO timestamp (later time)
 */
router.post('/events/device/:deviceUuid/compare', async (req, res) => {
  try {
    const { deviceUuid } = req.params;
    const { time1, time2 } = req.body;

    if (!time1 || !time2) {
      return res.status(400).json({
        success: false,
        error: 'time1 and time2 are required',
      });
    }

    console.log(`[Events API] Comparing states for device ${deviceUuid} between ${time1} and ${time2}`);

    const comparison = await EventStore.compareStates(
      deviceUuid,
      new Date(time1),
      new Date(time2)
    );

    res.json({
      success: true,
      deviceUuid,
      time1,
      time2,
      changes_count: comparison.changes.length,
      events_between_count: comparison.events_between.length,
      ...comparison,
    });
  } catch (error) {
    console.error('[Events API] Error comparing states:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compare states',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Categorize event types for display
 */
function categorizeEvent(eventType: string): string {
  if (eventType.startsWith('target_state.')) return 'configuration';
  if (eventType.startsWith('current_state.')) return 'telemetry';
  if (eventType.startsWith('reconciliation.')) return 'system';
  if (eventType.startsWith('container.')) return 'container';
  if (eventType.startsWith('device.')) return 'device';
  if (eventType.startsWith('app.')) return 'application';
  if (eventType.startsWith('job.')) return 'job';
  return 'other';
}

/**
 * Generate human-readable event titles
 */
function generateEventTitle(eventType: string): string {
  const titleMap: { [key: string]: string } = {
    'target_state.updated': 'Target State Updated',
    'current_state.updated': 'Current State Updated',
    'reconciliation.started': 'Reconciliation Started',
    'reconciliation.completed': 'Reconciliation Completed',
    'container.start': 'Container Started',
    'container.stop': 'Container Stopped',
    'container.restart': 'Container Restarted',
    'container.update': 'Container Updated',
    'device.provisioned': 'Device Provisioned',
    'device.online': 'Device Online',
    'device.offline': 'Device Offline',
    'app.deployed': 'Application Deployed',
    'app.removed': 'Application Removed',
    'job.scheduled': 'Job Scheduled',
    'job.started': 'Job Started',
    'job.completed': 'Job Completed',
    'job.failed': 'Job Failed',
  };

  return titleMap[eventType] || eventType.split('.').map(s => 
    s.charAt(0).toUpperCase() + s.slice(1)
  ).join(' ');
}

/**
 * Generate event description from event data
 */
function generateEventDescription(event: any): string {
  const { event_type, data } = event;

  try {
    switch (event_type) {
      case 'target_state.updated':
        const changedFields = data.changed_fields || [];
        return changedFields.length > 0 
          ? `Changed: ${changedFields.join(', ')}`
          : 'Configuration updated';

      case 'reconciliation.completed':
        return data.success 
          ? `${data.actions_count || 0} actions completed in ${data.duration_ms}ms`
          : 'Reconciliation failed';

      case 'container.start':
      case 'container.stop':
      case 'container.restart':
        return data.container_name || data.app_name || 'Container operation';

      case 'current_state.updated':
        return 'Device reported new state';

      case 'device.online':
        return 'Device connected';

      case 'device.offline':
        return 'Device disconnected';

      default:
        // Try to extract meaningful description from data
        if (data.message) return data.message;
        if (data.description) return data.description;
        if (data.status) return data.status;
        return 'Event occurred';
    }
  } catch (error) {
    return 'Event occurred';
  }
}

export default router;
