# Run ML Service Locally (for development/testing)
# Connects to PostgreSQL running in Docker

Write-Host "🚀 Starting ML Service Locally..." -ForegroundColor Cyan

# Check if PostgreSQL is running
Write-Host "`n📊 Checking PostgreSQL connection..." -ForegroundColor Yellow
$pgCheck = docker ps --filter "name=iotistic-postgres" --format "{{.Names}}"

if (-not $pgCheck) {
    Write-Host "❌ PostgreSQL container not running!" -ForegroundColor Red
    Write-Host "   Start it first with:" -ForegroundColor Yellow
    Write-Host "   cd api && docker-compose -f docker-compose.cloud.yml up -d postgres" -ForegroundColor White
    exit 1
}

Write-Host "✅ PostgreSQL is running" -ForegroundColor Green

# Set environment variables
$env:DB_HOST = "localhost"
$env:DB_PORT = "5432"
$env:DB_NAME = "iotistic"
$env:DB_USER = "postgres"
$env:DB_PASSWORD = "postgres"

$env:ML_SERVICE_PORT = "5000"
$env:ML_SERVICE_HOST = "0.0.0.0"
$env:MODEL_DIR = "./models/saved"

# Check if virtual environment exists
if (-not (Test-Path "venv")) {
    Write-Host "`n📦 Creating virtual environment..." -ForegroundColor Yellow
    python -m venv venv
}

# Activate virtual environment
Write-Host "`n🔧 Activating virtual environment..." -ForegroundColor Yellow
& .\venv\Scripts\Activate.ps1

# Install dependencies
Write-Host "`n📥 Installing dependencies..." -ForegroundColor Yellow
pip install -r requirements.txt

# Create model directory
if (-not (Test-Path "models/saved")) {
    Write-Host "`n📁 Creating model directory..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path "models/saved" | Out-Null
}

# Start ML service
Write-Host "`n🚀 Starting ML Service on http://localhost:5000" -ForegroundColor Green
Write-Host "   API Docs: http://localhost:5000/docs" -ForegroundColor Cyan
Write-Host "`nPress Ctrl+C to stop`n" -ForegroundColor Yellow

python -m uvicorn main:app --host 0.0.0.0 --port 5000 --reload
