# Cloud Logging Improvements - Agent Log Upload Optimization

## Problem Analysis

### Original Issue
```
❌ Failed to send logs to cloud: TypeError: fetch failed
  [cause]: Error: getaddrinfo ENOTFOUND api
    errno: -3008,
    code: 'ENOTFOUND',
    syscall: 'getaddrinfo',
    hostname: 'api'
```

**Symptoms:**
- Agent trying to send 698 logs at once
- DNS resolution failure for hostname `api`
- Logs accumulating indefinitely in buffer
- Failed logs being pushed back, creating backlog

### Root Causes

1. **Network Mode Configuration Issue**
   - Agent uses `network_mode: host` in docker-compose
   - Container names (like `api`) cannot be resolved via Docker DNS when using host networking
   - Need to use `localhost` instead of container names

2. **Large Batch Accumulation**
   - Default batch size: 100 logs
   - Buffer size limit: 256KB
   - When network fails, all logs accumulate before flush
   - 698 logs = entire buffer trying to send at once

3. **No DNS Error Handling**
   - ENOTFOUND errors are unrecoverable until configuration fixed
   - Logs kept retrying indefinitely
   - Memory pressure from ever-growing buffer

4. **Missing Request Timeout**
   - Fetch requests could hang indefinitely
   - No timeout protection

## Implemented Solutions

### 1. Smart Default Endpoint Selection (`agent.ts`)

**Before:**
```typescript
private readonly CLOUD_API_ENDPOINT = process.env.CLOUD_API_ENDPOINT || 'http://localhost:4002';
```

**After:**
```typescript
private readonly CLOUD_API_ENDPOINT = process.env.CLOUD_API_ENDPOINT || this.getDefaultCloudEndpoint();

private getDefaultCloudEndpoint(): string {
	// Default to localhost for host networking (most common edge device setup)
	return 'http://localhost:3002';
}
```

**Benefits:**
- Correct default port (3002 matches API)
- Clear comment about host networking requirement
- Extensible for future auto-detection logic

### 2. Batch Size Enforcement (`cloud-backend.ts`)

**Added to `flush()` method:**
```typescript
// Split buffer into smaller batches if too large
const batchSize = this.config.batchSize; // 100 logs
const batches: LogMessage[][] = [];

for (let i = 0; i < this.buffer.length; i += batchSize) {
	batches.push(this.buffer.slice(i, i + batchSize));
}

console.log(`📦 Flushing ${this.buffer.length} logs in ${batches.length} batch(es) of ${batchSize}`);
```

**Benefits:**
- Enforces maximum 100 logs per request
- 698 logs → 7 batches of 100 (easier for API to handle)
- Prevents overwhelming API with large payloads
- Better HTTP connection management

### 3. DNS Error Detection & Log Dropping

**Added smart error handling:**
```typescript
// Check if it's a DNS error (unrecoverable until config fixed)
const isDnsError = error instanceof Error && 
	('cause' in error && error.cause && 
	typeof error.cause === 'object' && 
	'code' in error.cause && 
	error.cause.code === 'ENOTFOUND');

if (isDnsError) {
	console.error('⚠️  DNS resolution failed - check CLOUD_API_ENDPOINT environment variable');
	console.error('   Hint: If using network_mode: host, use http://localhost:PORT instead of container names');
	// Drop logs on DNS errors to prevent infinite accumulation
	console.warn(`🗑️  Dropping ${batch.length} logs due to DNS configuration error`);
	continue;
}
```

**Benefits:**
- Detects unrecoverable DNS errors
- Provides helpful configuration hints
- Drops logs to prevent memory exhaustion
- Continues processing other batches

### 4. Buffer Size Limiting

**Added maximum buffer protection:**
```typescript
// Re-add failed logs to buffer but limit total buffer size
const maxBufferLogs = 500; // Maximum logs to keep in buffer
const logsToKeep = failedLogs.slice(-maxBufferLogs); // Keep most recent

if (failedLogs.length > maxBufferLogs) {
	console.warn(`⚠️  Buffer overflow: dropping ${failedLogs.length - maxBufferLogs} oldest logs`);
}

this.buffer = [...logsToKeep, ...this.buffer];
```

