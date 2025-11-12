# SIMULATION MODE - Unified Testing Framework

**A comprehensive simulation framework for testing agent capabilities without physical hardware or production scenarios.**

## Overview

SIMULATION_MODE provides a unified way to run multiple test scenarios simultaneously:

- **Memory Leak Simulation** - Test memory monitoring and alerting
- **Anomaly Injection** - Validate anomaly detection algorithms
- **Sensor Data Generation** - Simulate sensor readings without hardware
- **Runtime Control** - Start/stop scenarios via API without restart

## Quick Start

### Basic Usage

```bash
# Enable simulation mode with defaults
docker run -e SIMULATION_MODE=true agent

# Or in docker-compose.yml
environment:
  - SIMULATION_MODE=true
```

### Custom Configuration

```bash
# Enable specific scenarios
docker run \
  -e SIMULATION_MODE=true \
  -e SIMULATION_CONFIG='{
    "scenarios": {
      "memory_leak": {
        "enabled": true,
        "type": "gradual",
        "rateMB": 2,
        "maxMB": 50
      },
      "anomaly_injection": {
        "enabled": true,
        "metrics": ["cpu_temp", "memory_percent"],
        "pattern": "spike",
        "intervalMs": 60000
      },
      "sensor_data": {
        "enabled": true,
        "pattern": "realistic",
        "publishIntervalMs": 10000
      }
    }
  }' \
  agent
```

## Available Scenarios

### 1. Memory Leak Simulation

Tests memory monitoring and alerting by intentionally leaking memory.

**Configuration:**
```json
{
  "memory_leak": {
    "enabled": true,
    "type": "gradual",      // gradual | sudden | cyclic
    "rateMB": 1,            // MB to leak per interval
    "intervalMs": 5000,     // Interval between leaks
    "maxMB": 50             // Max MB before stopping
  }
}
```

**Leak Types:**

- **gradual** - Slowly leak memory at constant rate (good for testing alerts)
- **sudden** - Leak large amount immediately then stop (stress test)
- **cyclic** - Leak then release in cycles (test recovery)

**Example Output:**
```
⚠️  SIMULATION MODE ENABLED - FOR TESTING ONLY
   Active scenarios: memory_leak
[Simulation] Memory leak: +1MB (total: 12MB, current: 145MB)
[Simulation] Memory leak: +1MB (total: 13MB, current: 146MB)
```

### 2. Anomaly Injection Simulation

Automatically injects anomalies into metrics for testing detection algorithms.

**Configuration:**
```json
{
  "anomaly_injection": {
    "enabled": true,
    "metrics": ["cpu_usage", "memory_percent", "cpu_temp"],
    "pattern": "spike",     // realistic | spike | drift | cyclic | noisy | faulty | extreme | random
    "intervalMs": 60000,    // How often to inject
    "severity": "warning",  // info | warning | critical
    "magnitude": 3          // Deviation multiplier (1-10)
  }
}
```

**Patterns:**

- **realistic** - Slightly elevated but realistic values
- **spike** - Sudden spikes well above normal (50% per magnitude)
- **drift** - Gradual increase over time
- **cyclic** - Sine wave pattern (repeating cycles)
- **noisy** - Random noise added
- **faulty** - Intermittent bad readings
- **extreme** - Edge case values (95°C, 98% CPU, etc.)
- **random** - Completely random

**Example Output:**
```
[Simulation] Anomaly injected: cpu_temp=85.4°C (threshold: 75°C)
[AnomalyDetection] Alert: cpu_temp anomaly detected (severity: warning)
```

### 3. Sensor Data Simulation

Generates synthetic sensor data for testing without physical hardware.

**Configuration:**
```json
{
  "sensor_data": {
    "enabled": true,
    "sensors": [
      {
        "metric": "temperature",
        "unit": "°C",
        "baseValue": 23.0,
        "variance": 2.0,
        "min": 15,
        "max": 35
      },
      {
        "metric": "humidity",
        "unit": "%",
        "baseValue": 55.0,
        "variance": 10.0,
        "min": 30,
        "max": 80
      }
    ],
    "pattern": "realistic",    // realistic | spike | drift | cyclic | noisy | faulty | extreme | random
    "publishIntervalMs": 10000 // Publish every 10 seconds
  }
}
```

**Example Output:**
```
[Simulation] Sensor data published: temperature=23.8°C, humidity=58.2%
[Simulation] Sensor data published: temperature=24.1°C, humidity=56.7%
```

## Runtime Control API

### Get Simulation Status

```bash
curl http://localhost:48484/v1/simulation/status
```

