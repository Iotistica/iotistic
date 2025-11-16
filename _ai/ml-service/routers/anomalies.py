from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional
from services.data_fetcher import DataFetcher
from models.isolation_forest import IsolationForestAnomalyDetector

router = APIRouter(prefix="/ml/anomalies", tags=["ML Anomaly Detection"])

class AnomalyPoint(BaseModel):
    timestamp: datetime
    is_anomaly: bool
    anomaly_score: float
    severity: str
    cpu_usage: Optional[float] = None
    memory_usage_percent: Optional[float] = None
    disk_usage_percent: Optional[float] = None
    network_total: Optional[float] = None

class TrainResponse(BaseModel):
    message: str
    device_uuid: str
    training_samples: int
    features: List[str]
    contamination: float

class DetectResponse(BaseModel):
    device_uuid: str
    analyzed_points: int
    anomalies_detected: int
    anomalies: List[AnomalyPoint]
    model_info: dict

class ModelInfoResponse(BaseModel):
    device_uuid: str
    model_info: dict

@router.post("/train/{device_uuid}", response_model=TrainResponse)
async def train_anomaly_detector(
    device_uuid: str,
    hours: int = Query(default=168, description="Hours of historical data", ge=24, le=720),
    contamination: float = Query(default=None, description="Expected anomaly rate", ge=0.001, le=0.5)
):
    """
    Train Isolation Forest model for multivariate anomaly detection
    
    The model learns normal device behavior from historical data
    and can then detect unusual patterns across multiple metrics.
    """
    fetcher = None
    try:
        # Fetch data
        fetcher = DataFetcher()
        fetcher.connect()
        
        df = fetcher.fetch_multi_metric_history(device_uuid, hours=hours)
        
        if len(df) < 100:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough data. Need 100+ samples, got {len(df)}"
            )
        
        # Define features for anomaly detection (use only available features)
        all_possible_features = ['cpu_usage', 'memory_usage_percent', 'disk_usage_percent', 'uptime', 'temperature']
        
        # Use only features that exist in the data
        features = [f for f in all_possible_features if f in df.columns and df[f].notna().sum() > 0]
        
        if len(features) < 2:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough features available. Need at least 2, got {len(features)}: {features}"
            )
        
        # Train model
        detector = IsolationForestAnomalyDetector(contamination=contamination)
        detector.train(df, features)
        
        # Save model
        detector.save(device_uuid)
        
        return TrainResponse(
            message="Model trained successfully",
            device_uuid=device_uuid,
            training_samples=len(df),
            features=features,
            contamination=detector.contamination
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")
    finally:
        if fetcher:
            fetcher.close()

@router.get("/detect/{device_uuid}", response_model=DetectResponse)
async def detect_anomalies(
    device_uuid: str,
    hours: int = Query(default=24, description="Hours of data to analyze", ge=1, le=168)
):
    """
    Detect anomalies using trained Isolation Forest model
    
    Returns anomalies detected in the specified time period.
    Anomalies are data points that deviate significantly from learned normal behavior.
    """
    fetcher = None
    try:
        # Load model
        detector = IsolationForestAnomalyDetector()
        detector.load(device_uuid)
        
        # Fetch recent data
        fetcher = DataFetcher()
        fetcher.connect()
        df = fetcher.fetch_multi_metric_history(device_uuid, hours=hours)
        
        if len(df) == 0:
            raise HTTPException(
                status_code=404,
                detail="No data found for specified time period"
            )
        
        # Predict
        results = detector.predict(df)
        
        # Filter only anomalies
        anomalies_df = results[results['is_anomaly']].copy()
        
        # Convert to response model
        anomalies = []
        for _, row in anomalies_df.head(100).iterrows():  # Limit to 100
            anomalies.append(AnomalyPoint(
                timestamp=row['timestamp'],
                is_anomaly=row['is_anomaly'],
                anomaly_score=float(row['anomaly_score']),
                severity=row['severity'],
                cpu_usage=float(row.get('cpu_usage', 0)),
                memory_usage_percent=float(row.get('memory_usage_percent', 0)),
                disk_usage_percent=float(row.get('disk_usage_percent', 0)),
                network_total=float(row.get('network_total', 0))
            ))
        
        return DetectResponse(
            device_uuid=device_uuid,
            analyzed_points=len(results),
            anomalies_detected=len(anomalies_df),
            anomalies=anomalies,
            model_info=detector.get_model_info()
        )
    
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Model not trained. Call /ml/anomalies/train endpoint first."
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Detection failed: {str(e)}")
    finally:
        if fetcher:
            fetcher.close()

@router.get("/model-info/{device_uuid}", response_model=ModelInfoResponse)
async def get_model_info(device_uuid: str):
    """Get information about the trained model"""
    try:
        detector = IsolationForestAnomalyDetector()
        detector.load(device_uuid)
        
        return ModelInfoResponse(
            device_uuid=device_uuid,
            model_info=detector.get_model_info()
        )
    
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Model not trained for this device"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
