# Agent Update Status Tracking - Implementation Guide

## Problem Statement

**Question**: Where are agent update statuses recorded in the database? How does the API handle this?

**Answer**: Currently, agent update statuses are **NOT recorded in the database**. The system only:
- ✅ Tracks current `agent_version` in `devices` table
- ✅ Sends MQTT update commands to devices
- ✅ Publishes status messages from devices via MQTT
- ❌ Does NOT subscribe to status updates
- ❌ Does NOT persist update history
- ❌ Does NOT track update progress/failures

---

## Current Implementation

### 1. Database Schema (Existing)

```sql
-- devices table (only stores current version)
CREATE TABLE devices (
    uuid UUID PRIMARY KEY,
    agent_version VARCHAR(100),  -- Current agent version
    -- ... other fields
);
```

### 2. API Update Trigger (Existing)

```typescript
// POST /api/v1/devices/:uuid/update-agent
// Publishes MQTT command but doesn't track status
const updateTopic = `iot/device/${uuid}/agent/update`;
mqtt.publish(updateTopic, JSON.stringify({
  action: 'update',
  version: '1.0.6',
  scheduled_time: '2025-01-16T02:00:00Z',
  force: false
}));
```

### 3. Device Status Publishing (Existing - from agent/src/updater.ts)

```typescript
// Device publishes to: iot/device/{uuid}/agent/status
// But API doesn't listen to these messages!

await mqttManager.publish(statusTopic, JSON.stringify({
  type: 'update_command_received',
  version: '1.0.6',
  timestamp: Date.now()
}));

await mqttManager.publish(statusTopic, JSON.stringify({
  type: 'update_started',
  current_version: '1.0.5',
  target_version: '1.0.6',
  deployment_type: 'docker',
  timestamp: Date.now()
}));

await mqttManager.publish(statusTopic, JSON.stringify({
  type: 'update_failed',
  reason: 'script_execution_failed',
  error: 'Update script not found',
  timestamp: Date.now()
}));
```

---

## Proposed Solution

### Architecture Overview

```
┌─────────────┐                    ┌──────────────┐
│   Dashboard │ POST /update-agent │      API     │
│   (Admin)   │───────────────────>│              │
└─────────────┘                    │  1. Create   │
                                   │     record   │
                                   │  2. Publish  │
                                   │     MQTT     │
                                   └──────┬───────┘
                                          │
                                          │ MQTT: iot/device/{uuid}/agent/update
                                          ▼
┌─────────────────────────────────────────────────────────┐
│                    MQTT Broker                          │
│  (mosquitto with PostgreSQL ACLs)                       │
└──────────────┬──────────────────────────────────┬───────┘
               │                                  │
               │ Subscribe                        │ Publish
               │ (update commands)                │ (status updates)
               ▼                                  │
        ┌─────────────┐                          │
        │   Device    │                          │
        │  (Agent)    │──────────────────────────┘
        │             │   iot/device/{uuid}/agent/status
        │  updater.ts │   { type: 'update_started', ... }
        └─────────────┘
                                                  │
                                                  │ Subscribe
                                                  ▼
                                          ┌───────────────┐
                                          │      API      │
                                          │               │
                                          │ AgentUpdate   │
                                          │   Tracker     │
                                          │               │
                                          │ 3. Update     │
                                          │    status in  │
                                          │    database   │
                                          └───────────────┘
                                                  │
                                                  ▼
                                          ┌───────────────┐
                                          │   Database    │
                                          │               │
                                          │ agent_updates │
                                          │    table      │
                                          └───────────────┘
```

### 1. Database Migration (NEW)

File: `api/database/migrations/056_add_agent_update_tracking.sql`

```sql
CREATE TABLE agent_updates (
    id BIGSERIAL PRIMARY KEY,
    device_uuid UUID NOT NULL REFERENCES devices(uuid),
    
    -- Update details
    target_version VARCHAR(100) NOT NULL,
    current_version VARCHAR(100),
    deployment_type VARCHAR(50),
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending',
    -- pending → acknowledged → in_progress → succeeded/failed/timeout
    
    -- Timing
    scheduled_time TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    
    -- Configuration
    force BOOLEAN DEFAULT FALSE,
    
    -- Results
    exit_code INTEGER,
    error_message TEXT,
    update_log TEXT,
    
    -- Metadata
    triggered_by VARCHAR(100),
    correlation_id UUID,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

**Status Flow**:
```
pending → acknowledged → scheduled → in_progress → succeeded
                                                 → failed
                                                 → timeout
                                                 → cancelled
```

### 2. MQTT Status Listener (NEW)

File: `api/src/services/agent-update-tracker.ts`

```typescript
export class AgentUpdateTracker {
  async initialize() {
    // Subscribe to: iot/device/+/agent/status
    await mqttManager.subscribe('iot/device/+/agent/status', 
      this.handleStatusUpdate.bind(this)
    );
  }