**Response:**
```json
{
  "enabled": true,
  "activeCount": 2,
  "scenarios": [
    {
      "name": "memory_leak",
      "enabled": true,
      "running": true,
      "startedAt": 1699823400000,
      "stats": {
        "type": "gradual",
        "totalLeakedMB": 12,
        "rateMB": 1,
        "maxMB": 50
      }
    },
    {
      "name": "anomaly_injection",
      "enabled": true,
      "running": true,
      "startedAt": 1699823400000,
      "stats": {
        "metrics": ["cpu_temp", "memory_percent"],
        "pattern": "spike",
        "injectionCount": 5
      }
    }
  ]
}
```

### Start a Specific Scenario

```bash
curl -X POST http://localhost:48484/v1/simulation/scenarios/anomaly_injection/start
```

### Stop a Specific Scenario

```bash
curl -X POST http://localhost:48484/v1/simulation/scenarios/memory_leak/stop
```

### Stop All Scenarios

```bash
curl -X POST http://localhost:48484/v1/simulation/stop-all
```

## Complete Examples

### Example 1: Test Anomaly Detection

```bash
# Start agent with anomaly injection
docker run \
  -e SIMULATION_MODE=true \
  -e SIMULATION_CONFIG='{
    "scenarios": {
      "anomaly_injection": {
        "enabled": true,
        "metrics": ["cpu_temp"],
        "pattern": "spike",
        "intervalMs": 30000,
        "magnitude": 5
      }
    }
  }' \
  agent

# Watch logs for anomaly alerts
docker logs -f agent | grep -E "Anomaly|Alert"
```

### Example 2: Simulate Realistic Sensor Environment

```bash
# Start agent with all sensors
docker run \
  -e SIMULATION_MODE=true \
  -e SIMULATION_CONFIG='{
    "scenarios": {
      "sensor_data": {
        "enabled": true,
        "pattern": "realistic",
        "publishIntervalMs": 5000,
        "sensors": [
          {"metric": "temperature", "unit": "°C", "baseValue": 22, "variance": 1.5},
          {"metric": "humidity", "unit": "%", "baseValue": 60, "variance": 8},
          {"metric": "pressure", "unit": "hPa", "baseValue": 1013, "variance": 3},
          {"metric": "co2", "unit": "ppm", "baseValue": 450, "variance": 50}
        ]
      }
    }
  }' \
  agent
```

### Example 3: Stress Test Memory Monitoring

```bash
# Sudden memory leak
docker run \
  -e SIMULATION_MODE=true \
  -e SIMULATION_CONFIG='{
    "scenarios": {
      "memory_leak": {
        "enabled": true,
        "type": "sudden",
        "maxMB": 100
      }
    }
  }' \
  agent

# Watch memory usage
docker stats agent
```

### Example 4: Combined Testing

```bash
# Run all scenarios simultaneously
docker run \
  -e SIMULATION_MODE=true \
  -e SIMULATION_CONFIG='{
    "scenarios": {
      "memory_leak": {
        "enabled": true,
        "type": "cyclic",
        "rateMB": 2,
        "intervalMs": 10000,
        "maxMB": 30
      },
      "anomaly_injection": {
        "enabled": true,
        "metrics": ["cpu_usage", "cpu_temp"],
        "pattern": "drift",
        "intervalMs": 45000
      },
      "sensor_data": {
        "enabled": true,
        "pattern": "noisy",
        "publishIntervalMs": 8000
      }
    },
    "warningInterval": 60000
  }' \
  agent
```

## docker-compose.yml Example

```yaml
version: '3.8'

services:
  agent:
    image: agent:latest
    environment:
      - SIMULATION_MODE=true
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
              "metrics": ["cpu_temp", "memory_percent"],
              "pattern": "spike",
              "intervalMs": 60000
            }
          }
        }
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SIMULATION_MODE` | Yes | `false` | Master enable flag |
| `SIMULATION_CONFIG` | No | See defaults | JSON configuration for scenarios |

### Legacy Variables (Deprecated)

The following variables still work for backward compatibility but show deprecation warnings:

- `SIMULATE_MEMORY_LEAK=true` → Use `SIMULATION_MODE` instead
- `LEAK_TYPE` → Configure via `SIMULATION_CONFIG`
- `LEAK_RATE_MB` → Configure via `SIMULATION_CONFIG`
- `LEAK_INTERVAL_MS` → Configure via `SIMULATION_CONFIG`
- `LEAK_MAX_MB` → Configure via `SIMULATION_CONFIG`

## Safety Features

### Visual Warnings

When simulation mode is enabled, you'll see prominent warnings:

```
⚠️  SIMULATION MODE ENABLED - FOR TESTING ONLY
   Active scenarios: 3
   - memory_leak (gradual, 2MB/5s, max: 50MB)
   - anomaly_injection (spike pattern, cpu_temp + memory_percent)
   - sensor_data (realistic pattern, 3 sensors, 10s interval)
```

Periodic reminders (default: every 5 minutes):
```
⚠️  SIMULATION MODE ACTIVE
   Active scenarios: memory_leak, anomaly_injection, sensor_data
```

### Production Safety

