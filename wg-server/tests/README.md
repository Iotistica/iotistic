# WireGuard Server - Testing Guide

## Running Tests

### Install Dependencies

```bash
cd wg-server
npm install
```

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Coverage Report

Coverage reports are generated automatically when running `npm test`. View the HTML report:

```bash
# On Windows
start coverage/lcov-report/index.html

# On Linux/Mac
open coverage/lcov-report/index.html
```

## Test Structure

```
tests/
├── wireguard.test.ts      # WireGuardManager unit tests
├── peer-manager.test.ts   # PeerManager unit tests
└── server.test.ts         # API route tests
```

## Test Coverage

The test suite covers:

### WireGuardManager (`wireguard.test.ts`)
- ✅ Key pair generation
- ✅ Preshared key generation
- ✅ Adding peers to interface
- ✅ Removing peers from interface
- ✅ Client config generation
- ✅ Interface status checks
- ✅ Interface existence checks

### PeerManager (`peer-manager.test.ts`)
- ✅ Creating peers with/without device info
- ✅ Deleting peers and IP cleanup
- ✅ Getting peer by ID
- ✅ Generating WireGuard configs
- ✅ Generating QR codes
- ✅ Listing all peers
- ✅ IP allocation from pool
- ✅ Error handling (no IPs available, peer not found)

### API Routes (`server.test.ts`)
- ✅ Health check endpoint
- ✅ Create peer (POST /api/peers)
- ✅ Get peer (GET /api/peers/:peerId)
- ✅ Delete peer (DELETE /api/peers/:peerId)
- ✅ Get peer config (GET /api/peers/:peerId/config)
- ✅ Get peer QR code (GET /api/peers/:peerId/qr)
- ✅ List peers (GET /api/peers)
- ✅ Error responses (404, 500)

## Mocking Strategy

Tests use Jest mocks for:
- **Database**: `pg` module mocked to avoid real DB connections
- **WireGuard commands**: `child_process.exec` mocked to avoid system calls
- **QR Code generation**: `qrcode` module mocked

## Example Test Run

```bash
$ npm test

PASS  tests/wireguard.test.ts
  WireGuardManager
    generateKeyPair
      ✓ should generate a valid key pair (5 ms)
      ✓ should handle key generation errors (2 ms)
    generatePresharedKey
      ✓ should generate a preshared key (1 ms)
    addPeer
      ✓ should add a peer to the interface (2 ms)
      ✓ should add peer without optional parameters (1 ms)
    removePeer
      ✓ should remove a peer from the interface (1 ms)
    generateClientConfig
      ✓ should generate a valid client configuration (1 ms)
      ✓ should generate config with default AllowedIPs (1 ms)
      ✓ should generate config without optional parameters
    getInterfaceStatus
      ✓ should get interface status (1 ms)
    interfaceExists
      ✓ should return true if interface exists (1 ms)
      ✓ should return false if interface does not exist

PASS  tests/peer-manager.test.ts
PASS  tests/server.test.ts

Test Suites: 3 passed, 3 total
Tests:       35 passed, 35 total
Snapshots:   0 total
Time:        2.456 s

Coverage summary:
-----------------------|---------|----------|---------|---------|
File                   | % Stmts | % Branch | % Funcs | % Lines |
-----------------------|---------|----------|---------|---------|
All files              |   94.12 |    88.46 |   95.83 |   94.74 |
 wireguard.ts          |   95.45 |    90.00 |  100.00 |   96.00 |
 peer-manager.ts       |   93.33 |    87.50 |   92.31 |   94.12 |
 db.ts                 |   90.00 |    85.71 |   90.00 |   90.91 |
-----------------------|---------|----------|---------|---------|
```

## CI/CD Integration

Add to your CI pipeline:

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: cd wg-server && npm install
      - run: cd wg-server && npm test
```

## Debugging Tests

Run a single test file:
```bash
npm test -- wireguard.test.ts
```

Run tests matching a pattern:
```bash
npm test -- --testNamePattern="should generate"
```

Enable verbose output:
```bash
npm test -- --verbose
```
