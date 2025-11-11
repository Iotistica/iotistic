# VPN Provisioning Flow

## Overview

The Iotistic platform uses WireGuard VPN for secure device-to-cloud and device-to-device communication. VPN setup is **automatic** during device provisioning, similar to how Balena handles device connectivity.

## Architecture Philosophy

**Key Principle**: VPN is established **AFTER** initial provisioning, not before.

This follows the Balena approach:
1. Initial provisioning happens over **public internet** (HTTPS)
2. VPN tunnel is created **as a result** of successful provisioning
3. Future communication **can** use VPN (optional optimization)

## Complete Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. User Installs Agent (install.sh)                            │
├─────────────────────────────────────────────────────────────────┤
│ • Installs system dependencies (including WireGuard)            │
│ • Downloads and starts agent container/service                  │
│ • Agent starts with PROVISIONING_API_KEY env var               │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2. Agent Provisions Itself (over public internet)              │
├─────────────────────────────────────────────────────────────────┤
│ POST https://api.iotistic.ca/api/v1/device/register            │
│   Headers: X-Provisioning-Key: <fleet-key>                     │
│                                                                  │
│ Response includes:                                              │
│   - Device credentials (MQTT, API key)                          │
│   - VPN configuration (if enabled)                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3. Agent Sets Up VPN Tunnel (WireGuardManager)                 │
├─────────────────────────────────────────────────────────────────┤
│ • Writes /etc/wireguard/wg0.conf                               │
│ • Executes: wg-quick up wg0                                     │
│ • Enables auto-start: systemctl enable wg-quick@wg0            │
│ • Tests connectivity: ping 10.8.0.1                             │
│ • VPN IP: 10.8.0.x (assigned by server)                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ 4. Agent Operates Normally                                      │
├─────────────────────────────────────────────────────────────────┤
│ • Cloud API communication: public internet OR VPN               │
│ • MQTT: Can use VPN network if configured                       │
│ • Device-to-device: Uses VPN (10.8.0.0/24 network)            │
└─────────────────────────────────────────────────────────────────┘
```

## Why This Approach?

### The Chicken-and-Egg Problem

**Question**: How can the agent provision itself without VPN?

**Answer**: **Provisioning CREATES the VPN!**

1. ❌ **Wrong**: Agent needs VPN to provision
   - Impossible - agent doesn't have VPN credentials yet
   - Would require pre-configured VPN before installation

2. ✅ **Correct**: Agent provisions over public internet, then sets up VPN
   - Initial contact: HTTPS to cloud API (port 443)
   - API returns VPN config in provisioning response
   - Agent configures local WireGuard interface
   - Future traffic can optionally use VPN

### Balena Comparison

Balena uses the same approach:
- Devices provision over **public internet** (balena-cloud.com:443)
- VPN is optional for device-to-device or device-to-services
- Cloud API communication stays on public internet
- VPN is **not required** for core functionality

## Implementation Details

### Components

#### 1. Install Script (`agent/bin/install.sh`)
**Responsibility**: Install WireGuard packages

```bash
# Systemd installation
apt-get install -y wireguard wireguard-tools
```

**Does NOT**:
- Call provisioning API
- Configure VPN
- Start tunnels

#### 2. Device Manager (`agent/src/provisioning/device-manager.ts`)
**Responsibility**: Coordinate provisioning flow

```typescript
async provision(config: ProvisioningConfig): Promise<DeviceInfo> {
  // Phase 1: Register with cloud API (over public internet)
  const response = await this.registerWithAPI(...);
  
  // Phase 2: Exchange keys
  await this.exchangeKeys(...);
  
  // Phase 3: Remove provisioning key
  this.deviceInfo.provisioningApiKey = undefined;
  
  // Phase 4: Setup VPN if provided
  if (response.vpnConfig?.enabled) {
    const vpnManager = new WireGuardManager(...);
    await vpnManager.setup(response.vpnConfig);
  }
}
```

#### 3. WireGuard Manager (`agent/src/vpn/wireguard-manager.ts`)
**Responsibility**: Manage VPN tunnel lifecycle

```typescript
async setup(vpnConfig: VpnConfig): Promise<boolean> {
  // 1. Check if WireGuard available
  if (!await this.isAvailable()) return false;
  
  // 2. Write config file
  await fs.writeFile('/etc/wireguard/wg0.conf', vpnConfig.wgConfig);
  
  // 3. Start tunnel
  await execAsync('wg-quick up wg0');
  
  // 4. Enable auto-start
  await execAsync('systemctl enable wg-quick@wg0');
  
  // 5. Test connectivity
  await this.testConnectivity();
}
```

#### 4. Provisioning API (`api/src/routes/provisioning.ts`)
**Responsibility**: Generate VPN config during registration

```typescript
// Create WireGuard peer
const vpnCredentials = await createWireGuardPeer({
  deviceId: device.uuid,
  deviceName: device.device_name,
});

