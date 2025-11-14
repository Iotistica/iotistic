/**
 * HTTP Client Interface for API Binder
 * =====================================
 * 
 * Abstraction layer over fetch() to make sync-state testable.
 * Allows easy mocking in tests without stubbing global fetch.
 * 
 * Supports HTTPS with custom CA certificates for self-signed certs.
 */

export interface HttpResponse<T = any> {
	ok: boolean;
	status: number;
	statusText: string;
	headers: {
		get(name: string): string | null;
	};
	json(): Promise<T>;
}

export interface HttpClientOptions {
	/** Custom CA certificate for HTTPS (PEM format) */
	caCert?: string;
	/** Whether to reject unauthorized certificates (default: true) */
	rejectUnauthorized?: boolean;
}

export interface HttpClient {
	/**
	 * Make HTTP GET request
	 */
	get<T = any>(url: string, options?: {
		headers?: Record<string, string>;
		timeout?: number;
	}): Promise<HttpResponse<T>>;
	
	/**
	 * Make HTTP POST request
	 */
	post<T = any>(url: string, body: any, options?: {
		headers?: Record<string, string>;
		timeout?: number;
		compress?: boolean;
	}): Promise<HttpResponse<T>>;
	
	/**
	 * Make HTTP PATCH request
	 */
	patch<T = any>(url: string, body: any, options?: {
		headers?: Record<string, string>;
		timeout?: number;
		compress?: boolean;
	}): Promise<HttpResponse<T>>;
}

/**
 * Default implementation using native fetch with HTTPS support
 */
export class FetchHttpClient implements HttpClient {
	private caCert?: string;
	private rejectUnauthorized: boolean;

	constructor(options?: HttpClientOptions) {
		this.caCert = options?.caCert;
		this.rejectUnauthorized = options?.rejectUnauthorized !== false;
		
		// For localhost development with self-signed certs, we need to disable TLS verification
		// Node.js fetch (undici) doesn't support per-request TLS options well
		if (options?.rejectUnauthorized === false) {
			console.log('[HttpClient] Setting NODE_TLS_REJECT_UNAUTHORIZED=0 for localhost HTTPS');
			process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
		}
	}

	async get<T = any>(url: string, options?: {
		headers?: Record<string, string>;
		timeout?: number;
	}): Promise<HttpResponse<T>> {
		const httpsAgent = this.isHttps(url) ? this.getHttpsAgent() : {};
		
		// Debug logging
		if (this.isHttps(url)) {
			console.log('[HttpClient] Making HTTPS request:', {
				url,
				hasAgent: !!(httpsAgent as any).agent,
				rejectUnauthorized: this.rejectUnauthorized
			});
		}
		
		const response = await fetch(url, {
			method: 'GET',
			headers: options?.headers,
			signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined,
			// @ts-ignore - Node.js fetch supports agent option
			...httpsAgent,
		});
		
		return {
			ok: response.ok,
			status: response.status,
			statusText: response.statusText,
			headers: {
				get: (name: string) => response.headers.get(name)
			},
			json: () => response.json() as Promise<T>
		};
	}
	
	async post<T = any>(url: string, body: any, options?: {
		headers?: Record<string, string>;
		timeout?: number;
		compress?: boolean;
	}): Promise<HttpResponse<T>> {
		let finalBody: any = body;
		let finalHeaders = { ...options?.headers };
		
		// Handle compression if requested
		if (options?.compress && typeof body === 'string') {
			const { gzip } = await import('zlib');
			const { promisify } = await import('util');
			const gzipAsync = promisify(gzip);
			finalBody = await gzipAsync(Buffer.from(body));
			finalHeaders['Content-Encoding'] = 'gzip';
		}
		
		const response = await fetch(url, {
			method: 'POST',
			headers: finalHeaders,
			body: typeof finalBody === 'string' ? finalBody : JSON.stringify(finalBody),
			signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined,
			// @ts-ignore - Node.js fetch supports agent option
			...(this.isHttps(url) ? this.getHttpsAgent() : {}),
		});
		
		return {
			ok: response.ok,
			status: response.status,
			statusText: response.statusText,
			headers: {
				get: (name: string) => response.headers.get(name)
			},
			json: () => response.json() as Promise<T>
		};
	}
	
	async patch<T = any>(url: string, body: any, options?: {
		headers?: Record<string, string>;
		timeout?: number;
		compress?: boolean;
	}): Promise<HttpResponse<T>> {
		let finalBody: any = body;
		let finalHeaders = { ...options?.headers };
		
		// Handle compression if requested
		if (options?.compress && typeof body === 'string') {
			const { gzip } = await import('zlib');
			const { promisify } = await import('util');
			const gzipAsync = promisify(gzip);
			finalBody = await gzipAsync(Buffer.from(body));
			finalHeaders['Content-Encoding'] = 'gzip';
		}
		
		const response = await fetch(url, {
			method: 'PATCH',
			headers: finalHeaders,
			body: finalBody,
			signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined,
			// @ts-ignore - Node.js fetch supports agent option
			...(this.isHttps(url) ? this.getHttpsAgent() : {}),
		});
		
		return {
			ok: response.ok,
			status: response.status,
			statusText: response.statusText,
			headers: {
				get: (name: string) => response.headers.get(name)
			},
			json: () => response.json() as Promise<T>
		};
	}

	private isHttps(url: string): boolean {
		return url.startsWith('https://');
	}

	private getHttpsAgent() {
		// Debug logging
		console.log('[HttpClient] Creating HTTPS agent:', {
			hasCaCert: !!this.caCert,
			rejectUnauthorized: this.rejectUnauthorized
		});
		
		// Node.js fetch uses undici internally but doesn't expose it
		// The agent option doesn't work reliably with fetch()
		// We've already set NODE_TLS_REJECT_UNAUTHORIZED in constructor if needed
		const https = require('https');
		const agent = new https.Agent({
			ca: this.caCert,
			rejectUnauthorized: this.rejectUnauthorized,
		});
		
		return { agent };
	}
}
