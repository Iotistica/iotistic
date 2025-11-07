<#
.SYNOPSIS
    Replace console.log calls with structured AgentLogger calls in TypeScript files.

.DESCRIPTION
    This script scans TypeScript files in the agent/src directory and replaces
    console.log/warn/error calls with proper AgentLogger calls.
    
    Features:
    - Detects component name from file path
    - Preserves log message and context
    - Removes emoji spam
    - Adds proper log level (debug, info, warn, error)
    - Creates backup files before modification
    - Dry-run mode to preview changes

.PARAMETER Path
    Path to scan for TypeScript files (default: agent/src)

.PARAMETER DryRun
    Preview changes without modifying files

.PARAMETER NoBackup
    Skip creating .bak backup files

.EXAMPLE
    .\scripts\cleanup-console-logs.ps1 -DryRun
    Preview changes without modifying files

.EXAMPLE
    .\scripts\cleanup-console-logs.ps1 -Path agent/src/sync-state.ts
    Clean up a specific file

.EXAMPLE
    .\scripts\cleanup-console-logs.ps1 -NoBackup
    Clean up all files without creating backups
#>

param(
    [string]$Path = "agent\src",
    [switch]$DryRun,
    [switch]$NoBackup
)

# Component name mapping (file path -> component name)
$componentMap = @{
    'sync-state.ts' = 'Sync'
    'state-reconciler.ts' = 'StateReconciler'
    'container-manager.ts' = 'ContainerManager'
    'docker-manager.ts' = 'DockerManager'
    'docker-driver.ts' = 'DockerDriver'
    'k3s-driver.ts' = 'K3sDriver'
    'app.ts' = 'Agent'
    'agent.ts' = 'Agent'
    'connection-monitor.ts' = 'ConnectionMonitor'
    'api-binder.ts' = 'ApiBinder'
    'modbus' = 'Modbus'
    'log-monitor.ts' = 'LogMonitor'
}

# Emoji patterns to remove
$emojiPattern = '[🔍📝📡✅❌⚠️💾⏭️📄🚀🛑📦⏳🎯]'

# Statistics
$stats = @{
    FilesScanned = 0
    FilesModified = 0
    ConsoleCalls = 0
    Replacements = 0
}

function Get-ComponentName {
    param([string]$FilePath)
    
    $fileName = Split-Path $FilePath -Leaf
    
    # Check direct mapping
    if ($componentMap.ContainsKey($fileName)) {
        return $componentMap[$fileName]
    }
    
    # Check for substring matches (e.g., modbus-rtu.ts -> Modbus)
    foreach ($key in $componentMap.Keys) {
        if ($fileName -like "*$key*") {
            return $componentMap[$key]
        }
    }
    
    # Default: capitalize first letter of filename without extension
    $baseName = [System.IO.Path]::GetFileNameWithoutExtension($fileName)
    return (Get-Culture).TextInfo.ToTitleCase($baseName)
}

function Remove-Emojis {
    param([string]$Text)
    return $Text -replace $emojiPattern, ''
}

function Convert-ConsoleLog {
    param(
        [string]$Line,
        [string]$Component,
        [int]$LineNumber
    )
    
    # Detect log level
    $level = 'info'
    if ($Line -match 'console\.error') {
        $level = 'error'
    } elseif ($Line -match 'console\.warn') {
        $level = 'warn'
    } elseif ($Line -match 'console\.debug') {
        $level = 'debug'
    }
    
    # Extract indentation
    $indent = ''
    if ($Line -match '^(\s+)') {
        $indent = $matches[1]
    }
    
    # Extract the console.log content
    if ($Line -match 'console\.(log|error|warn|debug)\((.*)\);?\s*$') {
        $content = $matches[2]
        
        # Remove emojis from content
        $content = Remove-Emojis $content
        
        # Check if it's a simple string
        if ($content -match "^['\"`](.+)['\"`]$") {
            $message = $matches[1].Trim()
            return "${indent}logger.${level}('${message}', { component: LogComponents.${Component.ToUpper()} });"
        }
        
        # Check if it's string interpolation with context
        if ($content -match "^['\"`](.+)['\"`],\s*(.+)$") {
            $message = Remove-Emojis $matches[1].Trim()
            $context = $matches[2].Trim()
            
            # If context is a simple variable, wrap it
            if ($context -notmatch '[{},]') {
                $context = "{ value: $context }"
            }
            
            # Merge component into context
            if ($context -match '^\{(.+)\}$') {
                $innerContext = $matches[1]
                $context = "{ component: LogComponents.${Component.ToUpper()}, $innerContext }"
            } else {
                $context = "{ component: LogComponents.${Component.ToUpper()}, context: $context }"
            }
            
            return "${indent}logger.${level}('${message}', ${context});"
        }
        
        # Complex case - just add component
        return "${indent}logger.${level}($content, { component: LogComponents.${Component.ToUpper()} });"
    }
    
    # Couldn't parse - return original (will be flagged for manual review)
    return $null
}

