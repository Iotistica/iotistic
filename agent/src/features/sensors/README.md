# Protocol Adapters

Multi-protocol industrial sensor adapters for IoT data collection. Each adapter reads data from its respective protocol (Modbus, CAN, OPC-UA, etc.) and streams it via Unix sockets to the agent's sensor-publish system.

> **Part of the Iotistic Agent** - This module is integrated into the main agent and shares dependencies through `agent/package.json`.

## 📋 Table of Contents

- [Architecture](#architecture)
- [Features](#features)
- [Quick Start](#quick-start)
- [Folder Structure](#folder-structure)
- [Building](#building)
- [Configuration](#configuration)
- [Modbus Protocol](#modbus-protocol)
- [Integration with Agent](#integration-with-agent)
- [Docker Deployment](#docker-deployment)
- [Adding New Protocols](#adding-new-protocols)
- [Windows Setup](#windows-setup)
- [Troubleshooting](#troubleshooting)

---

## 🏗️ Architecture

### Design Pattern

Each protocol adapter follows a consistent pattern:

```
Protocol Devices → Protocol Adapter → Unix Socket → Sensor-Publish → MQTT → Cloud
```

### Generic Data Model

All protocols convert their data to a common `SensorDataPoint` format:

```typescript
interface SensorDataPoint {
  deviceName: string;      // ANY device name
  registerName: string;    // ANY data point name (register, signal, tag, etc.)
  value: number | boolean | string;
  unit: string;
  timestamp: string;
  quality: 'good' | 'bad' | 'uncertain';
}
```

### Multi-Protocol Flow

```
Modbus Devices → Modbus Adapter (48485) → /tmp/modbus.sock → Sensor-Publish → MQTT
CAN Bus        → CAN Adapter (48486)    → /tmp/can.sock    → Sensor-Publish → MQTT  
OPC-UA Servers → OPC-UA Adapter (48487) → /tmp/opcua.sock  → Sensor-Publish → MQTT
```

---

## ✨ Features

### Core Features
- **Protocol-Agnostic Design**: Reusable socket server and data structures
- **Multiple Protocols**: Modbus (TCP/RTU/ASCII), CAN (planned), OPC-UA (planned)
- **Unix Socket Streaming**: Non-blocking, high-performance data delivery
- **Real-time Monitoring**: Device status tracking and error handling
- **Auto-reconnection**: Automatic retry on connection failures
- **TypeScript**: Full type safety and validation

### Modbus-Specific
- **Multiple Modbus Protocols**: TCP, RTU, ASCII support
- **Flexible Data Types**: INT16, UINT16, INT32, UINT32, FLOAT32, BOOLEAN, STRING
- **Configurable Polling**: Per-device polling intervals
- **Multiple Output Formats**: JSON and CSV data formats

---

## 🚀 Quick Start

### Installation

Dependencies are managed by the main agent:

```bash
cd agent
npm install  # Installs all dependencies including protocol adapters
```

### Building

```bash
# Build everything (agent + protocol adapters)
cd agent
npm run build

# Build only protocol adapters
cd agent
npm run build:protocol-adapters
```

### Running Modbus Adapter Standalone

```bash
# Generate example configuration
cd agent/protocol-adapters
node dist/modbus/index.js --example-config modbus/config/example.json

# Validate configuration
node dist/modbus/index.js --validate-config modbus/config/demo.json

# Run with config file
node dist/modbus/index.js --config modbus/config/demo.json --log-level debug
```

### Running as Agent Feature

```bash
export ENABLE_PROTOCOL_ADAPTERS=true
export MODBUS_ENABLED=true
export MODBUS_CONFIG_PATH=/config/modbus.json

cd agent
npm run dev
```

---

## 📁 Folder Structure

```
agent/protocol-adapters/
  ├── common/                    # Shared, protocol-agnostic code
  │   ├── socket-server.ts       # Generic Unix socket streaming
  │   ├── logger.ts              # Shared logging interface
  │   └── types.ts               # Generic types (SensorDataPoint, Logger, etc.)
  │
  ├── modbus/                    # Modbus TCP/RTU/ASCII adapter ✅
  │   ├── modbus-adapter.ts      # Main orchestrator
  │   ├── modbus-client.ts       # Protocol implementation
  │   ├── config-loader.ts       # Configuration management
  │   ├── types.ts               # Modbus-specific types
  │   ├── index.ts               # CLI entry point
  │   └── config/                # Example configurations
  │       ├── demo.json
  │       ├── example.json
  │       └── windows.json
  │
  ├── can/                       # CAN bus adapter 🚧
  │
  ├── opcua/                     # OPC-UA adapter 🚧
  │
  ├── dist/                      # Compiled JavaScript output
  │   ├── common/
  │   └── modbus/
  │
  └── tsconfig.json              # TypeScript configuration
```

### Key Principles

1. **Protocol Separation**: Each protocol in its own folder
2. **Shared Infrastructure**: `common/` code reused across all protocols
3. **Generic Data Model**: All adapters output `SensorDataPoint[]`
4. **Unix Socket Streaming**: Each adapter writes to its own socket file

---

## 🔨 Building

### Build System Integration

Protocol adapters are built as part of the agent build process:

```json
// agent/package.json
{
  "scripts": {
    "build": "tsc && npm run copy:migrations && npm run build:protocol-adapters",
    "build:protocol-adapters": "cd protocol-adapters && tsc",
    "clean": "rimraf dist && rimraf protocol-adapters/dist"
  }
}
```

### TypeScript Configuration

```json
// protocol-adapters/tsconfig.json
{
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": ".",
    "target": "ES2020",
    "module": "commonjs"
  },
  "include": [
    "common/**/*",
    "modbus/**/*",
    "can/**/*",
    "opcua/**/*"
  ]
}
```

### Dependencies

All protocol adapter dependencies are in `agent/package.json`:

```json
{
  "dependencies": {
    "modbus-serial": "^8.0.17",  // Modbus TCP/RTU client
    "yargs": "^17.7.2",           // CLI parsing
    "dotenv": "^16.4.5",          // Environment variables
    "zod": "^3.22.4"              // Schema validation
  }
}
```

---

## 📁 Configuration

### Modbus Configuration Example

```json
{
  "devices": [
    {
      "name": "temperature-sensor",
      "slaveId": 1,
      "connection": {
        "type": "tcp",
        "host": "192.168.1.100",
        "port": 502,
        "timeout": 5000,
        "retryAttempts": 3,
        "retryDelay": 1000
      },
      "registers": [
        {
          "name": "temperature",
          "address": 40001,
          "functionCode": 3,
          "dataType": "float32",
          "count": 2,
          "endianness": "big",
          "scale": 0.1,
          "offset": 0,
          "unit": "°C",
          "description": "Temperature reading"
        }
      ],
      "pollInterval": 5000,
      "enabled": true
    }
  ],
  "output": {
    "socketPath": "/tmp/sensors/modbus.sock",
    "dataFormat": "json",
    "delimiter": "\n",
    "includeTimestamp": true,
    "includeDeviceName": true
  },
  "logging": {
    "level": "info",
    "enableConsole": true,
    "enableFile": false
  }
}
```

### Connection Types

#### TCP Connection
```json
{
  "type": "tcp",
  "host": "192.168.1.100",
  "port": 502,
  "timeout": 5000
}
```

#### RTU Connection (Serial)
```json
{
  "type": "rtu",
  "serialPort": "/dev/ttyUSB0",  // Linux/Mac
  "serialPort": "COM3",          // Windows
  "baudRate": 9600,
  "dataBits": 8,
  "stopBits": 1,
  "parity": "none",
  "timeout": 5000
}
```

#### ASCII Connection
```json
{
  "type": "ascii",
  "serialPort": "/dev/ttyUSB0",
  "baudRate": 9600,
  "dataBits": 8,
  "stopBits": 1,
  "parity": "none",
  "timeout": 5000
}
```

---

## 🔌 Modbus Protocol

### Function Codes

| Code | Description | Use Case |
|------|-------------|----------|
| 1 | Read Coils | Digital outputs (read/write) |
| 2 | Read Discrete Inputs | Digital inputs (read-only) |
| 3 | Read Holding Registers | Analog outputs (read/write) |
| 4 | Read Input Registers | Analog inputs (read-only) |

### Data Types

| Type | Description | Registers | Range |
|------|-------------|-----------|-------|
| `int16` | Signed 16-bit integer | 1 | -32,768 to 32,767 |
| `uint16` | Unsigned 16-bit integer | 1 | 0 to 65,535 |
| `int32` | Signed 32-bit integer | 2 | -2,147,483,648 to 2,147,483,647 |
| `uint32` | Unsigned 32-bit integer | 2 | 0 to 4,294,967,295 |
| `float32` | 32-bit floating point | 2 | IEEE 754 |
| `boolean` | Boolean value | 1 | true/false |
| `string` | ASCII string | Variable | Text |

### Register Addressing

Modbus uses different address spaces:

| Type | Modbus Address | Function Code |
|------|----------------|---------------|
| Coils | 00001-09999 | 1 (Read), 5/15 (Write) |
| Discrete Inputs | 10001-19999 | 2 |
| Input Registers | 30001-39999 | 4 |
| Holding Registers | 40001-49999 | 3 (Read), 6/16 (Write) |

**Note**: In JSON config, use the raw address (e.g., `40001` not `0`).

### Output Formats

#### JSON Format
```json
{
  "timestamp": "2025-10-29T14:30:45.123Z",
  "devices": {
    "temperature-sensor": {
      "temperature": {
        "value": 23.5,
        "unit": "°C",
        "quality": "good",
        "timestamp": "2025-10-29T14:30:45.120Z"
      }
    }
  }
}
```

#### CSV Format
```csv
temperature-sensor,temperature,23.5,°C,good,2025-10-29T14:30:45.120Z
temperature-sensor,humidity,65.2,%,good,2025-10-29T14:30:45.120Z
```

---

## 🔗 Integration with Agent

### Feature Configuration

Protocol adapters are enabled via the agent's feature system:

```typescript
// In target state config
{
  "config": {
    "features": {
      "enableProtocolAdapters": true
    },
    "protocolAdapters": {
      "modbus": {
        "enabled": true,
        "configPath": "/config/modbus.json"
      },
      "can": {
        "enabled": false
      },
      "opcua": {
        "enabled": false
      }
    }
  }
}
```

### Environment Variables

```bash
# Enable protocol adapters feature
ENABLE_PROTOCOL_ADAPTERS=true

# Modbus configuration
MODBUS_ENABLED=true
MODBUS_CONFIG_PATH=/config/modbus.json

# CAN configuration (when implemented)
CAN_ENABLED=false

# OPC-UA configuration (when implemented)
OPCUA_ENABLED=false
```

### Sensor-Publish Configuration

Update agent's sensor-publish config to read from protocol adapter sockets:

```json
{
  "sensors": [
    {
      "name": "modbus-sensors",
      "addr": "/tmp/sensors/modbus.sock",
      "eomDelimiter": "\\n",
      "mqttTopic": "sensor/modbus",
      "bufferSize": 100,
      "bufferTimeMs": 1000,
      "qos": 1
    },
    {
      "name": "can-sensors",
      "addr": "/tmp/sensors/can.sock",
      "eomDelimiter": "\\n",
      "mqttTopic": "sensor/can",
      "bufferSize": 100,
      "bufferTimeMs": 1000,
      "qos": 1
    }
  ]
}
```

---

## 🐳 Docker Deployment

### Docker Compose Integration

```yaml
version: '3.8'

services:
  agent:
    image: iotistic/agent:latest
    volumes:
      - sensor-sockets:/tmp/sensors
      - ./config:/config:ro
    environment:
      - ENABLE_PROTOCOL_ADAPTERS=true
      - MODBUS_ENABLED=true
      - MODBUS_CONFIG_PATH=/config/modbus.json
      - MQTT_BROKER=mqtt://mosquitto:1883
    networks:
      - iotistic-net
    restart: unless-stopped

  mosquitto:
    image: eclipse-mosquitto:2.0
    ports:
      - "1883:1883"
    networks:
      - iotistic-net

volumes:
  sensor-sockets:

networks:
  iotistic-net:
    driver: bridge
```

### Volume Sharing

The agent creates Unix sockets in `/tmp/sensors/`:
- `/tmp/sensors/modbus.sock` - Modbus data stream
- `/tmp/sensors/can.sock` - CAN data stream (when implemented)
- `/tmp/sensors/opcua.sock` - OPC-UA data stream (when implemented)

These sockets are read by the sensor-publish feature running inside the agent.

---

## 🆕 Adding New Protocols

### Step-by-Step Guide

1. **Create Protocol Folder**

```bash
mkdir agent/protocol-adapters/new-protocol
```

2. **Implement Adapter**

```typescript
// new-protocol/new-protocol-adapter.ts
import { SocketServer } from '../common/socket-server';
import { SensorDataPoint, Logger } from '../common/types';

export class NewProtocolAdapter {
  private socketServer: SocketServer;
  private logger: Logger;
  
  constructor(config: NewProtocolConfig, logger: Logger) {
    this.socketServer = new SocketServer(config.output, logger);
    this.logger = logger;
  }
  
  async start() {
    // Connect to protocol devices
    await this.connectDevices();
    
    // Start polling/listening
    await this.startDataCollection();
    
    // Start socket server
    await this.socketServer.start();
  }
  
  private async collectData(): Promise<SensorDataPoint[]> {
    // Read from your protocol
    const rawData = await this.readProtocolData();
    
    // Convert to generic format
    const dataPoints: SensorDataPoint[] = rawData.map(d => ({
      deviceName: d.device,
      registerName: d.signal,
      value: d.value,
      unit: d.unit,
      timestamp: new Date().toISOString(),
      quality: 'good'
    }));
    
    // Send to socket
    this.socketServer.sendData(dataPoints);
    
    return dataPoints;
  }
}
```

3. **Create Types**

```typescript
// new-protocol/types.ts
import { z } from 'zod';

export interface NewProtocolConfig {
  devices: NewProtocolDevice[];
  output: SocketOutput;
  logging?: LoggingConfig;
}

export interface NewProtocolDevice {
  name: string;
  // Protocol-specific fields
}
```

4. **Update Feature Integration**

```typescript
// agent/src/protocol-adapters/index.ts
if (this.config.newProtocol?.enabled) {
  await this.startNewProtocolAdapter();
}

private async startNewProtocolAdapter(): Promise<void> {
  const config = // load config
  this.newProtocolAdapter = new NewProtocolAdapter(config, this.logger);
  await this.newProtocolAdapter.start();
}
```

5. **Add Socket Path**

```bash
# In sensor-publish config
/tmp/sensors/new-protocol.sock
```

6. **Build and Test**

```bash
cd agent
npm run build:protocol-adapters
```

### Example Protocols to Implement

- **CAN Bus** (`protocol-adapters/can/`)
  - SocketCAN interface
  - DBC file parsing
  - Signal decoding

- **OPC-UA** (`protocol-adapters/opcua/`)
  - OPC-UA client
  - Node browsing
  - Subscription management

- **DNP3** (`protocol-adapters/dnp3/`)
  - DNP3 outstation communication
  - Point mapping

- **BACnet** (`protocol-adapters/bacnet/`)
  - BACnet/IP
  - Object discovery
  - COV subscriptions

---

## 🪟 Windows Setup

### Prerequisites

1. **Node.js** (18.x or higher)
2. **Visual Studio Build Tools** (for native modules)

```powershell
# Install build tools
npm install --global windows-build-tools

# Or install Visual Studio Build Tools 2022
# https://visualstudio.microsoft.com/downloads/
```

3. **Serial Port Drivers** (for Modbus RTU)
   - USB-to-RS485 converter drivers
   - Verify COM port in Device Manager

### Named Pipes on Windows

Windows uses Named Pipes instead of Unix sockets:

```json
{
  "output": {
    "socketPath": "\\\\.\\pipe\\modbus",  // Windows Named Pipe
    "dataFormat": "json"
  }
}
```

### Testing on Windows

```powershell
# Build
cd agent
npm run build

# Run Modbus adapter
cd protocol-adapters
node dist/modbus/index.js --config modbus/config/windows.json
```

### Windows-Specific Configuration

```json
// modbus/config/windows.json
{
  "devices": [
    {
      "name": "test-device",
      "slaveId": 1,
      "connection": {
        "type": "rtu",
        "serialPort": "COM3",      // Windows COM port
        "baudRate": 9600
      },
      "registers": [
        {
          "name": "test-register",
          "address": 40001,
          "functionCode": 3,
          "dataType": "uint16"
        }
      ],
      "pollInterval": 5000
    }
  ],
  "output": {
    "socketPath": "\\\\.\\pipe\\modbus",  // Named Pipe
    "dataFormat": "json"
  }
}
```

### Serial Port Issues

1. **Find COM Port**:
```powershell
Get-WmiObject Win32_SerialPort | Select-Object Name,DeviceID
```

2. **Test Serial Connection**:
```powershell
# Install serial port testing tool
npm install -g serialport-terminal

# Test connection
serialport-terminal -p COM3 -b 9600
```

---

## 🐛 Troubleshooting

### Common Issues

#### 1. Socket Connection Failed

**Error**: `ENOENT: no such file or directory, connect '/tmp/sensors/modbus.sock'`

**Solution**:
- Ensure modbus adapter is running
- Check socket path matches in both adapter config and sensor-publish config
- Verify `/tmp/sensors/` directory exists and has correct permissions

#### 2. Modbus Connection Timeout

**Error**: `Error: Port Not Open`

**Solution**:
- Verify device IP/hostname and port
- Check network connectivity: `ping 192.168.1.100`
- Verify Modbus slave ID is correct
- Check firewall rules

#### 3. Serial Port Access Denied

**Error**: `Error: Error: Permission denied, cannot open /dev/ttyUSB0`

**Solution**:
```bash
# Add user to dialout group (Linux)
sudo usermod -a -G dialout $USER

# Or change permissions
sudo chmod 666 /dev/ttyUSB0
```

#### 4. Invalid Data Types

**Error**: `ValidationError: Invalid data type 'float16'`

**Solution**:
- Use only supported data types: int16, uint16, int32, uint32, float32, boolean, string
- Check `count` parameter matches data type (e.g., float32 needs count=2)

#### 5. Build Errors

**Error**: `Cannot find module 'modbus-serial'`

**Solution**:
```bash
# Install dependencies from agent folder
cd agent
npm install

# Clean and rebuild
npm run clean
npm run build
```

### Debug Mode

Enable debug logging to troubleshoot issues:

```bash
# Environment variable
export LOG_LEVEL=debug

# Or in config
{
  "logging": {
    "level": "debug",
    "enableConsole": true
  }
}

# Or via CLI
node dist/modbus/index.js --config config.json --log-level debug
```

### Testing Connectivity

```bash
# Test Modbus TCP connection
npm install -g modbus-cli
modbus-cli read 192.168.1.100:502 -a 40001 -c 1

# Test serial port
npm install -g serialport-terminal
serialport-terminal -p /dev/ttyUSB0 -b 9600
```

---

## 📊 Monitoring & Events

### Device Status

```typescript
const adapter = new ModbusAdapter(config, logger);
const statuses = adapter.getDeviceStatuses();

statuses.forEach(status => {
  console.log(`${status.deviceName}: ${status.connected ? 'Connected' : 'Disconnected'}`);
  console.log(`Last poll: ${status.lastPoll}`);
  console.log(`Error count: ${status.errorCount}`);
});
```

### Event Listeners

```typescript
adapter.on('started', () => {
  console.log('Modbus adapter started');
});

adapter.on('device-connected', (deviceName: string) => {
  console.log(`Device connected: ${deviceName}`);
});

adapter.on('device-disconnected', (deviceName: string) => {
  console.log(`Device disconnected: ${deviceName}`);
});

adapter.on('device-error', (deviceName: string, error: Error) => {
  console.log(`Device error [${deviceName}]: ${error.message}`);
});

adapter.on('data-received', (deviceName: string, dataPoints: SensorDataPoint[]) => {
  console.log(`Received ${dataPoints.length} data points from ${deviceName}`);
});
```

---

## 📝 Example Configurations

### Industrial Temperature Monitor

```json
{
  "devices": [
    {
      "name": "furnace-temp",
      "slaveId": 1,
      "connection": {
        "type": "tcp",
        "host": "192.168.1.10",
        "port": 502
      },
      "registers": [
        {
          "name": "temperature",
          "address": 40001,
          "functionCode": 3,
          "dataType": "int16",
          "scale": 0.1,
          "unit": "°C"
        }
      ],
      "pollInterval": 1000
    }
  ],
  "output": {
    "socketPath": "/tmp/sensors/modbus.sock",
    "dataFormat": "json"
  }
}
```

### Environmental Monitoring Station

```json
{
  "devices": [
    {
      "name": "weather-station",
      "slaveId": 2,
      "connection": {
        "type": "rtu",
        "serialPort": "/dev/ttyUSB0",
        "baudRate": 9600
      },
      "registers": [
        {
          "name": "temperature",
          "address": 30001,
          "functionCode": 4,
          "dataType": "float32",
          "count": 2,
          "unit": "°C"
        },
        {
          "name": "humidity",
          "address": 30003,
          "functionCode": 4,
          "dataType": "float32",
          "count": 2,
          "unit": "%"
        },
        {
          "name": "pressure",
          "address": 30005,
          "functionCode": 4,
          "dataType": "uint32",
          "count": 2,
          "scale": 0.001,
          "unit": "bar"
        }
      ],
      "pollInterval": 5000
    }
  ]
}
```

---

## 🔐 Security Considerations

### Network Security
- Use VLANs to isolate industrial networks
- Implement firewall rules for Modbus TCP (port 502)
- Consider VPN for remote access

### Access Control
- Limit Unix socket permissions: `chmod 600 /tmp/sensors/modbus.sock`
- Run adapter with minimal privileges
- Use read-only configurations where possible

### Data Validation
- All inputs validated with Zod schemas
- Type-safe TypeScript implementation
- Error boundaries prevent crashes

---

## 📚 Additional Resources

### Documentation
- [Main Documentation](../../docs/MODBUS-SENSOR-INTEGRATION.md)
- [Agent Feature Configuration](../src/README.md)
- [Sensor Publish System](../src/sensor-publish/README.md)

### Modbus Resources
- [Modbus Protocol Specification](https://modbus.org/docs/Modbus_Application_Protocol_V1_1b3.pdf)
- [Modbus Serial Library](https://github.com/yaacov/node-modbus-serial)

### Future Protocols
- CAN Bus: [SocketCAN](https://www.kernel.org/doc/html/latest/networking/can.html)
- OPC-UA: [node-opcua](https://github.com/node-opcua/node-opcua)
- DNP3: [OpenDNP3](https://github.com/automatak/dnp3)

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-protocol`)
3. Make your changes
4. Add tests
5. Submit a pull request

### Code Style
- Follow existing TypeScript patterns
- Use Zod for schema validation
- Add comprehensive error handling
- Document public APIs

---

## 📄 License

MIT License - see LICENSE file for details.

---

## 🆘 Support

For issues and questions:
- **GitHub Issues**: [Create an issue](https://github.com/dsamborschi/zemfyre-sensor/issues)
- **Documentation**: See `docs/` directory
- **Examples**: See protocol-specific `config/` directories

---

**Last Updated**: October 2025
**Version**: 1.0.0
**Maintainer**: Iotistic Team