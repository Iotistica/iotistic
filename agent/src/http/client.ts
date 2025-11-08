/**
 * HTTP Client Interface for API Binder
 * =====================================
 * 
 * Abstraction layer over fetch() to make sync-state testable.
 * Allows easy mocking in tests without stubbing global fetch.
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
}

/**
 * Default implementation using native fetch
 */
export class FetchHttpClient implements HttpClient {
	async get<T = any>(url: string, options?: {
		headers?: Record<string, string>;
		timeout?: number;
	}): Promise<HttpResponse<T>> {
		const response = await fetch(url, {
			method: 'GET',
			headers: options?.headers,
			signal: options?.timeout ? AbortSignal.timeout(options.timeout) : undefined,
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
}
