#!/bin/bash
#
# Install Iotistic Agent as systemd service
# Usage: sudo ./install-systemd.sh
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_DIR="$(dirname "$SCRIPT_DIR")"
INSTALL_DIR="/opt/iotistic/agent"
CONFIG_DIR="/etc/iotistic"
DATA_DIR="/var/lib/iotistic/agent"
LOG_DIR="/var/log/iotistic"
SERVICE_FILE="iotistic-agent.service"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Iotistic Agent Systemd Installation${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
  echo -e "${RED}Error: Please run as root (use sudo)${NC}"
  exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
  echo -e "${RED}Error: Node.js is not installed${NC}"
  echo "Please install Node.js 18+ first"
  exit 1
fi

NODE_VERSION=$(node --version)
echo -e "${GREEN}✓${NC} Node.js detected: $NODE_VERSION"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
  echo -e "${YELLOW}Warning: Docker is not installed${NC}"
  echo "Agent requires Docker to manage containers"
  read -p "Continue anyway? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
  fi
else
  echo -e "${GREEN}✓${NC} Docker detected: $(docker --version)"
fi

# Create iotistic user if not exists
if ! id "iotistic" &>/dev/null; then
  echo "Creating iotistic user..."
  useradd --system --home-dir /opt/iotistic --shell /bin/bash iotistic
  echo -e "${GREEN}✓${NC} User created: iotistic"
else
  echo -e "${GREEN}✓${NC} User already exists: iotistic"
fi

# Add iotistic user to docker group
if getent group docker > /dev/null 2>&1; then
  usermod -aG docker iotistic
  echo -e "${GREEN}✓${NC} Added iotistic to docker group"
fi

# Create directories
echo "Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$CONFIG_DIR"
mkdir -p "$DATA_DIR"
mkdir -p "$LOG_DIR"

# Copy agent files
echo "Copying agent files to $INSTALL_DIR..."
rsync -av --exclude='node_modules' --exclude='.git' --exclude='dist' "$AGENT_DIR/" "$INSTALL_DIR/"

# Install dependencies and build
echo "Installing dependencies..."
cd "$INSTALL_DIR"
npm ci --production

echo "Building TypeScript..."
npm run build

# Set permissions
echo "Setting permissions..."
chown -R iotistic:iotistic "$INSTALL_DIR"
chown -R iotistic:iotistic "$DATA_DIR"
chown -R iotistic:iotistic "$LOG_DIR"
chmod 755 "$INSTALL_DIR"

# Create default environment file if not exists
if [ ! -f "$CONFIG_DIR/agent.env" ]; then
  echo "Creating default environment file..."
  cat > "$CONFIG_DIR/agent.env" << EOF
# Iotistic Agent Configuration
NODE_ENV=production
LOG_LEVEL=info

# API Configuration
API_PORT=48484
API_HOST=0.0.0.0

# Database (if using local PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=iotistic
DB_USER=iotistic
DB_PASSWORD=changeme

# MQTT (if using local broker)
MQTT_BROKER_URL=mqtt://localhost:1883

# Cloud API (if connecting to cloud)
# CLOUD_API_URL=https://api.iotistic.cloud
# DEVICE_TOKEN=your-device-token

# Agent Configuration
ORCHESTRATOR_TYPE=docker-compose
ORCHESTRATOR_INTERVAL=10000
STATE_FILE=/var/lib/iotistic/agent/target-state.json
EOF

  chown iotistic:iotistic "$CONFIG_DIR/agent.env"
  chmod 600 "$CONFIG_DIR/agent.env"
  echo -e "${GREEN}✓${NC} Environment file created: $CONFIG_DIR/agent.env"
  echo -e "${YELLOW}⚠${NC}  Please edit $CONFIG_DIR/agent.env with your configuration"
else
  echo -e "${GREEN}✓${NC} Environment file already exists: $CONFIG_DIR/agent.env"
fi

# Install systemd service
echo "Installing systemd service..."
cp "$SCRIPT_DIR/$SERVICE_FILE" "/etc/systemd/system/$SERVICE_FILE"

# Reload systemd
systemctl daemon-reload
echo -e "${GREEN}✓${NC} Systemd service installed"

# Enable service
echo "Enabling iotistic-agent service..."
systemctl enable iotistic-agent
echo -e "${GREEN}✓${NC} Service enabled (will start on boot)"

echo ""
echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}Installation Complete!${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. Edit configuration:"
echo -e "   ${YELLOW}sudo nano $CONFIG_DIR/agent.env${NC}"
echo ""
echo "2. Start the service:"
echo -e "   ${YELLOW}sudo systemctl start iotistic-agent${NC}"
echo ""
echo "3. Check status:"
echo -e "   ${YELLOW}sudo systemctl status iotistic-agent${NC}"
echo ""
echo "4. View logs:"
echo -e "   ${YELLOW}sudo journalctl -u iotistic-agent -f${NC}"
echo ""
echo "5. Stop the service:"
echo -e "   ${YELLOW}sudo systemctl stop iotistic-agent${NC}"
echo ""
echo "6. Disable auto-start:"
echo -e "   ${YELLOW}sudo systemctl disable iotistic-agent${NC}"
echo ""
