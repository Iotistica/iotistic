# Agent Installation with Automatic VPN Setup

## Overview

The `agent/bin/install.sh` script now includes **automatic WireGuard VPN setup** during device provisioning. When a user installs the agent with a provisioning key, the VPN tunnel is automatically configured and started.

## What Was Added

### 1. WireGuard Package Installation

**Location**: System dependencies section (Systemd installation)

```bash
apt-get install -y \
    wireguard wireguard-tools \
    # ... other packages
```

### 2. VPN Setup Function

**Location**: Added after script header, before main installation logic

```bash
setup_wireguard_vpn() {
    # Calls provisioning API
    # Retrieves VPN config from response
    # Saves config to /etc/wireguard/wg0.conf
    # Starts WireGuard tunnel
    # Enables auto-start on boot
    # Tests connectivity
}
```

### 3. Integration Points

**Docker Installation**:
- Calls `setup_wireguard_vpn()` before starting container
- If VPN succeeds, uses `--network host` mode
- If VPN fails/skipped, uses standard bridge network with port mapping

**Systemd Installation**:
- Calls `setup_wireguard_vpn()` after creating environment file
- VPN runs as separate systemd service (`wg-quick@wg0`)
- Agent service starts after VPN is established

## Usage Scenarios

### Scenario 1: User with Provisioning Key (Automatic VPN)

```bash
# On Raspberry Pi
curl -sfL https://apps.iotistic.ca/agent/install | \
  IOTISTIC_CLOUD_API_ENDPOINT=https://api.iotistic.ca \
  IOTISTIC_PROVISIONING_KEY=abc123... \
  sh
```

**What happens:**
1. ✓ Agent installer downloads
2. ✓ System dependencies installed (including WireGuard)
3. ✓ Device provisioned via API
4. ✓ VPN config retrieved and saved
5. ✓ WireGuard tunnel started
6. ✓ VPN enabled on boot
7. ✓ Agent started with VPN connectivity

### Scenario 2: User without Provisioning Key (No VPN)

```bash
# Local mode - no cloud connection
curl -sfL https://apps.iotistic.ca/agent/install | sh
```

**What happens:**
1. ✓ Agent installer downloads
2. ✓ System dependencies installed
3. ✗ VPN setup skipped (no provisioning key)
4. ✓ Agent started in local mode

### Scenario 3: VPN Provisioning Fails

If VPN setup fails (network issue, invalid key, etc.), the installer **continues** with agent installation:

```
⚠️  VPN setup failed
Continuing with agent installation...
✓ Agent started (without VPN)
```

User can retry VPN setup later manually.

## Workflow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    User runs install.sh                      │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            v
                ┌──────────────────────┐
                │ Install dependencies │
                │ (including WireGuard)│
                └──────────┬───────────┘
                           │
                           v
                ┌──────────────────────┐
                │ Provisioning key?    │
                └──────────┬───────────┘
                           │
              ┌────────────┴────────────┐
              │                         │
          YES │                         │ NO
              v                         v
    ┌──────────────────┐      ┌──────────────────┐
    │ Call provisioning│      │ Skip VPN setup   │
    │ API              │      └──────────┬───────┘
    └─────────┬────────┘                 │
              │                          │
              v                          │
    ┌──────────────────┐                 │
    │ VPN enabled in   │                 │
    │ response?        │                 │
    └─────────┬────────┘                 │
              │                          │
     ┌────────┴────────┐                 │
     │                 │                 │
   YES│               NO│                │
     v                 v                 │
┌──────────────┐  ┌──────────┐          │
│ Setup VPN:   │  │ Skip VPN │          │
│ - Save config│  └────┬─────┘          │
│ - Start wg0  │       │                │
│ - Enable boot│       │                │
└──────┬───────┘       │                │
       │               │                │
       └───────────────┴────────────────┘
                       │
                       v
             ┌──────────────────┐
             │ Start Agent      │
             │ (Docker/Systemd) │
             └──────────────────┘
```

## VPN Configuration Details

### Config File Location
- **Path**: `/etc/wireguard/wg0.conf`
- **Permissions**: `600` (root only)
- **Format**: Standard WireGuard INI format

### Example Config
```ini
[Interface]
PrivateKey = <device-private-key>
Address = 10.8.0.105/24
DNS = 1.1.1.1

[Peer]
PublicKey = <server-public-key>
Endpoint = vpn.example.com:51820
AllowedIPs = 10.8.0.0/24
PersistentKeepalive = 25
```

### Auto-Start Configuration
- **Service**: `wg-quick@wg0.service`
- **Status**: `systemctl status wg-quick@wg0`
- **Logs**: `journalctl -u wg-quick@wg0 -f`

### Network Mode (Docker)

**With VPN:**
```bash
docker run --network host ...
```
- Agent can access VPN network (10.8.0.0/24)
- Uses host's WireGuard interface
- Device API on port 48484 (host binding)

**Without VPN:**
```bash
docker run -p 48484:48484 ...
```
- Standard bridge network
- Port mapping for Device API

## Manual VPN Setup (Post-Installation)

If VPN setup was skipped or failed during installation, you can set it up manually:

### Step 1: Get Provisioning Response

```bash
DEVICE_UUID=$(cat /var/lib/iotistic/agent/device-uuid)
CLOUD_API="https://api.iotistic.ca"
PROVISIONING_KEY="your-key-here"

