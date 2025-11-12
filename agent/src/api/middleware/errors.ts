/**
 * Error handling middleware
 */

import type { Request, Response, NextFunction } from 'express';

export default function errors(
	err: Error,
	req: Request,
	res: Response,
	next: NextFunction
) {
	console.error('API Error:', err);

	// Check if response already sent
	if (res.headersSent) {
		return next(err);
	}

	// Handle known error types
	if (err.message.includes('not found') || err.message.includes('Not found')) {
		return res.status(404).json({
			error: 'Not found',
			message: err.message,
		});
	}

	if (err.message.includes('Invalid') || err.message.includes('Bad request')) {
		return res.status(400).json({
			error: 'Bad request',
			message: err.message,
		});
	}

	// Default to 500 internal server error
	return res.status(500).json({
		error: 'Internal server error',
		message: err.message,
	});
}
