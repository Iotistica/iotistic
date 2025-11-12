/**
 * Authentication middleware (optional)
 * Can be enabled via ENABLE_AUTH=true and API_KEY env vars
 */

import type { Request, Response, NextFunction } from 'express';

const API_KEY = process.env.API_KEY;

export default function auth(req: Request, res: Response, next: NextFunction) {
	// Skip auth if not enabled
	if (process.env.ENABLE_AUTH !== 'true') {
		return next();
	}

	// Check API key in header or query
	const providedKey = req.headers['x-api-key'] || req.query.apiKey;
	
	if (!API_KEY) {
		console.warn('API_KEY not set but ENABLE_AUTH is true');
		return res.status(500).json({ error: 'API key not configured' });
	}

	if (providedKey !== API_KEY) {
		return res.status(401).json({ error: 'Unauthorized' });
	}

	next();
}
