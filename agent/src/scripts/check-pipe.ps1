# Named pipe path on Windows
$pipeName = "modbus"

Write-Host "Checking for named pipes..." -ForegroundColor Cyan

# List all pipes
Write-Host "`nAvailable pipes:" -ForegroundColor Yellow
try {
    $pipes = [System.IO.Directory]::GetFiles("\\.\pipe\")
    if ($pipes) {
        $pipes | ForEach-Object { Write-Host "  $_" }
        
        # Check if modbus pipe exists
        $modbusFound = $pipes | Where-Object { $_ -match "modbus" }
        if ($modbusFound) {
            Write-Host "`n✓ Found Modbus pipe(s):" -ForegroundColor Green
            $modbusFound | ForEach-Object { Write-Host "  $_" -ForegroundColor Green }
        } else {
            Write-Host "`n✗ No Modbus pipe found" -ForegroundColor Red
            Write-Host "  The Modbus protocol adapter may not be running or hasn't created the pipe yet." -ForegroundColor Yellow
            Write-Host "`nTroubleshooting:" -ForegroundColor Cyan
            Write-Host "  1. Check if protocol adapters are enabled in agent config" -ForegroundColor White
            Write-Host "  2. Check agent logs for 'Modbus adapter' or 'protocol adapter' messages" -ForegroundColor White
            Write-Host "  3. Verify Modbus sensor is configured in the database" -ForegroundColor White
            exit 1
        }
    } else {
        Write-Host "  No pipes found" -ForegroundColor Yellow
        exit 1
    }
} catch {
    Write-Host "Error listing pipes: $_" -ForegroundColor Red
    exit 1
}

Write-Host "`nAttempting to connect to Modbus pipe..." -ForegroundColor Cyan

# Read from named pipe
try {
    $pipe = New-Object System.IO.Pipes.NamedPipeClientStream(".", $pipeName, [System.IO.Pipes.PipeDirection]::In)
    
    Write-Host "Connecting (5 second timeout)..." -ForegroundColor Yellow
    $pipe.Connect(5000)  # 5 second timeout
    
    if ($pipe.IsConnected) {
        Write-Host "✓ Connected to pipe!" -ForegroundColor Green
        Write-Host "`nReading data (press Ctrl+C to stop)..." -ForegroundColor Cyan
        
        $reader = New-Object System.IO.StreamReader($pipe)
        while($true) {
            if ($pipe.IsConnected) {
                $line = $reader.ReadLine()
                if ($line) {
                    Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $line" -ForegroundColor White
                }
            } else {
                Write-Host "`nPipe disconnected" -ForegroundColor Red
                break
            }
        }
        
        $reader.Close()
        $pipe.Close()
    } else {
        Write-Host "✗ Failed to connect to pipe" -ForegroundColor Red
    }
} catch [System.TimeoutException] {
    Write-Host "`n✗ Connection timeout - no server listening on pipe" -ForegroundColor Red
    Write-Host "  The Modbus adapter created the pipe but isn't actively writing to it yet." -ForegroundColor Yellow
} catch {
    Write-Host "`n✗ Error: $_" -ForegroundColor Red
    Write-Host "  Type: $($_.Exception.GetType().FullName)" -ForegroundColor Yellow
} finally {
    if ($pipe) {
        $pipe.Dispose()
    }
}