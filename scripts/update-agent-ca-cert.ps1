#!/usr/bin/env pwsh
# Update CA certificate in agent SQLite database

param(
    [string]$AgentName = "agent-9"
)

Write-Host "📝 Updating CA certificate in $AgentName database..." -ForegroundColor Cyan

# Read the new CA cert
$caCertPath = "certs/ca.crt"
if (-not (Test-Path $caCertPath)) {
    Write-Host "❌ CA certificate not found at $caCertPath" -ForegroundColor Red
    exit 1
}

$caCert = Get-Content -Raw $caCertPath

# Escape for JSON (replace \ with \\ and newlines with \n)
$caCertJson = $caCert -replace '\\', '\\' -replace "`r`n", '\n' -replace "`n", '\n'

# Create the update script
$updateScript = @"
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = '/app/data/device.sqlite';
const db = new Database(dbPath);

try {
    // Read current device info
    const device = db.prepare('SELECT * FROM device_info WHERE id = 1').get();
    
    if (!device) {
        console.log('No device found in database');
        process.exit(1);
    }
    
    console.log('Current device:', {
        uuid: device.uuid,
        name: device.name,
        provisioned: device.provisioned,
        hasApiTlsConfig: !!device.apiTlsConfig
    });
    
    // Parse existing apiTlsConfig or create new
    let apiTlsConfig = device.apiTlsConfig ? JSON.parse(device.apiTlsConfig) : {};
    
    // Update CA cert
    apiTlsConfig.caCert = $($caCertJson | ConvertTo-Json);
    apiTlsConfig.verifyCertificate = true;
    
    // Update database
    const stmt = db.prepare('UPDATE device_info SET apiTlsConfig = ? WHERE id = 1');
    stmt.run(JSON.stringify(apiTlsConfig));
    
    console.log('✅ CA certificate updated successfully');
    
    // Verify
    const updated = db.prepare('SELECT apiTlsConfig FROM device_info WHERE id = 1').get();
    const updatedConfig = JSON.parse(updated.apiTlsConfig);
    console.log('Updated config has CA cert:', updatedConfig.caCert.substring(0, 50) + '...');
    
} catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
} finally {
    db.close();
}
"@

# Write script to temp file
$tempScript = [System.IO.Path]::GetTempFileName() + ".js"
$updateScript | Out-File -FilePath $tempScript -Encoding UTF8

try {
    # Copy script into container
    docker cp $tempScript "${AgentName}:/tmp/update-ca.js"
    
    # Run the script
    docker exec $AgentName node /tmp/update-ca.js
    
    # Clean up
    docker exec $AgentName rm /tmp/update-ca.js
    
} finally {
    Remove-Item $tempScript -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "✅ Done! Restart the agent to apply changes:" -ForegroundColor Green
Write-Host "   docker compose restart $AgentName" -ForegroundColor Yellow
