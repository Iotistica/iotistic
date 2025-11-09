#!/bin/bash
# E2E Integration Tests Environment Configuration
# This script creates the .env file needed for docker-compose.e2e.yml

cat > .env << EOF
# PostgreSQL
POSTGRES_DB=iotistic
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# Redis
REDIS_PORT_EXT=6379
REDIS_HOST=redis
REDIS_PORT=6379

# API
API_PORT_EXT=4002
PORT=3002
NODE_ENV=development

# Database Connection
DB_HOST=postgres
DB_PORT=5432
DB_NAME=iotistic
DB_USER=postgres
DB_PASSWORD=postgres
DB_POOL_SIZE=20

# MQTT
MOSQUITTO_PORT_EXT=5883
MOSQUITTO_WS_PORT_EXT=59002
MQTT_BROKER_URL=mqtt://mosquitto:1883
MQTT_USERNAME=admin
MQTT_PASSWORD=iotistic42!
MQTT_PERSIST_TO_DB=true
MQTT_DB_SYNC_INTERVAL=10000
MQTT_MONITOR_ENABLED=true

# Neo4j
NEO4J_URI=bolt://neo4j:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=iotistic123

# Dashboard
DASHBOARD_PORT_EXT=3000

# VPN
VPN_SERVER_PORT=1194
VPN_API_PORT=3200
VPN_MGMT_PORT=7505
VPN_CA_PORT=8080
VPN_SERVER_HOST=localhost
VPN_DB_NAME=iotistic_vpn

# License Keys
LICENSE_PUBLIC_KEY=${LICENSE_PUBLIC_KEY}
IOTISTIC_LICENSE_KEY=${IOTISTIC_LICENSE_KEY}

# Logging
FORCE_COLOR=1
LOG_COMPRESSION=true
EOF

echo "✓ Environment file created successfully"
