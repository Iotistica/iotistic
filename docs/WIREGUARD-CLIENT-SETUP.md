# WireGuard VPN Client Setup Guide

## Testing from Raspberry Pi to Docker WireGuard Server

This guide explains how to connect a Raspberry Pi (or any Linux client) to your WireGuard VPN server running in Docker on Windows.

## Architecture Overview

```
┌──────────────────────┐         Internet         ┌─────────────────────────┐
│   Raspberry Pi       │◄────────────────────────►│   Windows Machine       │
│                      │                           │                         │
│  WireGuard Client    │   Encrypted Tunnel        │  Docker: wg-server      │
│  IP: 10.8.0.10X      │   UDP Port 51820          │  IP: 10.8.0.1           │
│                      │                           │  External: 51820/udp    │
└──────────────────────┘                           └─────────────────────────┘
```

## Prerequisites

### On Windows Machine (Server)

1. **WireGuard server running in Docker** ✅ (already configured)
2. **Port forwarding configured** (if behind router):
   - Forward UDP port 51820 to your Windows machine
3. **Windows Firewall rule** (if needed):
   ```powershell
   New-NetFirewallRule -DisplayName "WireGuard VPN" -Direction Inbound -Protocol UDP -LocalPort 51820 -Action Allow
   ```
4. **Know your public IP** or use a DDNS hostname:
   ```powershell
   # Check public IP
   curl ifconfig.me
   ```

### On Raspberry Pi (Client)

1. **WireGuard tools installed**:
   ```bash
   sudo apt update
   sudo apt install wireguard wireguard-tools
   ```

2. **Kernel support** (usually pre-installed on modern Raspberry Pi OS)

## Step-by-Step Setup

### Step 1: Get VPN Configuration from Provisioning

From your Raspberry Pi, call the provisioning API on your Windows machine:

```bash
# Replace with your values
API_URL="http://YOUR_WINDOWS_IP:4002"
PROVISIONING_KEY="your-provisioning-key-here"
DEVICE_UUID=$(uuidgen)  # Or use existing device UUID

# Register device and get VPN config
curl -X POST "${API_URL}/api/v1/device/register" \
  -H "Content-Type: application/json" \
  -H "X-Provisioning-Key: ${PROVISIONING_KEY}" \
  -d "{
    \"deviceUuid\": \"${DEVICE_UUID}\",
    \"deviceName\": \"rpi-test\",
    \"deviceType\": \"raspberry-pi\",
    \"metadata\": {\"location\": \"lab\"}
  }" | jq '.'
```

**Expected Response:**
```json
{
  "device": {...},
  "mqtt": {...},
  "vpnConfig": {
    "enabled": true,
    "ipAddress": "10.8.0.105",
    "wgConfig": "[Interface]\nPrivateKey = ...\n..."
  }
}
```

### Step 2: Save VPN Configuration

Extract and save the WireGuard config:

```bash
# Save the response
curl -X POST "${API_URL}/api/v1/device/register" \
  -H "Content-Type: application/json" \
  -H "X-Provisioning-Key: ${PROVISIONING_KEY}" \
  -d "{\"deviceUuid\": \"${DEVICE_UUID}\", \"deviceName\": \"rpi-test\"}" \
  > /tmp/provision-response.json

# Extract VPN config
jq -r '.vpnConfig.wgConfig' /tmp/provision-response.json > /tmp/wg0.conf

# Move to WireGuard directory
sudo mv /tmp/wg0.conf /etc/wireguard/wg0.conf
sudo chmod 600 /etc/wireguard/wg0.conf
```

### Step 3: Update Endpoint in Config

**CRITICAL**: Update the `Endpoint` line in the config to use your Windows machine's **public IP** (not the internal example.com):

```bash
# Edit the config
sudo nano /etc/wireguard/wg0.conf
```

Change this line:
```ini
Endpoint = vpn.example.com:51820
```

To your actual public IP or hostname:
```ini
Endpoint = YOUR_PUBLIC_IP:51820
# Example: Endpoint = 203.0.113.45:51820
# Or with DDNS: Endpoint = myhome.ddns.net:51820
```

**Complete config should look like:**
```ini
[Interface]
PrivateKey = <your-private-key>
Address = 10.8.0.105/24
DNS = 1.1.1.1

[Peer]
PublicKey = /B824RHfsdV+abckuipsIg15zeaelHm3lNyobgssSEU=
Endpoint = YOUR_PUBLIC_IP:51820
AllowedIPs = 10.8.0.0/24
PersistentKeepalive = 25
```

### Step 4: Start WireGuard

```bash
# Bring up the interface
sudo wg-quick up wg0

# Check status
sudo wg show wg0
```

**Expected output:**
```
interface: wg0
  public key: AbC123...
  private key: (hidden)
  listening port: 54321

peer: /B824RHfsdV+abckuipsIg15zeaelHm3lNyobgssSEU=
  endpoint: YOUR_PUBLIC_IP:51820
  allowed ips: 10.8.0.0/24
  latest handshake: 5 seconds ago
  transfer: 1.23 KiB received, 2.34 KiB sent
  persistent keepalive: every 25 seconds
```

### Step 5: Test Connectivity

