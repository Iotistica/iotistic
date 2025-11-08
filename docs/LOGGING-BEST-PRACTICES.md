# Logging Best Practices for ELK/Elastic + Human Readability

## Philosophy

**Goal**: Logs that are both **machine-parseable** (Elastic/Logstash) AND **human-scannable** (console debugging)

**Key Principles**:
1. ✅ **Structured metadata** - JSON fields for Elastic queries
2. ✅ **Visual markers** - Operation context for human scanning
3. ✅ **Consistent naming** - Same field names across services
4. ✅ **One line per log** - Easier parsing and grepping
5. ✅ **Context preservation** - Track operation lifecycle

---

## Usage Examples

### Basic Logging (Old Way)
```typescript
logger.info(`Syncing ${count} sensors for device ${deviceUuid.substring(0, 8)}...`);
logger.info(`Updated sensor ${name}`);
logger.info(`Sync complete`);
```

**Console Output:**
```
22:10:15 [info]: Syncing 5 sensors for device 81aa7818...
22:10:15 [info]: Updated sensor temp-sensor-1
22:10:15 [info]: Updated sensor humidity-sensor-1
22:10:15 [info]: Sync complete
```

**Problem**: Hard to correlate related logs, no machine-queryable context

---

### Structured Logging (New Way)
```typescript
import { logOperation } from '../utils/logger';

logOperation.start('sensor-sync', 'Starting sensor synchronization', { 
  deviceUuid, 
  sensorCount: configDevices.length,
  syncType: isReconciliation ? 'reconciliation' : 'deployment'
});

for (const sensor of configDevices) {
  logOperation.step('sensor-sync', `Updating sensor ${sensor.name}`, {
    deviceUuid,
    sensorName: sensor.name,
    protocol: sensor.protocol,
    status: existingNames.has(sensor.name) ? 'update' : 'insert'
  });
}

logOperation.complete('sensor-sync', 'Synchronization complete', {
  deviceUuid,
  duration: Date.now() - startTime,
  inserted: insertCount,
  updated: updateCount,
  deleted: deleteCount
});
```

**Console Output (Human-Readable):**
```
22:10:15 [info]: [sensor-sync] START → Starting sensor synchronization {"deviceUuid":"81aa7818...","sensorCount":5,"syncType":"deployment"}
22:10:15 [info]: [sensor-sync] Updating sensor temp-sensor-1 {"deviceUuid":"81aa7818...","sensorName":"temp-sensor-1","protocol":"modbus","status":"update"}
22:10:15 [info]: [sensor-sync] Updating sensor humidity-sensor-1 {"deviceUuid":"81aa7818...","sensorName":"humidity-sensor-1","protocol":"modbus","status":"insert"}
22:10:16 [info]: [sensor-sync] DONE → Synchronization complete {"deviceUuid":"81aa7818...","duration":1200,"inserted":2,"updated":3,"deleted":0}
```

**Elastic Query (Machine-Parseable):**
```json
// Find all sensor sync operations for a device
GET /logs/_search
{
  "query": {
    "bool": {
      "must": [
        { "match": { "operation": "sensor-sync" } },
        { "match": { "deviceUuid": "81aa7818" } }
      ]
    }
  },
  "sort": [{ "@timestamp": "asc" }]
}

// Find slow sensor syncs
GET /logs/_search
{
  "query": {
    "bool": {
      "must": [
        { "match": { "operation": "sensor-sync" } },
        { "match": { "step": "DONE" } },
        { "range": { "duration": { "gt": 5000 } } }
      ]
    }
  }
}

// Find sensor sync errors
GET /logs/_search
{
  "query": {
    "bool": {
      "must": [
        { "match": { "operation": "sensor-sync" } },
        { "match": { "step": "ERROR" } }
      ]
    }
  }
}
```

---

## Operation Naming Convention

Use **kebab-case** for operation names (works well in URLs, queries, and code):

**Good Examples:**
- `sensor-sync` - Syncing sensors from config to table
- `device-provision` - Provisioning a new device
- `target-state-update` - Updating target state
- `metric-flush` - Flushing metrics to database
- `websocket-connect` - WebSocket connection established
- `mqtt-publish` - Publishing to MQTT broker

**Bad Examples:**
- `SensorSync` - PascalCase (harder to query)
- `sensor_sync` - snake_case (less URL-friendly)
- `Syncing sensors` - Spaces and descriptions (not queryable)

---

## Standard Metadata Fields

### Required for All Operations
```typescript
{
  operation: string,      // Operation name (kebab-case)
  step?: 'START' | 'DONE' | 'ERROR',  // Operation lifecycle
}
```

### Common Context Fields
```typescript
{
  deviceUuid: string,     // Device identifier
  userId: string,         // Who triggered the action
  duration: number,       // Operation duration (ms)
  count: number,          // Number of items processed
  status: string,         // Current status (pending, deployed, etc.)
}
```

### Error Fields (when step='ERROR')
```typescript
{
  error: string,          // Error message
  stack: string,          // Stack trace
  errorCode?: string,     // Application error code
  retryCount?: number,    // Number of retries attempted
}
```

