# Billing Architecture Decision - Per-Customer Deployment Model

**Date**: October 21, 2025  
**Decision**: Global billing API (separate) + Per-customer license validation (in deployed instance)

---

## Background

**Current Architecture**:
- API deployed **per customer** in their K8s cluster
- Multi-device management (customers manage their IoT devices)
- Feature-based pricing + device count limits

**Question**: Where should billing logic live?

---

## Decision: Two-Tier Architecture

### Tier 1: Global Billing SaaS (Separate Service) 🌐

**Purpose**: Customer subscription management, Stripe integration, license generation

**Responsibilities**:
- Stripe subscription management
- Customer sign-up and onboarding
- License key generation (JWT-based)
- Feature entitlement configuration
- Usage-based billing (device count reports)
- Trial management
- Email notifications

**Technology Stack**:
- Separate Node.js/TypeScript API
- Stripe SDK integration
- PostgreSQL database
- Hosted on your cloud (AWS/Azure/GCP)

**Why Separate?**:
- ✅ Single source of truth for billing
- ✅ Customers don't see/modify billing logic
- ✅ PCI compliance easier (no customer infrastructure)
- ✅ Usage aggregation across all customer instances
- ✅ Centralized trial/subscription management

---

### Tier 2: Customer Instance (License Validation Only) 🔐

**Purpose**: Validate license, enforce limits, report usage

**Responsibilities**:
- Validate license key on startup
- Check feature flags (from license)
- Enforce device limits
- Report device count to Global Billing API (daily)
- Block features if license expired
- **NO billing/payment logic**

**Technology Stack**:
- Current `api/` codebase
- License validation using JWT
- Periodic usage reporting (cron job)
- Feature flag checks

**Why In-Customer Instance?**:
- ✅ Works offline (license cached for 30 days)
- ✅ Low latency feature checks
- ✅ Customer data stays in their infrastructure
- ✅ Simple integration (environment variable for license key)

---

## Implementation for Your API (Customer Instance)

**What to implement in `api/src/`**:

### 1. License Validation Service

**File**: `api/src/services/license-validator.ts`

