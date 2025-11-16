# Iotistic MCP Server

Model Context Protocol server for the Iotistic IoT Platform API.

Exposes IoT device management, metrics, logs, container control, and MQTT operations to LLMs.

## Features

### 🔧 Available Tools

1. **Device Management**
   - `list_devices` - List all devices
   - `get_device` - Get device details
   - `get_device_state` - Get current device state (containers, target state)

2. **Monitoring**
   - `get_device_metrics` - CPU, memory, storage metrics
   - `get_device_logs` - Container logs with filtering
   - `get_device_events` - System events and alerts

3. **Container Control**
   - `list_containers` - List all containers on a device
   - `start_container` - Start a container
   - `stop_container` - Stop a container
   - `restart_container` - Restart a container

4. **MQTT Integration**
   - `get_mqtt_topics` - List available MQTT topics
   - `publish_mqtt` - Publish messages to MQTT topics

## Setup

### 1. Install Dependencies

```bash
cd mcp-server-example
npm install
```

### 2. Build

```bash
npm run build
```

### 3. Configure Claude Desktop

Add to `claude_desktop_config.json`:

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "iotistic": {
      "command": "node",
      "args": [
        "C:\\Users\\Dan\\zemfyre-sensor\\mcp-server-example\\build\\index.js"
      ],
      "env": {
        "IOTISTIC_API_URL": "http://localhost:4002",
        "IOTISTIC_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### 4. Restart Claude Desktop

The MCP server will appear in Claude's tools menu.

## Usage Examples

### In Claude Desktop

**Query devices:**
```
Show me all my IoT devices
```

**Get device metrics:**
```
What are the CPU and memory metrics for device abc123 over the last 24 hours?
```

**View logs:**
```
Show me the logs from the mosquitto container on device abc123
```

**Control containers:**
```
Restart the nodered container on device abc123
```

**Publish MQTT message:**
```
Publish {"temperature": 25.5} to sensor/temperature on device abc123
```

## Development

### Run in watch mode:
```bash
npm run dev
```

### Test with MCP Inspector:
```bash
npx @modelcontextprotocol/inspector node build/index.js
```

## Architecture

```
┌─────────────────┐
│  Claude Desktop │
│      (LLM)      │
└────────┬────────┘
         │ MCP Protocol (stdio)
         │
┌────────▼────────┐
│  MCP Server     │
│  (This Package) │
└────────┬────────┘
         │ HTTP REST
         │
┌────────▼────────┐
│  Iotistic API   │
│  (Port 4002)    │
└─────────────────┘
```

## Environment Variables

- `IOTISTIC_API_URL` - API base URL (default: http://localhost:4002)
- `IOTISTIC_API_KEY` - API authentication key (optional)

## License

MIT
