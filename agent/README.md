# Iotistic Agent

Edge device agent for the Iotistic IoT platform. Provides container orchestration, cloud synchronization, device provisioning, and real-time monitoring for IoT devices running on Raspberry Pi, x86_64, and other edge hardware.

## 🎯 Quick Start

### CLI Tool - iotctl

The agent includes a powerful CLI tool for device management:

```bash
# Inside the Docker container

# Provisioning commands
iotctl provision <key>            # Provision with cloud (--api, --name, --type options)
iotctl provision status           # Check provisioning state
iotctl deprovision                # Remove cloud registration (keeps UUID/deviceApiKey)
iotctl factory-reset              # WARNING: Complete wipe! Deletes everything

# Configuration commands
iotctl config show                # Show all configuration
iotctl config set-api <url>       # Update cloud API endpoint
iotctl config get-api             # Show current API endpoint
iotctl config set <key> <value>   # Set any config value
iotctl config get <key>           # Get specific config value
iotctl config reset               # Reset to defaults

# Device management
iotctl status                     # Device health and status
iotctl diagnostics                # Run full system diagnostics (API, DB, MQTT, cloud)
iotctl diag                       # Short alias for diagnostics
iotctl restart                    # Restart the agent
iotctl logs --follow              # View agent logs (use from host: docker logs -f agent-1)
iotctl logs -n 50                 # Show last 50 log lines

# Application-level commands (manage entire stacks)
iotctl apps list                  # List all apps and services
iotctl apps start 1001            # Start all services in app
iotctl apps stop 1001             # Stop all services in app
iotctl apps restart 1001          # Restart entire app stack
iotctl apps info 1001             # Show app details
iotctl apps purge 1001            # Remove app + volumes

# Service-level commands (manage individual containers)
iotctl services list              # List all services/containers
iotctl services list 1001         # Services in specific app
iotctl services start web-1       # Start one container
iotctl services stop api-2        # Stop one container
iotctl services restart db-1      # Restart one container
iotctl services logs web-1 -f     # Follow container logs
iotctl services info web-1        # Detailed service info

# System
iotctl help                       # Show all commands
iotctl version                    # Show CLI version
```

**Key Features:**
- ✅ REST client to Device API (port 48484 by default)
- ✅ Structured logging (no emojis, JSON context)
- ✅ Provisioning with two-phase authentication
- ✅ Factory reset support
- ✅ No config files - all data from Device API/database
- ✅ **Dual-level control**: Apps (stacks) + Services (containers)

**Architecture:**
- **App** = Collection of one or more services (like docker-compose stack)
- **Service** = Individual Docker container
- **Apps commands** = Manage entire stacks (all containers in app)
- **Services commands** = Manage individual containers

**Example Workflow:**
```bash
# Check device status
docker exec agent-1 iotctl status
# [INFO] Agent running {"uuid":"1dc6ce29-be81-49ee-aad7-b2d317a96fbb"}
# [INFO] Applications {"configured":0,"runningServices":0}

# List all apps and their services
docker exec agent-1 iotctl apps list

# List individual services
docker exec agent-1 iotctl services list

# Start entire app stack
docker exec agent-1 iotctl apps start 1001

# Restart just one service in the stack
docker exec agent-1 iotctl services restart myapp-web-1

# Follow logs from specific service
docker exec agent-1 iotctl services logs myapp-api-2 -f
```

### Anomaly Detection

Real-time anomaly detection monitors device metrics using multiple algorithms:

**Monitored Metrics:**
- CPU usage, temperature, memory usage
- Storage usage, network latency
- Custom sensor data (needs to be configured)

**Detection Methods:**
1. **Z-Score** - Statistical deviation from baseline
2. **MAD (Median Absolute Deviation)** - Robust outlier detection
3. **IQR (Interquartile Range)** - Quartile-based outliers
4. **Rate of Change** - Sudden spikes/drops
5. **ML Predictions** - LSTM-based forecasting

**Configuration:**
```typescript
// Environment variable
ANOMALY_DETECTION_ENABLED=true

// Automatic cloud reporting
CloudSync.getSummaryForReport(10);  // Last 10 anomalies every 60s
```

