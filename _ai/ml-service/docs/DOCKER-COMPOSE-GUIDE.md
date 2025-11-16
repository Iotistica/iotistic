# 🐳 Docker Compose Deployment Guide

## Available Compose Files

The ML service includes **3 docker-compose configurations** for different use cases:

### 1. `docker-compose.yml` (Production - Connects to Existing DB)
**Use when:** You already have PostgreSQL running (from main project)

```bash
# Start ML service (connects to existing database)
docker-compose up -d

# View logs
docker-compose logs -f

# Stop service
docker-compose down
```

**Configuration:**
- Connects to existing PostgreSQL (via `DB_HOST` env var)
- Persists models in named volume
- Production-ready with health checks
- Port: 5000

---

### 2. `docker-compose.dev.yml` (Development with Live Reload)
**Use when:** You want to develop with code hot-reloading

```bash
# Start in development mode
docker-compose -f docker-compose.dev.yml up

# Changes to Python files will auto-reload
# Logs will stream to console
```

**Features:**
- Code mounted as volume (changes trigger reload)
- `uvicorn --reload` for auto-restart
- Verbose logging
- Separate dev models volume

---

### 3. `docker-compose.standalone.yml` (Includes PostgreSQL)
**Use when:** You want ML service with its own PostgreSQL database

```bash
# Start both ML service and PostgreSQL
docker-compose -f docker-compose.standalone.yml up -d

# This creates a complete isolated stack
```

**Includes:**
- PostgreSQL 15 container
- ML service container
- Shared network
- Separate data volumes

---

## 🚀 Quick Start

### Scenario 1: Connect to Main Project Database

```bash
# 1. Copy environment template
cp .env.example .env

# 2. Edit .env - set DB_HOST to your PostgreSQL
nano .env
# Set: DB_HOST=localhost (or your PostgreSQL host)

# 3. Start ML service
docker-compose up -d

# 4. Check health
curl http://localhost:5000/health

# 5. View logs
docker-compose logs -f ml-service
```

### Scenario 2: Development Mode

```bash
# 1. Start with live reload
docker-compose -f docker-compose.dev.yml up

# 2. Edit Python files - they'll auto-reload
# 3. Press Ctrl+C to stop
```

### Scenario 3: Standalone with PostgreSQL

```bash
# 1. Start complete stack
docker-compose -f docker-compose.standalone.yml up -d

# 2. Wait for PostgreSQL to initialize (first time)
docker-compose -f docker-compose.standalone.yml logs postgres

# 3. Check ML service
curl http://localhost:5000/health
```

---

## 🔧 Configuration

### Environment Variables

Create `.env` file (or copy from `.env.example`):

```bash
# Database
DB_HOST=localhost          # PostgreSQL host
DB_PORT=5432              # PostgreSQL port
DB_NAME=iotistic          # Database name
DB_USER=postgres          # Database user
DB_PASSWORD=postgres      # Database password

# ML Service
ML_SERVICE_PORT=5000      # Service port

# Model Training
MIN_TRAINING_SAMPLES=100
RETRAIN_INTERVAL_HOURS=24

# Anomaly Detection
ISOLATION_FOREST_CONTAMINATION=0.01
ISOLATION_FOREST_N_ESTIMATORS=100

# Forecasting
LSTM_SEQUENCE_LENGTH=50
LSTM_FORECAST_HORIZON=12
LSTM_EPOCHS=50
LSTM_BATCH_SIZE=32
```

### Connect to External Database

If your PostgreSQL is on another machine:

```bash
# In .env
DB_HOST=192.168.1.100    # Remote PostgreSQL IP
DB_PORT=5432
DB_NAME=iotistic
DB_USER=postgres
DB_PASSWORD=your_password
```

### Custom Port

```bash
# In .env
ML_SERVICE_PORT=5001     # Change to 5001

# Or override in docker-compose command
ML_SERVICE_PORT=5001 docker-compose up -d
```

---

## 🌐 Network Integration

### Connect to Main Project Network

To share network with main `Iotistic-sensor` stack:

Edit `docker-compose.yml`:

```yaml
networks:
  ml-network:
    external: true
    name: Iotistic-net    # Use existing network
```

Then start:
```bash
docker-compose up -d
```

Now ML service can reach other services by container name (e.g., `postgres`, `mqtt`).

---

## 📊 Volume Management

### View Volumes

```bash
# List volumes
docker volume ls | grep ml

# Inspect volume
docker volume inspect ml-service_ml-models
```

### Backup Models

```bash
# Create backup
docker run --rm -v ml-service_ml-models:/data -v $(pwd):/backup alpine tar czf /backup/ml-models-backup.tar.gz /data

# Restore backup
docker run --rm -v ml-service_ml-models:/data -v $(pwd):/backup alpine tar xzf /backup/ml-models-backup.tar.gz -C /
```

### Clear Models

