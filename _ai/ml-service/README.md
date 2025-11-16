# IoT ML Service

Machine Learning service for Digital Twin anomaly detection and time-series forecasting.

## Features

### 1. Multivariate Anomaly Detection (Isolation Forest)
- Detects complex patterns across multiple metrics
- Learns normal device behavior
- Severity classification (warning/critical)
- Better than Z-score for multi-dimensional data

### 2. Time-Series Forecasting (LSTM)
- Predicts future values based on historical patterns
- Confidence intervals
- Supports any metric field
- Use for capacity planning and predictive maintenance

## Quick Start

### 1. Install Dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure Environment

Copy `.env.example` to `.env` and update:

```bash
cp .env.example .env
```

### 3. Run Service

```bash
# Development mode (auto-reload)
python main.py

# Or with uvicorn directly
uvicorn main:app --host 0.0.0.0 --port 5000 --reload
```

### 4. Access API Documentation

- Swagger UI: http://localhost:5000/docs
- ReDoc: http://localhost:5000/redoc

## Docker Deployment

```bash
# Build image
docker build -t iotistic/ml-service:latest .

# Run container
docker run -d \
  --name ml-service \
  -p 5000:5000 \
  -e DB_HOST=postgres \
  -e DB_PORT=5432 \
  -e DB_NAME=iotistic \
  -e DB_USER=postgres \
  -e DB_PASSWORD=postgres \
  -v ml-models:/app/models/saved \
  iotistic/ml-service:latest
```

## API Usage

### Train Anomaly Detector

```bash
curl -X POST "http://localhost:5000/ml/anomalies/train/46b68204-9806-43c5-8d19-18b1f53e3b8a?hours=168"
```

Response:
```json
{
  "message": "Model trained successfully",
  "device_uuid": "46b68204-9806-43c5-8d19-18b1f53e3b8a",
  "training_samples": 10080,
  "features": ["cpu_usage", "memory_usage_percent", "disk_usage_percent", "network_total"],
  "contamination": 0.01
}
```

### Detect Anomalies

```bash
curl "http://localhost:5000/ml/anomalies/detect/46b68204-9806-43c5-8d19-18b1f53e3b8a?hours=24"
```

### Train Forecaster

```bash
curl -X POST "http://localhost:5000/ml/forecasts/train/46b68204-9806-43c5-8d19-18b1f53e3b8a?field=system.cpuUsage&hours=168"
```

### Get Predictions

```bash
curl "http://localhost:5000/ml/forecasts/predict/46b68204-9806-43c5-8d19-18b1f53e3b8a?field=system.cpuUsage"
```

Response:
```json
{
  "device_uuid": "46b68204-9806-43c5-8d19-18b1f53e3b8a",
  "field": "system.cpuUsage",
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

## Project Structure

```
ml-service/
├── main.py                 # FastAPI application
├── config.py               # Configuration management
├── requirements.txt        # Python dependencies
├── Dockerfile             # Docker image definition
├── models/                # ML models
│   ├── isolation_forest.py
│   └── lstm_forecast.py
├── services/              # Business logic
│   └── data_fetcher.py
├── routers/               # API routes
│   ├── anomalies.py
│   └── forecasts.py
└── tests/                 # Unit tests
```

## Models

### Isolation Forest
- **Type**: Unsupervised anomaly detection
- **Input**: Multiple metrics (CPU, memory, disk, network)
- **Output**: Anomaly score, severity, is_anomaly flag
- **Best for**: Complex patterns, multi-dimensional anomalies

### LSTM
- **Type**: Supervised time-series forecasting
- **Input**: Sequential historical data
- **Output**: Future predictions with confidence intervals
- **Best for**: Capacity planning, predictive maintenance

## Configuration

Key environment variables:

- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` - PostgreSQL connection
- `ML_SERVICE_PORT` - Service port (default: 5000)
- `MODEL_DIR` - Where to save trained models
- `MIN_TRAINING_SAMPLES` - Minimum data points required (default: 100)
- `ISOLATION_FOREST_CONTAMINATION` - Expected anomaly rate (default: 0.01)
- `LSTM_SEQUENCE_LENGTH` - Input sequence length (default: 50)
- `LSTM_FORECAST_HORIZON` - Prediction steps (default: 12)

## Integration with Digital Twin API

The ML service complements the existing Z-score anomaly detection:

| Method | Use Case | Speed |
|--------|----------|-------|
| Z-Score (API) | Real-time alerts | ⚡ Instant |
| Isolation Forest (ML) | Hourly deep analysis | 🚀 Fast |
| LSTM (ML) | Daily predictions | 🐌 Slower |

**Recommendation**: Use all three for comprehensive monitoring!

## Model Persistence

Trained models are saved in `MODEL_DIR` (default: `./models/saved/`):

```
models/saved/
├── isolation_forest/
│   ├── {uuid}_model.joblib
│   ├── {uuid}_scaler.joblib
│   └── {uuid}_metadata.joblib
└── lstm/
    ├── {uuid}_{field}_lstm.h5
    ├── {uuid}_{field}_scaler.joblib
    └── {uuid}_{field}_metadata.joblib
```

Mount as Docker volume for persistence:
```bash
-v ml-models:/app/models/saved
```

## Performance Tips

1. **Training**: Schedule during off-peak hours
2. **Data Volume**: More training data = better models (recommend 7+ days)
3. **Retraining**: Retrain models every 24 hours for best accuracy
4. **GPU**: For faster LSTM training, use TensorFlow with CUDA

## Troubleshooting

### "Not enough data" error
- Need at least 100 data points
- Increase `hours` parameter in training request
- Check if device is publishing data regularly

### "Model not found" error
- Train the model first using `/train` endpoint
- Check `MODEL_DIR` permissions
- Verify model files exist

### Slow predictions
- LSTM inference is slower than statistical methods
- Consider reducing `sequence_length` or `forecast_horizon`
- Use batch predictions for multiple devices

## Development

### Run Tests

```bash
pytest tests/ -v
```

### Code Quality

```bash
# Format code
black .

# Lint
pylint models/ services/ routers/
```

## Future Enhancements

- [ ] XGBoost for predictive maintenance
- [ ] Autoencoders for complex anomaly detection
- [ ] Prophet for seasonal forecasting
- [ ] Model A/B testing framework
- [ ] Model drift detection
- [ ] Automated hyperparameter tuning
- [ ] Real-time predictions via WebSocket

## License

Same as parent project.

## Support

For issues or questions, see main project documentation.
