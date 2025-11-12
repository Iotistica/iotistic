# Edge-Based Anomaly Pre-Detection System

## Executive Summary

Lightweight anomaly detection system for IoT edge devices (Raspberry Pi) that detects unusual patterns in sensor data, system metrics, and device behavior **before** they cause failures.

**Key Features**:
- Statistical anomaly detection (Z-score, MAD, EWMA)
- Lightweight ML (Online Learning, micro models)
- Edge-appropriate (< 50MB RAM, < 5% CPU)
- Real-time alerting via MQTT
- Cloud integration for training/tuning

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        EDGE DEVICE (Agent)                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Sensors    │  │   Metrics    │  │   Memory     │          │
│  │  (OPC-UA,    │  │  (CPU, RAM,  │  │  Monitor     │          │
│  │  Modbus,     │  │   Disk,      │  │             │          │
│  │   CAN)       │  │   Network)   │  │             │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                  │
│         └──────────────────┴──────────────────┘                  │
│                            │                                     │
│                   ┌────────▼─────────┐                          │
│                   │  Data Collector   │                          │
│                   │  (Unified Queue)  │                          │
│                   └────────┬─────────┘                          │
│                            │                                     │
│         ┌──────────────────┴───────────────────┐                │
│         │                                       │                │
│    ┌────▼────────────┐              ┌──────────▼─────────┐     │
│    │   Statistical    │              │   ML Detector       │     │
│    │   Detector       │              │   (Online Learning) │     │
│    │  - Z-score       │              │  - EWMA             │     │
│    │  - MAD           │              │  - Moving Average   │     │
│    │  - IQR           │              │  - Simple Clusters  │     │
│    │  - Rate Change   │              │                     │     │
│    └────┬────────────┘              └──────────┬─────────┘     │
│         │                                       │                │
│         └──────────────────┬────────────────────┘                │
│                            │                                     │
│                   ┌────────▼─────────┐                          │
│                   │  Alert Manager    │                          │
│                   │  - Deduplication  │                          │
│                   │  - Prioritization │                          │
│                   │  - Rate Limiting  │                          │
│                   └────────┬─────────┘                          │
│                            │                                     │
│         ┌──────────────────┴───────────────────┐                │
│         │                                       │                │
│    ┌────▼────────┐                    ┌────────▼─────────┐     │
│    │    MQTT      │                    │   Cloud Sync     │     │
│    │  (Alerts)    │                    │   (Training)     │     │
│    └──────────────┘                    └──────────────────┘     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Anomaly Detection Strategies

### 1. Statistical Methods (Primary - Lightweight)

**Z-Score Detection**:
- Tracks rolling mean and standard deviation
- Flags values > 3σ from mean
- Window: 100-500 samples (configurable)
- RAM: ~5KB per metric
- Good for: Gradual drift, outliers

**MAD (Median Absolute Deviation)**:
- More robust to outliers than Z-score
- Uses median instead of mean
- Flags values > 3 MAD from median
- RAM: ~10KB per metric
- Good for: Noisy sensors, sporadic spikes

**IQR (Interquartile Range)**:
- Detects outliers using Q1, Q3 quartiles
- Flags values outside [Q1 - 1.5×IQR, Q3 + 1.5×IQR]
- RAM: ~8KB per metric
- Good for: Skewed distributions

**Rate of Change**:
- Tracks velocity and acceleration
- Alerts on sudden changes (> threshold/second)
- RAM: ~2KB per metric
- Good for: Sudden failures, sensor disconnects

### 2. Lightweight ML (Secondary - Advanced)

**EWMA (Exponentially Weighted Moving Average)**:
- Online learning, no batch storage needed
- Smooth curve follows trends
- Alert when deviation exceeds band
- RAM: ~1KB per metric
- Good for: Trending data, seasonal patterns

**Simple K-Means Clustering**:
- 3-5 clusters max (edge-appropriate)
- Detects data point distance from cluster centers
- Periodic retraining (hourly/daily)
- RAM: ~20KB per metric
- Good for: Multi-modal distributions, categorization

**Sliding Window Correlation**:
- Detects relationships between metrics
- Alerts when correlation breaks (sensor failure)
- Window: 50-100 samples
- RAM: ~15KB per pair
- Good for: Sensor consistency checks

---

## Data Flow

### 1. Data Collection
```typescript
// Unified data point interface
interface DataPoint {
  source: 'sensor' | 'system' | 'container';
  metric: string;           // e.g., 'temperature', 'cpu_usage'
  value: number;
  unit: string;
  timestamp: number;
  deviceId?: string;
  quality?: 'GOOD' | 'BAD' | 'UNCERTAIN';
}
```

