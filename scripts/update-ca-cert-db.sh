#!/bin/bash
# Update CA certificate in PostgreSQL database for both MQTT and API TLS

set -e

echo "📝 Updating CA certificate in database..."

# Read CA certificate and escape for JSON
CA_CERT=$(cat certs/ca.crt | sed 's/$/\\r\\n/g' | tr -d '\n' | sed 's/\\r\\n$//')

# Update MQTT broker config
echo "🔄 Updating MQTT broker CA certificate..."
docker exec -i iotistic-postgres psql -U postgres -d iotistic << EOF
UPDATE system_config
SET value = jsonb_set(
  value,
  '{caCert}',
  to_jsonb('${CA_CERT}'::text)
)
WHERE key = 'mqtt.brokers.1';
EOF

# Add/update API TLS config
echo "🔄 Updating API TLS CA certificate..."
docker exec -i iotistic-postgres psql -U postgres -d iotistic << EOF
INSERT INTO system_config (key, value, updated_at)
VALUES (
  'api.tls.caCert',
  jsonb_build_object(
    'enabled', true,
    'caCert', '${CA_CERT}'::text
  ),
  CURRENT_TIMESTAMP
)
ON CONFLICT (key) DO UPDATE
SET value = jsonb_set(
  EXCLUDED.value,
  '{caCert}',
  to_jsonb('${CA_CERT}'::text)
),
updated_at = CURRENT_TIMESTAMP;
EOF

echo ""
echo "✅ CA certificate updated in database"
echo ""
echo "🔍 Verification:"
echo ""
echo "MQTT broker config:"
docker exec -i iotistic-postgres psql -U postgres -d iotistic -c \
  "SELECT key, value->'caCert' IS NOT NULL as has_cert FROM system_config WHERE key = 'mqtt.brokers.1';"

echo ""
echo "API TLS config:"
docker exec -i iotistic-postgres psql -U postgres -d iotistic -c \
  "SELECT key, value->'caCert' IS NOT NULL as has_cert FROM system_config WHERE key = 'api.tls.caCert';"

echo ""
echo "✅ Done! Re-provision devices to receive updated certificate."
