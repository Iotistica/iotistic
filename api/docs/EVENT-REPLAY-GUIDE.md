# Event Replay for Debugging - Quick Start Guide

## Overview

Event replay allows you to reconstruct device state at any point in time by replaying historical events. This is incredibly useful for debugging issues, investigating failures, and understanding what happened.

## New Features Added

### 1. **Event Replay** - Reconstruct state from event history
### 2. **Point-in-Time Snapshots** - See device state at specific moment
### 3. **State Comparison** - See what changed between two times

---

## API Endpoints

### 1. Replay Events (Debugging Tool)

**Endpoint**: `POST /api/v1/events/device/:deviceUuid/replay`

**Purpose**: Replay all events within a time window to see what happened

**Request Body**:
```json
{
  "fromTime": "2025-11-14T10:00:00Z",
  "toTime": "2025-11-14T11:00:00Z"
}
```

**Response**:
```json
{
  "success": true,
  "deviceUuid": "123e4567-e89b-12d3-a456-426614174000",
  "events_replayed": 47,
  "errors": [],
  "events": [
    {
      "event_id": "evt_abc123",
      "event_type": "job.started",
      "timestamp": "2025-11-14T10:15:30Z",
      "data": { ... }
    }
  ],
  "final_state": {
    "target_state": { ... },
    "current_state": { ... },
    "containers": {
      "nodered": {
        "state": "running",
        "started_at": "2025-11-14T10:05:00Z"
      }
    },
    "jobs": {
      "job_123": {
        "status": "completed",
        "last_updated": "2025-11-14T10:20:00Z"
      }
    },
    "online": true,
    "last_seen": "2025-11-14T10:59:45Z"
  }
}
```

**Example Use Case**: "Why did my device go offline at 3pm?"

```bash
curl -X POST http://localhost:3002/api/v1/events/device/$DEVICE_UUID/replay \
  -H "Content-Type: application/json" \
  -d '{
    "fromTime": "2025-11-14T14:30:00Z",
    "toTime": "2025-11-14T15:30:00Z"
  }'
```

---

### 2. Create Snapshot (Time Machine)

**Endpoint**: `POST /api/v1/events/device/:deviceUuid/snapshot`

**Purpose**: See exact device state at a specific point in history

**Request Body**:
```json
{
  "timestamp": "2025-11-14T14:00:00Z"
}
```

**Response**:
```json
{
  "success": true,
  "timestamp": "2025-11-14T14:00:00Z",
  "device_uuid": "123e4567-e89b-12d3-a456-426614174000",
  "event_count": 142,
  "last_event_id": "evt_xyz789",
  "last_event_type": "current_state.updated",
  "target_state": {
    "1001": {
      "appId": "1001",
      "services": [
        {
          "serviceId": "1",
          "serviceName": "nodered",
          "state": "running"
        }
      ]
    }
  },
  "current_state": { ... }
}
```

**Example Use Case**: "What was my target state configuration at 2pm yesterday?"

```powershell
# PowerShell
$timestamp = (Get-Date).AddDays(-1).AddHours(14).ToString("o")
Invoke-RestMethod -Uri "http://localhost:3002/api/v1/events/device/$DEVICE_UUID/snapshot" `
  -Method POST `
  -ContentType "application/json" `
  -Body (@{ timestamp = $timestamp } | ConvertTo-Json)
```

---

### 3. Compare States (What Changed?)

**Endpoint**: `POST /api/v1/events/device/:deviceUuid/compare`

**Purpose**: See exactly what changed between two points in time

**Request Body**:
```json
{
  "time1": "2025-11-14T10:00:00Z",
  "time2": "2025-11-14T11:00:00Z"
}
```

**Response**:
```json
{
  "success": true,
  "deviceUuid": "123e4567-e89b-12d3-a456-426614174000",
  "changes_count": 3,
  "events_between_count": 15,
  "time1_snapshot": {
    "timestamp": "2025-11-14T10:00:00Z",
    "target_state": { ... },
    "event_count": 127
  },
  "time2_snapshot": {
    "timestamp": "2025-11-14T11:00:00Z",
    "target_state": { ... },
    "event_count": 142
  },
  "changes": [
    {
      "field": "target_state",
      "old_value": { "services": [{ "state": "running" }] },
      "new_value": { "services": [{ "state": "paused" }] },
      "events_involved": [
        "target_state.updated (evt_abc12)",
        "container.paused (evt_def34)"
      ]
    }
  ],
  "events_between": [
    {
      "event_id": "evt_abc123",
      "event_type": "job.started",
      "timestamp": "2025-11-14T10:15:30Z"
    }
  ]
}
```

**Example Use Case**: "What changed in the last hour?"

```bash
curl -X POST http://localhost:3002/api/v1/events/device/$DEVICE_UUID/compare \
  -H "Content-Type: application/json" \
  -d "{
    \"time1\": \"$(date -u -d '1 hour ago' '+%Y-%m-%dT%H:%M:%SZ')\",
    \"time2\": \"$(date -u '+%Y-%m-%dT%H:%M:%SZ')\"
  }"
```

---

## Real-World Debugging Scenarios

### Scenario 1: Job Failed - Find Out Why

```bash
# Get job failure time
JOB_FAILED_AT="2025-11-14T15:32:00Z"

