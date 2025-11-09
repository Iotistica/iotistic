#!/bin/bash
set -e

# Iotistic Agent - Docker Installation Script
# Version: AGENT_VERSION_PLACEHOLDER
# This script installs the Iotistic agent as a Docker container
# Usage: curl -sSL https://apps.iotistic.com/agent/install-docker.sh | bash
#
# Environment Variables (CI/Non-interactive mode):
#   IOTISTIC_AGENT_VERSION        - Agent version to install (default: latest)
#   IOTISTIC_DEVICE_PORT          - Device API port (default: 48484)
#   IOTISTIC_CLOUD_API_ENDPOINT   - Cloud API endpoint (e.g., https://api.iotistic.com)
#   IOTISTIC_PROVISIONING_KEY     - Provisioning API key (optional, default: local_mode)
#   IOTISTIC_REQUIRE_PROVISIONING - Set to "false" to skip provisioning requirement

SCRIPT_VERSION="AGENT_VERSION_PLACEHOLDER"

echo "=================================="
echo "Iotistic Agent - Docker Installer"
echo "Version: $SCRIPT_VERSION"
echo "=================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Error: This script must be run as root (use sudo)"
    exit 1
fi

# Detect OS
if [ -f /etc/os-release ]; then
    . /etc/os-release
    OS=$ID
    OS_VERSION=$VERSION_ID
else
    echo "Error: Cannot detect OS"
    exit 1
fi

echo "Detected OS: $OS $OS_VERSION"

# Install Docker if not present
if ! command -v docker &> /dev/null; then
    echo "Docker not found. Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    rm get-docker.sh
    
    # Start and enable Docker
    systemctl start docker
    systemctl enable docker
    
    echo "✓ Docker installed successfully"
else
    echo "✓ Docker is already installed"
    docker --version
fi

# Create directories
echo "Creating directories..."
mkdir -p /var/lib/iotistic/agent
mkdir -p /var/log/iotistic

# Prompt for configuration
echo ""
echo "Configuration:"
echo "-------------"

# Check if running in non-interactive mode (CI)
if [ -n "$CI" ] || [ ! -t 0 ]; then
    echo "Running in non-interactive mode (CI)"
    PROVISIONING_KEY="${IOTISTIC_PROVISIONING_KEY:-local_mode}"
    DEVICE_API_PORT="${IOTISTIC_DEVICE_PORT:-48484}"
    AGENT_VERSION="${IOTISTIC_AGENT_VERSION:-latest}"
    CLOUD_API_ENDPOINT="${IOTISTIC_CLOUD_API_ENDPOINT:-}"
    
    # Check REQUIRE_PROVISIONING env var, default based on provisioning key
    if [ -n "$IOTISTIC_REQUIRE_PROVISIONING" ]; then
        REQUIRE_PROVISIONING="$IOTISTIC_REQUIRE_PROVISIONING"
    elif [ "$PROVISIONING_KEY" != "local_mode" ] && [ -n "$PROVISIONING_KEY" ]; then
        REQUIRE_PROVISIONING="true"
    else
        REQUIRE_PROVISIONING="false"
    fi
else
    # Interactive mode - prompt user
    # Cloud API endpoint
    read -p "Enter cloud API endpoint (leave empty for local mode): " CLOUD_API_ENDPOINT
    
    # Provisioning key (optional)
    read -p "Enter provisioning API key (leave empty for local mode): " PROVISIONING_KEY
    if [ -z "$PROVISIONING_KEY" ]; then
        REQUIRE_PROVISIONING="false"
        PROVISIONING_KEY="local_mode"
        echo "Running in local mode (no cloud connection)"
    else
        REQUIRE_PROVISIONING="true"
        echo "Cloud provisioning enabled"
    fi

    # Agent port
    read -p "Enter device API port [48484]: " DEVICE_API_PORT
    DEVICE_API_PORT=${DEVICE_API_PORT:-48484}
    
    # Get latest version
    echo ""
    echo "Fetching latest agent version..."
    LATEST_VERSION=$(curl -s https://registry.hub.docker.com/v2/repositories/iotistic/agent/tags | jq -r '.results[].name' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -1)
    if [ -z "$LATEST_VERSION" ]; then
        LATEST_VERSION="latest"
    fi
    AGENT_VERSION="$LATEST_VERSION"
    echo "Using version: $AGENT_VERSION"
fi

# Pull the image
echo ""
echo "Pulling Docker image..."
docker pull iotistic/agent:$AGENT_VERSION

# Stop and remove existing container if it exists
if docker ps -a | grep -q iotistic-agent; then
    echo "Stopping existing agent container..."
    docker stop iotistic-agent || true
    docker rm iotistic-agent || true
fi

# Create and start container
echo ""
echo "Starting agent container..."

# Build environment variables for docker run
ENV_VARS="-e DEVICE_API_PORT=48484 \
    -e AGENT_VERSION=${AGENT_VERSION} \
    -e NODE_ENV=production \
    -e LOG_LEVEL=info \
    -e ORCHESTRATOR_TYPE=docker-compose \
    -e ORCHESTRATOR_INTERVAL=30000 \
    -e REQUIRE_PROVISIONING=${REQUIRE_PROVISIONING} \
    -e PROVISIONING_API_KEY=${PROVISIONING_KEY}"

# Add CLOUD_API_ENDPOINT if provided
if [ -n "$CLOUD_API_ENDPOINT" ]; then
    ENV_VARS="$ENV_VARS -e CLOUD_API_ENDPOINT=${CLOUD_API_ENDPOINT}"
fi

docker run -d \
    --name iotistic-agent \
    --restart unless-stopped \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -v /var/lib/iotistic/agent:/app/data \
    -p ${DEVICE_API_PORT}:48484 \
    $ENV_VARS \
    iotistic/agent:$AGENT_VERSION

# Wait for container to start
echo "Waiting for agent to start..."
sleep 10

# Check if container is running
if docker ps | grep -q iotistic-agent; then
    echo ""
    echo "✓ Agent container is running"
    
    # Show logs
    echo ""
    echo "Recent logs:"
    echo "------------"
    docker logs --tail=20 iotistic-agent
    
    echo ""
    echo "=================================="
    echo "Installation complete!"
    echo "=================================="
    echo ""
    echo "Agent is running as Docker container 'iotistic-agent'"
    echo "Device API: http://localhost:${DEVICE_API_PORT}"
    echo ""
    echo "Useful commands:"
    echo "  docker logs -f iotistic-agent          # View logs"
    echo "  docker restart iotistic-agent          # Restart agent"
    echo "  docker stop iotistic-agent             # Stop agent"
    echo "  docker start iotistic-agent            # Start agent"
    echo ""
else
    echo ""
    echo "✗ Error: Agent container failed to start"
    echo ""
    echo "Container logs:"
    docker logs iotistic-agent
    exit 1
fi
