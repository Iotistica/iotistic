from pydantic_settings import BaseSettings
from pathlib import Path

class Settings(BaseSettings):
    """Configuration for ML Service"""
    
    # Service Info
    SERVICE_NAME: str = "IoT ML Service"
    SERVICE_VERSION: str = "1.0.0"
    
    # Database
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_NAME: str = "iotistic"
    DB_USER: str = "postgres"
    DB_PASSWORD: str = "postgres"
    
    # ML Service
    ML_SERVICE_PORT: int = 5000
    ML_SERVICE_HOST: str = "0.0.0.0"
    
    # Model Configuration
    MODEL_DIR: str = "./models/saved"
    RETRAIN_INTERVAL_HOURS: int = 24
    MIN_TRAINING_SAMPLES: int = 100
    
    # Anomaly Detection (Isolation Forest)
    ISOLATION_FOREST_CONTAMINATION: float = 0.01  # 1% expected anomalies
    ISOLATION_FOREST_N_ESTIMATORS: int = 100
    
    # Time-Series Forecasting (LSTM)
    LSTM_SEQUENCE_LENGTH: int = 50  # Use last 50 points
    LSTM_FORECAST_HORIZON: int = 12  # Predict next 12 points
    LSTM_EPOCHS: int = 50
    LSTM_BATCH_SIZE: int = 32
    
    # CORS
    CORS_ORIGINS: list = ["*"]
    
    class Config:
        env_file = ".env"
        case_sensitive = True

settings = Settings()

# Ensure model directory exists
Path(settings.MODEL_DIR).mkdir(parents=True, exist_ok=True)