// Return in provisioning response
return {
  device: { ... },
  mqtt: { ... },
  vpnConfig: {
    enabled: true,
    ipAddress: vpnCredentials.ipAddress,
    wgConfig: vpnCredentials.config  // Complete WireGuard config
  }
};
```

## Network Architecture

### VPN Network: 10.8.0.0/24

```
┌─────────────────────────────────────────────────────────────┐
│ VPN Server (Cloud)                                          │
│ IP: 10.8.0.1                                                 │
│ Port: 51820/udp (public endpoint)                            │
└─────────────────────────────────────────────────────────────┘
                          ↓ Encrypted Tunnel
┌─────────────────────────────────────────────────────────────┐
│ Edge Devices                                                 │
├─────────────────────────────────────────────────────────────┤
│ Device 1: 10.8.0.101                                         │
│ Device 2: 10.8.0.102                                         │
│ Device 3: 10.8.0.103                                         │
│ ...                                                          │
└─────────────────────────────────────────────────────────────┘
```

### Communication Paths

**1. Agent → Cloud API**
- **Method**: HTTPS (public internet)
- **Port**: 443
- **Why**: Reliable, works everywhere, no VPN dependency

**2. Device → Device**
- **Method**: Any protocol over VPN
- **Network**: 10.8.0.0/24
- **Why**: Secure, private, no internet routing

**3. Device → Cloud Services (MQTT, etc.)**
- **Method**: Can use VPN or public internet
- **Configuration**: Flexible based on deployment

## Configuration Files

### WireGuard Config (Generated by API)

```ini
[Interface]
PrivateKey = <device-private-key>
Address = 10.8.0.105/24
DNS = 1.1.1.1

[Peer]
PublicKey = <server-public-key>
Endpoint = vpn.iotistic.cloud:51820
AllowedIPs = 10.8.0.0/24
PersistentKeepalive = 25
```

**Location**: `/etc/wireguard/wg0.conf`
**Permissions**: `600` (root only)
**Auto-start**: `systemctl enable wg-quick@wg0`

## Error Handling

### VPN Setup Failures are Non-Critical

The agent continues to operate even if VPN setup fails:

```typescript
try {
  const vpnSetupSuccess = await vpnManager.setup(response.vpnConfig);
} catch (vpnError) {
  // Log warning but continue
  this.logger.warn('VPN setup failed - device will continue without VPN');
}
```

**Reasons VPN might fail**:
- WireGuard not installed (install.sh skipped)
- Insufficient permissions (not running as root)
- Network firewall blocking UDP port 51820
- Server endpoint unreachable

**Fallback behavior**:
- Agent continues with normal operation
- Cloud API communication works (over public internet)
- Device-to-device communication not available
- User can manually configure VPN later

## Manual VPN Setup

If VPN setup fails during provisioning, users can manually configure it:

```bash
# 1. Get VPN config from provisioning response (saved in logs)
# OR re-provision device

# 2. Save config
sudo nano /etc/wireguard/wg0.conf
# (paste config, update Endpoint if needed)

# 3. Set permissions
sudo chmod 600 /etc/wireguard/wg0.conf

# 4. Start tunnel
sudo wg-quick up wg0

# 5. Enable auto-start
sudo systemctl enable wg-quick@wg0

