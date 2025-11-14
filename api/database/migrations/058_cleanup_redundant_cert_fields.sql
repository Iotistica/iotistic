-- Migration: Cleanup redundant certificate fields
-- Purpose: Remove duplicate certificate storage to eliminate confusion
-- Created: 2025-11-13
-- 
-- Background:
-- Previously had redundant cert fields:
--   - api.tls AND api.tls.caCert (both storing same cert)
--   - mqtt.ca_certificate AND mqtt.brokers.1.caCert (both storing same cert)
--
-- Standardizing to:
--   - api.tls.caCert (API TLS certificate)
--   - mqtt.brokers.1 (MQTT broker config with embedded caCert)

-- Remove redundant API certificate field
DELETE FROM system_config WHERE key = 'api.tls';

-- Remove redundant standalone MQTT certificate field
-- (The certificate should only be in mqtt.brokers.1.caCert)
DELETE FROM system_config WHERE key = 'mqtt.ca_certificate';

-- Verification query (run manually to check):
-- SELECT key, 
--        jsonb_pretty(value) 
-- FROM system_config 
-- WHERE key IN ('api.tls.caCert', 'mqtt.brokers.1')
-- ORDER BY key;
