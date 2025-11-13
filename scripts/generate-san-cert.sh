#!/bin/bash
# Generate multi-hostname certificate using Subject Alternative Names (SAN)
# This single certificate works for MQTT broker, API server, and localhost testing

set -e

echo "🔐 Generating multi-hostname certificate with SAN..."

# Create certs directory if it doesn't exist
mkdir -p certs

# Check if CA already exists
if [ ! -f certs/ca.crt ]; then
  echo "📝 Generating CA certificate..."
  openssl req -new -x509 -days 365 -extensions v3_ca \
    -keyout certs/ca.key -out certs/ca.crt \
    -subj "/CN=Iotistic CA"
  echo "✅ CA certificate created"
else
  echo "✅ Using existing CA certificate"
fi

# Generate server private key
echo "📝 Generating server private key..."
openssl genrsa -out certs/server.key 2048

# Generate certificate signing request
echo "📝 Generating certificate signing request..."
openssl req -new -out certs/server.csr \
  -key certs/server.key \
  -subj "/CN=iotistic"

# Create SAN extension file with all possible hostnames
echo "📝 Creating SAN extension file..."
cat > certs/server.ext << EOF
subjectAltName = DNS:mosquitto,DNS:api,DNS:localhost,DNS:*.iotistic.local,IP:127.0.0.1
EOF

# Sign certificate with CA
echo "📝 Signing certificate with CA..."
openssl x509 -req -in certs/server.csr \
  -CA certs/ca.crt -CAkey certs/ca.key \
  -CAcreateserial -out certs/server.crt \
  -days 365 -extfile certs/server.ext

# Set appropriate permissions
chmod 600 certs/server.key certs/ca.key
chmod 644 certs/server.crt certs/ca.crt

echo ""
echo "✅ Certificate generation complete!"
echo ""
echo "📁 Generated files:"
echo "   - certs/ca.crt (CA certificate)"
echo "   - certs/ca.key (CA private key)"
echo "   - certs/server.crt (Server certificate with SAN)"
echo "   - certs/server.key (Server private key)"
echo ""
echo "🔍 Certificate details:"
openssl x509 -in certs/server.crt -text -noout | grep -A1 "Subject Alternative Name"
echo ""
echo "📋 Valid hostnames:"
echo "   ✅ mosquitto (MQTT broker)"
echo "   ✅ api (API server)"
echo "   ✅ localhost (local testing)"
echo "   ✅ *.iotistic.local (wildcard subdomain)"
echo "   ✅ 127.0.0.1 (IP address)"
echo ""
echo "🚀 Next steps:"
echo "   1. Restart services: docker compose restart mosquitto api"
echo "   2. Update CA cert in database: ./scripts/update-ca-cert-db.sh"
echo "   3. Test MQTTS: mosquitto_pub -h localhost -p 8883 --cafile certs/ca.crt -t test -m hello"
echo "   4. Test HTTPS: curl --cacert certs/ca.crt https://localhost:3443/health"
