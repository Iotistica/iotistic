# API Key Rotation Task

**Migrated from**: `api/src/services/rotation-scheduler.ts` (2025-01-15)

## Overview

The API key rotation task runs periodically to:
1. **Rotate** device API keys before they expire (default: 7 days before expiry)
2. **Revoke** old API keys after grace period expires (default: 7 days after rotation)

This task was moved from the API service to the housekeeper service to:
- Centralize all scheduled maintenance tasks
- Reduce API service responsibilities
- Better isolation of background jobs
- Unified task management and monitoring

## Configuration

### Environment Variables

```bash
# Enable/disable rotation (default: enabled)
ENABLE_API_KEY_ROTATION=true

# Enable/disable revocation (default: enabled)
ENABLE_API_KEY_REVOCATION=true

# Cron schedule (default: every hour at minute 0)
ROTATION_CHECK_SCHEDULE='0 * * * *'
```

### Cron Schedule Examples

```bash
# Every hour
ROTATION_CHECK_SCHEDULE='0 * * * *'

# Every 6 hours
ROTATION_CHECK_SCHEDULE='0 */6 * * *'

# Daily at 2 AM
ROTATION_CHECK_SCHEDULE='0 2 * * *'

# Every 30 minutes
ROTATION_CHECK_SCHEDULE='*/30 * * * *'
```

## Database Dependencies

### Views

- **`devices_needing_rotation`**: Devices with API keys expiring within 7 days
  - Defined in: `api/database/migrations/014_add_api_key_rotation.sql`
  - Filters: `is_active = true`, `api_key_rotation_enabled = true`, `expires_at <= NOW() + 7 days`

### Tables

- **`devices`**: Main device table with rotation tracking columns
  - `api_key_expires_at`: When current key expires
  - `api_key_last_rotated_at`: Last rotation timestamp
  - `api_key_rotation_enabled`: Whether auto-rotation is enabled
  - `api_key_rotation_days`: Days before expiry to rotate (default: 90)

- **`device_api_key_history`**: History of all API key rotations
  - `key_hash`: Bcrypt hash of old key
  - `issued_at`: When key was issued
  - `expires_at`: When key expires (NULL during grace period)
  - `revoked_at`: When key was revoked
  - `is_active`: Whether key is still valid (grace period support)

- **`audit_logs`**: Audit trail for rotation events
  - Events: `rotation_failed`, `old_key_revoked`

### Triggers

- **`trigger_archive_device_api_key`**: Automatically archives old API key to history when rotated
  - Defined in: `api/database/migrations/014_add_api_key_rotation.sql`

## How It Works

### Rotation Flow

```
1. Query devices_needing_rotation view
   └─> Finds devices with keys expiring within 7 days

2. For each device:
   └─> Call stored procedure: rotate_device_api_key(uuid)
       ├─> Generate new API key (crypto.randomBytes(32))
       ├─> Hash with bcrypt (10 rounds)
       ├─> Update devices.device_api_key_hash
       ├─> Set new expiry date (90 days from now)
       ├─> Archive old key to device_api_key_history
       └─> Log audit event

3. Log results:
   └─> Info: "Rotation complete: X keys rotated"
```

### Revocation Flow

```
1. Query device_api_key_history
   └─> Find keys with expires_at <= NOW() and is_active = true

2. For each expired key:
   ├─> Set is_active = false
   ├─> Set revoked_at = NOW()
   ├─> Set revoked_reason = 'Grace period expired'
   └─> Log audit event

3. Log results:
   └─> Info: "Revocation complete: X old keys revoked"
```

## Monitoring

### Housekeeper Runs Table

All executions are tracked in `housekeeper_runs`:

```sql
SELECT 
  id,
  task_name,
  status,
  duration_ms,
  started_at,
  completed_at,
  output,
  error
FROM housekeeper_runs
WHERE task_name = 'api-key-rotation'
ORDER BY started_at DESC
LIMIT 10;
```

### Manual Execution

Run the task manually via API:

```bash
curl -X POST http://localhost:3100/api/tasks/api-key-rotation/run
```

### Check Task Status

```bash
curl http://localhost:3100/api/tasks/api-key-rotation
```

## Device Notification

Currently, the rotation task updates the database only. Devices discover the new key when they:
1. Make an API request with the old key (fails with 401)
2. Poll for configuration updates (if implemented)
3. Receive MQTT notification (if MQTT integration is added)

**TODO**: Add MQTT notification to `device/{uuid}/config/api-key-rotation` topic
- Requires MQTT manager integration in housekeeper
- Payload: `{ new_api_key, expires_at, grace_period_ends }`

## Migration Notes

### What Changed

1. **Location**: Moved from `api/src/services/rotation-scheduler.ts` to `housekeeper/src/tasks/api-key-rotation.ts`
2. **Database**: Uses `pool` from housekeeper instead of API's `query()`
3. **Scheduling**: Uses housekeeper's cron scheduler instead of Node.js `setInterval()`
4. **Logging**: Integrated with housekeeper's task execution logging

### What Stayed the Same

1. **Database schema**: All tables, views, triggers unchanged
2. **Logic**: Same rotation/revocation algorithms
3. **Environment variables**: Same names for backwards compatibility

### Removed from API

- `api/src/services/rotation-scheduler.ts` (can be deleted)
- `api/src/services/api-key-rotation.ts` (rotation logic moved to database stored procedure)
- Imports in `api/src/index.ts`:
  - `import { initializeSchedulers, shutdownSchedulers } from './services/rotation-scheduler'`
  - Calls to `initializeSchedulers()` and `shutdownSchedulers()`

## Future Enhancements

1. **MQTT Notifications**: Notify devices immediately when key is rotated
2. **Stored Procedure**: Move rotation logic to PostgreSQL function for better atomicity
3. **Metrics**: Export rotation/revocation counts to Prometheus
4. **Alerts**: Notify admins if rotation fails for multiple devices
5. **Grace Period Config**: Make grace period configurable per-device
6. **Emergency Rotation**: Support manual emergency rotation via API
