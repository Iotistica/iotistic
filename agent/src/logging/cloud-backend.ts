/**
 * Cloud Log Backend
 * ==================
 * 
 * Streams container logs to cloud API in real-time
 * 
 * Features:
 * - Streams logs via HTTP POST
 * - Compression with gzip
 * - Local buffering during network issues
 * - Automatic reconnection with exponential backoff
 * - NDJSON format (newline-delimited JSON)
 */

import { Writable } from 'stream';
import zlib from 'zlib';
import type { LogBackend, LogMessage, LogFilter } from './types';
import { buildApiEndpoint } from '../utils/api-utils';
import type { AgentLogger } from '../logging/agent-logger';

/**
 * Cloud Log Backend Configuration
 */
interface CloudLogBackendConfig {
	cloudEndpoint: string;
	deviceUuid: string;
	deviceApiKey?: string;
	compression?: boolean;
	batchSize?: number;
	maxRetries?: number;
	bufferSize?: number;
	flushInterval?: number;
	reconnectInterval?: number;
	maxReconnectInterval?: number;
	// Sampling configuration (reduce log volume)
	samplingRates?: {
		error?: number;   // Default: 1.0 (100% - all errors)
		warn?: number;    // Default: 1.0 (100% - all warnings)
		info?: number;    // Default: 0.1 (10% - sample info logs)
		debug?: number;   // Default: 0.01 (1% - sample debug logs)
	};
}

export class CloudLogBackend implements LogBackend {
	private config: Required<CloudLogBackendConfig>;
	private buffer: LogMessage[] = [];
	private isStreaming: boolean = false;
	private retryCount: number = 0;
	private abortController?: AbortController;
	private logger?: AgentLogger;
	private flushTimer?: NodeJS.Timeout;
	private reconnectTimer?: NodeJS.Timeout;
	private samplingRates: Required<NonNullable<CloudLogBackendConfig['samplingRates']>>;
	private sampledLogCount: number = 0;
	private totalLogCount: number = 0;
	
	constructor(config: CloudLogBackendConfig, logger?: AgentLogger) {

		this.logger = logger;
		this.config = {
			cloudEndpoint: config.cloudEndpoint,
			deviceUuid: config.deviceUuid,
			deviceApiKey: config.deviceApiKey ?? '',
			compression: config.compression ?? true,
			batchSize: config.batchSize ?? 100,
			maxRetries: config.maxRetries ?? 3,
			
			bufferSize: config.bufferSize ?? 256 * 1024, // 256KB
			flushInterval: config.flushInterval ?? 100, // 100ms
			reconnectInterval: config.reconnectInterval ?? 5000, // 5s
			maxReconnectInterval: config.maxReconnectInterval ?? 300000, // 5min
			samplingRates: config.samplingRates ?? { debug: 1, info: 1, warn: 1, error: 1 },
		};
		
		// Initialize sampling rates with defaults
		this.samplingRates = {
			error: config.samplingRates?.error ?? 1.0,   // 100% - all errors
			warn: config.samplingRates?.warn ?? 1.0,     // 100% - all warnings
			info: config.samplingRates?.info ?? 0.1,     // 10% - sample info logs
			debug: config.samplingRates?.debug ?? 0.01,  // 1% - sample debug logs
		};
	}
	
	async initialize(): Promise<void> {
		this.logger?.infoSync('Initializing Cloud Log Backend...', { component: 'Logs' });
		this.logger?.infoSync('Configuration loaded', { 
			component: 'Logs',
			endpoint: this.config.cloudEndpoint,
			device: this.config.deviceUuid,
			compression: this.config.compression,
			samplingRates: {
				error: `${(this.samplingRates.error * 100).toFixed(0)}%`,
				warn: `${(this.samplingRates.warn * 100).toFixed(0)}%`,
				info: `${(this.samplingRates.info * 100).toFixed(0)}%`,
				debug: `${(this.samplingRates.debug * 100).toFixed(1)}%`
			}
		});
		
		// Start streaming
		await this.connect();
		
		this.logger?.infoSync('Cloud Log Backend initialized', { component: 'Logs' });
	
	}
	
