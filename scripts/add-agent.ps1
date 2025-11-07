#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Adds a new agent service to docker-compose.yml
.DESCRIPTION
    Automates the process of adding a new agent service by:
    - Finding the next agent number
    - Prompting for provisioning API key from dashboard
    - Adding the service definition to docker-compose.yml
    - Adding the corresponding volume
.PARAMETER AgentNumber
    Optional. Specific agent number to add. If not provided, finds next available number.
.PARAMETER ProvisioningKey
    Optional. Provisioning API key from dashboard. If not provided, prompts for input.
.EXAMPLE
    .\scripts\add-agent.ps1
    # Adds agent-4 (next available) and prompts for key
.EXAMPLE
    .\scripts\add-agent.ps1 -AgentNumber 5 -ProvisioningKey "abc123..."
    # Adds agent-5 with specified key
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory=$false)]
    [int]$AgentNumber,
    
    [Parameter(Mandatory=$false)]
    [string]$ProvisioningKey
)

# Configuration
$dockerComposeFile = Join-Path $PSScriptRoot ".." "docker-compose.yml"
$basePort = 48484

# Function to find next available agent number
function Get-NextAgentNumber {
    param([string]$content)
    
    $maxNumber = 0
    $matches = [regex]::Matches($content, 'agent-(\d+):')
    foreach ($match in $matches) {
        $num = [int]$match.Groups[1].Value
        if ($num -gt $maxNumber) {
            $maxNumber = $num
        }
    }
    return $maxNumber + 1
}

# Check if docker-compose.yml exists
if (-not (Test-Path $dockerComposeFile)) {
    Write-Error "docker-compose.yml not found at: $dockerComposeFile"
    exit 1
}

# Read docker-compose.yml
$content = Get-Content $dockerComposeFile -Raw

# Determine agent number
if (-not $AgentNumber) {
    $AgentNumber = Get-NextAgentNumber -content $content
    Write-Host "Auto-detected next agent number: $AgentNumber" -ForegroundColor Cyan
} else {
    # Check if agent already exists
    if ($content -match "agent-$AgentNumber`:") {
        Write-Error "Agent-$AgentNumber already exists in docker-compose.yml"
        exit 1
    }
}

# Get provisioning key (prompt if not provided)
if (-not $ProvisioningKey) {
    Write-Host ""
    Write-Host "Generate a provisioning key in the dashboard:" -ForegroundColor Yellow
    Write-Host "  1. Go to Devices page" -ForegroundColor Gray
    Write-Host "  2. Click 'Add Device' button" -ForegroundColor Gray
    Write-Host "  3. Copy the generated provisioning key" -ForegroundColor Gray
    Write-Host ""
    $provisioningKey = Read-Host "Paste provisioning key"
    
    if ([string]::IsNullOrWhiteSpace($provisioningKey)) {
        Write-Error "Provisioning key cannot be empty"
        exit 1
    }
    
    # Validate key format (should be 64-char hex string)
    if ($provisioningKey -notmatch '^[a-f0-9]{64}$') {
        Write-Host "WARNING: Provisioning key doesn't match expected format (64-char hex)" -ForegroundColor Yellow
        $confirm = Read-Host "Continue anyway? (y/n)"
        if ($confirm -ne 'y') {
            Write-Host "Aborted" -ForegroundColor Red
            exit 1
        }
    }
} else {
    $provisioningKey = $ProvisioningKey
    Write-Host "Using provided provisioning key" -ForegroundColor Cyan
}

Write-Host "Provisioning key: $provisioningKey" -ForegroundColor Green

# Calculate port
$deviceApiPort = $basePort + $AgentNumber

# Get the LICENSE_PUBLIC_KEY and IOTISTIC_LICENSE_KEY from existing agent
$licensePublicKey = ""
$licenseKey = ""

if ($content -match 'LICENSE_PUBLIC_KEY=([^\r\n]+)') {
    $licensePublicKey = $matches[1]
}
if ($content -match 'IOTISTIC_LICENSE_KEY=([^\r\n]+)') {
    $licenseKey = $matches[1]
}

