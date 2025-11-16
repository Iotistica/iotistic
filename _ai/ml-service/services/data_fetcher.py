import psycopg2
import pandas as pd
from datetime import datetime, timedelta
from typing import Optional
from config import settings

class DataFetcher:
    """Fetch historical data from PostgreSQL for ML training/prediction"""
    
    def __init__(self):
        self.connection = None
    
    def connect(self):
        """Connect to PostgreSQL database"""
        try:
            self.connection = psycopg2.connect(
                host=settings.DB_HOST,
                port=settings.DB_PORT,
                database=settings.DB_NAME,
                user=settings.DB_USER,
                password=settings.DB_PASSWORD
            )
            print(f"✅ Connected to PostgreSQL: {settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}")
        except Exception as e:
            print(f"❌ Failed to connect to PostgreSQL: {e}")
            raise
    
    def close(self):
        """Close database connection"""
        if self.connection:
            self.connection.close()
            print("✅ Database connection closed")
    
    def fetch_device_history(
        self, 
        device_uuid: str, 
        field: str, 
        hours: int = 168  # 7 days default
    ) -> pd.DataFrame:
        """
        Fetch historical data for a specific field
        
        Args:
            device_uuid: Device UUID
            field: Field path (e.g., "system.cpuUsage")
            hours: Hours of historical data to fetch
        
        Returns:
            DataFrame with columns: timestamp, value
        """
        if not self.connection:
            raise RuntimeError("Not connected to database. Call connect() first.")
        
        # Convert field path to JSONB path
        # e.g., "system.cpuUsage" -> '{system,cpuUsage}'
        field_parts = field.split('.')
        jsonb_path = '{' + ','.join(field_parts) + '}'
        
        # Build query with proper interval formatting
        query = f"""
            SELECT 
                timestamp,
                (reported_state #>> %s)::float as value
            FROM device_shadow_history
            WHERE device_uuid = %s
                AND timestamp >= NOW() - INTERVAL '{hours} hours'
                AND reported_state #>> %s IS NOT NULL
            ORDER BY timestamp ASC
        """
        
        df = pd.read_sql_query(
            query,
            self.connection,
            params=(jsonb_path, device_uuid, jsonb_path)
        )
        
        print(f"📊 Fetched {len(df)} data points for {field}")
        return df
    
    def fetch_multi_metric_history(
        self, 
        device_uuid: str, 
        hours: int = 168
    ) -> pd.DataFrame:
        """
        Fetch multiple metrics for multivariate ML models
        
        Returns DataFrame with columns: timestamp, cpu_usage, memory_used, etc.
        """
        if not self.connection:
            raise RuntimeError("Not connected to database. Call connect() first.")
        
        # Build query with proper interval formatting
        # Note: Field names match actual data structure (memoryUsage, diskUsage)
        query = f"""
            SELECT 
                timestamp,
                (reported_state#>>'{{system,cpuUsage}}')::float as cpu_usage,
                (reported_state#>>'{{system,memoryUsage}}')::float as memory_used,
                (reported_state#>>'{{system,memoryTotal}}')::float as memory_total,
                (reported_state#>>'{{system,diskUsage}}')::float as disk_used,
                (reported_state#>>'{{system,diskTotal}}')::float as disk_total,
                (reported_state#>>'{{health,uptime}}')::float as uptime,
                (reported_state#>>'{{system,temperature}}')::float as temperature
            FROM device_shadow_history
            WHERE device_uuid = %s
                AND timestamp >= NOW() - INTERVAL '{hours} hours'
                AND reported_state ? 'system'
            ORDER BY timestamp ASC
        """
        
        df = pd.read_sql_query(
            query,
            self.connection,
            params=(device_uuid,)
        )
        
        # Calculate derived features
        if 'memory_used' in df.columns and 'memory_total' in df.columns:
            df['memory_usage_percent'] = (df['memory_used'] / df['memory_total']) * 100
        else:
            df['memory_usage_percent'] = 0
        
        if 'disk_used' in df.columns and 'disk_total' in df.columns:
            df['disk_usage_percent'] = (df['disk_used'] / df['disk_total']) * 100
        else:
            df['disk_usage_percent'] = 0
        
        # Drop rows with NaN in critical columns (only check columns that should have values)
        df = df.dropna(subset=['cpu_usage'])
        
        print(f"📊 Fetched {len(df)} multi-metric data points")
        return df
    
    def fetch_all_devices_current_state(self) -> pd.DataFrame:
        """Fetch current state for all online devices"""
        if not self.connection:
            raise RuntimeError("Not connected to database. Call connect() first.")
        
        query = """
            SELECT 
                device_uuid,
                device_name,
                reported_state,
                last_updated,
                status
            FROM device_shadows
            WHERE status = 'online'
        """
        
        df = pd.read_sql_query(query, self.connection)
        print(f"📊 Fetched {len(df)} online devices")
        return df
    
    def get_device_info(self, device_uuid: str) -> Optional[dict]:
        """Get basic device information"""
        if not self.connection:
            raise RuntimeError("Not connected to database. Call connect() first.")
        
        query = """
            SELECT 
                device_uuid,
                device_name,
                status,
                last_updated
            FROM device_shadows
            WHERE device_uuid = %s
        """
        
        with self.connection.cursor() as cursor:
            cursor.execute(query, (device_uuid,))
            row = cursor.fetchone()
            
            if row:
                return {
                    'device_uuid': row[0],
                    'device_name': row[1],
                    'status': row[2],
                    'last_updated': row[3]
                }
        
        return None
