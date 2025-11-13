# API HTTPS Setup Guide

Secure device-to-API communication with TLS encryption.

## Architecture

```
Device (Agent)                      API Server
┌─────────────────┐                ┌──────────────────┐
│                 │  HTTPS (TLS)   │                  │
│  HTTP Client    ├───────────────>│  Express.js      │
│  + CA Cert      │  Port 3443     │  + Server Cert   │
│                 │                │  + Private Key   │
└─────────────────┘                └──────────────────┘
         ↓                                   ↓
    CloudSync                          system_config
    (apiEndpoint)                      (api.tls.caCert)
```

## Setup Steps

### 1. Generate TLS Certificates

```bash
# Create certs directory
mkdir -p certs/api

# Generate CA certificate (if not already created for MQTT)
if [ ! -f certs/ca.crt ]; then
  openssl req -new -x509 -days 365 -extensions v3_ca \
    -keyout certs/ca.key -out certs/ca.crt \
    -subj "/CN=Iotistic CA"
fi

# Generate API server private key
openssl genrsa -out certs/api/server.key 2048

# Generate certificate signing request
openssl req -new -out certs/api/server.csr \
  -key certs/api/server.key \
  -subj "/CN=api"

# Sign with CA (SAN for localhost + Docker name)
cat > certs/api/server.ext << EOF
subjectAltName = DNS:api,DNS:localhost,IP:127.0.0.1
EOF

openssl x509 -req -in certs/api/server.csr \
  -CA certs/ca.crt -CAkey certs/ca.key \
  -CAcreateserial -out certs/api/server.crt \
  -days 365 -extfile certs/api/server.ext

# Set permissions
chmod 600 certs/api/server.key
chmod 644 certs/api/server.crt
```

### 2. Update API Server (HTTPS Support)

#### Create HTTPS Server Module

**File: `api/src/https-server.ts`**

```typescript
import https from 'https';
import fs from 'fs';
import path from 'path';
import logger from './utils/logger';
import type { Express } from 'express';

export interface HttpsConfig {
  enabled: boolean;
  port: number;
  certPath: string;
  keyPath: string;
  requestCert?: boolean;
  rejectUnauthorized?: boolean;
}

export function createHttpsServer(app: Express, config: HttpsConfig): https.Server | null {
  if (!config.enabled) {
    logger.info('HTTPS disabled');
    return null;
  }

  try {
    // Read certificate files
    const cert = fs.readFileSync(config.certPath, 'utf8');
    const key = fs.readFileSync(config.keyPath, 'utf8');

    // Optional: Client certificate verification (mutual TLS)
    const httpsOptions: https.ServerOptions = {
      cert,
      key,
      requestCert: config.requestCert || false,
      rejectUnauthorized: config.rejectUnauthorized || false,
    };

    // Create HTTPS server
    const server = https.createServer(httpsOptions, app);

    server.listen(config.port, () => {
      logger.info('='.repeat(80));
      logger.info('🔒 Iotistic API HTTPS Server');
      logger.info('='.repeat(80));
      logger.info(`HTTPS Server running on https://localhost:${config.port}`);
      logger.info('='.repeat(80));
    });

    return server;
  } catch (error) {
    logger.error('Failed to create HTTPS server', { error });
    throw error;
  }
}
```

#### Update `api/src/index.ts`

Add after the HTTP server setup:

```typescript
// Import HTTPS support
import { createHttpsServer } from './https-server';

// After const server = app.listen(PORT, ...) add:

// HTTPS server (optional - for device-to-API TLS)
let httpsServer: https.Server | null = null;
const HTTPS_ENABLED = process.env.HTTPS_ENABLED === 'true';
const HTTPS_PORT = parseInt(process.env.HTTPS_PORT || '3443', 10);

