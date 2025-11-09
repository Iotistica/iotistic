# Iotistic BME688 Sensor Setup Guide

> **Complete setup and configuration guide for the Iotistic BME688 environmental sensor with SPE connectivity**

This comprehensive guide covers everything from initial hardware connection to full sensor configuration and operation.

---

## 📋 Table of Contents

- [Hardware Setup](#-hardware-setup)
- [Initial Connection](#-initial-connection)
- [CLI Configuration](#-cli-configuration)
- [Network Configuration](#-network-configuration)
- [MQTT Broker Setup](#-mqtt-broker-setup)
- [Sensor Validation](#-sensor-validation)
- [Troubleshooting](#-troubleshooting)

---

## 🔌 Hardware Setup

### Prerequisites
- Iotistic BME688 sensor with SPE connectivity
- Raspberry Pi 3+ or compatible device
- Ethernet cable (Cat5e or better)
- Power supply for sensor
- USB-to-Serial adapter (if direct serial access needed)

### Physical Connections
1. **Power**: Connect the sensor to appropriate power supply
2. **Ethernet**: Connect sensor to network via SPE (Single Pair Ethernet)
3. **Serial** (optional): Connect USB-to-Serial adapter for direct CLI access

---

## 🖥️ Initial Connection

### Method 1: Serial Connection via PuTTY

**Step 1: Configure PuTTY**

| Setting         | Value        | Description |
|-----------------|--------------|-------------|
| Connection type | Serial       | Direct serial communication |
| Serial line     | COM4         | May vary by system (check Device Manager) |
| Speed (baud)    | 115200       | Standard baud rate |

**Step 2: Establish Connection**

1. Launch PuTTY
2. Configure settings as shown above
3. (Optional) Save session as "Iotistic-sensor" for future use
4. Click **Open** to start the session
5. Press `Enter` if no prompt appears initially

> **Note**: You may need drivers for USB-to-Serial adapters (CH340, CP210x, FTDI, etc.)

### Method 2: Network Connection

Once the sensor has been initially configured with network settings, you can connect via SSH or Telnet using the assigned IP address.

---

## 🛠️ CLI Configuration

### Getting Started

> **Important**: These steps are for development/initial setup only. Production deployment will have streamlined configuration.

**Virgin Board State:**
- EEPROM not programmed (default IP bindings)
- Status LED toggles **YELLOW** (MQTT broker not available)
- Sensors **NOT INITIALIZED** until MQTT binding is configured

### Basic CLI Commands

**Help and Information:**
```bash
help                    # Display main help menu
<command> -h           # Command-specific help (e.g., eth -h)
```

**System Status:**
```bash
core -status           # Display system status
core -reset            # System reset (applies configuration changes)
```

---

## 🌐 Network Configuration

### Configure Ethernet Settings

**View Current Configuration:**
```bash
eth -ifconfig          # Display current network bindings
```

**Set Network Parameters:**
```bash
# Configure device IP address
eth -ifconfig ip 192.168.2.40

# Configure gateway
eth -ifconfig gw 192.168.2.1

# Display updated configuration
eth -ifconfig
```

> **Important**: Network changes require a system reset to take effect

**Apply Network Changes:**
```bash
core -reset
```

**Post-Reset Verification:**
- New network bindings are active
- Three of four sensors configured and ready
- Status LED changes to **GREEN** (if MQTT configured)

---

## 📡 MQTT Broker Setup

### Configure MQTT Connection

**View Current MQTT Configuration:**
```bash
eth -mqtt              # Display current MQTT broker binding
```

**Set MQTT Broker Parameters:**
```bash
# Configure broker IP address
eth -mqtt ip 192.168.2.30

# Configure broker port
eth -mqtt port 1883

# Verify configuration
eth -mqtt
```

### MQTT Connection States

| LED Status | Description |
|------------|-------------|
| **YELLOW** (toggle) | MQTT broker binding not available |
| **GREEN** (toggle) | MQTT broker configured, connection pending |
| **GREEN** (solid) | MQTT broker connected, subscription active |

---

## 🔍 Sensor Validation

### BME688 Environmental Sensor

The BME688 provides four environmental measurements:
- **Temperature** (°C)
- **Humidity** (%RH)  
- **Pressure** (hPa)
- **Gas Resistance** (Ω) - Air quality indicator

### Verification Steps

1. **Check Sensor Status:**
   ```bash
   sensor -status         # Display sensor initialization status
   ```

2. **View Active Tasks:**
   ```bash
   tasks                  # List all active system tasks
   ```

3. **Test Data Transmission:**
   - Verify MQTT messages are being published
   - Check data appears in InfluxDB
   - Monitor Grafana dashboard for real-time data

---

## 🔧 Troubleshooting

### Common Issues

**1. Status LED Stuck on Yellow**
- Check MQTT broker IP and port configuration
- Verify network connectivity to broker
- Ensure broker is running and accessible

**2. No Serial Connection**
- Verify correct COM port in Device Manager
- Check USB-to-Serial driver installation
- Try different baud rates (9600, 57600, 115200)
- Ensure proper cable connections

**3. Network Configuration Not Applied**
- System reset required after network changes: `core -reset`
- Check physical Ethernet connection
- Verify network settings match your infrastructure

**4. Sensors Not Initializing**
- MQTT broker must be configured first
- Check power supply to sensor
- Verify SPE (Single Pair Ethernet) connection

### Diagnostic Commands

```bash
# System diagnostics
core -status           # Overall system status
core -version          # Firmware version info

# Network diagnostics  
eth -ifconfig          # Current network configuration
eth -mqtt              # MQTT broker settings

# Sensor diagnostics
sensor -list           # Available sensors
sensor -status         # Sensor initialization status
```

---

## 📝 Configuration Checklist

- [ ] Physical connections established (power, Ethernet)
- [ ] Serial connection working (if using PuTTY method)
- [ ] Network settings configured and applied
- [ ] MQTT broker settings configured
- [ ] System reset performed after configuration changes
- [ ] Status LED shows solid GREEN
- [ ] All four BME688 sensors reporting data
- [ ] MQTT messages publishing successfully
- [ ] Data visible in monitoring dashboard

---

## 🔗 Related Documentation

- [Main README](README.md) - Complete project documentation
- [Docker Setup](docker-compose.yaml) - Container orchestration
- [Ansible Deployment](ansible/README.md) - Automated deployment

---

## 🏢 About

**Sensor Technology**: BOSCH BME688 4-in-1 environmental sensor with SPE connectivity  
**SPE Technology**: Provided by [Iotistic Inc](https://iotistic.ca) - Leader in SPE technology  
**Software Development**: IoT software experts team by [iotistic.ca](http://www.iotistic.ca)

---

*For technical support and additional resources, visit [iotistic.ca](https://iotistic.ca)*