/**
 * Generic retry policy for any async operation
 * Optimized for edge devices - zero external dependencies
 */

export interface RetryPolicyConfig {
	maxAttempts: number;
	baseDelayMs: number;
	maxDelayMs: number;
	backoffMultiplier: number;
	onRetry?: (attempt: number, error: unknown, remainingAttempts: number) => void;
	onFailure?: (error: unknown, totalAttempts: number) => void;
	onSuccess?: () => void;
}

export interface RetryableError {
	isRetryable: (error: unknown) => boolean;
}

/**
 * Simple retry policy for network operations
 * No external dependencies, minimal memory footprint
 */
export class RetryPolicy {
	private consecutiveFailures: number = 0;
	
	constructor(
		private config: RetryPolicyConfig,
		private errorClassifier: RetryableError
	) {}
	
	/**
	 * Execute function with retry logic
	 * @returns Result of successful execution
	 * @throws Last error if all retries exhausted
	 */
	async execute<T>(fn: () => Promise<T>): Promise<T> {
		let lastError: unknown;
		
		for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
			try {
				const result = await fn();
				
				// Success - reset counter and call callback
				this.consecutiveFailures = 0;
				this.config.onSuccess?.();
				
				return result;
			} catch (error) {
				lastError = error;
				this.consecutiveFailures++;
				
				// Check if error is retryable
				if (!this.errorClassifier.isRetryable(error)) {
					// Non-retryable error - fail fast
					this.config.onFailure?.(error, attempt);
					throw error;
				}
				
				// Last attempt - don't wait, just throw
				if (attempt >= this.config.maxAttempts) {
					this.config.onFailure?.(error, attempt);
					break;
				}
				
				// Calculate backoff and notify
				const delay = this.calculateBackoff(attempt);
				const remaining = this.config.maxAttempts - attempt;
				
				this.config.onRetry?.(attempt, error, remaining);
				
				// Wait before next attempt
				await this.sleep(delay);
			}
		}
		
		// All attempts exhausted
		throw lastError;
	}
	
	/**
	 * Execute with simplified error handling
	 * Returns undefined if all retries fail instead of throwing
	 */
	async executeSafe<T>(fn: () => Promise<T>): Promise<T | undefined> {
		try {
			return await this.execute(fn);
		} catch {
			return undefined;
		}
	}
	
	/**
	 * Get current consecutive failure count
	 */
	getConsecutiveFailures(): number {
		return this.consecutiveFailures;
	}
	
	/**
	 * Get remaining attempts before giving up
	 */
	getRemainingAttempts(): number {
		return Math.max(0, this.config.maxAttempts - this.consecutiveFailures);
	}
	
	/**
	 * Check if we've hit max failures
	 */
	hasExhaustedRetries(): boolean {
		return this.consecutiveFailures >= this.config.maxAttempts;
	}
	
	/**
	 * Manually reset failure counter
	 */
	reset(): void {
		this.consecutiveFailures = 0;
	}
	
	/**
	 * Calculate exponential backoff delay
	 */
	private calculateBackoff(attempt: number): number {
		const delay = this.config.baseDelayMs * 
			Math.pow(this.config.backoffMultiplier, attempt - 1);
		return Math.min(delay, this.config.maxDelayMs);
	}
	
	/**
	 * Sleep helper
	 */
	private sleep(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}
	
	/**
	 * Calculate exponential backoff delay with optional jitter
	 * Useful for scheduling retry intervals in polling loops
	 * 
	 * @param attempt Current attempt number (1-based)
	 * @param baseDelayMs Initial delay in milliseconds
	 * @param multiplier Exponential backoff multiplier (typically 2)
	 * @param maxDelayMs Maximum delay cap
	 * @param jitterPercent Optional jitter as percentage (0.3 = ±30%), prevents thundering herd
	 * @returns Calculated delay in milliseconds
	 */
	static calculateBackoffWithJitter(
		attempt: number,
		baseDelayMs: number,
		multiplier: number,
		maxDelayMs: number,
		jitterPercent: number = 0
	): number {
		// Calculate base exponential backoff
		const exponentialDelay = baseDelayMs * Math.pow(multiplier, attempt - 1);
		const cappedDelay = Math.min(exponentialDelay, maxDelayMs);
		
		// Apply jitter if requested
		if (jitterPercent > 0) {
			const jitter = (Math.random() * 2 - 1) * jitterPercent; // Random between -jitterPercent and +jitterPercent
			return Math.floor(cappedDelay * (1 + jitter));
		}
		
		return cappedDelay;
	}
}