### 2. Detection Pipeline
```
Data Point → Normalize → Statistical Tests → ML Tests → Score → Alert
                ↓
            Historical
            Buffer
            (SQLite)
```

### 3. Alert Generation
```typescript
interface AnomalyAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  metric: string;
  value: number;
  expectedRange: [number, number];
  deviation: number;           // Standard deviations from normal
  detectionMethod: string;     // 'z-score', 'mad', 'ewma', etc.
  timestamp: number;
  confidence: number;          // 0-1
  context: {
    recent_values: number[];
    baseline: number;
    trend: 'increasing' | 'decreasing' | 'stable';
  };
}
```

---

## Memory & Performance Budget

**Target Device**: Raspberry Pi 4 (2GB RAM), 4 cores @ 1.5GHz

**Budget Allocation**:
- Statistical buffers: 20MB (100 metrics × 500 samples × 8 bytes)
- ML models: 10MB (50 metrics × 200KB per model)
- Alert queue: 5MB (1000 alerts × 5KB)
- Overhead: 15MB
- **Total: ~50MB**

**CPU Budget**:
- Statistical detection: 1-2% (every 5s)
- ML inference: 2-3% (every 30s)
- Data collection: < 1% (continuous)
- **Total: < 5% average**

**Storage**:
- Historical data: 100MB (rolling 30 days in SQLite)
- Model checkpoints: 20MB (persistent)
- Configuration: 1MB

---

## Detection Scenarios

### Scenario 1: Gradual Sensor Drift
**Example**: Temperature sensor reading drifts +0.1°C/hour
- **Detection**: Z-score + EWMA
- **Time to Alert**: 2-4 hours (depends on baseline)
- **Confidence**: High (> 0.9)
- **Action**: Alert operator, suggest calibration

### Scenario 2: Sudden Sensor Failure
**Example**: Pressure sensor returns -999 (error code)
- **Detection**: Rate of Change + IQR
- **Time to Alert**: < 1 minute
- **Confidence**: Very High (> 0.95)
- **Action**: Mark sensor as BAD quality, failover if available

### Scenario 3: Memory Leak
**Example**: Agent RSS grows 5MB/hour
- **Detection**: Linear regression on memory trend
- **Time to Alert**: 1-2 hours
- **Confidence**: High (> 0.85)
- **Action**: Trigger cloud-scheduled restart

### Scenario 4: Network Degradation
**Example**: Packet loss increases from 0% to 5%
- **Detection**: Z-score on network metrics
- **Time to Alert**: 5-10 minutes
- **Confidence**: Medium (> 0.7)
- **Action**: Alert admin, log diagnostics

### Scenario 5: Correlated Sensor Failure
**Example**: Temp + Humidity sensors both flatline
- **Detection**: Correlation monitoring
- **Time to Alert**: < 2 minutes
- **Confidence**: High (> 0.9)
- **Action**: Device health check, sensor validation

### Scenario 6: Seasonal Pattern Break
**Example**: HVAC energy usage doesn't follow daily cycle
- **Detection**: EWMA with seasonal adjustment
- **Time to Alert**: 4-8 hours
- **Confidence**: Medium (> 0.75)
- **Action**: HVAC system diagnostics

---

## Configuration

### Environment Variables
```bash
# Enable/disable detection
ANOMALY_DETECTION_ENABLED=true

# Detection methods (comma-separated)
ANOMALY_METHODS=zscore,mad,ewma,rate_change

# Sensitivity (1-10, higher = more sensitive)
ANOMALY_SENSITIVITY=5

# Statistical parameters
ANOMALY_WINDOW_SIZE=500          # Samples for rolling calculations
ANOMALY_ZSCORE_THRESHOLD=3.0     # Standard deviations
ANOMALY_MAD_THRESHOLD=3.0        # MAD multiplier
ANOMALY_RATE_THRESHOLD=10.0      # % change per second

# ML parameters
ANOMALY_ML_ENABLED=true
ANOMALY_ML_TRAINING_INTERVAL=3600000  # 1 hour
ANOMALY_ML_CONFIDENCE_THRESHOLD=0.7

# Alert configuration
ANOMALY_ALERT_MIN_CONFIDENCE=0.7
ANOMALY_ALERT_COOLDOWN_MS=300000     # 5 min per metric
ANOMALY_ALERT_MAX_QUEUE=1000

# Storage
ANOMALY_HISTORY_DAYS=30
ANOMALY_DB_PATH=/app/data/anomaly.db

# MQTT alerts
ANOMALY_MQTT_TOPIC=alerts/anomaly/{deviceId}
ANOMALY_MQTT_ENABLED=true

# Cloud integration
ANOMALY_CLOUD_SYNC=true
ANOMALY_CLOUD_SYNC_INTERVAL=3600000  # 1 hour
```

