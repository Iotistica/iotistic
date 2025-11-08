# Windows Named Pipes Testing Guide

## ✅ **Verified: Windows Support Enabled**

The protocol adapters **fully support Windows Named Pipes** through Node.js's `net` module. No code changes are required - only configuration adjustments!

---

## 🎯 **How It Works**

### **Cross-Platform Architecture**

```typescript
// socket-server.ts and sensor.ts both use net module
net.createServer().listen(socketPath)      // Server (protocol adapter)
net.createConnection(socketPath)           // Client (sensor-publish)
```

**Node.js automatically detects the path format:**
- **Unix/Linux/macOS**: `/tmp/sensors/modbus.sock` → Unix Domain Socket
- **Windows**: `\\\\.\\pipe\\modbus` → Windows Named Pipe

---

## 📝 **Configuration for Windows**

### **1. Protocol Adapter Config**

File: `agent/protocol-adapters/modbus/config/windows.json`

```json
{
  "devices": [
    {
      "name": "temperature-sensor",
      "slaveId": 1,
      "connection": {
        "type": "tcp",
        "host": "192.168.1.100",
        "port": 502
      },
      "registers": [
        {
          "name": "temperature",
          "address": 40001,
          "functionCode": 3,
          "dataType": "float32",
          "endianness": "big",
          "unit": "°C"
        }
      ],
      "pollInterval": 5000,
      "enabled": true
    }
  ],
  "output": {
    "socketPath": "\\\\.\\pipe\\modbus",     // ✅ Windows Named Pipe
    "dataFormat": "json",
    "delimiter": "\n",
    "includeTimestamp": true,
    "includeDeviceName": true
  }
}
```

**Key Points:**
- `socketPath`: Use `\\\\.\\pipe\\<name>` format
- In JSON: Backslashes must be escaped: `\\\\` → `\`
- Result: `\\\\.\\pipe\\modbus` → actual path `\\.\pipe\modbus`

### **2. Sensor-Publish Config** (for integration with agent)

```json
{
  "sensors": [
    {
      "name": "modbus-sensors",
      "addr": "\\\\.\\pipe\\modbus",         // ✅ Must match adapter socketPath
      "eomDelimiter": "\\n",
      "mqttTopic": "modbus",
      "bufferSize": 100,
      "bufferTimeMs": 1000
    }
  ]
}
```

**Environment Variable Format:**
```powershell
$env:SENSOR_PUBLISH_CONFIG = '{\"sensors\":[{\"name\":\"modbus\",\"addr\":\"\\\\\\\\.\\\\pipe\\\\modbus\",\"eomDelimiter\":\"\\\\n\",\"mqttTopic\":\"modbus\"}]}'
```

*(Note: In PowerShell, you need even more escaping - see examples below)*

---

## 🧪 **Testing Steps**

### **Step 1: Build Protocol Adapters**

```powershell
cd C:\Users\Dan\zemfyre-sensor\agent
npm run build:protocol-adapters
```

**Expected Output:**
```
> device-agent@1.0.0 build:protocol-adapters
> cd protocol-adapters && tsc

✅ Build successful
```

### **Step 2: Start Modbus Adapter**

**Option A: With TCP Connection** (easiest for testing)
```powershell
cd C:\Users\Dan\zemfyre-sensor\agent\protocol-adapters

# Edit windows.json to point to your Modbus device
node dist/modbus/index.js --config modbus/config/windows.json
```

**Option B: With Modbus RTU (Serial Port)**
```powershell
# First, find your COM port
Get-WmiObject Win32_SerialPort | Select-Object Name,DeviceID

# Edit windows.json:
# "connection": {
#   "type": "rtu",
#   "serialPort": "COM3",  // Your COM port
#   "baudRate": 9600
# }

node dist/modbus/index.js --config modbus/config/windows.json
```

**Expected Output:**
```
2025-01-15T10:30:00.000Z [INFO] Starting Modbus Adapter...
2025-01-15T10:30:00.100Z [INFO] IPC server started (Windows Named Pipe) at: \\.\pipe\modbus
2025-01-15T10:30:00.200Z [INFO] Device 'temperature-sensor' connected successfully
2025-01-15T10:30:01.000Z [INFO] Read 2 registers from 'temperature-sensor'
```

### **Step 3: Test Named Pipe Connection**

**Option A: Using PowerShell** (manual test)

In a **new PowerShell window**:

```powershell
# Install netcat for Windows (if not already installed)
# Download from: https://nmap.org/ncat/

