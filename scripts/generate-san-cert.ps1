# Generate SAN certificate using Docker (Windows-compatible)
# This avoids needing OpenSSL on Windows host

# Create certs directory if it doesn't exist
if (-not (Test-Path "certs")) {
    New-Item -ItemType Directory -Path "certs" | Out-Null
}

Write-Host "🔐 Generating multi-hostname certificate with SAN..." -ForegroundColor Cyan

# Check if CA already exists
if (Test-Path "certs/ca.crt") {
    Write-Host "✅ Using existing CA certificate" -ForegroundColor Green
} else {
    Write-Host "📝 Generating CA certificate..." -ForegroundColor Yellow
    docker run --rm -v "${PWD}/certs:/certs" alpine/openssl req -new -x509 -days 365 -extensions v3_ca `
        -keyout /certs/ca.key -out /certs/ca.crt `
        -subj "/CN=Iotistic CA"
    Write-Host "✅ CA certificate created" -ForegroundColor Green
}

# Generate server private key
Write-Host "📝 Generating server private key..." -ForegroundColor Yellow
docker run --rm -v "${PWD}/certs:/certs" alpine/openssl genrsa -out /certs/server.key 2048

# Generate certificate signing request
Write-Host "📝 Generating certificate signing request..." -ForegroundColor Yellow
docker run --rm -v "${PWD}/certs:/certs" alpine/openssl req -new -out /certs/server.csr `
    -key /certs/server.key `
    -subj "/CN=iotistic"

# Create SAN extension file with all possible hostnames
Write-Host "📝 Creating SAN extension file..." -ForegroundColor Yellow
@"
subjectAltName = DNS:mosquitto,DNS:api,DNS:localhost,DNS:*.iotistic.local,IP:127.0.0.1
"@ | Out-File -FilePath "certs/server.ext" -Encoding ASCII -NoNewline

# Sign certificate with CA
Write-Host "📝 Signing certificate with CA..." -ForegroundColor Yellow
docker run --rm -v "${PWD}/certs:/certs" alpine/openssl x509 -req -in /certs/server.csr `
    -CA /certs/ca.crt -CAkey /certs/ca.key `
    -CAcreateserial -out /certs/server.crt `
    -days 365 -extfile /certs/server.ext

Write-Host ""
Write-Host "✅ Certificate generation complete!" -ForegroundColor Green
Write-Host ""
Write-Host "📁 Generated files:" -ForegroundColor Cyan
Write-Host "   - certs/ca.crt (CA certificate)"
Write-Host "   - certs/ca.key (CA private key)"
Write-Host "   - certs/server.crt (Server certificate with SAN)"
Write-Host "   - certs/server.key (Server private key)"
Write-Host ""
Write-Host "🔍 Certificate details:" -ForegroundColor Cyan
docker run --rm -v "${PWD}/certs:/certs" alpine/openssl x509 -in /certs/server.crt -text -noout | Select-String -Pattern "Subject Alternative Name" -Context 0,1
Write-Host ""
Write-Host "📋 Valid hostnames:" -ForegroundColor Cyan
Write-Host "   ✅ mosquitto (MQTT broker)"
Write-Host "   ✅ api (API server)"
Write-Host "   ✅ localhost (local testing)"
Write-Host "   ✅ *.iotistic.local (wildcard subdomain)"
Write-Host "   ✅ 127.0.0.1 (IP address)"
Write-Host ""
Write-Host "🚀 Next steps:" -ForegroundColor Yellow
Write-Host "   1. Update CA cert in database: .\scripts\update-ca-cert-db.ps1"
Write-Host "   2. Restart services: docker compose restart mosquitto api"
Write-Host "   3. Test MQTTS: mosquitto_pub -h localhost -p 8883 --cafile certs/ca.crt -t test -m hello"
Write-Host "   4. Test HTTPS: curl --cacert certs/ca.crt https://localhost:3443/health"
