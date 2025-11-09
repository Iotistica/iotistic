# License-Based Feature Control - Implementation Guide

**Created**: October 21, 2025  
**Status**: ✅ Implemented  
**Architecture**: Per-Customer Deployment with Global Billing Validation

---

## Overview

This implementation adds **license-based feature control** to the Iotistic API. Each customer deployment validates a JWT license key from the Global Billing API and enforces:

- Feature flags (export data, advanced alerts, API access, etc.)
- Device limits (max devices per plan)
- Usage quotas (data retention days, max users, etc.)
- Subscription status (active, trial, past_due, canceled)

---

## Architecture

```
┌─────────────────────────────────────────┐
│  GLOBAL BILLING API (Your SaaS Cloud)  │
│  - Stripe integration                   │
│  - Customer subscriptions               │
│  - License generation (JWT)             │
│  - Usage-based billing                  │
└─────────────────────────────────────────┘
                    ↓ License JWT
                    ↓ (signed with private key)
┌─────────────────────────────────────────┐
│  Customer K8s Instance (Per Customer)   │
│  - Validates license (public key)       │
│  - Enforces feature flags               │
│  - Reports usage (device count)         │
│  - Caches license (30-day offline mode) │
└─────────────────────────────────────────┘
```

---

## Components

### 1. License Validator (`src/services/license-validator.ts`)

**Purpose**: Validates JWT license keys and provides feature checks.

**Key Methods**:
```typescript
const license = LicenseValidator.getInstance();
await license.init(); // Call on startup

// Feature checks
license.hasFeature('canExportData'); // boolean
license.getLimit('maxUsers'); // number | undefined
license.isTrialMode(); // boolean
license.isSubscriptionActive(); // boolean
license.getTrialDaysRemaining(); // number | null
```

**License Data Structure**:
```typescript
interface LicenseData {
  customerId: string;
  customerName: string;
  plan: 'trial' | 'starter' | 'professional' | 'enterprise';
  features: {
    maxDevices: number;
    dataRetentionDays: number;
    canExportData: boolean;
    hasAdvancedAlerts: boolean;
    hasApiAccess: boolean;
    hasMqttAccess: boolean;
    hasCustomBranding: boolean;
  };
  limits: {
    maxUsers?: number;
    maxAlertRules?: number;
    maxDashboards?: number;
  };
  trial: {
    isTrialMode: boolean;
    expiresAt?: string;
  };
  subscription: {
    status: 'active' | 'past_due' | 'canceled' | 'trialing';
    currentPeriodEndsAt: string;
  };
  issuedAt: number;
  expiresAt: number;
}
```

**Offline Mode**: Caches validated license in `system_config` table for 30 days.

---

### 2. Feature Guards (`src/middleware/feature-guard.ts`)

**Purpose**: Express middleware to block endpoints based on license.

**Usage Examples**:

```typescript
import { requireFeature, checkDeviceLimit, requireActiveSubscription } from '../middleware/feature-guard';

// Require specific feature
router.get('/api/export', requireFeature('canExportData'), async (req, res) => {
  // Only accessible if canExportData = true
});

// Check device limit before adding
router.post('/api/devices', requireActiveSubscription, checkDeviceLimit, async (req, res) => {
  // Blocks if device count >= maxDevices
});

// Advanced alerts (premium feature)
router.post('/api/alerts/advanced', requireFeature('hasAdvancedAlerts'), async (req, res) => {
  // Only for professional/enterprise plans
});
```

**Response on Feature Denied** (403):
```json
{
  "error": "Feature not available",
  "message": "This feature requires a higher plan. Current plan: starter",
  "feature": "canExportData",
  "upgradeUrl": "https://iotistic.ca/upgrade"
}
```

---

### 3. System Config Model (`src/db/system-config-model.ts`)

**Purpose**: Key-value store for caching license data and system state.

**Usage**:
```typescript
// Store license data
await SystemConfigModel.set('license_data', licenseData);

// Retrieve cached license
const cachedLicense = await SystemConfigModel.get<LicenseData>('license_data');

// Store arbitrary config
await SystemConfigModel.set('feature_toggle_beta', { enabled: true });
```

**Database Table**: `system_config` (from migration `002_add_system_config.sql`)

---

### 4. Usage Reporter (`src/jobs/usage-reporter.ts`)

**Purpose**: Reports device count to Global Billing API for metered billing.

**Status**: 🚧 **COMMENTED OUT** (waiting for postoffice to be ready)

**Will Report**:
- Active device count
- Total device count
- Customer ID
- Instance ID (for multi-region deployments)
- Timestamp

**Planned Schedule**: Daily at 2 AM

---

### 5. License Info Endpoint (`src/routes/license.ts`)

**Endpoint**: `GET /api/v1/license`

