# SIMULATION MODE - Quick Test Commands
# =======================================

## METHOD 1: Test with existing docker-compose setup (RECOMMENDED)
## ----------------------------------------------------------------

# 1. Start agent-1 (already configured with SIMULATION_MODE=true)
docker-compose up -d --build agent-1

# 2. Wait 15 seconds for startup
Start-Sleep -Seconds 15

# 3. Check simulation status
Invoke-RestMethod http://localhost:48481/v1/simulation/status | ConvertTo-Json -Depth 5

# 4. Watch logs for simulation activity
docker logs -f agent-1
# Look for:
#   ⚠️  SIMULATION MODE ENABLED - FOR TESTING ONLY
#   [Simulation] Sensor data published: temperature=23.8°C
#   [Simulation] Anomaly injected: cpu_temp=85.4°C

# 5. Check metrics report (includes anomaly data + predictions)
docker logs agent-1 | Select-String "Metrics Report" -Context 0,30 | Select-Object -First 1


## METHOD 2: Test individual scenarios via API
## --------------------------------------------

# Start memory leak simulation
Invoke-RestMethod -Uri http://localhost:48481/v1/simulation/scenarios/memory_leak/start -Method Post

# Watch memory leak in action
docker stats agent-1

# Stop memory leak
Invoke-RestMethod -Uri http://localhost:48481/v1/simulation/scenarios/memory_leak/stop -Method Post


## METHOD 3: Test with custom configuration
## -----------------------------------------

# Create a test container with specific simulation config
docker run -d --name agent-sim-test `
  -e SIMULATION_MODE=true `
  -e ANOMALY_DETECTION_ENABLED=true `
  -e "SIMULATION_CONFIG={\"scenarios\":{\"memory_leak\":{\"enabled\":true,\"type\":\"cyclic\",\"rateMB\":2,\"intervalMs\":10000,\"maxMB\":30}}}" `
  -p 48490:48484 `
  agent:latest

# Watch logs
docker logs -f agent-sim-test

# Check status
Invoke-RestMethod http://localhost:48490/v1/simulation/status

# Cleanup
docker stop agent-sim-test
docker rm agent-sim-test


## METHOD 4: Run the automated test script
## ----------------------------------------

# Execute comprehensive test script
.\test-simulation.ps1


## USEFUL MONITORING COMMANDS
## --------------------------

# View all simulation logs
docker logs agent-1 | Select-String "SIMULATION|Simulation|Anomaly"

# View anomaly alerts only
docker logs agent-1 | Select-String "Alert|anomaly detected"

# View sensor data generation
docker logs agent-1 | Select-String "Sensor data published"

# View metrics reports with predictions
docker logs agent-1 | Select-String "Metrics Report" -Context 0,30

# Monitor memory usage
docker stats agent-1

# Watch live logs with filtering
docker logs -f agent-1 2>&1 | Select-String "Simulation|Anomaly|Sensor"


## API ENDPOINTS
## -------------

# Get simulation status
Invoke-RestMethod http://localhost:48481/v1/simulation/status

# Start specific scenario
Invoke-RestMethod -Uri http://localhost:48481/v1/simulation/scenarios/anomaly_injection/start -Method Post
Invoke-RestMethod -Uri http://localhost:48481/v1/simulation/scenarios/sensor_data/start -Method Post
Invoke-RestMethod -Uri http://localhost:48481/v1/simulation/scenarios/memory_leak/start -Method Post

# Stop specific scenario
Invoke-RestMethod -Uri http://localhost:48481/v1/simulation/scenarios/anomaly_injection/stop -Method Post

# Stop all scenarios
Invoke-RestMethod -Uri http://localhost:48481/v1/simulation/stop-all -Method Post


## EXPECTED OUTPUT EXAMPLES
## -------------------------

# Startup logs should show:
⚠️  SIMULATION MODE ENABLED - FOR TESTING ONLY
   Active scenarios: anomaly_injection, sensor_data

# Simulation logs:
[Simulation] Sensor data published: temperature=23.8°C, humidity=58.2%
[Simulation] Anomaly injected: cpu_temp=85.4°C (threshold: 75°C)

# Metrics report with anomaly data:
Metrics Report {
  "anomaly_detection": {
    "enabled": true,
    "stats": {"metricsTracked": 5, "totalAlerts": 2},
    "predictions": {
      "cpu_temp": {
        "current": 75.2,
        "predicted_next": 78.5,
        "trend": "increasing"
      }
    }
  }
}


## TROUBLESHOOTING
## ---------------

# If simulation not working:

# 1. Check if SIMULATION_MODE is enabled
docker exec agent-1 env | Select-String "SIMULATION"

# 2. Check agent logs for errors
docker logs agent-1 | Select-String "error|Error|ERROR"

# 3. Verify anomaly detection is enabled
docker exec agent-1 env | Select-String "ANOMALY"

# 4. Restart agent
docker-compose restart agent-1

# 5. View full logs
docker logs agent-1

# 6. Check if port is accessible
Test-NetConnection localhost -Port 48481