### Target State Configuration
```json
{
  "config": {
    "anomalyDetection": {
      "enabled": true,
      "methods": ["zscore", "mad", "ewma"],
      "sensitivity": 5,
      "metrics": [
        {
          "name": "temperature",
          "threshold": 3.0,
          "windowSize": 500,
          "expectedRange": [15, 30]
        },
        {
          "name": "cpu_usage",
          "threshold": 2.5,
          "windowSize": 100,
          "expectedRange": [0, 80]
        },
        {
          "name": "memory_percent",
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

## Alert Prioritization

### Severity Levels
- **INFO** (0.5-0.7): Minor deviation, informational
- **WARNING** (0.7-0.85): Moderate deviation, investigate
- **CRITICAL** (0.85-1.0): Severe deviation, immediate action

### Priority Factors
1. **Confidence Score**: Higher confidence = higher priority
2. **Metric Impact**: Critical metrics (memory, CPU) > sensors
3. **Trend**: Worsening trend increases priority
4. **History**: Repeated anomalies escalate severity
5. **Correlation**: Multiple correlated anomalies increase priority

### Deduplication
- Same metric + similar value within 5 minutes → deduplicate
- Track alert fingerprint: `hash(metric, method, severity)`
- Suppress duplicates, increment counter instead

---

## Cloud Integration

### Cloud-Side Training (Optional)
- Edge collects labeled data (normal/anomaly)
- Cloud trains better models using full dataset
- Downloads updated thresholds/models to edge
- Feedback loop improves detection accuracy

### Federated Learning (Future)
- Multiple devices contribute to shared model
- Privacy-preserving (only gradients uploaded)
- Cloud aggregates and distributes improvements

---

## Testing Strategy

### 1. Synthetic Anomaly Injection
```bash
# Inject gradual drift
INJECT_ANOMALY=true
ANOMALY_TYPE=drift
ANOMALY_METRIC=temperature
ANOMALY_RATE=0.1     # +0.1 units/second

# Inject sudden spike
ANOMALY_TYPE=spike
ANOMALY_MAGNITUDE=50  # 50% above normal

# Inject flatline
ANOMALY_TYPE=flatline
ANOMALY_VALUE=0
```

### 2. Unit Tests
- Statistical calculations (Z-score, MAD, IQR)
- Alert generation and deduplication
- Buffer management (memory limits)
- Configuration parsing

### 3. Integration Tests
- End-to-end pipeline with real sensor data
- MQTT alert delivery
- Cloud sync
- Performance benchmarks (CPU, RAM)

---

## Performance Optimization

### 1. Incremental Statistics
- Update mean/variance incrementally (Welford's algorithm)
- Avoid recomputing entire buffer each iteration
- O(1) per sample instead of O(n)

### 2. Circular Buffers
- Fixed-size arrays, no dynamic allocation
- Overwrite oldest values
- Constant memory footprint

### 3. Lazy Evaluation
- Only compute statistics when needed (on query)
- Cache results, invalidate on new data
- Reduce unnecessary calculations

### 4. Batching
- Process multiple data points together
- Vectorized operations where possible
- Reduce function call overhead

---

## Rollout Plan

### Phase 1: Statistical Detection (Week 1)
- Implement Z-score, MAD, IQR detectors
- SQLite storage for historical data
- Basic MQTT alerting
- Testing with simulated anomalies

### Phase 2: Rate Change & Correlation (Week 2)
- Rate of change detector
- Pairwise correlation monitoring
- Alert prioritization and deduplication
- Integration with existing memory monitoring

### Phase 3: Lightweight ML (Week 3)
- EWMA implementation
- Simple k-means clustering
- Cloud sync for model training
- Performance profiling and optimization

### Phase 4: Production Deployment (Week 4)
- Documentation and configuration guide
- Edge device testing (Raspberry Pi)
- Cloud dashboard for alerts
- Feedback collection and tuning

---

## Success Metrics

- **Detection Rate**: > 90% of injected anomalies detected
- **False Positive Rate**: < 5% of normal data flagged
- **Time to Detection**: < 5 minutes for sudden anomalies, < 2 hours for gradual
- **Resource Usage**: < 50MB RAM, < 5% CPU
- **Availability**: 99.9% uptime (detection service)

---

## References

- **Statistical Methods**: Box plot analysis, Tukey's method for outliers
- **Online Learning**: Welford's algorithm, EWMA
- **Edge ML**: TinyML, micro models for IoT
- **Anomaly Detection**: [Chandola et al., ACM Survey 2009]
