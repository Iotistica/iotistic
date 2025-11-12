# Device CLI - Command-Line Interface

Complete CLI tool for managing device configuration and operations.

## Quick Start

```bash
# Development (TypeScript)
npm run cli -- config set-api https://cloud.example.com

# Production (compiled)
iotctl config set-api https://cloud.example.com
```

## Installation on Device

```bash
# Build the CLI
cd /home/iotistic/agent
npm run build

# Create symlink for easy access
sudo ln -s /home/iotistic/agent/dist/cli/iotctl.js /usr/local/bin/iotctl
sudo chmod +x /home/iotistic/agent/dist/cli/iotctl.js

# Now you can use it system-wide
iotctl help
```

## Commands

### Configuration Management

#### Set Cloud API Endpoint

```bash
iotctl config set-api https://api.iotistic.ca

# With port
iotctl config set-api https://api.iotistic.ca:3002

# Local development
iotctl config set-api http://localhost:3002
```

**Output:**
```
✅ Cloud API endpoint updated to: https://api.iotistic.ca
⚠️  Restart the device agent for changes to take effect:
   sudo systemctl restart device-agent
```

#### Get Current API Endpoint

```bash
iotctl config get-api
```

**Output:**
```
📡 Cloud API Endpoint: https://api.iotistic.ca
```

#### Set Any Configuration Value

```bash
# Set poll interval (60 seconds)
iotctl config set pollInterval 60000

# Set device name
iotctl config set deviceName "Living Room Sensor"

# Set boolean
iotctl config set enableMetrics true

# Set JSON object
iotctl config set customSettings '{"key":"value"}'
```

#### Get Specific Configuration Value

```bash
iotctl config get pollInterval
```

**Output:**
```
pollInterval: 60000
```

#### Show All Configuration

```bash
iotctl config show
```

**Output:**
```json
📋 Device Configuration:

{
  "cloudApiEndpoint": "https://api.iotistic.ca",
  "pollInterval": 60000,
  "reportInterval": 10000,
  "deviceName": "Living Room Sensor"
}

📁 Config file: /app/data/device-config.json
```

#### Reset Configuration

```bash
iotctl config reset
```

### Device Management

#### Check Device Status

```bash
iotctl status
```

**Output:**
```
📊 Device Status:

✅ API Endpoint: https://api.iotistic.ca
✅ Database: 2.45 KB
✅ Config File: /app/data/device-config.json

💡 Tip: Use "iotctl logs --follow" to monitor device activity
```

#### Restart Device Agent

```bash
iotctl restart
```

**Output:**
```
🔄 Restarting device agent...
   sudo systemctl restart device-agent
```

#### View Logs

```bash
iotctl logs
```

**Output:**
```
📜 Device Logs:
   sudo journalctl -u device-agent -f
```

### Help & Version

```bash
# Show help
iotctl help

# Show version
iotctl version
```

## Configuration Priority

The CLI uses a **layered configuration system** with the following priority (highest to lowest):

1. **CLI Config File** (`/app/data/device-config.json`) - Set via CLI commands
2. **Environment Variables** - Set in docker-compose or systemd
3. **Default Values** - Built-in defaults

### Example

```bash
# Set via CLI (highest priority)
iotctl config set-api https://cli.example.com

# Also set via environment variable (lower priority)
export CLOUD_API_ENDPOINT=https://env.example.com

# Result: CLI value wins
iotctl config get-api
# Output: https://cli.example.com
```

## Configuration File Format

Location: `/app/data/device-config.json`

```json
{
  "cloudApiEndpoint": "https://api.iotistic.ca",
  "pollInterval": 60000,
  "reportInterval": 10000,
  "metricsInterval": 300000,
  "deviceName": "Raspberry Pi 4 - Office",
  "enableRemoteAccess": false,
  "logLevel": "info",
  "enableMetrics": true
}
```

## Environment Variables

All configuration can also be set via environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `CLOUD_API_ENDPOINT` | Cloud API URL | - |
| `POLL_INTERVAL` | Target state poll interval (ms) | 60000 |
| `REPORT_INTERVAL` | Current state report interval (ms) | 10000 |
| `METRICS_INTERVAL` | Metrics collection interval (ms) | 300000 |
| `API_TIMEOUT` | API request timeout (ms) | 30000 |
| `DEVICE_NAME` | Device display name | - |
| `DEVICE_TYPE` | Device type (pi3, pi4, x86) | - |
| `LOG_LEVEL` | Log level (debug, info, warn, error) | info |
| `ENABLE_METRICS` | Enable metrics collection | true |
| `ENABLE_AUTO_UPDATE` | Enable automatic updates | false |

## Integration with Device Agent

The device agent automatically loads CLI configuration via `ConfigLoader`:

```typescript
import { getConfigLoader } from './config-loader';

const configLoader = getConfigLoader();
const config = configLoader.getConfig();

console.log('API Endpoint:', config.cloudApiEndpoint);
console.log('Poll Interval:', config.pollInterval);
```