---

## Real-World Examples

### Example 1: Device Provisioning

```typescript
import { logOperation } from '../utils/logger';

export async function provisionDevice(apiKey: string, deviceData: any) {
  const startTime = Date.now();
  
  logOperation.start('device-provision', 'Starting device provisioning', {
    apiKey: apiKey.substring(0, 8) + '...',
    deviceType: deviceData.type
  });

  try {
    // Validate API key
    const customer = await validateProvisioningKey(apiKey);
    logOperation.step('device-provision', 'API key validated', {
      customerId: customer.id,
      planType: customer.plan_type
    });

    // Create device record
    const device = await createDevice(customer.id, deviceData);
    logOperation.step('device-provision', 'Device created', {
      deviceUuid: device.uuid,
      deviceName: device.name
    });

    // Generate device API key
    const deviceApiKey = await generateDeviceApiKey(device.uuid);
    logOperation.step('device-provision', 'API key generated', {
      deviceUuid: device.uuid
    });

    logOperation.complete('device-provision', 'Provisioning complete', {
      deviceUuid: device.uuid,
      customerId: customer.id,
      duration: Date.now() - startTime
    });

    return { device, deviceApiKey };
  } catch (error) {
    logOperation.error('device-provision', 'Provisioning failed', error as Error, {
      apiKey: apiKey.substring(0, 8) + '...',
      duration: Date.now() - startTime
    });
    throw error;
  }
}
```

**Console Output:**
```
22:15:30 [info]: [device-provision] START → Starting device provisioning {"apiKey":"708b51cb...","deviceType":"raspberry-pi"}
22:15:30 [info]: [device-provision] API key validated {"customerId":"cust_abc123","planType":"professional"}
22:15:30 [info]: [device-provision] Device created {"deviceUuid":"81aa7818...","deviceName":"office-gateway"}
22:15:30 [info]: [device-provision] API key generated {"deviceUuid":"81aa7818..."}
22:15:31 [info]: [device-provision] DONE → Provisioning complete {"deviceUuid":"81aa7818...","customerId":"cust_abc123","duration":1250}
```

---

### Example 2: State Report Processing

```typescript
import { logOperation } from '../utils/logger';

export async function processStateReport(deviceUuid: string, stateReport: any) {
  const startTime = Date.now();
  const appCount = stateReport.apps?.length || 0;
  
  logOperation.start('state-report', 'Processing state report', {
    deviceUuid,
    appCount,
    hasMetrics: !!stateReport.metrics
  });

  try {
    // Validate version
    const currentVersion = await getCurrentVersion(deviceUuid);
    logOperation.step('state-report', 'Current version retrieved', {
      deviceUuid,
      reportVersion: stateReport.version,
      currentVersion
    });

    // Process apps
    if (appCount > 0) {
      await reconcileApps(deviceUuid, stateReport.apps);
      logOperation.step('state-report', 'Apps reconciled', {
        deviceUuid,
        appCount
      });
    }

    // Process metrics
    if (stateReport.metrics) {
      await processMetrics(deviceUuid, stateReport.metrics);
      logOperation.step('state-report', 'Metrics processed', {
        deviceUuid,
        metricCount: Object.keys(stateReport.metrics).length
      });
    }

    logOperation.complete('state-report', 'Report processed successfully', {
      deviceUuid,
      duration: Date.now() - startTime,
      appCount,
      metricsProcessed: !!stateReport.metrics
    });

  } catch (error) {
    logOperation.error('state-report', 'Failed to process report', error as Error, {
      deviceUuid,
      duration: Date.now() - startTime
    });
    throw error;
  }
}
```

---

### Example 3: Batch Operations

```typescript
import { logOperation } from '../utils/logger';

export async function flushMetricsBatch(deviceUuid: string, metrics: Metric[]) {
  const startTime = Date.now();
  
  logOperation.start('metric-flush', 'Starting batch flush', {
    deviceUuid,
    metricCount: metrics.length,
    batchSize: BATCH_SIZE
  });

  try {
    let inserted = 0;
    let failed = 0;

    for (let i = 0; i < metrics.length; i += BATCH_SIZE) {
      const batch = metrics.slice(i, i + BATCH_SIZE);
      
      try {
        await insertMetricBatch(deviceUuid, batch);
        inserted += batch.length;
        
        logOperation.step('metric-flush', `Batch ${Math.floor(i/BATCH_SIZE) + 1} inserted`, {
          deviceUuid,
          batchNumber: Math.floor(i/BATCH_SIZE) + 1,
          batchSize: batch.length,
          totalInserted: inserted
        });
      } catch (error) {
        failed += batch.length;
        logOperation.step('metric-flush', `Batch ${Math.floor(i/BATCH_SIZE) + 1} failed`, {
          deviceUuid,
          batchNumber: Math.floor(i/BATCH_SIZE) + 1,
          batchSize: batch.length,
          error: (error as Error).message
        });
      }
    }

    logOperation.complete('metric-flush', 'Batch flush complete', {
      deviceUuid,
      duration: Date.now() - startTime,
      totalMetrics: metrics.length,
      inserted,
      failed
    });

  } catch (error) {
    logOperation.error('metric-flush', 'Batch flush failed', error as Error, {
      deviceUuid,
      duration: Date.now() - startTime
    });
    throw error;
  }
}
```

