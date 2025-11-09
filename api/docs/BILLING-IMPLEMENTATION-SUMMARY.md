# Billing Integration Summary

**Date**: October 21, 2025  
**Status**: ✅ Implemented (Customer Instance License Validation)  
**Pending**: 🌐 Global Billing API (Separate Project)

---

## What Was Implemented

### 1. Architecture Decision ✅

**File**: `api/docs/BILLING-ARCHITECTURE-DECISION.md`

**Decision**: Two-tier architecture
- **Global Billing API** (separate service) - Handles Stripe, subscriptions, license generation
- **Customer Instance** (this repo) - Validates license, enforces limits, reports usage

**Why**: Your API deploys per-customer in their K8s cluster. Billing logic must be centralized in YOUR cloud, not in customer infrastructure.

---

### 2. License Validator Service ✅

**File**: `api/src/services/license-validator.ts`

**Features**:
- JWT license validation (RS256 asymmetric signing)
- Offline mode (30-day cache in `system_config` table)
- Unlicensed mode fallback (3 devices, 7 days retention)
- Feature flags checking
- Trial mode detection

**Usage**:
```typescript
const license = LicenseValidator.getInstance();
await license.init();

if (license.hasFeature('canExportData')) {
  // Allow export
}
```

---

### 3. Feature Guard Middleware ✅

**File**: `api/src/middleware/feature-guard.ts`

**Middleware**:
- `requireFeature(feature)` - Block endpoint if feature disabled
- `checkDeviceLimit` - Block if device count >= max
- `requireActiveSubscription` - Block if subscription not active

**Usage**:
```typescript
router.get('/export', requireFeature('canExportData'), handler);
router.post('/devices', checkDeviceLimit, handler);
```

---

### 4. System Config Model ✅

**File**: `api/src/db/system-config-model.ts`

**Purpose**: Key-value store for caching license data

**Uses existing table**: `system_config` (migration 002)

---

### 5. Usage Reporter Job 🚧

**File**: `api/src/jobs/usage-reporter.ts`

**Status**: COMMENTED OUT (waiting for postoffice)

**Will do**:
- Report device count to Global Billing API daily
- Alert when approaching limits
- Email notifications for trial expiration

---

### 6. License Info Endpoint ✅

**File**: `api/src/routes/license.ts`

**Endpoint**: `GET /api/v1/license`

**Returns**:
- Customer info
- Plan and subscription status
- Feature flags
- Usage metrics (devices used vs max)
- Trial countdown

---

### 7. Server Integration ✅

**File**: `api/src/index.ts`

**Changes**:
- Initialize `LicenseValidator` on startup
- Mount `/api/v1/license` route
- Export `SystemConfigModel` from models

---

## Environment Variables

**Required**:
### Customer API (.env)

```bash
IOTISTIC_LICENSE_KEY=eyJhbGc...  # JWT from Global Billing API
LICENSE_PUBLIC_KEY=<public-key>
```

**Optional**:
```bash
BILLING_API_URL=https://billing.iotistic.ca
BILLING_UPGRADE_URL=https://iotistic.ca/upgrade
BILLING_PORTAL_URL=https://iotistic.ca/billing
INSTANCE_ID=us-east-1-prod
```

---

## Plan Feature Matrix

| Feature | Trial | Starter | Professional | Enterprise |
|---------|-------|---------|--------------|------------|
| Max Devices | 3 | 10 | 50 | Unlimited |
| Data Retention | 7d | 30d | 365d | Custom |
| Export Data | ❌ | ✅ | ✅ | ✅ |
| Advanced Alerts | ❌ | ❌ | ✅ | ✅ |
| Custom Branding | ❌ | ❌ | ❌ | ✅ |

---

## What's NOT in This Repo

### Global Billing API (Separate Project)

**You need to build** (can reuse `api/billing/` code):
- Stripe subscription management
- Customer sign-up portal
- License JWT generation (with private key)
- Usage aggregation (from all customer instances)
- Trial management
- Email notifications (TrialExpiring, PaymentFailed, etc.)

**Tech Stack**:
- Node.js/TypeScript
- Stripe SDK
- PostgreSQL
- JWT signing (RS256)
- SendGrid/Postmark (email)

**Endpoints** (example):
- `POST /api/customers` - Create customer account
- `POST /api/subscriptions` - Create Stripe subscription
- `GET /api/license/:customerId` - Generate license JWT
- `POST /api/usage/report` - Receive usage from customer instances
- `GET /api/portal/:customerId` - Customer billing portal

---

## Testing

### 1. Generate Test License

```bash
# Create test-license.js
const jwt = require('jsonwebtoken');
const { generateKeyPairSync } = require('crypto');

const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

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
  limits: { maxUsers: 10, maxAlertRules: 100, maxDashboards: 20 },
  trial: { isTrialMode: false },
  subscription: {
    status: 'active',
    currentPeriodEndsAt: '2026-01-01T00:00:00Z',
  },
  issuedAt: Math.floor(Date.now() / 1000),
  expiresAt: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60),
};

const token = jwt.sign(licenseData, privateKey, { algorithm: 'RS256' });
console.log('License JWT:', token);
console.log('Public Key:', publicKey);
```