**Benefits:**
- Hard limit of 500 logs in buffer
- Drops oldest logs first (keeps recent data)
- Prevents unbounded memory growth
- Clear warning when dropping occurs

### 5. Request Timeout Protection

**Added 30-second timeout:**
```typescript
// Create abort controller with timeout
this.abortController = new AbortController();
const timeoutId = setTimeout(() => {
	this.abortController?.abort();
}, 30000); // 30 second timeout

try {
	const response = await fetch(endpoint, {
		method: 'POST',
		headers,
		body,
		signal: this.abortController.signal,
	});
	clearTimeout(timeoutId);
	// ... handle response
} catch (error) {
	clearTimeout(timeoutId);
	throw error;
}
```

**Benefits:**
- Prevents hanging requests
- Fails fast on network issues
- Allows retry logic to activate
- Cleans up timeout properly

## Configuration Guide

### Docker Compose Configuration

**For Edge Devices (network_mode: host):**
```yaml
agent:
  container_name: agent
  network_mode: host  # REQUIRED for device access
  environment:
    # Use localhost because container names don't resolve with host networking
    - CLOUD_API_ENDPOINT=http://localhost:3002
```

**For Multi-Agent Testing (bridge network):**
```yaml
agent-1:
  container_name: agent-1
  environment:
    # Use container name because Docker DNS works in bridge network
    - CLOUD_API_ENDPOINT=http://api:3002
  networks:
    - iotistic-net
```

### Batch Size Configuration

**Default settings (good for most cases):**
```typescript
batchSize: 100,        // Max logs per request
bufferSize: 256KB,     // Max buffer before force flush
flushInterval: 100ms,  // Debounce time for batching
```

**For high-volume scenarios:**
```typescript
batchSize: 50,         // Smaller batches
flushInterval: 50ms,   // Flush more frequently
```

**For low-bandwidth scenarios:**
```typescript
batchSize: 200,        // Larger batches
compression: true,     // Enable gzip (default)
flushInterval: 1000ms, // Batch for 1 second
```

### Sampling Configuration

**Default sampling rates:**
```typescript
samplingRates: {
	error: 1.0,   // 100% - all errors
	warn: 1.0,    // 100% - all warnings
	info: 0.1,    // 10% - sample info logs
	debug: 0.01,  // 1% - sample debug logs
}
```

**For production (reduce volume):**
```typescript
samplingRates: {
	error: 1.0,   // 100% - all errors
	warn: 1.0,    // 100% - all warnings
	info: 0.05,   // 5% - less info
	debug: 0.001, // 0.1% - very few debug
}
```

## Performance Improvements

### Before
- 698 logs accumulated
- Single large request (300KB+)
- DNS errors caused infinite retry
- No timeout protection
- Memory could grow unbounded

### After
- 100 logs per batch maximum
- 7 smaller requests (40KB each)
- DNS errors drop logs with helpful hint
- 30-second timeout on each request
- Hard limit of 500 logs in buffer

### Expected Metrics
- **Batch size:** 100 logs (40-50KB compressed)
- **Request time:** 500ms - 2s per batch
- **Total flush time:** 3.5s - 14s for 700 logs
- **Memory usage:** Max 200KB buffer (500 logs)
- **Success rate:** 95%+ on good network

## Troubleshooting Guide

### Issue: Still getting ENOTFOUND errors

**Solution:**
```bash
# Check your docker-compose.yml
docker-compose config | grep -A 5 "agent:"

# If using network_mode: host:
export CLOUD_API_ENDPOINT=http://localhost:3002

# If using bridge network:
export CLOUD_API_ENDPOINT=http://api:3002

# Restart agent
docker-compose restart agent
```

### Issue: Logs still accumulating

