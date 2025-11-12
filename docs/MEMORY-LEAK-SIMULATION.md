# Memory Leak Simulation Guide

## Overview

The agent includes a memory leak simulation feature for testing memory monitoring, alerting, and recovery mechanisms under realistic conditions. This is **for testing only** and should never be enabled in production.

## Environment Variables

### Enable/Disable Simulation

```bash
SIMULATE_MEMORY_LEAK=true  # Enable simulation (default: false)
```

### Leak Patterns

```bash
LEAK_TYPE=gradual|sudden|cyclic  # Leak pattern (default: gradual)
```

**Leak Types**:

1. **`gradual`** - Slowly leak memory at constant rate
   - Simulates: Event listener accumulation, cache growth, buffer leaks
   - Behavior: Adds `LEAK_RATE_MB` every `LEAK_INTERVAL_MS`
   - Stops: When `LEAK_MAX_MB` reached

2. **`sudden`** - Immediate large memory spike
   - Simulates: Large file load, massive data processing, config bloat
   - Behavior: Leaks `LEAK_MAX_MB` immediately, then stops
   - Use case: Testing threshold breach alerting

3. **`cyclic`** - Leak and release in cycles
   - Simulates: Periodic tasks that don't fully cleanup, GC pressure
   - Behavior: Leaks to `LEAK_MAX_MB/2`, then releases, repeats
   - Use case: Testing monitoring under variable memory pressure

### Leak Configuration

```bash
LEAK_RATE_MB=1          # MB to leak per interval (default: 1)
LEAK_INTERVAL_MS=5000   # Interval between leaks in ms (default: 5000)
LEAK_MAX_MB=50          # Maximum MB to leak (default: 50)
```

## Usage Examples

### Example 1: Test Gradual Leak Detection

Simulate slow memory growth over 5 minutes:

```yaml
# docker-compose.yml
environment:
  - SIMULATE_MEMORY_LEAK=true
  - LEAK_TYPE=gradual
  - LEAK_RATE_MB=1           # Leak 1MB every 5 seconds
  - LEAK_INTERVAL_MS=5000
  - LEAK_MAX_MB=30           # Total 30MB leak
  - MEMORY_THRESHOLD_MB=15   # Alert at 15MB growth
```

**Expected behavior**:
- Memory baseline: ~44MB (startup)
- Leak starts: After 30s (baseline established)
- Alert triggers: ~75s after start (15MB threshold)
- Simulation stops: ~150s after start (30MB max)

### Example 2: Test Sudden Spike Alerting

Simulate immediate memory spike:

```yaml
environment:
  - SIMULATE_MEMORY_LEAK=true
  - LEAK_TYPE=sudden
  - LEAK_MAX_MB=50           # Immediate 50MB spike
  - MEMORY_THRESHOLD_MB=15
```

**Expected behavior**:
- Memory baseline: ~44MB
- Leak starts: After 30s
- Alert triggers: Immediately (50MB > 15MB threshold)
- Container behavior: May trigger OOM if spike exceeds 512MB limit

### Example 3: Test Cyclic Memory Patterns

Simulate variable memory pressure:

```yaml
environment:
  - SIMULATE_MEMORY_LEAK=true
  - LEAK_TYPE=cyclic
  - LEAK_RATE_MB=2           # Leak/release 2MB per cycle
  - LEAK_INTERVAL_MS=3000    # Every 3 seconds
  - LEAK_MAX_MB=40           # Cycle range: 0-20MB
```

**Expected behavior**:
- Leaks from 0 → 20MB (10 cycles)
- Releases from 20MB → 0MB (10 cycles)
- Repeats indefinitely
- Alert triggers if peak exceeds threshold

## Testing Workflow

### 1. Start Agent with Simulation

```powershell
# Edit docker-compose.yml to enable simulation
# See examples above

# Rebuild and start agent-1
docker-compose up -d --build agent-1
```

### 2. Monitor Memory Usage

```powershell
# Real-time memory stats
docker stats agent-1

# Watch for threshold alerts in logs
docker logs -f agent-1 | Select-String "Memory threshold|leak simulation"
```

