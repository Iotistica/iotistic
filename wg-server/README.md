# WireGuard VPN Server

Simple WireGuard VPN server inspired by [wg-portal](https://github.com/h44z/wg-portal) for managing IoT device VPN connections with a REST API.

## Features

- REST API for peer management (create, list, update, delete)
- Automatic IP address allocation from pool
- QR code generation for mobile devices
- Dynamic peer configuration without server restart
- PostgreSQL database for peer storage
- Client config file generation
- Docker deployment with proper capabilities

## Quick Start

### 1. Generate Server Keys

```powershell
cd wg-server

# Start PostgreSQL first
docker-compose up -d postgres

# Run temporary container with WireGuard tools
docker run --rm -it alpine:latest sh -c "apk add --no-cache wireguard-tools && wg genkey | tee /tmp/server-private.key | wg pubkey > /tmp/server-public.key && cat /tmp/server-private.key && echo '---' && cat /tmp/server-public.key"

# Or use Docker Compose to generate keys
docker-compose run --rm --entrypoint sh wg-server -c "wg genkey | tee server-private.key | wg pubkey > server-public.key && cat server-private.key && echo '---' && cat server-public.key"

# Copy the output (first line is private key, after --- is public key)
# Save private key for next step
```

### 2. Create WireGuard Config

```powershell
# Copy template
Copy-Item wg0.conf.example wg0.conf

# Edit wg0.conf and replace <SERVER_PRIVATE_KEY> with your private key from step 1
notepad wg0.conf
```

### 3. Configure Environment

```powershell
# Set your public IP or domain in docker-compose.yml
# Edit the SERVER_ENDPOINT variable
```

### 4. Start Services

```bash
# Start PostgreSQL and WireGuard server
docker-compose up -d

# Check logs
docker-compose logs -f wg-server

# Initialize WireGuard interface (first time only)
docker exec wg-server wg-quick up wg0
```

### 5. Install Dependencies (Local Development)

```bash
npm install
```

## API Endpoints

### Create Peer
```bash
curl -X POST http://localhost:8080/api/peers \
  -H "Content-Type: application/json" \
  -d '{
    "deviceId": "device-001",
    "deviceName": "Raspberry Pi Sensor",
    "notes": "Living room temperature sensor"
  }'

# Response:
# {
#   "peerId": "uuid-here",
#   "publicKey": "peer-public-key",
#   "ipAddress": "10.8.0.2",
#   "deviceId": "device-001",
#   "deviceName": "Raspberry Pi Sensor",
#   "createdAt": "2025-11-10T..."
# }
```

### List Peers
```bash
curl http://localhost:8080/api/peers

# Filter by enabled status
curl http://localhost:8080/api/peers?enabled=true
```

### Get Peer Details
```bash
curl http://localhost:8080/api/peers/<peerId>
```

### Update Peer
```bash
curl -X PATCH http://localhost:8080/api/peers/<peerId> \
  -H "Content-Type: application/json" \
  -d '{
    "deviceName": "Updated Name",
    "notes": "New notes",
    "enabled": false
  }'
```

### Delete Peer
```bash
curl -X DELETE http://localhost:8080/api/peers/<peerId>
```

### Download Client Config
```bash
# Download as file
curl http://localhost:8080/api/peers/<peerId>/config -o client.conf

# Install on Linux client
sudo cp client.conf /etc/wireguard/wg0.conf
sudo wg-quick up wg0
```

### Get QR Code (for mobile)
```bash
# Save QR code as image
curl http://localhost:8080/api/peers/<peerId>/qr -o qr-code.png

# Or open in browser
open http://localhost:8080/api/peers/<peerId>/qr
```

### Check Server Status
```bash
curl http://localhost:8080/api/status
```

### Health Check
```bash
curl http://localhost:8080/health
```

## Database Schema

### wg_peers
- `peer_id` - Unique peer identifier (UUID)
- `public_key` - WireGuard public key
- `private_key` - WireGuard private key (for client config)
- `preshared_key` - Additional security layer
- `ip_address` - Allocated IP (e.g., 10.8.0.2)
- `device_id` - IoT device identifier
- `device_name` - Human-readable name
- `notes` - Additional metadata
- `enabled` - Active status

### wg_ip_pool
- IP address pool (10.8.0.2 - 10.8.0.254)
- Automatic allocation and release

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | API server port |
| `WG_INTERFACE` | `wg0` | WireGuard interface name |
| `SERVER_ENDPOINT` | `vpn.example.com` | Public IP or domain |
| `DB_HOST` | `postgres` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `wireguard` | Database name |
| `DB_USER` | `postgres` | Database user |
| `DB_PASSWORD` | `postgres` | Database password |
| `LOG_LEVEL` | `info` | Logging level |

## IoT Device Integration

### Raspberry Pi Example

```bash
# Install WireGuard
sudo apt update && sudo apt install wireguard

# Create peer via API
PEER_ID=$(curl -X POST http://your-server:8080/api/peers \
  -H "Content-Type: application/json" \
  -d '{"deviceId":"rpi-001","deviceName":"Raspberry Pi"}' \
  | jq -r '.peerId')

# Download config
curl http://your-server:8080/api/peers/$PEER_ID/config \
  -o /etc/wireguard/wg0.conf

# Start VPN
sudo wg-quick up wg0

# Enable on boot
sudo systemctl enable wg-quick@wg0
```

## Architecture

```
┌─────────────────────┐
│   IoT Devices       │
│  (WireGuard Clients)│
└──────────┬──────────┘
           │
           │ VPN Tunnel (UDP 51820)
           │
┌──────────▼──────────┐
│  WireGuard Server   │
│    (wg0 interface)  │
│                     │
│  ┌───────────────┐  │
│  │  REST API     │  │ :8080
│  │  (Express)    │  │
│  └───────┬───────┘  │
│          │          │
│  ┌───────▼───────┐  │
│  │  PostgreSQL   │  │
│  │  (Peer DB)    │  │
│  └───────────────┘  │
└─────────────────────┘
```

## Security Considerations

1. **Private Keys**: Keep `server-private.key` secure
2. **Database**: Use strong PostgreSQL password in production
3. **API Access**: Add authentication middleware for production
4. **Firewall**: Only expose UDP 51820 and API port (with auth)
5. **Preshared Keys**: Enabled by default for post-quantum security

## Troubleshooting

### WireGuard interface not starting
```bash
# Check if module is loaded
lsmod | grep wireguard

# Load module
sudo modprobe wireguard

# Check interface
docker exec wg-server wg show
```

### Peers not connecting
```bash
# Check server firewall
sudo iptables -L -n -v

# Check WireGuard status
docker exec wg-server wg show wg0

# View peer handshake
docker exec wg-server wg show wg0 latest-handshakes
```

### Database connection issues
```bash
# Check PostgreSQL
docker exec wg-postgres psql -U postgres -d wireguard -c '\dt'

# View peers
docker exec wg-postgres psql -U postgres -d wireguard \
  -c 'SELECT peer_id, ip_address, device_name, enabled FROM wg_peers;'
```

## Differences from wg-portal

**Simplified**:
- No web UI (API only)
- No LDAP/OAuth (focused on device auth)
- No email notifications
- Simpler deployment

**Similar**:
- REST API for peer management
- PostgreSQL storage
- QR code generation
- Dynamic peer configuration

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build

# Run production
npm start
```

## License

MIT

## Credits

Inspired by [wg-portal](https://github.com/h44z/wg-portal) by h44z.
