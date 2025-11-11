# VPN Routing Strategy: Hybrid Approach

## Overview

The agent uses an **intelligent routing system** that prefers VPN but gracefully falls back to public internet. This provides the best of both worlds:

- **Security**: Private VPN tunnel when available
- **Reliability**: Public internet fallback if VPN fails
- **Performance**: Local network optimization via VPN

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│ Agent (Edge Device)                                      │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  NetworkRouteManager                                     │
│    │                                                      │
│    ├─ Check VPN available?                              │
│    │   └─ wg show wg0                                   │
│    │                                                      │
│    └─ Select best route:                                │
│        ├─ VPN: http://10.8.0.1:3002 (preferred)        │
│        └─ Public: https://api.iotistic.ca (fallback)   │
│                                                           │
└──────────────────────────────────────────────────────────┘
                    │
        ┌───────────┴────────────┐
        │                        │
        v                        v
┌──────────────┐        ┌──────────────────┐
│  VPN Route   │        │  Public Route    │
│  (Private)   │        │  (Internet)      │
├──────────────┤        ├──────────────────┤
│ 10.8.0.1     │        │ Public IP        │
│ Port: 3002   │        │ Port: 443 (TLS)  │
│ No TLS       │        │ TLS Required     │
│ Fast         │        │ Slower           │
└──────────────┘        └──────────────────┘
        │                        │
        └────────┬───────────────┘
                 │
                 v
        ┌────────────────┐
        │  Cloud API     │
        └────────────────┘
```

## Routing Decision Logic

```typescript
async function getApiEndpoint(): Promise<string> {
  const routeManager = new NetworkRouteManager();
  
  const route = await routeManager.getEndpoint({
    publicEndpoint: 'https://api.iotistic.ca',
    vpnEndpoint: 'http://10.8.0.1:3002',
    preferVpn: true  // Default behavior
  });
  
  // route.usingVpn = true/false
  // route.endpoint = actual URL to use
  // route.reason = why this route was chosen
  
  return route.endpoint;
}
```

### Decision Tree

```
1. Is VPN endpoint configured?
   NO  → Use public endpoint
   YES → Continue to step 2

2. Is VPN tunnel up? (wg show wg0)
   NO  → Use public endpoint (log warning)
   YES → Continue to step 3

3. Is handshake recent? (< 5 minutes)
   NO  → Use public endpoint (VPN stale)
   YES → Continue to step 4

4. Does config prefer VPN?
   NO  → Use public endpoint
   YES → Use VPN endpoint ✅
```

## Use Cases

### Scenario 1: Normal Operation (VPN Preferred)

```typescript
// Agent startup
const routeManager = new NetworkRouteManager(logger);

// First API call
const route = await routeManager.getEndpoint({
  publicEndpoint: 'https://api.iotistic.ca',
  vpnEndpoint: 'http://10.8.0.1:3002',
});

console.log(route);
// {
//   usingVpn: true,
//   endpoint: 'http://10.8.0.1:3002',
//   vpnAvailable: true,
//   reason: 'VPN tunnel active'
// }

// Make API call using selected endpoint
const response = await fetch(`${route.endpoint}/api/v1/device/state`);
```

### Scenario 2: VPN Failure (Automatic Fallback)

```typescript
// VPN goes down (network issue, server restart, etc.)
const route = await routeManager.getEndpoint({
  publicEndpoint: 'https://api.iotistic.ca',
  vpnEndpoint: 'http://10.8.0.1:3002',
});

console.log(route);
// {
//   usingVpn: false,
//   endpoint: 'https://api.iotistic.ca',
//   vpnAvailable: false,
//   reason: 'VPN tunnel not established'
// }

// Agent continues working over public internet
// Logs warning: "VPN not available, using public endpoint"
```

### Scenario 3: Public Route Preferred

```typescript
// Some environments may prefer public route
// (e.g., behind corporate firewall blocking VPN)
const route = await routeManager.getEndpoint({
  publicEndpoint: 'https://api.iotistic.ca',
  vpnEndpoint: 'http://10.8.0.1:3002',
  preferVpn: false,  // Force public route
});

