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
let monitoringInterval: NodeJS.Timeout | undefined;
let memoryThresholdBreached: boolean = false;

// Memory leak simulation
let simulationInterval: NodeJS.Timeout | undefined;
let leakedObjects: any[] = [];

// Exported for tests only, as process.uptime cannot be stubbed
export const processUptime = () => Math.floor(process.uptime());

/**
 * Set logger for memory monitoring
 */
export function setMemoryLogger(agentLogger: AgentLogger | undefined): void {
	logger = agentLogger;
}

/**
 * Start active memory monitoring (runs independently of healthcheck)
 * This ensures memory leaks are detected even if /ping endpoint isn't called
 */
export function startMemoryMonitoring(
	intervalMs: number = 30000,
	thresholdBytes: number = 15 * 1024 * 1024,
	onThresholdBreached?: () => void
): void {
	// Don't start multiple monitors
	if (monitoringInterval) {
		logger?.warnSync('Memory monitoring already running', {
			component: LogComponents.metrics
		});
		return;
	}

	logger?.infoSync('Starting active memory monitoring', {
		component: LogComponents.metrics,
		intervalMs,
		thresholdMB: bytesToMB(thresholdBytes)
	});

	monitoringInterval = setInterval(async () => {
		try {
			const isHealthy = await healthcheck(thresholdBytes);
			
			// If threshold breached and callback provided
			if (!isHealthy && !memoryThresholdBreached && onThresholdBreached) {
				memoryThresholdBreached = true;
				logger?.errorSync('Memory threshold breached - invoking callback', undefined, {
					component: LogComponents.metrics,
					thresholdMB: bytesToMB(thresholdBytes)
				});
				onThresholdBreached();
			}
			
			// Reset flag if memory returns to normal
			if (isHealthy && memoryThresholdBreached) {
				memoryThresholdBreached = false;
				logger?.infoSync('Memory returned to normal levels', {
					component: LogComponents.metrics
				});
			}
		} catch (error) {
			logger?.errorSync(
				'Memory monitoring check failed',
				error instanceof Error ? error : new Error(String(error)),
				{
					component: LogComponents.metrics
				}
			);
		}
	}, intervalMs);
}

/**
 * Stop active memory monitoring
 */
export function stopMemoryMonitoring(): void {
	if (monitoringInterval) {
		clearInterval(monitoringInterval);
		monitoringInterval = undefined;
		memoryThresholdBreached = false;
		logger?.infoSync('Stopped active memory monitoring', {
			component: LogComponents.metrics
		});
	}
}

/**
 * Check if memory monitoring is running
 */
