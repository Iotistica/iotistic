# Event Sourcing System - Comprehensive Improvements

## Current System Analysis

**Strengths:**
- ✅ Partitioned event store (performance)
- ✅ Event correlation/causation tracking
- ✅ Immutable event log with checksums
- ✅ PostgreSQL NOTIFY for real-time events
- ✅ 40+ predefined event types

**Gaps for Device Event Tracking:**
- ❌ No device lifecycle events (metadata changes, tags, location)
- ❌ Limited device monitoring events (metrics, alerts, health)
- ❌ No device security events (access, updates, compliance)
- ❌ Missing event aggregation/search capabilities
- ❌ No event retention by importance
- ❌ Limited event replay/audit capabilities

---

## Recommended Improvements

### 1. **Expand Device Event Types**

Add missing device lifecycle and operational events:

```typescript
// Device Lifecycle
'device.created'              // Device registered (before provisioning)
'device.metadata_updated'     // Name, tags, location changed
'device.tags_changed'         // Tags added/removed
'device.transferred'          // Device ownership transfer
'device.archived'            // Soft delete
'device.reactivated'         // Restore from archive

// Device Security
'device.credentials_rotated' // API keys/certificates rotated
'device.access_granted'      // User/service granted access
'device.access_revoked'      // Access removed
'device.firmware_updated'    // Agent/firmware version change
'device.security_scan'       // Vulnerability scan result
'device.compliance_check'    // Compliance policy check

// Device Monitoring
'device.metrics_threshold'   // Metric exceeded threshold
'device.alert_triggered'     // Alert fired
'device.alert_resolved'      // Alert cleared
'device.health_degraded'     // Health status downgrade
'device.health_recovered'    // Health status improved
'device.anomaly_detected'    // Anomaly detection triggered
'device.diagnostics_run'     // Diagnostic test executed

// Device Operations
'device.rebooted'            // Device restart
'device.shutdown'            // Graceful shutdown
'device.maintenance_mode'    // Entered maintenance
'device.backup_created'      // State backup created
'device.backup_restored'     // State restored from backup
'device.config_exported'     // Config exported
'device.config_imported'     // Config imported

// Device Jobs
'job.queued'                 // Job added to device queue
'job.started'                // Job execution started
'job.progress'               // Job progress update
'job.completed'              // Job finished successfully
'job.failed'                 // Job failed
'job.cancelled'              // Job cancelled by user
'job.timeout'                // Job exceeded timeout

// Device Connectivity
'device.vpn_connected'       // VPN tunnel established
'device.vpn_disconnected'    // VPN tunnel lost
'device.network_changed'     // IP/network configuration changed
'device.mqtt_connected'      // MQTT connection established
'device.mqtt_disconnected'   // MQTT connection lost
'device.api_call'            // Device API request (sampled)

// Device Sensors/Data
'sensor.configured'          // Sensor added/updated
'sensor.removed'             // Sensor removed
'sensor.calibrated'          // Sensor calibration performed
'sensor.data_anomaly'        // Unexpected sensor data pattern
'data.export_started'        // Data export initiated
'data.export_completed'      // Data export finished
```

### 2. **Event Context Enrichment**

Add structured metadata to every event:

```typescript
interface EventMetadata {
  // Who triggered this event
  actor: {
    type: 'user' | 'device' | 'system' | 'api' | 'scheduled_job';
    id: string;           // user_id, device_uuid, job_id
    name?: string;        // Display name
    ip_address?: string;  // For user/API actions
  };
  
  // Where did this event come from
  source: {
    service: string;      // 'api', 'agent', 'mqtt-monitor', 'billing'
    version: string;      // Service version
    environment: string;  // 'development', 'staging', 'production'
    instance_id?: string; // For distributed systems
  };
  
  // Request context (if applicable)
  request?: {
    id: string;           // Request ID for tracing
    method?: string;      // HTTP method
    path?: string;        // API endpoint
    user_agent?: string;  // Client user agent
  };
  
  // Tenant context (multi-tenancy)
  tenant?: {
    id: string;           // Customer/organization ID
    name: string;         // Customer name
  };
  
  // Impact/severity for monitoring
  severity?: 'debug' | 'info' | 'warning' | 'error' | 'critical';
  impact?: 'low' | 'medium' | 'high';
  
  // For audit requirements
  compliance?: {
    regulation: string[];  // ['GDPR', 'HIPAA', 'SOC2']
    retention_years: number;
    encrypted: boolean;
  };
  
  // Custom tags for filtering
  tags?: Record<string, string>;
}
```

### 3. **Event Search & Aggregation**