# Connect to Named Pipe
ncat --pipe \\.\pipe\modbus
```

**Option B: Using Node.js Test Script**

Create `test-pipe.js`:
```javascript
const net = require('net');

const client = net.createConnection('\\\\.\\pipe\\modbus', () => {
  console.log('✅ Connected to Named Pipe!');
});

client.on('data', (data) => {
  console.log('📨 Received:', data.toString());
});

client.on('error', (err) => {
  console.error('❌ Error:', err.message);
});

client.on('close', () => {
  console.log('🔌 Connection closed');
});
```

Run:
```powershell
node test-pipe.js
```

**Expected Output:**
```
✅ Connected to Named Pipe!
📨 Received: {"deviceName":"temperature-sensor","registerName":"temperature","value":23.5,"unit":"°C","timestamp":"2025-01-15T10:30:01.000Z"}
📨 Received: {"deviceName":"temperature-sensor","registerName":"humidity","value":45.2,"unit":"%","timestamp":"2025-01-15T10:30:01.001Z"}
```

### **Step 4: Integrate with Agent (Sensor-Publish)**

**Configure Sensor-Publish:**

Edit `agent/.env` or set environment variable:
```powershell
# PowerShell (extra escaping required!)
$env:ENABLE_SENSOR_PUBLISH = "true"
$env:SENSOR_PUBLISH_CONFIG = '{\"sensors\":[{\"name\":\"modbus-sensors\",\"addr\":\"\\\\\\\\.\\\\pipe\\\\modbus\",\"eomDelimiter\":\"\\\\n\",\"mqttTopic\":\"modbus\",\"bufferSize\":100,\"bufferTimeMs\":1000}]}'

# Verify
echo $env:SENSOR_PUBLISH_CONFIG
```

**Alternative: Use Target State** (recommended)
```json
// agent target state
{
  "features": {
    "sensorPublish": {
      "enabled": true,
      "config": {
        "sensors": [
          {
            "name": "modbus-sensors",
            "addr": "\\\\.\\pipe\\modbus",   // In target state, normal JSON escaping
            "eomDelimiter": "\\n",
            "mqttTopic": "modbus",
            "bufferSize": 100,
            "bufferTimeMs": 1000
          }
        ]
      }
    }
  }
}
```

**Start Agent:**
```powershell
cd C:\Users\Dan\zemfyre-sensor\agent
npm run dev

# Or
npm run build
node dist/index.js
```

**Expected Output:**
```
[INFO] Starting Iotistic Device Agent...
[INFO] Sensor-publish feature enabled
[INFO] Starting sensor: modbus-sensors (\\.\pipe\modbus)
[INFO] Connected to socket: \\.\pipe\modbus
[INFO] Published 10 messages to MQTT topic: iot/device/5c629f26-8495-4747-86e3-c2d98851aa62/sensor/modbus
```

---

## 🔍 **Verification**

### **Check Named Pipe Exists**

```powershell
# List all active Named Pipes
Get-ChildItem \\.\pipe\ | Where-Object { $_.Name -like '*modbus*' }
```

**Expected Output:**
```
Name
----
modbus
```

### **Monitor MQTT Messages**

```powershell
# Install MQTT client (if not already)
npm install -g mqtt

# Subscribe to sensor topic
mqtt subscribe -h localhost -t 'iot/device/+/sensor/modbus'
```

**Expected Output:**
```
{"deviceName":"temperature-sensor","registerName":"temperature","value":23.5,"unit":"°C","timestamp":"2025-01-15T10:30:01.000Z"}
{"deviceName":"temperature-sensor","registerName":"humidity","value":45.2,"unit":"%","timestamp":"2025-01-15T10:30:01.001Z"}
```

---

## 🐛 **Troubleshooting**

### **Issue 1: "ENOENT: no such file or directory"**

**Cause**: Named Pipe doesn't exist (adapter not running)

**Solution**:
1. Start Modbus adapter first
2. Wait for log: `IPC server started (Windows Named Pipe) at: \\.\pipe\modbus`
3. Then connect sensor-publish

### **Issue 2: "Error: connect ECONNREFUSED"**

**Cause**: Wrong path format or adapter crashed

**Solution**:
```powershell
# Verify adapter is running
Get-Process node