export function isMemoryMonitoringActive(): boolean {
	return monitoringInterval !== undefined;
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

/**
 * MEMORY LEAK SIMULATION
 * =======================
 * Simulates various memory leak patterns for testing monitoring and alerting.
 * Controlled via environment variables:
 * 
 * SIMULATE_MEMORY_LEAK=true - Enable simulation
 * LEAK_TYPE=gradual|sudden|cyclic - Leak pattern (default: gradual)
 * LEAK_RATE_MB=1 - MB to leak per interval (default: 1)
 * LEAK_INTERVAL_MS=5000 - Interval between leaks (default: 5000)
 * LEAK_MAX_MB=50 - Maximum MB to leak before stopping (default: 50)
 */

interface LeakSimulationConfig {
	enabled: boolean;
	type: 'gradual' | 'sudden' | 'cyclic';
	rateMB: number;
	intervalMs: number;
	maxMB: number;
}

function getLeakConfig(): LeakSimulationConfig {
	return {
		enabled: process.env.SIMULATE_MEMORY_LEAK === 'true',
		type: (process.env.LEAK_TYPE as any) || 'gradual',
		rateMB: parseInt(process.env.LEAK_RATE_MB || '1', 10),
		intervalMs: parseInt(process.env.LEAK_INTERVAL_MS || '5000', 10),
		maxMB: parseInt(process.env.LEAK_MAX_MB || '50', 10),
	};
}

/**
 * Start memory leak simulation
 */
export function startMemoryLeakSimulation(): void {
	const config = getLeakConfig();
	
	if (!config.enabled) {
		return;
	}

	// Don't start if already running
	if (simulationInterval) {
		logger?.warnSync('Memory leak simulation already running', {
			component: LogComponents.metrics
		});
		return;
	}

	logger?.warnSync('STARTING MEMORY LEAK SIMULATION - FOR TESTING ONLY', {
		component: LogComponents.metrics,
		type: config.type,
		rateMB: config.rateMB,
		intervalMs: config.intervalMs,
		maxMB: config.maxMB
	});

	let totalLeakedMB = 0;
	let cycleDirection = 1; // 1 for leak, -1 for release

	simulationInterval = setInterval(() => {
		const stats = getMemoryStats();
		
		// Stop if max leak reached (except for cyclic)
		if (config.type !== 'cyclic' && totalLeakedMB >= config.maxMB) {
			logger?.warnSync('Memory leak simulation reached max - stopping', {
				component: LogComponents.metrics,
				totalLeakedMB,
				currentMemoryMB: stats.currentMB
			});
			stopMemoryLeakSimulation();
			return;
		}

		switch (config.type) {
			case 'gradual':
				// Slowly leak memory at constant rate
				leakMemory(config.rateMB);
				totalLeakedMB += config.rateMB;
				logger?.debugSync('Gradual leak simulation', {
					component: LogComponents.metrics,
					leakedThisCycleMB: config.rateMB,
					totalLeakedMB,
					currentMemoryMB: stats.currentMB
				});
				break;

			case 'sudden':
				// Leak large amount immediately
				const suddenAmount = config.maxMB;
				leakMemory(suddenAmount);
				totalLeakedMB += suddenAmount;
				logger?.warnSync('Sudden leak simulation', {
					component: LogComponents.metrics,
					leakedMB: suddenAmount,
					currentMemoryMB: stats.currentMB
				});
				stopMemoryLeakSimulation();
				break;

			case 'cyclic':
				// Leak then release in cycles
				if (cycleDirection === 1) {
					leakMemory(config.rateMB);
					totalLeakedMB += config.rateMB;
					if (totalLeakedMB >= config.maxMB / 2) {
						cycleDirection = -1; // Start releasing
					}
				} else {
					releaseMemory(config.rateMB);
					totalLeakedMB -= config.rateMB;
					if (totalLeakedMB <= 0) {
						totalLeakedMB = 0;
						cycleDirection = 1; // Start leaking again
					}
				}
				logger?.debugSync('Cyclic leak simulation', {
					component: LogComponents.metrics,
					direction: cycleDirection === 1 ? 'leaking' : 'releasing',
					totalLeakedMB,
					currentMemoryMB: stats.currentMB
				});
				break;
		}
	}, config.intervalMs);
}

/**
 * Stop memory leak simulation
 */
export function stopMemoryLeakSimulation(): void {
	if (simulationInterval) {
		clearInterval(simulationInterval);
		simulationInterval = undefined;
		
		// Clear leaked objects to free memory
		const leakedCount = leakedObjects.length;
		leakedObjects = [];
		
		logger?.infoSync('Stopped memory leak simulation', {
			component: LogComponents.metrics,
			clearedObjects: leakedCount
		});
	}
}

/**
 * Leak memory by creating objects that won't be garbage collected
 */
function leakMemory(megabytes: number): void {
	const bytesToLeak = megabytes * 1024 * 1024;
	const objectSize = 1024; // 1KB per object
	const objectCount = Math.floor(bytesToLeak / objectSize);

	for (let i = 0; i < objectCount; i++) {
		// Create objects with references that prevent garbage collection
		leakedObjects.push({
			data: Buffer.alloc(objectSize),
			timestamp: Date.now(),
			index: leakedObjects.length,
			// Circular reference to prevent GC
			self: null as any,
		});
		// Create circular reference
		leakedObjects[leakedObjects.length - 1].self = leakedObjects[leakedObjects.length - 1];
	}
}

/**
 * Release memory by removing leaked objects
 */
function releaseMemory(megabytes: number): void {
	const bytesToRelease = megabytes * 1024 * 1024;
	const objectSize = 1024;
	const objectCount = Math.floor(bytesToRelease / objectSize);

	// Remove from end of array
	const toRemove = Math.min(objectCount, leakedObjects.length);
	leakedObjects.splice(-toRemove, toRemove);
	
	// Suggest garbage collection (not guaranteed)
	if (global.gc) {
		global.gc();
	}
}

/**
 * Get simulation status
 */
export function getSimulationStatus() {
	const config = getLeakConfig();
	return {
		enabled: config.enabled,
		running: simulationInterval !== undefined,
		config,
		leakedObjectsCount: leakedObjects.length,
		estimatedLeakedMB: (leakedObjects.length * 1024) / (1024 * 1024),
	};
}
