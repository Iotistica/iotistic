# Agent Firewall Protection

## Overview

The Agent Firewall provides network-level security for the IoT agent by managing iptables rules. It protects sensitive services like the Device API and local MQTT broker from unauthorized access.

## Features

✅ **Device API Protection** - Restricts access to safe interfaces only (loopback, Docker networks)  
✅ **MQTT Protection** - Allows connections only from private networks  
✅ **Multiple Modes** - `on`, `off`, `auto` for different security levels  
✅ **IPv4/IPv6 Support** - Automatic dual-stack firewall rules  
✅ **Dynamic Updates** - Change firewall mode via target state configuration  
✅ **Graceful Shutdown** - Cleans up all rules on agent stop  

## Configuration

### Environment Variables

```bash
# Firewall mode: on, off, auto, disabled
FIREWALL_MODE=auto

# Disable firewall completely
FIREWALL_ENABLED=false

# Local MQTT port (if running Mosquitto locally)
MQTT_LOCAL_PORT=1883
```

### Modes

#### `on` - Strict Mode (Production)
- ✅ Allow Device API only from Docker/loopback interfaces
- ✅ Allow MQTT only from private networks (10.x, 172.16.x, 192.168.x)
- ❌ Block all other incoming traffic

**Use When**: Running in untrusted networks, production deployments

#### `off` - Disabled Mode (Development)
- ✅ Allow all traffic
- No firewall restrictions

**Use When**: Local development, testing with external tools

#### `auto` - Automatic Mode (Recommended)
- Currently behaves like `on` mode
- Future: Enable only when host-network services are detected

**Use When**: General use, adapts to deployment context

## How It Works

### iptables Chain Structure

```
INPUT chain
    ↓
IOTISTIC-FIREWALL chain
    ├── Allow local traffic (loopback)
    ├── Allow established connections
    ├── Allow ICMP (ping)
    ├── Allow mDNS (multicast)
    ├── Device API rules
    │   ├── ACCEPT from lo, docker0, br-+, veth+
    │   └── REJECT from all other interfaces
    ├── MQTT rules (if configured)
    │   ├── ACCEPT from 10.0.0.0/8
    │   ├── ACCEPT from 172.16.0.0/12
    │   ├── ACCEPT from 192.168.0.0/16
    │   └── REJECT from all other networks
    └── RETURN (off/auto) or REJECT (on)
```

### Protected Services

#### Device API (Port 48484)
**Allowed From**:
- `lo` - Loopback (localhost)
- `docker0` - Default Docker bridge
- `br-+` - Custom Docker bridges
- `veth+` - Docker container interfaces

**Blocked From**:
- External network interfaces (eth0, wlan0, etc.)
- Internet

#### MQTT Broker (Optional, Port 1883)
**Allowed From**:
- `10.0.0.0/8` - Private network (Class A)
- `172.16.0.0/12` - Private network (Class B)
- `192.168.0.0/16` - Private network (Class C)
- `127.0.0.0/8` - Loopback

**Blocked From**:
- Public IP addresses
- Internet

## Usage

### Docker Compose

```yaml
# docker-compose.yml
agent:
  image: iotistic/agent:latest
  cap_add:
    - NET_ADMIN  # Required for iptables
  environment:
    - FIREWALL_MODE=auto
    - DEVICE_API_PORT=48484
    - MQTT_LOCAL_PORT=1883  # If running local Mosquitto
```

### Target State Configuration

```json
{
  "config": {
    "settings": {
      "firewallMode": "on"
    }
  }
}
```

### Programmatic Access

```typescript
// Get firewall status
const status = agent.getFirewall()?.getStatus();
console.log(status);
// {
//   enabled: true,
//   initialized: true,
//   mode: 'auto',
//   deviceApiPort: 48484,
//   mqttPort: 1883
// }

// Update mode dynamically
await agent.getFirewall()?.updateMode('on');
```

## Security Benefits

### Before Firewall
```
Internet
   ↓
[eth0] → Device API (48484) ❌ EXPOSED
   ↓
[eth0] → MQTT (1883) ❌ EXPOSED
```

