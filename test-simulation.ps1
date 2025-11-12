# SIMULATION MODE - Quick Test Script
# =====================================
# Tests the new unified simulation framework

Write-Host "`n🧪 SIMULATION MODE TEST SCRIPT" -ForegroundColor Cyan
Write-Host "================================`n" -ForegroundColor Cyan

# 1. Rebuild and start agent with simulation enabled
Write-Host "Step 1: Starting agent with SIMULATION_MODE enabled..." -ForegroundColor Yellow
docker-compose up -d --build agent-1

# Wait for startup
Write-Host "`nWaiting 15 seconds for agent startup..." -ForegroundColor Gray
Start-Sleep -Seconds 15

# 2. Check simulation status
Write-Host "`nStep 2: Checking simulation status..." -ForegroundColor Yellow
$status = Invoke-RestMethod -Uri "http://localhost:48481/v1/simulation/status" -Method Get
Write-Host "`nSimulation Status:" -ForegroundColor Green
$status | ConvertTo-Json -Depth 5

# 3. Check agent logs for simulation warnings
Write-Host "`nStep 3: Checking agent logs for simulation activity..." -ForegroundColor Yellow
Write-Host "(Looking for simulation warnings and data generation)`n" -ForegroundColor Gray
docker logs agent-1 --tail 50 | Select-String -Pattern "SIMULATION|Anomaly|Sensor" | Select-Object -First 20

# 4. Monitor metrics report (should include anomaly detection + predictions)
Write-Host "`nStep 4: Monitoring metrics report..." -ForegroundColor Yellow
Write-Host "(Waiting 25 seconds for next metrics report with anomaly data)`n" -ForegroundColor Gray
Start-Sleep -Seconds 25
docker logs agent-1 --tail 100 | Select-String -Pattern "Metrics Report" -Context 0,30 | Select-Object -First 1

# 5. Test runtime control - Stop anomaly injection
Write-Host "`nStep 5: Testing runtime control - Stopping anomaly injection..." -ForegroundColor Yellow
$stopResult = Invoke-RestMethod -Uri "http://localhost:48481/v1/simulation/scenarios/anomaly_injection/stop" -Method Post
Write-Host "Stop Result:" -ForegroundColor Green
$stopResult | ConvertTo-Json

# 6. Verify scenario stopped
Write-Host "`nStep 6: Verifying scenario stopped..." -ForegroundColor Yellow
$statusAfter = Invoke-RestMethod -Uri "http://localhost:48481/v1/simulation/status" -Method Get
Write-Host "Active Scenarios: $($statusAfter.activeCount)" -ForegroundColor Green
$statusAfter.scenarios | ForEach-Object {
    $color = if ($_.running) { "Green" } else { "Red" }
    Write-Host "  - $($_.name): $($_.running)" -ForegroundColor $color
}

# 7. Restart scenario
Write-Host "`nStep 7: Restarting anomaly injection scenario..." -ForegroundColor Yellow
$startResult = Invoke-RestMethod -Uri "http://localhost:48481/v1/simulation/scenarios/anomaly_injection/start" -Method Post
Write-Host "Restart Result: Success" -ForegroundColor Green

# 8. Final status check
Write-Host "`nStep 8: Final status check..." -ForegroundColor Yellow
$finalStatus = Invoke-RestMethod -Uri "http://localhost:48481/v1/simulation/status" -Method Get
Write-Host "Active Scenarios: $($finalStatus.activeCount)" -ForegroundColor Green

# Summary
Write-Host "`n" -NoNewline
Write-Host "================================" -ForegroundColor Cyan
Write-Host "✅ TEST COMPLETE!" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Cyan

Write-Host "`nWhat to check next:" -ForegroundColor Yellow
Write-Host "  1. Watch live logs: docker logs -f agent-1" -ForegroundColor Gray
Write-Host "  2. Check anomaly alerts: docker logs agent-1 | Select-String 'Alert'" -ForegroundColor Gray
Write-Host "  3. View sensor data: docker logs agent-1 | Select-String 'Sensor data published'" -ForegroundColor Gray
Write-Host "  4. Monitor memory: docker stats agent-1" -ForegroundColor Gray
Write-Host "  5. API docs: http://localhost:48481/v1/simulation/status" -ForegroundColor Gray

Write-Host "`nTo stop all simulations:" -ForegroundColor Yellow
Write-Host "  Invoke-RestMethod -Uri 'http://localhost:48481/v1/simulation/stop-all' -Method Post" -ForegroundColor Gray

Write-Host "`n"
