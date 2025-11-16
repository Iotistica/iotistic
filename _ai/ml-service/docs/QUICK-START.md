# 🚀 ML Service Quick Start Guide

## What You Just Got

A **complete Python ML service** with:
- ✅ **Isolation Forest** - Advanced anomaly detection
- ✅ **LSTM Neural Network** - Time-series forecasting
- ✅ **FastAPI REST API** - Production-ready HTTP endpoints
- ✅ **Docker integration** - Ready to deploy
- ✅ **PostgreSQL integration** - Uses your existing database

---

## 🎯 Quick Start (Local Development)

### Option 1: Python Directly (Fastest for development)

```powershell
# 1. Navigate to ml-service
cd ml-service

# 2. Create Python virtual environment
python -m venv venv

# 3. Activate virtual environment
.\venv\Scripts\Activate.ps1

# 4. Install dependencies
pip install -r requirements.txt

# 5. Configure environment
cp .env.example .env
# Edit .env if needed (defaults should work)

# 6. Start service
python main.py
```

Service will start on: **http://localhost:5000**

API Documentation: **http://localhost:5000/docs**

### Option 2: Docker (Production-like)

```powershell
# From project root
docker-compose -f docker-compose.dev.yml up -d ml-service
```

---

## 🧪 Test the Service

Once running, test with your device UUID:

```powershell
cd ml-service
.\test-ml-service.ps1 -DeviceUuid "46b68204-9806-43c5-8d19-18b1f53e3b8a"
```

This will:
1. ✅ Check service health
2. 🤖 Train anomaly detector (Isolation Forest)
3. 🔍 Detect anomalies in last 24 hours
4. 🧠 Train LSTM forecaster
5. 📈 Generate predictions for next 12 minutes
6. 📊 Show model information

---

## 📚 API Endpoints

### Anomaly Detection

```bash
# Train model
curl -X POST "http://localhost:5000/ml/anomalies/train/{uuid}?hours=168"

# Detect anomalies
curl "http://localhost:5000/ml/anomalies/detect/{uuid}?hours=24"

# Get model info
curl "http://localhost:5000/ml/anomalies/model-info/{uuid}"
```

### Time-Series Forecasting

```bash
# Train forecaster
curl -X POST "http://localhost:5000/ml/forecasts/train/{uuid}?field=system.cpuUsage&hours=168"

# Get predictions
curl "http://localhost:5000/ml/forecasts/predict/{uuid}?field=system.cpuUsage"

# Get model info
curl "http://localhost:5000/ml/forecasts/model-info/{uuid}?field=system.cpuUsage"
```

---

## 🔧 Configuration

Edit `.env` or set environment variables:

### Database (Required)
```bash
DB_HOST=localhost        # PostgreSQL host
DB_PORT=5432            # PostgreSQL port
DB_NAME=iotistic        # Database name
DB_USER=postgres        # Database user
DB_PASSWORD=postgres    # Database password
```

### ML Configuration
```bash
# Anomaly Detection
ISOLATION_FOREST_CONTAMINATION=0.01    # 1% expected anomalies
ISOLATION_FOREST_N_ESTIMATORS=100      # Number of trees

# Time-Series Forecasting
LSTM_SEQUENCE_LENGTH=50     # Use last 50 points as input
LSTM_FORECAST_HORIZON=12    # Predict next 12 points
LSTM_EPOCHS=50              # Training epochs
LSTM_BATCH_SIZE=32          # Batch size

# Training
MIN_TRAINING_SAMPLES=100    # Minimum data points required
```

---

## 📊 How It Works

### 1. Anomaly Detection (Isolation Forest)

**What it does:**
- Analyzes **multiple metrics simultaneously** (CPU, memory, disk, network)
- Learns what "normal" looks like for each device
- Detects **complex patterns** that Z-score misses

**When to use:**
- Multi-dimensional anomalies (e.g., high CPU + low memory + network spike)
- Unknown anomaly patterns
- Periodic deep analysis (hourly/daily)

**Example:**
```json
{
  "anomalies_detected": 3,
  "anomalies": [
    {
      "timestamp": "2025-10-18T14:32:00Z",
      "is_anomaly": true,
      "anomaly_score": -0.342,
      "severity": "warning",
      "cpu_usage": 95.2,
      "memory_usage_percent": 12.5,
      "disk_usage_percent": 45.0,
      "network_total": 1500000
    }
  ]
}
```

### 2. Time-Series Forecasting (LSTM)

**What it does:**
- Predicts **future values** based on historical patterns
- Learns temporal dependencies
- Provides **confidence intervals**

**When to use:**
- Capacity planning ("CPU will hit 90% in 2 hours")
- Predictive maintenance
- Resource allocation

**Example:**
```json
{
  "predictions": [
    {
      "timestamp": "2025-10-18T15:01:00Z",
      "predicted_value": 45.2,
      "confidence_lower": 40.1,
      "confidence_upper": 50.3
    }
  ]
}
```

---

## 🎨 Dashboard Integration

### React Component Example

```typescript
// Fetch ML predictions
const mlRes = await fetch(
  `http://localhost:5000/ml/forecasts/predict/${deviceUuid}?field=system.cpuUsage`
);
const mlData = await mlRes.json();

