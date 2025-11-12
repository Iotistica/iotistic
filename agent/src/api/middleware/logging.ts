/**
 * Request logging middleware
 */

import type { Request, Response, NextFunction } from 'express';
import type { AgentLogger } from '../../logging/agent-logger';
import { LogComponents } from '../../logging/types';

let logger: AgentLogger | undefined;

export function setLogger(agentLogger?: AgentLogger) {
	logger = agentLogger;
}

export default function logging(req: Request, res: Response, next: NextFunction) {
	const start = Date.now();
	
	res.on('finish', () => {
		const duration = Date.now() - start;
		const logMessage = `${req.method} ${req.path}`;
		const context = {
			component: LogComponents.deviceApi,
			statusCode: res.statusCode,
			duration: `${duration}ms`,
			method: req.method,
			path: req.path
		};
		
		if (logger) {
			if (res.statusCode >= 500) {
				logger.errorSync(logMessage, undefined, context);
			} else if (res.statusCode >= 400) {
				logger.warnSync(logMessage, context);
			} else {
				// Changed to infoSync so all successful requests are visible
				logger.infoSync(logMessage, context);
			}
		} else {
			// Fallback to console if logger not available
			console.log(`${logMessage} - ${res.statusCode} (${duration}ms)`);
		}
	});
	
	next();
}
