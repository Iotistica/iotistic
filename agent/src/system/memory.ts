/**
 * AGENT PROCESS MEMORY MONITORING
 * =================================
 * 
 * Monitors the agent process's own memory usage to detect memory leaks.
 * 
 * How it works:
 * 1. Waits 20 seconds after startup to establish baseline
 * 2. Measures initial RSS memory when process is settled
 * 3. Compares current memory to baseline + threshold (15MB default)
 * 4. Fails healthcheck if growth exceeds threshold
 */

import { memoryUsage } from 'process';
import type { AgentLogger } from '../logging/agent-logger';
import { LogComponents } from '../logging/types';

export let initialMemory: number = 0;
let lastMemoryCheck: number = 0;
let logger: AgentLogger | undefined;

// Exported for tests only, as process.uptime cannot be stubbed
export const processUptime = () => Math.floor(process.uptime());

/**
 * Set logger for memory monitoring
 */
export function setMemoryLogger(agentLogger: AgentLogger | undefined): void {
	logger = agentLogger;
}


const bytesToMB = (bytes: number) => (bytes / (1024 * 1024)).toFixed(2);

// 15MB default threshold for memory growth
const MEMORY_THRESHOLD_BYTES = 15 * 1024 * 1024;

/**
 * Returns false if agent process memory usage is above threshold,
 * otherwise returns true.
 * 
 * Use this in your healthcheck array to monitor for memory leaks.
 */
export async function healthcheck(
	thresholdBytes: number = MEMORY_THRESHOLD_BYTES,
): Promise<boolean> {
	const currentMemory = memoryUsage.rss();
	
	// Measure initial memory after 20 seconds so that startup operations
	// don't affect accuracy.
	if (processUptime() < 20) {
		return true;
	}

	// Pass healthcheck while initial memory usage hasn't been measured
	if (initialMemory === 0) {
		initialMemory = currentMemory;
		lastMemoryCheck = currentMemory;
		logger?.infoSync('Memory baseline established', {
			component: LogComponents.metrics,
			baselineMB: bytesToMB(initialMemory),
			uptimeSeconds: processUptime()
		});
		return true;
	}

	// Calculate memory growth
	const memoryGrowth = currentMemory - initialMemory;
	
	// Fail healthcheck if memory usage is above threshold
	if (memoryGrowth > thresholdBytes) {
		logger?.errorSync('Memory growth exceeds threshold', undefined, {
			component: LogComponents.metrics,
			initialMB: bytesToMB(initialMemory),
			currentMB: bytesToMB(currentMemory),
			growthMB: bytesToMB(memoryGrowth),
			thresholdMB: bytesToMB(thresholdBytes),
			uptimeSeconds: processUptime()
		});
		return false;
	}

	// Log significant memory changes (> 5MB)
	const changeSinceLastCheck = Math.abs(currentMemory - lastMemoryCheck);
	if (changeSinceLastCheck > 5 * 1024 * 1024) {
		logger?.infoSync('Memory change detected', {
			component: LogComponents.metrics,
			previousMB: bytesToMB(lastMemoryCheck),
			currentMB: bytesToMB(currentMemory),
			growthMB: bytesToMB(memoryGrowth)
		});
		lastMemoryCheck = currentMemory;
	}

	// Pass healthcheck if memory usage is below threshold
	return true;
}

/**
 * Get current memory statistics
 */
export function getMemoryStats() {
	const current = memoryUsage.rss();
	const growth = initialMemory > 0 ? current - initialMemory : 0;
	
	return {
		initial: initialMemory,
		current,
		growth,
		uptime: processUptime(),
		initialMB: bytesToMB(initialMemory),
		currentMB: bytesToMB(current),
		growthMB: bytesToMB(growth),
	};
}
