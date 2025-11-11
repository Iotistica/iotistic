# Agent Update System

## Overview

The Iotistic agent supports **MQTT-triggered remote updates** for both Docker and Systemd deployments. This allows centralized management of agent versions across your entire device fleet.

## Architecture

```
Cloud API                     MQTT Broker                  Edge Device
┌─────────┐                   ┌──────────┐                ┌───────────┐
│         │  Publish update   │          │   Subscribe    │           │
│ POST    ├──────────────────>│ Mosquitto├───────────────>│  Agent    │
│ /update-│   to MQTT topic   │          │  agent/{uuid}  │  MQTT     │
│ agent   │                   │          │  /update       │  Listener │
│         │                   │          │                │           │
└─────────┘                   └──────────┘                └─────┬─────┘
                                                                │
                                                                │ Execute
                                                                │ update
                                                                ▼
                                                          ┌───────────┐
                                                          │  Update   │
                                                          │  Script   │
                                                          │  (.sh)    │
                                                          └───────────┘
                                                                │
                                                                │
                                                                ▼
                                                          ┌───────────┐
                                                          │  Pull new │
                                                          │  version  │
                                                          │  Restart  │
                                                          └───────────┘
```

## Components

### 1. Update Scripts

**Location:**
- Docker: `/app/bin/update-agent-docker.sh` (inside container)
- Systemd: `/usr/local/bin/update-agent-systemd.sh` (on host)

**Features:**
- ✅ Version validation
- ✅ Automatic rollback on failure
- ✅ Configuration preservation
- ✅ Health check verification
- ✅ Backup management (keeps last 3)

### 2. MQTT Listener (Agent)

**File:** `agent/src/agent.ts`

**Topic:** `agent/{device-uuid}/update`

**Initialization:**
```typescript
await this.initializeMqttUpdateListener();
```

**Subscribes to:** `agent/{uuid}/update`  
**Publishes status to:** `agent/{uuid}/status`

### 3. API Endpoint (Cloud)

**File:** `api/src/routes/devices.ts`

**Endpoint:** `POST /api/v1/devices/:uuid/update-agent`

**Request Body:**
```json
{
  "version": "1.0.6",           // Optional: defaults to "latest"
  "scheduled_time": "2025-11-10T02:00:00Z",  // Optional: schedule for later
  "force": false                // Optional: force update even if same version
}
```

**Response:**
```json
{
  "success": true,
  "message": "Agent update command sent via MQTT",
  "device": {
    "uuid": "abc-123",
    "deviceName": "device-001"
  },
  "update": {
    "version": "1.0.6",
    "scheduled": true,
    "scheduled_time": "2025-11-10T02:00:00Z",
    "force": false,
    "mqttTopic": "agent/abc-123/update"
  }
}
```

## Usage

### Trigger Update from Cloud API

```bash
# Update single device to latest version
curl -X POST https://api.iotistic.ca/v1/devices/abc-123/update-agent \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "version": "latest"
  }'

# Update to specific version
curl -X POST https://api.iotistic.ca/v1/devices/abc-123/update-agent \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.0.6"
  }'

# Schedule update for 2 AM
curl -X POST https://api.iotistic.ca/v1/devices/abc-123/update-agent \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.0.6",
    "scheduled_time": "2025-11-10T02:00:00Z"
  }'

# Force update (even if already on same version)
curl -X POST https://api.iotistic.ca/v1/devices/abc-123/update-agent \
  -H "Content-Type: application/json" \
  -d '{
    "version": "1.0.6",
    "force": true
  }'
```

### Manual MQTT Trigger

```bash
# Publish update command directly to MQTT
mosquitto_pub -h localhost -p 1883 \
  -u admin -P password \
  -t "agent/abc-123/update" \
  -m '{"action":"update","version":"1.0.6","timestamp":1699564800000}' \
  -q 1 -r
```

### Manual Update (SSH into device)

**Docker deployment:**
```bash
# SSH into device
ssh pi@device-ip

# Run update script
docker exec iotistic-agent /app/bin/update-agent-docker.sh 1.0.6

# Or from host
# (script is not accessible from host in Docker deployment)
```

**Systemd deployment:**
```bash
# SSH into device
ssh root@device-ip

# Run update script
/usr/local/bin/update-agent-systemd.sh 1.0.6

# Or using sudo
sudo /usr/local/bin/update-agent-systemd.sh latest
```

## Update Flow

### Docker Deployment

1. **Receive MQTT command** → Parse version
2. **Pull new image** → `docker pull iotistic/agent:1.0.6`
3. **Backup config** → Save to `/tmp/iotistic-agent-backups/`
4. **Stop container** → `docker stop iotistic-agent`
5. **Rename old** → `docker rename iotistic-agent iotistic-agent-backup-{timestamp}`
6. **Start new** → `docker run ... iotistic/agent:1.0.6`
7. **Health check** → Verify container running
8. **Cleanup** → Remove old container, keep last 3 backups

**Rollback (if fails):**
- Remove failed container
- Rename backup → `iotistic-agent`
- Start old container