```bash
# Stop service
docker-compose down

# Remove volume
docker volume rm ml-service_ml-models

# Restart (creates new volume)
docker-compose up -d
```

---

## 🔍 Troubleshooting

### Service Won't Start

```bash
# Check logs
docker-compose logs ml-service

# Check if port is in use
netstat -an | findstr 5000

# Use different port
ML_SERVICE_PORT=5001 docker-compose up -d
```

### Database Connection Failed

```bash
# Check if PostgreSQL is accessible
docker-compose exec ml-service ping postgres

# Check database credentials
docker-compose exec ml-service env | grep DB_

# Test connection manually
docker-compose exec ml-service python -c "import psycopg2; psycopg2.connect(host='$DB_HOST', port=5432, database='$DB_NAME', user='$DB_USER', password='$DB_PASSWORD')"
```

### Container Keeps Restarting

```bash
# View full logs
docker-compose logs --tail=100 ml-service

# Check health status
docker-compose ps

# Inspect container
docker inspect ml-service
```

### Models Not Persisting

```bash
# Check volume is mounted
docker-compose exec ml-service ls -la /app/models/saved

# Verify volume exists
docker volume ls | grep ml-models

# Check volume mount in compose file
docker-compose config
```

---

## 🚀 Production Deployment

### Production Best Practices

```yaml
# docker-compose.prod.yml
services:
  ml-service:
    image: iotistic/ml-service:latest  # Use pre-built image
    restart: always                     # Always restart
    environment:
      - DB_HOST=prod-postgres.example.com
      - DB_PASSWORD=${DB_PASSWORD}      # Use secrets
    deploy:
      resources:
        limits:
          cpus: '2.0'
          memory: 4G
        reservations:
          cpus: '1.0'
          memory: 2G
    logging:
      driver: "json-file"
      options:
        max-size: "10m"
        max-file: "3"
```

Deploy:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Build and Push Image

```bash
# Build image
docker build -t iotistic/ml-service:latest .

# Tag for version
docker tag iotistic/ml-service:latest iotistic/ml-service:1.0.0

# Push to registry
docker push iotistic/ml-service:latest
docker push iotistic/ml-service:1.0.0
```

---

## 📈 Monitoring

### Health Checks

```bash
# Check service health
curl http://localhost:5000/health

# Check from Docker
docker-compose exec ml-service curl http://localhost:5000/health

# View health status
docker ps --filter name=ml-service
```

### Resource Usage

```bash
# View stats
docker stats ml-service

# Continuous monitoring
docker stats ml-service --no-stream
```

### Logs

```bash
# Follow logs
docker-compose logs -f ml-service

# Last 100 lines
docker-compose logs --tail=100 ml-service

# Filter by time
docker-compose logs --since 10m ml-service

# Save logs to file
docker-compose logs ml-service > ml-service.log
```

---

## 🔄 Updates and Maintenance

### Update Service

```bash
# Pull latest image (if using pre-built)
docker-compose pull ml-service

# Rebuild image (if building locally)
docker-compose build ml-service

# Restart with new image
docker-compose up -d ml-service
```

### Clean Up

```bash
# Stop and remove containers
docker-compose down

# Stop and remove containers + volumes
docker-compose down -v

# Remove unused images
docker image prune -a
```

### Reset Everything

```bash
# Complete reset
docker-compose down -v
docker volume prune -f
docker-compose up -d
```

---

## 📚 Common Commands Reference

```bash
# Start services
docker-compose up -d

# Start specific service
docker-compose up -d ml-service

# View logs
docker-compose logs -f

# Execute command in container
docker-compose exec ml-service python --version

# Shell access
docker-compose exec ml-service /bin/bash

# Stop services
docker-compose stop

# Remove services
docker-compose down

# View running containers
docker-compose ps

# View configuration
docker-compose config

# Validate compose file
docker-compose config --quiet
```

---

## 🎯 Integration Examples

### With Main Project

From main project root:

```yaml
# docker-compose.yml (main project)
services:
  # ... existing services ...
  
  ml-service:
    image: iotistic/ml-service:latest
    networks:
      - Iotistic-net
    environment:
      - DB_HOST=postgres
      - DB_PORT=5432
```

### With Nginx Reverse Proxy

```nginx
# nginx.conf
location /ml/ {
    proxy_pass http://ml-service:5000/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
}
```

---

## 🎉 Summary

**3 Compose Files:**
- `docker-compose.yml` - Production (connects to existing DB)
- `docker-compose.dev.yml` - Development (with live reload)
- `docker-compose.standalone.yml` - Complete stack (includes PostgreSQL)

**Choose based on your needs:**
- Have PostgreSQL? Use `docker-compose.yml`
- Developing? Use `docker-compose.dev.yml`
- Need everything? Use `docker-compose.standalone.yml`

**Quick Start:**
```bash
docker-compose up -d
curl http://localhost:5000/docs
```

Happy containerizing! 🐳🚀
