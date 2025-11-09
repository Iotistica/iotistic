#!/bin/bash
#
# Setup script for E2E agent testing in CI
# Prepares dependencies needed for agent to run in Docker
#

set -e

echo "========================================="
echo "E2E Agent Test Setup"
echo "========================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Install Docker if not present
if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}Installing Docker...${NC}"
  curl -fsSL https://get.docker.com -o get-docker.sh
  sudo sh get-docker.sh
  sudo usermod -aG docker $USER
  echo -e "${GREEN}✓${NC} Docker installed"
else
  echo -e "${GREEN}✓${NC} Docker already installed: $(docker --version)"
fi

# Install Docker Compose if not present
if ! command -v docker-compose &> /dev/null; then
  echo -e "${YELLOW}Installing Docker Compose...${NC}"
  sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
  sudo chmod +x /usr/local/bin/docker-compose
  echo -e "${GREEN}✓${NC} Docker Compose installed"
else
  echo -e "${GREEN}✓${NC} Docker Compose already installed: $(docker-compose --version)"
fi

# Start Docker daemon if not running
if ! docker info &> /dev/null; then
  echo -e "${YELLOW}Starting Docker daemon...${NC}"
  sudo systemctl start docker
  sleep 5
  echo -e "${GREEN}✓${NC} Docker daemon started"
else
  echo -e "${GREEN}✓${NC} Docker daemon is running"
fi

# Pull base images to speed up build
echo "Pulling base images..."
docker pull node:20-alpine || true
docker pull postgres:16-alpine || true

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}=========================================${NC}"
