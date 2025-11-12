# Simulation Framework

Unified testing framework for agent capabilities without physical hardware.

## Architecture

### SimulationOrchestrator

Central controller that manages multiple simulation scenarios:

- Loads configuration from environment variables
- Initializes enabled scenarios
- Coordinates scenario lifecycle (start/stop)
- Provides runtime status and control
- Emits periodic warnings when active

### Scenario Interface

All scenarios implement the `SimulationScenario` interface:

```typescript
interface SimulationScenario {
  name: string;
  description: string;
  enabled: boolean;
  
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): SimulationScenarioStatus;
  updateConfig?(config: any): Promise<void>;
}
```

### Built-in Scenarios

#### 1. Memory Leak Simulation

**Purpose:** Test memory monitoring and alerting

**Patterns:**
- `gradual` - Constant leak rate (good for alerts)
- `sudden` - Immediate large leak (stress test)
- `cyclic` - Leak then release cycles (recovery test)

**Implementation:** `scenarios/memory-leak.ts`

#### 2. Anomaly Injection Simulation

**Purpose:** Validate anomaly detection algorithms

**Patterns:**
- `realistic` - Slightly elevated values
- `spike` - Sudden spikes (50% per magnitude)
- `drift` - Gradual increase over time
- `cyclic` - Repeating sine wave
- `noisy` - Random noise
- `faulty` - Intermittent failures
- `extreme` - Edge case values
- `random` - Completely random

**Implementation:** `scenarios/anomaly.ts`

#### 3. Sensor Data Simulation

**Purpose:** Generate synthetic sensor readings

**Patterns:**
- `realistic` - Normal distribution around base value
- `spike` - Occasional spikes (10% chance)
- `drift` - Slow drift over time
- `cyclic` - Sine wave pattern
- `noisy` - High variance random
- `faulty` - 5% failure rate
- `extreme` - Edge case values (min/max)
- `random` - Random within range

**Implementation:** `scenarios/sensor-data.ts`

## Usage

### Environment Variables

```bash
# Enable simulation mode
SIMULATION_MODE=true

# Configure scenarios (JSON)
SIMULATION_CONFIG='{
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
      "intervalMs": 60000,
      "magnitude": 3
    },
    "sensor_data": {
      "enabled": true,
      "pattern": "realistic",
      "publishIntervalMs": 10000
    }
  },
  "warningInterval": 300000
}'
```

### API Endpoints

```bash
# Get status
GET /v1/simulation/status

# Start scenario
POST /v1/simulation/scenarios/memory_leak/start

# Stop scenario
POST /v1/simulation/scenarios/memory_leak/stop

# Stop all
POST /v1/simulation/stop-all
```

## Adding New Scenarios

1. **Create scenario class** in `scenarios/`:

```typescript
import type { SimulationScenario, SimulationScenarioStatus } from '../types';

export class MySimulation implements SimulationScenario {
  name = 'my_simulation';
  description = 'Description of simulation';
  enabled = false;
  
  private running = false;
  private startedAt?: number;
  
  constructor(config: MyConfig, logger?: AgentLogger) {
    this.config = config;
    this.logger = logger;
    this.enabled = config.enabled;
  }
  
  async start(): Promise<void> {
    // Start simulation
  }
  
  async stop(): Promise<void> {
    // Stop simulation
  }
  
  getStatus(): SimulationScenarioStatus {
    return {
      name: this.name,
      enabled: this.enabled,
      running: this.running,
      startedAt: this.startedAt,
      stats: { /* scenario-specific stats */ }
    };
  }
}
```

2. **Add config type** to `types.ts`:

```typescript
export interface MySimulationConfig {
  enabled: boolean;
  // scenario-specific config
}

export const DEFAULT_MY_CONFIG: MySimulationConfig = {
  enabled: false,
  // defaults
};
```

3. **Register in orchestrator** (`index.ts`):

```typescript
import { MySimulation } from './scenarios/my-simulation';

// In initializeScenarios():
if (this.config.scenarios.my_simulation) {
  const myConfig = {
    ...DEFAULT_MY_CONFIG,
    ...this.config.scenarios.my_simulation,
  };
  
  const scenario = new MySimulation(myConfig, this.logger);
  this.scenarios.set('my_simulation', scenario);
}
```