Add powerful query capabilities:

```typescript
// New EventStore methods
class EventStore {
  /**
   * Advanced event search with filtering
   */
  static async search(criteria: {
    deviceUuid?: string;
    eventTypes?: string[];
    aggregateTypes?: string[];
    dateFrom?: Date;
    dateTo?: Date;
    severity?: string[];
    actor?: { type: string; id?: string };
    tags?: Record<string, string>;
    correlationId?: string;
    limit?: number;
    offset?: number;
  }): Promise<Event[]>;
  
  /**
   * Get event timeline for device (all events chronologically)
   */
  static async getDeviceTimeline(
    deviceUuid: string,
    options: {
      sinceDate?: Date;
      eventTypes?: string[];
      includeSampled?: boolean;  // Include sampled events
      limit?: number;
    }
  ): Promise<Event[]>;
  
  /**
   * Aggregate events by time period
   */
  static async aggregateByPeriod(
    deviceUuid: string,
    period: 'hour' | 'day' | 'week' | 'month',
    dateFrom: Date,
    dateTo: Date
  ): Promise<Array<{
    period_start: Date;
    event_type: string;
    count: number;
  }>>;
  
  /**
   * Get event summary for device
   */
  static async getDeviceSummary(
    deviceUuid: string,
    daysBack: number = 30
  ): Promise<{
    total_events: number;
    event_type_breakdown: Record<string, number>;
    critical_events: number;
    last_activity: Date;
    health_score: number;  // Calculated from events
  }>;
  
  /**
   * Search events by free text (full-text search)
   */
  static async fullTextSearch(
    query: string,
    deviceUuid?: string,
    limit?: number
  ): Promise<Event[]>;
}
```

### 4. **Event Retention by Importance**

Implement tiered retention based on event importance:

```sql
-- Add importance tier to event_types table
ALTER TABLE event_types ADD COLUMN retention_tier VARCHAR(20) DEFAULT 'standard';
ALTER TABLE event_types ADD COLUMN retention_days INTEGER;

-- Retention tiers
UPDATE event_types SET retention_tier = 'critical', retention_days = 2555 WHERE event_type IN (
  'device.provisioned', 
  'device.deprovisioned',
  'device.firmware_updated',
  'device.security_scan',
  'device.transferred'
); -- 7 years for compliance

UPDATE event_types SET retention_tier = 'important', retention_days = 365 WHERE event_type IN (
  'target_state.updated',
  'device.online',
  'device.offline',
  'job.completed',
  'job.failed'
); -- 1 year

UPDATE event_types SET retention_tier = 'standard', retention_days = 90 WHERE event_type IN (
  'current_state.updated',
  'reconciliation.completed',
  'container.started'
); -- 90 days

UPDATE event_types SET retention_tier = 'debug', retention_days = 7 WHERE event_type IN (
  'device.heartbeat',
  'device.api_call',
  'device.metrics_threshold'
); -- 7 days (sampled anyway)
```

### 5. **Event Stream API**

Add real-time event streaming for dashboards:

```typescript
// New routes
router.get('/api/v1/devices/:uuid/events/stream', jwtAuth, async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  const listener = new EventListener();
  await listener.start();
  
  // Filter events for this device
  listener.on('event', (event) => {
    if (event.aggregate_id === req.params.uuid) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
  });
  
  req.on('close', async () => {
    await listener.stop();
  });
});

// WebSocket alternative (more efficient)
router.ws('/api/v1/devices/:uuid/events/ws', jwtAuth, async (ws, req) => {
  const listener = new EventListener();
  await listener.start();
  
  listener.on('event', (event) => {
    if (event.aggregate_id === req.params.uuid) {
      ws.send(JSON.stringify(event));
    }
  });
  
  ws.on('close', async () => {
    await listener.stop();
  });
});
```

### 6. **Event Replay for Debugging**

Add ability to replay events for troubleshooting:

```typescript
class EventStore {
  /**
   * Replay events within time window (for debugging)
   */
  static async replayEvents(
    deviceUuid: string,
    fromTime: Date,
    toTime: Date,
    handlers: Record<string, (event: Event) => void>
  ): Promise<{
    events_replayed: number;
    final_state: any;
    errors: string[];
  }>;
  
  /**
   * Create snapshot of device state at specific point in time
   */
  static async createSnapshot(
    deviceUuid: string,
    atTime: Date
  ): Promise<{
    timestamp: Date;
    target_state: any;
    current_state: any;
    event_count: number;
  }>;
  
  /**
   * Compare device state between two points in time
   */
  static async compareStates(
    deviceUuid: string,
    time1: Date,
    time2: Date
  ): Promise<{
    time1_snapshot: any;
    time2_snapshot: any;
    changes: Array<{
      field: string;
      old_value: any;
      new_value: any;
      events_involved: string[];
    }>;
  }>;
}
```