### Systemd Deployment

1. **Receive MQTT command** → Parse version
2. **Download binary** → GitHub releases
3. **Test binary** → `./iotistic-agent --version`
4. **Stop service** → `systemctl stop iotistic-agent`
5. **Backup binary** → Copy to `/var/lib/iotistic/backups/`
6. **Install new** → Move to `/usr/local/bin/iotistic-agent`
7. **Start service** → `systemctl start iotistic-agent`
8. **Health check** → Verify service active
9. **Cleanup** → Keep last 3 backups

**Rollback (if fails):**
- Stop service
- Restore from backup
- Start service

## MQTT Message Format

### Update Command (Cloud → Device)

**Topic:** `agent/{uuid}/update`

**Message:**
```json
{
  "action": "update",
  "version": "1.0.6",
  "scheduled_time": "2025-11-10T02:00:00Z",  // Optional
  "force": false,                             // Optional
  "timestamp": 1699564800000
}
```

**QoS:** 1 (at least once)  
**Retained:** true (so offline devices receive when they reconnect)

### Status Messages (Device → Cloud)

**Topic:** `agent/{uuid}/status`

**Update Command Received:**
```json
{
  "type": "update_command_received",
  "version": "1.0.6",
  "timestamp": 1699564800000
}
```

**Update Scheduled:**
```json
{
  "type": "update_scheduled",
  "version": "1.0.6",
  "scheduled_time": "2025-11-10T02:00:00Z",
  "timestamp": 1699564800000
}
```

**Update Started:**
```json
{
  "type": "update_started",
  "current_version": "1.0.5",
  "target_version": "1.0.6",
  "deployment_type": "docker",
  "timestamp": 1699564800000
}
```

**Update Failed:**
```json
{
  "type": "update_failed",
  "reason": "script_execution_failed",
  "error": "Failed to pull image",
  "timestamp": 1699564800000
}
```

## Monitoring Updates

### View Agent Logs

**Docker:**
```bash
# Real-time logs
docker logs -f iotistic-agent

# Last 100 lines
docker logs --tail 100 iotistic-agent

# Since specific time
docker logs --since 2025-11-09T10:00:00 iotistic-agent
```

**Systemd:**
```bash
# Real-time logs
journalctl -u iotistic-agent -f

# Last 100 lines
journalctl -u iotistic-agent -n 100

# Since specific time
journalctl -u iotistic-agent --since "2025-11-09 10:00:00"
```

### Check Update Status

**MQTT Subscribe:**
```bash
# Subscribe to all agent status messages
mosquitto_sub -h localhost -p 1883 \
  -u admin -P password \
  -t "agent/+/status" \
  -v
```

**Check Logs:**
```bash
# Docker
docker logs iotistic-agent | grep "update"

# Systemd
journalctl -u iotistic-agent | grep "update"
```

## Batch Updates

### Update All Devices in Fleet

```javascript
// Example: Update all Raspberry Pi 4 devices
const devices = await db.query(`
  SELECT uuid FROM devices 
  WHERE device_type = 'rpi4' 
  AND is_active = true
`);

for (const device of devices) {
  await fetch(`https://api.iotistic.ca/v1/devices/${device.uuid}/update-agent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      version: '1.0.6',
      scheduled_time: '2025-11-10T02:00:00Z' // 2 AM update window
    })
  });
}
```

### Staged Rollout (Canary Deployment)

```javascript
// Phase 1: Update 10% (canary)
const allDevices = await getAllDevices();
const canaryCount = Math.floor(allDevices.length * 0.1);
const canaryDevices = allDevices.slice(0, canaryCount);

for (const device of canaryDevices) {
  await updateAgent(device.uuid, '1.0.6');
}

// Monitor for 24 hours...

// Phase 2: Update 50%
const phase2Count = Math.floor(allDevices.length * 0.5);
const phase2Devices = allDevices.slice(canaryCount, phase2Count);

for (const device of phase2Devices) {
  await updateAgent(device.uuid, '1.0.6');
}

// Monitor for 12 hours...

// Phase 3: Update remaining 40%
const remainingDevices = allDevices.slice(phase2Count);

for (const device of remainingDevices) {
  await updateAgent(device.uuid, '1.0.6');
}
```

## Troubleshooting

### Update Fails to Start

**Check MQTT connection:**
```bash
# Agent logs should show MQTT connection
docker logs iotistic-agent | grep MQTT

# Expected:
# "MQTT update listener initialized"
# "Subscribed to topic: agent/abc-123/update"
```

**Test MQTT manually:**
```bash
# Publish test message
mosquitto_pub -t "agent/abc-123/update" \
  -m '{"action":"update","version":"latest"}' \
  -q 1

# Check if device receives it
docker logs -f iotistic-agent
```

### Update Script Not Found

**Docker:**
```bash
# Check if script exists
docker exec iotistic-agent ls -la /app/bin/

# Should show:
# -rwxr-xr-x 1 root root ... update-agent-docker.sh
```

**Systemd:**
```bash
# Check if script exists
ls -la /usr/local/bin/update-agent-systemd.sh

