import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
import joblib
from pathlib import Path
from datetime import datetime
from config import settings

class IsolationForestAnomalyDetector:
    """
    Isolation Forest for multivariate anomaly detection
    
    Better than Z-score for:
    - Multi-dimensional anomaly detection
    - Complex patterns
    - Non-normal distributions
    """
    
    def __init__(self, contamination: float = None):
        self.contamination = contamination or settings.ISOLATION_FOREST_CONTAMINATION
        self.model = None
        self.scaler = StandardScaler()
        self.feature_names = None
        self.trained_at = None
        self.training_samples = 0
    
    def train(self, df: pd.DataFrame, features: list):
        """
        Train Isolation Forest on historical data
        
        Args:
            df: DataFrame with feature columns
            features: List of column names to use as features
        """
        if len(df) < settings.MIN_TRAINING_SAMPLES:
            raise ValueError(
                f"Not enough data. Need {settings.MIN_TRAINING_SAMPLES}+, got {len(df)}"
            )
        
        self.feature_names = features
        self.training_samples = len(df)
        
        # Extract and scale features
        X = df[features].values
        X_scaled = self.scaler.fit_transform(X)
        
        # Train model
        self.model = IsolationForest(
            n_estimators=settings.ISOLATION_FOREST_N_ESTIMATORS,
            contamination=self.contamination,
            random_state=42,
            n_jobs=-1  # Use all CPU cores
        )
        
        self.model.fit(X_scaled)
        self.trained_at = datetime.now()
        
        print(f"✅ Isolation Forest trained")
        print(f"   Samples: {len(df)}")
        print(f"   Features: {', '.join(features)}")
        print(f"   Contamination: {self.contamination}")
    
    def predict(self, df: pd.DataFrame) -> pd.DataFrame:
        """
        Predict anomalies
        
        Returns DataFrame with columns: timestamp, is_anomaly, anomaly_score, severity
        """
        if self.model is None:
            raise ValueError("Model not trained. Call train() first.")
        
        if not all(f in df.columns for f in self.feature_names):
            missing = [f for f in self.feature_names if f not in df.columns]
            raise ValueError(f"Missing features: {missing}")
        
        X = df[self.feature_names].values
        X_scaled = self.scaler.transform(X)
        
        # Predict: -1 = anomaly, 1 = normal
        predictions = self.model.predict(X_scaled)
        
        # Anomaly score: lower = more anomalous
        scores = self.model.score_samples(X_scaled)
        
        # Create result DataFrame
        result_df = pd.DataFrame()
        if 'timestamp' in df.columns:
            result_df['timestamp'] = df['timestamp']
        
        result_df['is_anomaly'] = predictions == -1
        result_df['anomaly_score'] = scores
        
        # Add severity based on score percentiles
        if len(scores) > 0:
            score_threshold_critical = np.percentile(scores, 1)  # Bottom 1%
            result_df['severity'] = result_df.apply(
                lambda row: 'critical' if row['anomaly_score'] < score_threshold_critical 
                else 'warning' if row['is_anomaly'] 
                else 'normal',
                axis=1
            )
        
        # Add feature values for reference
        for feature in self.feature_names:
            result_df[feature] = df[feature].values
        
        return result_df
    
    def save(self, device_uuid: str):
        """Save model to disk"""
        model_dir = Path(settings.MODEL_DIR) / 'isolation_forest'
        model_dir.mkdir(parents=True, exist_ok=True)
        
        model_path = model_dir / f"{device_uuid}_model.joblib"
        scaler_path = model_dir / f"{device_uuid}_scaler.joblib"
        metadata_path = model_dir / f"{device_uuid}_metadata.joblib"
        
        joblib.dump(self.model, model_path)
        joblib.dump(self.scaler, scaler_path)
        
        # Save metadata
        metadata = {
            'feature_names': self.feature_names,
            'contamination': self.contamination,
            'trained_at': self.trained_at.isoformat() if self.trained_at else None,
            'training_samples': self.training_samples
        }
        joblib.dump(metadata, metadata_path)
        
        print(f"✅ Model saved: {model_path}")
    
    def load(self, device_uuid: str):
        """Load model from disk"""
        model_dir = Path(settings.MODEL_DIR) / 'isolation_forest'
        
        model_path = model_dir / f"{device_uuid}_model.joblib"
        scaler_path = model_dir / f"{device_uuid}_scaler.joblib"
        metadata_path = model_dir / f"{device_uuid}_metadata.joblib"
        
        if not model_path.exists():
            raise FileNotFoundError(f"Model not found: {model_path}")
        
        self.model = joblib.load(model_path)
        self.scaler = joblib.load(scaler_path)
        
        if metadata_path.exists():
            metadata = joblib.load(metadata_path)
            self.feature_names = metadata.get('feature_names')
            self.contamination = metadata.get('contamination')
            self.training_samples = metadata.get('training_samples', 0)
            trained_at_str = metadata.get('trained_at')
            if trained_at_str:
                self.trained_at = datetime.fromisoformat(trained_at_str)
        
        print(f"✅ Model loaded: {model_path}")
        print(f"   Trained: {self.trained_at}")
        print(f"   Features: {', '.join(self.feature_names)}")
    
    def get_model_info(self) -> dict:
        """Get model metadata"""
        return {
            'trained': self.model is not None,
            'trained_at': self.trained_at.isoformat() if self.trained_at else None,
            'training_samples': self.training_samples,
            'features': self.feature_names,
            'contamination': self.contamination,
            'n_estimators': settings.ISOLATION_FOREST_N_ESTIMATORS
        }