if (HTTPS_ENABLED) {
  try {
    httpsServer = createHttpsServer(app, {
      enabled: true,
      port: HTTPS_PORT,
      certPath: process.env.HTTPS_CERT_PATH || './certs/api/server.crt',
      keyPath: process.env.HTTPS_KEY_PATH || './certs/api/server.key',
    });
  } catch (error) {
    logger.warn('Failed to start HTTPS server', { error });
  }
}

// Update SIGTERM/SIGINT handlers to close both servers:
// Add to shutdown handlers:
if (httpsServer) {
  httpsServer.close();
  logger.info('HTTPS Server closed');
}
```

### 3. Store CA Certificate in Database

**Migration: `api/src/db/migrations/058_add_api_tls_config.sql`**

```sql
-- Add API TLS configuration to system_config
INSERT INTO system_config (key, value, updated_at)
VALUES (
  'api.tls.caCert',
  jsonb_build_object(
    'enabled', true,
    'caCert', ''  -- Will be populated via script
  ),
  CURRENT_TIMESTAMP
)
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    updated_at = CURRENT_TIMESTAMP;
```

**Script to populate CA cert:**

```bash
# Load CA certificate into database
cat > scripts/update-api-ca-cert.sh << 'EOF'
#!/bin/bash
CA_CERT=$(cat certs/ca.crt)
docker exec -i iotistic-postgres psql -U postgres -d iotistic << SQL
UPDATE system_config
SET value = jsonb_set(
  value,
  '{caCert}',
  to_jsonb('$CA_CERT'::text)
)
WHERE key = 'api.tls.caCert';
SQL
echo "API CA certificate updated in database"
EOF

chmod +x scripts/update-api-ca-cert.sh
./scripts/update-api-ca-cert.sh
```

### 4. Create API Route to Expose CA Certificate

**File: `api/src/routes/tls-config.ts`**

```typescript
import express from 'express';
import { SystemConfig } from '../config/system-config';
import logger from '../utils/logger';

const router = express.Router();

/**
 * GET /api/v1/tls/ca-certificate
 * Public endpoint - returns CA certificate for client verification
 * Used by agents to trust API's self-signed certificate
 */
router.get('/ca-certificate', async (req, res) => {
  try {
    const tlsConfig = await SystemConfig.get('api.tls.caCert');
    
    if (!tlsConfig || !tlsConfig.enabled) {
      return res.status(404).json({
        error: 'TLS not configured',
        message: 'API TLS is not enabled or CA certificate not found'
      });
    }

    // Return certificate in PEM format
    res.type('application/x-pem-file');
    res.send(tlsConfig.caCert);
  } catch (error) {
    logger.error('Error fetching TLS CA certificate', { error });
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to retrieve CA certificate'
    });
  }
});

export default router;
```

**Mount route in `api/src/index.ts`:**

```typescript
import tlsConfigRoutes from './routes/tls-config';
app.use(`${API_BASE}/tls`, tlsConfigRoutes);
```

### 5. Update Agent to Use HTTPS

#### Add TLS Support to CloudSync

**File: `agent/src/sync/index.ts`**

Update HTTP client creation:

```typescript
import https from 'https';
import axios, { AxiosInstance } from 'axios';