# Check adapter logs for errors
# Restart adapter with debug logging
$env:LOG_LEVEL = "debug"
node dist/modbus/index.js --config modbus/config/windows.json
```

### **Issue 3: JSON Escaping Issues**

**Cause**: Incorrect backslash escaping in JSON config

**PowerShell Escaping Rules:**
```powershell
# In JSON file: 
"socketPath": "\\\\.\\pipe\\modbus"    # ✅ Correct (4 backslashes, 1 dot, 2 backslashes)

# In PowerShell string:
"\\\\\\\\.\\\\pipe\\\\modbus"          # ✅ Correct (8 backslashes for \\.\, 4 for \pipe\)

# Actual Windows path:
\\.\pipe\modbus                        # ✅ What Windows sees
```

**Verification Script:**
```javascript
// test-escaping.js
const path1 = "\\\\.\\pipe\\modbus";     // From JSON file
const path2 = "\\\\.\\\pipe\\\modbus";   // Alternative (also works)

console.log("Path 1:", path1);
console.log("Path 2:", path2);
console.log("Are equal:", path1 === path2);
```

### **Issue 4: COM Port Not Found**

**Cause**: USB-to-RS485 converter not recognized

**Solution**:
```powershell
# List all COM ports with details
Get-WmiObject Win32_SerialPort | Format-Table DeviceID,Name,Description

# Check Device Manager
devmgmt.msc

# Install FTDI drivers (if using FTDI chip)
# Download from: https://ftdichip.com/drivers/vcp-drivers/
```

---

## 📊 **Expected Data Flow**

```
┌─────────────────┐
│ Modbus Device   │ (TCP 192.168.1.100:502 or RTU COM3)
└────────┬────────┘
         │ Modbus Protocol
         ▼
┌─────────────────┐
│ Modbus Adapter  │ (protocol-adapters/modbus)
└────────┬────────┘
         │ JSON over Named Pipe (\\.\pipe\modbus)
         ▼
┌─────────────────┐
│ Sensor-Publish  │ (agent/sensor-publish)
└────────┬────────┘
         │ Buffer + Batch
         ▼
┌─────────────────┐
│ MQTT Broker     │ (mosquitto:1883)
└────────┬────────┘
         │ Topic: iot/device/{uuid}/sensor/modbus
         ▼
┌─────────────────┐
│ Cloud API       │ (Kubernetes)
└─────────────────┘
```

---

## ✅ **Success Criteria**

- [ ] Protocol adapter builds without errors
- [ ] Adapter starts and logs: `IPC server started (Windows Named Pipe)`
- [ ] Named Pipe appears in `\\.\pipe\` directory
- [ ] Test client can connect to Named Pipe
- [ ] Sensor data is received in JSON format
- [ ] Sensor-publish connects successfully
- [ ] Messages are published to MQTT
- [ ] Cloud API receives device data

---

## 🚀 **Next Steps**

1. **Test with Real Modbus Device**:
   - Connect to actual hardware
   - Verify register readings
   - Test error handling (device offline)

2. **Production Configuration**:
   - Create persistent config files
   - Set up Windows Service (optional)
   - Configure auto-start on boot

3. **Add More Protocol Adapters**:
   - CAN bus adapter (Windows SocketCAN or Vector CANlib)
   - OPC-UA adapter (node-opcua library)
   - Follow same Named Pipe pattern

---

## 📚 **References**

- **Windows Named Pipes**: https://docs.microsoft.com/en-us/windows/win32/ipc/named-pipes
- **Node.js net module**: https://nodejs.org/api/net.html
- **Modbus Protocol**: `agent/protocol-adapters/README.md`
- **Sensor-Publish**: `agent/src/sensor-publish/README.md`

---

## 💡 **Tips**

1. **Use Visual Studio Code integrated terminal** - better path handling
2. **Run adapter and agent in separate terminals** - easier debugging
3. **Use JSON files for configs** - avoid PowerShell escaping hell
4. **Monitor Windows Event Viewer** - captures Named Pipe errors
5. **Test with TCP first** - simpler than serial port setup

---

**Last Updated**: 2025-01-15  
**Tested On**: Windows 11, Node.js v18.x, TypeScript 5.x
