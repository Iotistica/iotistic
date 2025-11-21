/**
 * API Key Authentication Middleware
 * Validates service-level API keys from api_keys table
 * Used for internal service-to-service communication (e.g., Node-RED storage)
 */

import { Request, Response, NextFunction } from 'express';
import { query } from '../db/connection';
import logger from '../utils/logger';

export interface ApiKeyRequest extends Request {
  apiKey?: {
    id: number;
    name: string;
    description: string;
  };
}

/**
 * Middleware to validate API key from Authorization header
 * Expects: Authorization: Bearer <api-key>
 * 
 * Usage:
 *   router.get('/protected', validateApiKey, async (req, res) => { ... })
 */
export async function validateApiKey(
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract API key from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'API key required. Use Authorization: Bearer <api-key>'
      });
      return;
    }

    const apiKey = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!apiKey || apiKey.length < 32) {
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key format'
      });
      return;
    }

    // Look up API key in database
    const result = await query(
      `SELECT id, name, description, is_active, expires_at
       FROM api_keys
       WHERE key = $1`,
      [apiKey]
    );

    if (result.rows.length === 0) {
      logger.warn('Invalid API key attempted', {
        keyPrefix: apiKey.substring(0, 8),
        ip: req.ip,
        path: req.path
      });
      
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key'
      });
      return;
    }

    const keyRecord = result.rows[0];

    // Check if key is active
    if (!keyRecord.is_active) {
      logger.warn('Inactive API key attempted', {
        keyId: keyRecord.id,
        keyName: keyRecord.name,
        ip: req.ip
      });
      
      res.status(401).json({
        error: 'Unauthorized',
        message: 'API key is inactive'
      });
      return;
    }

    // Check if key is expired
    if (keyRecord.expires_at) {
      const expiresAt = new Date(keyRecord.expires_at);
      if (expiresAt < new Date()) {
        logger.warn('Expired API key attempted', {
          keyId: keyRecord.id,
          keyName: keyRecord.name,
          expiresAt: keyRecord.expires_at
        });
        
        res.status(401).json({
          error: 'Unauthorized',
          message: 'API key has expired'
        });
        return;
      }
    }

    // Update last_used_at (async, don't wait)
    query(
      `UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`,
      [keyRecord.id]
    ).catch(err => {
      logger.error('Failed to update API key last_used_at', {
        error: err.message,
        keyId: keyRecord.id
      });
    });

    // Attach API key info to request
    req.apiKey = {
      id: keyRecord.id,
      name: keyRecord.name,
      description: keyRecord.description
    };

    logger.debug('API key validated', {
      keyId: keyRecord.id,
      keyName: keyRecord.name,
      path: req.path
    });

    next();
  } catch (error: any) {
    logger.error('API key validation error', {
      error: error.message,
      stack: error.stack
    });
    
    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to validate API key'
    });
  }
}

/**
 * Optional middleware - validates API key if present, otherwise continues
 * Useful for endpoints that support both authenticated and unauthenticated access
 */
export async function optionalApiKey(
  req: ApiKeyRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No API key provided, continue without authentication
    next();
    return;
  }

  // API key provided, validate it
  await validateApiKey(req, res, next);
}
