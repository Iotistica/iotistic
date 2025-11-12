/**
 * Device API v1 Router
 * Simplified version of balena supervisor v1 API
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import * as actions from './actions';

export const router = express.Router();

/**
 * POST /v1/restart
 * Restart an application
 */
router.post('/v1/restart', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const appId = parseInt(req.body.appId);
		const force = req.body.force === true || req.body.force === 'true';

		if (isNaN(appId)) {
			return res.status(400).json({ error: 'Missing or invalid app id' });
		}

		await actions.restartApp(appId, force);
		return res.status(200).send('OK');
	} catch (error) {
		next(error);
	}
});

/**
 * POST /v1/apps/:appId/stop
 * Stop a service in an application
 */
router.post('/v1/apps/:appId/stop', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const appId = parseInt(req.params.appId);
		const force = req.body.force === true || req.body.force === 'true';

		if (isNaN(appId)) {
			return res.status(400).json({ error: 'Invalid app id' });
		}

		const service = await actions.stopService(appId, undefined, force);
		return res.status(200).json({ 
			containerId: service.containerId,
			status: 'stopped' 
		});
	} catch (error) {
		next(error);
	}
});

/**
 * POST /v1/apps/:appId/start
 * Start a service in an application
 */
router.post('/v1/apps/:appId/start', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const appId = parseInt(req.params.appId);
		const force = req.body.force === true || req.body.force === 'true';

		if (isNaN(appId)) {
			return res.status(400).json({ error: 'Invalid app id' });
		}

		const service = await actions.startService(appId, undefined, force);
		return res.status(200).json({ 
			containerId: service.containerId,
			status: 'started' 
		});
	} catch (error) {
		next(error);
	}
});

/**
 * GET /v1/apps/:appId
 * Get application information
 */
router.get('/v1/apps/:appId', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const appId = parseInt(req.params.appId);

		if (isNaN(appId)) {
			return res.status(400).json({ error: 'Invalid app id' });
		}

		const app = await actions.getApp(appId);
		return res.status(200).json(app);
	} catch (error) {
		next(error);
	}
});

/**
 * GET /v1/device
 * Get device state information
 */
router.get('/v1/device', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const deviceState = await actions.getDeviceState();
		return res.status(200).json(deviceState);
	} catch (error) {
		next(error);
	}
});

/**
 * POST /v1/purge
 * Purge application data (volumes)
 */
router.post('/v1/purge', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const appId = parseInt(req.body.appId);
		const force = req.body.force === true || req.body.force === 'true';

		if (isNaN(appId)) {
			return res.status(400).json({ error: 'Missing or invalid app id' });
		}

		await actions.purgeApp(appId, force);
		return res.status(200).send('OK');
	} catch (error) {
		next(error);
	}
});

/**
 * POST /v1/reboot
 * Reboot the device (placeholder - requires platform-specific implementation)
 */
router.post('/v1/reboot', async (req: Request, res: Response, next: NextFunction) => {
	try {
		console.log('Reboot requested');
		// This would need platform-specific implementation
		// For now, just return success
		return res.status(202).json({ 
			Data: 'Reboot scheduled', 
			Error: null 
		});
	} catch (error) {
		next(error);
	}
});

/**
 * POST /v1/shutdown
 * Shutdown the device (placeholder - requires platform-specific implementation)
 */
router.post('/v1/shutdown', async (req: Request, res: Response, next: NextFunction) => {
	try {
		console.log('Shutdown requested');
		// This would need platform-specific implementation
		// For now, just return success
		return res.status(202).json({ 
			Data: 'Shutdown scheduled', 
			Error: null 
		});
	} catch (error) {
		next(error);
	}
});

export default router;