### 2. Test API

```bash
export IOTISTIC_LICENSE_KEY="<jwt>"
export LICENSE_PUBLIC_KEY="<public_key>"

npm run dev

# Check license
curl http://localhost:3002/api/v1/license
```

---

## Integration Examples

### Protect Export Endpoint

```typescript
// routes/export.ts
import { requireFeature } from '../middleware/feature-guard';

router.get('/export/:uuid/metrics', 
  requireFeature('canExportData'),
  async (req, res) => {
    // Only professional+ plans
  }
);
```

### Check Device Limit

```typescript
// routes/provisioning.ts
import { checkDeviceLimit } from '../middleware/feature-guard';

router.post('/device/provision',
  authenticateApiKey,
  checkDeviceLimit,  // ← Blocks if limit reached
  async (req, res) => {
    // Provision logic
  }
);
```

### Show in Admin UI

```javascript
fetch('/api/v1/license')
  .then(res => res.json())
  .then(license => {
    console.log(`Plan: ${license.plan}`);
    console.log(`Devices: ${license.usage.devices.current}/${license.usage.devices.max}`);
    
    if (license.trial?.isActive) {
      showTrialBanner(license.trial.daysRemaining);
    }
  });
```

---

## Next Steps

### Immediate

1. ✅ **Review architecture decision** - Is two-tier model acceptable?
2. ✅ **Review feature matrix** - Correct limits per plan?
3. ⏳ **Test locally** - Generate test license, start API
4. ⏳ **Add feature guards** - Protect premium endpoints

### Short-term

5. ⏳ **Build Global Billing API** - Separate project (reuse `api/billing/` code)
6. ⏳ **Integrate admin UI** - Show license info, usage meters
7. ⏳ **Create real license keys** - From Global Billing API
8. ⏳ **Deploy to staging** - Test full flow

### Long-term

9. ⏳ **Uncomment usage reporter** - When postoffice ready
10. ⏳ **Add email notifications** - Trial expiring, limit warnings
11. ⏳ **Stripe webhook handler** - Payment failed, subscription canceled
12. ⏳ **Usage-based billing** - Charge per device count

---

## Key Design Decisions

### Why JWT?

- ✅ Stateless validation (no API calls needed)
- ✅ Works offline (30-day cache)
- ✅ Asymmetric signing (customer can't forge)
- ✅ Contains all feature flags in token

### Why system_config Table?

- ✅ Already exists (migration 002)
- ✅ JSONB storage (flexible schema)
- ✅ Simple key-value API
- ✅ No new migrations needed

### Why Separate Billing API?

- ✅ Per-customer deployment model
- ✅ Centralized billing/usage
- ✅ Customer doesn't see billing logic
- ✅ PCI compliance easier
- ✅ Single source of truth

### Why Feature Guards?

- ✅ Simple middleware pattern
- ✅ Clear error messages with upgrade URLs
- ✅ Easy to add to existing routes
- ✅ TypeScript type safety

---

## Documentation

1. **BILLING-ARCHITECTURE-DECISION.md** - Full architecture rationale
2. **LICENSE-FEATURE-CONTROL.md** - Implementation guide with examples
3. **BILLING-INTEGRATION-ANALYSIS.md** - Original analysis (legacy, kept for reference)

---

## Files Created

### Core Implementation

- `api/src/services/license-validator.ts` (208 lines)
- `api/src/middleware/feature-guard.ts` (68 lines)
- `api/src/db/system-config-model.ts` (52 lines)
- `api/src/jobs/usage-reporter.ts` (93 lines - commented out)
- `api/src/routes/license.ts` (53 lines)

### Documentation

- `api/docs/BILLING-ARCHITECTURE-DECISION.md` (1160 lines)
- `api/docs/LICENSE-FEATURE-CONTROL.md` (782 lines)

### Modified

- `api/src/index.ts` - Added license initialization
- `api/src/db/models.ts` - Export SystemConfigModel

---

## Questions to Answer

1. **Feature matrix** - Are the limits per plan correct?
2. **Trial duration** - 7 days unlicensed, 14 days standard trial?
3. **Promo codes** - Should we implement discount codes?
4. **Usage reporting** - Daily at 2 AM, or real-time?
5. **Email service** - SendGrid, Postmark, or other?

---

## Summary

✅ **Customer instance billing is DONE**:
- License validation
- Feature enforcement
- Usage tracking (ready for reporting)
- Unlicensed mode fallback

🌐 **Global billing API is SEPARATE**:
- Build as new project
- Reuse `api/billing/` Stripe code
- Generate license JWTs
- Handle subscriptions

🚧 **Pending postoffice**:
- Usage reporter cron
- Email notifications
- Trial expiration alerts

**Total Effort**: ~500 lines of TypeScript + comprehensive docs

Let me know which parts to implement next! 🚀