console.log(route);
// {
//   usingVpn: false,
//   endpoint: 'https://api.iotistic.ca',
//   vpnAvailable: true,  // VPN up but not used
//   reason: 'Public endpoint preferred by configuration'
// }
```

## Performance Characteristics

### VPN Route (Private Network)
- **Latency**: ~10-50ms (depends on cloud proximity)
- **Bandwidth**: Full VPN bandwidth
- **Security**: WireGuard encryption + private network
- **Protocol**: HTTP (no TLS overhead needed)
- **Reliability**: Depends on VPN tunnel health

### Public Route (Internet)
- **Latency**: ~50-200ms (depends on ISP routing)
- **Bandwidth**: Internet connection speed
- **Security**: TLS encryption only
- **Protocol**: HTTPS (TLS handshake overhead)
- **Reliability**: Depends on internet connection

### Comparison

| Metric | VPN Route | Public Route |
|--------|-----------|--------------|
| Security | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| Speed | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| Reliability | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Setup Complexity | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Firewall Friendly | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |

## Configuration

### Environment Variables

```bash
# Public endpoint (required)
CLOUD_API_ENDPOINT=https://api.iotistic.ca

# VPN endpoint (optional - enables VPN routing)
VPN_API_ENDPOINT=http://10.8.0.1:3002

# Route preference (optional - default: prefer VPN if available)
PREFER_VPN_ROUTE=true
```

### Example: Force Public Route

```bash
# Disable VPN routing (use public internet only)
CLOUD_API_ENDPOINT=https://api.iotistic.ca
PREFER_VPN_ROUTE=false
```

### Example: VPN Only Mode

```typescript
// Fail if VPN not available
const route = await routeManager.getEndpoint({
  publicEndpoint: 'https://api.iotistic.ca',
  vpnEndpoint: 'http://10.8.0.1:3002',
  preferVpn: true,
});

if (!route.usingVpn) {
  throw new Error('VPN required but not available');
}
```

## Monitoring & Debugging

### Route Status Endpoint

```typescript
// Get detailed routing information
const info = await routeManager.getRouteInfo({
  publicEndpoint: 'https://api.iotistic.ca',
  vpnEndpoint: 'http://10.8.0.1:3002',
});

console.log(info);
// {
//   status: {
//     usingVpn: true,
//     endpoint: 'http://10.8.0.1:3002',
//     vpnAvailable: true,
//     reason: 'VPN tunnel active'
//   },
//   vpnStatus: {
//     interfaceUp: true,
//     ipAddress: '10.8.0.105',
//     lastHandshake: '2025-01-15T10:30:00Z',
//     transferRx: 1234567,
//     transferTx: 7654321
//   },
//   timestamp: '2025-01-15T10:30:05Z'
// }
```

### Logging

The NetworkRouteManager logs routing decisions:

```
[INFO] Using VPN route for cloud communication
  component: NetworkRouteManager
  endpoint: http://10.8.0.1:3002

[WARN] VPN not available, using public endpoint
  component: NetworkRouteManager
  reason: VPN tunnel not established

[WARN] VPN handshake stale
  component: NetworkRouteManager
  handshakeAge: 320s
```

## Security Considerations

### VPN Route Security

**Pros**:
- Private network (no public exposure)
- WireGuard encryption
- Additional authentication layer
- Protected from internet threats

**Cons**:
- If VPN compromised, all traffic exposed
- Requires VPN server security

### Public Route Security

**Pros**:
- Standard HTTPS/TLS encryption
- Well-tested security protocols
- Certificate pinning possible
- Independent of VPN

**Cons**:
- Public IP exposure
- Subject to DDoS attacks
- ISP/network monitoring possible

### Best Practice: Hybrid Approach

Use **both routes** with automatic failover:
- Primary: VPN route (better security + performance)
- Fallback: Public route (better reliability)
- Result: Best overall security and availability

## Implementation in Agent

### CloudReporter Integration

```typescript
class CloudReporter {
  private routeManager: NetworkRouteManager;
  