**Response**:
```json
{
  "customer": {
    "id": "cust_abc123",
    "name": "Acme Corporation"
  },
  "plan": "professional",
  "subscription": {
    "status": "active",
    "currentPeriodEndsAt": "2025-11-21T00:00:00Z"
  },
  "trial": null,
  "features": {
    "maxDevices": 50,
    "dataRetentionDays": 365,
    "canExportData": true,
    "hasAdvancedAlerts": true,
    "hasApiAccess": true,
    "hasMqttAccess": true,
    "hasCustomBranding": true
  },
  "limits": {
    "maxUsers": 10,
    "maxAlertRules": 100,
    "maxDashboards": 20
  },
  "usage": {
    "devices": {
      "current": 23,
      "max": 50,
      "percentUsed": 46
    }
  },
  "upgradeUrl": "https://iotistic.ca/upgrade"
}
```

**Trial Mode Response**:
```json
{
  "trial": {
    "isActive": true,
    "expiresAt": "2025-11-04T00:00:00Z",
    "daysRemaining": 14
  }
}
```

---

## Environment Variables

**Required**:
```bash
### Example License JWT

```bash
IOTISTIC_LICENSE_KEY=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJjdXN0b21lcklkIjoiY3VzdF9hYmMxMjMiLCJjdXN0b21lck5hbWUiOiJBY21lIENvcnBvcmF0aW9uIiwicGxhbiI6InByb2Zlc3Npb25hbCIsImZlYXR1cmVzIjp7Im1heERldmljZXMiOjUwLCJkYXRhUmV0ZW50aW9uRGF5cyI6MzY1LCJjYW5FeHBvcnREYXRhIjp0cnVlLCJoYXNBZHZhbmNlZEFsZXJ0cyI6dHJ1ZSwiaGFzQXBpQWNjZXNzIjp0cnVlLCJoYXNNcXR0QWNjZXNzIjp0cnVlLCJoYXNDdXN0b21CcmFuZGluZyI6dHJ1ZX0sImxpbWl0cyI6eyJtYXhVc2VycyI6MTAsIm1heEFsZXJ0UnVsZXMiOjEwMCwibWF4RGFzaGJvYXJkcyI6MjB9LCJ0cmlhbCI6eyJpc1RyaWFsTW9kZSI6ZmFsc2V9LCJzdW...
```

# Public key for JWT verification (RS256)
LICENSE_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
-----END PUBLIC KEY-----"
```

**Optional**:
```bash
# Global Billing API URL (for usage reporting)
BILLING_API_URL=https://billing.iotistic.ca

# Upgrade/portal URLs (shown in error messages)
BILLING_UPGRADE_URL=https://iotistic.ca/upgrade
BILLING_PORTAL_URL=https://iotistic.ca/billing

# Instance ID (for multi-region deployments)
INSTANCE_ID=us-east-1-prod
```

---

## Unlicensed Mode

If no license key is provided, the system runs in **unlicensed mode** with very limited features:

```typescript
{
  plan: 'trial',
  features: {
    maxDevices: 3,              // Only 3 devices
    dataRetentionDays: 7,       // 7 days only
    canExportData: false,       // No exports
    hasAdvancedAlerts: false,   // No advanced alerts
    hasApiAccess: true,         // Basic API access
    hasMqttAccess: true,        // Basic MQTT
    hasCustomBranding: false,   // No branding
  },
  trial: {
    isTrialMode: true,
    expiresAt: '7 days from now'
  }
}
```

**Use Cases**:
- Development/testing
- Proof-of-concept deployments
- Grace period if license validation fails

---

## Integration Example

### Protect Export Endpoint

```typescript
// routes/export.ts
import express from 'express';
import { requireFeature } from '../middleware/feature-guard';

const router = express.Router();

router.get('/export/:deviceUuid/metrics', 
  requireFeature('canExportData'),
  async (req, res) => {
    // Export CSV/JSON data
    const metrics = await DeviceMetricsModel.getRecent(req.params.deviceUuid, 10000);
    res.json(metrics);
  }
);

export default router;
```

### Check Device Limit Before Provisioning

```typescript
// routes/provisioning.ts (existing file)
import { checkDeviceLimit } from '../middleware/feature-guard';

router.post('/device/provision',
  authenticateApiKey,
  checkDeviceLimit, // ← Add this
  async (req, res) => {
    // Provision device logic
  }
);
```

### Show License Info in Admin UI

```typescript
// Frontend (admin panel)
fetch('/api/v1/license')
  .then(res => res.json())
  .then(license => {
    // Show plan, usage, trial info
    console.log(`Plan: ${license.plan}`);
    console.log(`Devices: ${license.usage.devices.current}/${license.usage.devices.max}`);
    
    if (license.trial?.isActive) {
      alert(`Trial expires in ${license.trial.daysRemaining} days`);
    }
  });
```

---

## Plan Feature Matrix