### Watch for Configuration Changes

```typescript
configLoader.watchConfig((newConfig) => {
  console.log('Configuration changed:', newConfig);
  // Reload services with new config
});
```

## Use Cases

### Switching Between Mock and Production API

```bash
# Use mock server for testing
iotctl config set-api https://567cea7e-66b6-4e92-a622-ac53067b271a.mock.pstmn.io

# Switch to production
iotctl config set-api https://cloud.iotistic.ca

# Restart to apply
sudo systemctl restart device-agent
```

### Adjusting Poll Intervals

```bash
# Poll every 30 seconds (more responsive)
iotctl config set pollInterval 30000

# Poll every 5 minutes (less bandwidth)
iotctl config set pollInterval 300000

sudo systemctl restart device-agent
```

### Setting Device Name

```bash
iotctl config set deviceName "Kitchen Sensor #3"
sudo systemctl restart device-agent
```

### Disable Metrics Collection

```bash
iotctl config set enableMetrics false
sudo systemctl restart device-agent
```

## Extending the CLI

### Adding New Commands

Edit `cli/iotctl.ts`:

```typescript
// Add new command handler
function myNewCommand(arg: string): void {
  console.log(`Executing new command with: ${arg}`);
  // Implementation here
}

// Register in main() switch statement
switch (command) {
  case 'mynew':
    myNewCommand(args[1]);
    break;
  // ... other cases
}
```

### Adding New Configuration Options

1. Add to `DeviceConfig` interface in `config-loader.ts`:

```typescript
export interface DeviceConfig {
  // ... existing fields
  myNewOption?: string;
}
```

2. Add environment variable mapping:

```typescript
private loadEnvConfig(): void {
  this.envConfig = {
    // ... existing mappings
    myNewOption: process.env.MY_NEW_OPTION,
  };
}
```

3. Add to defaults:

```typescript
const defaults: DeviceConfig = {
  // ... existing defaults
  myNewOption: 'default-value',
};
```

4. Use in CLI:

```bash
iotctl config set myNewOption "custom-value"
iotctl config get myNewOption
```

## Troubleshooting

### CLI Command Not Found

```bash
# Check if symlink exists
ls -la /usr/local/bin/iotctl

# Recreate symlink
sudo ln -sf /home/iotistic/agent/dist/cli/iotctl.js /usr/local/bin/iotctl
sudo chmod +x /home/iotistic/agent/dist/cli/iotctl.js
```

### Configuration Not Applied

```bash
# Verify config file exists
cat /app/data/device-config.json

# Restart device agent
sudo systemctl restart device-agent

# Check logs for errors
sudo journalctl -u device-agent -n 50
```

### Permission Denied

```bash
# CLI needs read/write access to /app/data
sudo chown -R iotistic:iotistic /app/data
sudo chmod 755 /app/data
```

## Best Practices

1. **Always restart after config changes**: Use `sudo systemctl restart device-agent`
2. **Use `config show` before changes**: Review current config before modifying
3. **Validate URLs**: CLI validates API endpoints, but double-check format
4. **Test in development first**: Use mock server before production API
5. **Backup config**: Copy `/app/data/device-config.json` before major changes

## Future Enhancements

Planned features for future versions:

- [ ] `iotctl provision <uuid>` - Provision device with UUID
- [ ] `iotctl deprovision` - Remove device provisioning
- [ ] `iotctl logs --follow` - Actually follow logs (not just show command)
- [ ] `iotctl restart --force` - Actually restart service with sudo
- [ ] `iotctl update` - Trigger device agent update
- [ ] `iotctl network` - Network diagnostics
- [ ] `iotctl apps` - List running applications
- [ ] `iotctl apps restart <app>` - Restart specific app
- [ ] `iotctl backup` - Backup device configuration
- [ ] `iotctl restore <backup>` - Restore from backup
- [ ] Interactive mode: `iotctl interactive`
- [ ] Tab completion for bash/zsh

## Examples

### Complete Workflow: Switch to Production

```bash
# 1. Check current status
iotctl status

# 2. Show current config
iotctl config show

# 3. Set production API
iotctl config set-api https://cloud.iotistic.ca

# 4. Adjust intervals for production
iotctl config set pollInterval 60000
iotctl config set reportInterval 10000

# 5. Verify changes
iotctl config show

# 6. Restart agent
sudo systemctl restart device-agent

# 7. Monitor logs
sudo journalctl -u device-agent -f
```

### Quick Development Setup

```bash
# Use mock server
iotctl config set-api https://567cea7e-66b6-4e92-a622-ac53067b271a.mock.pstmn.io

# Fast polling for testing
iotctl config set pollInterval 10000

# Enable debug logging
iotctl config set logLevel debug

# Restart and test
sudo systemctl restart device-agent
```

---

**Status**: ✅ Fully implemented and ready for use!

**Location**: `agent/cli/iotctl.ts`  
**Config Loader**: `agent/src/config-loader.ts`
