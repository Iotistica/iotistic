# ML Service Test Script
# Tests all ML endpoints with a device UUID

param(
    [Parameter(Mandatory=$true)]
    [string]$DeviceUuid,
    
    [Parameter(Mandatory=$false)]
    [int]$Port = 5000
)

$API_BASE = "http://localhost:$Port"

Write-Host "`n╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  🤖 ML Service Test Suite                                ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# Test 1: Health Check
Write-Host "1️⃣  Testing Health Endpoint..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "$API_BASE/health"
    Write-Host "   ✅ Service is healthy" -ForegroundColor Green
    Write-Host "   Status: $($health.status)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "   ❌ Health check failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Make sure ML service is running on port $Port" -ForegroundColor Yellow
    exit 1
}

# Test 2: Train Anomaly Detector
Write-Host "2️⃣  Training Isolation Forest (Anomaly Detection)..." -ForegroundColor Yellow
try {
    $trainResult = Invoke-RestMethod -Uri "$API_BASE/ml/anomalies/train/${DeviceUuid}?hours=168" -Method Post
    Write-Host "   ✅ Model trained successfully" -ForegroundColor Green
    Write-Host "   Training samples: $($trainResult.training_samples)" -ForegroundColor Gray
    Write-Host "   Features: $($trainResult.features -join ', ')" -ForegroundColor Gray
    Write-Host "   Contamination: $($trainResult.contamination)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "   ❌ Training failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 3: Detect Anomalies
Write-Host "3️⃣  Detecting Anomalies..." -ForegroundColor Yellow
try {
    $detectResult = Invoke-RestMethod -Uri "$API_BASE/ml/anomalies/detect/${DeviceUuid}?hours=24"
    Write-Host "   ✅ Anomaly detection completed" -ForegroundColor Green
    Write-Host "   Analyzed points: $($detectResult.analyzed_points)" -ForegroundColor Gray
    Write-Host "   Anomalies detected: $($detectResult.anomalies_detected)" -ForegroundColor $(if ($detectResult.anomalies_detected -gt 0) { "Yellow" } else { "Green" })
    
    if ($detectResult.anomalies_detected -gt 0) {
        Write-Host "   Top anomalies:" -ForegroundColor Gray
        foreach ($anomaly in $detectResult.anomalies | Select-Object -First 3) {
            $timestamp = [DateTime]::Parse($anomaly.timestamp).ToString("MM/dd HH:mm")
            $color = if ($anomaly.severity -eq "critical") { "Red" } else { "Yellow" }
            Write-Host "     - $timestamp | Score: $([math]::Round($anomaly.anomaly_score, 3)) | Severity: $($anomaly.severity)" -ForegroundColor $color
        }
    }
    Write-Host ""
} catch {
    Write-Host "   ❌ Detection failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 4: Train LSTM Forecaster
Write-Host "4️⃣  Training LSTM Forecaster (CPU Usage)..." -ForegroundColor Yellow
try {
    $trainLstm = Invoke-RestMethod -Uri "$API_BASE/ml/forecasts/train/${DeviceUuid}?field=system.cpuUsage&hours=168" -Method Post
    Write-Host "   ✅ LSTM model trained successfully" -ForegroundColor Green
    Write-Host "   Training samples: $($trainLstm.training_samples)" -ForegroundColor Gray
    Write-Host "   Sequence length: $($trainLstm.sequence_length)" -ForegroundColor Gray
    Write-Host "   Forecast horizon: $($trainLstm.forecast_horizon)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "   ❌ LSTM training failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 5: Get Predictions
Write-Host "5️⃣  Getting Future Predictions..." -ForegroundColor Yellow
try {
    $predictResult = Invoke-RestMethod -Uri "$API_BASE/ml/forecasts/predict/${DeviceUuid}?field=system.cpuUsage"
    Write-Host "   ✅ Predictions generated" -ForegroundColor Green
    Write-Host "   Prediction count: $($predictResult.predictions.Count)" -ForegroundColor Gray
    
    Write-Host "   Next 5 predictions:" -ForegroundColor Gray
    foreach ($pred in $predictResult.predictions | Select-Object -First 5) {
        $timestamp = [DateTime]::Parse($pred.timestamp).ToString("MM/dd HH:mm:ss")
        $value = [math]::Round($pred.predicted_value, 2)
        $lower = [math]::Round($pred.confidence_lower, 2)
        $upper = [math]::Round($pred.confidence_upper, 2)
        Write-Host "     - $timestamp | Value: $value% | Range: [$lower% - $upper%]" -ForegroundColor Cyan
    }
    Write-Host ""
} catch {
    Write-Host "   ❌ Prediction failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

# Test 6: Get Model Info
Write-Host "6️⃣  Getting Model Information..." -ForegroundColor Yellow
try {
    $modelInfo = Invoke-RestMethod -Uri "$API_BASE/ml/anomalies/model-info/${DeviceUuid}"
    Write-Host "   ✅ Anomaly detector info retrieved" -ForegroundColor Green
    Write-Host "   Trained: $($modelInfo.model_info.trained)" -ForegroundColor Gray
    Write-Host "   Trained at: $($modelInfo.model_info.trained_at)" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "   ⚠️  Could not retrieve model info" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "╔════════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  ✅ ML Service Test Complete!                            ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""
Write-Host "📚 Next Steps:" -ForegroundColor Yellow
Write-Host "   - View API docs: http://localhost:$Port/docs" -ForegroundColor Gray
Write-Host "   - Integrate with dashboard (see ML-INTEGRATION-GUIDE.md)" -ForegroundColor Gray
Write-Host "   - Set up automated retraining" -ForegroundColor Gray
Write-Host ""
