# PostgreSQL Database - AI Coding Agent Instructions

Critical database patterns and workflows for the Iotistic IoT platform.

## Database Architecture

### Deployment Models

**Local Development (Docker Compose)**:
- Container: `iotistic-postgres`
- Image: `postgres:16-alpine`
- Database: `iotistic`
- User: `postgres`
- Password: `postgres` (default, override via `.env`)
- Port: `5432` (internal), `${DB_PORT_EXT:-5432}` (external)

**Kubernetes (Multi-Tenant)**:
- **Global**: Billing service uses managed PostgreSQL (AWS RDS/Cloud SQL/Azure)
- **Per-Customer**: Dedicated PostgreSQL instance in customer namespace
- **VPN Server**: Dedicated PostgreSQL for device registry and certificates

### Service Usage

**API Service** (`/api`):
- Database: `iotistic`
- User: `postgres`
- Connection: `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`
- Tables: 58+ migrations covering devices, MQTT ACLs, metrics, users, etc.

**Billing Service** (`/billing`):
- Database: `billing` (separate from main `iotistic` db)
- Tables: Customers, subscriptions, usage_reports, license_history
- Migrations: Knex-based (`billing/migrations/`)

**VPN Server** (`/vpn-server`):
- Database: `vpn` or shared `iotistic`
- Tables: Device registry, VPN certificates, revocation lists

## Critical Patterns

### Migration System

**Auto-Run on Startup**:
- API container runs migrations automatically on startup via `src/db/connection.ts`
- Function: `runMigrations()` from `src/db/migrations.ts`
- Location: `api/database/migrations/*.sql`
- Order: Alphabetical (e.g., `000_initial_schema.sql`, `001_add_security_tables.sql`)

**Migration Files**:
```sql
-- All migrations are pure SQL files
-- No up/down - migrations are one-way only
-- Example: 057_add_mqtt_tls_config.sql
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS ca_cert TEXT;
UPDATE system_config SET value = jsonb_set(value, '{caCert}', '"..."') WHERE key = 'mqtt.brokers.1';
```

**Manual Migration Commands**:
```bash
# Check migration status
cd api && npm run migrate:status

# Run pending migrations
npm run migrate

# Create new migration
npm run migrate:create migration_name

# Mark migrations as applied (skip execution)
npm run migrate:mark-applied

# Unmark migrations (for re-running)
npm run migrate:unmark
```

### Key Tables

**Device Management**:
- `devices` - Device registry, shadow state, connection status
- `device_state_history` - Target state versions
- `device_tags` - Flexible key-value metadata
- `device_metrics` - Time-series data (partitioned by day)
- `device_logs` - Agent logs (partitioned by day, 7-day retention)
- `network_interfaces` - Device network info (IPs, MACs, WiFi SSIDs)

**MQTT**:
- `mqtt_users` - MQTT authentication (Mosquitto PostgreSQL auth plugin)
- `mqtt_acls` - Topic-level access control (read/write permissions)
- `mqtt_broker_stats` - Broker performance metrics
- `mqtt_topic_metrics` - Per-topic message rates and sizes
- `system_config` - MQTT broker config including TLS certificates

**Security**:
- `users` - Dashboard users (bcrypt passwords, RBAC roles)
- `api_keys` - Device API keys with rotation support
- `api_key_history` - Audit trail for key changes
- `vpn_certificates` - Device VPN certs and revocation

**Digital Twin**:
- `digital_twin_entities` - Spatial entities from IFC files
- `digital_twin_relationships` - Entity relationships
- Neo4j used for graph queries (separate database)

### Environment Variables

**Required** (`.env` file):
```bash
# PostgreSQL Container
POSTGRES_DB=iotistic
POSTGRES_USER=postgres
POSTGRES_PASSWORD=postgres

# API Connection
DB_HOST=postgres              # Container name (NOT localhost)
DB_PORT=5432
DB_NAME=iotistic
DB_USER=postgres
DB_PASSWORD=postgres

# External Port (optional)
DB_PORT_EXT=5432
```

**Connection Pattern**:
```typescript
// Use container name for Docker networking
const connectionString = `postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;

// NOT localhost unless running outside Docker
// ❌ const dbHost = 'localhost';
// ✅ const dbHost = 'postgres';
```

## Common Operations

### Accessing Database

**Interactive psql**:
```powershell
# Connect to PostgreSQL container
docker exec -it iotistic-postgres psql -U postgres -d iotistic

# Common queries
SELECT * FROM devices LIMIT 10;
SELECT * FROM mqtt_acls WHERE username = 'device_uuid';
SELECT key, value FROM system_config WHERE key LIKE 'mqtt%';
SELECT * FROM users;
```

**One-liner queries**:
```powershell
# Check device count
docker exec iotistic-postgres psql -U postgres -d iotistic -c "SELECT COUNT(*) FROM devices;"