**Example Output:**
```json
{
  "metric": "memory_percent",
  "value": 150,
  "method": "rate_change",
  "severity": "critical",
  "confidence": 1,
  "deviation": 16.97
}
```

### Simulation Mode

Unified testing framework for realistic sensor data and anomaly injection:

**Configuration:**
```bash
# docker-compose.yml
SIMULATION_MODE=true
SIMULATION_CONFIG='{"scenarios":{"anomaly_injection":{"enabled":true,"metrics":["cpu_temp","memory_percent"],"pattern":"spike","intervalMs":30000,"magnitude":3},"sensor_data":{"enabled":true,"pattern":"realistic","publishIntervalMs":10000}}}'
```

**Features:**
- 📊 **Realistic sensor data** - BME688-style temperature, humidity, pressure, gas readings
- 🔥 **Anomaly injection** - Configurable spikes, drops, or drift patterns
- 🎭 **Multiple patterns** - Random, sine wave, realistic variations
- ⏱️ **Configurable intervals** - Control data generation frequency
- 🎯 **Metric targeting** - Inject anomalies into specific metrics

**Patterns:**
- `spike` - Sudden short-lived increases
- `drop` - Sudden short-lived decreases  
- `drift` - Gradual trending changes
- `random` - Chaotic variations
- `sine` - Cyclical patterns

**Use Cases:**
- Testing anomaly detection algorithms
- Stress testing cloud sync
- UI/dashboard development without hardware
- CI/CD integration testing

## 🔐 MQTTS/TLS Setup

Secure MQTT communication with TLS encryption using self-signed or commercial certificates.

### Overview

The agent supports MQTTS (MQTT over TLS) with automatic certificate handling during provisioning. When a device is provisioned, it receives:
- Broker URL (`mqtts://mosquitto:8883`)
- MQTT credentials (username/password)
- **Broker configuration** including CA certificate for TLS verification

### Architecture Flow

```
1. API Database (PostgreSQL)
   └── system_config table
       └── mqtt.brokers.1 (JSONB)
           └── Contains: host, port, protocol, caCert, useTls, verifyCertificate

2. Provisioning (API → Agent)
   └── POST /api/provisioning/v2/register
       └── Response includes mqtt.brokerConfig with CA certificate

3. Agent Storage (SQLite)
   └── device table
       └── mqttBrokerConfig column (JSON string)
           └── Stores: protocol, host, port, useTls, caCert, verifyCertificate

4. Agent MQTT Connection
   └── agent.ts: initializeMqttManager()
       └── Reads mqttBrokerConfig from database
       └── Applies TLS options: { ca: caCert, rejectUnauthorized: verifyCertificate }
```

### Setup Steps

#### 1. Generate CA Certificate (Self-Signed)

```bash
# Create certs directory
mkdir -p certs

# Generate CA private key and certificate
openssl req -new -x509 -days 365 -extensions v3_ca \
  -keyout certs/ca.key -out certs/ca.crt \
  -subj "/CN=Iotistic CA"

# Generate server certificate signed by CA
openssl genrsa -out certs/server.key 2048
openssl req -new -out certs/server.csr -key certs/server.key \
  -subj "/CN=mosquitto"
openssl x509 -req -in certs/server.csr -CA certs/ca.crt \
  -CAkey certs/ca.key -CAcreateserial -out certs/server.crt \
  -days 365
```

#### 2. Configure Mosquitto Broker

```conf
# mosquitto/mosquitto.conf

# Standard MQTT (port 1883)
listener 1883
protocol mqtt
allow_anonymous false

# MQTTS with TLS (port 8883)
listener 8883
protocol mqtt
cafile /mosquitto/certs/ca.crt
certfile /mosquitto/certs/server.crt
keyfile /mosquitto/certs/server.key
require_certificate false
use_identity_as_username false
allow_anonymous false

# Authentication backend (PostgreSQL)
auth_plugin /mosquitto/go-auth.so
auth_opt_backends postgres
auth_opt_pg_host postgres
auth_opt_pg_port 5432
auth_opt_pg_dbname iotistic
auth_opt_pg_user postgres
auth_opt_pg_password password
auth_opt_pg_userquery SELECT password_hash FROM mqtt_users WHERE username = $1 AND enabled = TRUE LIMIT 1
auth_opt_pg_aclquery SELECT 1 FROM mqtt_acls WHERE username = $1 AND topic = $2 AND rw >= $3 LIMIT 1
```

