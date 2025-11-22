# Housekeeper Service

Standalone microservice for database maintenance and cleanup tasks in the Iotistic IoT platform.

## Overview

The Housekeeper service runs scheduled maintenance tasks to keep the database clean and optimized. It's designed to run as a **single-replica service** to avoid concurrent task execution conflicts.

### Key Features

- **Cron-based scheduling** - Tasks run on configurable schedules (daily, weekly, etc.)
- **Manual triggering** - Tasks can be triggered on-demand via REST API
- **Execution history** - Complete audit trail of all task runs
- **Graceful shutdown** - Waits for running tasks to complete before shutdown
- **Kubernetes-ready** - Deployment manifests with proper health checks

## Architecture Decision

### Why Separate Service?

The housekeeper was extracted from the API service to support **Kubernetes multi-replica scaling**:

**Problem**: When API runs with `replicas: 3`, all 3 pods would run the same scheduled tasks simultaneously, causing:
- Duplicate database operations
- Lock conflicts
- Wasted resources

**Solution**: Separate housekeeper service with `replicas: 1` ensures:
- Only one instance runs maintenance tasks
- API can scale independently
- Clear separation of concerns

### Deployment Models

1. **Kubernetes** - Single Deployment with `replicas: 1` and `Recreate` strategy
2. **Docker Compose** - Single container with `restart: unless-stopped`

## Maintenance Tasks

### Built-in Tasks

| Task Name | Schedule | Description |
|-----------|----------|-------------|
| `api-key-rotation` | Hourly | Rotates device API keys before expiry & revokes old keys after grace period |
| `cleanup-old-logs` | Daily 3am | Removes log files older than retention period |
| `database-vacuum` | Weekly Sun 4am | Runs PostgreSQL VACUUM ANALYZE |
| `device-logs-retention` | Daily 2am | Drops old device_logs partitions |
| `device-logs-partition-maintenance` | Daily 1am | Creates future device_logs partitions |
| `device-metrics-partition-maintenance` | Daily 1am + startup | Creates/drops device_metrics partitions |
| `events-partition-maintenance` | Daily 1am + startup | Maintains events table partitions |
| `security-scan-images` | Daily 4am + 5min after startup | Scans approved Docker images for vulnerabilities using Trivy |

## Configuration

### Environment Variables

#### Database Connection
```bash
DB_HOST=postgres              # PostgreSQL host
DB_PORT=5432                  # PostgreSQL port
DB_NAME=iotistic              # Database name
DB_USER=postgres              # Database user
DB_PASSWORD=postgres          # Database password
DB_POOL_MAX=10                # Max connections in pool
DB_IDLE_TIMEOUT=30000         # Idle timeout (ms)
DB_CONNECT_TIMEOUT=10000      # Connect timeout (ms)
```

#### Service Configuration
```bash
PORT=3200                     # HTTP server port
HOST=0.0.0.0                  # Bind address
NODE_ENV=production           # Environment (production/development)
```

#### Housekeeper Settings
```bash
HOUSEKEEPER_ENABLED=true      # Enable/disable all tasks
TIMEZONE=Etc/UTC              # Timezone for cron schedules
```

#### Retention Policies
```bash
LOG_RETENTION_DAYS=30         # File log retention (days)
LOG_RETENTION_ENABLED=true    # Enable log retention cleanup
METRICS_RETENTION_DAYS=90     # Metrics partition retention (days)
```

#### API Key Rotation
```bash
ENABLE_API_KEY_ROTATION=true  # Enable automatic key rotation (default: true)
ENABLE_API_KEY_REVOCATION=true # Enable old key revocation (default: true)
ROTATION_CHECK_SCHEDULE='0 * * * *' # Cron schedule (default: hourly)
```

#### Logging
```bash
LOG_LEVEL=info                # Log level (debug, info, warn, error)
LOG_FORMAT=json               # Log format (json, pretty)
LOG_DIRECTORY=/app/logs       # Log file directory
```

#### Security Scanning (Trivy)
```bash
TRIVY_ENABLED=true            # Enable/disable Trivy scanning
TRIVY_PATH=trivy              # Trivy binary path
TRIVY_TIMEOUT=300000          # Scan timeout (ms) - default 5 minutes
TRIVY_CACHE_DIR=/tmp/trivy-cache  # Cache directory for Trivy DB
TRIVY_CRITICAL_THRESHOLD=0    # Fail if critical vulnerabilities > threshold
TRIVY_HIGH_THRESHOLD=999      # Warn if high vulnerabilities > threshold
```

## REST API

### Endpoints

#### Health Check
```bash
GET /health
```
Returns service health status.

**Response:**
```json
{
  "status": "healthy",
  "service": "housekeeper",
  "uptime": 12345,
  "timestamp": "2025-01-15T10:30:00Z"
}
```

