-- Clear stale needs_deployment flags
-- This resets devices that have needs_deployment=true but shouldn't
-- Run this if sync buttons are incorrectly enabled after fresh installs

-- Check current state before clearing
SELECT 
  COUNT(*) as total_devices,
  COUNT(*) FILTER (WHERE needs_deployment = true) as needs_deployment_count,
  COUNT(*) FILTER (WHERE deployed_by IS NOT NULL) as previously_deployed_count
FROM device_target_state;

-- Option 1: Clear all needs_deployment flags (nuclear option)
-- UPDATE device_target_state SET needs_deployment = false;

-- Option 2: Clear only for devices that were never deployed (safer)
UPDATE device_target_state 
SET needs_deployment = false 
WHERE needs_deployment = true 
  AND deployed_by IS NULL 
  AND last_deployed_at IS NULL;

-- Option 3: Clear for specific device
-- UPDATE device_target_state 
-- SET needs_deployment = false 
-- WHERE device_uuid = 'YOUR-DEVICE-UUID-HERE';

-- Verify results
SELECT 
  device_uuid,
  version,
  needs_deployment,
  deployed_by,
  last_deployed_at,
  updated_at
FROM device_target_state
ORDER BY updated_at DESC
LIMIT 10;
