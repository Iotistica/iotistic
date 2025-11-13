# Update API TLS CA Certificate in PostgreSQL system_config
# Usage: .\update-api-tls-cert-db.ps1

# Get the repo root directory (parent of scripts/)
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

# Change to repo root so relative paths work
Set-Location $repoRoot

Write-Host "==================================" -ForegroundColor Cyan
Write-Host " Update API TLS CA Certificate" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Read CA certificate
$caCertPath = "certs\ca.crt"
if (-not (Test-Path $caCertPath)) {
    Write-Host " ERROR: CA certificate not found at $caCertPath" -ForegroundColor Red
    Write-Host " Run generate-san-cert.ps1 first to create certificates" -ForegroundColor Yellow
    exit 1
}

$caCert = Get-Content $caCertPath -Raw
Write-Host " CA Certificate loaded from $caCertPath" -ForegroundColor Green

# Escape the certificate for JSON (escape backslashes and quotes, preserve newlines)
$caCertEscaped = $caCert -replace '\\', '\\' -replace '"', '\"' -replace "`r`n", '\n' -replace "`n", '\n'

Write-Host " Certificate escaped for JSON" -ForegroundColor Green

# Insert or update api.tls configuration in system_config
Write-Host " Updating system_config table..." -ForegroundColor Yellow

$updateQuery = @"
INSERT INTO system_config (key, value, updated_at)
VALUES (
    'api.tls',
    '{"caCert": "$caCertEscaped", "verifyCertificate": true}'::jsonb,
    NOW()
)
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = NOW();
"@

docker exec iotistic-postgres psql -U postgres -d iotistic -c $updateQuery

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host " SUCCESS: API TLS configuration updated in database" -ForegroundColor Green
    Write-Host ""
    Write-Host "Verification:" -ForegroundColor Cyan
    docker exec iotistic-postgres psql -U postgres -d iotistic -c "SELECT key, updated_at FROM system_config WHERE key = 'api.tls';"
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor Yellow
    Write-Host "1. Enable HTTPS in .env: echo 'HTTPS_ENABLED=true' >> .env" -ForegroundColor White
    Write-Host "2. Rebuild API: docker compose up -d --build api" -ForegroundColor White
    Write-Host "3. Check HTTPS logs: docker logs iotistic-api | Select-String 'https'" -ForegroundColor White
    Write-Host "4. Test HTTPS: curl --cacert certs/ca.crt https://localhost:3443/health" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host " ERROR: Failed to update system_config table" -ForegroundColor Red
    Write-Host " Make sure PostgreSQL container is running: docker ps | grep postgres" -ForegroundColor Yellow
    exit 1
}