4. **Update SimulationConfig type**:

```typescript
export interface SimulationConfig {
  enabled: boolean;
  scenarios: {
    memory_leak?: MemoryLeakSimulationConfig;
    anomaly_injection?: AnomalySimulationConfig;
    sensor_data?: SensorDataSimulationConfig;
    my_simulation?: MySimulationConfig; // Add here
  };
  // ...
}
```

## Best Practices

### Logging

Use AgentLogger with appropriate log levels:

```typescript
this.logger?.warnSync('Starting simulation', {
  component: LogComponents.metrics,
  scenario: this.name
});

this.logger?.debugSync('Simulation step', {
  component: LogComponents.metrics,
  value: currentValue
});
```

### Resource Cleanup

Always clean up resources in `stop()`:

```typescript
async stop(): Promise<void> {
  if (this.interval) {
    clearInterval(this.interval);
    this.interval = undefined;
  }
  
  // Clean up any allocated resources
  this.data = [];
  
  this.running = false;
}
```

### Error Handling

Don't throw errors that crash the agent:

```typescript
try {
  await this.doSimulationStep();
} catch (error) {
  this.logger?.errorSync(
    'Simulation step failed',
    error as Error,
    { component: LogComponents.metrics }
  );
  // Continue running or stop gracefully
}
```

### State Tracking

Track simulation state for status reporting:

```typescript
private stats = {
  iterations: 0,
  successCount: 0,
  errorCount: 0
};

getStatus(): SimulationScenarioStatus {
  return {
    name: this.name,
    enabled: this.enabled,
    running: this.running,
    startedAt: this.startedAt,
    stats: this.stats
  };
}
```

## Testing

### Unit Tests

Test scenarios in isolation:

```typescript
describe('MySimulation', () => {
  it('should start and stop', async () => {
    const scenario = new MySimulation(config, logger);
    await scenario.start();
    expect(scenario.getStatus().running).toBe(true);
    
    await scenario.stop();
    expect(scenario.getStatus().running).toBe(false);
  });
});
```

### Integration Tests

Test with orchestrator:

```typescript
describe('SimulationOrchestrator', () => {
  it('should start all enabled scenarios', async () => {
    const config = {
      enabled: true,
      scenarios: {
        my_simulation: { enabled: true }
      }
    };
    
    const orchestrator = new SimulationOrchestrator(config, deps);
    await orchestrator.start();
    
    const status = orchestrator.getStatus();
    expect(status.activeCount).toBe(1);
  });
});
```

## Backward Compatibility

Legacy environment variables are still supported with deprecation warnings:

```typescript
// Old way (deprecated)
SIMULATE_MEMORY_LEAK=true
LEAK_TYPE=gradual

// New way
SIMULATION_MODE=true
SIMULATION_CONFIG='{"scenarios":{"memory_leak":{"enabled":true,"type":"gradual"}}}'
```

The orchestrator automatically converts legacy variables:

```typescript
if (process.env.SIMULATE_MEMORY_LEAK === 'true') {
  console.warn('⚠️  SIMULATE_MEMORY_LEAK is deprecated. Use SIMULATION_MODE instead.');
  // Auto-convert to new format
}
```

## Dependencies

Scenarios can depend on agent services:

```typescript
export interface SimulationDependencies {
  logger?: AgentLogger;
  anomalyService?: AnomalyDetectionService;
  deviceUuid?: string;
}
```

Pass dependencies via constructor:

```typescript
const scenario = new AnomalyInjectionSimulation(
  config,
  dependencies.anomalyService,
  dependencies.logger
);
```

## Safety Features

1. **Visual warnings** - Prominent logs when simulation is active
2. **Periodic reminders** - Configurable warning interval (default: 5 min)
3. **Tagged data** - All simulated data tagged with `{ simulation: 'true' }`
4. **Graceful shutdown** - All scenarios stop on agent shutdown
5. **Runtime control** - Start/stop scenarios without restart

## See Also

- [SIMULATION-MODE.md](../../docs/SIMULATION-MODE.md) - Complete user guide
- [ANOMALY-DETECTION-GUIDE.md](../../docs/ANOMALY-DETECTION-GUIDE.md) - Anomaly detection integration
- [types.ts](./types.ts) - Type definitions and defaults
