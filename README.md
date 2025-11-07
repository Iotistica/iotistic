# Iotistic IoT Platform

A comprehensive multi-tenant SaaS IoT platform combining edge device management with cloud-based Kubernetes deployment, featuring real-time monitoring, Digital Twin visualization, and flexible device orchestration.

## Features

### Multi-Tenant SaaS Architecture
- **Kubernetes Deployment** - Isolated customer namespaces with automated provisioning
- **Stripe Billing Integration** - Subscription management with 14-day trials
- **JWT License Validation** - RS256-signed licenses with feature gating
- **Plan-Based Features** - Starter, Professional, Enterprise tiers
- **Usage Metering** - Prometheus metrics collection for billing
- **Automated Deployment** - Self-signup triggers K8s namespace creation

### Edge Device Management  
- **Container Orchestration** - Agent supports Docker Compose and K3s
- **Declarative State** - Target state JSON with automatic reconciliation
- **Container State Control** - Running/stopped/paused states
- **Device API** - REST API on port 48484 for local management
- **Multi-Platform** - Raspberry Pi (arm64, armv7l), x86_64 support
- **Cloud Sync** - Pull-based configuration updates

### Digital Twin
- **Graph Database** - Neo4j integration for spatial relationships
- **IFC File Support** - Import building information models
- **3D Visualization** - Force-directed graph with device mapping
- **Device-Space Mapping** - Link IoT devices to physical locations

### Core IoT Stack
- **MQTT Broker** - Mosquitto with PostgreSQL ACL authentication
- **Data Storage** - PostgreSQL for sensor data and device state
- **Real-Time Metrics** - Redis Streams for live data
- **Web Dashboard** - React + TypeScript interface
- **Monitoring** - Shared or dedicated Prometheus based on plan

## Table of Contents

- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Service Architecture](#service-architecture)
- [Configuration](#configuration)
- [Development](#development)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Documentation](#documentation)
- [Support](#support)
- [License](#license)

## Architecture

### Two Deployment Models

#### 1. Edge Device Stack
Single-tenant deployment on customer hardware:

**Services:**
- Agent - Container orchestrator (Docker/K3s)
- API - Device management REST API  
- Dashboard - React web interface
- Mosquitto - MQTT broker
- PostgreSQL - Primary database
- Neo4j - Graph database for Digital Twin

#### 2. Multi-Tenant SaaS (Kubernetes)
Cloud-hosted with isolated customer namespaces:

**Global Services:**
- Billing Service - Stripe integration, K8s deployment
- Shared Prometheus - Metrics (Starter/Professional plans)

**Per-Customer Services:**
- API, Dashboard, PostgreSQL, Mosquitto, Billing Exporter
- Optional dedicated Prometheus + Grafana (Enterprise)


## Quick Start

### Option 1: Automated Installation (Raspberry Pi)
```bash
curl -sSL https://raw.githubusercontent.com/Iotistica/iotistic/master/bin/install.sh | bash
```

The installer will:
- Detect device architecture (arm64, armv7l, x86_64)
- Prompt for provisioning API key (first-time setup)
- Configure cloud endpoint
- Deploy Docker Compose stack
- Start all services
- ✅ Configure the system
- ✅ Deploy all services
- ✅ Set up kiosk mode (optional)
- ✅ Configure networking (optional)

### Option 2: Manual Installation

1. **Clone the repository**:
```bash
git clone https://github.com/Iotistica/iotistic.git
cd iotistic
```

2. **Run the installer**:
```bash
chmod +x bin/install.sh
./bin/install.sh
```

3. **Follow the interactive prompts** to configure your installation


### Option 2: Local Development
```bash
# Clone repository
git clone https://github.com/Iotistica/iotistic.git
cd iotistic

# Start development stack
docker-compose -f docker-compose.dev.yml up -d

# Services available at:
# - API: http://localhost:4002
# - Dashboard: http://localhost:3000
# - MQTT: localhost:5883
# - PostgreSQL: localhost:5432
# - Neo4j: http://localhost:7474
```

### Option 3: Kubernetes Deployment
```bash
# Install billing service
helm install billing ./charts/billing --namespace billing --create-namespace

# Customer signup creates namespace automatically
curl -X POST https://billing.iotistic.cloud/api/customers/signup \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "company": "ACME Corp", "plan": "starter"}'
```

See [K8S Deployment Guide](docs/K8S-DEPLOYMENT-GUIDE.md) for complete setup.

## Service Architecture

### API Service (`api/`)
**Port:** 3002 (internal), 4002 (external)

**Key Features:**
- Device management (CRUD, bulk operations)
- MQTT ACL management via PostgreSQL
- Digital Twin graph operations (Neo4j)
- License validation middleware
- Real-time metrics (Redis Streams)
- VPN certificate management

**Environment Variables:**
```bash
DB_HOST=postgres
DB_PORT=5432
MQTT_BROKER_URL=mqtt://mosquitto:1883
NEO4J_URI=bolt://neo4j:7687
LICENSE_PUBLIC_KEY=<RSA public key>
IOTISTIC_LICENSE_KEY=<JWT token>
```

### Agent Service (`agent/`)
**Port:** 48484 (Device API)

**Capabilities:**
- Container orchestration (Docker/K3s)
- Target state reconciliation
- Container state management (running/stopped/paused)
- Device provisioning
- Cloud API synchronization

**Container State Control:**
```json
{
  "services": [{
    "serviceName": "nodered",
    "state": "paused",
    "config": {
      "ports": ["1880:1880"],
      "volumes": ["nodered-data:/data"]
    }
  }]
}
```

### Dashboard (`dashboard/`)
**Port:** 3000

**Pages:**
- Devices - Device list and management
- Digital Twin - Graph visualization and device mapping
- Metrics - Real-time monitoring

**Tech Stack:** React 18 + TypeScript + Vite + Material-UI

### Billing Service (`billing/`)
**Port:** 3100

**Features:**
- Stripe checkout integration
- Customer lifecycle management  
- Kubernetes namespace deployment via Helm
- RS256 JWT license generation
- Deployment queue with Bull + Redis

**Plans:**
- **Starter** - 10 devices, shared Prometheus, 30-day retention
- **Professional** - 50 devices, shared Prometheus, 90-day retention  
- **Enterprise** - Unlimited devices, dedicated Prometheus + Grafana

## Configuration



### Database Schema

**PostgreSQL Tables:**
- `devices` - Device registry with shadow state
- `mqtt_acls` - MQTT topic access control
- `device_tags` - Flexible key-value device metadata
- `metrics` - Time-series data storage
- `vpn_certificates` - VPN CA/cert management

**Neo4j Graph:**
- Device nodes
- Space nodes (from IFC files)
- Relationships: LOCATED_IN, CONTAINS, MONITORS

### Multi-Tenant Settings
```yaml
# Customer namespace: customer-{8-char-id}
# Helm chart: charts/customer-instance/
# License JWT contains:
{
  "customerId": "cust_...",
  "plan": "starter",
  "features": {
    "maxDevices": 10,
    "hasDedicatedPrometheus": false
  }
}
```

## 📊 Usage

### Accessing Services

After installation, access your services at:

| Service | URL | Description |
|---------|-----|-------------|
| **Dashboard** | `http://<pi-ip>/dashboard/kiosk` | Full-screen monitoring dashboard |
| **Grafana** | `http://<pi-ip>:3000` | Data visualization (admin/admin) |
| **Node-RED** | `http://<pi-ip>:1880` | Flow programming interface |
| **InfluxDB** | `http://<pi-ip>:8086` | Database management |
| **Admin Panel** | `http://<pi-ip>:51850` | System management |

### Default Credentials

- **Grafana**: `admin` / `admin` (change on first login)
- **InfluxDB**: Setup wizard on first access

### MQTT Topics

- **Temperature Data**: `sensor/temperature`
- **Humidity Data**: `sensor/humidity`
- **Pressure Data**: `sensor/pressure`
- **Gas/Air Quality**: `sensor/gas`
- **System Status**: `system/status`
- **Alerts**: `alerts/environmental`

### Environmental Monitoring

The system automatically:
1. **Reads** environmental data from BME688 sensor every second (temperature, humidity, pressure, gas resistance)
2. **Publishes** data to MQTT broker on separate topics
3. **Stores** historical data in InfluxDB
4. **Visualizes** real-time and historical data in Grafana
5. **Triggers** alerts based on configured thresholds for air quality and environmental conditions

## � Remote Device Access

The system supports SSH reverse tunneling for remote device access without VPN complexity.

### Why SSH Reverse Tunnel?

- ✅ **Simple Setup**: No VPN server required
- ✅ **Built-in Security**: Uses SSH key authentication
- ✅ **Firewall Friendly**: Works through standard SSH port 22
- ✅ **Auto-Reconnect**: Automatically re-establishes lost connections
- ✅ **Multiple Devices**: Support for fleet management

### Architecture

```
Device (Behind NAT/Firewall)           Cloud Server (Public IP)
┌─────────────────────┐               ┌─────────────────────┐
│   Device Agent      │               │   Cloud API         │
│   localhost:48484   │─────SSH───▶   │   localhost:48484   │
│                     │   Tunnel      │   (forwarded)       │
└─────────────────────┘               └─────────────────────┘
```

The device establishes an SSH reverse tunnel to your cloud server, making its Device API accessible remotely.

### Quick Setup

Remote access can be configured **during initial installation** or **added later**.

#### Option 1: During Installation (Recommended)

When running `bin/install.sh`, you'll be prompted:
```
╔═══════════════════════════════════════════════════════════╗
║     Remote Device Access Setup (Optional)                 ║
╚═══════════════════════════════════════════════════════════╝

? Would you like to enable remote access? (y/N)
```

If you choose "Yes":
1. Enter your cloud server hostname (e.g., `cloud.example.com`)
2. Enter SSH username (default: `tunnel`)
3. The script will generate SSH keys and copy them to cloud server
4. Remote access will be enabled automatically after installation completes

#### Option 2: After Installation

If you skipped remote access during installation, run the setup script:

```bash
bash bin/setup-remote-access.sh cloud.example.com tunnel
```

This script will:
- Generate SSH keys on the device
- Copy public key to cloud server
- Configure cloud server SSH settings
- Update .env with remote access configuration
- Test the tunnel connection

Then restart the device agent:
```bash
docker-compose restart agent
```

#### Verify Connection

From your cloud server:
```bash
curl http://localhost:48484/v2/device
curl http://localhost:48484/v2/applications/state
```

### Manual Configuration

If you prefer manual setup:

1. **Generate SSH key on device**:
```bash
mkdir -p data/ssh
ssh-keygen -t ed25519 -f data/ssh/id_rsa -N ""
```

2. **Copy public key to cloud server**:
```bash
ssh-copy-id -i data/ssh/id_rsa.pub tunnel@cloud.example.com
```

3. **Configure cloud server** (`/etc/ssh/sshd_config`):
```
GatewayPorts yes
ClientAliveInterval 60
ClientAliveCountMax 3
```

4. **Add to `.env`**:
```bash
ENABLE_REMOTE_ACCESS=true
CLOUD_HOST=cloud.example.com
CLOUD_SSH_PORT=22
SSH_TUNNEL_USER=tunnel
SSH_KEY_PATH=/app/data/ssh/id_rsa
```

5. **Restart services**:
```bash
sudo systemctl restart sshd  # On cloud server
docker-compose restart agent  # On device
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_REMOTE_ACCESS` | `false` | Enable SSH reverse tunnel |
| `CLOUD_HOST` | - | Cloud server hostname/IP (required) |
| `CLOUD_SSH_PORT` | `22` | SSH port on cloud server |
| `SSH_TUNNEL_USER` | `tunnel` | SSH user on cloud server |
| `SSH_KEY_PATH` | `/app/data/ssh/id_rsa` | Path to SSH private key |
| `SSH_AUTO_RECONNECT` | `true` | Auto-reconnect on disconnect |
| `SSH_RECONNECT_DELAY` | `5000` | Delay before reconnect (ms) |

### Multi-Device Management

For managing multiple devices, assign each device a unique port:

**Device 1**:
```bash
DEVICE_API_PORT=48484
```

**Device 2**:
```bash
DEVICE_API_PORT=48485
```

**Device 3**:
```bash
DEVICE_API_PORT=48486
```

Then access each device from cloud:
```bash
curl http://localhost:48484/v2/device  # Device 1
curl http://localhost:48485/v2/device  # Device 2
curl http://localhost:48486/v2/device  # Device 3
```

### Monitoring

Check tunnel status in logs:
```bash
docker-compose logs -f agent | grep -i tunnel
```

Expected output:
```
🔌 Initializing SSH reverse tunnel...
   Cloud: cloud.example.com:22
   Tunnel: cloud:48484 -> device:48484
✅ SSH reverse tunnel established successfully
```

### Troubleshooting

**Tunnel not connecting:**
- Verify cloud server is reachable: `ping cloud.example.com`
- Check SSH key permissions: `ls -la data/ssh/id_rsa` (should be 600)
- Test SSH connection: `ssh -i data/ssh/id_rsa tunnel@cloud.example.com`

**Tunnel disconnects frequently:**
- Check network stability
- Adjust `SSH_RECONNECT_DELAY` if needed
- Verify cloud server `ClientAliveInterval` settings

**Port already in use:**
- Choose a different `DEVICE_API_PORT`
- Check for existing tunnels: `ps aux | grep ssh`

For more details, see [`docs/REMOTE-ACCESS.md`](docs/REMOTE-ACCESS.md).

## �🛠️ Development

### Project Structure

```
Iotistic-sensor/
├── admin/                  # Web admin interface
├── ansible/               # Deployment automation
│   ├── roles/
│   │   ├── system/        # System configuration
│   │   ├── network/       # Network setup
│   │   └── kiosk/         # Kiosk mode setup
│   └── deploy.yml         # Main playbook
├── api/                   # REST API service
├── bin/                   # Installation scripts
├── grafana/               # Grafana configuration
├── influx/                # InfluxDB setup
├── bme688/                # Environmental sensor code
├── mosquitto/             # MQTT broker config
├── nginx/                 # Reverse proxy config
├── nodered/               # Node-RED flows and nodes
├── sensor-simulator/      # BME688 sensor simulator (for testing)
└── portainer/             # Container management
```

### Sensor Simulator (Testing Without Hardware)

For testing the sensor publish feature without physical BME688 sensors, we provide a complete sensor simulator:

```bash
# Start the simulator (generates 3 fake sensors by default)
docker-compose -f docker-compose.dev.yml up -d sensor-simulator

# View logs
docker-compose logs -f sensor-simulator

# Configure number of sensors
echo "SIM_NUM_SENSORS=5" > .env
docker-compose -f docker-compose.dev.yml restart sensor-simulator
```

**Features:**
- ✅ Generates realistic BME688 data (temperature, humidity, pressure, gas resistance)
- ✅ Multiple sensors with independent data streams
- ✅ Unix domain socket communication
- ✅ Simulates sensor failures and recovery
- ✅ Configurable publish intervals (default: 60 seconds)
- ✅ JSON output format with newline delimiter

**Configuration:**
All settings via environment variables in `.env`:
- `SIM_NUM_SENSORS=3` - Number of simulated sensors
- `SIM_PUBLISH_INTERVAL_MS=60000` - Publish frequency
- `SIM_ENABLE_FAILURES=true` - Enable random failures
- `SIM_FAILURE_CHANCE=0.05` - Failure probability (5%)
- `SIM_LOG_LEVEL=info` - Logging level

See [`sensor-simulator/README.md`](sensor-simulator/README.md) for complete documentation and [`sensor-simulator/QUICKSTART.md`](sensor-simulator/QUICKSTART.md) for getting started.

### Custom Sensor Integration

3. **Add to Docker Compose**:
```yaml
your-sensor:
  build: ./sensors/your-sensor
  volumes:
    - /dev:/dev
  privileged: true
  networks:
    - Iotistic-net
```

### Custom Node-RED Nodes

The system includes custom machine learning nodes:
- **Dataset Management**: Load, create, split datasets
- **Model Training**: Various ML algorithms
- **Prediction**: Real-time inference
- **Evaluation**: Model performance metrics


### Log Files

- **System logs**: `/var/log/syslog`
- **Docker logs**: `docker-compose logs`
- **Application logs**: `logs/` directory in each service
- **Sensor logs**: Check BME688 container output

### Performance Optimization

**For Raspberry Pi 3 and older**:
- Reduce Grafana refresh rates
- Limit InfluxDB retention policies
- Optimize Node-RED flows
- Use memory limits in docker-compose.yml

**For Resource-Constrained Systems**:
```yaml
# Add to docker-compose.yml services
deploy:
  resources:
    limits:
      memory: 512M
    reservations:
      memory: 256M
```

## 🔄 Maintenance

### Regular Updates

```bash
# Update containers
cd /home/$USER/iotistic
./bin/upgrade_containers.sh

# System updates
sudo apt update && sudo apt upgrade
```

### Backup Data

```bash
# Backup InfluxDB data
docker exec influxdb influx backup /backup

# Backup Grafana dashboards
docker exec grafana grafana-cli admin export-dashboard

# Backup Node-RED flows
cp nodered/data/flows.json flows_backup_$(date +%Y%m%d).json
```

### Monitoring Health

```bash
# Check all services
docker-compose ps

# Monitor resource usage
docker stats

# Check disk space
df -h
```

## 🤝 Contributing

We welcome contributions! Please:

1. **Fork** the repository
2. **Create** a feature branch
3. **Make** your changes
4. **Test** thoroughly
5. **Submit** a pull request


### Service Communication
Use container names for inter-service URLs:
```typescript
// Internal Docker networking
const mqttUrl = 'mqtt://mosquitto:1883';
const dbHost = 'postgres';
const apiUrl = 'http://api:3002';
```

### MQTT Topics
```
sensor/temperature
sensor/humidity
sensor/pressure
system/status
alerts/environmental
```

## Development

### Starting Services Locally
```powershell
# Start PostgreSQL
docker-compose up -d postgres

# Start API
cd api && npm run dev

# Start Dashboard
cd dashboard && npm run dev
```

### Database Migrations
```bash
# Create migration
cd api && npx knex migrate:make migration_name

# Run migrations
npx knex migrate:latest
```

## Deployment

### Kubernetes
See [K8S Deployment Guide](docs/K8S-DEPLOYMENT-GUIDE.md)

**Prerequisites:**
- Kubernetes cluster
- Helm 3+
- ServiceMonitor CRD installed
- Stripe account

### Edge Device (Ansible)
```bash
cd ansible && ./run.sh
```

## Troubleshooting

### License Validation Fails
```bash
# Verify keys
cd billing && npm run verify-keys

# Check JWT
echo $IOTISTIC_LICENSE_KEY | cut -d'.' -f2 | base64 -d | jq
```

### K8s Deployment Fails
```bash
# Install ServiceMonitor CRD
kubectl apply -f https://raw.githubusercontent.com/prometheus-operator/prometheus-operator/main/example/prometheus-operator-crd/monitoring.coreos.com_servicemonitors.yaml

# Check logs
kubectl logs -n billing deployment/billing-api
```

### MQTT Connection Issues
```bash
# Test connection
mosquitto_pub -h localhost -p 5883 -t test -m "hello"

# Check ACL
docker exec -it iotistic-postgres psql -U postgres -d iotistic \
  -c "SELECT * FROM mqtt_acls;"
```

## Documentation

- [Complete Implementation Guide](docs/COMPLETE-IMPLEMENTATION-GUIDE.md)
- [K8s Deployment Guide](docs/K8S-DEPLOYMENT-GUIDE.md)
- [Customer Signup Flow](docs/CUSTOMER-SIGNUP-K8S-DEPLOYMENT.md)
- [Helm Chart Documentation](charts/docs/README.md)
- [Billing System Guide](billing/docs/README.md)
- [Agent Documentation](agent/README.md)
- [API Documentation](api/README.md)

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## Support

- **Issues**: [GitHub Issues](https://github.com/Iotistica/iotistic/issues)
- **Documentation**: [Wiki](https://github.com/Iotistica/iotistic/wiki)
- **Discussions**: [GitHub Discussions](https://github.com/Iotistica/iotistic/discussions)

## Version

Current version: **Latest** (rolling release from master branch)

For stable releases, check: [Releases](https://github.com/Iotistica/iotistic/releases)

---

**Built with:** Node.js, TypeScript, React, PostgreSQL, Neo4j, Mosquitto MQTT, Docker, Kubernetes, Helm, Stripe
            "imageName": "nginx:alpine",
            "appId": 1001,
            "appName": "my-nginx-test",
            "config": {
              "image": "nginx:alpine",
              "ports": ["8085:80"]
            }
          }
        ]
      },
      "1002": {
        "appId": 1002,
        "appName": "database",
        "services": [
          {
            "serviceId": 1,
            "serviceName": "postgres",
            "imageName": "postgres:15-alpine",
            "appId": 1002,
            "appName": "database",
            "config": {
              "image": "postgres:15-alpine",
              "ports": ["5432:5432"],
              "environment": {
                "POSTGRES_PASSWORD": "mysecretpassword",
                "POSTGRES_DB": "mydb"
              }
            }
          }
        ]
      }
    }
  }'