---

## Elastic Dashboards & Queries

### Useful Kibana Queries

**1. Operation Performance Dashboard**
```
operation:* AND step:DONE
| stats avg(duration), p95(duration), p99(duration) by operation
```

**2. Error Rate by Operation**
```
step:ERROR
| stats count() by operation
| sort -count
```

**3. Device Activity Timeline**
```
deviceUuid:"81aa7818*"
| sort @timestamp asc
| table @timestamp, operation, step, message
```

**4. Slow Operations (> 5 seconds)**
```
step:DONE AND duration:>5000
| table @timestamp, operation, deviceUuid, duration
| sort -duration
```

---

## Benefits Summary

### For Developers (Human Console)
- ✅ **Visual grouping** - `[operation]` prefix groups related logs
- ✅ **Lifecycle markers** - `START →` and `DONE →` clearly show operation boundaries
- ✅ **One-line logs** - Easy to grep, tail, and scroll
- ✅ **Metadata inline** - Context visible without expanding JSON

### For Elastic/ELK (Machine Parsing)
- ✅ **Queryable fields** - Filter by operation, step, deviceUuid, etc.
- ✅ **Aggregatable** - Calculate averages, percentiles, counts
- ✅ **Traceable** - Follow operation lifecycle across services
- ✅ **Alertable** - Create alerts on error rates, slow operations, etc.

### Example Elastic Document
```json
{
  "@timestamp": "2025-11-07T22:15:30.123Z",
  "level": "info",
  "message": "Synchronization complete",
  "service": "Iotistic-api",
  "operation": "sensor-sync",
  "step": "DONE",
  "deviceUuid": "81aa7818-d560-46bc-a3c5-adbfcca611c4",
  "duration": 1200,
  "inserted": 2,
  "updated": 3,
  "deleted": 0,
  "syncType": "deployment"
}
```

**Query to find this log:**
```
GET /logs/_search?q=operation:sensor-sync AND step:DONE AND deviceUuid:81aa7818*
```

---

## Migration Guide

### Step 1: Import the helper
```typescript
import { logOperation } from '../utils/logger';
```

### Step 2: Replace basic logs with structured logs

**Before:**
```typescript
console.log(`Starting sync for device ${deviceUuid}`);
// ... work ...
console.log(`Sync complete`);
```

**After:**
```typescript
logOperation.start('device-sync', 'Starting device synchronization', { deviceUuid });
// ... work ...
logOperation.complete('device-sync', 'Synchronization complete', { deviceUuid, duration });
```

### Step 3: Add context to intermediate steps

**Before:**
```typescript
console.log(`Processing sensor ${name}`);
```

**After:**
```typescript
logOperation.step('device-sync', `Processing sensor ${name}`, {
  deviceUuid,
  sensorName: name,
  protocol: sensor.protocol
});
```

### Step 4: Wrap errors properly

**Before:**
```typescript
catch (error) {
  console.error('Sync failed:', error);
  throw error;
}
```

**After:**
```typescript
catch (error) {
  logOperation.error('device-sync', 'Synchronization failed', error as Error, {
    deviceUuid,
    duration: Date.now() - startTime
  });
  throw error;
}
```

---

## Common Operations Registry

Keep operation names consistent across the codebase:

| Operation | Purpose | Key Fields |
|-----------|---------|-----------|
| `device-provision` | Device provisioning flow | apiKey, deviceUuid, customerId |
| `state-report` | Processing device state reports | deviceUuid, version, appCount |
| `target-state-update` | Updating target state | deviceUuid, version, apps |
| `sensor-sync` | Syncing sensors config↔table | deviceUuid, sensorCount, syncType |
| `metric-flush` | Flushing metrics to DB | deviceUuid, metricCount, batchSize |
| `mqtt-publish` | Publishing to MQTT | topic, deviceUuid, payloadSize |
| `websocket-connect` | WebSocket connections | deviceUuid, clientId |
| `api-request` | HTTP API requests | method, path, statusCode, duration |

---

## Advanced: Distributed Tracing

For multi-service operations, add `traceId`:

```typescript
const traceId = crypto.randomUUID();

// Service 1 (API)
logOperation.start('device-provision', 'Starting provisioning', { 
  traceId, 
  deviceUuid 
});

// Pass traceId to other services
await callMqttService({ traceId, deviceUuid, action: 'provision' });

// Service 2 (MQTT)
logOperation.step('mqtt-setup', 'Creating ACLs', { 
  traceId, 
  deviceUuid 
});
```

**Elastic Query:**
```
traceId:"550e8400-e29b-41d4-a716-446655440000"
| sort @timestamp asc
```

This gives you end-to-end visibility across services for a single operation.
