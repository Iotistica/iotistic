# Anomaly Detection - Implementation Guide

## Overview

Edge-based anomaly detection system for IoT devices running on Raspberry Pi and similar constrained hardware. Detects unusual patterns in sensor data and system metrics **before** they cause failures.

**Resource Budget**:
- Memory: < 50MB
- CPU: < 5% average
- Storage: ~100MB (30-day history)

---

## Quick Start

### 1. Enable Anomaly Detection

Add to `docker-compose.yml`:

```yaml
services:
  agent-1:
    environment:
      # Enable anomaly detection
      - ANOMALY_DETECTION_ENABLED=true
      
      # Detection methods (comma-separated)
      - ANOMALY_METHODS=zscore,mad,ewma
      
      # Sensitivity (1-10, higher = more sensitive)
      - ANOMALY_SENSITIVITY=5
      
      # Alert settings
      - ANOMALY_ALERT_MIN_CONFIDENCE=0.7
      - ANOMALY_MQTT_ENABLED=true
```

### 2. Monitor Alerts

Alerts are published to MQTT topic:
```
alerts/anomaly/{deviceId}
```

Subscribe to view alerts:
```bash
mosquitto_sub -h localhost -p 1883 -t "alerts/anomaly/#" -v
```

### 3. View in Dashboard

Alerts appear in agent logs with color coding:
- 🔴 **CRITICAL**: Immediate attention required
- 🟡 **WARNING**: Investigate soon
- 🔵 **INFO**: Informational only

---

## Configuration

### Environment Variables

```bash
# Core Settings
ANOMALY_DETECTION_ENABLED=true          # Enable/disable detection
ANOMALY_METHODS=zscore,mad,ewma         # Detection methods to use
ANOMALY_SENSITIVITY=5                   # 1-10 (default: 5)

# Statistical Parameters
ANOMALY_WINDOW_SIZE=500                 # Rolling window size (samples)
ANOMALY_ZSCORE_THRESHOLD=3.0            # Z-score threshold (σ)
ANOMALY_MAD_THRESHOLD=3.0               # MAD threshold (multiplier)
ANOMALY_RATE_THRESHOLD=10.0             # Rate change threshold (%/second)

# Machine Learning (Optional)
ANOMALY_ML_ENABLED=true                 # Enable ML methods
ANOMALY_ML_TRAINING_INTERVAL=3600000    # Training interval (ms, default 1h)
ANOMALY_ML_CONFIDENCE_THRESHOLD=0.7     # ML confidence threshold

# Alert Configuration
ANOMALY_ALERT_MIN_CONFIDENCE=0.7        # Min confidence to alert (0-1)
ANOMALY_ALERT_COOLDOWN_MS=300000        # Cooldown between alerts (ms, default 5min)
ANOMALY_ALERT_MAX_QUEUE=1000            # Max alerts in queue

# Storage
ANOMALY_HISTORY_DAYS=30                 # Days to keep historical data
ANOMALY_DB_PATH=/app/data/anomaly.db    # SQLite database path

# Integration
ANOMALY_MQTT_ENABLED=true               # Publish alerts to MQTT
ANOMALY_CLOUD_SYNC=true                 # Sync alerts to cloud
```

### Target State Configuration

Configure via cloud API (`config.anomalyDetection`):

```json
{
  "config": {
    "anomalyDetection": {
      "enabled": true,
      "sensitivity": 5,
      "metrics": [
        {
          "name": "temperature",
          "enabled": true,
          "methods": ["zscore", "mad", "ewma"],
          "threshold": 3.0,
          "windowSize": 500,
          "expectedRange": [15, 30],
          "minConfidence": 0.7,
          "cooldownMs": 300000
        },
        {
          "name": "cpu_usage",
          "enabled": true,
          "methods": ["zscore", "ewma"],
          "threshold": 2.5,
          "windowSize": 100,
          "expectedRange": [0, 80]
        },
        {
          "name": "memory_percent",
          "enabled": true,
          "methods": ["zscore", "ewma", "rate_change"],
          "threshold": 2.0,
          "windowSize": 200,
          "expectedRange": [0, 85]
        }
      ],
      "alerts": {
        "mqtt": true,
        "cloud": true,
        "minConfidence": 0.7
      }
    }
  }
}
```

---

## Detection Methods

### 1. Z-Score (Standard Deviation)

**Best for**: Gradual drift, outliers in normally distributed data

**How it works**:
- Tracks rolling mean (μ) and standard deviation (σ)
- Flags values > 3σ from mean
- Confidence increases with deviation

**Parameters**:
- `ANOMALY_ZSCORE_THRESHOLD=3.0` (standard deviations)
- `ANOMALY_WINDOW_SIZE=500` (samples)

**Example**:
```
Temperature normally 20-25°C (μ=22.5, σ=1.5)
New reading: 30°C
Z-score: (30 - 22.5) / 1.5 = 5.0 σ
Result: ANOMALY (> 3σ threshold)
```

---

### 2. MAD (Median Absolute Deviation)

**Best for**: Noisy data, sporadic spikes, robust to outliers