	async log(logMessage: LogMessage): Promise<void> {
		this.totalLogCount++;
		
		// Apply sampling based on log level
		if (!this.shouldSample(logMessage)) {
			// Log sampled out
			return;
		}
		
		this.sampledLogCount++;
		
		// Add to buffer
		this.buffer.push(logMessage);
		
		this.logger?.debugSync('Buffered log', { 
			component: 'Logs',
			bufferSize: this.buffer.length,
			samplingRatio: `${this.sampledLogCount}/${this.totalLogCount}`,
			service: logMessage.serviceName,
			messagePreview: logMessage.message.substring(0, 50)
		});
		
		// Schedule flush if not already scheduled
		if (!this.flushTimer) {
			this.flushTimer = setTimeout(() => {
				this.flush();
			}, this.config.flushInterval);
		}
		
		// Check buffer size (prevent memory overflow)
		const bufferBytes = JSON.stringify(this.buffer).length;
		if (bufferBytes > this.config.bufferSize) {
			this.logger?.warnSync('Log buffer full, forcing flush', { 
				component: 'Logs',
				bufferSizeKB: Math.round(bufferBytes / 1024)
			});
			await this.flush();
		}
	}
	
	async getLogs(filter?: LogFilter): Promise<LogMessage[]> {
		// CloudLogBackend doesn't store logs locally (they're streamed to cloud)
		// Return empty array
		return [];
	}
	
	async getLogCount(): Promise<number> {
		return 0;
	}
	
	async cleanup(olderThanMs: number): Promise<number> {
		// CloudLogBackend doesn't store logs locally
		return 0;
	}
	
