/**
 * License Routes
 * Endpoints for viewing license information and feature availability
 */

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
