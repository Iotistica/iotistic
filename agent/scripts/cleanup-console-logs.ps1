#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Replaces console.log calls with AgentLogger usage in TypeScript files.

.DESCRIPTION
    This script scans TypeScript files in the agent/src directory and replaces
    console.log/warn/error calls with proper structured logging using AgentLogger.
    
    It performs a dry run by default - use -Apply to actually modify files.

.PARAMETER Path
    Root directory to scan (default: agent/src)

.PARAMETER Apply
    Actually modify files (default is dry run)

.PARAMETER Component
    Component name to use in logs (default: extracted from file path)

.EXAMPLE
    # Dry run - show what would be changed
    .\scripts\cleanup-console-logs.ps1

.EXAMPLE
    # Apply changes to all files
    .\scripts\cleanup-console-logs.ps1 -Apply

.EXAMPLE
    # Clean up specific directory
    .\scripts\cleanup-console-logs.ps1 -Path "src/orchestrator" -Apply
#>

param(
    [string]$Path = "src",
    [switch]$Apply,
    [string]$Component = ""
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$agentRoot = Split-Path -Parent $scriptDir
$searchPath = Join-Path $agentRoot $Path

Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host "  Console.log Cleanup Script (SAFE MODE)" -ForegroundColor Cyan
Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Search Path: $searchPath" -ForegroundColor Yellow
Write-Host "Mode: $(if ($Apply) { 'APPLY CHANGES' } else { 'DRY RUN' })" -ForegroundColor $(if ($Apply) { 'Red' } else { 'Green' })
Write-Host ""
Write-Host "NOTE: This script only converts SIMPLE console.log patterns." -ForegroundColor Yellow
Write-Host "      Complex cases (template literals, objects) are SKIPPED." -ForegroundColor Yellow
Write-Host "      Manual review required for skipped lines." -ForegroundColor Yellow
Write-Host ""

# Component name mapping based on file paths
$componentMap = @{
    "api-binder"          = "ApiBinder"
    "connection-monitor"  = "ConnectionMonitor"
    "sync-state"          = "Sync"
    "state-reconciler"    = "StateReconciler"
    "container-manager"   = "ContainerManager"
    "docker-manager"      = "DockerManager"
    "docker-driver"       = "DockerDriver"
    "k3s-driver"          = "K3sDriver"
    "modbus"              = "Modbus"
    "log-monitor"         = "LogMonitor"
    "cloud-backend"       = "CloudLogBackend"
    "local-backend"       = "LocalLogBackend"
    "device-api"          = "DeviceAPI"
    "cloud-server"        = "CloudAPI"
    "app"                 = "Agent"
}

function Get-ComponentName {
    param([string]$FilePath)
    
    $fileName = [System.IO.Path]::GetFileNameWithoutExtension($FilePath)
    
    # Check map first
    if ($componentMap.ContainsKey($fileName)) {
        return $componentMap[$fileName]
    }
    
    # Convert kebab-case to PascalCase
    $words = $fileName -split '-'
    $pascalCase = ($words | ForEach-Object { 
        $_.Substring(0,1).ToUpper() + $_.Substring(1).ToLower() 
    }) -join ''
    
    return $pascalCase
}

function ConvertTo-StructuredLog {
    param(
        [string]$Statement,
        [string]$ComponentName
    )
    
    # Don't convert if it contains template literals or complex expressions
    # These should be done manually to preserve intent
    if ($Statement -match '`' -or $Statement -match '\$\{') {
        Write-Host "  SKIP (template literal): $($Statement.Substring(0, [Math]::Min(80, $Statement.Length)))..." -ForegroundColor Yellow
        return $null
    }
    
    # Don't convert if it spans multiple lines (object literals, etc.)
    if ($Statement -match '\{[^}]*$' -or $Statement -match '^\s*[^{]*\}') {
        Write-Host "  SKIP (multi-line): $($Statement.Substring(0, [Math]::Min(80, $Statement.Length)))..." -ForegroundColor Yellow
        return $null
    }
    
    # Pattern 1: console.log('simple message') - no variables
    if ($Statement -match "console\.(log|warn|error|info)\s*\(\s*'([^'`]+)'\s*\)\s*;?$") {
        $level = switch ($matches[1]) {
            'log'   { 'info' }
            'info'  { 'info' }
            'warn'  { 'warn' }
            'error' { 'error' }
        }
        $message = $matches[2]
        
        # Remove emojis from message
        $message = $message -replace '[^\x00-\x7F]', ''
        $message = $message.Trim()
        
        # Skip if empty after emoji removal
        if ([string]::IsNullOrWhiteSpace($message)) {
            return $null
        }
        
        return "logger.$level('$message', { component: LogComponents.$ComponentName });"
    }
    
    # Pattern 2: console.error('[Component] message', error) - common pattern
    if ($Statement -match "console\.(error|warn)\s*\(\s*'([^']+)',\s*(\w+)\s*\)\s*;?$") {
        $level = $matches[1]
        $message = $matches[2]
        $errorVar = $matches[3]
        
        # Remove emojis
        $message = $message -replace '[^\x00-\x7F]', ''
        $message = $message.Trim()
        
        if ($errorVar -eq 'error' -or $errorVar -eq 'err') {
            return "logger.$level('$message', { component: LogComponents.$ComponentName }, error);"
        }
        else {
            return "logger.$level('$message', { component: LogComponents.$ComponentName, data: $errorVar });"
        }
    }
    
    return $null
}

function Process-File {
    param(
        [string]$FilePath
    )
    
    $content = Get-Content $FilePath -Raw
    $lines = Get-Content $FilePath
    $componentName = Get-ComponentName -FilePath $FilePath
    
    # Check if file uses console.log
    $consoleLogMatches = [regex]::Matches($content, 'console\.(log|warn|error|info)\s*\(')
    
    if ($consoleLogMatches.Count -eq 0) {
        return
    }
    
    Write-Host "`n----------------------------------------" -ForegroundColor Cyan
    Write-Host "File: $($FilePath.Replace($agentRoot, ''))" -ForegroundColor Yellow
    Write-Host "Component: $componentName" -ForegroundColor Yellow
    Write-Host "Console calls found: $($consoleLogMatches.Count)" -ForegroundColor Yellow
    
    $modified = $false
    $newContent = $content
    $replacements = @()
    $skippedCount = 0
    
    # Process each console.log match
    foreach ($match in $consoleLogMatches) {
        $startPos = $match.Index
        
        # Find the end of this statement
        # Look for semicolon, but handle nested parentheses and braces
        $endPos = $startPos
        $depth = 0
        $inString = $false
        $stringChar = $null
        
        for ($i = $startPos; $i -lt $content.Length; $i++) {
            $char = $content[$i]
            
            # Handle strings
            if (($char -eq '"' -or $char -eq "'" -or $char -eq '`') -and $content[$i-1] -ne '\') {
                if ($inString -and $char -eq $stringChar) {
                    $inString = $false
                    $stringChar = $null
                }
                elseif (-not $inString) {
                    $inString = $true
                    $stringChar = $char
                }
            }
            
            if (-not $inString) {
                if ($char -eq '(' -or $char -eq '{') {
                    $depth++
                }
                elseif ($char -eq ')' -or $char -eq '}') {
                    $depth--
                }
                elseif ($char -eq ';' -and $depth -eq 0) {
                    $endPos = $i
                    break
                }
            }
        }
        
        if ($endPos -le $startPos) {
            continue
        }
        
        $statement = $content.Substring($startPos, $endPos - $startPos + 1).Trim()
        
        # Try to convert
        $converted = ConvertTo-StructuredLog -Statement $statement -ComponentName $componentName
        
        if ($converted) {
            # Check if we already have this replacement (avoid duplicates)
            $alreadyExists = $false
            foreach ($r in $replacements) {
                if ($r.Original -eq $statement) {
                    $alreadyExists = $true
                    break
                }
            }
            
            if (-not $alreadyExists) {
                $replacements += @{
                    Original = $statement
                    New = $converted
                }
                $modified = $true
            }
        }
        else {
            $skippedCount++
        }
    }
    
    # Show replacements
    if ($replacements.Count -gt 0) {
        foreach ($replacement in $replacements) {
            Write-Host "`n  OLD: $($replacement.Original)" -ForegroundColor Red
            Write-Host "  NEW: $($replacement.New)" -ForegroundColor Green
            
            if ($Apply) {
                # Use -replace with regex escaping to handle special characters
                $escapedOriginal = [regex]::Escape($replacement.Original)
                $newContent = $newContent -replace $escapedOriginal, $replacement.New
            }
        }
    }
    
    if ($skippedCount -gt 0) {
        Write-Host "`n  SKIPPED: $skippedCount console.log calls (template literals or complex expressions)" -ForegroundColor Yellow
        Write-Host "  These should be converted manually to preserve intent." -ForegroundColor Yellow
    }
    
    # Check if logger import exists
    $hasLoggerImport = $content -match "import.*AgentLogger"
    $hasComponentImport = $content -match "import.*LogComponents"
    
    if ($modified -and -not $hasLoggerImport) {
        Write-Host "`n  NOTE: Add logger import:" -ForegroundColor Yellow
        Write-Host "    import type { AgentLogger } from '../logging/agent-logger.js';" -ForegroundColor Cyan
        Write-Host "    import { LogComponents } from '../logging/components.js';" -ForegroundColor Cyan
    }
    
    if ($modified -and -not $hasComponentImport) {
        Write-Host "`n  NOTE: Add component import:" -ForegroundColor Yellow
        Write-Host "    import { LogComponents } from '../logging/components.js';" -ForegroundColor Cyan
    }
    
    # Apply changes
    if ($Apply -and $modified) {
        Set-Content -Path $FilePath -Value $newContent -NoNewline
        Write-Host "`n  SAVED ($($replacements.Count) replacements)" -ForegroundColor Green
    }
}

# Find all TypeScript files
$files = Get-ChildItem -Path $searchPath -Filter "*.ts" -Recurse | Where-Object {
    $_.FullName -notmatch "node_modules" -and
    $_.FullName -notmatch "dist" -and
    $_.FullName -notmatch "\.d\.ts$"
}

Write-Host "Found $($files.Count) TypeScript files to scan`n" -ForegroundColor Cyan

$processedCount = 0
foreach ($file in $files) {
    Process-File -FilePath $file.FullName
    $processedCount++
}

Write-Host "`n==============================================================" -ForegroundColor Cyan
Write-Host "  Summary" -ForegroundColor Cyan
Write-Host "==============================================================" -ForegroundColor Cyan
Write-Host "Files scanned: $processedCount" -ForegroundColor Yellow

if (-not $Apply) {
    Write-Host "`nThis was a DRY RUN. Use -Apply to make actual changes." -ForegroundColor Yellow
    Write-Host "Example: .\scripts\cleanup-console-logs.ps1 -Apply" -ForegroundColor Cyan
}

Write-Host "`nREMINDER: Complex console.log patterns were SKIPPED." -ForegroundColor Yellow
Write-Host "Review skipped lines manually for:" -ForegroundColor Yellow
Write-Host "  - Template literals (backticks)" -ForegroundColor Gray
Write-Host "  - Multi-line statements" -ForegroundColor Gray
Write-Host "  - Object literals" -ForegroundColor Gray
Write-Host ""
