# Quick ML Training Test
# Run this after docker-compose build completes

Write-Host "🚀 Testing ML Training Setup`n" -ForegroundColor Cyan

# Check if ML service is running
Write-Host "1️⃣ Checking ML service status..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:5000/health" -Method Get -ErrorAction Stop
    Write-Host "   ✅ ML service is running`n" -ForegroundColor Green
} catch {
    Write-Host "   ❌ ML service not running!" -ForegroundColor Red
    Write-Host "   Start with: docker-compose up -d --build`n" -ForegroundColor Yellow
    exit 1
}

# Device UUID
$deviceUuid = "46b68204-9806-43c5-8d19-18b1f53e3b8a"

# Train model
Write-Host "2️⃣ Training Isolation Forest model..." -ForegroundColor Yellow
Write-Host "   Device: $deviceUuid" -ForegroundColor White
Write-Host "   Training on last 168 hours (7 days)`n" -ForegroundColor White

try {
    $trainResult = Invoke-RestMethod `
        -Uri "http://localhost:5000/ml/anomalies/train/$deviceUuid`?hours=168" `
        -Method POST `
        -ErrorAction Stop
    
    Write-Host "   ✅ Training successful!`n" -ForegroundColor Green
    Write-Host "   📊 Results:" -ForegroundColor Cyan
    Write-Host "      • Samples: $($trainResult.training_samples)" -ForegroundColor White
    Write-Host "      • Features: $($trainResult.features -join ', ')" -ForegroundColor White
    Write-Host "      • Contamination: $($trainResult.contamination)`n" -ForegroundColor White
    
    # Detect anomalies
    Write-Host "3️⃣ Detecting anomalies in last 24 hours..." -ForegroundColor Yellow
    
    $detectResult = Invoke-RestMethod `
        -Uri "http://localhost:5000/ml/anomalies/detect/$deviceUuid`?hours=24" `
        -Method GET `
        -ErrorAction Stop
    
    Write-Host "   ✅ Detection complete!`n" -ForegroundColor Green
    Write-Host "   📊 Results:" -ForegroundColor Cyan
    Write-Host "      • Analyzed: $($detectResult.analyzed_points) data points" -ForegroundColor White
    Write-Host "      • Anomalies: $($detectResult.anomalies_detected) detected`n" -ForegroundColor White
    
    if ($detectResult.anomalies_detected -gt 0) {
        Write-Host "   ⚠️  Anomalies found:" -ForegroundColor Yellow
        foreach ($anomaly in $detectResult.anomalies | Select-Object -First 5) {
            Write-Host "      • $($anomaly.timestamp) - Severity: $($anomaly.severity) (Score: $($anomaly.anomaly_score.ToString('F3')))" -ForegroundColor White
        }
    } else {
        Write-Host "   ✅ No anomalies detected - system is healthy!" -ForegroundColor Green
    }
    
    Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "🎉 ML TRAINING SUCCESS!" -ForegroundColor Green
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    
    Write-Host "`n📋 Next Steps:" -ForegroundColor Yellow
    Write-Host "   1. View API docs: http://localhost:5000/docs" -ForegroundColor White
    Write-Host "   2. Integrate with Digital Twin (see ML-DIGITAL-TWIN-INTEGRATION.md)" -ForegroundColor White
    Write-Host "   3. Build dashboard showing predictions" -ForegroundColor White
    Write-Host "   4. Set up automated retraining (every 24 hours)`n" -ForegroundColor White
    
} catch {
    Write-Host "   ❌ Training failed!`n" -ForegroundColor Red
    
    $errorDetail = $_.ErrorDetails.Message | ConvertFrom-Json
    Write-Host "   Error: $($errorDetail.detail)`n" -ForegroundColor Red
    
    Write-Host "💡 Troubleshooting:" -ForegroundColor Yellow
    Write-Host "   1. Check data exists: .\diagnose-data.ps1" -ForegroundColor White
    Write-Host "   2. View service logs: docker-compose logs ml-service" -ForegroundColor White
    Write-Host "   3. Review ISSUES-RESOLVED.md for common problems`n" -ForegroundColor White
    
    exit 1
}