#### 3. Store CA Certificate in API Database

```sql
-- Run migration 057 or manually insert
UPDATE system_config
SET value = jsonb_set(
  value,
  '{caCert}',
  to_jsonb('-----BEGIN CERTIFICATE-----
...your CA certificate content...
-----END CERTIFICATE-----'::text)
)
WHERE key = 'mqtt.brokers.1';
```

Or use the migration:
```bash
cd api
npx knex migrate:latest  # Runs 057_add_mqtt_ca_certificate.sql
```

#### 4. Verify API Sends CA Certificate

Check `api/src/utils/mqtt-broker-config.ts`:
```typescript
export function formatBrokerConfigForClient(config: any) {
  return {
    protocol: config.protocol,
    host: config.host,
    port: config.port,
    useTls: config.useTls ?? config.use_tls,
    verifyCertificate: config.verifyCertificate ?? config.verify_certificate,
    // CA certificate included for TLS
    ...(config.caCert && { caCert: config.caCert }),
    // Other fields...
  };
}
```

#### 5. Agent Applies TLS Options

Check `agent/src/agent.ts`:
```typescript
// Build MQTT connection options
const mqttOptions: any = {
  clientId: `device_${this.deviceInfo.uuid}`,
  username: mqttUsername,
  password: mqttPassword,
};

// Add TLS options if broker config specifies TLS
if (this.deviceInfo.mqttBrokerConfig?.useTls && 
    this.deviceInfo.mqttBrokerConfig.caCert) {
  mqttOptions.ca = this.deviceInfo.mqttBrokerConfig.caCert; // String (PEM format)
  mqttOptions.rejectUnauthorized = this.deviceInfo.mqttBrokerConfig.verifyCertificate;
}

await mqttManager.connect(mqttBrokerUrl, mqttOptions);
```

### Provisioning with MQTTS

#### New Device Provisioning

```bash
# Start agent with provisioning key
docker run -e PROVISIONING_API_KEY=your-key \
  -e CLOUD_API_ENDPOINT=http://api:3002 \
  iotistic/agent:latest

# Agent auto-provisions and receives:
# - mqtt.brokerConfig.protocol = "mqtts"
# - mqtt.brokerConfig.host = "mosquitto"
# - mqtt.brokerConfig.port = 8883
# - mqtt.brokerConfig.caCert = "-----BEGIN CERTIFICATE-----\n..."
# - mqtt.brokerConfig.useTls = true
# - mqtt.brokerConfig.verifyCertificate = true
```

#### Re-Provisioning Existing Devices

If you added MQTTS **after** devices were already provisioned:

```bash
# Option 1: Delete device database (forces re-provisioning)
docker exec agent-1 rm /app/data/device.sqlite
docker restart agent-1

# Option 2: Manual database update (advanced)
docker exec agent-1 sqlite3 /app/data/device.sqlite
# UPDATE device SET mqttBrokerConfig = '{"protocol":"mqtts",...}';
```

### Verification

#### Check Agent Logs

```bash
docker logs agent-1 | grep -i "mqtt\|tls"

# Expected output:
# MQTT TLS enabled {"protocol":"mqtts","verifyCertificate":true,"hasCaCert":true}
# MQTT Manager connected {"brokerUrl":"mqtts://mosquitto:8883"}
```

#### Check Agent Database

```bash
# Create check script
cat > check-mqtt-config.js << 'EOF'
const Database = require('better-sqlite3');
const db = new Database('/app/data/device.sqlite');
const row = db.prepare('SELECT mqttBrokerConfig FROM device LIMIT 1').get();
console.log(JSON.stringify(JSON.parse(row.mqttBrokerConfig), null, 2));
EOF

# Run inside container
docker exec agent-1 node /app/check-mqtt-config.js

# Expected output:
# {
#   "protocol": "mqtts",
#   "host": "mosquitto",
#   "port": 8883,
#   "useTls": true,
#   "caCert": "-----BEGIN CERTIFICATE-----\n...",
#   "verifyCertificate": true
# }
```

#### Test MQTTS Connection