curl -X POST "${CLOUD_API}/api/v1/device/register" \
  -H "Content-Type: application/json" \
  -H "X-Provisioning-Key: ${PROVISIONING_KEY}" \
  -d "{\"deviceUuid\": \"${DEVICE_UUID}\", \"deviceName\": \"$(hostname)\"}" \
  | jq -r '.vpnConfig.wgConfig' | sudo tee /etc/wireguard/wg0.conf
```

### Step 2: Set Permissions

```bash
sudo chmod 600 /etc/wireguard/wg0.conf
```

### Step 3: Start VPN

```bash
sudo wg-quick up wg0
sudo systemctl enable wg-quick@wg0
```

### Step 4: Verify

```bash
sudo wg show wg0
ping 10.8.0.1
```

## Troubleshooting

### Issue: VPN Config Retrieved but Tunnel Won't Start

**Check 1: Kernel module loaded**
```bash
lsmod | grep wireguard
# If empty:
sudo modprobe wireguard
```

**Check 2: Endpoint is reachable**
```bash
# Extract endpoint from config
ENDPOINT=$(grep Endpoint /etc/wireguard/wg0.conf | cut -d' ' -f3)
# Try UDP connection
nc -u -v $(echo $ENDPOINT | cut -d: -f1) $(echo $ENDPOINT | cut -d: -f2)
```

**Check 3: Firewall rules**
```bash
sudo wg-quick up wg0
sudo wg show wg0
# Look for handshake - should show timestamp
```

### Issue: VPN Works but Agent Can't Use It (Docker)

**Problem**: Docker container in bridge mode can't access host's WireGuard interface

**Solution**: Restart agent with host network mode
```bash
docker stop iotistic-agent
docker rm iotistic-agent

docker run -d \
  --name iotistic-agent \
  --restart unless-stopped \
  --network host \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v /var/lib/iotistic/agent:/app/data \
  -e CLOUD_API_ENDPOINT=https://api.iotistic.ca \
  -e PROVISIONING_API_KEY=your-key \
  iotistic/agent:latest
```

### Issue: Endpoint Field Still NULL in Database

**Explanation**: Endpoint is populated when the client connects, not during provisioning

**Check**: View WireGuard status on client
```bash
sudo wg show wg0
# Look for "latest handshake" - should show recent timestamp
```

**Verify on server**:
```powershell
docker exec iotistic-postgres psql -U postgres -d iotistic -c "SELECT device_name, ip_address, endpoint, last_handshake FROM wg_peers WHERE ip_address = '10.8.0.105';"
```

If handshake shows on client but endpoint still NULL on server, check if the WireGuard server is syncing endpoints (this is optional functionality).

## Testing

### Test Script: `scripts/test-install-with-vpn.sh`

Simulates the provisioning + VPN setup flow without actually installing the agent:

```bash
# On Raspberry Pi or Linux test machine
chmod +x scripts/test-install-with-vpn.sh

API_ENDPOINT=http://YOUR_WINDOWS_IP:4002 \
PROVISIONING_KEY=your-key-here \
./scripts/test-install-with-vpn.sh
```

**What it tests:**
1. API connectivity
2. Device provisioning
3. VPN config retrieval
4. Config file creation
5. (Optional) Actual WireGuard setup

### End-to-End Test

```bash
# On a fresh Raspberry Pi or Ubuntu VM
curl -sfL https://apps.iotistic.ca/agent/install | \
  IOTISTIC_CLOUD_API_ENDPOINT=http://YOUR_WINDOWS_IP:4002 \
  IOTISTIC_PROVISIONING_KEY=your-key-here \
  sudo sh
```

Expected output:
```
Installing system dependencies... ✓
Installing Docker... ✓
Setting up WireGuard VPN...
  Retrieving VPN configuration... ✓
  VPN IP: 10.8.0.106
  Starting WireGuard tunnel... ✓
  WireGuard enabled on boot ✓
  Testing VPN connectivity... ✓
Starting agent container... ✓
Installation complete!
```

## Security Considerations

### Private Key Protection
- WireGuard config contains device private key
- File permissions set to `600` (root only)
- Never log or expose private keys

### Provisioning Key Handling
- Provisioning key passed as environment variable
- Not saved to disk (unless in agent.env for local agent)
- Should be single-use or time-limited

### VPN Network Isolation
- VPN network (10.8.0.0/24) is isolated from public internet
- Only authenticated devices can join
- Each device gets unique private key

## Future Enhancements

### Potential Improvements

1. **Endpoint Auto-Update**
   - Currently uses `vpn.example.com` placeholder
   - Could auto-detect server's public IP during installation
   - Or use DDNS service integration

2. **VPN Health Monitoring**
   - Add periodic handshake checks
   - Auto-restart tunnel if connectivity lost
   - Report VPN status to cloud API

3. **Multi-Server Support**
   - Allow specifying multiple VPN servers for redundancy
   - Automatic failover if primary unreachable

4. **Split Tunneling**
   - Option to route only cloud traffic through VPN
   - Keep local network traffic on LAN interface

5. **VPN-Only Mode**
   - Require VPN for agent to start
   - Fail installation if VPN can't be established

## References

- **Install Script**: `agent/bin/install.sh`
- **VPN Setup Function**: Lines 18-113
- **Docker Integration**: Lines 253-284
- **Systemd Integration**: Lines 473-477
- **Test Script**: `scripts/test-install-with-vpn.sh`
- **Client Setup Guide**: `docs/WIREGUARD-CLIENT-SETUP.md`