	async stop(): Promise<void> {
		this.logger?.infoSync('Stopping Cloud Log Backend...', { component: 'Logs' });
		
		// Flush remaining logs
		await this.flush();
		
		// Stop streaming
		this.isStreaming = false;
		
		// Cancel any pending operations
		if (this.abortController) {
			this.abortController.abort();
		}
		
		// Clear timers
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
		}
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
		}
		
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
		}
		
		this.logger?.infoSync('Cloud Log Backend stopped', { component: 'Logs' });
	}
	
	// ============================================================================
	// PRIVATE METHODS
	// ============================================================================
	
	private async connect(): Promise<void> {
		if (this.isStreaming) {
			return;
		}
		
		this.isStreaming = true;
		this.logger?.infoSync('Connecting to cloud log stream...', { component: 'Logs' });
	}
	
	private async flush(): Promise<void> {
		// Clear flush timer
		if (this.flushTimer) {
			clearTimeout(this.flushTimer);
			this.flushTimer = undefined;
		}
		
		// Nothing to flush
		if (this.buffer.length === 0) {
			return;
		}
		
		// Split buffer into smaller batches if too large
		const batchSize = this.config.batchSize;
		const batches: LogMessage[][] = [];
		
		for (let i = 0; i < this.buffer.length; i += batchSize) {
			batches.push(this.buffer.slice(i, i + batchSize));
		}
		
		this.logger?.infoSync('Flushing logs to cloud', { 
			component: 'Logs',
			totalLogs: this.buffer.length,
			batches: batches.length,
			batchSize
		});
		
		// Clear buffer immediately to prevent duplicate sends
		this.buffer = [];
		
		// Send batches sequentially
		const failedLogs: LogMessage[] = [];
		
		for (const batch of batches) {
			try {
				await this.sendLogs(batch);
				this.retryCount = 0; // Reset on success
			} catch (error) {
				this.logger?.errorSync('Failed to send batch', error instanceof Error ? error : undefined, { 
					component: 'Logs',
					batchSize: batch.length
				});
				
				// Check if it's a DNS error (unrecoverable until config fixed)
				const isDnsError = error instanceof Error && 
					('cause' in error && error.cause && 
					typeof error.cause === 'object' && 
					'code' in error.cause && 
					error.cause.code === 'ENOTFOUND');
				
				if (isDnsError) {
					this.logger?.errorSync('DNS resolution failed - check CLOUD_API_ENDPOINT environment variable', undefined, { component: 'Logs' });
					console.error('Hint: If using network_mode: host, use http://localhost:PORT instead of container names');
					// Drop logs on DNS errors to prevent infinite accumulation
					this.logger?.warnSync('Dropping logs due to DNS configuration error', { 
						component: 'Logs',
						droppedLogs: batch.length
					});
					continue;
				}
				
				// For other errors, keep logs for retry
				failedLogs.push(...batch);
				this.retryCount++;
			}
		}
		
		// Re-add failed logs to buffer (at the beginning) but limit total buffer size
		if (failedLogs.length > 0) {
			const maxBufferLogs = 500; // Maximum logs to keep in buffer
			const logsToKeep = failedLogs.slice(-maxBufferLogs); // Keep most recent
			
			if (failedLogs.length > maxBufferLogs) {
				this.logger?.warnSync('Buffer overflow: dropping oldest logs', { 
					component: 'Logs',
					droppedLogs: failedLogs.length - maxBufferLogs
				});
			}
			
			this.buffer = [...logsToKeep, ...this.buffer];
			
			// Schedule reconnect with exponential backoff
			this.scheduleReconnect();
		}
	}
	
	private async sendLogs(logs: LogMessage[]): Promise<void> {
		const endpoint = buildApiEndpoint(this.config.cloudEndpoint, `/device/${this.config.deviceUuid}/logs`);
		
		// Convert to NDJSON (newline-delimited JSON)
		const ndjson = logs.map(log => JSON.stringify(log)).join('\n') + '\n';
		
		// Compress if enabled
		let body: string | Buffer = ndjson;
		const headers: Record<string, string> = {
			'Content-Type': 'application/x-ndjson',
			'X-Device-API-Key': this.config.deviceApiKey || '',
		};
		
		if (this.config.compression) {
			body = await this.compress(ndjson);
			headers['Content-Encoding'] = 'gzip';
		}
		
		// Create abort controller with timeout
		this.abortController = new AbortController();
		const timeoutId = setTimeout(() => {
			this.abortController?.abort();
		}, 30000); // 30 second timeout
		
		try {
			// Send to cloud
			const response = await fetch(endpoint, {
				method: 'POST',
				headers,
				body,
				signal: this.abortController.signal,
			});
			
			clearTimeout(timeoutId);
			
			if (!response.ok) {
				const responseText = await response.text();
				this.logger?.errorSync(`HTTP ${response.status}: ${response.statusText}`, undefined, { 
					component: 'Logs',
					responsePreview: responseText.substring(0, 200)
				});
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}
			
			this.logger?.infoSync('Successfully sent logs to cloud', { 
				component: 'Logs',
				logCount: logs.length,
				httpStatus: response.status
			});
		} catch (error) {
			clearTimeout(timeoutId);
			throw error;
		}
	}
	
	private async compress(data: string): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			zlib.gzip(data, (err, result) => {
				if (err) {
					reject(err);
				} else {
					resolve(result);
				}
			});
		});
	}
	
	private scheduleReconnect(): void {
		if (this.reconnectTimer) {
			return; // Already scheduled
		}
		
		// Calculate backoff delay (exponential)
		const delay = Math.min(
			this.config.reconnectInterval * Math.pow(2, this.retryCount - 1),
			this.config.maxReconnectInterval
		);
		
		this.logger?.infoSync('Retrying log upload', { 
			component: 'Logs',
			retryInSeconds: Math.round(delay / 1000),
			retryCount: this.retryCount
		});
		
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = undefined;
			this.flush();
		}, delay);
	}
	
	/**
	 * Determine if a log should be sampled (kept) or discarded
	 * Based on log level and configured sampling rates
	 */
	private shouldSample(logMessage: LogMessage): boolean {
		// Detect log level from message content
		const level = this.detectLogLevel(logMessage);
		
		// Get sampling rate for this level
		const rate = this.samplingRates[level] ?? 1.0;
		
		// Sample: keep if random value is less than rate
		// Examples:
		//   rate = 1.0 → always keep (100%)
		//   rate = 0.1 → keep 10%
		//   rate = 0.01 → keep 1%
		return Math.random() < rate;
	}
	
	/**
	 * Detect log level from message content
	 * Uses regex patterns similar to dashboard display logic
	 */
	private detectLogLevel(logMessage: LogMessage): 'error' | 'warn' | 'info' | 'debug' {
		const msg = logMessage.message.toLowerCase();
		
		// Error patterns
		if (/\[error\]|\[crit\]|\[alert\]|\[emerg\]|error|fatal|critical/.test(msg)) {
			return 'error';
		}
		
		// Warning patterns
		if (/\[warn\]|warning/.test(msg)) {
			return 'warn';
		}
		
		// Debug patterns
		if (/\[debug\]|debug|trace/.test(msg)) {
			return 'debug';
		}
		
		// Default to info
		return 'info';
	}
}