```typescript
import jwt from 'jsonwebtoken';
import { SystemConfigModel } from '../db/system-config-model';

export interface LicenseData {
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
    expiresAt?: string; // ISO date
  };
  subscription: {
    status: 'active' | 'past_due' | 'canceled' | 'trialing';
    currentPeriodEndsAt: string;
  };
  issuedAt: number;
  expiresAt: number; // License expiry (separate from subscription)
}

export class LicenseValidator {
  private static instance: LicenseValidator;
  private licenseData: LicenseData | null = null;
  private licenseKey: string | null = null;
  
  // Public key for verifying JWT (your Global Billing API signs with private key)
  private static readonly PUBLIC_KEY = process.env.LICENSE_PUBLIC_KEY || '';

  private constructor() {}

  static getInstance(): LicenseValidator {
    if (!this.instance) {
      this.instance = new LicenseValidator();
    }
    return this.instance;
  }

  /**
   * Initialize license from environment variable
   */
  async init(): Promise<void> {
    const licenseKey = process.env.IOTISTIC_LICENSE_KEY;
    
    if (!licenseKey) {
      console.warn('⚠️  No license key found. Running in unlicensed mode (limited features).');
      this.licenseData = this.getDefaultUnlicensedMode();
      return;
    }

    try {
      this.licenseKey = licenseKey;
      this.licenseData = await this.validateLicense(licenseKey);
      
      // Cache license data in system_config
      await SystemConfigModel.set('license_data', this.licenseData);
      await SystemConfigModel.set('license_last_validated', new Date().toISOString());
      
      console.log(`✅ License validated for customer: ${this.licenseData.customerName}`);
      console.log(`   Plan: ${this.licenseData.plan.toUpperCase()}`);
      console.log(`   Max Devices: ${this.licenseData.features.maxDevices}`);
      console.log(`   Subscription Status: ${this.licenseData.subscription.status}`);
      
      if (this.licenseData.trial.isTrialMode) {
        const daysLeft = Math.ceil(
          (new Date(this.licenseData.trial.expiresAt!).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
        );
        console.log(`   ⏰ TRIAL MODE - ${daysLeft} days remaining`);
      }
    } catch (error) {
      console.error('❌ License validation failed:', error);
      
      // Try to load cached license (offline mode)
      const cachedLicense = await SystemConfigModel.get<LicenseData>('license_data');
      const lastValidated = await SystemConfigModel.get<string>('license_last_validated');
      
      if (cachedLicense && lastValidated) {
        const daysSinceValidation = Math.floor(
          (Date.now() - new Date(lastValidated).getTime()) / (24 * 60 * 60 * 1000)
        );
        
        if (daysSinceValidation <= 30) {
          console.warn(`⚠️  Using cached license (offline mode, last validated ${daysSinceValidation} days ago)`);
          this.licenseData = cachedLicense;
          return;
        }
      }
      
      // Fallback to unlicensed mode
      console.warn('⚠️  Entering unlicensed mode (limited features)');
      this.licenseData = this.getDefaultUnlicensedMode();
    }
  }

  /**
   * Validate license JWT
   */
  private async validateLicense(licenseKey: string): Promise<LicenseData> {
    try {
      const decoded = jwt.verify(licenseKey, LicenseValidator.PUBLIC_KEY, {
        algorithms: ['RS256'], // Asymmetric signing
      }) as LicenseData;

      // Check license expiry
      if (decoded.expiresAt && decoded.expiresAt < Date.now() / 1000) {
        throw new Error('License has expired');
      }

      // Check subscription status
      if (decoded.subscription.status === 'canceled') {
        throw new Error('Subscription has been canceled');
      }

      return decoded;
    } catch (error: any) {
      throw new Error(`License validation failed: ${error.message}`);
    }
  }

  /**
   * Get default unlicensed mode (very limited)
   */
  private getDefaultUnlicensedMode(): LicenseData {
    return {
      customerId: 'unlicensed',
      customerName: 'Unlicensed Instance',
      plan: 'trial',
      features: {
        maxDevices: 3, // Very limited
        dataRetentionDays: 7,
        canExportData: false,
        hasAdvancedAlerts: false,
        hasApiAccess: true,
        hasMqttAccess: true,
        hasCustomBranding: false,
      },
      limits: {
        maxUsers: 1,
        maxAlertRules: 5,
        maxDashboards: 2,
      },
      trial: {
        isTrialMode: true,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
      },
      subscription: {
        status: 'trialing',
        currentPeriodEndsAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      },
      issuedAt: Date.now() / 1000,
      expiresAt: (Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
    };
  }

  /**
   * Get current license data
   */
  getLicense(): LicenseData {
    if (!this.licenseData) {
      throw new Error('License not initialized. Call init() first.');
    }
    return this.licenseData;
  }

  /**
   * Check if feature is enabled
   */
  hasFeature(feature: keyof LicenseData['features']): boolean {
    return this.getLicense().features[feature] === true;
  }

  /**
   * Get feature limit
   */
  getLimit(limit: keyof LicenseData['limits']): number | undefined {
    return this.getLicense().limits[limit];
  }

  /**
   * Check if license is in trial mode
   */
  isTrialMode(): boolean {
    return this.getLicense().trial.isTrialMode;
  }

  /**
   * Check if subscription is active
   */
  isSubscriptionActive(): boolean {
    const status = this.getLicense().subscription.status;
    return status === 'active' || status === 'trialing';
  }

  /**
   * Get days until trial expires (returns null if not in trial)
   */
  getTrialDaysRemaining(): number | null {
    const license = this.getLicense();
    if (!license.trial.isTrialMode || !license.trial.expiresAt) {
      return null;
    }
    
    const daysLeft = Math.ceil(
      (new Date(license.trial.expiresAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    );
    
    return Math.max(0, daysLeft);
  }
}
```