- Simulations automatically stop on agent shutdown
- All simulated data is tagged: `{ simulation: 'true' }`
- Logs clearly indicate simulated events
- API endpoints require explicit scenario names

## Troubleshooting

### Simulation Not Starting

**Check:**
```bash
# Verify SIMULATION_MODE is set
docker exec agent env | grep SIMULATION

# Check simulation status
curl http://localhost:48484/v1/simulation/status

# View agent logs
docker logs agent | grep -i simulation
```

### No Anomaly Alerts

**Requirements:**
- Anomaly detection must be enabled: `ANOMALY_DETECTION_ENABLED=true`
- Anomaly service needs 10+ samples before detection starts
- Wait ~3-5 minutes after startup for baseline establishment

**Check:**
```bash
# Verify anomaly service is running
curl http://localhost:48484/v1/test/anomaly -X POST -d '{"metric":"cpu_temp","value":95}'

# Check anomaly detection stats
curl http://localhost:48484/v1/anomaly/stats
```

### Memory Leak Not Visible

**Docker Stats:**
```bash
# Watch memory usage in real-time
docker stats agent

# Check if leak is gradual enough
# Default: 1MB/5s = 12MB/minute
```

### JSON Parse Error

**Issue:** `Failed to parse SIMULATION_CONFIG`

**Fix:** Ensure JSON is valid and properly escaped:

```bash
# PowerShell (escape double quotes)
$env:SIMULATION_CONFIG='{"scenarios":{"memory_leak":{"enabled":true}}}'

# Bash (single quotes)
export SIMULATION_CONFIG='{"scenarios":{"memory_leak":{"enabled":true}}}'

# docker-compose.yml (no escaping needed)
environment:
  SIMULATION_CONFIG: >
    {
      "scenarios": {
        "memory_leak": {"enabled": true}
      }
    }
```

## Best Practices

### 1. Start Small

Begin with a single scenario to understand behavior:

```bash
# Just memory leak
SIMULATION_MODE=true
SIMULATION_CONFIG='{"scenarios":{"memory_leak":{"enabled":true}}}'
```

### 2. Use Realistic Patterns for Development

```bash
# Realistic sensor data for UI development
SIMULATION_CONFIG='{
  "scenarios": {
    "sensor_data": {
      "enabled": true,
      "pattern": "realistic",
      "publishIntervalMs": 5000
    }
  }
}'
```

### 3. Use Extreme Patterns for Testing

```bash
# Stress test with extreme values
SIMULATION_CONFIG='{
  "scenarios": {
    "anomaly_injection": {
      "enabled": true,
      "pattern": "extreme",
      "magnitude": 10
    }
  }
}'
```

### 4. Monitor Resource Usage

```bash
# Watch impact of simulations
docker stats agent

# Check for real memory issues
docker exec agent node -e "console.log(process.memoryUsage())"
```

### 5. Clean Shutdown

Always stop simulations gracefully:

```bash
# Stop all simulations before container shutdown
curl -X POST http://localhost:48484/v1/simulation/stop-all

# Then stop container
docker stop agent
```

## Architecture

### File Structure

```
agent/src/simulation/
├── index.ts              # SimulationOrchestrator
├── types.ts              # Type definitions and defaults
└── scenarios/
    ├── memory-leak.ts    # Memory leak patterns
    ├── anomaly.ts        # Anomaly injection
    └── sensor-data.ts    # Sensor data generation
```

### Integration Points

- **Agent Startup** (agent.ts) - Initializes orchestrator after anomaly detection
- **CloudSync** - Receives simulated sensor data for anomaly processing
- **Device API** - Exposes control endpoints (v1.ts)
- **Logging** - All simulation events logged with clear indicators

### Data Flow

```
SimulationOrchestrator
  ├─> MemoryLeakSimulation
  │     └─> Allocates memory (leakedMemory array)
  │
  ├─> AnomalyInjectionSimulation
  │     └─> anomalyService.processDataPoint()
  │           └─> Anomaly detection algorithms
  │                 └─> Alerts generated
  │
  └─> SensorDataSimulation
        └─> anomalyService.processDataPoint()
              └─> Metrics tracking
                    └─> CloudSync reports to cloud
```

## Future Scenarios

Planned additions:

- **Network Degradation** - Simulate latency, packet loss, jitter
- **Container Failures** - Random container crashes and recovery
- **Disk I/O Stress** - High disk usage simulation
- **CPU Spike** - Artificial CPU load generation
- **Database Errors** - Simulated database connection issues

## Support

For issues or questions:

1. Check logs: `docker logs agent | grep -i simulation`
2. Verify status: `curl http://localhost:48484/v1/simulation/status`
3. Review configuration: `docker exec agent env | grep SIMULATION`
4. See [ANOMALY-DETECTION-GUIDE.md](./ANOMALY-DETECTION-GUIDE.md) for anomaly features
