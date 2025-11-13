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

# Update MQTT broker config
Write-Host "🔄 Updating MQTT broker CA certificate..." -ForegroundColor Yellow
$mqttSql = @"
UPDATE system_config
SET value = jsonb_set(
  value,
  '{caCert}',
  to_jsonb('$caCertEscaped'::text)
)
WHERE key = 'mqtt.brokers.1';
"@

docker exec -i iotistic-postgres psql -U postgres -d iotistic -c $mqttSql

# Add/update API TLS config
Write-Host "🔄 Updating API TLS CA certificate..." -ForegroundColor Yellow
$apiSql = @"
INSERT INTO system_config (key, value, updated_at)
VALUES (
  'api.tls.caCert',
  jsonb_build_object(
    'enabled', true,
    'caCert', '$caCertEscaped'::text
  ),
  CURRENT_TIMESTAMP
)
ON CONFLICT (key) DO UPDATE
SET value = jsonb_set(
  EXCLUDED.value,
  '{caCert}',
  to_jsonb('$caCertEscaped'::text)
),
updated_at = CURRENT_TIMESTAMP;
"@

docker exec -i iotistic-postgres psql -U postgres -d iotistic -c $apiSql

Write-Host ""
Write-Host "✅ CA certificate updated in database" -ForegroundColor Green
Write-Host ""
Write-Host "🔍 Verification:" -ForegroundColor Cyan
Write-Host ""
Write-Host "MQTT broker config:" -ForegroundColor Yellow
docker exec -i iotistic-postgres psql -U postgres -d iotistic -c "SELECT key, value->'caCert' IS NOT NULL as has_cert FROM system_config WHERE key = 'mqtt.brokers.1';"

Write-Host ""
Write-Host "API TLS config:" -ForegroundColor Yellow
docker exec -i iotistic-postgres psql -U postgres -d iotistic -c "SELECT key, value->'caCert' IS NOT NULL as has_cert FROM system_config WHERE key = 'api.tls.caCert';"

Write-Host ""
Write-Host "✅ Done! Re-provision devices to receive updated certificate." -ForegroundColor Green
Write-Host ""
Write-Host "💡 To re-provision devices:" -ForegroundColor Yellow
Write-Host "   docker exec agent-1 rm /app/data/device.sqlite"
Write-Host "   docker restart agent-1"