```bash
# Test 1: Ping VPN gateway
ping 10.8.0.1

# Test 2: Check handshake (should show recent timestamp)
sudo wg show wg0 latest-handshakes

# Test 3: Try reaching API through VPN (if exposed)
curl http://10.8.0.1:3002/health
```

### Step 6: Enable Auto-Start (Optional)

```bash
# Enable WireGuard to start on boot
sudo systemctl enable wg-quick@wg0

# Check status
sudo systemctl status wg-quick@wg0
```

## Using the Test Script

We've created an automated test script:

```bash
# Copy script to Raspberry Pi
scp scripts/test-wireguard-client.sh pi@YOUR_RPI_IP:/tmp/

# On Raspberry Pi
chmod +x /tmp/test-wireguard-client.sh
sudo /tmp/test-wireguard-client.sh
```

The script will:
- ✅ Check if WireGuard is installed
- ✅ Verify config file exists
- ✅ Bring up the interface
- ✅ Test ping to gateway
- ✅ Check handshake status
- ✅ Test API connectivity

## Troubleshooting

### Issue: "Cannot reach VPN gateway"

**Check 1: Firewall on Windows**
```powershell
# On Windows, allow UDP 51820
New-NetFirewallRule -DisplayName "WireGuard VPN" -Direction Inbound -Protocol UDP -LocalPort 51820 -Action Allow
```

**Check 2: Docker port mapping**
```powershell
# Verify wg-server is listening
docker ps | grep wg-server
# Should show: 0.0.0.0:51820->51820/udp
```

**Check 3: Server logs**
```powershell
docker logs wg-server
```

**Check 4: Router port forwarding** (if behind NAT)
- Forward external UDP 51820 to your Windows machine's local IP

### Issue: "No handshake yet"

This means packets aren't reaching the server:

1. **Verify Endpoint IP is correct**:
   ```bash
   grep Endpoint /etc/wireguard/wg0.conf
   # Should show your Windows machine's PUBLIC IP
   ```

2. **Check Windows machine's public IP**:
   ```powershell
   curl ifconfig.me
   ```

3. **Test UDP connectivity**:
   ```bash
   # From Raspberry Pi
   nc -u -v YOUR_WINDOWS_IP 51820
   ```

### Issue: "Handshake works but can't ping 10.8.0.1"

**Check 1: IP forwarding in Docker**
```bash
# On Docker host (Windows), check wg-server container
docker exec wg-server cat /proc/sys/net/ipv4/ip_forward
# Should output: 1
```

**Check 2: iptables rules**
```bash
docker exec wg-server iptables -L FORWARD -n -v
# Should show ACCEPT rule for wg0
```

**Check 3: Routing in container**
```bash
docker exec wg-server ip route
# Should show: 10.8.0.0/24 dev wg0
```

### Issue: "Endpoint keeps changing in `wg show`"

This is **normal** - WireGuard learns the client's public IP dynamically. The server's `wg_peers` table will update the `endpoint` field when the client connects.

## Monitoring

### Real-time connection monitoring

```bash
# Watch WireGuard status (refreshes every 2 seconds)
watch -n 2 'sudo wg show wg0'
```

### Check server-side peer status

```powershell
# On Windows, query database
docker exec iotistic-postgres psql -U postgres -d iotistic -c "SELECT device_name, ip_address, endpoint, last_handshake FROM wg_peers WHERE device_name LIKE 'rpi-%';"
```

### View detailed transfer stats

```bash
# On Raspberry Pi
sudo wg show wg0 transfer
sudo wg show wg0 dump
```

## Advanced Configuration

### Routing all traffic through VPN

To route ALL internet traffic through the VPN (not just 10.8.0.0/24):

```ini
[Peer]
AllowedIPs = 0.0.0.0/0  # Route everything through VPN
```

**Note**: This requires NAT/masquerading on the server side.

### Custom DNS

```ini
[Interface]
DNS = 10.8.0.1, 1.1.1.1, 8.8.8.8
```

### Multiple peers

You can connect multiple Raspberry Pis - each will get a unique IP (10.8.0.101, 10.8.0.102, etc.)

## Network Topology

```
Internet
    │
    ├─── Windows Machine (Public IP: X.X.X.X)
    │     │
    │     └─── Docker: wg-server (10.8.0.1)
    │           └─── VPN Network: 10.8.0.0/24
    │
    ├─── Raspberry Pi #1 (VPN: 10.8.0.101)
    ├─── Raspberry Pi #2 (VPN: 10.8.0.102)
    └─── Raspberry Pi #3 (VPN: 10.8.0.103)
```

All Raspberry Pis can:
- Communicate with each other (10.8.0.x)
- Access services on the server (if exposed)
- Maintain encrypted tunnel even behind NAT

## Next Steps

1. **Test with actual Raspberry Pi** - Follow this guide
2. **Monitor endpoint field** - Check if it populates in `wg_peers` table
3. **Test agent communication** - Install agent on Raspberry Pi and connect through VPN
4. **Load testing** - Test with multiple simultaneous clients

## Reference

- **WireGuard Official Docs**: https://www.wireguard.com/quickstart/
- **Your server endpoint**: Check with `curl ifconfig.me`
- **Config location**: `/etc/wireguard/wg0.conf`
- **Test script**: `scripts/test-wireguard-client.sh`