### 7. **Event Analytics Dashboard**

Create analytics queries for insights:

```sql
-- Most active devices (by event count)
CREATE OR REPLACE FUNCTION get_most_active_devices(
  p_days_back INTEGER DEFAULT 7,
  p_limit INTEGER DEFAULT 10
) RETURNS TABLE(...) AS $$...$$;

-- Device health trends
CREATE OR REPLACE FUNCTION get_device_health_trends(
  p_device_uuid UUID,
  p_days_back INTEGER DEFAULT 30
) RETURNS TABLE(
  day DATE,
  online_events INTEGER,
  offline_events INTEGER,
  errors INTEGER,
  warnings INTEGER,
  health_score NUMERIC
) AS $$...$$;

-- Event distribution by hour (for capacity planning)
CREATE OR REPLACE FUNCTION get_event_hourly_distribution(
  p_days_back INTEGER DEFAULT 7
) RETURNS TABLE(
  hour_of_day INTEGER,
  avg_events NUMERIC,
  peak_events BIGINT
) AS $$...$$;

-- Correlation between events (what events happen together)
CREATE OR REPLACE FUNCTION get_event_correlations(
  p_event_type VARCHAR,
  p_days_back INTEGER DEFAULT 7
) RETURNS TABLE(
  correlated_event_type VARCHAR,
  correlation_strength NUMERIC,
  avg_time_between_seconds NUMERIC
) AS $$...$$;
```

### 8. **Event Compression & Deduplication**

Reduce storage for repetitive events:

```typescript
// Compress consecutive identical events
interface CompressedEvent extends Event {
  occurrences: number;
  first_timestamp: Date;
  last_timestamp: Date;
  compressed: true;
}

// Example: Instead of 1000 heartbeat events, store 1 compressed event
{
  event_type: 'device.heartbeat',
  occurrences: 1000,
  first_timestamp: '2025-11-14 00:00:00',
  last_timestamp: '2025-11-14 16:40:00',
  compressed: true
}
```

### 9. **Event Export for Compliance**

Add export capabilities for audit/compliance:

```typescript
class EventStore {
  /**
   * Export events to various formats
   */
  static async export(
    criteria: EventSearchCriteria,
    format: 'json' | 'csv' | 'parquet' | 'avro'
  ): Promise<{
    file_url: string;
    event_count: number;
    file_size: number;
  }>;
  
  /**
   * Generate audit report
   */
  static async generateAuditReport(
    deviceUuid: string,
    fromDate: Date,
    toDate: Date
  ): Promise<{
    summary: {
      total_events: number;
      security_events: number;
      state_changes: number;
      failed_operations: number;
    };
    critical_events: Event[];
    timeline: Event[];
    recommendations: string[];
  }>;
}
```

### 10. **Event Validation & Schema**

Enforce event structure with JSON Schema:

```typescript
// Add schema validation to publish_event
const eventSchemas: Record<string, JSONSchema> = {
  'device.provisioned': {
    type: 'object',
    required: ['device_uuid', 'device_name', 'provisioning_method'],
    properties: {
      device_uuid: { type: 'string', format: 'uuid' },
      device_name: { type: 'string', minLength: 1 },
      provisioning_method: { enum: ['api_key', 'oauth', 'certificate'] },
      mac_address: { type: 'string', pattern: '^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$' },
      metadata: { type: 'object' }
    }
  },
  // ... schemas for all event types
};

// Validate before publishing
function validateEventData(eventType: string, data: any): void {
  const schema = eventSchemas[eventType];
  if (!schema) {
    throw new Error(`No schema defined for event type: ${eventType}`);
  }
  
  const valid = ajv.validate(schema, data);
  if (!valid) {
    throw new Error(`Event data validation failed: ${ajv.errorsText()}`);
  }
}
```

---

## Implementation Priority

### Phase 1 (Immediate - Week 1)
1. ✅ Add device lifecycle event types to database
2. ✅ Implement event context enrichment (metadata structure)
3. ✅ Add EventStore.getDeviceTimeline() method
4. ✅ Create basic event search UI in dashboard

### Phase 2 (Short-term - Week 2-3)
1. ✅ Implement tiered retention
2. ✅ Add event aggregation queries
3. ✅ Create event analytics dashboard
4. ✅ Add full-text search

