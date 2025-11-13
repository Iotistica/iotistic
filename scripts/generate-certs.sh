#!/bin/bash
# Generate self-signed certificates for HTTPS and MQTTS
# For production, use Let's Encrypt or your CA-signed certificates

set -e

CERT_DIR="./certs"
DOMAIN="${DOMAIN:-localhost}"
DAYS="${DAYS:-365}"

echo "Generating TLS certificates for: $DOMAIN"
echo "Valid for: $DAYS days"
echo "Output directory: $CERT_DIR"

# Create certs directory
mkdir -p "$CERT_DIR"

# Generate CA (Certificate Authority) - optional but recommended for self-signed
echo "Generating CA..."
openssl genrsa -out "$CERT_DIR/ca.key" 4096
openssl req -new -x509 -days $DAYS -key "$CERT_DIR/ca.key" -out "$CERT_DIR/ca.crt" \
  -subj "/C=US/ST=State/L=City/O=Iotistic/OU=IoT/CN=Iotistic CA"

# Generate server private key
echo "Generating server private key..."
openssl genrsa -out "$CERT_DIR/server.key" 2048

# Generate certificate signing request (CSR)
echo "Generating CSR..."
openssl req -new -key "$CERT_DIR/server.key" -out "$CERT_DIR/server.csr" \
  -subj "/C=US/ST=State/L=City/O=Iotistic/OU=IoT/CN=$DOMAIN"

# Create config file for SAN (Subject Alternative Names)
cat > "$CERT_DIR/san.cnf" <<EOF
[req]
distinguished_name = req_distinguished_name
req_extensions = v3_req
prompt = no

[req_distinguished_name]
C = US
ST = State
L = City
O = Iotistic
OU = IoT
CN = $DOMAIN

[v3_req]
keyUsage = keyEncipherment, dataEncipherment
extendedKeyUsage = serverAuth, clientAuth
subjectAltName = @alt_names

[alt_names]
DNS.1 = $DOMAIN
DNS.2 = localhost
DNS.3 = *.local
IP.1 = 127.0.0.1
IP.2 = ::1
EOF

# Sign the certificate with CA
echo "Signing certificate..."
openssl x509 -req -in "$CERT_DIR/server.csr" -CA "$CERT_DIR/ca.crt" -CAkey "$CERT_DIR/ca.key" \
  -CAcreateserial -out "$CERT_DIR/server.crt" -days $DAYS \
  -extensions v3_req -extfile "$CERT_DIR/san.cnf"

# Set permissions
chmod 600 "$CERT_DIR/server.key" "$CERT_DIR/ca.key"
chmod 644 "$CERT_DIR/server.crt" "$CERT_DIR/ca.crt"

echo ""
echo "✓ Certificates generated successfully!"
echo ""
echo "Files created:"
echo "  - $CERT_DIR/ca.crt       (CA certificate - distribute to clients)"
echo "  - $CERT_DIR/ca.key       (CA private key - KEEP SECURE)"
echo "  - $CERT_DIR/server.crt   (Server certificate)"
echo "  - $CERT_DIR/server.key   (Server private key - KEEP SECURE)"
echo ""
echo "Next steps:"
echo "1. Configure Mosquitto to use server.crt and server.key"
echo "2. Configure API/Dashboard to use server.crt and server.key"
echo "3. Distribute ca.crt to all clients for verification"