### 3. Verify Alerting

Check logs for:
- ✅ Simulation start message
- ✅ Memory baseline established (~30s after start)
- ✅ Leak progress (debug level logs)
- ✅ Threshold breach alert (error level)
- ✅ Simulation stop message

### 4. Test Recovery

**Scheduled Restart** (cloud-controlled):
```json
// Target state config
{
  "config": {
    "settings": {
      "scheduledRestart": {
        "enabled": true,
        "intervalDays": 1
      }
    }
  }
}
```

**Manual Restart**:
```powershell
docker-compose restart agent-1
```

**Container Kill** (OOM):
```yaml
# Set memory limit lower than leak max
mem_limit: 128m
```

## Expected Log Output

### Simulation Start
```
⚠️ MEMORY LEAK SIMULATION ENABLED - FOR TESTING ONLY
{
  component: 'metrics',
  type: 'gradual',
  rateMB: 1,
  intervalMs: 5000,
  maxMB: 50
}
```

### Baseline Established
```
Memory baseline established
{
  component: 'metrics',
  baselineMB: '44.83',
  uptimeSeconds: 20
}
```

### Leak Progress (Debug Level)
```
Gradual leak simulation
{
  component: 'metrics',
  leakedThisCycleMB: 1,
  totalLeakedMB: 15,
  currentMemoryMB: '59.83'
}
```

### Threshold Breach
```
Memory growth exceeds threshold
{
  component: 'metrics',
  initialMB: '44.83',
  currentMB: '60.12',
  growthMB: '15.29',
  thresholdMB: '15.00',
  uptimeSeconds: 75
}

Memory threshold breached - agent may need restart
{
  component: 'agent',
  thresholdMB: 15,
  action: 'Consider restarting agent or investigating memory leak'
}
```

### Simulation Stop
```
Memory leak simulation reached max - stopping
{
  component: 'metrics',
  totalLeakedMB: 50,
  currentMemoryMB: '94.83'
}

Stopped memory leak simulation
{
  component: 'metrics',
  clearedObjects: 51200
}
```

## Docker Stats Example

```
NAME      MEM USAGE / LIMIT   MEM %     CPU %
agent-1   44.83MiB / 512MiB   8.76%     0.48%    # Baseline
agent-1   59.12MiB / 512MiB   11.55%    0.52%    # After 15MB leak
agent-1   94.83MiB / 512MiB   18.52%    0.61%    # After 50MB leak
agent-1   44.83MiB / 512MiB   8.76%     0.45%    # After restart
```

## Safety Features

1. **30-second delay**: Simulation starts 30s after agent boot to allow baseline establishment
2. **Auto-stop**: Gradual/sudden modes stop at `LEAK_MAX_MB`
3. **Cleanup on stop**: All leaked objects released when simulation stops
4. **Container restart**: Docker restart policy brings agent back after OOM kill

## Disable Simulation

Set `SIMULATE_MEMORY_LEAK=false` or remove environment variable:

```yaml
environment:
  - SIMULATE_MEMORY_LEAK=false  # Explicit disable
  # Or just remove the variable entirely
```

## Integration with Monitoring

The simulation works seamlessly with:
- ✅ Active memory monitoring (`startMemoryMonitoring`)
- ✅ Memory threshold alerting (callback invocation)
- ✅ Cloud-controlled scheduled restarts
- ✅ Docker memory limits (`mem_limit`)
- ✅ Structured logging (AgentLogger)

## Production Reminder

**⚠️ NEVER enable simulation in production!**

This feature is for:
- Development testing
- CI/CD validation
- Load testing environments
- Memory monitoring QA

Always verify `SIMULATE_MEMORY_LEAK=false` before deploying to production devices.

## Related Documentation

- [MEMORY-LEAK-ANALYSIS.md](./MEMORY-LEAK-ANALYSIS.md) - Memory leak vulnerability analysis
- [AGENT-LOGGING-ANALYSIS.md](./AGENT-LOGGING-ANALYSIS.md) - Logging architecture
- [docker-compose.yml](../docker-compose.yml) - Agent configuration
