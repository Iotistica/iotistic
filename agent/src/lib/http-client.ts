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
	}

	async get<T = any>(url: string, options?: {
		headers?: Record<string, string>;
		timeout?: number;
	}): Promise<HttpResponse<T>> {
		const response = await fetch(url, {
			method: 'GET',
			headers: options?.headers,
			signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined,
			// @ts-ignore - Node.js fetch supports agent option
			...(this.isHttps(url) && this.getHttpsAgent(url)),
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
			...(this.isHttps(url) && this.getHttpsAgent(url)),
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
			...(this.isHttps(url) && this.getHttpsAgent(url)),
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

	private getHttpsAgent(url: string) {
		if (!this.isHttps(url)) return {};
		
		const https = require('https');
		
		// Debug: Log certificate details
		if (this.caCert) {
			console.log('[HttpClient] Using CA certificate:', {
				length: this.caCert.length,
				preview: this.caCert.substring(0, 100),
				hasBegin: this.caCert.includes('BEGIN CERTIFICATE'),
				hasNewlines: this.caCert.includes('\n'),
			});
		}
		
		const agent = new https.Agent({
			ca: this.caCert,
			rejectUnauthorized: this.rejectUnauthorized,
		});
		
		return { agent };
	}
}