# Replay events 10 minutes before failure
curl -X POST http://localhost:3002/api/v1/events/device/$DEVICE_UUID/replay \
  -H "Content-Type: application/json" \
  -d "{
    \"fromTime\": \"2025-11-14T15:22:00Z\",
    \"toTime\": \"$JOB_FAILED_AT\"
  }" | jq '.'

# Look for:
# - job.started event
# - container.died or container.oom events
# - device.offline event
# - Sequence shows root cause
```

### Scenario 2: Configuration Changed Unexpectedly

```bash
# Compare configuration from yesterday vs now
curl -X POST http://localhost:3002/api/v1/events/device/$DEVICE_UUID/compare \
  -H "Content-Type: application/json" \
  -d "{
    \"time1\": \"2025-11-13T12:00:00Z\",
    \"time2\": \"2025-11-14T12:00:00Z\"
  }" | jq '.changes'

# Shows:
# - Which fields changed
# - Events that caused the changes
# - Who/what triggered them (from metadata)
```

### Scenario 3: Device Was Offline - When Did It Start?

```bash
# Snapshot when device was last known good
curl -X POST http://localhost:3002/api/v1/events/device/$DEVICE_UUID/snapshot \
  -H "Content-Type: application/json" \
  -d '{ "timestamp": "2025-11-14T08:00:00Z" }' | jq '.last_event_type'

# If last event was 'device.online', it was working
# Now compare to current state to find offline event
```

---

## State Reconstruction Logic

Events are replayed in chronological order and applied to state:

### Event Types Tracked

| Event Type | State Change |
|------------|-------------|
| `target_state.updated` | Updates target configuration |
| `current_state.updated` | Updates reported device state |
| `container.started` | Marks container as running |
| `container.stopped` | Marks container as stopped |
| `container.paused` | Marks container as paused |
| `container.unpaused` | Marks container as running |
| `job.queued` → `job.completed` | Tracks job lifecycle |
| `device.online` | Sets device online flag |
| `device.offline` | Sets device offline flag |

### State Structure

```typescript
{
  target_state: {},      // Device configuration
  current_state: {},     // Reported state
  containers: {
    "container_id": {
      state: "running" | "stopped" | "paused",
      started_at: Date,
      stopped_at: Date
    }
  },
  jobs: {
    "job_id": {
      status: "queued" | "started" | "completed" | "failed",
      last_updated: Date
    }
  },
  online: boolean,
  last_seen: Date,
  offline_since: Date
}
```

---

## Testing

Use the provided test script:

```powershell
# Get a device UUID from your database
$DEVICE_UUID = "123e4567-e89b-12d3-a456-426614174000"

# Run tests
.\api\scripts\test-event-replay.ps1 $DEVICE_UUID
```

**Expected Output**:
```
1. Replaying events from last hour...
   Events replayed: 23
   Errors: 0
   Recent events:
     - 2025-11-14T16:45:30Z: job.started
     - 2025-11-14T16:40:15Z: current_state.updated
   Final state summary:
     Online: true
     Container count: 3

2. Creating snapshot from 30 minutes ago...
   Snapshot created successfully
   Events processed: 142

3. Comparing state changes...
   Changes detected: 2
   Events between: 8
```

---

## Performance Notes

- Replay is optimized with indexed time-range queries
- Snapshots are calculated on-demand (no pre-computation)
- For large time windows, consider adding pagination
- Future optimization: Store periodic snapshots to avoid replaying from beginning

---

## Next Steps

### Planned Enhancements (Future)

1. **Incremental Snapshots**: Store snapshots every hour to speed up replay
2. **UI Dashboard**: Visual timeline with scrubber to "play" events
3. **Event Handlers**: Register custom logic during replay
4. **Diff Viewer**: Side-by-side visual diff of state changes

---

## Troubleshooting

### "No events found"
- Check device UUID is correct
- Verify time range overlaps with actual events
- Query recent events: `GET /api/v1/events/device/:uuid?limit=10`

### "Errors in replay"
- Check `errors` array in response
- Events with invalid data are skipped but logged
- State reconstruction continues despite errors

### "Snapshot shows empty state"
- No events exist before the specified timestamp
- Device might have been provisioned after that time
- Try a more recent timestamp

---

## Example Workflow: Investigating Device Offline

```powershell
# 1. Find when device went offline (from logs or events)
$OFFLINE_TIME = "2025-11-14T15:30:00Z"

# 2. Replay events 1 hour before offline
$ONE_HOUR_BEFORE = (Get-Date $OFFLINE_TIME).AddHours(-1).ToString("o")

$replay = Invoke-RestMethod -Uri "http://localhost:3002/api/v1/events/device/$DEVICE_UUID/replay" `
  -Method POST -ContentType "application/json" `
  -Body (@{ fromTime = $ONE_HOUR_BEFORE; toTime = $OFFLINE_TIME } | ConvertTo-Json)

# 3. Look at event sequence
$replay.events | Format-Table timestamp, event_type, data -AutoSize

# 4. Check final state
$replay.final_state | ConvertTo-Json -Depth 5

# 5. Identify root cause from event sequence
# Example sequence:
#   14:45 - job.started (update_firmware)
#   14:50 - container.died (agent crashed)
#   15:30 - device.offline (3 missed heartbeats)
# Root cause: Firmware update crashed agent
```

This tells you exactly what happened and why!
