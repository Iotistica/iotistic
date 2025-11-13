# TLS/SSL Setup Guide - HTTPS & MQTTS

This guide shows how to enable encrypted connections for:
- **HTTPS** - Secure API and Dashboard access
- **MQTTS** - Secure MQTT broker connections

## Quick Start

### 1. Generate Certificates

**For Development (Self-Signed):**

```bash
# Generate self-signed certificates
chmod +x scripts/generate-certs.sh
./scripts/generate-certs.sh

# Or with custom domain
DOMAIN=mydevice.local ./scripts/generate-certs.sh

# Or for longer validity
DOMAIN=mydevice.local DAYS=730 ./scripts/generate-certs.sh
```

This creates:
- `certs/ca.crt` - CA certificate (distribute to clients)
- `certs/ca.key` - CA private key (keep secure)
- `certs/server.crt` - Server certificate
- `certs/server.key` - Server private key (keep secure)

**For Production (Let's Encrypt):**

```bash
# Install certbot
sudo apt-get install certbot

# Generate certificates (requires public domain)
sudo certbot certonly --standalone -d yourdomain.com

# Certificates stored in:
# /etc/letsencrypt/live/yourdomain.com/fullchain.pem
# /etc/letsencrypt/live/yourdomain.com/privkey.pem
```

### 2. Configure Mosquitto for MQTTS

**Option A: Enable TLS on existing config**

Edit `mosquitto/mosquitto.conf`:

```conf
# Change listener to use TLS
listener 8883 0.0.0.0
protocol mqtt

# Add TLS configuration
cafile /mosquitto/certs/ca.crt
certfile /mosquitto/certs/server.crt
keyfile /mosquitto/certs/server.key
require_certificate false
tls_version tlsv1.2

# WebSockets over TLS
listener 9002 0.0.0.0
protocol websockets
cafile /mosquitto/certs/ca.crt
certfile /mosquitto/certs/server.crt
keyfile /mosquitto/certs/server.key
require_certificate false
tls_version tlsv1.2
```

**Option B: Use pre-configured TLS config**

```bash
# Copy TLS config
cp mosquitto/mosquitto-tls.conf mosquitto/mosquitto.conf
```

### 3. Update docker-compose.yml

Add certificate volumes and update ports:

```yaml
mosquitto:
  image: iegomez/mosquitto-go-auth
  restart: always
  container_name: iotistic-mosquitto
  ports:
    # MQTTS (TLS)
    - "${MOSQUITTO_TLS_PORT_EXT:-8883}:8883"
    # WebSockets over TLS
    - "${MOSQUITTO_WSS_PORT_EXT:-9002}:9002"
    # Optional: Keep non-TLS for local testing
    # - "${MOSQUITTO_PORT_EXT:-1883}:1883"
  volumes:
    - ./mosquitto/mosquitto.conf:/etc/mosquitto/mosquitto.conf
    - ./certs:/mosquitto/certs:ro  # Add this line
  depends_on:
    postgres:
      condition: service_healthy
  networks:
    - iotistic-net
```

### 4. Configure API for HTTPS

**Update API service in docker-compose.yml:**

```yaml
api:
  build:
    context: ./api
    dockerfile: Dockerfile
  restart: always
  container_name: iotistic-api
  ports:
    - "${API_TLS_PORT_EXT:-3443}:3443"  # HTTPS port
  volumes:
    - ./api/uploads:/app/uploads
    - ./certs:/app/certs:ro  # Add this line
  environment:
    # Enable HTTPS
    - ENABLE_HTTPS=true
    - TLS_CERT_PATH=/app/certs/server.crt
    - TLS_KEY_PATH=/app/certs/server.key
    - HTTPS_PORT=3443
    # ... other env vars
```

**Update API code** (if not already implemented):

```typescript
// api/src/server.ts
import https from 'https';
import fs from 'fs';

const app = express();

if (process.env.ENABLE_HTTPS === 'true') {
  const httpsOptions = {
    cert: fs.readFileSync(process.env.TLS_CERT_PATH || '/app/certs/server.crt'),
    key: fs.readFileSync(process.env.TLS_KEY_PATH || '/app/certs/server.key')
  };
  
  https.createServer(httpsOptions, app).listen(
    process.env.HTTPS_PORT || 3443,
    () => console.log('HTTPS server running on port', process.env.HTTPS_PORT || 3443)
  );
} else {
  app.listen(process.env.PORT || 3002);
}
```

### 5. Update Client Connections

**Agent MQTT Connection:**

Update agent environment:

```yaml
# docker-compose.yml
agent-1:
  environment:
    # Change from mqtt:// to mqtts://
    - MQTT_BROKER_URL=mqtts://mosquitto:8883
    - MQTT_CA_CERT_PATH=/app/certs/ca.crt  # Add CA cert
  volumes:
    - ./certs:/app/certs:ro  # Mount certificates
```

**Agent code** (if not already implemented):

```typescript
// agent/src/mqtt/manager.ts
import { readFileSync } from 'fs';

const mqttOptions: mqtt.IClientOptions = {
  protocol: 'mqtts',
  port: 8883,
  // For self-signed certificates
  ca: readFileSync(process.env.MQTT_CA_CERT_PATH || '/app/certs/ca.crt'),
  rejectUnauthorized: process.env.NODE_ENV === 'production', // false for self-signed in dev
};

const client = mqtt.connect(brokerUrl, mqttOptions);
```

**Dashboard/API Client:**

```typescript
// Update API endpoint
const apiEndpoint = 'https://localhost:3443';

// For self-signed certificates in development
const httpsAgent = new https.Agent({
  ca: fs.readFileSync('./certs/ca.crt'),
  rejectUnauthorized: process.env.NODE_ENV === 'production'
});

fetch(apiEndpoint, { agent: httpsAgent });
```

## Environment Variables Reference

Add to `.env` file:

```bash
# TLS/SSL Configuration
ENABLE_HTTPS=true
ENABLE_MQTTS=true

# API HTTPS
API_TLS_PORT_EXT=3443
TLS_CERT_PATH=/app/certs/server.crt
TLS_KEY_PATH=/app/certs/server.key

# Mosquitto MQTTS
MOSQUITTO_TLS_PORT_EXT=8883
MOSQUITTO_WSS_PORT_EXT=9002
MQTT_CA_CERT_PATH=/app/certs/ca.crt

# For self-signed certificates (development only)
NODE_TLS_REJECT_UNAUTHORIZED=0  # NEVER use in production!
```

## Testing

### Test MQTTS Connection

```bash
# Install mosquitto-clients
sudo apt-get install mosquitto-clients

# Test MQTTS connection
mosquitto_pub -h localhost -p 8883 \
  --cafile ./certs/ca.crt \
  -u your-username -P your-password \
  -t test/topic -m "hello mqtts"

# Test WebSockets over TLS
# Use a WebSocket client or browser console
```

### Test HTTPS API

```bash
# Test with curl
curl --cacert ./certs/ca.crt https://localhost:3443/health

# Or skip verification for self-signed (dev only)
curl -k https://localhost:3443/health
```

## Production Considerations

### 1. Use Let's Encrypt

```bash
# Auto-renew certificates
sudo certbot renew --dry-run

# Add to crontab for auto-renewal
0 0 * * * certbot renew --quiet --post-hook "docker-compose restart mosquitto api"
```

### 2. Update docker-compose for Production

```yaml
mosquitto:
  volumes:
    # Use Let's Encrypt certificates
    - /etc/letsencrypt/live/yourdomain.com:/mosquitto/certs:ro
```

### 3. Security Best Practices

- ✅ **Always use TLS in production**
- ✅ **Use CA-signed certificates** (Let's Encrypt, DigiCert, etc.)
- ✅ **Set `require_certificate: true`** for client certificate authentication (optional)
- ✅ **Use strong TLS versions** (`tlsv1.2` minimum, prefer `tlsv1.3`)
- ✅ **Rotate certificates** before expiry (Let's Encrypt: 90 days)
- ✅ **Keep private keys secure** (600 permissions, never commit to git)
- ❌ **Never use `NODE_TLS_REJECT_UNAUTHORIZED=0` in production**
- ❌ **Never expose non-TLS ports** publicly in production

### 4. Firewall Rules

```bash
# Allow HTTPS
sudo ufw allow 3443/tcp

# Allow MQTTS
sudo ufw allow 8883/tcp

# Allow WebSockets over TLS
sudo ufw allow 9002/tcp

# Block non-TLS ports from public access (allow only local)
sudo ufw deny 3002/tcp
sudo ufw deny 1883/tcp
```

## Troubleshooting

### Certificate Verification Errors

```bash
# Check certificate validity
openssl x509 -in certs/server.crt -text -noout

# Verify certificate chain
openssl verify -CAfile certs/ca.crt certs/server.crt

# Test MQTTS connection with debug
mosquitto_sub -h localhost -p 8883 \
  --cafile ./certs/ca.crt \
  -t 'test/#' -v -d
```

### Common Issues

**"Certificate verify failed"**
- Ensure CA certificate is distributed to all clients
- Check certificate domain matches connection hostname
- Verify certificate not expired

**"Connection refused"**
- Check firewall allows ports 8883, 9002, 3443
- Verify services are listening on TLS ports: `docker logs iotistic-mosquitto`
- Check docker-compose port mappings

**"Permission denied" on certificate files**
- Set correct permissions: `chmod 600 certs/server.key`
- Ensure Docker can read mounted volumes

## Files Created

After following this guide, you'll have:

```
zemfyre-sensor/
├── certs/
│   ├── ca.crt           # CA certificate
│   ├── ca.key           # CA private key
│   ├── server.crt       # Server certificate
│   ├── server.key       # Server private key
│   └── san.cnf          # SAN configuration
├── mosquitto/
│   ├── mosquitto.conf        # Updated with TLS
│   └── mosquitto-tls.conf    # TLS template
└── scripts/
    └── generate-certs.sh     # Certificate generator
```

## Next Steps

1. **Generate certificates** - Run `./scripts/generate-certs.sh`
2. **Update configurations** - Modify `mosquitto.conf` and `docker-compose.yml`
3. **Restart services** - `docker-compose up -d --force-recreate`
4. **Test connections** - Use `mosquitto_pub` and `curl` to verify
5. **Distribute CA cert** - Copy `certs/ca.crt` to all clients
6. **Update client code** - Configure agents/dashboard to use TLS
7. **Monitor logs** - Check for TLS handshake errors

For production deployment, replace self-signed certificates with Let's Encrypt or commercial CA certificates.