  private async handleStatusUpdate(deviceUuid: string, message: Buffer) {
    const status = JSON.parse(message.toString());
    
    // Find pending update record
    const update = await db.query(
      'SELECT id FROM agent_updates WHERE device_uuid = $1 AND status IN ($2, $3)',
      [deviceUuid, 'pending', 'in_progress']
    );
    
    // Update status based on message type
    switch (status.type) {
      case 'update_command_received':
        await this.updateStatus(update.id, 'acknowledged');
        break;
        
      case 'update_started':
        await this.updateStatus(update.id, 'in_progress', {
          started_at: new Date(),
          deployment_type: status.deployment_type
        });
        break;
        
      case 'update_succeeded':
        await this.updateStatus(update.id, 'succeeded', {
          completed_at: new Date()
        });
        // Update devices.agent_version
        await db.query(
          'UPDATE devices SET agent_version = $1 WHERE uuid = $2',
          [status.target_version, deviceUuid]
        );
        break;
        
      case 'update_failed':
        await this.updateStatus(update.id, 'failed', {
          completed_at: new Date(),
          error_message: status.error
        });
        break;
    }
  }
}
```

### 3. Updated API Endpoint (MODIFIED)

File: `api/src/routes/devices.ts`

```typescript
router.post('/devices/:uuid/update-agent', async (req, res) => {
  const { uuid } = req.params;
  const { version, scheduled_time, force } = req.body;
  
  const device = await DeviceModel.getByUuid(uuid);
  if (!device) {
    return res.status(404).json({ error: 'Device not found' });
  }

  // 1. CREATE DATABASE RECORD (NEW!)
  const updateId = await AgentUpdateTracker.createUpdate(uuid, version, {
    currentVersion: device.agent_version,
    scheduledTime: scheduled_time ? new Date(scheduled_time) : undefined,
    force,
    triggeredBy: 'api',
    correlationId: uuidv4()
  });

  // 2. PUBLISH MQTT COMMAND (existing)
  const updateTopic = `iot/device/${uuid}/agent/update`;
  await mqttClient.publish(updateTopic, JSON.stringify({
    action: 'update',
    version,
    scheduled_time,
    force
  }), { qos: 1, retain: true });

  // 3. RETURN RESPONSE WITH UPDATE ID
  res.json({
    success: true,
    message: 'Agent update triggered',
    updateId,  // NEW! Track this update
    device: { uuid, deviceName: device.device_name },
    update: {
      version,
      scheduled: !!scheduled_time,
      status: 'pending'  // Initial status
    }
  });
});
```

### 4. New API Endpoints (RECOMMENDED)

```typescript
// Get update status
GET /api/v1/devices/:uuid/agent-updates/:updateId
Response:
{
  "id": 123,
  "deviceUuid": "abc-123",
  "targetVersion": "1.0.6",
  "currentVersion": "1.0.5",
  "status": "in_progress",
  "startedAt": "2025-01-15T10:30:00Z",
  "progress": 45,
  "deploymentType": "docker"
}

// Get update history
GET /api/v1/devices/:uuid/agent-updates
Response:
{
  "updates": [
    {
      "id": 123,
      "targetVersion": "1.0.6",
      "status": "succeeded",
      "startedAt": "2025-01-15T10:30:00Z",
      "completedAt": "2025-01-15T10:35:00Z",
      "duration": 300
    },
    {
      "id": 122,
      "targetVersion": "1.0.5",
      "status": "failed",
      "errorMessage": "Update script not found"
    }
  ]
}

// Get all pending updates (admin)
GET /api/v1/admin/agent-updates/pending
Response:
{
  "pendingUpdates": [
    {
      "deviceUuid": "abc-123",
      "targetVersion": "1.0.6",
      "status": "in_progress",
      "minutesElapsed": 15
    }
  ]
}

// Cancel update
POST /api/v1/devices/:uuid/agent-updates/:updateId/cancel
```

---

## Implementation Steps

### Phase 1: Database (Foundation)

```bash
# 1. Run migration
psql -U postgres -d iotistic -f api/database/migrations/056_add_agent_update_tracking.sql

# 2. Verify tables created
psql -U postgres -d iotistic -c "\d agent_updates"
```

### Phase 2: API Service (MQTT Listener)

```bash
# 1. Create agent-update-tracker.ts (already done above)
# 2. Fix imports to match your project structure
# 3. Initialize in app.ts/server.ts:

import { AgentUpdateTracker } from './services/agent-update-tracker.js';

const updateTracker = new AgentUpdateTracker();
await updateTracker.initialize();
```

### Phase 3: Update Existing Endpoint

```typescript
// In api/src/routes/devices.ts
import { AgentUpdateTracker } from '../services/agent-update-tracker.js';

