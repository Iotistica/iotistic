# ML Service Setup - FIXED

## ✅ Problem Solved

**Original Error:**
```
Connection refused to localhost:5432
```

**Root Cause:**
ML service was configured to connect to `localhost:5432`, but PostgreSQL is running in Docker on the `Iotistic-net` network as container `postgres`.

**Solution:**
Updated ML service Docker Compose to:
1. Use `DB_HOST=postgres` (container name, not localhost)
2. Connect to `Iotistic-net` network (same as PostgreSQL)
3. Add dependency on PostgreSQL container

---

## 🚀 Quick Start (Choose One)

### Option A: Run ML Service Locally (Fastest)

```powershell
# 1. Navigate to ml-service folder
cd ml-service

# 2. Check if you have enough data
.\check-device-data.ps1

# 3. Start ML service locally
.\run-local.ps1
```

**Access:** http://localhost:5000/docs

---

### Option B: Run ML Service in Docker

```powershell
# 1. Make sure API stack is running (PostgreSQL)
cd api
docker-compose -f docker-compose.cloud.yml up -d

# 2. Start ML service
cd ..\ml-service
docker-compose up -d

# 3. Check logs
docker-compose logs -f ml-service
```

**Access:** http://localhost:5000/docs

---

## 📊 Train Your Models

### Step 1: Verify Data Exists

```powershell
cd ml-service
.\check-device-data.ps1
```

**Expected Output:**
```
✅ Data Points Found: 10080
✅ Sufficient data for ML training (minimum: 100)

🚀 READY TO TRAIN!
```

### Step 2: Train Anomaly Detection

```powershell
# Train Isolation Forest on last 7 days
curl -X POST "http://localhost:5000/ml/anomalies/train/46b68204-9806-43c5-8d19-18b1f53e3b8a?hours=168"
```

**Success Response:**
```json
{
  "message": "Model trained successfully",
  "device_uuid": "46b68204-9806-43c5-8d19-18b1f53e3b8a",
  "training_samples": 10080,
  "features": ["cpu_usage", "memory_usage_percent", "disk_usage_percent", "network_total"]
}
```

### Step 3: Detect Anomalies

```powershell
curl "http://localhost:5000/ml/anomalies/detect/46b68204-9806-43c5-8d19-18b1f53e3b8a?hours=24"
```

### Step 4: Train LSTM Forecaster

```powershell
curl -X POST "http://localhost:5000/ml/forecasts/train/46b68204-9806-43c5-8d19-18b1f53e3b8a?field=system.cpuUsage&hours=168"
```

### Step 5: Predict Future

```powershell
curl "http://localhost:5000/ml/forecasts/predict/46b68204-9806-43c5-8d19-18b1f53e3b8a?field=system.cpuUsage"
```

---

## 🔍 Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Docker Network                         │
│                   Iotistic-net                            │
│                                                          │
│  ┌──────────────┐           ┌──────────────┐           │
│  │  PostgreSQL  │◄──────────┤  ML Service  │           │
│  │  (postgres)  │           │ (ml-service) │           │
│  │  Port: 5432  │           │  Port: 5000  │           │
│  └──────┬───────┘           └──────────────┘           │
│         │                                                │
│         │                                                │
│  ┌──────▼───────┐                                       │
│  │  API Service │                                       │
│  │  (iotistic-  │                                       │
│  │   api)       │                                       │
│  │  Port: 4002  │                                       │
│  └──────────────┘                                       │
└─────────────────────────────────────────────────────────┘
```

**OR (if running ML service locally):**

```
┌──────────────────┐
│  Your Machine    │
│                  │
│  ┌────────────┐  │      ┌─────────────────────┐
│  │ ML Service │◄─┼──────┤  Docker Network     │
│  │ (Python)   │  │      │  Iotistic-net        │
│  │ Port: 5000 │  │      │                     │
│  └────────────┘  │      │  ┌──────────────┐  │
│                  │      │  │  PostgreSQL  │  │
└──────────────────┘      │  │  Port: 5432  │  │
                          │  └──────────────┘  │
                          └─────────────────────┘
```

---

## 🛠️ Files Modified

1. **`docker-compose.yml`**
   - Changed `DB_HOST` from `localhost` to `postgres`
   - Changed network from `ml-network` to `Iotistic-net`
   - Added `depends_on: postgres`

2. **Created `run-local.ps1`**
   - Run ML service locally without Docker
   - Connects to PostgreSQL on localhost:5432

3. **Created `check-device-data.ps1`**
   - Verify device has enough historical data
   - Show data quality metrics
   - Display next steps

4. **Created `QUICK-START-TRAINING.md`**
   - Step-by-step training guide
   - Troubleshooting tips

---

## 🎯 What's Next?

1. ✅ **Start ML Service** (use run-local.ps1 or docker-compose)
2. ✅ **Train Models** (anomaly detection + forecasting)
3. ✅ **Integrate with Digital Twin** (see `docs/ML-DIGITAL-TWIN-INTEGRATION.md`)
4. ✅ **Build Dashboard** (show predictions with entity context)
5. ✅ **Set up Auto-Retraining** (retrain models every 24 hours)

---

## 📚 Documentation

- **Quick Start:** `QUICK-START-TRAINING.md`
- **ML Integration:** `docs/ML-INTEGRATION-GUIDE.md`
- **Digital Twin Integration:** `docs/ML-DIGITAL-TWIN-INTEGRATION.md`
- **API Docs:** http://localhost:5000/docs

---

## 🆘 Troubleshooting

### ML Service won't start

**Check PostgreSQL is running:**
```powershell
docker ps --filter "name=postgres"
```

**Check network exists:**
```powershell
docker network ls | Select-String Iotistic-net
```

**View logs:**
```powershell
# If running locally
# Check terminal output

# If running in Docker
docker-compose logs -f ml-service
```

### Not enough training data

**Solution 1:** Wait for more data to accumulate (need 100+ data points)

**Solution 2:** Reduce minimum samples (for testing):
- Edit `config.py`
- Change `MIN_TRAINING_SAMPLES = 10`

### Model not found error

**Solution:** Train the model first before detecting/predicting:
```powershell
curl -X POST "http://localhost:5000/ml/anomalies/train/<device-uuid>?hours=168"
```

---

**Now you can train ML models! 🎉**

Start with: `.\run-local.ps1` (easiest) or `docker-compose up -d` (production)