# Should show:
# -rwxr-xr-x 1 root root ... /usr/local/bin/update-agent-systemd.sh
```

### Rollback After Failed Update

**Docker:**
```bash
# Check for backup containers
docker ps -a | grep iotistic-agent-backup

# Manually restore
docker stop iotistic-agent
docker rm iotistic-agent
docker rename iotistic-agent-backup-20251109-120000 iotistic-agent
docker start iotistic-agent
```

**Systemd:**
```bash
# Check for backups
ls -la /var/lib/iotistic/backups/

# Manually restore
sudo systemctl stop iotistic-agent
sudo cp /var/lib/iotistic/backups/iotistic-agent-1.0.5-20251109-120000 \
  /usr/local/bin/iotistic-agent
sudo chmod +x /usr/local/bin/iotistic-agent
sudo systemctl start iotistic-agent
```

### Version Mismatch

**Check current version:**
```bash
# Docker
docker inspect iotistic-agent --format='{{.Config.Image}}'
# Output: iotistic/agent:1.0.5

# Systemd
iotistic-agent --version
# Output: Iotistic Device Agent v1.0.5
```

**Force update:**
```bash
curl -X POST https://api.iotistic.ca/v1/devices/abc-123/update-agent \
  -H "Content-Type: application/json" \
  -d '{"version": "1.0.6", "force": true}'
```

## Security Considerations

### MQTT ACL

Devices use the standard IoT topic pattern, which is already covered by existing ACLs:

```sql
-- mqtt_acls table (already set during provisioning)
-- Devices get full access to their own namespace
INSERT INTO mqtt_acls (username, topic, rw) VALUES
  ('device-abc-123', 'iot/device/abc-123/#', 3);  -- Read/Write to all subtopics
  
-- Cloud API can publish to all devices
INSERT INTO mqtt_acls (username, topic, rw) VALUES
  ('cloud-api', 'iot/device/+/agent/update', 2);  -- Write only (send commands)
```

**Topics used:**
- **Update Commands** (Cloud → Device): `iot/device/{uuid}/agent/update`
- **Status Reports** (Device → Cloud): `iot/device/{uuid}/agent/status`

This follows the same pattern as jobs (`iot/device/{uuid}/jobs/...`) and sensors (`iot/device/{uuid}/sensor/...`).

### TLS Encryption

Updates transmitted over VPN tunnel (encrypted):
```
Edge Device (10.8.0.12) ←→ OpenVPN ←→ Cloud Mosquitto (10.8.0.1:1883)
                          AES-256-GCM
```

### Signature Verification

Future enhancement: Verify Docker image signatures

```bash
# Docker Content Trust
export DOCKER_CONTENT_TRUST=1
docker pull iotistic/agent:1.0.6
# Automatically verifies signature
```

## Best Practices

### 1. Schedule Updates During Low-Usage Hours

```javascript
// Update all devices at 2 AM local time
const scheduledTime = new Date();
scheduledTime.setHours(2, 0, 0, 0);
scheduledTime.setDate(scheduledTime.getDate() + 1); // Tomorrow

await updateAgent(deviceUuid, '1.0.6', scheduledTime.toISOString());
```

### 2. Test on Staging Devices First

```javascript
// Update staging devices first
const stagingDevices = await db.query(`
  SELECT uuid FROM devices WHERE tags @> '["staging"]'
`);

for (const device of stagingDevices) {
  await updateAgent(device.uuid, '1.0.6');
}

// Wait 24 hours, monitor metrics...

// Then update production
const prodDevices = await db.query(`
  SELECT uuid FROM devices WHERE tags @> '["production"]'
`);
```

### 3. Monitor Update Success Rate

```javascript
// Track update status
const statusUpdates = await db.query(`
  SELECT device_uuid, type, timestamp
  FROM mqtt_messages
  WHERE topic LIKE 'agent/%/status'
  AND timestamp > NOW() - INTERVAL '1 hour'
  ORDER BY timestamp DESC
`);

const successCount = statusUpdates.filter(u => 
  u.type === 'update_started'
).length;

const failureCount = statusUpdates.filter(u => 
  u.type === 'update_failed'
).length;

console.log(`Success rate: ${successCount / (successCount + failureCount) * 100}%`);
```

### 4. Keep Rollback Plan Ready

- Always test updates on non-critical devices first
- Keep previous version images cached on devices
- Maintain backup containers/binaries for quick rollback
- Document known issues with each version

## Related Documentation

- [MQTT Integration](./mqtt/MQTT-INTEGRATION.md)
- [Agent Architecture](./agent/ARCHITECTURE.md)
- [Deployment Guide](./DEPLOYMENT-OPTIONS-GUIDE.md)
- [Integration Testing Strategy](./INTEGRATION-TESTING-STRATEGY.md)

## Changelog

### v1.0.0 (2025-11-09)
- Initial implementation of MQTT-based updates
- Support for Docker and Systemd deployments
- Automatic rollback on failure
- Scheduled updates support
- Batch update capabilities