```bash
# Install mosquitto clients
apt-get install mosquitto-clients

# Test with CA certificate
mosquitto_pub -h localhost -p 8883 \
  --cafile ./certs/ca.crt \
  -u device_uuid -P mqtt_password \
  -t test -m "Hello MQTTS"

# Should succeed with no certificate errors
```

### Troubleshooting

#### Error: "self-signed certificate in certificate chain"

**Cause**: Agent doesn't have CA certificate or not applying TLS options.

**Fix**:
1. Check API database has CA cert: `SELECT value->'caCert' FROM system_config WHERE key = 'mqtt.brokers.1'`
2. Check agent database: Run check script above
3. Verify agent code applies TLS: Look for "MQTT TLS enabled" in logs
4. Re-provision device if needed

#### Error: "unable to verify the first certificate"

**Cause**: CA certificate doesn't match server certificate.

**Fix**:
1. Regenerate server cert signed by same CA
2. Ensure Mosquitto using correct `cafile`, `certfile`, `keyfile`
3. Restart Mosquitto: `docker restart iotistic-mosquitto`

#### Error: "ECONNREFUSED" on port 8883

**Cause**: Mosquitto not listening on MQTTS port.

**Fix**:
1. Check Mosquitto config has `listener 8883` section
2. Verify port exposed: `docker port iotistic-mosquitto 8883`
3. Check Mosquitto logs: `docker logs iotistic-mosquitto`

#### Missing CA Certificate in Provisioning Response

**Cause**: `formatBrokerConfigForClient()` not handling camelCase fields.

**Fix**: Update `api/src/utils/mqtt-broker-config.ts`:
```typescript
export function formatBrokerConfigForClient(config: any) {
  const caCert = config.caCert ?? config.ca_cert ?? null;
  return {
    // ... other fields
    ...(caCert && { caCert })
  };
}
```

### Production Considerations

**Certificate Rotation**:
- Update CA cert in `system_config` table
- Re-provision devices OR push new config via cloud sync
- Mosquitto auto-reloads on SIGHUP

**Client Certificates** (mutual TLS):
- Set `require_certificate true` in Mosquitto config
- Generate client certs for each device
- Include `clientCert` and `clientKey` in broker config

**Commercial Certificates**:
- Use Let's Encrypt or commercial CA instead of self-signed
- Update `caCert` in database to trusted root CA
- Clients automatically trust well-known CAs

