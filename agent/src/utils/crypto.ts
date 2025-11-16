/**
 * CRYPTO UTILITIES - UUID Generation and API Key Generation
 * ==========================================================
 * 
 * Provides cryptographic utilities for device provisioning and security.
 */

import * as crypto from 'crypto';

/**
 * UUID Generator Interface for dependency injection
 */
export interface UuidGenerator {
	generate(): string;
}

/**
 * Default UUID generator using crypto.randomUUID (Node 14.17+)
 * Falls back to manual generation for older versions
 */
export class DefaultUuidGenerator implements UuidGenerator {
	generate(): string {
		// Use crypto.randomUUID if available (Node 14.17+)
		if (crypto.randomUUID) {
			return crypto.randomUUID();
		}
		// Fallback UUID v4 generator
		return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
			const r = Math.random() * 16 | 0;
			const v = c === 'x' ? r : (r & 0x3 | 0x8);
			return v.toString(16);
		});
	}
}

/**
 * Generate cryptographically secure API key
 * @returns 64-character hexadecimal API key
 */
export function generateAPIKey(): string {
	return crypto.randomBytes(32).toString('hex');
}