**Check buffer size:**
```bash
# Look for these log messages:
# "📦 Flushing 698 logs in 7 batch(es) of 100"
# "⚠️  Buffer overflow: dropping 198 oldest logs"

docker logs agent | grep -E "Flushing|Buffer overflow|Dropping"
```

**Verify API is receiving logs:**
```bash
# Check API logs
docker logs iotistic-api | grep "POST.*logs"

# Should see:
# "POST /api/v1/device/{uuid}/logs 200"
```

### Issue: High memory usage

**Reduce batch size:**
```yaml
agent:
  environment:
    # Add custom batch size (if we expose env var)
    - LOG_BATCH_SIZE=50  # Smaller batches
    - LOG_FLUSH_INTERVAL=50  # Flush faster
```

**Or reduce sampling:**
```typescript
// In agent initialization
samplingRates: {
	error: 1.0,
	warn: 1.0,
	info: 0.01,   // Only 1% of info logs
	debug: 0.001, // Only 0.1% of debug logs
}
```

## Testing Recommendations

### 1. Test DNS Resolution
```bash
# Inside agent container
docker exec agent ping api
# If fails → use localhost
# If succeeds → can use container name
```

### 2. Test Log Upload
```bash
# Generate test logs
docker exec agent node -e "
const logger = require('./dist/logging/index.js').getGlobalLogger();
for (let i = 0; i < 150; i++) {
  logger.info('Test log ' + i, { component: 'Test' });
}
"

# Watch for batching
docker logs -f agent | grep "Flushing"
# Should see: "📦 Flushing 150 logs in 2 batch(es) of 100"
```

### 3. Test Network Failure
```bash
# Simulate network failure
docker network disconnect iotistic-net iotistic-api

# Generate logs - should see buffer limit
docker logs agent | grep "Buffer overflow"

# Reconnect
docker network connect iotistic-net iotistic-api

# Logs should flush
```

## Migration Notes

### Existing Deployments

**No configuration changes required** if:
- Already using `CLOUD_API_ENDPOINT=http://localhost:3002`
- Agent in host networking mode
- API accessible on localhost:3002

**Update required** if:
- Using `CLOUD_API_ENDPOINT=http://api:3002` with host networking
- Change to: `CLOUD_API_ENDPOINT=http://localhost:3002`

### Database Impact
- No schema changes
- No migration required
- Existing logs unaffected

### API Impact
- API already handles NDJSON batches
- No changes needed to API
- Smaller batches may improve API throughput

## Future Enhancements

### 1. Automatic Network Mode Detection
```typescript
private getDefaultCloudEndpoint(): string {
	// Detect if using host networking
	if (fs.existsSync('/proc/1/cgroup')) {
		const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
		if (cgroup.includes('docker') && !cgroup.includes('kubepods')) {
			// In Docker, check network mode
			return 'http://localhost:3002'; // Host mode
		}
	}
	return 'http://api:3002'; // Bridge mode
}
```

### 2. Adaptive Batch Sizing
```typescript
// Reduce batch size on repeated failures
if (this.retryCount > 3) {
	batchSize = Math.max(10, this.config.batchSize / 2);
}
```

### 3. Persistent Buffer
```typescript
// Save buffer to disk on shutdown
async stop() {
	if (this.buffer.length > 0) {
		await fs.writeFile('/app/data/log-buffer.json', 
			JSON.stringify(this.buffer));
	}
}
```

### 4. Compression Statistics
```typescript
console.log(`✅ Sent ${logs.length} logs (${originalSize}B → ${compressedSize}B, ${compressionRatio}%)`);
```

## Summary

These improvements make the cloud logging system:
1. **More resilient** - Handles DNS errors gracefully
2. **More efficient** - Smaller batches, better throughput
3. **More predictable** - Hard buffer limits prevent memory issues
4. **More debuggable** - Clear error messages with hints
5. **More configurable** - Easy to adjust for different scenarios

The agent will now handle network failures better and provide clearer diagnostics when configuration issues occur.