function Process-File {
    param([string]$FilePath)
    
    $stats.FilesScanned++
    
    $component = Get-ComponentName $FilePath
    $content = Get-Content $FilePath -Raw
    $lines = Get-Content $FilePath
    
    # Count console.* calls
    $consoleCallsInFile = ($content | Select-String -Pattern 'console\.(log|error|warn|debug)' -AllMatches).Matches.Count
    
    if ($consoleCallsInFile -eq 0) {
        return
    }
    
    $stats.ConsoleCalls += $consoleCallsInFile
    
    Write-Host "`n📄 Processing: $FilePath" -ForegroundColor Cyan
    Write-Host "   Component: $component"
    Write-Host "   Console calls: $consoleCallsInFile"
    
    $modified = $false
    $newLines = @()
    $replacementsInFile = 0
    
    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        
        if ($line -match 'console\.(log|error|warn|debug)') {
            $converted = Convert-ConsoleLog -Line $line -Component $component -LineNumber ($i + 1)
            
            if ($converted) {
                Write-Host "   Line $($i + 1):" -ForegroundColor Yellow
                Write-Host "     OLD: $($line.Trim())" -ForegroundColor Red
                Write-Host "     NEW: $($converted.Trim())" -ForegroundColor Green
                
                $newLines += $converted
                $modified = $true
                $replacementsInFile++
            } else {
                Write-Host "   Line $($i + 1): MANUAL REVIEW NEEDED" -ForegroundColor Magenta
                Write-Host "     $($line.Trim())"
                $newLines += $line
            }
        } else {
            $newLines += $line
        }
    }
    
    if ($modified) {
        $stats.FilesModified++
        $stats.Replacements += $replacementsInFile
        
        if (-not $DryRun) {
            # Create backup
            if (-not $NoBackup) {
                $backupPath = "$FilePath.bak"
                Copy-Item $FilePath $backupPath -Force
                Write-Host "   ✅ Backup created: $backupPath" -ForegroundColor Gray
            }
            
            # Write modified file
            $newLines | Set-Content $FilePath -Encoding UTF8
            Write-Host "   ✅ File modified ($replacementsInFile replacements)" -ForegroundColor Green
        } else {
            Write-Host "   ⏭️  DRY RUN - No changes made" -ForegroundColor Yellow
        }
        
        # Check if file needs imports
        $hasLoggerImport = $content -match "import.*AgentLogger|from.*agent-logger"
        $hasComponentsImport = $content -match "import.*LogComponents|from.*components"
        
        if (-not $hasLoggerImport -or -not $hasComponentsImport) {
            Write-Host "`n   ⚠️  Missing imports:" -ForegroundColor Yellow
            if (-not $hasLoggerImport) {
                Write-Host "      - import type { AgentLogger } from './logging/agent-logger.js';"
            }
            if (-not $hasComponentsImport) {
                Write-Host "      - import { LogComponents } from './logging/components.js';"
            }
        }
    }
}

# Main execution
Write-Host "
╔═══════════════════════════════════════════════════════════╗
║     Console.log Cleanup Script                            ║
╚═══════════════════════════════════════════════════════════╝
" -ForegroundColor Cyan

if ($DryRun) {
    Write-Host "🔍 DRY RUN MODE - No files will be modified`n" -ForegroundColor Yellow
}

# Get TypeScript files
$files = Get-ChildItem -Path $Path -Filter "*.ts" -Recurse | Where-Object { 
    $_.FullName -notmatch 'node_modules|dist|coverage|test|spec' 
}

Write-Host "Found $($files.Count) TypeScript files to scan`n"

foreach ($file in $files) {
    Process-File -FilePath $file.FullName
}

# Print statistics
Write-Host "`n
╔═══════════════════════════════════════════════════════════╗
║     Cleanup Statistics                                     ║
╚═══════════════════════════════════════════════════════════╝
" -ForegroundColor Cyan

Write-Host "Files scanned:     $($stats.FilesScanned)"
Write-Host "Files modified:    $($stats.FilesModified)" -ForegroundColor $(if ($stats.FilesModified -gt 0) { 'Green' } else { 'Gray' })
Write-Host "Console calls:     $($stats.ConsoleCalls)" -ForegroundColor $(if ($stats.ConsoleCalls -gt 0) { 'Yellow' } else { 'Gray' })
Write-Host "Replacements:      $($stats.Replacements)" -ForegroundColor $(if ($stats.Replacements -gt 0) { 'Green' } else { 'Gray' })
Write-Host "Remaining:         $($stats.ConsoleCalls - $stats.Replacements)" -ForegroundColor $(if ($stats.ConsoleCalls - $stats.Replacements -gt 0) { 'Red' } else { 'Gray' })

if ($DryRun) {
    Write-Host "`n💡 Run without -DryRun to apply changes" -ForegroundColor Yellow
}

if ($stats.FilesModified -gt 0 -and -not $DryRun) {
    Write-Host "`n✅ Cleanup complete! Review changes with: git diff" -ForegroundColor Green
    
    if (-not $NoBackup) {
        Write-Host "💾 Backup files created (.bak) - delete after verification" -ForegroundColor Gray
    }
}
