from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from datetime import datetime
from typing import List
from services.data_fetcher import DataFetcher
from models.lstm_forecast import LSTMForecaster

router = APIRouter(prefix="/ml/forecasts", tags=["ML Time-Series Forecasting"])

class Prediction(BaseModel):
    timestamp: datetime
    predicted_value: float
    confidence_lower: float
    confidence_upper: float

class TrainForecastResponse(BaseModel):
    message: str
    device_uuid: str
    field: str
    training_samples: int
    sequence_length: int
    forecast_horizon: int

class ForecastResponse(BaseModel):
    device_uuid: str
    field: str
    predictions: List[Prediction]
    model_info: dict

class ModelInfoResponse(BaseModel):
    device_uuid: str
    field: str
    model_info: dict

@router.post("/train/{device_uuid}", response_model=TrainForecastResponse)
async def train_forecaster(
    device_uuid: str,
    field: str = Query(default="system.cpuUsage", description="Field to predict"),
    hours: int = Query(default=168, description="Hours of historical data", ge=24, le=720)
):
    """
    Train LSTM forecaster for time-series prediction
    
    The model learns temporal patterns from historical data
    and can predict future values.
    """
    fetcher = None
    try:
        # Fetch data
        fetcher = DataFetcher()
        fetcher.connect()
        df = fetcher.fetch_device_history(device_uuid, field, hours=hours)
        
        if len(df) < 100:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough data. Need 100+ samples, got {len(df)}"
            )
        
        # Train LSTM
        forecaster = LSTMForecaster()
        forecaster.train(df, value_column='value')
        
        # Save model
        forecaster.save(device_uuid, field)
        
        return TrainForecastResponse(
            message="LSTM model trained successfully",
            device_uuid=device_uuid,
            field=field,
            training_samples=forecaster.training_samples,
            sequence_length=forecaster.sequence_length,
            forecast_horizon=forecaster.forecast_horizon
        )
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Training failed: {str(e)}")
    finally:
        if fetcher:
            fetcher.close()

@router.get("/predict/{device_uuid}", response_model=ForecastResponse)
async def predict_future(
    device_uuid: str,
    field: str = Query(default="system.cpuUsage", description="Field to predict")
):
    """
    Predict future values using trained LSTM model
    
    Returns predictions for the next N time steps (default: 12 minutes).
    Includes confidence intervals based on recent data variance.
    """
    fetcher = None
    try:
        # Load model
        forecaster = LSTMForecaster()
        forecaster.load(device_uuid, field)
        
        # Fetch recent data for prediction (need at least sequence_length points)
        hours_needed = max(2, forecaster.sequence_length // 60 + 1)
        
        fetcher = DataFetcher()
        fetcher.connect()
        df = fetcher.fetch_device_history(device_uuid, field, hours=hours_needed)
        
        if len(df) < forecaster.sequence_length:
            raise HTTPException(
                status_code=400,
                detail=f"Not enough recent data. Need {forecaster.sequence_length} points, got {len(df)}"
            )
        
        # Predict
        predictions_df = forecaster.predict(df, value_column='value')
        
        # Convert to response model
        predictions = []
        for _, row in predictions_df.iterrows():
            predictions.append(Prediction(
                timestamp=row['timestamp'],
                predicted_value=float(row['predicted_value']),
                confidence_lower=float(row['confidence_lower']),
                confidence_upper=float(row['confidence_upper'])
            ))
        
        return ForecastResponse(
            device_uuid=device_uuid,
            field=field,
            predictions=predictions,
            model_info=forecaster.get_model_info()
        )
    
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Model not trained. Call /ml/forecasts/train endpoint first."
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")
    finally:
        if fetcher:
            fetcher.close()

@router.get("/model-info/{device_uuid}", response_model=ModelInfoResponse)
async def get_model_info(
    device_uuid: str,
    field: str = Query(default="system.cpuUsage")
):
    """Get information about the trained forecasting model"""
    try:
        forecaster = LSTMForecaster()
        forecaster.load(device_uuid, field)
        
        return ModelInfoResponse(
            device_uuid=device_uuid,
            field=field,
            model_info=forecaster.get_model_info()
        )
    
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail="Model not trained for this device/field"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