private async createHttpClient(): Promise<AxiosInstance> {
  const headers: any = {
    'X-Device-API-Key': this.deviceManager.getDeviceInfo().apiKey,
    'Content-Type': 'application/json',
  };

  const axiosConfig: any = {
    baseURL: this.cloudApiEndpoint,
    headers,
  };

  // Add HTTPS/TLS options if using HTTPS endpoint
  if (this.cloudApiEndpoint.startsWith('https://')) {
    const deviceInfo = this.deviceManager.getDeviceInfo();
    
    // Check if we have API TLS configuration
    if (deviceInfo.apiTlsConfig?.caCert) {
      axiosConfig.httpsAgent = new https.Agent({
        ca: deviceInfo.apiTlsConfig.caCert,
        rejectUnauthorized: deviceInfo.apiTlsConfig.verifyCertificate !== false,
      });
      
      this.logger?.infoSync('HTTPS enabled for cloud API', {
        component: LogComponents.cloudSync,
        endpoint: this.cloudApiEndpoint,
        verifyCertificate: deviceInfo.apiTlsConfig.verifyCertificate !== false,
      });
    } else {
      // No CA cert configured - skip verification (dev mode)
      axiosConfig.httpsAgent = new https.Agent({
        rejectUnauthorized: false,
      });
      
      this.logger?.warnSync('HTTPS certificate verification disabled', {
        component: LogComponents.cloudSync,
        endpoint: this.cloudApiEndpoint,
        reason: 'No CA certificate configured',
      });
    }
  }

  return axios.create(axiosConfig);
}
```

#### Update DeviceInfo Type

**File: `agent/src/provisioning/types.ts`**

```typescript
export interface DeviceInfo {
  uuid: string;
  // ... existing fields ...
  mqttBrokerConfig?: MqttBrokerConfig;
  apiTlsConfig?: ApiTlsConfig;  // Add this
}

export interface ApiTlsConfig {
  enabled: boolean;
  caCert?: string;              // CA certificate (PEM format)
  verifyCertificate: boolean;
}
```

#### Update Provisioning Response

**File: `api/src/routes/provisioning.ts`**

Add TLS config to provisioning response:

```typescript
// Fetch API TLS configuration
const apiTlsConfig = await SystemConfig.get('api.tls.caCert');

const response: any = {
  id: device.id,
  // ... existing fields ...
  api: {
    endpoint: process.env.API_ENDPOINT || 'http://localhost:3002',
    ...(apiTlsConfig && apiTlsConfig.enabled && {
      tls: {
        enabled: true,
        caCert: apiTlsConfig.caCert,
        verifyCertificate: true,
      }
    })
  }
};
```

#### Update Agent Database Schema

**Migration: `agent/src/db/migrations/20251113000000_add_api_tls_config.js`**

```javascript
exports.up = function(knex) {
  return knex.schema.table('device', table => {
    table.text('apiTlsConfig').nullable();
  });
};

exports.down = function(knex) {
  return knex.schema.table('device', table => {
    table.dropColumn('apiTlsConfig');
  });
};
```

#### Save TLS Config in Device Manager

**File: `agent/src/provisioning/device-manager.ts`**

Update `provision()` method:

```typescript
// Save API TLS config if provided
if (response.api?.tls) {
  await this.db
    .prepare(
      `UPDATE device 
       SET apiTlsConfig = ? 
       WHERE uuid = ?`
    )
    .run(
      JSON.stringify(response.api.tls),
      this.deviceInfo.uuid
    );
  
  this.deviceInfo.apiTlsConfig = response.api.tls;
  
  this.logger?.infoSync('API TLS configuration saved', {
    component: LogComponents.provisioning,
    enabled: response.api.tls.enabled,
    hasCaCert: !!response.api.tls.caCert,
  });
}
```

### 6. Docker Compose Configuration

```yaml
# docker-compose.yml
services:
  api:
    environment:
      - HTTPS_ENABLED=true
      - HTTPS_PORT=3443
      - HTTPS_CERT_PATH=/app/certs/api/server.crt
      - HTTPS_KEY_PATH=/app/certs/api/server.key
    ports:
      - "3002:3002"   # HTTP
      - "3443:3443"   # HTTPS
    volumes:
      - ./certs:/app/certs:ro

  agent-1:
    environment:
      - CLOUD_API_ENDPOINT=https://api:3443  # Use HTTPS
    depends_on:
      - api
```

### 7. Testing

#### Test HTTPS Endpoint

```bash
# Test with curl (skip cert verification)
curl -k https://localhost:3443/health

# Test with CA certificate
curl --cacert ./certs/ca.crt https://localhost:3443/health
```

#### Test Agent Connection

```bash
# Start agent
docker compose up -d agent-1