---

### 2. System Config Model (for caching)

**File**: `api/src/db/system-config-model.ts`

```typescript
import { query } from './connection';

export class SystemConfigModel {
  /**
   * Get config value
   */
  static async get<T = any>(key: string): Promise<T | null> {
    const result = await query<{ value: T }>(
      'SELECT value FROM system_config WHERE key = $1',
      [key]
    );
    return result.rows[0]?.value || null;
  }

  /**
   * Set config value
   */
  static async set(key: string, value: any): Promise<void> {
    await query(
      `INSERT INTO system_config (key, value, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET
         value = $2,
         updated_at = CURRENT_TIMESTAMP`,
      [key, JSON.stringify(value)]
    );
  }

  /**
   * Delete config value
   */
  static async delete(key: string): Promise<void> {
    await query('DELETE FROM system_config WHERE key = $1', [key]);
  }

  /**
   * Get all config values
   */
  static async getAll(): Promise<Record<string, any>> {
    const result = await query<{ key: string; value: any }>(
      'SELECT key, value FROM system_config'
    );
    
    return result.rows.reduce((acc, row) => {
      acc[row.key] = row.value;
      return acc;
    }, {} as Record<string, any>);
  }
}
```

---

### 3. Feature Flag Middleware

**File**: `api/src/middleware/feature-guard.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import { LicenseValidator } from '../services/license-validator';

/**
 * Middleware to check if feature is enabled
 */
export function requireFeature(feature: keyof LicenseData['features']) {
  return (req: Request, res: Response, next: NextFunction) => {
    const license = LicenseValidator.getInstance();
    
    if (!license.hasFeature(feature)) {
      return res.status(403).json({
        error: 'Feature not available',
        message: `This feature requires a higher plan. Current plan: ${license.getLicense().plan}`,
        feature,
        upgradeUrl: process.env.BILLING_UPGRADE_URL || 'https://iotistic.ca/upgrade',
      });
    }
    
    next();
  };
}

/**
 * Middleware to check device limit
 */
export async function checkDeviceLimit(req: Request, res: Response, next: NextFunction) {
  const license = LicenseValidator.getInstance();
  const maxDevices = license.getLicense().features.maxDevices;
  
  // Count current devices
  const { DeviceModel } = await import('../db/models');
  const devices = await DeviceModel.list({ isActive: true });
  
  if (devices.length >= maxDevices) {
    return res.status(403).json({
      error: 'Device limit reached',
      message: `Maximum devices (${maxDevices}) reached. Upgrade your plan to add more devices.`,
      currentDevices: devices.length,
      maxDevices,
      upgradeUrl: process.env.BILLING_UPGRADE_URL || 'https://iotistic.ca/upgrade',
    });
  }
  
  next();
}

/**
 * Middleware to check subscription status
 */
export function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  const license = LicenseValidator.getInstance();
  
  if (!license.isSubscriptionActive()) {
    return res.status(402).json({ // 402 Payment Required
      error: 'Subscription inactive',
      message: 'Your subscription is not active. Please update your payment method.',
      status: license.getLicense().subscription.status,
      billingUrl: process.env.BILLING_PORTAL_URL || 'https://iotistic.ca/billing',
    });
  }
  
  next();
}
```

---

### 4. Usage Reporter (sends to Global Billing API)

**File**: `api/src/jobs/usage-reporter.ts`

```typescript
import { DeviceModel } from '../db/models';
import { LicenseValidator } from '../services/license-validator';
import axios from 'axios';

/**
 * Usage Reporter Job
 * Reports device count to Global Billing API daily
 */
export async function usageReporterJob() {
  // COMMENTED OUT: Wait for postoffice to be ready
  // console.log('📊 Reporting usage to Global Billing API...');
  
  try {
    const license = LicenseValidator.getInstance();
    const licenseData = license.getLicense();
    
    // Don't report for unlicensed mode
    if (licenseData.customerId === 'unlicensed') {
      console.log('⏭️  Skipping usage report (unlicensed mode)');
      return;
    }
    
    // Count active devices
    const devices = await DeviceModel.list({ isActive: true });
    const deviceCount = devices.length;
    
    // Prepare usage data
    const usageData = {
      customerId: licenseData.customerId,
      instanceId: process.env.INSTANCE_ID || 'default',
      timestamp: new Date().toISOString(),
      metrics: {
        activeDevices: deviceCount,
        totalDevices: (await DeviceModel.list()).length,
      },
      license: {
        plan: licenseData.plan,
        maxDevices: licenseData.features.maxDevices,
      },
    };
    
    // COMMENTED OUT: Send to Global Billing API (when ready)
    /*
    const billingApiUrl = process.env.BILLING_API_URL;
    if (billingApiUrl) {
      await axios.post(
        `${billingApiUrl}/api/v1/usage/report`,
        usageData,
        {
          headers: {
            headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.IOTISTIC_LICENSE_KEY}`,
        },
            'Content-Type': 'application/json',
          },
          timeout: 5000,
        }
      );
      console.log(`✅ Usage reported: ${deviceCount} active devices`);
    } else {
      console.warn('⚠️  BILLING_API_URL not set, skipping usage report');
    }
    */
    
    console.log(`📊 Usage: ${deviceCount} active devices (max: ${licenseData.features.maxDevices})`);
    
    // Check if approaching limit
    if (deviceCount >= licenseData.features.maxDevices * 0.8) {
      console.warn(`⚠️  Approaching device limit: ${deviceCount}/${licenseData.features.maxDevices}`);
      
      // COMMENTED OUT: Send email notification (when postoffice ready)
      /*
      await sendEmail(
        licenseData.customerName,
        EmailTemplate.ApproachingDeviceLimit,
        {
          currentDevices: deviceCount,
          maxDevices: licenseData.features.maxDevices,
          upgradeUrl: process.env.BILLING_UPGRADE_URL,
        }
      );
      */
    }
  } catch (error) {
    console.error('❌ Usage reporter job failed:', error);
  }
}
```

---

### 5. License Info Endpoint

**File**: `api/src/routes/license.ts`

```typescript
import express from 'express';
import { LicenseValidator } from '../services/license-validator';
import { DeviceModel } from '../db/models';

