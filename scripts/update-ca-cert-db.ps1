# Update CA certificate in PostgreSQL database using Docker (Windows-compatible)

Write-Host "📝 Updating CA certificate in database..." -ForegroundColor Cyan

# Change to repository root directory
$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptPath
Set-Location $repoRoot

# Read CA certificate content
$caCertContent = Get-Content -Path "certs/ca.crt" -Raw

# Escape for JSON/SQL (replace newlines with \r\n)
$caCertEscaped = $caCertContent -replace "`r`n", "\r\n" -replace "`n", "\n"

# Update mqtt.brokers.1 (contains caCert in JSON)
Write-Host "🔄 Updating mqtt.brokers.1..." -ForegroundColor Yellow
$mqttBrokerSql = @"
UPDATE system_config
SET value = jsonb_set(
  COALESCE(value, '{}'::jsonb),
  '{caCert}',
  to_jsonb('$caCertEscaped'::text)
),
updated_at = CURRENT_TIMESTAMP
WHERE key = 'mqtt.brokers.1';
"@

docker exec -i iotistic-postgres psql -U postgres -d iotistic -c $mqttBrokerSql

# Update api.tls.caCert (contains caCert in JSON)
Write-Host "🔄 Updating api.tls.caCert..." -ForegroundColor Yellow
$apiTlsCaCertSql = @"
UPDATE system_config
SET value = jsonb_set(
  COALESCE(value, '{}'::jsonb),
  '{caCert}',
  to_jsonb('$caCertEscaped'::text)
),
updated_at = CURRENT_TIMESTAMP
WHERE key = 'api.tls.caCert';
"@

docker exec -i iotistic-postgres psql -U postgres -d iotistic -c $apiTlsCaCertSql

Write-Host ""
Write-Host "✅ CA certificate updated in database" -ForegroundColor Green
Write-Host ""
Write-Host "🔍 Verification:" -ForegroundColor Cyan
Write-Host ""
Write-Host "Certificate keys:" -ForegroundColor Yellow
docker exec -i iotistic-postgres psql -U postgres -d iotistic -c "SELECT key, length(value::text) as value_length FROM system_config WHERE key IN ('mqtt.brokers.1', 'api.tls.caCert') ORDER BY key;"

Write-Host ""
Write-Host "✅ Done! Re-provision devices to receive updated certificate." -ForegroundColor Green
Write-Host ""
Write-Host "💡 To re-provision devices:" -ForegroundColor Yellow
Write-Host "   docker exec agent-1 rm /app/data/device.sqlite"
Write-Host "   docker restart agent-1"
