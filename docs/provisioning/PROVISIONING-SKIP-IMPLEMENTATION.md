# Provisioning Skip Implementation

## Overview

This document explains the implementation of the provisioning skip feature, which prevents the installation script from re-prompting for provisioning credentials when updating an already-provisioned device.

## Problem

Previously, every time you ran `install.sh` to update the agent code on a device, it would prompt for:
- Provisioning API Key
- Cloud API Endpoint

This was unnecessary for devices that were already provisioned, as provisioning is a **one-time operation**.

## Solution

### 1. Installation Script Changes (`bin/install.sh`)

#### Database Check
The `provisioning_check()` function now:
1. Checks if the agent database exists at `${IOTISTIC_REPO_DIR}/agent/data/database.sqlite`
2. Queries the `device` table for the `provisioned` column
3. If `provisioned = 1`, skips the provisioning prompts

```bash
# Check if device is already provisioned
local DEVICE_PROVISIONED=false
local DB_PATH="${IOTISTIC_REPO_DIR}/agent/data/database.sqlite"

if [ -f "$DB_PATH" ] && command -v sqlite3 &> /dev/null; then
    local PROVISIONED_VALUE=$(sqlite3 "$DB_PATH" "SELECT provisioned FROM device LIMIT 1;" 2>/dev/null || echo "0")
    if [ "$PROVISIONED_VALUE" = "1" ]; then
        DEVICE_PROVISIONED=true
        # Skip provisioning prompts
    fi
fi
```

#### Conditional Prompting
Only prompts for provisioning credentials if:
- Device is NOT already provisioned (`DEVICE_PROVISIONED = false`)
- NOT running in CI mode (`IS_CI_MODE = false`)
- Provisioning API key not set via environment variable

```bash
if [ "$DEVICE_PROVISIONED" = false ] && [ "$IS_CI_MODE" = false ] && [ -z "$PROVISIONING_API_KEY" ]; then
    # Prompt for provisioning credentials
fi
```

#### User Feedback
When a device is already provisioned, the script displays:
```
### ✅ Device Already Provisioned

This device is already provisioned. Skipping provisioning setup.

**Device UUID:** `550e8400-e29b-41d4-a716-446655440000`
**Device Name:** `my-device`
```

### 2. Agent-Side Protection

The agent supervisor (`agent/src/supervisor.ts`) already has built-in protection:

```typescript
// Auto-provision if not yet provisioned, cloud endpoint is set, AND provisioning key is available
const provisioningApiKey = process.env.PROVISIONING_API_KEY;
if (!deviceInfo.provisioned && provisioningApiKey && this.CLOUD_API_ENDPOINT) {
    // Provision device
}
```

This ensures that even if `PROVISIONING_API_KEY` is passed, the agent won't attempt to re-provision.

### 3. Package Dependencies

Added `sqlite3` to the list of installed packages to ensure the database check works:

```bash
local APT_INSTALL_ARGS=(
    "git"
    "libffi-dev"
    "libssl-dev"
    "whois"
    "sqlite3"  # ← Added for provisioning check
)
```

## Usage Scenarios

### First Installation (Device Not Provisioned)
```bash
# Device has no database or provisioned=0
curl -sSL https://raw.githubusercontent.com/Iotistica/iotistic/master/bin/install.sh | bash

# Prompts appear:
# Device Provisioning Setup
# Enter your provisioning API key...
```

### Subsequent Updates (Device Already Provisioned)
```bash
# Device has database with provisioned=1
cd ~/iotistic
git pull
./bin/install.sh

# Output:
# ✅ Device Already Provisioned
# This device is already provisioned. Skipping provisioning setup.
# Device UUID: 550e8400-e29b-41d4-a716-446655440000
# Device Name: my-device
```

### Force Re-Provisioning (Advanced)
If you need to re-provision a device, you can either:

**Option 1: Set environment variable**
```bash
PROVISIONING_API_KEY=your-key CLOUD_API_ENDPOINT=http://your-cloud:4002 ./bin/install.sh
```

**Option 2: Reset the database**
```bash
# Delete the database (CAUTION: This removes device identity)
rm ~/iotistic/agent/data/database.sqlite

# Run installation
./bin/install.sh
```

## Database Schema

The device provisioning status is stored in SQLite:

```sql
CREATE TABLE device (
    uuid TEXT PRIMARY KEY,
    deviceId TEXT,
    deviceName TEXT,
    deviceType TEXT,
    provisioned INTEGER DEFAULT 0,  -- 0 = not provisioned, 1 = provisioned
    deviceApiKey TEXT,
    apiEndpoint TEXT,
    registeredAt INTEGER,
    -- ... other fields
);
```

## Testing

### Test 1: First Install
```bash
# Fresh device
docker run -it --rm -v /tmp/test:/home/pi/iotistic debian:bookworm bash
curl -sSL https://raw.githubusercontent.com/Iotistica/iotistic/master/bin/install.sh | bash

# Expected: Provisioning prompts appear
```

### Test 2: Update After Provisioning
```bash
# After completing Test 1
cd ~/iotistic
./bin/install.sh

# Expected: "Device Already Provisioned" message, no prompts
```

### Test 3: CI Mode
```bash
CI=true PROVISIONING_API_KEY=test-key ./bin/install.sh

# Expected: No prompts, uses environment variable
```

## Error Handling

### sqlite3 Not Installed
If `sqlite3` command is not available, the check is skipped and the script continues normally (may prompt for provisioning).

### Database File Missing
If the database file doesn't exist, the check is skipped (treats as not provisioned).

### Database Query Error
If the query fails, the script defaults to `PROVISIONED_VALUE=0` (treats as not provisioned).

## Benefits

1. **Improved UX**: No repetitive prompts on device updates
2. **Safe**: Won't accidentally re-provision a device
3. **Flexible**: Can still force re-provisioning if needed
4. **CI-Compatible**: Works in both interactive and automated scenarios

## Related Files

- `bin/install.sh` - Installation script with provisioning check
- `agent/src/supervisor.ts` - Agent initialization with provisioning logic
- `agent/src/provisioning/device-manager.ts` - Device provisioning implementation
- `agent/docs/PROVISIONING.md` - Provisioning documentation
- `agent/docs/TWO-PHASE-AUTH.md` - Two-phase authentication details

## Architecture Notes

The provisioning system uses **two-phase authentication**:

1. **Phase 1**: Device registers with `PROVISIONING_API_KEY` (fleet-level, temporary)
2. **Phase 2**: Device exchanges keys and gets `deviceApiKey` (device-specific, permanent)
3. **Phase 3**: `PROVISIONING_API_KEY` is removed (one-time use)

Once Phase 3 is complete, `provisioned=1` is set in the database, and the installation script will skip provisioning prompts.

## Future Enhancements

Potential improvements:
- Add `--force-provision` flag to `install.sh` to override the check
- Add provisioning status to Device API (`GET /api/v1/device`)
- Add admin UI panel to view/reset provisioning status
- Support device re-provisioning workflow (transfer to different fleet)
