#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Run iotctl CLI commands inside Docker container
.DESCRIPTION
    Builds and executes iotctl CLI from inside the agent-1 container
.EXAMPLE
    .\cli-in-docker.ps1 status
    .\cli-in-docker.ps1 provision status
    .\cli-in-docker.ps1 apps list
#>

param(
    [Parameter(Position=0)]
    [string]$Command = "help",
    
    [Parameter(Position=1, ValueFromRemainingArguments=$true)]
    [string[]]$Args
)

$containerName = "agent-1"

# Check if container is running
$running = docker ps --filter "name=$containerName" --format "{{.Names}}" 2>$null
if (-not $running) {
    Write-Host "❌ Container '$containerName' is not running" -ForegroundColor Red
    Write-Host "Start it with: docker-compose up -d $containerName" -ForegroundColor Yellow
    exit 1
}

# Build CLI if not already built
Write-Host "📦 Building CLI..." -ForegroundColor Cyan
$buildOutput = docker exec $containerName sh -c "cd /app && npm run cli:build 2>&1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to build CLI:" -ForegroundColor Red
    Write-Host $buildOutput -ForegroundColor Yellow
    exit 1
}

# Create symlink
Write-Host "🔗 Creating symlink..." -ForegroundColor Cyan
docker exec $containerName sh -c "ln -sf /app/dist/cli/iotctl.js /usr/local/bin/iotctl && chmod +x /usr/local/bin/iotctl && chmod +x /app/dist/cli/iotctl.js"

# Build full command
$fullCommand = "iotctl $Command"
if ($Args) {
    $fullCommand += " " + ($Args -join " ")
}

# Show what we're running
Write-Host "🔧 Running: $fullCommand" -ForegroundColor Green
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray

# Execute command in container
docker exec -it $containerName sh -c $fullCommand

Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor DarkGray