**How it works**:
- Uses median instead of mean (more robust)
- Calculates median absolute deviation
- Flags values > 3 MAD from median

**Parameters**:
- `ANOMALY_MAD_THRESHOLD=3.0` (MAD multiplier)
- `ANOMALY_WINDOW_SIZE=500`

**Example**:
```
Humidity readings: [40, 42, 41, 99, 43, 40] (one spike)
Median: 41.5
MAD: median(|x - 41.5|) = 1.5
Value 99: |99 - 41.5| / 1.5 = 38.3 MAD
Result: ANOMALY (> 3 MAD threshold)
```

---

### 3. IQR (Interquartile Range)

**Best for**: Skewed distributions, categorical data

**How it works**:
- Calculates Q1 (25th percentile) and Q3 (75th percentile)
- IQR = Q3 - Q1
- Flags values outside [Q1 - 1.5×IQR, Q3 + 1.5×IQR] (Tukey's fences)

**Parameters**:
- `threshold` in metric config (default: 1.5)

---

### 4. Rate of Change

**Best for**: Sudden failures, sensor disconnects, rapid changes

**How it works**:
- Calculates velocity (derivative)
- Flags percentage change > threshold per second
- Detects sudden spikes/drops

**Parameters**:
- `ANOMALY_RATE_THRESHOLD=10.0` (% change per second)

**Example**:
```
CPU usage goes from 30% → 95% in 2 seconds
Rate: (95 - 30) / 2 = 32.5%/s
Threshold: 10%/s
Result: ANOMALY (32.5 > 10)
```

---

### 5. EWMA (Exponentially Weighted Moving Average)

**Best for**: Trending data, seasonal patterns, smoothed detection

**How it works**:
- Maintains smoothed trend using exponential weighting
- Recent values weighted more heavily
- Alerts when value deviates from EWMA band

**Parameters**:
- Alpha (smoothing): 0.3 (hardcoded, balance of responsiveness)
- Threshold: 2.0σ from EWMA

**Example**:
```
Temperature trend: 20°C → 21°C → 22°C (slow increase)
EWMA tracks trend smoothly
Sudden spike to 35°C detected (outside EWMA band)
```

---

## Alert Structure

### MQTT Message Format

```json
{
  "id": "a3f8d2c1-4b5e-6f7a-8b9c-0d1e2f3a4b5c",
  "severity": "warning",
  "metric": "temperature",
  "value": 30.5,
  "expectedRange": [15, 25],
  "deviation": 3.67,
  "detectionMethod": "zscore",
  "timestamp": 1699876543210,
  "confidence": 0.85,
  "context": {
    "recent_values": [20.1, 20.3, 19.9, 20.2, 30.5],
    "baseline": 20.125,
    "trend": "stable",
    "windowSize": 500
  },
  "message": "Value 30.50 is 3.67σ from mean 20.12",
  "count": 1
}
```

### Severity Levels

- **CRITICAL** (confidence ≥ 0.85 or deviation ≥ 5σ)
  - Immediate action required
  - Example: Memory leak detected, sensor failure
  
- **WARNING** (confidence ≥ 0.7 or deviation ≥ 3σ)
  - Investigate soon
  - Example: CPU usage elevated, temperature trending up
  
- **INFO** (confidence < 0.7)
  - Informational only
  - Example: Minor deviation, possible false positive

---

## Integration Examples

### 1. System Metrics Integration

```typescript
import { AnomalyDetectionService } from './anomaly';
import { createSystemDataPoint } from './anomaly/utils';
import { getSystemMetrics } from './system/metrics';

// Get system metrics
const metrics = await getSystemMetrics();

// Process through anomaly detection
anomalyService.processDataPoint(
  createSystemDataPoint('cpu_usage', metrics.cpu_usage, '%')
);
anomalyService.processDataPoint(
  createSystemDataPoint('memory_percent', metrics.memory_percent, '%')
);
anomalyService.processDataPoint(
  createSystemDataPoint('cpu_temp', metrics.cpu_temp || 0, '°C')
);
```

### 2. Sensor Data Integration

```typescript
import { createSensorDataPoint } from './anomaly/utils';

// OPC-UA sensor reading
const sensorData = await opcuaAdapter.read();

for (const dataPoint of sensorData) {
  anomalyService.processDataPoint(
    createSensorDataPoint(
      dataPoint.registerName,  // 'temperature', 'humidity', etc.
      dataPoint.value,
      dataPoint.unit,
      dataPoint.deviceName,
      dataPoint.quality
    )
  );
}
```

### 3. MQTT Alert Publishing

```typescript
import mqtt from 'mqtt';

const mqttClient = mqtt.connect('mqtt://mosquitto:1883');

// Subscribe to new alerts
anomalyService.on('alert', (alert) => {
  const topic = `alerts/anomaly/${deviceUuid}`;
  mqttClient.publish(topic, JSON.stringify(alert), { qos: 1 });
});
```

### 4. Cloud Sync

```typescript
// Get all alerts since last sync
const lastSyncTime = await db.get('last_alert_sync');
const alerts = anomalyService.getAlerts(lastSyncTime);

// Upload to cloud API
await fetch(`${cloudApiUrl}/devices/${deviceUuid}/alerts`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ alerts }),
});

// Update last sync time
await db.set('last_alert_sync', Date.now());
```

---

## Testing

### 1. Synthetic Anomaly Injection

Add to docker-compose for testing:

```yaml
environment:
  # Inject gradual temperature drift
  - INJECT_ANOMALY=true
  - ANOMALY_TYPE=drift
  - ANOMALY_METRIC=temperature
  - ANOMALY_RATE=0.1     # +0.1°C per second
  
  # Inject sudden spike
  # - ANOMALY_TYPE=spike
  # - ANOMALY_MAGNITUDE=50  # 50% above normal
  
  # Inject flatline (sensor failure)
  # - ANOMALY_TYPE=flatline
  # - ANOMALY_VALUE=0
```

### 2. Verify Detection

```bash
# Watch agent logs for anomaly alerts
docker logs -f agent-1 | grep "Anomaly detected"

# Subscribe to MQTT alerts
mosquitto_sub -h localhost -p 1883 -t "alerts/anomaly/#" -F "@Y-@m-@dT@H:@M:@S@z : %t : %p"

# Query alert API
curl http://localhost:48481/api/alerts
```

### 3. Performance Profiling

```bash
# Monitor agent memory usage
docker stats agent-1

# Expected:
# MEM USAGE: < 100MB (including buffers)
# CPU: < 5% average
```

---

## Performance Optimization

### 1. Buffer Size Tuning

**Trade-off**: Larger buffers = better accuracy but more memory

```
Window Size    Memory/Metric    Detection Lag
100 samples    ~5KB            Short-term patterns
500 samples    ~25KB           Medium-term trends
1000 samples   ~50KB           Long-term baselines
```

**Recommendation**:
- System metrics (CPU, memory): 100-200 samples
- Environmental sensors: 500-1000 samples
- Slow-changing metrics (pressure): 1000-2000 samples

### 2. Method Selection

**Fast methods** (< 1ms per detection):
- Z-score
- EWMA
- Rate of change

**Slower methods** (1-5ms per detection):
- MAD (requires sorting)
- IQR (requires percentile calculation)

**Recommendation**: Use 2-3 methods max per metric

### 3. Cooldown Tuning

Prevent alert spam while maintaining responsiveness:

```
Metric Type          Cooldown
System (CPU, RAM)    2-5 minutes
Environmental        5-10 minutes
Slow-changing        15-30 minutes
```

---

## Troubleshooting

### High False Positive Rate

**Symptoms**: Many alerts, mostly false

**Solutions**:
1. Increase threshold:
   ```bash
   ANOMALY_ZSCORE_THRESHOLD=4.0  # Instead of 3.0
   ```
2. Increase confidence requirement:
   ```bash
   ANOMALY_ALERT_MIN_CONFIDENCE=0.8  # Instead of 0.7
   ```
3. Increase window size for more stable baseline:
   ```bash
   ANOMALY_WINDOW_SIZE=1000  # Instead of 500
   ```

### Missing Anomalies

**Symptoms**: Known issues not detected

**Solutions**:
1. Decrease threshold (more sensitive):
   ```bash
   ANOMALY_ZSCORE_THRESHOLD=2.5
   ```
2. Add more detection methods:
   ```bash
   ANOMALY_METHODS=zscore,mad,iqr,ewma,rate_change
   ```
3. Check if metric is enabled in config

### High Memory Usage

**Symptoms**: Agent using > 100MB RAM

**Solutions**:
1. Reduce window sizes:
   ```bash
   ANOMALY_WINDOW_SIZE=200  # Instead of 500
   ```
2. Reduce number of tracked metrics
3. Reduce alert queue size:
   ```bash
   ANOMALY_ALERT_MAX_QUEUE=500
   ```

### High CPU Usage

**Symptoms**: Agent using > 10% CPU consistently

**Solutions**:
1. Reduce detection methods (use only zscore + ewma)
2. Increase detection interval (process fewer data points)
3. Disable ML methods:
   ```bash
   ANOMALY_ML_ENABLED=false
   ```

---

## Future Enhancements

### Phase 2: Advanced ML
- K-means clustering for multi-modal detection
- LSTM for time-series prediction
- Federated learning across devices

### Phase 3: Cloud Integration
- Cloud-trained models deployed to edge
- Cross-device correlation
- Predictive maintenance

### Phase 4: Visualization
- Dashboard with alert timeline
- Metric trends with anomaly markers
- ROC curves for tuning thresholds

---

## References

- [ANOMALY-DETECTION-DESIGN.md](./ANOMALY-DETECTION-DESIGN.md) - Detailed architecture
- [MEMORY-LEAK-ANALYSIS.md](./MEMORY-LEAK-ANALYSIS.md) - Memory monitoring integration
- Statistical Methods: Box plot analysis, Welford's algorithm
- ML Methods: EWMA, online learning algorithms
