from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import anomalies, forecasts
from config import settings
import uvicorn

# Create FastAPI app
app = FastAPI(
    title=settings.SERVICE_NAME,
    description="Machine Learning service for IoT Digital Twin anomaly detection and time-series forecasting",
    version=settings.SERVICE_VERSION,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(anomalies.router)
app.include_router(forecasts.router)

@app.get("/")
async def root():
    """Root endpoint with service information"""
    return {
        "service": settings.SERVICE_NAME,
        "version": settings.SERVICE_VERSION,
        "status": "running",
        "endpoints": {
            "anomaly_detection": "/ml/anomalies",
            "time_series_forecasting": "/ml/forecasts",
            "documentation": "/docs",
            "health_check": "/health"
        }
    }

@app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": settings.SERVICE_NAME,
        "version": settings.SERVICE_VERSION
    }

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.ML_SERVICE_HOST,
        port=settings.ML_SERVICE_PORT,
        reload=True  # Enable auto-reload during development
    )