#### Readiness Check
```bash
GET /ready
```
Returns readiness status (database connectivity).

#### List All Tasks
```bash
GET /api/housekeeper/tasks
```
Returns all registered tasks with execution statistics.

**Response:**
```json
{
  "tasks": [
    {
      "name": "cleanup-old-logs",
      "schedule": "0 3 * * *",
      "isRunning": false,
      "enabled": true,
      "stats": {
        "total_runs": 30,
        "success_count": 30,
        "error_count": 0,
        "avg_duration_ms": 150,
        "last_run_at": "2025-01-15T03:00:00Z",
        "last_status": "success"
      }
    }
  ],
  "totalTasks": 6,
  "runningTasks": 0
}
```

#### Get Task Details
```bash
GET /api/housekeeper/tasks/:name
```
Returns detailed information about a specific task, including execution history.

#### Trigger Task Manually
```bash
POST /api/housekeeper/tasks/:name/run
```
Triggers a task to run immediately.

**Response:**
```json
{
  "message": "Task 'cleanup-old-logs' triggered successfully",
  "status": "running"
}
```

#### Enable/Disable Task
```bash
PATCH /api/housekeeper/tasks/:name/toggle
```
**Body:**
```json
{
  "enabled": false
}
```

#### Get Task Run Output
```bash
GET /api/housekeeper/tasks/:name/runs/:runId
```
Returns detailed output from a specific task execution.

#### Get Overall Status
```bash
GET /api/housekeeper/status
```
Returns overall housekeeper health and statistics.

## Deployment

### Docker Compose

#### Standalone Deployment
```bash
# Start housekeeper + postgres
docker-compose -f docker-compose.housekeeper.yml up -d

# View logs
docker-compose -f docker-compose.housekeeper.yml logs -f housekeeper

# Stop services
docker-compose -f docker-compose.housekeeper.yml down
```

#### Integrated with Main Stack
```bash
# Add to existing docker-compose.yml
docker-compose up -d housekeeper
```

### Kubernetes

#### Deploy with kubectl
```bash
# Create namespace (if needed)
kubectl create namespace iotistic

# Apply manifests
kubectl apply -f housekeeper/k8s/configmap.yaml
kubectl apply -f housekeeper/k8s/secret.yaml
kubectl apply -f housekeeper/k8s/deployment.yaml
kubectl apply -f housekeeper/k8s/service.yaml

# Check status
kubectl get pods -n iotistic -l app=housekeeper
kubectl logs -n iotistic -l app=housekeeper -f
```

#### Update Configuration
```bash
# Edit ConfigMap
kubectl edit configmap housekeeper-config -n iotistic

# Restart deployment to pick up changes
kubectl rollout restart deployment/housekeeper -n iotistic
```

#### Scale (NOT RECOMMENDED)
```bash
# WARNING: Only run 1 replica to avoid concurrent task execution
kubectl scale deployment/housekeeper --replicas=1 -n iotistic
```

## Development

### Local Development
```bash
cd housekeeper

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build TypeScript
npm run build

# Start production build
npm start
```

### Testing
```bash
# Test database connection
curl http://localhost:3200/ready

# List tasks
curl http://localhost:3200/api/housekeeper/tasks

# Trigger a task manually
curl -X POST http://localhost:3200/api/housekeeper/tasks/cleanup-old-logs/run

# Check task status
curl http://localhost:3200/api/housekeeper/status
```

### Building Docker Image
```bash
# Build image
docker build -t iotistic/housekeeper:latest housekeeper/

# Run container
docker run -d \
  --name housekeeper \
  -p 3200:3200 \
  -e DB_HOST=postgres \
  -e DB_PASSWORD=yourpassword \
  iotistic/housekeeper:latest

# View logs
docker logs -f housekeeper
```

## Monitoring

### Health Checks

**Liveness Probe** - HTTP GET to `/health`
- Checks if service is alive
- Kills pod if unhealthy

**Readiness Probe** - HTTP GET to `/ready`
- Checks database connectivity
- Removes from load balancer if not ready

### Metrics

The housekeeper tracks execution metrics in the `housekeeper_runs` table:
- Task name
- Start/completion time
- Duration (ms)
- Status (success/error)
- Output logs
- Error messages

Query execution history:
```sql
SELECT * FROM housekeeper_runs 
ORDER BY started_at DESC 
LIMIT 50;
```

Get task statistics:
```sql
SELECT * FROM get_housekeeper_stats();
```

## Troubleshooting

### Task Not Running

1. **Check if housekeeper is running:**
   ```bash
   # Docker
   docker ps | grep housekeeper
   
   # Kubernetes
   kubectl get pods -n iotistic -l app=housekeeper
   ```

