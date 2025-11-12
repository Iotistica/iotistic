#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Test API security modes in Docker container
.DESCRIPTION
    Tests different security modes: LOCALHOST_ONLY, LOCAL_NETWORK, API_KEY, OPEN
#>

param(
    [Parameter()]
    [ValidateSet('LOCALHOST_ONLY', 'LOCAL_NETWORK', 'API_KEY', 'OPEN')]
    [string]$Mode = 'LOCALHOST_ONLY',
    
    [Parameter()]
    [string]$ApiKey = 'test-secret-key-123'
)

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Testing API Security Mode: $Mode" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Set environment variables
$env:API_SECURITY_MODE = $Mode
if ($Mode -eq 'API_KEY') {
    $env:API_KEY = $ApiKey
}

# Restart agent with new security mode
Write-Host "1. Restarting agent-1 with $Mode mode..." -ForegroundColor Yellow
docker-compose stop agent-1 2>&1 | Out-Null
docker-compose up -d agent-1

# Wait for agent to start
Write-Host "2. Waiting for agent to start..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

# Test 1: Access from inside container (localhost)
Write-Host "`n3. Test 1: Access from INSIDE container (localhost)" -ForegroundColor Green
Write-Host "   Command: docker exec agent-1 wget -qO- http://localhost:48481/v1/healthy" -ForegroundColor Gray
$result1 = docker exec agent-1 wget -qO- http://localhost:48481/v1/healthy 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "   ✅ SUCCESS: Localhost access allowed" -ForegroundColor Green
} else {
    Write-Host "   ❌ FAILED: Localhost access blocked (unexpected!)" -ForegroundColor Red
}

# Test 2: Access from host machine (network)
Write-Host "`n4. Test 2: Access from HOST machine (network)" -ForegroundColor Green
Write-Host "   Command: curl http://localhost:48481/v1/device" -ForegroundColor Gray
try {
    $headers = @{}
    if ($Mode -eq 'API_KEY') {
        $headers['X-API-Key'] = $ApiKey
        Write-Host "   Using API Key: $ApiKey" -ForegroundColor Gray
    }
    
    $response = Invoke-WebRequest -Uri "http://localhost:48481/v1/device" -Headers $headers -ErrorAction Stop
    Write-Host "   ✅ SUCCESS: Network access allowed" -ForegroundColor Green
    Write-Host "   Response: $($response.StatusCode)" -ForegroundColor Gray
} catch {
    $statusCode = $_.Exception.Response.StatusCode.value__
    if ($statusCode -eq 403) {
        if ($Mode -eq 'LOCALHOST_ONLY') {
            Write-Host "   ✅ EXPECTED: Network access blocked (403 Forbidden)" -ForegroundColor Green
        } else {
            Write-Host "   ❌ FAILED: Network access blocked but should be allowed" -ForegroundColor Red
        }
    } elseif ($statusCode -eq 401) {
        Write-Host "   ❌ FAILED: Unauthorized (missing/wrong API key?)" -ForegroundColor Red
    } else {
        Write-Host "   ❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# Test 3: Access without API key (if API_KEY mode)
if ($Mode -eq 'API_KEY') {
    Write-Host "`n5. Test 3: Access WITHOUT API key (should fail)" -ForegroundColor Green
    Write-Host "   Command: curl http://localhost:48481/v1/device (no key)" -ForegroundColor Gray
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:48481/v1/device" -ErrorAction Stop
        Write-Host "   ❌ FAILED: Access allowed without API key!" -ForegroundColor Red
    } catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        if ($statusCode -eq 401) {
            Write-Host "   ✅ EXPECTED: Unauthorized without API key" -ForegroundColor Green
        } else {
            Write-Host "   Status: $statusCode" -ForegroundColor Yellow
        }
    }
}

# Test 4: Check logs for security events
Write-Host "`n6. Checking agent logs for security events..." -ForegroundColor Green
Write-Host "   Last 10 lines:" -ForegroundColor Gray
docker logs agent-1 --tail 10 2>&1 | Select-String -Pattern "security|Forbidden|Unauthorized|API access" | ForEach-Object {
    Write-Host "   $_" -ForegroundColor Cyan
}

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "Test Summary for $Mode mode" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Localhost access: Should always work ✅" -ForegroundColor White
switch ($Mode) {
    'LOCALHOST_ONLY' { 
        Write-Host "Network access:   Should be blocked ❌ (403)" -ForegroundColor White 
    }
    'LOCAL_NETWORK'  { 
        Write-Host "Network access:   Should be allowed ✅ (200)" -ForegroundColor White 
    }
    'API_KEY'        { 
        Write-Host "Network access:   Requires valid API key 🔑" -ForegroundColor White 
        Write-Host "Without key:      Should be blocked ❌ (401)" -ForegroundColor White 
    }
    'OPEN'           { 
        Write-Host "Network access:   Should be allowed ✅ (200)" -ForegroundColor White 
        Write-Host "WARNING:          No security - DANGEROUS! ⚠️" -ForegroundColor Red 
    }
}
Write-Host ""

# Cleanup
if ($args -contains '--cleanup') {
    Write-Host "Cleaning up..." -ForegroundColor Yellow
    docker-compose stop agent-1
    Remove-Item Env:\API_SECURITY_MODE -ErrorAction SilentlyContinue
    Remove-Item Env:\API_KEY -ErrorAction SilentlyContinue
}
