# SIMULATION MODE - Example Configurations

## Example 1: Basic Anomaly Testing

Test anomaly detection with CPU temperature spikes:

```bash
export SIMULATION_MODE=true
export SIMULATION_CONFIG='{
  "scenarios": {
    "anomaly_injection": {
      "enabled": true,
      "metrics": ["cpu_temp"],
      "pattern": "spike",
      "intervalMs": 30000,
      "severity": "warning",
      "magnitude": 5
    }
  }
}'
```

Expected: Anomaly alerts every 30 seconds with cpu_temp spikes around 85-95°C.

---

## Example 2: Realistic Sensor Environment

Simulate a complete sensor setup for UI development:

```bash
export SIMULATION_MODE=true
export SIMULATION_CONFIG='{
  "scenarios": {
    "sensor_data": {
      "enabled": true,
      "pattern": "realistic",
      "publishIntervalMs": 5000,
      "sensors": [
        {
          "metric": "temperature",
          "unit": "°C",
          "baseValue": 22.0,
          "variance": 1.5,
          "min": 15,
          "max": 30
        },
        {
          "metric": "humidity",
          "unit": "%",
          "baseValue": 60.0,
          "variance": 8.0,
          "min": 30,
          "max": 80
        },
        {
          "metric": "pressure",
          "unit": "hPa",
          "baseValue": 1013.25,
          "variance": 3.0,
          "min": 980,
          "max": 1050
        },
        {
          "metric": "co2",
          "unit": "ppm",
          "baseValue": 450,
          "variance": 50,
          "min": 400,
          "max": 2000
        }
      ]
    }
  }
}'
```

Expected: Sensor data published every 5 seconds with realistic variance.

---

## Example 3: Memory Leak Testing

Test memory monitoring with cyclic leak pattern:

```bash
export SIMULATION_MODE=true
export SIMULATION_CONFIG='{
  "scenarios": {
    "memory_leak": {
      "enabled": true,
      "type": "cyclic",
      "rateMB": 2,
      "intervalMs": 10000,
      "maxMB": 30
    }
  }
}'
```

Expected: Memory leaks 2MB every 10s up to 30MB, then releases back to 0MB, repeating.

---

## Example 4: Stress Testing

All scenarios enabled for comprehensive testing:

```bash
export SIMULATION_MODE=true
export SIMULATION_CONFIG='{
  "scenarios": {
    "memory_leak": {
      "enabled": true,
      "type": "gradual",
      "rateMB": 1,
      "intervalMs": 5000,
      "maxMB": 50
    },
    "anomaly_injection": {
      "enabled": true,
      "metrics": ["cpu_usage", "memory_percent", "cpu_temp"],
      "pattern": "drift",
      "intervalMs": 45000,
      "severity": "warning",
      "magnitude": 3
    },
    "sensor_data": {
      "enabled": true,
      "pattern": "noisy",
      "publishIntervalMs": 8000,
      "sensors": [
        {"metric": "temperature", "unit": "°C", "baseValue": 23, "variance": 2},
        {"metric": "humidity", "unit": "%", "baseValue": 55, "variance": 10}
      ]
    }
  },
  "warningInterval": 60000
}'
```

Expected: Memory leak + anomaly drift + noisy sensor data all running simultaneously.

---

## Example 5: Extreme Edge Cases

Test system limits with extreme values:

```bash
export SIMULATION_MODE=true
export SIMULATION_CONFIG='{
  "scenarios": {
    "anomaly_injection": {
      "enabled": true,
      "metrics": ["cpu_temp", "cpu_usage", "memory_percent"],
      "pattern": "extreme",
      "intervalMs": 20000,
      "magnitude": 10
    }
  }
}'
```

Expected: Critical alerts with CPU temp ~95°C, CPU/Memory ~98%.

---

## Example 6: Faulty Sensor Simulation

Simulate intermittent sensor failures:

```bash
export SIMULATION_MODE=true
export SIMULATION_CONFIG='{
  "scenarios": {
    "sensor_data": {
      "enabled": true,
      "pattern": "faulty",
      "publishIntervalMs": 10000,
      "sensors": [
        {"metric": "temperature", "unit": "°C", "baseValue": 23, "variance": 2},
        {"metric": "humidity", "unit": "%", "baseValue": 55, "variance": 10}
      ]
    }
  }
}'
```

Expected: Normal readings 95% of the time, occasional bad readings (5% failure rate).

---

## Example 7: Drift Detection Testing

Test anomaly detection of slow drift:

```bash
export SIMULATION_MODE=true
export SIMULATION_CONFIG='{
  "scenarios": {
    "anomaly_injection": {
      "enabled": true,
      "metrics": ["temperature"],
      "pattern": "drift",
      "intervalMs": 30000,
      "magnitude": 2
    }
  }
}'
```