| Feature | Trial | Starter | Professional | Enterprise |
|---------|-------|---------|--------------|------------|
| **Max Devices** | 3 | 10 | 50 | Unlimited |
| **Data Retention** | 7 days | 30 days | 365 days | Custom |
| **Export Data** | ❌ | ✅ | ✅ | ✅ |
| **Advanced Alerts** | ❌ | ❌ | ✅ | ✅ |
| **API Access** | ✅ | ✅ | ✅ | ✅ |
| **MQTT Access** | ✅ | ✅ | ✅ | ✅ |
| **Custom Branding** | ❌ | ❌ | ❌ | ✅ |
| **Max Users** | 1 | 5 | 10 | Unlimited |
| **Max Alert Rules** | 5 | 25 | 100 | Unlimited |
| **Max Dashboards** | 2 | 10 | 20 | Unlimited |

---

## Testing

### 1. Generate Test License (Manual)

```bash
# On your local machine (not in customer instance)
npm install jsonwebtoken

# Create test-license.js
const jwt = require('jsonwebtoken');
const fs = require('fs');

// Generate RSA key pair (one-time)
const { generateKeyPairSync } = require('crypto');
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

fs.writeFileSync('private-key.pem', privateKey);
fs.writeFileSync('public-key.pem', publicKey);

// Create license
const licenseData = {
  customerId: 'cust_test123',
  customerName: 'Test Customer',
  plan: 'professional',
  features: {
    maxDevices: 50,
    dataRetentionDays: 365,
    canExportData: true,
    hasAdvancedAlerts: true,
    hasApiAccess: true,
    hasMqttAccess: true,
    hasCustomBranding: false,
  },
  limits: {
    maxUsers: 10,
    maxAlertRules: 100,
    maxDashboards: 20,
  },
  trial: {
    isTrialMode: false,
  },
  subscription: {
    status: 'active',
    currentPeriodEndsAt: '2026-01-01T00:00:00Z',
  },
  issuedAt: Math.floor(Date.now() / 1000),
  expiresAt: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60), // 1 year
};

const token = jwt.sign(licenseData, privateKey, { algorithm: 'RS256' });
console.log('\nLicense JWT:');
console.log(token);
console.log('\nPublic Key:');
console.log(publicKey);
```

### 2. Test API

```bash
# Set environment variables
export IOTISTIC_LICENSE_KEY="<jwt_from_above>"
export LICENSE_PUBLIC_KEY="<public_key_from_above>"

# Start API
npm run dev

# Check license endpoint
curl http://localhost:3002/api/v1/license

# Try to export (should work with professional plan)
curl http://localhost:3002/api/v1/export/device-uuid-123/metrics

# Try to add device (should check limit)
curl -X POST http://localhost:3002/api/v1/device/provision \
  -H "Content-Type: application/json" \
  -d '{"uuid": "new-device-123"}'
```

### 3. Test Unlicensed Mode

```bash
# Start without license key
unset IOTISTIC_LICENSE_KEY
npm run dev

# Check license (should show unlicensed mode)
curl http://localhost:3002/api/v1/license
# Response: maxDevices: 3, plan: 'trial', trial expires in 7 days
```

---

## Future Enhancements

### 1. Usage Reporter (Pending Postoffice)

**Uncomment in `src/jobs/usage-reporter.ts`**:
- Send daily device count to Global Billing API
- Alert when approaching limits (80% usage)
- Email notifications for trial expiration

### 2. Cron Job Registration (Pending Postoffice)

**Uncomment in `src/jobs/index.ts`**:
```typescript
import cron from 'node-cron';
import { usageReporterJob } from './usage-reporter';

// Report usage daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  await usageReporterJob();
});
```

### 3. Email Templates (Pending Postoffice)

**Create templates**:
- `ApproachingDeviceLimit.html` - "You're using 80% of your device limit"
- `TrialExpiring.html` - "Your trial expires in 3 days"
- `SubscriptionPastDue.html` - "Payment failed, please update"

### 4. Admin UI Integration

**Show in dashboard**:
- Current plan and limits
- Usage meters (devices, alerts, dashboards)
- Trial countdown
- Upgrade CTAs

---

## Security Considerations

1. **JWT Signing**: Global Billing API uses RS256 (asymmetric) so customer instances can't forge licenses
2. **Offline Mode**: 30-day cache allows operation during network outages
3. **Public Key**: Can be shared publicly (only private key signs)
4. **Environment Variables**: Never commit license keys to git

---

## Summary

✅ **Implemented**:
- License validation with JWT
- Feature flags enforcement
- Device limit checks
- Subscription status validation
- Unlicensed mode fallback
- License info endpoint

🚧 **Pending** (waiting for postoffice):
- Usage reporting to billing API
- Email notifications for limits/trials
- Cron job registration

🌐 **Separate Project** (Global Billing API):
- Stripe integration
- Customer portal
- License generation
- Usage aggregation

---

## Next Steps

1. **Test locally** with generated license key
2. **Add feature guards** to existing endpoints (export, advanced alerts)
3. **Build Global Billing API** (separate repo, can reuse `api/billing/` code)
4. **Integrate admin UI** to show license info
5. **Uncomment usage reporter** when postoffice is ready

---

**Questions?** Check `BILLING-ARCHITECTURE-DECISION.md` for the full architecture rationale.
