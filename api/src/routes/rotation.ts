/**
 * API Key Rotation Routes
 * 
 * Endpoints for devices to manage their API keys
 */

import { Router, Request, Response } from 'express';
import { 
  rotateDeviceApiKey, 
  emergencyRevokeApiKey,
  getDeviceRotationStatus,
  getDeviceRotationHistory
} from '../services/api-key-rotation';
import { deviceAuth } from '../middleware/device-auth';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting for rotation endpoints
const rotationRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Max 5 rotation requests per hour per IP
  message: 'Too many rotation requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

/**
 * POST /device/:uuid/rotate-key
 * 
 * Rotate API key for a device
 * Requires valid current API key
 */
router.post('/device/:uuid/rotate-key', deviceAuth, rotationRateLimit, async (req: Request, res: Response) => {
  try {
    const { uuid } = req.params;
    const { reason } = req.body;

    // Verify device UUID matches authenticated device
    if (req.device?.uuid !== uuid) {
      return res.status(403).json({
        success: false,
        error: 'Cannot rotate API key for another device'
      });
    }

    const rotation = await rotateDeviceApiKey(uuid, {
      rotationDays: 90,
      gracePeriodDays: 7,
      notifyDevice: true,
      autoRevoke: true
    });

    res.json({
      success: true,
      message: 'API key rotated successfully',
      data: {
        new_api_key: rotation.newKey,
        expires_at: rotation.expiresAt.toISOString(),
        grace_period_ends: rotation.gracePeriodEnds.toISOString(),
        old_key_valid_until: rotation.gracePeriodEnds.toISOString()
      }
    });

  } catch (error) {
    console.error('API key rotation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to rotate API key',
      message: (error as Error).message
    });
  }
});

/**
 * GET /device/:uuid/key-status
 * 
 * Get rotation status for a device
 * Check if rotation is needed, days until expiry
 */
router.get('/device/:uuid/key-status', deviceAuth, async (req: Request, res: Response) => {
  try {
    const { uuid } = req.params;

    // Verify device UUID matches authenticated device
    if (req.device?.uuid !== uuid) {
      return res.status(403).json({
        success: false,
        error: 'Cannot view key status for another device'
      });
    }

    const status = await getDeviceRotationStatus(uuid);

    const needsRotation = status.days_until_expiry !== null && status.days_until_expiry <= 7;

    res.json({
      success: true,
      data: {
        device_uuid: status.uuid,
        device_name: status.device_name,
        rotation_enabled: status.api_key_rotation_enabled,
        rotation_days: status.api_key_rotation_days,
        expires_at: status.api_key_expires_at,
        last_rotated_at: status.api_key_last_rotated_at,
        days_until_expiry: status.days_until_expiry,
        needs_rotation: needsRotation,
        total_rotations: parseInt(status.total_rotations),
        active_keys: parseInt(status.active_keys)
      }
    });

  } catch (error) {
    console.error('Key status error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get key status',
      message: (error as Error).message
    });
  }
});

/**
 * GET /device/:uuid/rotation-history
 * 
 * Get rotation history for a device
 */
router.get('/device/:uuid/rotation-history', deviceAuth, async (req: Request, res: Response) => {
  try {
    const { uuid } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    // Verify device UUID matches authenticated device
    if (req.device?.uuid !== uuid) {
      return res.status(403).json({
        success: false,
        error: 'Cannot view rotation history for another device'
      });
    }

    const history = await getDeviceRotationHistory(uuid, limit);

    res.json({
      success: true,
      data: history.map(h => ({
        id: h.id,
        issued_at: h.issued_at,
        expires_at: h.expires_at,
        revoked_at: h.revoked_at,
        revoked_reason: h.revoked_reason,
        is_active: h.is_active
      }))
    });

  } catch (error) {
    console.error('Rotation history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get rotation history',
      message: (error as Error).message
    });
  }
});

/**
 * POST /admin/device/:uuid/emergency-revoke
 * 
 * Emergency revoke API key for a device (admin only)
 * This immediately invalidates the old key and issues a new one
 */
router.post('/admin/device/:uuid/emergency-revoke', async (req: Request, res: Response) => {
  try {
    const { uuid } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({
        success: false,
        error: 'Reason is required for emergency revocation'
      });
    }

    console.log(`🚨 Emergency revocation requested for device ${uuid}`);
    console.log(`   Reason: ${reason}`);

    await emergencyRevokeApiKey(uuid, reason);

    res.json({
      success: true,
      message: 'API key emergency revocation complete',
      data: {
        device_uuid: uuid,
        reason,
        revoked_at: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Emergency revocation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to revoke API key',
      message: (error as Error).message
    });
  }
});

export default router;
