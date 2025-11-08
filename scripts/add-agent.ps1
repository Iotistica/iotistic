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

# Function to find next available agent number
function Get-NextAgentNumber {
    param([string]$content)
    $maxNumber = 0
    $matches = [regex]::Matches($content, 'agent-(\d+):')
    foreach ($match in $matches) {
        $num = [int]$match.Groups[1].Value
        if ($num -gt $maxNumber) { $maxNumber = $num }
    }
    return $maxNumber + 1
}

# Check docker-compose.yml exists
if (-not (Test-Path $dockerComposeFile)) {
    Write-Error "docker-compose.yml not found at: $dockerComposeFile"
    exit 1
}

# Read file
$content = Get-Content $dockerComposeFile -Raw

# Determine agent number
if (-not $AgentNumber) {
    $AgentNumber = Get-NextAgentNumber -content $content
    Write-Host "Auto-detected next agent number: $AgentNumber" -ForegroundColor Cyan
} else {
    if ($content -match "agent-$AgentNumber`:") {
        Write-Error "Agent-$AgentNumber already exists"
        exit 1
    }
}

# Get provisioning key
if (-not $ProvisioningKey) {
    Write-Host ""
    Write-Host "Generate a provisioning key in the dashboard:" -ForegroundColor Yellow
    $ProvisioningKey = Read-Host "Paste provisioning key"
    if ([string]::IsNullOrWhiteSpace($ProvisioningKey)) {
        Write-Error "Provisioning key cannot be empty"
        exit 1
    }
}

Write-Host "Using provisioning key: $ProvisioningKey" -ForegroundColor Green

# Agent template
$template = @"
    agent-{AGENT_NUMBER}:
            container_name: agent-{AGENT_NUMBER}
            build:
                context: ./agent
                dockerfile: Dockerfile
            restart: always
            volumes:
                - /var/run/docker.sock:/var/run/docker.sock
                - agent-{AGENT_NUMBER}-data:/app/data
            environment:
                - AGENT_VERSION=1.0.0
                - DEVICE_API_PORT=4848{AGENT_NUMBER}
                - CLOUD_API_ENDPOINT=http://host.docker.internal:4002
                - NODE_ENV=development
                - MQTT_PERSIST_TO_DB=true
                - MQTT_DB_SYNC_INTERVAL=70000
                - REPORT_INTERVAL_MS=20000
                - METRICS_INTERVAL_MS=30000
                - LOG_COMPRESSION=true
                - REQUIRE_PROVISIONING=false
                - PROVISIONING_API_KEY={PROVISIONING_KEY}
                
            depends_on:
                api:
                    condition: service_healthy
            networks:
                - iotistic-net

"@

# Replace placeholders
$newAgentService = $template.Replace("{AGENT_NUMBER}", $AgentNumber).Replace("{PROVISIONING_KEY}", $ProvisioningKey)

# Insert new agent after last agent
$agentMatches = [regex]::Matches($content, '(?ms)^ {4}agent-\d+:.*?(?=^ {4}[a-zA-Z])')
if ($agentMatches.Count -eq 0) {
    Write-Error "No existing agent services found"
    exit 1
}
$lastAgent = $agentMatches[$agentMatches.Count - 1]
$before = $content.Substring(0, $lastAgent.Index + $lastAgent.Length)
$after  = $content.Substring($lastAgent.Index + $lastAgent.Length)
$content = $before + $newAgentService + $after

# Add volume block (without duplicate driver)
$newVolume = "  agent-$AgentNumber-data:`n    driver: local"

# Insert after last agent volume
$volumeMatches = [regex]::Matches($content, '(?m)^\s*agent-\d+-data:')
if ($volumeMatches.Count -eq 0) {
    Write-Error "No agent volumes found"
    exit 1
}
$lastVolume = $volumeMatches[$volumeMatches.Count - 1]
$insertIndex = $content.IndexOf($lastVolume.Value) + $lastVolume.Value.Length
$content = $content.Insert($insertIndex, "`n$newVolume")

# Write back
Set-Content -Path $dockerComposeFile -Value $content -NoNewline

Write-Host "`n✅ Successfully added agent-$AgentNumber to docker-compose.yml" -ForegroundColor Green

# Save provisioning key
$keysFile = Join-Path $PSScriptRoot ".." "provisioning-keys.txt"
$keyEntry = "agent-${AgentNumber}: $ProvisioningKey (Added: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))"
Add-Content -Path $keysFile -Value $keyEntry
Write-Host "📝 Provisioning key saved to: provisioning-keys.txt" -ForegroundColor Magenta