### After Firewall (auto/on mode)
```
Internet
   ↓
[eth0] → Device API (48484) ✅ BLOCKED
   ↓
[eth0] → MQTT (1883) ✅ BLOCKED

Docker
   ↓
[docker0] → Device API (48484) ✅ ALLOWED
   ↓
[docker0] → MQTT (1883) ✅ ALLOWED (if private IP)
```

## Troubleshooting

### Firewall Not Working

**Check Requirements**:
```bash
# Agent must have NET_ADMIN capability
docker inspect agent | grep -A5 CapAdd

# iptables must be available
docker exec agent which iptables

# Check if rules are applied
docker exec agent iptables -L IOTISTIC-FIREWALL -n -v
```

### Can't Access Device API

**From Host Machine**:
```bash
# This should work (loopback)
curl http://localhost:48484/v2/device

# This might fail (external interface)
curl http://192.168.1.100:48484/v2/device
```

**Solution**: Use SSH tunnel or add interface to allowed list

### Firewall Blocks Legitimate Traffic

**Temporary Fix**:
```bash
# Disable firewall
docker exec agent sh -c 'echo "FIREWALL_MODE=off" >> /app/.env'
docker restart agent
```

**Permanent Fix**:
Update target state to disable or adjust rules

### Check Current Rules

```bash
# View IPv4 rules
docker exec agent iptables -L IOTISTIC-FIREWALL -n -v --line-numbers

# View IPv6 rules
docker exec agent ip6tables -L IOTISTIC-FIREWALL -n -v --line-numbers

# Check INPUT chain
docker exec agent iptables -L INPUT -n -v
```

## Requirements

### System Requirements
- Linux with iptables support
- `CAP_NET_ADMIN` capability
- Root or privileged container

### Agent Requirements
- Agent version 1.0.50+
- `AgentLogger` initialized
- Running on Linux (not Windows/macOS)

## Limitations

⚠️ **Linux Only**: iptables doesn't exist on Windows/macOS  
⚠️ **Requires Privileges**: Agent must run with `CAP_NET_ADMIN` or as root  
⚠️ **Docker Networking**: Works best with default Docker bridge networking  
⚠️ **Testing**: Difficult to test on non-Linux systems  

## Testing

### Local Testing (Linux VM Required)

```bash
# 1. Start agent with firewall enabled
docker-compose up -d agent

# 2. Verify firewall is active
docker exec agent iptables -L IOTISTIC-FIREWALL -n -v

# 3. Test Device API access
curl http://localhost:48484/v2/device  # Should work
curl http://$(hostname -I | cut -d' ' -f1):48484/v2/device  # Should fail

# 4. Check logs
docker logs agent | grep Firewall
```

### Production Deployment

```bash
# Enable strict firewall
FIREWALL_MODE=on docker-compose up -d

# Verify protection
nmap -p 48484 <device-ip>  # Should show filtered/closed
```

## Migration Guide

### From No Firewall → Firewall Enabled

1. **Test in development first**:
   ```bash
   FIREWALL_MODE=auto docker-compose up -d
   ```

2. **Verify services still work**:
   - Test Device API access
   - Test container deployments
   - Test MQTT connections (if applicable)

3. **Enable in production**:
   ```yaml
   # Target state
   config:
     settings:
       firewallMode: "on"
   ```

4. **Monitor logs**:
   ```bash
   docker logs -f agent | grep -E "Firewall|REJECT"
   ```

### Rolling Back

```bash
# Via environment
FIREWALL_MODE=off docker-compose up -d

# Via target state
{
  "config": {
    "settings": {
      "firewallMode": "off"
    }
  }
}
```

## Future Enhancements

- [ ] Auto-detect host-network services
- [ ] Custom allowed interfaces/networks
- [ ] Port knocking support
- [ ] Rate limiting integration
- [ ] VPN whitelist integration
- [ ] Geolocation-based blocking

## Credits

Based on firewall implementation from [Balena Supervisor](https://github.com/balena-os/balena-supervisor), adapted for Iotistic IoT platform.