# Check logs for HTTPS connection
docker logs agent-1 | grep -i "https\|tls"

# Expected output:
# HTTPS enabled for cloud API {"endpoint":"https://api:3443","verifyCertificate":true}
# Device provisioned successfully
```

#### Verify Database Storage

```bash
# Check API TLS config
docker exec -it iotistic-postgres psql -U postgres -d iotistic \
  -c "SELECT jsonb_pretty(value) FROM system_config WHERE key = 'api.tls.caCert';"

# Check agent database
docker exec agent-1 sqlite3 /app/data/device.sqlite \
  "SELECT apiTlsConfig FROM device LIMIT 1;"
```

## Troubleshooting

### Error: "unable to get local issuer certificate"

**Cause**: Agent doesn't have CA certificate or not using it.

**Fix**:
1. Verify CA cert in database: `SELECT value FROM system_config WHERE key = 'api.tls.caCert'`
2. Check provisioning includes TLS config in response
3. Verify agent saves `apiTlsConfig` to database
4. Re-provision device if needed

### Error: "certificate signed by unknown authority"

**Cause**: Server certificate not signed by CA agent trusts.

**Fix**:
1. Regenerate server cert using same CA: `openssl x509 -req ... -CA certs/ca.crt`
2. Update CA cert in database if changed
3. Restart API server

### Error: "Hostname/IP doesn't match certificate's altnames"

**Cause**: Server certificate doesn't include all hostnames/IPs.

**Fix**: Add Subject Alternative Names (SAN):
```bash
cat > server.ext << EOF
subjectAltName = DNS:api,DNS:localhost,DNS:api.example.com,IP:127.0.0.1,IP:10.0.0.1
EOF
openssl x509 -req ... -extfile server.ext
```

## Production Considerations

### Certificate Rotation

```bash
# Generate new certificates
./scripts/generate-api-certs.sh

# Update database
./scripts/update-api-ca-cert.sh

# Restart API
docker restart iotistic-api

# Re-provision devices (or push config update via cloud sync)
```

### Commercial Certificates

```bash
# Use Let's Encrypt for public-facing API
certbot certonly --standalone -d api.example.com

# Update API config
HTTPS_CERT_PATH=/etc/letsencrypt/live/api.example.com/fullchain.pem
HTTPS_KEY_PATH=/etc/letsencrypt/live/api.example.com/privkey.pem

# No CA cert needed in database (browsers/agents trust Let's Encrypt root)
```

### Mutual TLS (mTLS)

For device authentication via client certificates:

```typescript
// api/src/https-server.ts
const httpsOptions = {
  cert,
  key,
  ca: fs.readFileSync('./certs/ca.crt'),  // Require client certs signed by this CA
  requestCert: true,
  rejectUnauthorized: true,
};

// Middleware to extract device ID from client cert
app.use((req, res, next) => {
  const cert = req.socket.getPeerCertificate();
  if (cert && cert.subject) {
    req.deviceId = cert.subject.CN;
  }
  next();
});
```

## Security Best Practices

1. **Never commit private keys** - Add `certs/*.key` to `.gitignore`
2. **Rotate certificates** - Set expiration to 90-365 days
3. **Use strong key sizes** - Minimum 2048-bit RSA or 256-bit ECC
4. **Enable HSTS** - Force HTTPS: `Strict-Transport-Security: max-age=31536000`
5. **Monitor expiration** - Alert 30 days before cert expires
6. **Separate CA keys** - Store CA private key offline/encrypted
7. **Use hardware security modules** - For production CA signing

## References

- [Node.js HTTPS Module](https://nodejs.org/api/https.html)
- [OpenSSL Certificate Authority](https://jamielinux.com/docs/openssl-certificate-authority/)
- [Axios HTTPS Agent](https://axios-http.com/docs/req_config)
- [Express.js Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