### Phase 3 (Medium-term - Month 2)
1. ✅ Event stream API (SSE/WebSocket)
2. ✅ Event replay functionality
3. ✅ Event compression for high-frequency events
4. ✅ Event export for compliance

### Phase 4 (Long-term - Month 3+)
1. ✅ Event correlation analysis
2. ✅ ML-based anomaly detection on events
3. ✅ Event-driven automation (rules engine)
4. ✅ Multi-region event replication

---

## SQL Migration Template

```sql
-- File: api/database/migrations/007_improve_event_sourcing.sql

BEGIN;

-- 1. Add new device event types
INSERT INTO event_types (event_type, aggregate_type, description, retention_tier, retention_days) VALUES
('device.created', 'device', 'Device registered in system', 'critical', 2555),
('device.metadata_updated', 'device', 'Device metadata changed', 'important', 365),
('device.tags_changed', 'device', 'Device tags modified', 'standard', 90),
-- ... (add all new event types)

-- 2. Add metadata support to events table
ALTER TABLE events ADD COLUMN actor_type VARCHAR(50);
ALTER TABLE events ADD COLUMN actor_id VARCHAR(255);
ALTER TABLE events ADD COLUMN severity VARCHAR(20);
ALTER TABLE events ADD COLUMN impact VARCHAR(20);

CREATE INDEX idx_events_actor ON events(actor_type, actor_id) WHERE actor_type IS NOT NULL;
CREATE INDEX idx_events_severity ON events(severity) WHERE severity IS NOT NULL;

-- 3. Add full-text search
ALTER TABLE events ADD COLUMN search_vector tsvector;

CREATE INDEX idx_events_search ON events USING gin(search_vector);

CREATE OR REPLACE FUNCTION events_search_trigger() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', 
    COALESCE(NEW.event_type, '') || ' ' ||
    COALESCE(NEW.aggregate_type, '') || ' ' ||
    COALESCE(NEW.aggregate_id, '') || ' ' ||
    COALESCE(NEW.data::text, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_search_update
  BEFORE INSERT OR UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION events_search_trigger();

-- 4. Add event timeline view
CREATE OR REPLACE VIEW device_event_timeline AS
SELECT 
  e.event_id,
  e.event_type,
  e.timestamp,
  e.aggregate_id as device_uuid,
  e.data,
  e.metadata,
  e.actor_type,
  e.actor_id,
  e.severity,
  et.description as event_description
FROM events e
LEFT JOIN event_types et ON e.event_type = et.event_type
WHERE e.aggregate_type = 'device'
ORDER BY e.timestamp DESC;

COMMIT;
```

---

## Dashboard UI Components

### Event Timeline Component
```typescript
// Component: DeviceEventTimeline.tsx
<Timeline>
  {events.map(event => (
    <TimelineItem 
      key={event.event_id}
      timestamp={event.timestamp}
      type={event.event_type}
      severity={event.severity}
      icon={getEventIcon(event.event_type)}
    >
      <EventCard event={event} />
    </TimelineItem>
  ))}
</Timeline>
```

### Event Filtering
```typescript
// Filter controls
<EventFilters>
  <DateRangePicker onChange={setDateRange} />
  <EventTypeMultiSelect options={eventTypes} onChange={setSelectedTypes} />
  <SeverityFilter values={['debug', 'info', 'warning', 'error']} />
  <ActorFilter />
  <SearchInput placeholder="Search events..." />
</EventFilters>
```

### Live Event Stream
```typescript
// Real-time event feed
const eventStream = useEventStream(deviceUuid);

<LiveFeed>
  {eventStream.events.map(event => (
    <EventNotification 
      event={event} 
      autoHide={event.severity !== 'error'}
    />
  ))}
</LiveFeed>
```

---

## Testing Strategy

1. **Unit Tests**: Event validation, compression, deduplication
2. **Integration Tests**: Event publishing, queries, projections
3. **Performance Tests**: 10K events/sec sustained, query response < 100ms
4. **Retention Tests**: Verify tiered retention works correctly
5. **Audit Tests**: Compliance event export completeness

---

## Monitoring & Alerts

```typescript
// Metrics to track
- events_published_total (counter by type)
- events_published_failures (counter by type)
- event_publish_duration_ms (histogram)
- event_partition_size_mb (gauge by partition)
- event_query_duration_ms (histogram by query type)
- event_retention_lag_hours (gauge)
- critical_events_unreviewed (gauge)
```

This comprehensive improvement plan transforms your event sourcing from basic state tracking to a full audit, debugging, and analytics platform for all device activity.