// Add to chart
datasets: [
  {
    label: 'Historical',
    data: historicalData
  },
  {
    label: 'ML Prediction',
    data: mlData.predictions,
    borderDash: [5, 5]  // Dashed line
  }
]
```

See `api/docs/DASHBOARD-INTEGRATION.md` for complete examples.

---

## 🔄 Model Lifecycle

### Initial Training
```powershell
# Train on 7 days of data
curl -X POST "http://localhost:5000/ml/anomalies/train/{uuid}?hours=168"
curl -X POST "http://localhost:5000/ml/forecasts/train/{uuid}?field=system.cpuUsage&hours=168"
```

### Retraining
Models should be retrained regularly (every 24 hours recommended):

```powershell
# Add to scheduled task
$devices = @("uuid1", "uuid2", "uuid3")
foreach ($device in $devices) {
    curl -X POST "http://localhost:5000/ml/anomalies/train/$device?hours=168"
    curl -X POST "http://localhost:5000/ml/forecasts/train/$device?field=system.cpuUsage&hours=168"
}
```

### Model Storage
Trained models are saved in `models/saved/`:
- **Local**: `./ml-service/models/saved/`
- **Docker**: Volume `ml-models` (persisted across restarts)

---

## 🆚 Comparison: Z-Score vs ML

| Feature | Z-Score (API) | Isolation Forest (ML) | LSTM (ML) |
|---------|---------------|----------------------|-----------|
| **Setup** | ⭐ None | ⭐⭐ Training required | ⭐⭐⭐ Training required |
| **Speed** | ⚡ Instant | 🚀 Fast (~1s) | 🐌 Slower (~2-5s) |
| **Multi-metric** | ❌ No | ✅ Yes | ✅ Yes |
| **Predictions** | ❌ No | ❌ No | ✅ Yes |
| **Complex patterns** | ❌ No | ✅ Yes | ✅ Yes |
| **Best for** | Real-time alerts | Hourly analysis | Daily forecasts |

**Recommendation:** Use all three!
- **Z-Score**: Immediate alerts
- **Isolation Forest**: Hourly deep scan
- **LSTM**: Daily predictions

---

## 🐛 Troubleshooting

### "Not enough data" error
**Problem:** Need at least 100 data points

**Solution:**
- Increase `hours` parameter: `?hours=168` (7 days)
- Wait for more data to accumulate
- Check if device is publishing regularly

### "Model not found" error
**Problem:** Model hasn't been trained yet

**Solution:**
```bash
# Train the model first
curl -X POST "http://localhost:5000/ml/anomalies/train/{uuid}?hours=168"
```

### Service won't start
**Problem:** Port 5000 already in use

**Solution:**
```bash
# Change port in .env
ML_SERVICE_PORT=5001

# Or specify when running
uvicorn main:app --port 5001
```

### Database connection failed
**Problem:** Can't connect to PostgreSQL

**Solution:**
- Check PostgreSQL is running: `docker ps | grep postgres`
- Verify credentials in `.env`
- For Docker: Use `DB_HOST=postgres` (container name)
- For local: Use `DB_HOST=localhost`

### Slow predictions
**Problem:** LSTM inference takes time

**Solution:**
- Reduce `LSTM_SEQUENCE_LENGTH` (default: 50)
- Reduce `LSTM_FORECAST_HORIZON` (default: 12)
- Use GPU for faster inference (requires CUDA)

---

## 📈 Performance Tips

### Training
- **More data = better models**: Use 7+ days (168 hours)
- **Schedule training during off-peak hours**
- **Retrain every 24 hours** for best accuracy

### Production Deployment
```bash
# Use production server
gunicorn main:app --workers 4 --worker-class uvicorn.workers.UvicornWorker --bind 0.0.0.0:5000

# Or with Docker (already configured)
docker-compose -f docker-compose.dev.yml up -d ml-service
```

### GPU Acceleration (Optional)
```bash
# For faster LSTM training
pip install tensorflow-gpu

# Requires NVIDIA GPU with CUDA
```

---

## 🚀 Next Steps

1. **Test the service**: Run `test-ml-service.ps1`
2. **Train models for all devices**
3. **Integrate with dashboard** (see DASHBOARD-INTEGRATION.md)
4. **Set up automated retraining** (scheduled task/cron)
5. **Monitor model performance**

---

## 📖 Documentation

- **API Docs**: http://localhost:5000/docs (Swagger UI)
- **ReDoc**: http://localhost:5000/redoc (Alternative UI)
- **Integration Guide**: `api/docs/ML-INTEGRATION-GUIDE.md`
- **Dashboard Examples**: `api/docs/DASHBOARD-INTEGRATION.md`

---

## 🎉 You're Ready!

Your ML service is complete and ready to use. Start with:

```powershell
# 1. Start service
cd ml-service
python main.py

# 2. Test it
.\test-ml-service.ps1 -DeviceUuid "your-uuid"

# 3. View API docs
Start-Process "http://localhost:5000/docs"
```

Happy machine learning! 🤖📊
