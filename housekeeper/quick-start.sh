#!/bin/bash
# Quick start script for housekeeper service

set -e

echo "🧹 Iotistic Housekeeper Service - Quick Start"
echo "============================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Error: Docker is not running"
  exit 1
fi

# Copy environment file if it doesn't exist
if [ ! -f .env ]; then
  echo "📋 Creating .env file from template..."
  cp .env.example .env
  echo "⚠️  Please edit .env and set your database credentials"
  exit 0
fi

# Build Docker image
echo "🔨 Building Docker image..."
docker build -t iotistic/housekeeper:latest .

# Start service with docker-compose
echo "🚀 Starting housekeeper service..."
cd ..
docker-compose -f docker-compose.housekeeper.yml up -d

# Wait for service to be healthy
echo "⏳ Waiting for service to be healthy..."
sleep 5

# Check health
if curl -sf http://localhost:3200/health > /dev/null; then
  echo "✅ Housekeeper service is running!"
  echo ""
  echo "📊 Service Info:"
  curl -s http://localhost:3200/ | jq
  echo ""
  echo "📝 View logs:"
  echo "   docker-compose -f docker-compose.housekeeper.yml logs -f housekeeper"
  echo ""
  echo "📋 List tasks:"
  echo "   curl http://localhost:3200/api/housekeeper/tasks | jq"
else
  echo "❌ Service health check failed"
  echo "📋 Check logs:"
  echo "   docker-compose -f docker-compose.housekeeper.yml logs housekeeper"
  exit 1
fi
