# Iotistic IoT Environmental Monitoring System

A comprehensive IoT solution for environmental monitoring using Bosch BME688 gas sensors with Raspberry Pi, featuring real-time data visualization, machine learning capabilities, and kiosk mode display. This sensor system was designed with SPE (Single Pair Ethernet) technology by **[Iotistic Inc](https://Iotistic.com)**, the leader in SPE technology solutions. The application software was expertly designed by the IoT software experts team at **[Iotistic Inc](http://www.iotistic.ca)**.

## 🌟 Features

- **Environmental Monitoring**: Real-time sensing using Bosch BME688 4-in-1 environmental sensors (temperature, humidity, pressure, gas/air quality)
- **SPE Technology**: Designed with Single Pair Ethernet (SPE) connectivity for simplified wiring and power delivery
- **IoT Stack**: Complete containerized solution with Docker Compose
- **Data Visualization**: Grafana dashboards for real-time monitoring and historical analysis
- **Data Storage**: InfluxDB time-series database for sensor data
- **MQTT Communication**: Eclipse Mosquitto broker for sensor data streaming
- **Automation**: Node-RED for IoT workflows and data processing
- **Machine Learning**: Custom Node-RED ML nodes for predictive analytics
- **Kiosk Mode**: Full-screen dashboard display for dedicated monitoring stations
- **Web Admin**: Management interface for system configuration
- **Multi-Platform**: Supports Raspberry Pi (1-5), x86_64, and ARM architectures

## 📋 Table of Contents

- [Architecture](#-architecture)
- [Hardware Requirements](#-hardware-requirements)
- [Software Requirements](#-software-requirements)
- [Quick Start](#-quick-start)
- [Installation Methods](#-installation-methods)
- [Service Configuration](#-service-configuration)
- [Usage](#-usage)
- [Remote Device Access](#-remote-device-access)
- [Development](#-development)
- [Troubleshooting](#-troubleshooting)
- [Maintenance](#-maintenance)
- [Contributing](#-contributing)
- [License](#-license)
- [Support](#-support)
- [Version](#-version)

## 🏗️ Architecture

The system consists of several containerized services:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   BOSCH BME688  │    │   Raspberry Pi  │    │   Web Client    │
│  Environmental  │───▶│   I2C Reader    │───▶│   Dashboard     │
│   Sensor        │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Docker Container Stack                      │
├─────────────────┬─────────────────┬─────────────────┬─────────────┤
│    Mosquitto    │    Node-RED     │    InfluxDB     │   Grafana   │
│  MQTT Broker    │  Flow Engine    │  Time Series    │ Visualization│
│   Port: 1883    │  Port: 1880     │   Port: 8086    │ Port: 3000  │
└─────────────────┴─────────────────┴─────────────────┴─────────────┤
│                         Nginx Reverse Proxy                     │
│                           Port: 80                              │
└─────────────────────────────────────────────────────────────────┘
```

### Service Overview

| Service | Purpose | Default Port | Container Name |
|---------|---------|--------------|----------------|
| **Nginx** | Reverse proxy & web server | 80 | nginx |
| **Mosquitto** | MQTT message broker | 1883/9001 | mosquitto |
| **Node-RED** | IoT flow programming | 1880 | nodered |
| **InfluxDB** | Time-series database | 8086 | influxdb |
| **Grafana** | Data visualization | 3000 | grafana |
| **BME688** | Environmental sensor reader | - | bme688 |
| **Admin Panel** | System management | 51850 | admin |

## 🔧 Hardware Requirements

### Minimum Requirements
- **Raspberry Pi 3 or newer** (Pi 3+ required for optimal performance)
- **8GB+ SD Card** (16GB+ recommended)
- **Stable power supply** (5V 2.5A minimum for Pi 3+)
- **Network connectivity** (Ethernet or WiFi)

### Sensor Hardware
- **Bosch BME688 Environmental Sensor**
- **4-in-1 measurements**: Temperature, Humidity, Pressure, Gas/Air Quality
- **SPE Connectivity**: Single Pair Ethernet for data and power (designed by [Iotistic Inc](https://Iotistic.com))
- **Ethernet Connection**: Sensor connected to Raspberry Pi via Ethernet interface
- **Default Network Address**: Configurable via DHCP or static IP assignment

### Alternative Platforms
- **x86_64 Linux** systems (Ubuntu, Debian)
- **ARM64** single-board computers

## 💻 Software Requirements

### Target System (Raspberry Pi)
- **Debian/Raspbian** 11+ (Bullseye or newer)
- **NodeJS**
- **Docker & Docker Compose** (installed automatically)


### Development/Control System
- **NodeJS**
- **Ansible** (for automated deployment)
- **Git**
- **SSH access** to target system

## 🚀 Quick Start

### Option 1: Automated Installation (Recommended)

For a completely automated setup on a fresh Raspberry Pi:

```bash
# Download and run the installer
curl -fsSL https://scripts.iotistic.ca/install | bash
```

This will:
- ✅ Install all dependencies
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

## 📦 Installation Methods

### Method 1: Direct Installation
Perfect for single Raspberry Pi setups:

```bash
# SSH into your Raspberry Pi
ssh pi@<raspberry-pi-ip>

# Download and run installer
curl -fsSL https://scripts.iotistic.ca/install | bash
```

### Method 2: Ansible Controlled Deployment
Ideal for multiple devices or remote deployment using containerized Ansible:

1. **Configure inventory**:
```bash
# Edit ansible/hosts.ini with your Pi's details
echo "pi@192.168.1.100 ansible_ssh_pass=yourpassword" > ansible/hosts.ini
```

2. **Configure environment**:
```bash
# Copy and edit the environment file
cp ansible/.env.pi.example ansible/.env.pi
# Edit .env.pi with your specific configuration
```

3. **Run deployment** (using containerized Ansible):
```bash
# Execute the deployment script
./ansible/run.sh
```

The `run.sh` script automatically:
- Builds the Ansible Docker container
- Mounts the project workspace
- Loads environment variables from `.env.pi`
- Executes the deployment playbook

### Method 3: Development Setup
For development and testing:

```bash
# Clone repository
git clone https://github.com/Iotistica/iotistic.git
cd iotistic

# Start development stack
docker-compose -f docker-compose.dev.yml up -d
```

## ⚙️ Service Configuration

### Environment Variables

Create `.env` file to customize port mappings:

```bash
# External port mappings
MOSQUITTO_PORT_EXT=51883
MOSQUITTO_WS_PORT_EXT=59001
NODERED_PORT_EXT=51880
INFLUXDB_PORT_EXT=58086
GRAFANA_PORT_EXT=53000
ADMIN_PORT=51850

# InfluxDB Configuration
INFLUXDB_INIT_ORG=Iotistic
INFLUXDB_INIT_BUCKET=ZUS80LP

# Network Configuration
NTP_SERVER_IP=192.168.1.100
KIOSK_IP=192.168.1.30/24
```

### Sensor Configuration

For complete sensor setup, configuration, and CLI commands, see the comprehensive guide:

📖 **[Sensor Setup Guide](SENSOR.md)** - Complete hardware setup, network configuration, MQTT broker setup, and troubleshooting

This guide covers:
- **Hardware Setup**: Physical connections and SPE connectivity
- **Initial Connection**: Serial and network access methods
- **CLI Configuration**: Complete command reference for network and MQTT setup
- **Sensor Validation**: BME688 environmental sensor verification
- **Troubleshooting**: Common issues and diagnostic commands

> **Quick Reference**: The BME688 sensor connects via SPE (Single Pair Ethernet) and provides 4-in-1 environmental measurements: temperature, humidity, pressure, and gas/air quality.

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

### Development Guidelines

- Follow Python PEP 8 style guide
- Add unit tests for new features
- Update documentation
- Ensure Docker builds work on all platforms

## 📄 License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for details.

## 🆘 Support

- **Issues**: [GitHub Issues](https://github.com/Iotistica/iotistic/issues)
- **Documentation**: [Wiki](https://github.com/Iotistica/iotistic/wiki)
- **Discussions**: [GitHub Discussions](https://github.com/Iotistica/iotistic/discussions)

## 🏷️ Version

Current version: **Latest** (rolling release from master branch)

For stable releases, check: [Releases](https://github.com/Iotistica/iotistic/releases)

---

**Powered by [Iotistic Inc](https://Iotistic.com) SPE Technology** | **Software by [Iotistic Inc](http://www.iotistic.ca) IoT Experts** | **Made with ❤️ for the IoT community**

### About Iotistic Inc
[Iotistic Inc](https://Iotistic.com) is the industry leader in Single Pair Ethernet (SPE) technology, providing innovative solutions for simplified industrial networking. Our SPE technology enables both data and power transmission over a single pair of wires, reducing installation complexity and costs for IoT deployments.

### About Iotistic Inc 
The application software was expertly crafted by the IoT software specialists at **[Iotistic Inc](http://www.iotistic.ca)**. Our team brings decades of experience in industrial IoT solutions, containerized applications, and real-time data systems. We specialize in creating robust, scalable IoT platforms for environmental monitoring and industrial automation.

### Looking for tailored IoT solutions?
Our expert IoT consulting and development services are designed to help you optimize your systems and drive innovation. Contact us today to discuss how we can support your next project!

# 

curl -X POST http://localhost:3002/api/v1/state/target \
  -H "Content-Type: application/json" \
  -d '{
    "apps": {
      "1001": {
        "appId": 1001,
        "appName": "my-nginx-test",
        "services": [
          {
            "serviceId": 1,
            "serviceName": "nginx",
            "imageName": "nginx:alpine",
            "appId": 1001,
            "appName": "my-nginx-test",
            "config": {
              "image": "nginx:alpine",
              "ports": ["8085:80"],
              "environment": {
                "ENV": "production"
              }
            }
          }
        ]
      }
    }
  }'

# apply target state

curl -X POST http://localhost:3002/api/v1/state/apply

# remove a specific app
curl -X POST http://localhost:3002/api/v1/state/target \
  -H "Content-Type: application/json" \
  -d '{
    "apps": {
      "1002": {
        "appId": 1002,
        "appName": "other-app",
        "services": [...]
      }
    }
  }'

  # get current state

  curl http://localhost:3002/api/v1/state


  # add new apps

  curl -X POST http://localhost:3002/api/v1/state/target \
  -H "Content-Type: application/json" \
  -d '{
    "apps": {
      "1001": {
        "appId": 1001,
        "appName": "my-nginx-test",
        "services": [
          {
            "serviceId": 1,
            "serviceName": "nginx",
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