2. **Check if task is enabled:**
   ```bash
   curl http://localhost:3200/api/housekeeper/tasks/cleanup-old-logs
   ```

3. **Check task schedule:**
   ```bash
   # Verify cron expression is valid
   # Use https://crontab.guru/ to test
   ```

4. **Check logs:**
   ```bash
   # Docker
   docker logs -f iotistic-housekeeper
   
   # Kubernetes
   kubectl logs -n iotistic -l app=housekeeper -f
   ```

### Task Failing

1. **Check execution history:**
   ```bash
   curl http://localhost:3200/api/housekeeper/tasks/cleanup-old-logs | jq '.history'
   ```

2. **Check database connection:**
   ```bash
   curl http://localhost:3200/ready
   ```

3. **Review error logs:**
   ```sql
   SELECT * FROM housekeeper_runs 
   WHERE status = 'error' 
   ORDER BY started_at DESC;
   ```

### Multiple Instances Running

**CRITICAL:** Only 1 housekeeper instance should run at a time.

**Kubernetes:**
```bash
# Check replica count
kubectl get deployment housekeeper -n iotistic

# Scale down to 1 if needed
kubectl scale deployment/housekeeper --replicas=1 -n iotistic
```

**Docker:**
```bash
# Check for duplicate containers
docker ps | grep housekeeper

# Stop duplicates
docker stop <container-id>
```

## API Key Rotation Task

### Overview

The `api-key-rotation` task automatically rotates device API keys before they expire and revokes old keys after the grace period. This enhances security by regularly cycling credentials.

**Migrated from**: `api/src/services/rotation-scheduler.ts` (2025-01-15)

### Features

- **Automatic Rotation**: Rotates keys 7 days before expiry
- **Grace Period**: Old keys remain valid for 7 days after rotation
- **Automatic Revocation**: Revokes old keys after grace period expires
- **Audit Trail**: All rotations logged to `audit_logs` and `housekeeper_runs`
- **Configurable Schedule**: Default hourly, customizable via `ROTATION_CHECK_SCHEDULE`

### How It Works

1. **Rotation Check** (if enabled):
   - Queries `devices_needing_rotation` view
   - Finds devices with keys expiring within 7 days
   - For each device:
     - Generates new 256-bit API key
     - Hashes with bcrypt (10 rounds)
     - Updates `devices.device_api_key_hash`
     - Archives old key to `device_api_key_history`
     - Sets new expiry (90 days from now)

2. **Revocation Check** (if enabled):
   - Queries `device_api_key_history` for expired grace periods
   - Marks old keys as inactive
   - Logs revocation events to audit log

### Database Dependencies

- **View**: `devices_needing_rotation` - Finds devices needing rotation
- **Table**: `devices` - Main device table with rotation tracking
- **Table**: `device_api_key_history` - Key rotation history
- **Table**: `audit_logs` - Rotation/revocation event log
- **Trigger**: `trigger_archive_device_api_key` - Auto-archives old keys

See **[docs/API-KEY-ROTATION.md](docs/API-KEY-ROTATION.md)** for complete documentation.

### Configuration

```bash
# Enable/disable rotation (default: enabled)
ENABLE_API_KEY_ROTATION=true

# Enable/disable revocation (default: enabled)
ENABLE_API_KEY_REVOCATION=true

# Cron schedule (default: every hour)
ROTATION_CHECK_SCHEDULE='0 * * * *'

# Examples:
# Every 6 hours: '0 */6 * * *'
# Daily at 2 AM: '0 2 * * *'
# Every 30 min: '*/30 * * * *'
```

### Manual Execution

```bash
# Trigger rotation manually
curl -X POST http://localhost:3200/api/housekeeper/tasks/api-key-rotation/run

# Check task status
curl http://localhost:3200/api/housekeeper/tasks/api-key-rotation

# View rotation history
docker exec iotistic-postgres psql -U postgres -d iotistic -c \
  "SELECT * FROM housekeeper_runs WHERE task_name = 'api-key-rotation' ORDER BY started_at DESC LIMIT 5;"
```

### Monitoring

Query devices needing rotation:
```sql
SELECT uuid, device_name, days_until_expiry 
FROM devices_needing_rotation 
ORDER BY api_key_expires_at ASC;
```

Check rotation statistics:
```sql
SELECT 
  task_name,
  total_runs,
  success_count,
  error_count,
  avg_duration_ms,
  last_run_at,
  last_status
FROM get_housekeeper_stats()
WHERE task_name = 'api-key-rotation';
```

View key history for a device:
```sql
SELECT 
  issued_at,
  expires_at,
  revoked_at,
  is_active
FROM device_api_key_history
WHERE device_uuid = 'your-device-uuid'
ORDER BY issued_at DESC;
```

## Security Scanning Task

### Overview