  async reportState(state: any): Promise<void> {
    // Get best endpoint
    const route = await this.routeManager.getEndpoint({
      publicEndpoint: process.env.CLOUD_API_ENDPOINT!,
      vpnEndpoint: process.env.VPN_API_ENDPOINT,
    });
    
    // Use selected endpoint
    const response = await fetch(`${route.endpoint}/api/v1/device/state`, {
      method: 'POST',
      headers: {
        'X-Device-API-Key': this.deviceApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(state),
    });
    
    if (!response.ok) {
      // If VPN route failed, try public route
      if (route.usingVpn) {
        this.logger.warn('VPN route failed, retrying with public route');
        return this.reportStateViaPublicRoute(state);
      }
      throw new Error(`Report failed: ${response.statusText}`);
    }
  }
}
```

### Provisioning Integration

```typescript
// During provisioning, VPN endpoint is learned
async provision(config: ProvisioningConfig): Promise<DeviceInfo> {
  // Phase 1-3: Register, exchange keys (over public internet)
  const response = await this.registerWithAPI(...);
  
  // Phase 4: Setup VPN if provided
  if (response.vpnConfig?.enabled) {
    await vpnManager.setup(response.vpnConfig);
    
    // Configure VPN endpoint for future use
    process.env.VPN_API_ENDPOINT = `http://10.8.0.1:3002`;
    
    this.logger.info('VPN route now available for cloud communication');
  }
  
  return this.getDeviceInfo();
}
```

## Testing

### Test VPN Route Selection

```typescript
import { NetworkRouteManager } from './vpn/network-route-manager';

async function testRouteSelection() {
  const manager = new NetworkRouteManager();
  
  // Test 1: VPN available
  console.log('Test 1: VPN available');
  const route1 = await manager.getEndpoint({
    publicEndpoint: 'https://api.iotistic.ca',
    vpnEndpoint: 'http://10.8.0.1:3002',
  });
  console.log(route1);
  // Expected: usingVpn = true
  
  // Test 2: VPN not configured
  console.log('Test 2: VPN not configured');
  const route2 = await manager.getEndpoint({
    publicEndpoint: 'https://api.iotistic.ca',
    // vpnEndpoint: undefined
  });
  console.log(route2);
  // Expected: usingVpn = false, reason = 'No VPN endpoint configured'
  
  // Test 3: Force public route
  console.log('Test 3: Force public route');
  const route3 = await manager.getEndpoint({
    publicEndpoint: 'https://api.iotistic.ca',
    vpnEndpoint: 'http://10.8.0.1:3002',
    preferVpn: false,
  });
  console.log(route3);
  // Expected: usingVpn = false, vpnAvailable = true
}
```

## Migration Path

### Phase 1: Current (Public Only) ✅
```
Agent → Public Internet → Cloud API
```

### Phase 2: VPN Available (Hybrid) 🚀
```
Agent → VPN Tunnel → Cloud API (preferred)
      ↘ Public Internet → Cloud API (fallback)
```

### Phase 3: VPN Optimized (Future)
```
Agent → VPN Tunnel → Cloud Services
      ↘ Public Internet → Cloud API (registration only)
```

## Summary

**Hybrid routing provides**:
- ✅ Better security (VPN encryption)
- ✅ Better performance (lower latency)
- ✅ Better reliability (automatic failback)
- ✅ Better user experience (seamless switching)

**The agent intelligently chooses**:
1. VPN route when available (fast, secure, private)
2. Public route when needed (reliable, always works)
3. Logs all decisions for debugging
4. Gracefully handles failures

This is the **best of both worlds** approach used by enterprise IoT platforms!