# 6. Check status
sudo wg show wg0
ping 10.8.0.1
```

## Security Considerations

### Private Key Protection
- Generated locally on device (never transmitted)
- Stored in `/etc/wireguard/wg0.conf` with `600` permissions
- Only accessible by root user

### Provisioning Key vs Device Key
- **Provisioning Key**: Fleet-level, one-time use, rotatable
- **Device Key**: Device-specific, permanent, never shared
- VPN private key: Separate, only for VPN tunnel

### Network Isolation
- VPN network (10.8.0.0/24) isolated from public internet
- Only authenticated devices can join
- Each device has unique cryptographic identity

## Monitoring

### VPN Status Check

```typescript
const vpnManager = new WireGuardManager();
const status = await vpnManager.getStatus();

console.log(status);
// {
//   interfaceUp: true,
//   ipAddress: "10.8.0.105",
//   lastHandshake: "2025-01-15T10:30:00Z",
//   transferRx: 1234567,
//   transferTx: 7654321
// }
```

### Server-Side Tracking

The `wg_peers` table tracks:
- Device VPN IP assignments
- Last handshake timestamp (updated when device connects)
- Client endpoint (public IP/port learned dynamically)

```sql
SELECT device_name, ip_address, endpoint, last_handshake 
FROM wg_peers 
WHERE device_id = 'device-uuid';
```

## Testing

### Test Scripts

**1. `agent/bin/test-wireguard-client.sh`**
- Tests VPN connectivity from edge device
- Checks interface status, handshake, ping

**2. `agent/bin/test-install-with-vpn.sh`**
- Simulates provisioning flow
- Tests VPN config retrieval
- Validates config structure

### Local Testing

```bash
# On Raspberry Pi or Linux VM
curl -sfL https://install.iotistic.ca/agent | \
  IOTISTIC_CLOUD_API_ENDPOINT=https://api.iotistic.ca \
  IOTISTIC_PROVISIONING_KEY=your-key \
  sudo sh
```

Expected output:
```
✓ Device provisioned successfully
✓ VPN configuration received
  VPN IP: 10.8.0.106
✓ WireGuard config written to /etc/wireguard/wg0.conf
✓ WireGuard tunnel established
✓ VPN connectivity test passed
```

## Troubleshooting

### Issue: VPN tunnel not established

**Check 1**: WireGuard installed
```bash
which wg
# Should output: /usr/bin/wg
```

**Check 2**: Config file exists
```bash
ls -la /etc/wireguard/wg0.conf
# Should be: -rw------- 1 root root
```

**Check 3**: Interface status
```bash
sudo wg show wg0
# Should show peer info and handshake
```

**Check 4**: Server endpoint reachable
```bash
nc -u -v vpn.iotistic.cloud 51820
```

### Issue: Handshake but no connectivity

**Check 1**: Routing
```bash
ip route | grep wg0
# Should show: 10.8.0.0/24 dev wg0
```

**Check 2**: Firewall
```bash
sudo iptables -L -n -v | grep wg0
```

**Check 3**: Ping gateway
```bash
ping 10.8.0.1
```

## Future Enhancements

### Potential Improvements

1. **Endpoint Auto-Discovery**
   - Currently uses placeholder `vpn.example.com`
   - Could auto-detect server's public IP
   - Or integrate DDNS service

2. **VPN Health Monitoring**
   - Periodic handshake checks
   - Auto-restart if tunnel fails
   - Report VPN status to cloud API

3. **Multi-Server Redundancy**
   - Multiple VPN servers for failover
   - Automatic server selection
   - Load balancing

4. **Advanced Routing**
   - Split tunneling (route only specific traffic)
   - Policy-based routing
   - Multi-interface support

## References

- **WireGuard Manager**: `agent/src/vpn/wireguard-manager.ts`
- **Device Manager Integration**: `agent/src/provisioning/device-manager.ts`
- **Provisioning Types**: `agent/src/provisioning/types.ts`
- **Install Script**: `agent/bin/install.sh`
- **Client Setup Guide**: `docs/WIREGUARD-CLIENT-SETUP.md`
- **Balena Network Docs**: https://www.balena.io/docs/reference/OS/network/
