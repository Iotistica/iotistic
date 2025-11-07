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

### Multi-Device Management (docker compose testing only)

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
iotistic/
├── agent/                 # Edge device container orchestrator
│   ├── src/
│   │   ├── compose/       # Docker Compose orchestration
│   │   ├── k3s/           # K3s Kubernetes orchestration
│   │   ├── device-api/    # REST API (port 48484)
│   │   └── orchestrator/  # State reconciliation logic
│   └── data/              # SQLite database, logs
├── api/                   # Cloud/device management API
│   ├── src/
│   │   ├── routes/        # REST endpoints
│   │   ├── services/      # Neo4j, MQTT, VPN
│   │   ├── middleware/    # License validation, auth
│   │   └── db/            # PostgreSQL connection
│   └── database/migrations/
├── dashboard/             # React web interface
│   ├── src/
│   │   ├── pages/         # Devices, Digital Twin
│   │   ├── components/    # Graph visualization, device mapping
│   │   └── utils/         # IFC parser, helpers
│   └── build/             # Production build (gitignored)
├── billing/               # Multi-tenant SaaS billing service
│   ├── src/
│   │   ├── services/      # K8s deployment, license generation
│   │   ├── workers/       # Bull queue for async deployments
│   │   └── routes/        # Customer signup, webhooks
│   ├── keys/              # RSA keys for JWT signing
│   └── migrations/        # Customer/subscription schema
├── billing-exporter/      # Prometheus metrics collector
│   └── src/collectors/    # Device, MQTT, storage metrics
├── charts/                # Helm charts for K8s deployment
│   ├── customer-instance/ # Per-customer namespace chart
│   ├── billing/           # Global billing service chart
│   └── docs/              # K8s setup guides
├── ansible/               # Deployment automation
│   ├── roles/
│   │   ├── system/        # System configuration
│   │   ├── network/       # Network setup
│   │   └── docker/        # Docker installation
│   └── run.sh             # Deployment script
├── docs/                  # Comprehensive documentation
│   ├── K8S-DEPLOYMENT-GUIDE.md
│   ├── CUSTOMER-SIGNUP-K8S-DEPLOYMENT.md
│   ├── provisioning/      # Device provisioning guides
│   ├── mqtt/              # MQTT architecture docs
│   └── database/          # PostgreSQL optimization
├── argocd/                # GitOps continuous deployment
│   ├── customers/         # Per-customer app configs
│   └── shared/            # Shared infrastructure
├── mosquitto/             # MQTT broker configuration
│   ├── mosquitto.conf     # PostgreSQL ACL integration
│   └── data/              # Persistence (gitignored)
├── postgres/              # PostgreSQL configuration
│   ├── pg_hba.conf        # Client authentication
│   └── data/              # Database files (gitignored)
├── sensor-simulator/      # Generic MQTT sensor simulator
│   └── src/               # Configurable test data generator
├── bin/                   # Installation and setup scripts
│   ├── install.sh         # Main installer
│   └── setup-remote-access.sh
├── docker-compose.yml     # Production stack
├── docker-compose.dev.yml # Development stack
└── .github/
    └── copilot-instructions.md  # AI coding guidelines
```

### Local Development Setup

**Start core services:**
```bash
# Start PostgreSQL, Mosquitto, Redis, Neo4j
docker-compose up -d postgres mosquitto redis neo4j

# Start API (Node.js)
cd api && npm install && npm run dev

# Start Dashboard (React)
cd dashboard && npm install && npm run dev

# Start Agent (for testing orchestration)
cd agent && npm install && npm run dev
```

**Access services:**
- API: http://localhost:4002
- Dashboard: http://localhost:3000  
- Agent Device API: http://localhost:48484
- PostgreSQL: localhost:5432
- Mosquitto MQTT: localhost:5883
- Neo4j Browser: http://localhost:7474

### Testing with Sensor Simulator

For testing MQTT data flows without physical hardware:

```bash
# Start simulator (publishes to MQTT)
docker-compose -f docker-compose.simulator.yml up -d

# Configure simulator
echo "NUM_SENSORS=5" >> .env
echo "PUBLISH_INTERVAL_MS=10000" >> .env

# View simulated data
docker-compose logs -f sensor-simulator
```

The simulator publishes generic sensor data to configurable MQTT topics.

### Debugging and Logs

**View service logs:**
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f api
docker-compose logs -f mosquitto
docker-compose logs -f agent

# Application logs (when running locally)
tail -f api/logs/app.log
tail -f agent/logs/orchestrator.log
```

**Database debugging:**
```bash
# Connect to PostgreSQL
docker exec -it iotistic-postgres psql -U postgres -d iotistic

# View device state
SELECT * FROM devices LIMIT 10;

# Check MQTT ACLs
SELECT * FROM mqtt_acls;
```

### Performance Optimization

**For Raspberry Pi:**
- Use lightweight images (alpine variants)
- Limit Docker memory: `mem_limit: 512M` in docker-compose.yml
- Reduce PostgreSQL shared_buffers
- Disable unused services

**For Production:**
- Enable connection pooling (PostgreSQL, Redis)
- Use Redis for caching frequently accessed data
- Configure Prometheus retention based on plan
- Implement data retention policies

**Resource Limits Example:**
```yaml
# Add to docker-compose.yml services
deploy:
  resources:
    limits:
      memory: 512M
    reservations:
      memory: 256M
```

## Maintenance

### Regular Updates

```bash
# Update repository
cd ~/iotistic
git pull

# Update containers
docker-compose pull
docker-compose up -d

# Update dependencies (for local development)
cd api && npm install
cd ../dashboard && npm install
cd ../agent && npm install
```

### Backup Data

**PostgreSQL:**
```bash
# Backup database
docker exec iotistic-postgres pg_dump -U postgres iotistic > backup_$(date +%Y%m%d).sql

# Restore database
cat backup_20250107.sql | docker exec -i iotistic-postgres psql -U postgres -d iotistic
```

**Neo4j:**
```bash
# Backup Neo4j database
docker exec neo4j neo4j-admin dump --database=neo4j --to=/backups/neo4j_$(date +%Y%m%d).dump

# Restore
docker exec neo4j neo4j-admin load --from=/backups/neo4j_20250107.dump --database=neo4j --force
```

**Configuration:**
```bash
# Backup environment and configs
tar -czf config_backup_$(date +%Y%m%d).tar.gz .env docker-compose.yml postgres/pg_hba.conf mosquitto/mosquitto.conf
```

### Monitoring Health

```bash
# Check all services
docker-compose ps

# Monitor resource usage
docker stats

# Check disk space
df -h

# View API health
curl http://localhost:4002/health

# Check agent status
curl http://localhost:48484/v2/device
```

### Database Maintenance

```bash
# Vacuum PostgreSQL
docker exec -it iotistic-postgres psql -U postgres -d iotistic -c "VACUUM ANALYZE;"

# Check database size
docker exec -it iotistic-postgres psql -U postgres -d iotistic -c "SELECT pg_size_pretty(pg_database_size('iotistic'));"

# Clean old metrics (if needed)
docker exec -it iotistic-postgres psql -U postgres -d iotistic -c "DELETE FROM metrics WHERE timestamp < NOW() - INTERVAL '90 days';"
```

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


## Version

Current version: **Latest** (rolling release from master branch)

For stable releases, check: [Releases](https://github.com/Iotistica/iotistic/releases)

---

**Built with:** Node.js, TypeScript, React, PostgreSQL, Neo4j, Mosquitto MQTT, Docker, Kubernetes, Helm, Stripe
         