const router = express.Router();

/**
 * GET /api/license
 * Get current license information
 */
router.get('/license', async (req, res) => {
  try {
    const license = LicenseValidator.getInstance();
    const licenseData = license.getLicense();
    const devices = await DeviceModel.list({ isActive: true });
    
    res.json({
      customer: {
        id: licenseData.customerId,
        name: licenseData.customerName,
      },
      plan: licenseData.plan,
      subscription: {
        status: licenseData.subscription.status,
        currentPeriodEndsAt: licenseData.subscription.currentPeriodEndsAt,
      },
      trial: licenseData.trial.isTrialMode ? {
        isActive: true,
        expiresAt: licenseData.trial.expiresAt,
        daysRemaining: license.getTrialDaysRemaining(),
      } : null,
      features: licenseData.features,
      limits: licenseData.limits,
      usage: {
        devices: {
          current: devices.length,
          max: licenseData.features.maxDevices,
          percentUsed: Math.round((devices.length / licenseData.features.maxDevices) * 100),
        },
      },
      upgradeUrl: process.env.BILLING_UPGRADE_URL || 'https://iotistic.ca/upgrade',
    });
  } catch (error) {
    console.error('Error fetching license info:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

---

### 6. Initialize License on Startup

**File**: `api/src/index.ts` (add to existing server)

```typescript
// Add to existing imports
import { LicenseValidator } from './services/license-validator';
import licenseRouter from './routes/license';

// Add to existing startup sequence
async function startServer() {
  try {
    // ... existing database connection ...
    
    // Initialize license validator
    console.log('🔐 Initializing license validator...');
    const licenseValidator = LicenseValidator.getInstance();
    await licenseValidator.init();
    
    // ... existing routes ...
    
    // Add license routes
    app.use('/api', licenseRouter);
    
    // ... rest of server startup ...
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}
```

---

### 7. Register Usage Reporter Job

**File**: `api/src/jobs/index.ts`

```typescript
import cron from 'node-cron';
import { usageReporterJob } from './usage-reporter';

// COMMENTED OUT: Cron job registration (until postoffice ready)
/*
// Report usage daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  await usageReporterJob();
});
*/

// For now, just log that it's ready
console.log('📊 Usage reporter job ready (currently disabled)');
```

---

## Environment Variables (Customer Instance)

**Add to `.env`**:

```bash
# License Configuration
IOTISTIC_LICENSE_KEY=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9... # JWT from Global Billing API
LICENSE_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\nMIIBIj..." # Public key for validation

# Optional: Global Billing API (for usage reporting)
# BILLING_API_URL=https://billing.iotistic.ca
# BILLING_UPGRADE_URL=https://iotistic.ca/upgrade
# BILLING_PORTAL_URL=https://iotistic.ca/billing
```

---

## Example API Usage with Feature Guards

```typescript
// In your routes
import { requireFeature, checkDeviceLimit, requireActiveSubscription } from '../middleware/feature-guard';

// Require data export feature
router.get('/api/export', requireFeature('canExportData'), async (req, res) => {
  // Export logic here
});

// Check device limit before adding
router.post('/api/devices', requireActiveSubscription, checkDeviceLimit, async (req, res) => {
  // Add device logic here
});

// Advanced alerts only for premium plans
router.post('/api/alerts/advanced', requireFeature('hasAdvancedAlerts'), async (req, res) {
  // Advanced alert logic
});
```

---

## What About the Global Billing API?

**YOU WILL NEED TO BUILD THIS SEPARATELY** (not in this repo).

**Recommended Tech Stack**:
- Node.js/TypeScript
- Stripe SDK
- PostgreSQL
- JWT signing (RS256 with private key)
- Email service (SendGrid/Postmark)

**Global Billing API Responsibilities**:
1. Customer sign-up
2. Stripe subscription creation
3. License key generation (JWT with feature flags)
4. Usage-based billing (receive reports from customer instances)
5. Trial management
6. Email notifications

**Can reuse** from `api/billing/`:
- ✅ Stripe integration code
- ✅ Trial management logic
- ✅ Email templates
- ✅ Subscription lifecycle

---

## Summary

### ✅ Implement in Customer Instance (This Repo)

1. **License Validation** (`license-validator.ts`) - JWT verification
2. **Feature Guards** (`feature-guard.ts`) - Middleware to block features
3. **Usage Reporter** (`usage-reporter.ts`) - Send device count to billing API (commented out for now)
4. **License Endpoint** (`routes/license.ts`) - Show license info
5. **System Config** - Cache license data (already exists)

### 🌐 Build Separately (Global Billing SaaS)

1. **Stripe Integration** - Subscription management
2. **License Generator** - Create JWT licenses
3. **Customer Portal** - Sign-up, billing, upgrade
4. **Usage Aggregation** - Receive reports from all instances
5. **Trial Management** - Email notifications, expiration

### 🔮 Later (When Postoffice Ready)

1. Uncomment email notifications
2. Uncomment usage reporter cron job
3. Add trial expiration warnings

---

## Next Steps

1. **Review this architecture** - Does it fit your business model?
2. **Implement license validation** - Start with the 7 files above
3. **Test with fake license** - Generate a JWT manually
4. **Plan Global Billing API** - Separate project (can reuse `api/billing/` code)

Let me know if you want me to implement the customer instance code! 🚀
