#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Test Event Replay functionality
.DESCRIPTION
    Demonstrates the new event replay, snapshot, and comparison features
#>

$API_URL = "http://localhost:3002"
$DEVICE_UUID = $args[0]

if (-not $DEVICE_UUID) {
    Write-Host "Usage: .\test-event-replay.ps1 <device_uuid>" -ForegroundColor Red
    Write-Host ""
    Write-Host "Example:" -ForegroundColor Yellow
    Write-Host "  .\test-event-replay.ps1 '123e4567-e89b-12d3-a456-426614174000'"
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Event Replay Testing" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Device UUID: $DEVICE_UUID" -ForegroundColor Green
Write-Host ""

# 1. Replay events from last hour
Write-Host "1. Replaying events from last hour..." -ForegroundColor Yellow
$oneHourAgo = (Get-Date).AddHours(-1).ToString("o")
$now = (Get-Date).ToString("o")

$replayBody = @{
    fromTime = $oneHourAgo
    toTime = $now
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod `
        -Uri "$API_URL/api/v1/events/device/$DEVICE_UUID/replay" `
        -Method POST `
        -ContentType "application/json" `
        -Body $replayBody

    Write-Host "   Events replayed: $($response.events_replayed)" -ForegroundColor Green
    Write-Host "   Errors: $($response.errors.Length)" -ForegroundColor $(if ($response.errors.Length -gt 0) { "Red" } else { "Green" })
    
    if ($response.events_replayed -gt 0) {
        Write-Host ""
        Write-Host "   Recent events:" -ForegroundColor Cyan
        $response.events | Select-Object -First 5 | ForEach-Object {
            Write-Host "     - $($_.timestamp): $($_.event_type)" -ForegroundColor Gray
        }
    }

    Write-Host ""
    Write-Host "   Final state summary:" -ForegroundColor Cyan
    Write-Host "     Target state keys: $($response.final_state.target_state.PSObject.Properties.Name -join ', ')" -ForegroundColor Gray
    Write-Host "     Online: $($response.final_state.online)" -ForegroundColor Gray
    Write-Host "     Container count: $($response.final_state.containers.PSObject.Properties.Name.Count)" -ForegroundColor Gray
} catch {
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# 2. Create snapshot at 30 minutes ago
Write-Host "2. Creating snapshot from 30 minutes ago..." -ForegroundColor Yellow
$thirtyMinsAgo = (Get-Date).AddMinutes(-30).ToString("o")

$snapshotBody = @{
    timestamp = $thirtyMinsAgo
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod `
        -Uri "$API_URL/api/v1/events/device/$DEVICE_UUID/snapshot" `
        -Method POST `
        -ContentType "application/json" `
        -Body $snapshotBody

    Write-Host "   Snapshot created successfully" -ForegroundColor Green
    Write-Host "   Timestamp: $($response.timestamp)" -ForegroundColor Gray
    Write-Host "   Events processed: $($response.event_count)" -ForegroundColor Gray
    Write-Host "   Last event: $($response.last_event_type)" -ForegroundColor Gray
} catch {
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""

# 3. Compare states (30 mins ago vs now)
Write-Host "3. Comparing state changes (30 mins ago vs now)..." -ForegroundColor Yellow

$compareBody = @{
    time1 = $thirtyMinsAgo
    time2 = $now
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod `
        -Uri "$API_URL/api/v1/events/device/$DEVICE_UUID/compare" `
        -Method POST `
        -ContentType "application/json" `
        -Body $compareBody

    Write-Host "   Comparison completed successfully" -ForegroundColor Green
    Write-Host "   Changes detected: $($response.changes_count)" -ForegroundColor $(if ($response.changes_count -gt 0) { "Yellow" } else { "Green" })
    Write-Host "   Events between: $($response.events_between_count)" -ForegroundColor Gray
    
    if ($response.changes_count -gt 0) {
        Write-Host ""
        Write-Host "   Changes:" -ForegroundColor Cyan
        $response.changes | ForEach-Object {
            Write-Host "     - Field: $($_.field)" -ForegroundColor White
            Write-Host "       Events: $($_.events_involved -join ', ')" -ForegroundColor Gray
        }
    }
} catch {
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " Test Complete" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "API Endpoints:" -ForegroundColor Yellow
Write-Host "  POST $API_URL/api/v1/events/device/:uuid/replay" -ForegroundColor Gray
Write-Host "  POST $API_URL/api/v1/events/device/:uuid/snapshot" -ForegroundColor Gray
Write-Host "  POST $API_URL/api/v1/events/device/:uuid/compare" -ForegroundColor Gray
Write-Host ""
