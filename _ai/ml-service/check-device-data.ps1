# Check Device Shadow History
# Verifies that device has enough historical data for ML training

param(
    [Parameter(Mandatory=$false)]
    [string]$DeviceUuid = "46b68204-9806-43c5-8d19-18b1f53e3b8a",
    
    [Parameter(Mandatory=$false)]
    [int]$Hours = 168  # 7 days default
)

Write-Host "🔍 Checking device shadow history for ML training..." -ForegroundColor Cyan
Write-Host "   Device UUID: $DeviceUuid" -ForegroundColor White
Write-Host "   Time Range: Last $Hours hours`n" -ForegroundColor White

# Check API is running
Write-Host "📡 Checking API connection..." -ForegroundColor Yellow
try {
    $healthCheck = Invoke-RestMethod -Uri "http://localhost:4002/health" -Method Get -ErrorAction Stop
    Write-Host "✅ API is running`n" -ForegroundColor Green
} catch {
    Write-Host "❌ API is not running!" -ForegroundColor Red
    Write-Host "   Start it with: cd ..\api && docker-compose -f docker-compose.cloud.yml up -d`n" -ForegroundColor Yellow
    exit 1
}

# Query device shadow history
Write-Host "📊 Querying device shadow history..." -ForegroundColor Yellow
try {
    # Check if device exists first
    $deviceCheck = Invoke-RestMethod -Uri "http://localhost:4002/api/v1/devices/$DeviceUuid/shadow" -Method Get -ErrorAction SilentlyContinue
    
    if ($deviceCheck) {
        Write-Host "✅ Device found: $($deviceCheck.data.device_name)`n" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  Device not found in device_shadows table" -ForegroundColor Yellow
    Write-Host "   This is OK if it's a new device`n" -ForegroundColor White
}

# Query history
try {
    $historyUrl = "http://localhost:4002/api/v1/devices/$DeviceUuid/twin/history?hours=$Hours"
    $history = Invoke-RestMethod -Uri $historyUrl -Method Get -ErrorAction Stop
    
    $count = $history.data.Count
    
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "📈 HISTORY ANALYSIS" -ForegroundColor Cyan
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    
    Write-Host "`n✅ Data Points Found: $count" -ForegroundColor Green
    
    # Check if enough for ML training
    $minRequired = 100
    if ($count -ge $minRequired) {
        Write-Host "✅ Sufficient data for ML training (minimum: $minRequired)" -ForegroundColor Green
    } elseif ($count -gt 0) {
        Write-Host "⚠️  Insufficient data for ML training" -ForegroundColor Yellow
        Write-Host "   Found: $count | Required: $minRequired" -ForegroundColor White
        Write-Host "   You can reduce MIN_TRAINING_SAMPLES in config.py for testing" -ForegroundColor White
    } else {
        Write-Host "❌ No historical data found!" -ForegroundColor Red
        Write-Host "   Device needs to report data before training ML models`n" -ForegroundColor Yellow
        exit 1
    }
    
    if ($count -gt 0) {
        # Show sample data
        Write-Host "`n📝 Sample Data (first record):" -ForegroundColor Cyan
        $firstRecord = $history.data[0]
        Write-Host "   Timestamp: $($firstRecord.timestamp)" -ForegroundColor White
        
        # Show available fields
        Write-Host "`n📊 Available Fields for ML Training:" -ForegroundColor Cyan
        $firstRecord.PSObject.Properties | Where-Object { $_.Name -ne 'timestamp' } | ForEach-Object {
            Write-Host "   • $($_.Name): $($_.Value)" -ForegroundColor White
        }
        
        # Time range
        Write-Host "`n📅 Time Range:" -ForegroundColor Cyan
        $oldest = $history.data[-1].timestamp
        $newest = $history.data[0].timestamp
        Write-Host "   Oldest: $oldest" -ForegroundColor White
        Write-Host "   Newest: $newest" -ForegroundColor White
        
        # Data quality check
        Write-Host "`n🔍 Data Quality:" -ForegroundColor Cyan
        $nullCount = 0
        $fields = $firstRecord.PSObject.Properties.Name | Where-Object { $_ -ne 'timestamp' }
        foreach ($field in $fields) {
            $nullsInField = ($history.data | Where-Object { $_.$field -eq $null }).Count
            if ($nullsInField -gt 0) {
                Write-Host "   ⚠️  $field has $nullsInField null values" -ForegroundColor Yellow
                $nullCount += $nullsInField
            }
        }
        
        if ($nullCount -eq 0) {
            Write-Host "   ✅ No null values detected - data quality is good!" -ForegroundColor Green
        }
        
        # Next steps
        Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
        Write-Host "🚀 READY TO TRAIN!" -ForegroundColor Green
        Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
        
        Write-Host "`n📋 Next Steps:" -ForegroundColor Cyan
        Write-Host ""
        Write-Host "1. Start ML Service:" -ForegroundColor Yellow
        Write-Host "   .\run-local.ps1" -ForegroundColor White
        Write-Host ""
        Write-Host "2. Train Anomaly Detection Model:" -ForegroundColor Yellow
        Write-Host "   curl -X POST `"http://localhost:5000/ml/anomalies/train/$DeviceUuid`?hours=$Hours`"" -ForegroundColor White
        Write-Host ""
        Write-Host "3. Train LSTM Forecasting Model (choose a field):" -ForegroundColor Yellow
        $sampleField = ($fields | Select-Object -First 1)
        Write-Host "   curl -X POST `"http://localhost:5000/ml/forecasts/train/$DeviceUuid`?field=$sampleField&hours=$Hours`"" -ForegroundColor White
        Write-Host ""
        Write-Host "4. View API Documentation:" -ForegroundColor Yellow
        Write-Host "   http://localhost:5000/docs" -ForegroundColor White
        Write-Host ""
    }
    
} catch {
    Write-Host "❌ Error querying device history: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "`n💡 Possible reasons:" -ForegroundColor Yellow
    Write-Host "   1. Device UUID not found" -ForegroundColor White
    Write-Host "   2. No historical data exists yet" -ForegroundColor White
    Write-Host "   3. API endpoint not available`n" -ForegroundColor White
    exit 1
}