# View MQTT ACLs
docker exec iotistic-postgres psql -U postgres -d iotistic -c "SELECT * FROM mqtt_acls;"

# Get broker config
docker exec iotistic-postgres psql -U postgres -d iotistic -c "SELECT value FROM system_config WHERE key = 'mqtt.brokers.1';"
```

### Database Backups

**Backup**:
```powershell
# Full database dump
docker exec iotistic-postgres pg_dump -U postgres iotistic > backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql

# Specific tables only
docker exec iotistic-postgres pg_dump -U postgres -d iotistic -t devices -t mqtt_acls > partial_backup.sql

# Compressed backup
docker exec iotistic-postgres pg_dump -U postgres iotistic | gzip > backup.sql.gz
```

**Restore**:
```powershell
# From SQL file
Get-Content backup.sql | docker exec -i iotistic-postgres psql -U postgres -d iotistic

# From compressed
gunzip -c backup.sql.gz | docker exec -i iotistic-postgres psql -U postgres -d iotistic

# Drop and recreate database first (for clean restore)
docker exec iotistic-postgres psql -U postgres -c "DROP DATABASE iotistic;"
docker exec iotistic-postgres psql -U postgres -c "CREATE DATABASE iotistic;"
Get-Content backup.sql | docker exec -i iotistic-postgres psql -U postgres -d iotistic
```

### Maintenance

**Vacuum**:
```powershell
# Vacuum all tables
docker exec iotistic-postgres psql -U postgres -d iotistic -c "VACUUM ANALYZE;"

# Check database size
docker exec iotistic-postgres psql -U postgres -d iotistic -c "SELECT pg_size_pretty(pg_database_size('iotistic'));"
```

**Clean Old Data**:
```powershell
# Delete old metrics (older than 90 days)
docker exec iotistic-postgres psql -U postgres -d iotistic -c "DELETE FROM device_metrics WHERE timestamp < NOW() - INTERVAL '90 days';"

# Delete old logs (older than 7 days - handled by partition drops)
docker exec iotistic-postgres psql -U postgres -d iotistic -c "SELECT drop_old_partitions('device_logs', 7);"
```

## Troubleshooting

### Connection Issues

**Error: "Connection refused" or "could not connect to server"**

```powershell
# Check container is running
docker ps | Select-String postgres

# Check PostgreSQL logs
docker logs iotistic-postgres

# Verify port mapping
docker port iotistic-postgres

# Test connection from host
docker exec iotistic-postgres pg_isready -U postgres
```

**Error: "password authentication failed"**

```powershell
# Check environment variables match
docker exec iotistic-postgres printenv | Select-String POSTGRES

# Reset password
docker exec iotistic-postgres psql -U postgres -c "ALTER USER postgres WITH PASSWORD 'new_password';"
```

### Migration Issues

**Error: "migration already applied"**

```powershell
# Check migration status
cd api && npm run migrate:status

# Unmark specific migration to re-run
npm run migrate:unmark -- 057_add_mqtt_tls_config.sql
```

**Error: "relation does not exist"**

```powershell
# Run migrations manually
cd api && npm run migrate

# Or restart API container (auto-runs migrations)
docker restart iotistic-api
```

### Performance Issues

**Slow queries**:
```sql
-- Check slow queries (if pg_stat_statements enabled)
SELECT query, calls, total_time, mean_time 
FROM pg_stat_statements 
ORDER BY mean_time DESC 
LIMIT 10;

-- Check table sizes
SELECT 
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

## Key Files Reference

**Configuration**:
- `docker-compose.yml` - PostgreSQL service definition
- `.env` - Database credentials and connection settings
- `postgres/pg_hba.conf` - Client authentication rules
- `postgres/postgresql.conf` - Server configuration

**Migrations**:
- `api/database/migrations/*.sql` - Schema migrations (58+ files)
- `api/src/db/migrations.ts` - Migration runner logic
- `api/src/db/connection.ts` - Database connection pool

**Database Access**:
- `api/src/db/connection.ts` - Shared connection pool
- `api/src/db/repositories/` - Repository pattern for table access
- `billing/src/db/` - Billing database (separate schema)

## Security Best Practices

**Never commit**:
- ❌ Real passwords in `.env` or `docker-compose.yml`
- ❌ Production connection strings in code
- ❌ API keys or tokens in migrations

**Always**:
- ✅ Use environment variables for credentials
- ✅ Rotate passwords regularly
- ✅ Use read-only users for reporting/monitoring
- ✅ Enable SSL/TLS for production connections
- ✅ Restrict network access via `pg_hba.conf`

**Multi-Tenant Isolation** (Kubernetes):
- Each customer gets dedicated PostgreSQL instance
- No shared tables between customers
- Network policies prevent cross-namespace access
- Resource quotas limit memory/CPU usage