router.post('/devices/:uuid/update-agent', async (req, res) => {
  // ... existing validation ...
  
  // ADD THIS: Create database record before sending MQTT
  const updateId = await AgentUpdateTracker.createUpdate(
    uuid,
    version || 'latest',
    {
      currentVersion: device.agent_version,
      scheduledTime: scheduled_time ? new Date(scheduled_time) : undefined,
      force: force || false,
      triggeredBy: 'api'
    }
  );
  
  // ... existing MQTT publish ...
  
  // ADD updateId to response
  res.json({
    success: true,
    updateId,  // NEW!
    // ... rest of response ...
  });
});
```

### Phase 4: Add Query Endpoints (Optional)

```typescript
// Get update status
router.get('/devices/:uuid/agent-updates/:updateId', async (req, res) => {
  const { uuid, updateId } = req.params;
  
  const result = await db.query(
    'SELECT * FROM agent_updates WHERE device_uuid = $1 AND id = $2',
    [uuid, updateId]
  );
  
  if (result.rows.length === 0) {
    return res.status(404).json({ error: 'Update not found' });
  }
  
  res.json(result.rows[0]);
});

// Get update history
router.get('/devices/:uuid/agent-updates', async (req, res) => {
  const { uuid } = req.params;
  const limit = parseInt(req.query.limit as string) || 10;
  
  const updates = await AgentUpdateTracker.getDeviceUpdateHistory(uuid, limit);
  res.json({ updates });
});
```

---

## Testing

### 1. Test Update Trigger

```bash
# Trigger update
curl -X POST http://localhost:3002/api/v1/devices/abc-123/update-agent \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.0.6",
    "scheduled_time": "2025-01-16T02:00:00Z",
    "force": false
  }'

# Response:
{
  "success": true,
  "updateId": 123,
  "device": { "uuid": "abc-123" },
  "update": {
    "version": "1.0.6",
    "status": "pending"
  }
}
```

### 2. Verify Database Record

```sql
SELECT * FROM agent_updates WHERE id = 123;

-- Should show:
-- id: 123
-- device_uuid: abc-123
-- target_version: 1.0.6
-- status: pending
-- created_at: 2025-01-15 10:00:00
```

### 3. Monitor MQTT Messages

```bash
# Subscribe to status updates
mosquitto_sub -h localhost -p 1883 \
  -u admin -P admin \
  -t 'iot/device/+/agent/status' -v

# Should see messages like:
# iot/device/abc-123/agent/status {"type":"update_command_received","version":"1.0.6"}
# iot/device/abc-123/agent/status {"type":"update_started","deployment_type":"docker"}
# iot/device/abc-123/agent/status {"type":"update_succeeded"}
```

### 4. Check Status Updated

```sql
-- After device completes update
SELECT status, started_at, completed_at 
FROM agent_updates 
WHERE id = 123;

-- Should show:
-- status: succeeded
-- started_at: 2025-01-15 10:00:05
-- completed_at: 2025-01-15 10:05:30
```

### 5. Verify Device Version Updated

```sql
SELECT uuid, agent_version 
FROM devices 
WHERE uuid = 'abc-123';

-- Should show:
-- agent_version: 1.0.6 (updated from 1.0.5)
```

---

## Monitoring & Alerting

### Query Pending Updates

```sql
-- Find stale updates (>30 minutes old)
SELECT * FROM get_pending_updates(30);
```

### Update Statistics

```sql
-- Get success rate by day
SELECT * FROM agent_update_stats 
WHERE date > NOW() - INTERVAL '7 days'
ORDER BY date DESC;
```

### Webhook Integration

```typescript
// In agent-update-tracker.ts
if (status.type === 'update_failed') {
  // Send webhook notification
  await webhookService.send('agent_update_failed', {
    deviceUuid,
    targetVersion,
    error: status.error
  });
}
```

---

## Benefits

1. **Full Audit Trail**: Track every update attempt with timestamps
2. **Status Visibility**: Dashboard can show real-time update progress
3. **Failure Analysis**: Error messages and logs stored for troubleshooting
4. **Automated Monitoring**: Timeout detection finds stuck updates
5. **Rollback Support**: Historical versions enable rollback decisions
6. **Compliance**: Audit trail for regulatory requirements
7. **Analytics**: Success rates, durations, common failures

---

## Future Enhancements

1. **Rollback Support**: Automatic rollback on failure
2. **Batch Updates**: Update multiple devices in waves
3. **A/B Testing**: Deploy new version to subset of devices
4. **Pre-flight Checks**: Validate device before updating
5. **Update Approvals**: Require admin approval for updates
6. **Progress Tracking**: Percentage complete during download/install
7. **Notifications**: Email/SMS when updates fail
8. **Grafana Dashboard**: Visualize update metrics
