# Refactoring sync-state.ts for Testability

## Problem

The original `sync-state.ts` had several testability issues:
1. **Direct `fetch()` usage** - Hard to mock without stubbing globals
2. **Private methods** - Can't test in isolation  
3. **Synchronous `getDeviceInfo()`** - Tests expected async
4. **Tight coupling** - Hard to inject test dependencies

## Solution: Dependency Injection Pattern

### 1. HTTP Client Abstraction (`src/sync-state/http-client.ts`)

Created an `HttpClient` interface to abstract network calls:

```typescript
export interface HttpClient {
  get<T>(url: string, options?: {...}): Promise<HttpResponse<T>>;
  post<T>(url: string, body: any, options?: {...}): Promise<HttpResponse<T>>;
}
```

**Benefits**:
- ✅ Easy to mock in tests
- ✅ No global `fetch` stubbing needed
- ✅ Type-safe responses
- ✅ Can add retry logic, caching, etc. in one place

### 2. Constructor Injection

Updated `ApiBinder` constructor to accept `HttpClient`:

```typescript
constructor(
  stateReconciler: StateReconciler,
  deviceManager: DeviceManager,
  config: ApiBinderConfig,
  logger?: AgentLogger,
  sensorPublish?: any,
  protocolAdapters?: any,
  mqttManager?: any,
  httpClient?: HttpClient  // NEW: Injectable for tests
) {
  this.httpClient = httpClient || new FetchHttpClient(); // Default to real impl
}
```

**Benefits**:
- ✅ Production code uses real `FetchHttpClient`
- ✅ Tests inject `MockHttpClient`
- ✅ Backwards compatible (optional parameter)

### 3. Updated `pollTargetState()` Method

Changed from:
```typescript
const response = await fetch(endpoint, {
  method: 'GET',
  headers: {...},
  signal: AbortSignal.timeout(this.config.apiTimeout)
});
```

To:
```typescript
const response = await this.httpClient.get(endpoint, {
  headers: {...},
  timeout: this.config.apiTimeout
});
```

**Benefits**:
- ✅ Cleaner API
- ✅ Consistent timeout handling
- ✅ Fully mockable

### 4. Mock HTTP Client for Tests (`test/helpers/mock-http-client.ts`)

Created `MockHttpClient` with helper methods:

```typescript
class MockHttpClient implements HttpClient {
  mockGetSuccess(body, options?) // Mock successful response
  mockGetNotModified()            // Mock 304 response
  mockGetError(status, message)   // Mock error response
  mockTimeout()                   // Mock timeout error
  mockNetworkError(message)       // Mock network failure
}
```

**Benefits**:
- ✅ Readable test setup
- ✅ No complex Sinon stub chains
- ✅ Reusable across tests

## Test Example (Before vs After)

### Before (Global fetch stubbing):
```typescript
const fetchStub = stub(global, 'fetch');
fetchStub.resolves({
  ok: true,
  status: 200,
  json: async () => targetState,
  headers: { get: () => null }
} as unknown as Response);
```

### After (Dependency injection):
```typescript
const mockHttpClient = new MockHttpClient();
mockHttpClient.mockGetSuccess(targetState);

const apiBinder = new ApiBinder(
  stateReconciler,
  deviceManager,
  config,
  undefined, undefined, undefined, undefined,
  mockHttpClient // Inject mock!
);
```

## Next Steps

1. ✅ Created `HttpClient` interface
2. ✅ Implemented `FetchHttpClient` (real implementation)
3. ✅ Created `MockHttpClient` for tests
4. ✅ Updated `ApiBinder` constructor to accept `HttpClient`
5. ✅ Refactored `pollTargetState()` to use `httpClient`
6. ⚠️ **TODO**: Update all test cases to use `MockHttpClient`
7. **TODO**: Refactor `reportCurrentState()` to use `httpClient.post()`
8. **TODO**: Update production code that creates `ApiBinder` instances

## Files Changed

- `src/sync-state/http-client.ts` - NEW: HTTP client interface
- `src/sync-state.ts` - Updated: Constructor + pollTargetState method
- `test/helpers/mock-http-client.ts` - NEW: Test helper
- `test/unit/sync-state/poll-target-state.unit.spec.ts` - Updated: First 7 tests refactored

## Migration Guide

### For Production Code:
No changes needed! The `HttpClient` parameter is optional and defaults to `FetchHttpClient`.

### For Test Code:
```typescript
// Old way (stubbing global fetch)
const fetchStub = stub(global, 'fetch');

// New way (dependency injection)
const mockHttpClient = new MockHttpClient();
const apiBinder = new ApiBinder(
  ...,
  mockHttpClient // Last parameter
);
```

## Benefits Summary

1. **Testability**: Mock HTTP layer without touching globals
2. **Maintainability**: HTTP logic centralized in one place
3. **Flexibility**: Easy to add features (retry, caching, metrics)
4. **Type Safety**: Full TypeScript support with generics
5. **Isolation**: Tests run faster without real network calls
6. **Reliability**: No global state pollution between tests

## Pattern: Test Doubles

This refactoring follows the "Test Double" pattern:
- **Stub**: `MockHttpClient` returns pre-configured responses
- **Spy**: `getStub.callCount` verifies method calls
- **Fake**: Could add `FakeHttpClient` that simulates latency

Similar to how Balena Supervisor uses dependency injection for Docker API mocking.
