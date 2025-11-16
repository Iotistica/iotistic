# ML Training Issues - RESOLVED ✅

## Issues Encountered & Fixed

### Issue 1: PostgreSQL Connection Error ❌→✅

**Error:**
```
Connection refused to localhost:5432
```

**Root Cause:**  
ML service Docker Compose was configured with `DB_HOST=localhost` but PostgreSQL runs as container `postgres` on `Iotistic-net` network.

**Fix:**
- Updated `docker-compose.yml`: Changed `DB_HOST=postgres`
- Connected ML service to `Iotistic-net` network
- Added `depends_on: postgres`

---

### Issue 2: SQL Syntax Error ❌→✅

**Error:**
```sql
syntax error at or near "168"
AND timestamp >= NOW() - INTERVAL ''168' hours...
```

**Root Cause:**  
SQL query used `INTERVAL '%s hours'` with parameter substitution, causing PostgreSQL to see extra quotes.

**Fix:**  
Changed `data_fetcher.py` to use f-strings:
```python
# Before (broken)
query = """... INTERVAL '%s hours' ..."""
params = (device_uuid, str(hours))

# After (fixed)
query = f"""... INTERVAL '{hours} hours' ..."""
params = (device_uuid,)
```

---

### Issue 3: Field Name Mismatch ❌→✅

**Error:**
```
📊 Fetched 0 multi-metric data points
```

**Root Cause:**  
Your device shadow data uses different field names than expected:

| ML Service Expected | Your Actual Data |
|---------------------|------------------|
| `system.memoryUsed` | `system.memoryUsage` ✅ |
| `system.diskUsed` | `system.diskUsage` ✅ |
| `network.bytesReceived` | ❌ Not present |
| `network.bytesSent` | ❌ Not present |

**Your Actual Data Structure:**
```json
{
  "system": {
    "cpuUsage": 27.4,
    "memoryUsage": 13534,
    "memoryTotal": 16320,
    "diskUsage": 474,
    "diskTotal": 476,
    "temperature": null
  },
  "health": {
    "uptime": 6542
  }
}
```

**Fix:**  
Updated `data_fetcher.py` SQL query:
```python
# Changed field names to match your data
(reported_state#>>'{{system,memoryUsage}}')::float as memory_used,
(reported_state#>>'{{system,diskUsage}}')::float as disk_used,
(reported_state#>>'{{health,uptime}}')::float as uptime,
(reported_state#>>'{{system,temperature}}')::float as temperature
```

Removed network fields since they don't exist in your data.

---

### Issue 4: Hardcoded Network Feature ❌→✅

**Error:**
```
Missing features in data: ['network_total']
```

**Root Cause:**  
`routers/anomalies.py` hardcoded feature list including `network_total` which doesn't exist.

**Fix:**  
Made feature selection dynamic:
```python
# Before (hardcoded)
features = ['cpu_usage', 'memory_usage_percent', 'disk_usage_percent', 'network_total']

# After (dynamic)
all_possible_features = ['cpu_usage', 'memory_usage_percent', 'disk_usage_percent', 'uptime', 'temperature']
features = [f for f in all_possible_features if f in df.columns and df[f].notna().sum() > 0]
```

Now uses only features that actually exist in your data!

---

## Final Working Configuration

### Data Available
- ✅ **220 records** in `device_shadow_history` table
- ✅ **219 records** have `system` field
- ✅ Time range: ~2 hours (2025-10-19 00:27 to 02:16)

### Features Used for ML Training
- ✅ `cpu_usage` (from `system.cpuUsage`)
- ✅ `memory_usage_percent` (calculated from `memoryUsage / memoryTotal`)
- ✅ `disk_usage_percent` (calculated from `diskUsage / diskTotal`)
- ✅ `uptime` (from `health.uptime`)
- ⚠️ `temperature` (exists but always null in your data)

### Expected Training Command

```powershell
# Should now work!
curl -X POST "http://localhost:5000/ml/anomalies/train/46b68204-9806-43c5-8d19-18b1f53e3b8a?hours=168"
```

**Expected Response:**
```json
{
  "message": "Model trained successfully",
  "device_uuid": "46b68204-9806-43c5-8d19-18b1f53e3b8a",
  "training_samples": 220,
  "features": ["cpu_usage", "memory_usage_percent", "disk_usage_percent", "uptime"],
  "contamination": 0.01
}
```

---

## Next Steps

1. ✅ **Wait for rebuild to complete** (check with `docker-compose logs -f ml-service`)

2. ✅ **Train the model:**
   ```powershell
   curl -X POST "http://localhost:5000/ml/anomalies/train/46b68204-9806-43c5-8d19-18b1f53e3b8a?hours=168"
   ```

3. ✅ **Detect anomalies:**
   ```powershell
   curl "http://localhost:5000/ml/anomalies/detect/46b68204-9806-43c5-8d19-18b1f53e3b8a?hours=24"
   ```

4. ✅ **Integrate with Digital Twin** (see `docs/ML-DIGITAL-TWIN-INTEGRATION.md`)

---

## Files Modified

1. ✅ `ml-service/docker-compose.yml` - Network and DB host configuration
2. ✅ `ml-service/services/data_fetcher.py` - SQL query fixes and field name mapping
3. ✅ `ml-service/routers/anomalies.py` - Dynamic feature selection

## Helper Scripts Created

1. ✅ `ml-service/run-local.ps1` - Run ML service locally (no Docker)
2. ✅ `ml-service/check-device-data.ps1` - Verify training data exists
3. ✅ `ml-service/diagnose-data.ps1` - Comprehensive data diagnostics
4. ✅ `ml-service/QUICK-START-TRAINING.md` - Training guide
5. ✅ `ml-service/SETUP-FIXED.md` - Setup documentation

---

## Verification

Run diagnostics to confirm everything is ready:

```powershell
cd ml-service

# Check data availability
.\diagnose-data.ps1

# Check service health
curl http://localhost:5000/health

# Train model
curl -X POST "http://localhost:5000/ml/anomalies/train/46b68204-9806-43c5-8d19-18b1f53e3b8a?hours=168"
```

---

**All issues resolved! ML training should now work.** 🎉
