# Coding Standards - AI Coding Agent Instructions

Comprehensive coding standards, conventions, and best practices for the Iotistic IoT platform.

---

## Table of Contents

1. [General Principles](#general-principles)
2. [TypeScript Standards](#typescript-standards)
3. [Naming Conventions](#naming-conventions)
4. [File Organization](#file-organization)
5. [Error Handling](#error-handling)
6. [Logging Standards](#logging-standards)
7. [Database Patterns](#database-patterns)
8. [API Design](#api-design)
9. [Testing Standards](#testing-standards)
10. [Documentation](#documentation)
11. [Security Practices](#security-practices)
12. [Performance Guidelines](#performance-guidelines)
13. [Git Workflow](#git-workflow)
14. [Code Review Checklist](#code-review-checklist)

---

## General Principles

### Core Values

1. **Simplicity Over Cleverness**: Write code that's easy to understand, not code that shows off
2. **Explicit Over Implicit**: Be clear about intentions and behaviors
3. **Fail Fast, Fail Loud**: Don't hide errors - surface them immediately
4. **DRY (Don't Repeat Yourself)**: Extract common patterns into reusable functions
5. **YAGNI (You Aren't Gonna Need It)**: Don't build features before they're needed
6. **Single Responsibility**: Each function/class should do one thing well

### Code Style Rules

**Critical**: These rules apply to **ALL code** (TypeScript, JavaScript, SQL, documentation):

1. ❌ **NO EMOJIS** in code, logs, comments, or documentation
   - Use plain text descriptions instead
   - Exception: User-facing UI text only (dashboard/marketing)
   
2. ✅ **Use `logger` instead of `console.log`**
   - Agent: Use `AgentLogger` with `LogComponents` enum
   - API: Use Winston logger instance
   - Billing: Use Winston logger instance
   - Only use `console.log()` for CLI tools or when logger unavailable

3. ✅ **Structured Logging**
   - Always include context: `{ component, operation, deviceId, error }`
   - Use appropriate log levels: debug, info, warn, error

4. ✅ **PowerShell-Compatible Commands**
   - Use semicolons (`;`) for command chaining, NOT `&&`
   - Test all shell commands on Windows PowerShell

**Examples**:

```typescript
// ❌ BAD - Emoji in code
logger.info('🚀 Starting agent...');

// ✅ GOOD - Plain text
logger.info('Starting agent...');

// ❌ BAD - console.log in application code
console.log('Device connected');

// ✅ GOOD - Structured logging with context
this.logger?.infoSync('Device connected', {
  component: LogComponents.mqtt,
  deviceUuid: device.uuid
});

// ❌ BAD - Shell command with &&
npm run build && npm run test

// ✅ GOOD - PowerShell-compatible
npm run build; npm run test
```

### Language-Specific Guidelines

**TypeScript/JavaScript**:
- Use TypeScript strict mode
- Prefer `const` over `let`, avoid `var`
- Use `async/await` over Promises/callbacks
- Prefer functional programming (map, filter, reduce)

**SQL**:
- Use uppercase for keywords: `SELECT`, `FROM`, `WHERE`
- Use snake_case for table/column names
- Always use parameterized queries (prevent SQL injection)

**Markdown**:
- Use ATX headers (`#`, `##`, `###`)
- Code blocks must specify language: ` ```typescript `, ` ```sql `
- No trailing whitespace

---

## TypeScript Standards

### TypeScript Configuration

**Strict Mode Settings** (all projects):

```jsonc
{
  "compilerOptions": {
    "strict": true,                          // Enable all strict checks
    "target": "ES2022",                      // Modern JavaScript
    "module": "commonjs",                    // Node.js compatible
    "esModuleInterop": true,                 // Import compatibility
    "skipLibCheck": true,                    // Skip .d.ts checks (performance)
    "forceConsistentCasingInFileNames": true,// Case-sensitive imports
    "resolveJsonModule": true,               // Import JSON files
    "declaration": true,                     // Generate .d.ts files
    "sourceMap": true,                       // Debugging support
    "incremental": true                      // Faster rebuilds
  }
}
```

### Type Safety

**Always Prefer Types Over Any**:

```typescript
// ❌ BAD - Loses type safety
function processData(data: any): any {
  return data.value;
}

// ✅ GOOD - Explicit types
interface SensorData {
  value: number;
  timestamp: number;
  unit: string;
}

function processData(data: SensorData): number {
  return data.value;
}

// ✅ GOOD - Generic types for reusable code
function processData<T>(data: T): T {
  return data;
}
```

**Use Interfaces for Objects, Types for Unions**:

```typescript
// ✅ GOOD - Interface for object shape
interface Device {
  uuid: string;
  name: string;
  type: string;
}

// ✅ GOOD - Type for union/literal types
type DeviceStatus = 'online' | 'offline' | 'degraded';
type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// ✅ GOOD - Type for complex combinations
type ApiResponse<T> = 
  | { success: true; data: T }
  | { success: false; error: string };
```

**Avoid Type Assertions (Prefer Type Guards)**:

```typescript
// ❌ BAD - Type assertion bypasses checks
const device = data as Device;

// ✅ GOOD - Type guard validates at runtime
function isDevice(data: unknown): data is Device {
  return (
    typeof data === 'object' &&
    data !== null &&
    'uuid' in data &&
    'name' in data
  );
}

if (isDevice(data)) {
  // TypeScript knows data is Device here
  console.log(data.uuid);
}
```

### Async/Await Patterns

**Always Use Async/Await Over Callbacks**:

```typescript
// ❌ BAD - Callback hell
function getData(callback) {
  db.query('SELECT * FROM devices', (err, result) => {
    if (err) return callback(err);
    processData(result, (err, processed) => {
      if (err) return callback(err);
      callback(null, processed);
    });
  });
}

// ✅ GOOD - Clean async/await
async function getData(): Promise<ProcessedData> {
  const result = await db.query('SELECT * FROM devices');
  const processed = await processData(result);
  return processed;
}
```

**Handle Promise Rejections Explicitly**:

```typescript
// ❌ BAD - Unhandled rejection
async function fetchData() {
  const data = await apiCall(); // Could throw!
  return data;
}

// ✅ GOOD - Explicit error handling
async function fetchData(): Promise<Data | null> {
  try {
    const data = await apiCall();
    return data;
  } catch (error) {
    logger.error('Failed to fetch data', { error: error.message });
    return null;
  }
}
```

**Parallel Execution for Independent Operations**:

```typescript
// ❌ BAD - Sequential (slower)
const devices = await getDevices();
const sensors = await getSensors();
const metrics = await getMetrics();

// ✅ GOOD - Parallel (faster)
const [devices, sensors, metrics] = await Promise.all([
  getDevices(),
  getSensors(),
  getMetrics()
]);
```

### Null Safety

**Use Optional Chaining and Nullish Coalescing**:

```typescript
// ❌ BAD - Verbose null checks
const name = device && device.config && device.config.name 
  ? device.config.name 
  : 'Unknown';

// ✅ GOOD - Optional chaining
const name = device?.config?.name ?? 'Unknown';

// ✅ GOOD - Nullish coalescing (only null/undefined, not 0 or '')
const timeout = config.timeout ?? 5000;
const port = config.port ?? 0; // 0 is valid, undefined uses default
```

**Mark Optional Properties Explicitly**:

```typescript
// ✅ GOOD - Clear optionality
interface DeviceConfig {
  name: string;           // Required
  type: string;           // Required
  description?: string;   // Optional
  metadata?: Record<string, any>; // Optional
}
```

---

## Naming Conventions

### Files and Directories

**File Names**:
- Use `kebab-case.ts` for TypeScript files: `device-manager.ts`, `mqtt-client.ts`
- Use `PascalCase.tsx` for React components: `DeviceCard.tsx`, `MetricsChart.tsx`
- Use `UPPERCASE.md` for documentation: `README.md`, `CHANGELOG.md`
- Use `NNN_description.sql` for migrations: `001_initial_schema.sql`

**Directory Names**:
- Use `kebab-case` for directories: `device-state/`, `mqtt-monitor/`
- Use `singular` for modules, `plural` for collections:
  - `service/` (module containing service classes)
  - `services/` (collection of service files)

### Variables and Functions

**Variables**:
```typescript
// ✅ GOOD - Descriptive camelCase
const deviceUuid = '123-456';
const mqttBrokerUrl = 'mqtts://localhost:8883';
const isProvisioned = true;
const maxRetryCount = 3;

// ❌ BAD - Unclear abbreviations
const dU = '123-456';
const url = 'mqtts://localhost:8883';
const flag = true;
const max = 3;
```

**Functions**:
```typescript
// ✅ GOOD - Verb-based, descriptive
async function provisionDevice(uuid: string): Promise<Device> { }
function calculateAverage(values: number[]): number { }
function isValidEmail(email: string): boolean { }
async function sendNotification(message: string): Promise<void> { }

// ❌ BAD - Noun-based or unclear
function device(uuid: string) { }
function average(values: number[]) { }
function email(email: string) { }
function notification(message: string) { }
```

**Boolean Variables**:
```typescript
// ✅ GOOD - Prefix with is/has/can/should
const isOnline = true;
const hasError = false;
const canExecuteJobs = true;
const shouldRetry = false;

// ❌ BAD - No prefix
const online = true;
const error = false;
```

### Classes and Interfaces

**Classes** (PascalCase, noun-based):
```typescript
class DeviceManager { }
class MqttClient { }
class StateReconciler { }
class LicenseValidator { }
```

**Interfaces** (PascalCase, descriptive):
```typescript
interface Device { }
interface MqttConfig { }
interface LicenseData { }
interface ApiResponse<T> { }
```

**Enums** (PascalCase for name, UPPER_SNAKE_CASE for values):
```typescript
enum DeviceStatus {
  ONLINE = 'online',
  OFFLINE = 'offline',
  DEGRADED = 'degraded'
}

enum LogLevel {
  DEBUG = 'debug',
  INFO = 'info',
  WARN = 'warn',
  ERROR = 'error'
}
```

### Constants

**Use UPPER_SNAKE_CASE for true constants**:
```typescript
const API_VERSION = 'v1';
const MAX_RETRY_ATTEMPTS = 3;
const DEFAULT_TIMEOUT_MS = 5000;
const MQTT_QOS_LEVEL = 1;
```

**Use camelCase for configuration objects**:
```typescript
const mqttConfig = {
  brokerUrl: 'mqtts://localhost:8883',
  keepalive: 60,
  reconnectPeriod: 5000
};
```

### Database Names

**PostgreSQL** (snake_case):
```sql
-- Tables
devices
device_target_state
device_current_state
mqtt_acls
provisioning_keys

-- Columns
device_uuid
device_name
created_at
updated_at
is_active
```

**Neo4j** (PascalCase for labels, camelCase for properties):
```cypher
// Node labels
(:Project)
(:Building)
(:Floor)
(:Space)
(:EdgeDevice)

// Properties
{
  expressId: "123",
  deviceName: "Gateway 1",
  createdAt: "2025-01-01"
}

// Relationships
-[:CONTAINS]->
-[:HAS_DEVICE]->
```

---

## File Organization

### Project Structure Pattern

**Consistent Structure Across Services**:

```
service-name/
├── src/
│   ├── index.ts              # Entry point
│   ├── types/                # TypeScript type definitions
│   │   └── index.ts
│   ├── config/               # Configuration files
│   │   └── index.ts
│   ├── db/                   # Database layer
│   │   ├── connection.ts     # DB connection pool
│   │   ├── models/           # Data models
│   │   │   ├── device.model.ts
│   │   │   └── index.ts
│   │   └── migrations/       # Schema migrations
│   ├── services/             # Business logic
│   │   ├── device-manager.ts
│   │   ├── mqtt-client.ts
│   │   └── index.ts
│   ├── routes/               # API routes (if applicable)
│   │   ├── devices.ts
│   │   └── index.ts
│   ├── middleware/           # Express middleware
│   │   └── auth.ts
│   ├── utils/                # Helper functions
│   │   ├── logger.ts
│   │   └── validators.ts
│   └── workers/              # Background jobs
│       └── metrics-worker.ts
├── database/                 # SQL migrations (separate from src)
│   └── migrations/
│       └── 001_initial_schema.sql
├── test/                     # Tests (mirror src structure)
│   ├── unit/
│   │   └── device-manager.test.ts
│   └── integration/
│       └── provisioning.test.ts
├── docs/                     # Documentation
│   └── README.md
├── package.json
├── tsconfig.json
├── Dockerfile
└── README.md
```

### Module Organization

**Group Related Functionality**:

```typescript
// ✅ GOOD - Clear module boundaries
// device-manager/
//   ├── index.ts        (exports)
//   ├── manager.ts      (main class)
//   ├── types.ts        (interfaces)
//   ├── validator.ts    (validation logic)
//   └── utils.ts        (helper functions)

// index.ts - Single export point
export { DeviceManager } from './manager';
export type { Device, DeviceConfig } from './types';

// ❌ BAD - Everything in one file
// device-manager.ts (2000 lines)
```

### Import Organization

**Order Imports by Category**:

```typescript
// ✅ GOOD - Organized imports
// 1. Node.js built-ins
import crypto from 'crypto';
import path from 'path';

// 2. External dependencies
import express from 'express';
import { v4 as uuidv4 } from 'uuid';

// 3. Internal modules (absolute paths)
import { query } from '@/db/connection';
import { DeviceModel } from '@/db/models';

// 4. Local modules (relative paths)
import { validateDevice } from './validators';
import type { Device } from './types';

// ❌ BAD - Random order
import { validateDevice } from './validators';
import express from 'express';
import type { Device } from './types';
import crypto from 'crypto';
```

---

## Error Handling

### Error Handling Principles

1. **Fail Fast**: Validate inputs early, throw errors immediately
2. **Explicit Errors**: Use custom error classes for different error types
3. **Contextual Messages**: Include relevant context in error messages
4. **Logged Errors**: Always log errors with full context
5. **User-Friendly**: Return sanitized error messages to users

### Custom Error Classes

```typescript
// ✅ GOOD - Custom error classes
export class DeviceNotFoundError extends Error {
  constructor(uuid: string) {
    super(`Device not found: ${uuid}`);
    this.name = 'DeviceNotFoundError';
  }
}

export class ProvisioningError extends Error {
  constructor(message: string, public details?: Record<string, any>) {
    super(message);
    this.name = 'ProvisioningError';
  }
}

export class LicenseValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LicenseValidationError';
  }
}

// Usage
throw new DeviceNotFoundError(deviceUuid);
throw new ProvisioningError('Key exchange failed', { keyId, deviceUuid });
```

### Try-Catch Patterns

**Catch Specific Errors First**:

```typescript
// ✅ GOOD - Specific error handling
async function provisionDevice(uuid: string): Promise<Device> {
  try {
    const device = await DeviceModel.getByUuid(uuid);
    
    if (!device) {
      throw new DeviceNotFoundError(uuid);
    }
    
    return await performProvisioning(device);
    
  } catch (error) {
    // Handle known errors specifically
    if (error instanceof DeviceNotFoundError) {
      logger.warn('Device not found during provisioning', { uuid });
      throw error; // Re-throw for caller to handle
    }
    
    if (error instanceof ProvisioningError) {
      logger.error('Provisioning failed', { 
        uuid, 
        error: error.message,
        details: error.details
      });
      throw error;
    }
    
    // Handle unknown errors
    logger.error('Unexpected error during provisioning', {
      uuid,
      error: error.message,
      stack: error.stack
    });
    throw new ProvisioningError('Unexpected error', { originalError: error.message });
  }
}
```

**API Error Responses**:

```typescript
// ✅ GOOD - Consistent error response format
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  // Log the error
  logger.error('Request error', {
    method: req.method,
    path: req.path,
    error: err.message,
    stack: err.stack
  });
  
  // Known error types
  if (err instanceof DeviceNotFoundError) {
    return res.status(404).json({
      error: 'Not Found',
      message: err.message
    });
  }
  
  if (err instanceof LicenseValidationError) {
    return res.status(402).json({
      error: 'Payment Required',
      message: err.message,
      upgradeUrl: process.env.BILLING_UPGRADE_URL
    });
  }
  
  // Unknown errors - don't leak details to user
  res.status(500).json({
    error: 'Internal Server Error',
    message: 'An unexpected error occurred'
  });
});
```

### Validation Errors

**Validate Early, Return Clear Messages**:

```typescript
// ✅ GOOD - Early validation with clear errors
function validateDeviceConfig(config: unknown): DeviceConfig {
  if (!config || typeof config !== 'object') {
    throw new Error('Config must be an object');
  }
  
  const { name, type, apiEndpoint } = config as Record<string, any>;
  
  if (!name || typeof name !== 'string') {
    throw new Error('Device name is required and must be a string');
  }
  
  if (!type || !['edge-gateway', 'sensor-node'].includes(type)) {
    throw new Error('Device type must be "edge-gateway" or "sensor-node"');
  }
  
  if (apiEndpoint && !apiEndpoint.startsWith('https://')) {
    throw new Error('API endpoint must use HTTPS');
  }
  
  return { name, type, apiEndpoint };
}
```

---

## Logging Standards

### Agent Logging (AgentLogger)

**Always Use AgentLogger in Agent Code**:

```typescript
import type { AgentLogger } from '../logging/agent-logger';
import { LogComponents } from '../logging/types';

class DeviceManager {
  constructor(private logger?: AgentLogger) {}
  
  async provision(uuid: string): Promise<void> {
    // ✅ GOOD - Structured logging with component
    this.logger?.infoSync('Starting provisioning', {
      component: LogComponents.provisioning,
      operation: 'provision',
      deviceUuid: uuid
    });
    
    try {
      await this.performProvisioning(uuid);
      
      this.logger?.infoSync('Provisioning successful', {
        component: LogComponents.provisioning,
        deviceUuid: uuid
      });
      
    } catch (error) {
      this.logger?.errorSync('Provisioning failed', {
        component: LogComponents.provisioning,
        deviceUuid: uuid,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }
}
```

**Log Levels** (AgentLogger):
- `debugSync()` - Verbose debugging (set `LOG_LEVEL=debug`)
- `infoSync()` - Informational messages
- `warnSync()` - Warnings (non-fatal issues)
- `errorSync()` - Errors (failures requiring attention)

**Log Components** (use enum):
```typescript
export enum LogComponents {
  agent = 'agent',
  containerManager = 'containerManager',
  stateReconciler = 'stateReconciler',
  cloudSync = 'cloudSync',
  mqtt = 'mqtt',
  provisioning = 'provisioning',
  database = 'database',
  // ... 20+ components
}
```

### API Logging (Winston)

**Use Winston Logger in API/Billing Services**:

```typescript
import logger from './utils/logger';

async function createDevice(data: DeviceData): Promise<Device> {
  logger.info('Creating device', { deviceName: data.name, deviceType: data.type });
  
  try {
    const device = await DeviceModel.create(data);
    
    logger.info('Device created successfully', { 
      deviceId: device.id, 
      deviceUuid: device.uuid 
    });
    
    return device;
    
  } catch (error) {
    logger.error('Failed to create device', { 
      error: error.message, 
      deviceName: data.name 
    });
    throw error;
  }
}
```

**Log Levels** (Winston):
- `logger.debug()` - Verbose debugging
- `logger.info()` - Informational messages
- `logger.warn()` - Warnings
- `logger.error()` - Errors

### Logging Best Practices

**DO**:
- ✅ Include context: `{ component, operation, deviceUuid, error }`
- ✅ Log errors with stack traces: `{ error: err.message, stack: err.stack }`
- ✅ Log operation start/complete: "Starting X", "Completed X"
- ✅ Use appropriate log levels
- ✅ Log structured data (objects), not concatenated strings

**DON'T**:
- ❌ Use `console.log()` in application code (only CLI tools)
- ❌ Log sensitive data: passwords, API keys, tokens
- ❌ Log excessive data in production (huge payloads)
- ❌ Use emojis in log messages
- ❌ Log the same error multiple times

**Examples**:

```typescript
// ❌ BAD - console.log, emoji, no context
console.log('🚀 Device connected');

// ✅ GOOD - Structured logging with context
this.logger?.infoSync('Device connected', {
  component: LogComponents.mqtt,
  deviceUuid: device.uuid,
  ipAddress: device.ip
});

// ❌ BAD - String concatenation, sensitive data
logger.info('User logged in: ' + username + ' with password: ' + password);

// ✅ GOOD - Structured data, no sensitive info
logger.info('User logged in', { 
  username, 
  ipAddress: req.ip,
  userAgent: req.headers['user-agent']
});

// ❌ BAD - Logging same error at multiple levels
logger.warn('Failed to fetch data');
logger.error('Failed to fetch data', { error });

// ✅ GOOD - Log once with appropriate level
logger.error('Failed to fetch data', { 
  error: error.message,
  stack: error.stack,
  operation: 'fetchData'
});
```

---

## Database Patterns

### SQL (PostgreSQL)

**Always Use Parameterized Queries**:

```typescript
// ❌ BAD - SQL injection vulnerability
const query = `SELECT * FROM devices WHERE uuid = '${uuid}'`;
await db.query(query);

// ✅ GOOD - Parameterized query
await db.query(
  'SELECT * FROM devices WHERE uuid = $1',
  [uuid]
);
```

**Consistent Query Style**:

```sql
-- ✅ GOOD - Readable formatting
SELECT 
  d.uuid,
  d.device_name,
  d.is_online,
  s.apps,
  s.updated_at
FROM devices d
LEFT JOIN device_target_state s ON d.uuid = s.device_uuid
WHERE d.is_active = true
  AND d.created_at > $1
ORDER BY d.created_at DESC
LIMIT 100;

-- ❌ BAD - Hard to read
SELECT d.uuid,d.device_name,d.is_online,s.apps,s.updated_at FROM devices d LEFT JOIN device_target_state s ON d.uuid=s.device_uuid WHERE d.is_active=true AND d.created_at>$1 ORDER BY d.created_at DESC LIMIT 100;
```

**Use Transactions for Multi-Step Operations**:

```typescript
// ✅ GOOD - Atomic operation
async function provisionDevice(data: DeviceData): Promise<Device> {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Create device
    const deviceResult = await client.query(
      'INSERT INTO devices (uuid, device_name, device_type) VALUES ($1, $2, $3) RETURNING *',
      [data.uuid, data.name, data.type]
    );
    const device = deviceResult.rows[0];
    
    // Create MQTT user
    await client.query(
      'INSERT INTO mqtt_users (username, password_hash, is_active) VALUES ($1, $2, true)',
      [`device_${device.uuid}`, await bcrypt.hash(password, 10)]
    );
    
    // Create ACLs
    await client.query(
      'INSERT INTO mqtt_acls (username, topic, rw) VALUES ($1, $2, $3)',
      [`device_${device.uuid}`, `agent/${device.uuid}/#`, 3]
    );
    
    await client.query('COMMIT');
    return device;
    
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

### SQLite (Agent)

**Use Knex for Migrations**:

```javascript
// ✅ GOOD - Knex migration
export async function up(knex) {
  await knex.schema.createTable('device', (table) => {
    table.increments('id').primary();
    table.string('uuid').notNullable().unique();
    table.string('deviceName');
    table.string('deviceType');
    table.boolean('provisioned').defaultTo(false);
    table.timestamp('createdAt').defaultTo(knex.fn.now());
    table.timestamp('updatedAt').defaultTo(knex.fn.now());
  });
}

export async function down(knex) {
  await knex.schema.dropTableIfExists('device');
}
```

**Use Model Classes for Data Access**:

```typescript
// ✅ GOOD - Model abstraction
export class DeviceModel {
  private static table = 'device';
  
  static async get(): Promise<Device | null> {
    const device = await models(this.table).first();
    return device || null;
  }
  
  static async update(updates: Partial<Device>): Promise<Device | null> {
    await models(this.table).update({
      ...updates,
      updatedAt: new Date().toISOString()
    });
    return await this.get();
  }
}

// Usage
const device = await DeviceModel.get();
await DeviceModel.update({ provisioned: true });
```

### Neo4j (Digital Twin)

**Use Parameterized Cypher Queries**:

```typescript
// ✅ GOOD - Parameterized Cypher
async function linkDeviceToSpace(deviceUuid: string, spaceId: string): Promise<void> {
  const session = this.driver.session();
  
  try {
    await session.run(
      `MATCH (s:Space {expressId: $spaceId})
       MERGE (d:EdgeDevice {uuid: $deviceUuid})
       MERGE (s)-[:HAS_DEVICE]->(d)`,
      { spaceId, deviceUuid }
    );
  } finally {
    await session.close();
  }
}
```

**Always Close Sessions**:

```typescript
// ✅ GOOD - Session cleanup
async function queryGraph(): Promise<GraphData> {
  const session = this.driver.session();
  
  try {
    const result = await session.run('MATCH (n) RETURN n LIMIT 100');
    return processResults(result);
  } finally {
    await session.close(); // ALWAYS close
  }
}
```

---

## API Design

### RESTful Conventions

**HTTP Methods**:
- `GET` - Retrieve resources (idempotent, no body)
- `POST` - Create resources or execute operations
- `PUT` - Replace entire resource
- `PATCH` - Partial update
- `DELETE` - Remove resource

**URL Structure**:

```
✅ GOOD - RESTful URLs
GET    /api/v1/devices                    - List devices
GET    /api/v1/devices/:uuid              - Get device
POST   /api/v1/devices                    - Create device
PATCH  /api/v1/devices/:uuid              - Update device
DELETE /api/v1/devices/:uuid              - Delete device
GET    /api/v1/devices/:uuid/metrics      - Get device metrics
POST   /api/v1/devices/:uuid/restart      - Action endpoint

❌ BAD - Non-RESTful
GET    /api/v1/getDevices
POST   /api/v1/updateDevice
GET    /api/v1/device-metrics/:uuid
```

### Response Formats

**Consistent Success Responses**:

```typescript
// ✅ GOOD - Consistent format
// Single resource
{
  "device": {
    "uuid": "abc-123",
    "name": "Gateway 1",
    "isOnline": true
  }
}

// Collection
{
  "devices": [
    { "uuid": "abc-123", "name": "Gateway 1" },
    { "uuid": "def-456", "name": "Gateway 2" }
  ],
  "total": 2,
  "page": 1,
  "pageSize": 10
}

// Action result
{
  "success": true,
  "message": "Device restarted successfully"
}
```

**Consistent Error Responses**:

```typescript
// ✅ GOOD - Structured error
{
  "error": "Not Found",
  "message": "Device with UUID abc-123 not found",
  "code": "DEVICE_NOT_FOUND",
  "timestamp": "2025-01-15T10:30:00Z"
}

// Feature limitation error
{
  "error": "Payment Required",
  "message": "Job execution requires Professional plan or higher",
  "upgradeUrl": "https://iotistic.ca/upgrade",
  "currentPlan": "starter",
  "requiredPlan": "professional"
}
```

### HTTP Status Codes

**Use Correct Status Codes**:

```typescript
// Success
200 OK           - Successful GET, PATCH, DELETE
201 Created      - Successful POST (resource created)
204 No Content   - Successful DELETE (no response body)

// Client Errors
400 Bad Request  - Invalid request (validation error)
401 Unauthorized - Missing or invalid authentication
402 Payment Required - Feature requires upgrade
403 Forbidden    - Authenticated but not authorized
404 Not Found    - Resource doesn't exist
409 Conflict     - Resource conflict (e.g., duplicate UUID)
429 Too Many Requests - Rate limited

// Server Errors
500 Internal Server Error - Unexpected error
502 Bad Gateway  - Upstream service error
503 Service Unavailable - Temporary unavailable
```

### Pagination

**Standard Pagination Pattern**:

```typescript
// ✅ GOOD - Offset-based pagination
GET /api/v1/devices?page=1&pageSize=20

Response:
{
  "devices": [...],
  "pagination": {
    "total": 150,
    "page": 1,
    "pageSize": 20,
    "totalPages": 8,
    "hasNext": true,
    "hasPrevious": false
  }
}
```

### API Versioning

**Use URL Versioning**:

```typescript
// ✅ GOOD - Version in URL
const API_VERSION = 'v1';
const API_BASE = `/api/${API_VERSION}`;

app.use(`${API_BASE}/devices`, deviceRoutes);
app.use(`${API_BASE}/metrics`, metricsRoutes);

// Access: /api/v1/devices
```

---

## Testing Standards

### Test Organization

**Mirror Source Structure**:

```
agent/
├── src/
│   ├── provisioning/
│   │   └── device-manager.ts
│   └── sync/
│       └── index.ts
└── test/
    ├── unit/
    │   ├── provisioning/
    │   │   └── device-manager.test.ts
    │   └── sync/
    │       └── index.test.ts
    └── integration/
        └── provisioning.test.ts
```

### Unit Tests (Jest)

**Test Naming Convention**:

```typescript
describe('DeviceManager', () => {
  describe('provision()', () => {
    it('should create device in database', async () => {
      // Test implementation
    });
    
    it('should throw error if provisioning key is invalid', async () => {
      // Test implementation
    });
    
    it('should generate MQTT credentials', async () => {
      // Test implementation
    });
  });
  
  describe('deprovision()', () => {
    it('should remove device from cloud', async () => {
      // Test implementation
    });
  });
});
```

**Test Structure (Arrange-Act-Assert)**:

```typescript
it('should reconcile container state', async () => {
  // Arrange - Set up test data
  const targetState = {
    apps: {
      '1001': {
        appId: 1001,
        services: [{ serviceId: '1', imageName: 'nginx:latest' }]
      }
    }
  };
  const manager = new ContainerManager(mockLogger);
  
  // Act - Execute the code
  await manager.setTargetState(targetState);
  await manager.reconcile();
  
  // Assert - Verify results
  const currentState = await manager.getCurrentState();
  expect(currentState.apps['1001']).toBeDefined();
  expect(currentState.apps['1001'].services).toHaveLength(1);
});
```

**Mock External Dependencies**:

```typescript
// ✅ GOOD - Mock external services
jest.mock('../db/connection', () => ({
  models: jest.fn()
}));

describe('DeviceModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  it('should fetch device from database', async () => {
    const mockDevice = { uuid: 'abc-123', name: 'Test Device' };
    (models as jest.Mock).mockReturnValue({
      first: jest.fn().resolveValue(mockDevice)
    });
    
    const device = await DeviceModel.get();
    
    expect(device).toEqual(mockDevice);
    expect(models).toHaveBeenCalledWith('device');
  });
});
```

### Integration Tests

**Separate from Unit Tests**:

```typescript
// jest.config.unit.js
module.exports = {
  testMatch: ['**/test/unit/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/test/integration/']
};

// jest.config.integration.js
module.exports = {
  testMatch: ['**/test/integration/**/*.test.ts'],
  testTimeout: 30000 // Longer timeout for integration tests
};
```

**Use Test Containers for External Services**:

```typescript
// ✅ GOOD - Test with real database
import { GenericContainer } from 'testcontainers';

describe('PostgreSQL Integration', () => {
  let container: StartedTestContainer;
  let connectionString: string;
  
  beforeAll(async () => {
    container = await new GenericContainer('postgres:16')
      .withEnvironment({ POSTGRES_PASSWORD: 'test' })
      .withExposedPorts(5432)
      .start();
    
    const port = container.getMappedPort(5432);
    connectionString = `postgresql://postgres:test@localhost:${port}/postgres`;
  });
  
  afterAll(async () => {
    await container.stop();
  });
  
  it('should create device in real database', async () => {
    // Test with real PostgreSQL
  });
});
```

### Test Coverage

**Aim for 80%+ Coverage on Critical Paths**:

```bash
# Generate coverage report
npm run test:coverage

# Coverage thresholds in package.json
{
  "jest": {
    "coverageThreshold": {
      "global": {
        "branches": 70,
        "functions": 80,
        "lines": 80,
        "statements": 80
      }
    }
  }
}
```

---

## Documentation

### Code Comments

**When to Comment**:

```typescript
// ✅ GOOD - Explain WHY, not WHAT
// Use exponential backoff to avoid overwhelming API during outages
const delay = Math.min(baseDelay * Math.pow(2, retryCount), maxDelay);

// ✅ GOOD - Document complex algorithms
/**
 * Calculate anomaly score using MAD (Median Absolute Deviation)
 * MAD is more robust to outliers than standard deviation
 * Formula: MAD = median(|Xi - median(X)|)
 */
function calculateMAD(values: number[]): number {
  // Implementation
}

// ❌ BAD - Obvious comment
// Set the device name
device.name = 'Gateway 1';

// ❌ BAD - Commented-out code (delete instead)
// const oldMethod = () => { ... };
```

### JSDoc for Public APIs

**Document Function Parameters and Return Values**:

```typescript
/**
 * Provision a new device with the cloud API
 * 
 * @param provisioningKey - Pre-shared provisioning key from dashboard
 * @param deviceName - Human-readable device name
 * @param deviceType - Device type (edge-gateway, sensor-node)
 * @returns Device UUID and MQTT credentials
 * @throws {ProvisioningError} If provisioning key is invalid or expired
 * @throws {DeviceLimitError} If device limit reached for current plan
 * 
 * @example
 * ```typescript
 * const result = await provisionDevice('key123', 'Factory Gateway', 'edge-gateway');
 * console.log(result.uuid); // 'abc-123-def'
 * ```
 */
async function provisionDevice(
  provisioningKey: string,
  deviceName: string,
  deviceType: string
): Promise<ProvisioningResult> {
  // Implementation
}
```

### README Files

**Every Service Should Have a README**:

```markdown
# Service Name

Brief description of what this service does.

## Features

- Feature 1
- Feature 2
- Feature 3

## Quick Start

```bash
# Install dependencies
npm install

# Run in development
npm run dev

# Build for production
npm run build
npm start
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `DATABASE_URL` | - | PostgreSQL connection string |

## API Endpoints

### Devices

- `GET /api/v1/devices` - List devices
- `POST /api/v1/devices` - Create device

## Architecture

Brief overview of internal architecture.

## Development

- `npm run dev` - Development mode
- `npm test` - Run tests
- `npm run build` - Build for production

## License

MIT
```

---

## Security Practices

### Authentication & Authorization

**Never Store Plain-Text Passwords**:

```typescript
// ✅ GOOD - Hash passwords with bcrypt
import bcrypt from 'bcrypt';

async function createUser(username: string, password: string): Promise<void> {
  const passwordHash = await bcrypt.hash(password, 10); // 10 rounds
  await db.query(
    'INSERT INTO users (username, password_hash) VALUES ($1, $2)',
    [username, passwordHash]
  );
}

async function verifyPassword(username: string, password: string): Promise<boolean> {
  const result = await db.query(
    'SELECT password_hash FROM users WHERE username = $1',
    [username]
  );
  
  if (result.rows.length === 0) return false;
  
  return await bcrypt.compare(password, result.rows[0].password_hash);
}
```

**Use JWT for Stateless Auth**:

```typescript
// ✅ GOOD - JWT validation with public key
import jwt from 'jsonwebtoken';

function validateLicense(licenseKey: string): LicenseData {
  try {
    const decoded = jwt.verify(licenseKey, publicKey, {
      algorithms: ['RS256']
    });
    return decoded as LicenseData;
  } catch (error) {
    throw new LicenseValidationError('Invalid license key');
  }
}
```

### Input Validation

**Validate All User Input**:

```typescript
// ✅ GOOD - Strict validation
function validateDeviceUuid(uuid: string): void {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  if (!uuidRegex.test(uuid)) {
    throw new Error('Invalid UUID format');
  }
}

function validateEmail(email: string): void {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(email)) {
    throw new Error('Invalid email format');
  }
}

// ❌ BAD - No validation
function processDevice(uuid: string) {
  // Directly use uuid without validation
}
```

### Sensitive Data Handling

**Never Log Sensitive Data**:

```typescript
// ❌ BAD - Logs password
logger.info('User login', { username, password });

// ✅ GOOD - Omit sensitive fields
logger.info('User login', { username, ipAddress: req.ip });

// ✅ GOOD - Redact sensitive fields in objects
function sanitizeForLogging(obj: any): any {
  const sensitiveFields = ['password', 'apiKey', 'token', 'secret'];
  const sanitized = { ...obj };
  
  for (const field of sensitiveFields) {
    if (field in sanitized) {
      sanitized[field] = '[REDACTED]';
    }
  }
  
  return sanitized;
}

logger.info('Request data', sanitizeForLogging(requestBody));
```

**Encrypt Sensitive Data at Rest**:

```typescript
// ✅ GOOD - Encrypt sensitive config
import crypto from 'crypto';

function encryptData(data: string, key: Buffer): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return iv.toString('hex') + ':' + encrypted;
}

function decryptData(encryptedData: string, key: Buffer): string {
  const [ivHex, encrypted] = encryptedData.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
```

### Rate Limiting

**Protect APIs with Rate Limiting**:

```typescript
import rateLimit from 'express-rate-limit';

// ✅ GOOD - Rate limit sensitive endpoints
const provisioningLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: 'Too many provisioning attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/provisioning/register', provisioningLimiter, async (req, res) => {
  // Handle provisioning
});
```

---

## Performance Guidelines

### Database Optimization

**Use Indexes on Frequently Queried Columns**:

```sql
-- ✅ GOOD - Indexes for common queries
CREATE INDEX idx_devices_uuid ON devices(uuid);
CREATE INDEX idx_devices_is_active ON devices(is_active);
CREATE INDEX idx_device_metrics_device_uuid ON device_metrics(device_uuid);
CREATE INDEX idx_device_metrics_timestamp ON device_metrics(timestamp);
CREATE INDEX idx_mqtt_acls_username ON mqtt_acls(username);

-- Composite index for common WHERE clauses
CREATE INDEX idx_devices_active_online ON devices(is_active, is_online);
```

**Avoid N+1 Queries**:

```typescript
// ❌ BAD - N+1 query (one query per device)
const devices = await db.query('SELECT * FROM devices');
for (const device of devices.rows) {
  const metrics = await db.query(
    'SELECT * FROM device_metrics WHERE device_uuid = $1',
    [device.uuid]
  );
  device.metrics = metrics.rows;
}

// ✅ GOOD - Single JOIN query
const result = await db.query(`
  SELECT 
    d.*,
    json_agg(m.*) as metrics
  FROM devices d
  LEFT JOIN device_metrics m ON d.uuid = m.device_uuid
  GROUP BY d.id
`);
```

**Use Pagination for Large Results**:

```typescript
// ✅ GOOD - Paginated query
async function listDevices(page: number = 1, pageSize: number = 20) {
  const offset = (page - 1) * pageSize;
  
  const result = await db.query(
    'SELECT * FROM devices ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [pageSize, offset]
  );
  
  const countResult = await db.query('SELECT COUNT(*) FROM devices');
  
  return {
    devices: result.rows,
    total: parseInt(countResult.rows[0].count),
    page,
    pageSize,
    totalPages: Math.ceil(countResult.rows[0].count / pageSize)
  };
}
```

### Caching

**Cache Expensive Operations**:

```typescript
// ✅ GOOD - Cache license validation
class LicenseValidator {
  private licenseData: LicenseData | null = null;
  
  async init(): Promise<void> {
    // Validate and cache on startup
    this.licenseData = await this.validateLicense(licenseKey);
    
    // Cache in database for offline mode
    await SystemConfigModel.set('license_data', this.licenseData);
  }
  
  checkFeatureAccess(feature: string): boolean {
    // Return cached data (no re-validation on every request)
    return this.licenseData?.features[feature] === true;
  }
}
```

### Async Operations

**Don't Block the Event Loop**:

```typescript
// ❌ BAD - Blocking synchronous operation
const data = fs.readFileSync('/large/file.json', 'utf8');
const parsed = JSON.parse(data);

// ✅ GOOD - Non-blocking async operation
const data = await fs.promises.readFile('/large/file.json', 'utf8');
const parsed = JSON.parse(data);

// ✅ GOOD - Stream for large files
const stream = fs.createReadStream('/large/file.json');
const parser = JSONStream.parse('*');
stream.pipe(parser);
```

---

## Git Workflow

### Commit Messages

**Use Conventional Commits**:

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Types**:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `refactor:` - Code refactoring (no behavior change)
- `perf:` - Performance improvements
- `test:` - Add or update tests
- `chore:` - Maintenance tasks (dependencies, build)

**Examples**:

```
✅ GOOD
feat(agent): add container state management (running/stopped/paused)

Implemented declarative container state control using Docker pause/unpause commands.
Supports all 6 state transitions with proper error handling.

Closes #123

✅ GOOD
fix(api): prevent duplicate device provisioning

Added unique constraint on devices.uuid and transaction wrapper to prevent
race conditions during concurrent provisioning attempts.

Fixes #456

❌ BAD
update stuff

❌ BAD
Fixed bug
```

### Branch Naming

**Use Descriptive Branch Names**:

```
<type>/<short-description>

Examples:
✅ feature/container-state-management
✅ fix/duplicate-device-provisioning
✅ docs/api-documentation
✅ refactor/license-validator
✅ hotfix/mqtt-connection-leak

❌ update
❌ changes
❌ john-branch
```

### Pull Requests

**PR Title and Description**:

```markdown
## Summary
Brief description of changes (1-2 sentences)

## Changes
- Added container state field to service config
- Implemented pause/unpause Docker commands
- Updated state reconciliation logic

## Testing
- Unit tests for all state transitions
- Integration tests with real Docker daemon
- Verified on Raspberry Pi 4 (arm64)

## Breaking Changes
- Target state schema now requires `state` field (defaults to "running")

## Checklist
- [x] Tests pass (`npm test`)
- [x] No linting errors (`npm run lint`)
- [x] Documentation updated
- [x] CHANGELOG.md updated
```

---

## Code Review Checklist

### Before Submitting PR

**Self-Review Checklist**:
- [ ] Code follows TypeScript strict mode
- [ ] No `console.log()` in production code
- [ ] All functions have explicit return types
- [ ] Errors are handled with try-catch
- [ ] All async functions use async/await
- [ ] Logging uses structured format with context
- [ ] No sensitive data in logs
- [ ] Database queries are parameterized
- [ ] Tests are included for new features
- [ ] Documentation is updated
- [ ] No emojis in code/logs/docs

### Reviewer Checklist

**Functionality**:
- [ ] Code does what it claims to do
- [ ] Edge cases are handled
- [ ] Error handling is comprehensive

**Code Quality**:
- [ ] Code is readable and well-organized
- [ ] Functions are small and focused
- [ ] No code duplication
- [ ] Naming is clear and consistent

**Security**:
- [ ] Input validation is present
- [ ] No SQL injection vulnerabilities
- [ ] Sensitive data is not logged
- [ ] Authentication/authorization is correct

**Performance**:
- [ ] No obvious performance issues
- [ ] Database queries are efficient
- [ ] No N+1 query problems

**Testing**:
- [ ] Tests cover new functionality
- [ ] Tests are meaningful (not just 100% coverage)
- [ ] Integration tests for critical paths

---

## Quick Reference

### Common Patterns

**Service Constructor Pattern**:
```typescript
class MyService {
  constructor(private logger?: AgentLogger) {}
  
  async doWork(): Promise<void> {
    this.logger?.infoSync('Starting work', {
      component: LogComponents.myService
    });
    
    try {
      // Work here
    } catch (error) {
      this.logger?.errorSync('Work failed', {
        component: LogComponents.myService,
        error: error.message
      });
      throw error;
    }
  }
}
```

**Express Route Pattern**:
```typescript
router.post('/devices', async (req, res) => {
  try {
    const device = await DeviceModel.create(req.body);
    
    logger.info('Device created', { deviceUuid: device.uuid });
    
    res.status(201).json({ device });
  } catch (error) {
    logger.error('Failed to create device', { error: error.message });
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
```

**Database Transaction Pattern**:
```typescript
async function atomicOperation(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Multiple queries
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
```

---

## Additional Resources

- **TypeScript Handbook**: https://www.typescriptlang.org/docs/handbook/
- **Node.js Best Practices**: https://github.com/goldbergyoni/nodebestpractices
- **SQL Style Guide**: https://www.sqlstyle.guide/
- **Conventional Commits**: https://www.conventionalcommits.org/

---

**Last Updated**: 2025-01-15

**Maintainers**: Review these standards quarterly and update as platform evolves.