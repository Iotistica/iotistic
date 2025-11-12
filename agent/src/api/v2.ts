/**
 * Device API v2 Router
 * Extended API with more features
 */

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import * as actions from './actions';

export const router = express.Router();

/**
 * POST /v2/applications/:appId/restart
 * Restart an entire application
 */
router.post('/v2/applications/:appId/restart', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const appId = parseInt(req.params.appId);
		const force = req.body.force === true || req.body.force === 'true';

		if (isNaN(appId)) {
			return res.status(400).json({
				status: 'failed',
				message: 'Invalid app id',
			});
		}

		await actions.restartApp(appId, force);
		return res.status(200).send('OK');
	} catch (error) {
		next(error);
	}
});

/**
 * POST /v2/applications/:appId/restart-service
 * Restart a specific service
 */
router.post('/v2/applications/:appId/restart-service', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const appId = parseInt(req.params.appId);
		const serviceName = req.body.serviceName;
		const force = req.body.force === true || req.body.force === 'true';

		if (isNaN(appId)) {
			return res.status(400).json({
				status: 'failed',
				message: 'Invalid app id',
			});
		}

		if (!serviceName) {
			return res.status(400).json({
				status: 'failed',
				message: 'Service name is required',
			});
		}

		// Stop then start the service
		await actions.stopService(appId, serviceName, force);
		await actions.startService(appId, serviceName, force);

		return res.status(200).send('OK');
	} catch (error) {
		next(error);
	}
});

/**
 * POST /v2/applications/:appId/stop-service
 * Stop a specific service
 */
router.post('/v2/applications/:appId/stop-service', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const appId = parseInt(req.params.appId);
		const serviceName = req.body.serviceName;
		const force = req.body.force === true || req.body.force === 'true';

		if (isNaN(appId)) {
			return res.status(400).json({
				status: 'failed',
				message: 'Invalid app id',
			});
		}

		if (!serviceName) {
			return res.status(400).json({
				status: 'failed',
				message: 'Service name is required',
			});
		}

		await actions.stopService(appId, serviceName, force);
		return res.status(200).send('OK');
	} catch (error) {
		next(error);
	}
});

/**
 * POST /v2/applications/:appId/start-service
 * Start a specific service
 */
router.post('/v2/applications/:appId/start-service', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const appId = parseInt(req.params.appId);
		const serviceName = req.body.serviceName;
		const force = req.body.force === true || req.body.force === 'true';

		if (isNaN(appId)) {
			return res.status(400).json({
				status: 'failed',
				message: 'Invalid app id',
			});
		}

		if (!serviceName) {
			return res.status(400).json({
				status: 'failed',
				message: 'Service name is required',
			});
		}

		await actions.startService(appId, serviceName, force);
		return res.status(200).send('OK');
	} catch (error) {
		next(error);
	}
});

/**
 * POST /v2/applications/:appId/purge
 * Purge application data
 */
router.post('/v2/applications/:appId/purge', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const appId = parseInt(req.params.appId);
		const force = req.body.force === true || req.body.force === 'true';

		if (isNaN(appId)) {
			return res.status(400).json({
				status: 'failed',
				message: 'Invalid app id',
			});
		}

		await actions.purgeApp(appId, force);
		return res.status(200).send('OK');
	} catch (error) {
		next(error);
	}
});

/**
 * GET /v2/applications/state
 * Get current state of all applications
 */
router.get('/v2/applications/state', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const deviceState = await actions.getDeviceState();
		return res.status(200).json(deviceState);
	} catch (error) {
		next(error);
	}
});

/**
 * GET /v2/device/name
 * Get device name
 */
router.get('/v2/device/name', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const deviceState = await actions.getDeviceState();
		return res.status(200).json({
			deviceName: deviceState.deviceName || 'unknown',
		});
	} catch (error) {
		next(error);
	}
});

/**
 * GET /v2/connection/health
 * Get connection health status
 */
router.get('/v2/connection/health', async (req: Request, res: Response, next: NextFunction) => {
	try {
		const health = await actions.getConnectionHealth();
		return res.status(200).json(health);
	} catch (error) {
		next(error);
	}
});

/**
 * GET /v2/version
 * Get API version info
 */
router.get('/v2/version', async (req: Request, res: Response) => {
	return res.status(200).json({
		status: 'success',
		version: '2.0.0',
		api_version: 'v2',
	});
});

export default router;
