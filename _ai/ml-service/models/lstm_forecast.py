import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow.keras.models import Sequential, load_model
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping
from sklearn.preprocessing import MinMaxScaler
import joblib
from pathlib import Path
from datetime import datetime
from config import settings

class LSTMForecaster:
    """
    LSTM Neural Network for time-series forecasting
    
    Predicts future values based on historical patterns
    """
    
    def __init__(
        self, 
        sequence_length: int = None, 
        forecast_horizon: int = None
    ):
        self.sequence_length = sequence_length or settings.LSTM_SEQUENCE_LENGTH
        self.forecast_horizon = forecast_horizon or settings.LSTM_FORECAST_HORIZON
        self.model = None
        self.scaler = MinMaxScaler(feature_range=(0, 1))
        self.trained_at = None
        self.training_samples = 0
        self.history = None
    
    def prepare_sequences(self, data: np.ndarray):
        """
        Create sequences for LSTM training
        
        Example: sequence_length=50, forecast_horizon=12
        Input: [t-49, t-48, ..., t-1, t]
        Output: [t+1, t+2, ..., t+12]
        """
        X, y = [], []
        
        for i in range(len(data) - self.sequence_length - self.forecast_horizon):
            X.append(data[i:i + self.sequence_length])
            y.append(data[i + self.sequence_length:i + self.sequence_length + self.forecast_horizon])
        
        return np.array(X), np.array(y)
    
    def train(self, df: pd.DataFrame, value_column: str = 'value'):
        """
        Train LSTM model
        
        Args:
            df: DataFrame with timestamp and value columns
            value_column: Name of the column to predict
        """
        # Extract and scale values
        values = df[value_column].values.reshape(-1, 1)
        scaled_values = self.scaler.fit_transform(values)
        
        # Create sequences
        X, y = self.prepare_sequences(scaled_values)
        
        if len(X) < settings.MIN_TRAINING_SAMPLES:
            raise ValueError(
                f"Not enough data. Need {settings.MIN_TRAINING_SAMPLES}+, got {len(X)}"
            )
        
        self.training_samples = len(X)
        
        # Split train/validation (80/20)
        split_idx = int(len(X) * 0.8)
        X_train, X_val = X[:split_idx], X[split_idx:]
        y_train, y_val = y[:split_idx], y[split_idx:]
        
        # Build LSTM model
        self.model = Sequential([
            LSTM(128, activation='relu', return_sequences=True, 
                 input_shape=(self.sequence_length, 1)),
            Dropout(0.2),
            LSTM(64, activation='relu', return_sequences=False),
            Dropout(0.2),
            Dense(32, activation='relu'),
            Dense(self.forecast_horizon)  # Predict multiple future points
        ])
        
        self.model.compile(
            optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
            loss='mse',
            metrics=['mae']
        )
        
        # Early stopping to prevent overfitting
        early_stop = EarlyStopping(
            monitor='val_loss',
            patience=5,
            restore_best_weights=True
        )
        
        # Train
        print("🚀 Training LSTM model...")
        self.history = self.model.fit(
            X_train, y_train,
            validation_data=(X_val, y_val),
            epochs=settings.LSTM_EPOCHS,
            batch_size=settings.LSTM_BATCH_SIZE,
            callbacks=[early_stop],
            verbose=1
        )
        
        self.trained_at = datetime.now()
        
        final_loss = self.history.history['loss'][-1]
        final_val_loss = self.history.history['val_loss'][-1]
        
        print(f"✅ LSTM trained")
        print(f"   Samples: {len(X_train)}")
        print(f"   Final Loss: {final_loss:.4f}")
        print(f"   Val Loss: {final_val_loss:.4f}")
    
    def predict(self, recent_data: pd.DataFrame, value_column: str = 'value'):
        """
        Predict future values
        
        Args:
            recent_data: Last N data points (where N = sequence_length)
        
        Returns:
            DataFrame with columns: timestamp, predicted_value, confidence_lower, confidence_upper
        """
        if self.model is None:
            raise ValueError("Model not trained. Call train() first.")
        
        # Get last sequence_length points
        values = recent_data[value_column].values[-self.sequence_length:]
        
        if len(values) < self.sequence_length:
            raise ValueError(
                f"Need {self.sequence_length} recent points, got {len(values)}"
            )
        
        # Scale and reshape
        scaled_values = self.scaler.transform(values.reshape(-1, 1))
        X = scaled_values.reshape(1, self.sequence_length, 1)
        
        # Predict
        scaled_predictions = self.model.predict(X, verbose=0)
        predictions = self.scaler.inverse_transform(scaled_predictions.reshape(-1, 1))
        
        # Generate future timestamps (assuming 60s interval)
        last_timestamp = pd.to_datetime(recent_data['timestamp'].iloc[-1])
        future_timestamps = pd.date_range(
            start=last_timestamp,
            periods=self.forecast_horizon + 1,
            freq='60S'
        )[1:]  # Exclude the start timestamp
        
        # Create result DataFrame
        result_df = pd.DataFrame({
            'timestamp': future_timestamps,
            'predicted_value': predictions.flatten()
        })
        
        # Add confidence interval based on recent stddev
        recent_std = recent_data[value_column].std()
        result_df['confidence_lower'] = result_df['predicted_value'] - (1.96 * recent_std)
        result_df['confidence_upper'] = result_df['predicted_value'] + (1.96 * recent_std)
        
        # Ensure confidence bounds are reasonable (non-negative for metrics like CPU%)
        result_df['confidence_lower'] = result_df['confidence_lower'].clip(lower=0)
        
        return result_df
    
    def save(self, device_uuid: str, field: str = 'default'):
        """Save model to disk"""
        model_dir = Path(settings.MODEL_DIR) / 'lstm'
        model_dir.mkdir(parents=True, exist_ok=True)
        
        # Sanitize field name for filename
        field_safe = field.replace('.', '_')
        
        model_path = model_dir / f"{device_uuid}_{field_safe}_lstm.h5"
        scaler_path = model_dir / f"{device_uuid}_{field_safe}_scaler.joblib"
        metadata_path = model_dir / f"{device_uuid}_{field_safe}_metadata.joblib"
        
        self.model.save(model_path)
        joblib.dump(self.scaler, scaler_path)
        
        # Save metadata
        metadata = {
            'sequence_length': self.sequence_length,
            'forecast_horizon': self.forecast_horizon,
            'trained_at': self.trained_at.isoformat() if self.trained_at else None,
            'training_samples': self.training_samples,
            'field': field
        }
        joblib.dump(metadata, metadata_path)
        
        print(f"✅ LSTM model saved: {model_path}")
    
    def load(self, device_uuid: str, field: str = 'default'):
        """Load model from disk"""
        model_dir = Path(settings.MODEL_DIR) / 'lstm'
        
        # Sanitize field name
        field_safe = field.replace('.', '_')
        
        model_path = model_dir / f"{device_uuid}_{field_safe}_lstm.h5"
        scaler_path = model_dir / f"{device_uuid}_{field_safe}_scaler.joblib"
        metadata_path = model_dir / f"{device_uuid}_{field_safe}_metadata.joblib"
        
        if not model_path.exists():
            raise FileNotFoundError(f"Model not found: {model_path}")
        
        self.model = load_model(model_path)
        self.scaler = joblib.load(scaler_path)
        
        if metadata_path.exists():
            metadata = joblib.load(metadata_path)
            self.sequence_length = metadata.get('sequence_length', self.sequence_length)
            self.forecast_horizon = metadata.get('forecast_horizon', self.forecast_horizon)
            self.training_samples = metadata.get('training_samples', 0)
            trained_at_str = metadata.get('trained_at')
            if trained_at_str:
                self.trained_at = datetime.fromisoformat(trained_at_str)
        
        print(f"✅ LSTM model loaded: {model_path}")
        print(f"   Trained: {self.trained_at}")
        print(f"   Sequence length: {self.sequence_length}")
        print(f"   Forecast horizon: {self.forecast_horizon}")
    
    def get_model_info(self) -> dict:
        """Get model metadata"""
        return {
            'trained': self.model is not None,
            'trained_at': self.trained_at.isoformat() if self.trained_at else None,
            'training_samples': self.training_samples,
            'sequence_length': self.sequence_length,
            'forecast_horizon': self.forecast_horizon,
            'epochs': settings.LSTM_EPOCHS,
            'batch_size': settings.LSTM_BATCH_SIZE
        }