Expected: Temperature slowly drifts upward over time, triggering drift-based anomaly detection.

---

## Example 8: Cyclic Pattern Testing

Test detection of repeating patterns:

```bash
export SIMULATION_MODE=true
export SIMULATION_CONFIG='{
  "scenarios": {
    "sensor_data": {
      "enabled": true,
      "pattern": "cyclic",
      "publishIntervalMs": 5000,
      "sensors": [
        {"metric": "temperature", "unit": "°C", "baseValue": 23, "variance": 3}
      ]
    }
  }
}'
```

Expected: Sine wave pattern with temperature oscillating ±6°C around 23°C.

---

## Example 9: Docker Compose

```yaml
version: '3.8'

services:
  agent-test:
    image: agent:latest
    environment:
      # Enable simulation
      - SIMULATION_MODE=true
      
      # Enable anomaly detection
      - ANOMALY_DETECTION_ENABLED=true
      
      # Configure simulation
      - SIMULATION_CONFIG={
          "scenarios": {
            "memory_leak": {
              "enabled": true,
              "type": "gradual",
              "rateMB": 1,
              "intervalMs": 5000,
              "maxMB": 50
            },
            "anomaly_injection": {
              "enabled": true,
              "metrics": ["cpu_temp"],
              "pattern": "spike",
              "intervalMs": 60000
            }
          }
        }
    
    ports:
      - "48484:48484"
    
    # Monitor resource usage
    deploy:
      resources:
        limits:
          memory: 512M
```

---

## Example 10: PowerShell Script

```powershell
# simulation-test.ps1

$config = @{
  scenarios = @{
    memory_leak = @{
      enabled = $true
      type = "cyclic"
      rateMB = 2
      intervalMs = 10000
      maxMB = 30
    }
    anomaly_injection = @{
      enabled = $true
      metrics = @("cpu_temp", "memory_percent")
      pattern = "spike"
      intervalMs = 45000
      magnitude = 4
    }
    sensor_data = @{
      enabled = $true
      pattern = "realistic"
      publishIntervalMs = 8000
      sensors = @(
        @{
          metric = "temperature"
          unit = "°C"
          baseValue = 22
          variance = 1.5
        },
        @{
          metric = "humidity"
          unit = "%"
          baseValue = 60
          variance = 8
        }
      )
    }
  }
  warningInterval = 60000
}

$configJson = $config | ConvertTo-Json -Depth 10 -Compress

docker run --rm `
  -e SIMULATION_MODE=true `
  -e "SIMULATION_CONFIG=$configJson" `
  -p 48484:48484 `
  agent:latest

# Monitor status
Start-Sleep -Seconds 10
Invoke-RestMethod -Uri "http://localhost:48484/v1/simulation/status"
```

---

## Example 11: Testing Workflow

Complete testing workflow:

```bash
#!/bin/bash

# 1. Start agent with simulation
docker run -d --name agent-test \
  -e SIMULATION_MODE=true \
  -e SIMULATION_CONFIG='{
    "scenarios": {
      "anomaly_injection": {
        "enabled": true,
        "metrics": ["cpu_temp"],
        "pattern": "spike",
        "intervalMs": 30000
      }
    }
  }' \
  -p 48484:48484 \
  agent:latest

# 2. Wait for startup
sleep 10

# 3. Check simulation status
curl http://localhost:48484/v1/simulation/status

# 4. Monitor logs for anomaly alerts
docker logs -f agent-test | grep -E "Anomaly|Alert"

# 5. Stop simulation after 5 minutes
sleep 300
curl -X POST http://localhost:48484/v1/simulation/stop-all

# 6. Check final stats
curl http://localhost:48484/v1/anomaly/stats

# 7. Cleanup
docker stop agent-test
docker rm agent-test
```

---

## Runtime Control Examples

### Start Individual Scenario

```bash
# Start memory leak simulation
curl -X POST http://localhost:48484/v1/simulation/scenarios/memory_leak/start

# Start anomaly injection
curl -X POST http://localhost:48484/v1/simulation/scenarios/anomaly_injection/start

# Start sensor data
curl -X POST http://localhost:48484/v1/simulation/scenarios/sensor_data/start
```

### Stop Individual Scenario

```bash
curl -X POST http://localhost:48484/v1/simulation/scenarios/memory_leak/stop
```

### Check Status

```bash
# Get full status
curl http://localhost:48484/v1/simulation/status | jq

# Get active scenario count
curl http://localhost:48484/v1/simulation/status | jq '.activeCount'

# Get specific scenario stats
curl http://localhost:48484/v1/simulation/status | jq '.scenarios[] | select(.name == "memory_leak")'
```

### Stop All Scenarios

```bash
curl -X POST http://localhost:48484/v1/simulation/stop-all
```
