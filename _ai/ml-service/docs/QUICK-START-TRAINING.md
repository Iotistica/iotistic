# Quick Start Guide: Training ML Models

## 🎯 Two Ways to Run ML Service

### Option 1: Run Locally (Recommended for Development)

**Pros:**
- Faster startup
- Easy debugging
- Live code reload
- Direct access to logs

**Steps:**

```powershell
# 1. Make sure PostgreSQL is running
cd ..\api
docker-compose -f docker-compose.cloud.yml up -d postgres

# 2. Run ML service locally
cd ..\ml-service
.\run-local.ps1
```

The service will start on `http://localhost:5000`

---

### Option 2: Run in Docker (Production)

**Pros:**
- Isolated environment
- Production-like setup
- Auto-restart

**Steps:**

```powershell
# 1. Start API stack (includes PostgreSQL)
cd ..\api
docker-compose -f docker-compose.cloud.yml up -d

# 2. Start ML service (connected to same network)
cd ..\ml-service
docker-compose up -d
```

---

## 🚀 Train Your First Model

### 1. Check ML Service Status

```powershell
curl http://localhost:5000/health
```

**Expected Response:**
```json
{
  "status": "healthy"
}
```

### 2. Train Anomaly Detection Model

```powershell
# Train on last 7 days (168 hours) of data
curl -X POST "http://localhost:5000/ml/anomalies/train/46b68204-9806-43c5-8d19-18b1f53e3b8a?hours=168"
```

**Expected Response:**
```json
{
  "message": "Model trained successfully",
  "device_uuid": "46b68204-9806-43c5-8d19-18b1f53e3b8a",
  "training_samples": 10080,
  "features": ["cpu_usage", "memory_usage_percent", "disk_usage_percent", "network_total"]
}
```

### 3. Detect Anomalies

```powershell
# Analyze last 24 hours
curl "http://localhost:5000/ml/anomalies/detect/46b68204-9806-43c5-8d19-18b1f53e3b8a?hours=24"
```

### 4. Train LSTM Forecasting Model

```powershell
# Train on CPU usage (last 7 days)
curl -X POST "http://localhost:5000/ml/forecasts/train/46b68204-9806-43c5-8d19-18b1f53e3b8a?field=system.cpuUsage&hours=168"
```

### 5. Predict Future Values

```powershell
# Predict next 12 data points
curl "http://localhost:5000/ml/forecasts/predict/46b68204-9806-43c5-8d19-18b1f53e3b8a?field=system.cpuUsage"
```

---

## 🔍 Troubleshooting

### Error: "Connection refused" to PostgreSQL

**Problem:** ML service can't connect to database

**Solution:**

1. **Check PostgreSQL is running:**
   ```powershell
   docker ps --filter "name=postgres"
   ```

2. **If running locally (run-local.ps1):**
   - Make sure PostgreSQL port 5432 is exposed
   - Check `docker-compose.cloud.yml` has `ports: - "5432:5432"`

3. **If running in Docker:**
   - Make sure `Iotistic-net` network exists:
     ```powershell
     docker network ls | Select-String Iotistic-net
     ```
   - If not, create it:
     ```powershell
     docker network create Iotistic-net
     ```
   - Restart ML service:
     ```powershell
     docker-compose restart ml-service
     ```

### Error: "Not enough data"

**Problem:** Device doesn't have 100+ historical data points

**Solution:**

1. **Check device shadow history:**
   ```powershell
   curl "http://localhost:4002/api/v1/devices/46b68204-9806-43c5-8d19-18b1f53e3b8a/twin/history?hours=168"
   ```

2. **Generate test data first** (if needed - see API documentation)

3. **Reduce required samples** (for testing only):
   - Edit `ml-service/config.py`
   - Change `MIN_TRAINING_SAMPLES = 10` (instead of 100)

### Error: "Model not found" when detecting anomalies

**Problem:** You need to train the model first

**Solution:**
```powershell
# Train before detecting
curl -X POST "http://localhost:5000/ml/anomalies/train/<device-uuid>?hours=168"

# Then detect
curl "http://localhost:5000/ml/anomalies/detect/<device-uuid>?hours=24"
```

---

## 📊 View API Documentation

Open in browser:

- **Swagger UI:** http://localhost:5000/docs
- **ReDoc:** http://localhost:5000/redoc

---

## 🎯 Next Steps

1. ✅ Start ML service (choose Option 1 or 2 above)
2. ✅ Train your first model
3. ✅ Detect anomalies
4. ✅ Integrate with Digital Twin entities (see `ML-DIGITAL-TWIN-INTEGRATION.md`)
5. ✅ Build dashboard showing predictions

---

## 🔗 Related Documentation

- **ML Integration Guide:** `docs/ML-INTEGRATION-GUIDE.md`
- **Digital Twin Integration:** `docs/ML-DIGITAL-TWIN-INTEGRATION.md`
- **API Documentation:** http://localhost:5000/docs

---

**Need help?** Check the logs:

```powershell
# If running locally
# Logs appear in terminal

# If running in Docker
docker-compose logs -f ml-service
```