# Create new agent service definition
$newAgentService = @"

    agent-$AgentNumber`:
            container_name: agent-$AgentNumber
            build:
                context: ./agent
                dockerfile: Dockerfile
            privileged: true
            pid: "host"
            tty: true
            restart: always
            network_mode: host
            volumes:
                - /var/run/docker.sock:/var/run/docker.sock
                - agent-$AgentNumber-data:/app/data
            environment:
                - PORT=4002
                - DEVICE_API_PORT=$deviceApiPort
                - CLOUD_API_ENDPOINT=http://host.docker.internal:4002
                - NODE_ENV=development
                - MQTT_PERSIST_TO_DB=true
                - MQTT_DB_SYNC_INTERVAL=70000
                - REPORT_INTERVAL_MS=2000
                - METRICS_INTERVAL_MS=2000
                - LOG_COMPRESSION=true
                - PROVISIONING_API_KEY=$provisioningKey
      
"@

# Find insertion point (after last agent service, before postgres)
# Match the last agent's IOTISTIC_LICENSE_KEY line, then capture any whitespace until postgres: service
if ($content -match '(?s)(agent-\d+:.*?PROVISIONING_API_KEY=[^\r\n]+)([\r\n\s]*)(    postgres:)') {
    $beforeAgent = $content.Substring(0, $matches.Index + $matches[1].Length)
    $whitespace = $matches[2]
    $afterAgent = $content.Substring($matches.Index + $matches[1].Length + $matches[2].Length)
    
    $content = $beforeAgent + $newAgentService + $whitespace + $afterAgent
} else {
    Write-Error "Could not find insertion point in docker-compose.yml"
    Write-Host "Looking for pattern: agent-X with IOTISTIC_LICENSE_KEY followed by postgres service" -ForegroundColor Yellow
    exit 1
}

# Add volume definition
$newVolume = "  agent-$AgentNumber-data:`n    driver: local"

if ($content -match '(?s)(volumes:.*?)(agent-\d+-data:\r?\n    driver: local)(\r?\n)') {
    # Find the last agent volume and insert after it
    $volumeSection = $matches[0]
    $lastAgentVolume = $matches[2]
    $afterNewline = $matches[3]
    
    $updatedVolumeSection = $volumeSection -replace [regex]::Escape($lastAgentVolume), "$lastAgentVolume$afterNewline$newVolume"
    $content = $content -replace [regex]::Escape($volumeSection), $updatedVolumeSection
} else {
    Write-Error "Could not find volume section in docker-compose.yml"
    exit 1
}

# Write back to file
Set-Content -Path $dockerComposeFile -Value $content -NoNewline

Write-Host "`n✅ Successfully added agent-$AgentNumber to docker-compose.yml" -ForegroundColor Green
Write-Host "`nDetails:" -ForegroundColor Yellow
Write-Host "  - Container: agent-$AgentNumber" -ForegroundColor White
Write-Host "  - Device API Port: $deviceApiPort" -ForegroundColor White
Write-Host "  - Provisioning Key: $provisioningKey" -ForegroundColor White
Write-Host "  - Volume: agent-$AgentNumber-data" -ForegroundColor White

Write-Host "`nNext steps:" -ForegroundColor Cyan
Write-Host "  1. Run: docker compose up -d agent-$AgentNumber" -ForegroundColor White
Write-Host "  2. Or rebuild all: docker compose up -d --build" -ForegroundColor White
Write-Host "`n  3. Register device in dashboard using provisioning key" -ForegroundColor White

# Optionally save key to file for reference
$keysFile = Join-Path $PSScriptRoot ".." "provisioning-keys.txt"
$keyEntry = "agent-$AgentNumber`: $provisioningKey (Port: $deviceApiPort, Added: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))"
Add-Content -Path $keysFile -Value $keyEntry
Write-Host "`n📝 Provisioning key saved to: provisioning-keys.txt" -ForegroundColor Magenta
