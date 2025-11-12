/**
 * AGENT PROCESS MEMORY MONITORING
 * =================================
 * 
 * Monitors the agent process's own memory usage to detect memory leaks.
 * Based on Balena Supervisor's memory healthcheck pattern.
 * 
 * How it works:
 * 1. Waits 20 seconds after startup to establish baseline
 * 2. Measures initial RSS memory when process is settled
 * 3. Compares current memory to baseline + threshold (15MB default)
 * 4. Fails healthcheck if growth exceeds threshold
 */

import { memoryUsage } from 'process';

export let initialMemory: number = 0;
let lastMemoryCheck: number = 0;

// Exported for tests only, as process.uptime cannot be stubbed
export const processUptime = () => Math.floor(process.uptime());

const secondsToHumanReadable = (seconds: number) => {
	const hours = Math.floor(seconds / 3600);
	const minutes = Math.floor((seconds - hours * 3600) / 60);
	const secondsRemainder = seconds - hours * 3600 - minutes * 60;
	return `${hours}h ${minutes}m ${secondsRemainder}s`;
};

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
		console.log(
			`[Memory Monitor] Baseline established: ${bytesToMB(initialMemory)}MB after ${secondsToHumanReadable(processUptime())}`
		);
		return true;
	}

	// Calculate memory growth
	const memoryGrowth = currentMemory - initialMemory;
	
	// Fail healthcheck if memory usage is above threshold
	if (memoryGrowth > thresholdBytes) {
		console.error(
			`[Memory Monitor] FAILED - memory growth ${bytesToMB(memoryGrowth)}MB exceeds threshold ${bytesToMB(thresholdBytes)}MB after ${secondsToHumanReadable(processUptime())}`,
			{
				initial: `${bytesToMB(initialMemory)}MB`,
				current: `${bytesToMB(currentMemory)}MB`,
				growth: `${bytesToMB(memoryGrowth)}MB`,
				threshold: `${bytesToMB(thresholdBytes)}MB`,
			}
		);
		return false;
	}

	// Log significant memory changes (> 5MB)
	const changeSinceLastCheck = Math.abs(currentMemory - lastMemoryCheck);
	if (changeSinceLastCheck > 5 * 1024 * 1024) {
		console.log(
			`[Memory Monitor] Memory change detected: ${bytesToMB(lastMemoryCheck)}MB -> ${bytesToMB(currentMemory)}MB (${bytesToMB(memoryGrowth)}MB growth from baseline)`
		);
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