The `security-scan-images` task performs periodic vulnerability scanning of approved Docker images using [Aqua Security's Trivy](https://github.com/aquasecurity/trivy). This helps detect newly discovered CVEs in images that were previously approved.

### Why Two Scanners?

The platform uses a **two-tier scanning approach**:

1. **API (image-monitor)**: Real-time scanning when new Docker Hub tags are detected
   - Scans immediately before creating approval requests
   - Can auto-reject images with critical vulnerabilities
   - Located in `api/src/services/image-monitor.ts`

2. **Housekeeper (security-scan-images)**: Periodic rescanning of approved images
   - Detects newly discovered CVEs in previously approved images
   - Runs daily at 4:00 AM
   - Stores historical scan results for trend analysis

### Installation

**Docker (Recommended)**:
```dockerfile
# Add to Dockerfile
FROM node:18-alpine

# Install Trivy
RUN apk add --no-cache wget
RUN wget -qO - https://github.com/aquasecurity/trivy/releases/download/v0.48.0/trivy_0.48.0_Linux-64bit.tar.gz | tar -xz -C /usr/local/bin
```

**Verify Installation**:
```bash
docker exec iotistic-housekeeper trivy --version
```

### Scan Results

Results are stored in the `image_security_scans` table:
```sql
SELECT 
  ir.image_name,
  ir.tag,
  iss.scanned_at,
  iss.scan_status,
  iss.vulnerabilities->'critical' as critical,
  iss.vulnerabilities->'high' as high
FROM image_security_scans iss
JOIN image_registry ir ON ir.id = iss.image_id
ORDER BY iss.scanned_at DESC
LIMIT 10;
```

### Manual Trigger

```bash
# Trigger security scan manually
curl -X POST http://localhost:3200/api/housekeeper/tasks/security-scan-images/run

# Check scan status
curl http://localhost:3200/api/housekeeper/tasks/security-scan-images
```

### Scan Statuses

- **passed**: No critical/high vulnerabilities above threshold
- **warning**: High vulnerabilities exceed threshold but no critical
- **failed**: Critical vulnerabilities exceed threshold

## Database Schema

### Required Tables

The housekeeper requires these database tables (created by API migrations):

```sql
-- Task execution history
CREATE TABLE housekeeper_runs (
  id SERIAL PRIMARY KEY,
  task_name VARCHAR(255) NOT NULL,
  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  status VARCHAR(50) NOT NULL,
  duration_ms INTEGER,
  output TEXT,
  error TEXT,
  triggered_by VARCHAR(50) DEFAULT 'scheduler'
);

-- Task configuration
CREATE TABLE housekeeper_config (
  task_name VARCHAR(255) PRIMARY KEY,
  enabled BOOLEAN DEFAULT true,
  schedule VARCHAR(255),
  last_modified_at TIMESTAMP DEFAULT NOW()
);

-- Security scan results (for security-scan-images task)
CREATE TABLE image_security_scans (
  id SERIAL PRIMARY KEY,
  image_id INTEGER REFERENCES image_registry(id),
  scanned_at TIMESTAMP NOT NULL,
  vulnerabilities JSONB NOT NULL,  -- {critical, high, medium, low, unknown, total}
  scan_status VARCHAR(20) NOT NULL,  -- passed, warning, failed
  details JSONB,  -- Top 100 vulnerability details
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Helper Functions

```sql
-- Get task statistics
CREATE OR REPLACE FUNCTION get_housekeeper_stats()
RETURNS TABLE (
  task_name VARCHAR,
  total_runs BIGINT,
  success_count BIGINT,
  error_count BIGINT,
  avg_duration_ms NUMERIC,
  last_run_at TIMESTAMP,
  last_status VARCHAR
) AS $$
  SELECT 
    task_name,
    COUNT(*) as total_runs,
    SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success_count,
    SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as error_count,
    AVG(duration_ms) as avg_duration_ms,
    MAX(started_at) as last_run_at,
    (SELECT status FROM housekeeper_runs hr2 
     WHERE hr2.task_name = hr.task_name 
     ORDER BY started_at DESC LIMIT 1) as last_status
  FROM housekeeper_runs hr
  GROUP BY task_name;
$$ LANGUAGE SQL;
```

## Best Practices

1. **Single Instance** - Always run exactly 1 replica in production
2. **Monitor Execution** - Regularly check task execution history
3. **Adjust Schedules** - Tune cron schedules based on load patterns
4. **Set Retention Policies** - Configure retention to match your compliance needs
5. **Resource Limits** - Set appropriate CPU/memory limits in Kubernetes
6. **Graceful Shutdown** - Allow 30s+ for tasks to complete during shutdown
7. **Database Backups** - Ensure backups before running VACUUM or partition drops

## License

MIT License - Iotistic Platform
