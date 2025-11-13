# Generate TLS certificates for Mosquitto MQTTS
# Run this script from the project root directory

Write-Host "Generating TLS certificates for Mosquitto..." -ForegroundColor Green

# Create certs directory
$certsDir = ".\certs"
if (-not (Test-Path $certsDir)) {
    New-Item -ItemType Directory -Path $certsDir | Out-Null
    Write-Host "Created $certsDir directory" -ForegroundColor Yellow
}

# Use Docker to generate certificates (no OpenSSL installation required)
Write-Host "Using Docker alpine/openssl container to generate certificates..." -ForegroundColor Cyan

docker run --rm -v ${PWD}/certs:/certs alpine/openssl sh -c @"
cd /certs && \
echo 'Generating CA private key...' && \
openssl genrsa -out ca.key 4096 && \
echo 'Generating CA certificate...' && \
openssl req -new -x509 -days 365 -key ca.key -out ca.crt -subj '/CN=Iotistic CA' && \
echo 'Generating server private key...' && \
openssl genrsa -out server.key 2048 && \
echo 'Generating certificate signing request...' && \
openssl req -new -key server.key -out server.crt.csr -subj '/CN=mosquitto' && \
echo 'Signing server certificate...' && \
openssl x509 -req -in server.crt.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server.crt -days 365 && \
echo 'Setting permissions...' && \
chmod 644 ca.crt server.crt && \
chmod 600 ca.key server.key && \
echo 'Certificate generation complete!'
"@

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nCertificates generated successfully!" -ForegroundColor Green
    Write-Host "`nGenerated files:" -ForegroundColor Cyan
    Write-Host "  - certs/ca.crt       (CA certificate - distribute to clients)"
    Write-Host "  - certs/ca.key       (CA private key - KEEP SECURE)"
    Write-Host "  - certs/server.crt   (Server certificate)"
    Write-Host "  - certs/server.key   (Server private key - KEEP SECURE)"
    
    Write-Host "`nNext steps:" -ForegroundColor Yellow
    Write-Host "  1. Restart Mosquitto: docker-compose restart mosquitto"
    Write-Host "  2. Test MQTTS: See docs/TLS-SETUP-GUIDE.md"
} else {
    Write-Host "`nError: Certificate generation failed!" -ForegroundColor Red
    Write-Host "Make sure Docker is running and try again."
    exit 1
}