**Certificate Expiration**:
- Monitor expiration dates
- Automate renewal (certbot for Let's Encrypt)
- Plan device update rollout before expiry

## 🐳 Docker Integration

Deploy, update, and manage containers with full Docker and Kubernetes support.

### Quick Start (30 seconds)

```bash
# Make sure Docker is running
docker ps

# Deploy your first container!
npx tsx quick-start.ts

# Visit http://localhost:8080
```

### Features

✅ **Docker Integration** - Uses dockerode for actual Docker operations  
✅ **State Reconciliation** - Automatically calculates and applies changes  
✅ **Multi-Container Apps** - Deploy complex stacks (like docker-compose)  
✅ **Rolling Updates** - Zero-downtime container updates  
✅ **REST API** - Control via HTTP (see `api/` folder)  
✅ **Simulated Mode** - Test without Docker  

---


## Project Structure

```
standalone-application-manager/
├── src/
│   ├── application-manager.ts  # Main application manager logic
│   ├── app.ts                  # App class for managing application state
│   ├── composition-steps.ts    # Composition step generation and execution
│   ├── types.ts                # TypeScript type definitions
│   ├── stubs.ts                # Stub implementations for dependencies
│   └── index.ts                # Main entry point
├── examples/
│   └── basic-usage.ts          # Example usage
├── package.json
├── tsconfig.json
└── README.md
```

## Installation

```bash
cd standalone-application-manager
npm install
```

## Building

```bash
npm run build
```

This will compile the TypeScript files to JavaScript in the `dist/` directory.

## Testing

Run the test suite to verify the application manager works correctly:

```bash
# Install test runner
npm install -D tsx

# Run simple test
npx tsx test/simple-test.ts

# Run test with mock data
npx tsx test/mock-data-test.ts

# Run comprehensive test
npx tsx test/basic-test.ts
```

See [test/README.md](test/README.md) for more testing options.

## Usage

### Basic Example

```typescript
import applicationManager from 'standalone-application-manager';

// Initialize the application manager
await applicationManager.initialized();

// Get current applications
const currentApps = await applicationManager.getCurrentApps();

// Get target applications (from your configuration source)
const targetApps = await applicationManager.getTargetApps();

// Calculate required steps to reach target state
const steps = await applicationManager.getRequiredSteps(
	currentApps,
	targetApps,
	false, // keepImages
	false, // keepVolumes
	false  // force
);

// Execute each step
for (const step of steps) {
	await applicationManager.executeStep(step);
}
```

### Listening to Events

```typescript
// Listen for application state changes
applicationManager.on('change', (report) => {
	console.log('Application state changed:', report);
});
```

## Key Concepts

### Applications

Applications are composed of:
- **Services**: Docker containers running your application code
- **Networks**: Network configurations for inter-service communication
- **Volumes**: Persistent storage for application data

### Composition Steps

The application manager generates "composition steps" that represent atomic operations needed to transition from the current state to the target state. Step types include:

- `fetch`: Download a container image
- `start`: Start a service
- `stop`: Stop a service
- `kill`: Kill a service (forceful stop)
- `remove`: Remove a stopped service
- `createNetwork`: Create a network
- `createVolume`: Create a volume
- `removeNetwork`: Remove a network
- `removeVolume`: Remove a volume
- `updateMetadata`: Update service metadata
- `takeLock`: Acquire update locks
- `releaseLock`: Release update locks

### Update Strategies

The manager supports different update strategies:
- **Download then kill**: Download new image first, then replace
- **Kill then download**: Stop service first, then download
- **Delete then download**: Remove everything first (for major changes)
- **Handover**: Gradual transition between versions

## Architecture

### Simplified Design

This standalone version uses stub implementations for external dependencies like:
- Database operations (replaced with in-memory or no-op stubs)
- Docker API calls (stubbed for demonstration)
- System configuration (using defaults)
- Logging infrastructure (console-based)

### Extension Points

To use this in production, you would need to implement:

1. **Docker Integration**: Replace stubs in `stubs.ts` with real Docker API calls using `dockerode`
2. **Database**: Implement actual persistence for target state and configuration
3. **Network Layer**: Implement real network management
4. **Volume Management**: Implement real volume lifecycle management
5. **Image Management**: Implement real image download, delta updates, and cleanup
6. **Service Manager**: Implement actual container lifecycle management
7. **Logging**: Integrate with your logging infrastructure

## API Reference

### Main Functions

#### `initialized(): Promise<void>`
Initializes the application manager. Must be called before other operations.

#### `getCurrentApps(): Promise<InstancedAppState>`
Returns the current state of all applications.

#### `getTargetApps(): Promise<TargetApps>`
Returns the desired target state for applications.

#### `getRequiredSteps(currentApps, targetApps, keepImages?, keepVolumes?, force?): Promise<CompositionStep[]>`
Calculates the steps needed to transition from current to target state.

Parameters:
- `currentApps`: Current application state
- `targetApps`: Desired application state
- `keepImages`: Don't remove unused images (optional, default: false)
- `keepVolumes`: Don't remove unused volumes (optional, default: false)
- `force`: Force updates even if locked (optional, default: false)

#### `executeStep(step, options?): Promise<void>`
Executes a single composition step.

#### `setTarget(apps, source, transaction): Promise<void>`
Sets the target state for applications.

#### `getState(): Promise<AppState>`
Returns the current state formatted for reporting.

### Events

The application manager emits the following events:

- `change`: Emitted when application state changes

## Development

### Project Setup

1. Clone or extract to a separate folder
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Watch mode: `npm run watch`

### Testing

Currently, this is a demonstration extraction. To make it production-ready:

1. Implement actual Docker operations
2. Add comprehensive unit tests
3. Add integration tests with real Docker daemon
4. Implement error handling and retry logic
5. Add monitoring and observability

## Limitations

This standalone version is a simplified extraction that:
- Uses stub implementations for external dependencies
- Lacks full error handling
- Requires additional work to be production-ready


## License

Apache-2.0

## Contributing

Contributions welcome! Please open an issue or pull request on the [Iotistic repository](https://github.com/Iotistica/iotistic).

