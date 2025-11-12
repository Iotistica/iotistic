/**
 * MEMORY LEAK SIMULATION SCENARIO
 * ================================
 * 
 * Simulates various memory leak patterns for testing monitoring and alerting.
 */

import type { AgentLogger } from '../../logging/agent-logger';
import { LogComponents } from '../../logging/types';
import type {
	SimulationScenario,
	SimulationScenarioStatus,
	MemoryLeakSimulationConfig,
} from '../types';

// Leaked memory storage
const leakedMemory: any[] = [];
let simulationInterval: NodeJS.Timeout | undefined;

/**
 * Memory leak simulation scenario
 */
export class MemoryLeakSimulation implements SimulationScenario {
	name = 'memory_leak';
	description = 'Simulates memory leaks with configurable patterns';
	enabled = false;
	
	private config: MemoryLeakSimulationConfig;
	private logger?: AgentLogger;
	private running = false;
	private startedAt?: number;
	private totalLeakedMB = 0;
	private cycleDirection = 1; // 1 for leak, -1 for release
	
	constructor(config: MemoryLeakSimulationConfig, logger?: AgentLogger) {
		this.config = config;
		this.logger = logger;
		this.enabled = config.enabled;
	}
	
	async start(): Promise<void> {
		if (!this.enabled) {
			return;
		}
		
		if (this.running) {
			this.logger?.warnSync('Memory leak simulation already running', {
				component: LogComponents.metrics,
			});
			return;
		}
		
		this.logger?.warnSync('STARTING MEMORY LEAK SIMULATION - FOR TESTING ONLY', {
			component: LogComponents.metrics,
			type: this.config.type,
			rateMB: this.config.rateMB,
			intervalMs: this.config.intervalMs,
			maxMB: this.config.maxMB,
		});
		
		this.running = true;
		this.startedAt = Date.now();
		this.totalLeakedMB = 0;
		this.cycleDirection = 1;
		
		simulationInterval = setInterval(() => {
			this.simulateLeakCycle();
		}, this.config.intervalMs);
	}
	
	async stop(): Promise<void> {
		if (!this.running) {
			return;
		}
		
		if (simulationInterval) {
			clearInterval(simulationInterval);
			simulationInterval = undefined;
		}
		
		// Clean up leaked memory
		leakedMemory.length = 0;
		
		this.logger?.infoSync('Memory leak simulation stopped', {
			component: LogComponents.metrics,
			totalLeakedMB: this.totalLeakedMB,
			durationMs: this.startedAt ? Date.now() - this.startedAt : 0,
		});
		
		this.running = false;
		this.totalLeakedMB = 0;
	}
	
	getStatus(): SimulationScenarioStatus {
		return {
			name: this.name,
			enabled: this.enabled,
			running: this.running,
			startedAt: this.startedAt,
			stats: {
				type: this.config.type,
				totalLeakedMB: this.totalLeakedMB,
				rateMB: this.config.rateMB,
				maxMB: this.config.maxMB,
			},
		};
	}
	
	async updateConfig(config: Partial<MemoryLeakSimulationConfig>): Promise<void> {
		this.config = { ...this.config, ...config };
		this.enabled = this.config.enabled;
		
		// Restart if running
		if (this.running) {
			await this.stop();
			await this.start();
		}
	}
	
	/**
	 * Simulate one leak cycle
	 */
	private simulateLeakCycle(): void {
		const currentMemory = process.memoryUsage();
		
		// Stop if max leak reached (except for cyclic)
		if (this.config.type !== 'cyclic' && this.totalLeakedMB >= this.config.maxMB) {
			this.logger?.warnSync('Memory leak simulation reached max - stopping', {
				component: LogComponents.metrics,
				totalLeakedMB: this.totalLeakedMB,
				currentMemoryMB: Math.round(currentMemory.heapUsed / 1024 / 1024),
			});
			this.stop();
			return;
		}
		
		switch (this.config.type) {
			case 'gradual':
				// Slowly leak memory at constant rate
				this.leakMemory(this.config.rateMB);
				this.totalLeakedMB += this.config.rateMB;
				this.logger?.debugSync('Gradual leak simulation', {
					component: LogComponents.metrics,
					leakedMB: this.config.rateMB,
					totalMB: this.totalLeakedMB,
					currentMemoryMB: Math.round(currentMemory.heapUsed / 1024 / 1024),
				});
				break;
				
			case 'sudden':
				// Leak large amount suddenly, then stop
				const suddenAmount = this.config.maxMB;
				this.leakMemory(suddenAmount);
				this.totalLeakedMB += suddenAmount;
				this.logger?.warnSync('Sudden leak simulation', {
					component: LogComponents.metrics,
					leakedMB: suddenAmount,
					totalMB: this.totalLeakedMB,
				});
				this.stop();
				break;
				
			case 'cyclic':
				// Leak then release in cycles
				if (this.cycleDirection === 1) {
					// Leak phase
					this.leakMemory(this.config.rateMB);
					this.totalLeakedMB += this.config.rateMB;
					
					if (this.totalLeakedMB >= this.config.maxMB) {
						this.cycleDirection = -1; // Switch to release
					}
				} else {
					// Release phase
					this.releaseMemory(this.config.rateMB);
					this.totalLeakedMB -= this.config.rateMB;
					
					if (this.totalLeakedMB <= 0) {
						this.totalLeakedMB = 0;
						this.cycleDirection = 1; // Switch back to leak
					}
				}
				
				this.logger?.debugSync('Cyclic leak simulation', {
					component: LogComponents.metrics,
					phase: this.cycleDirection === 1 ? 'leak' : 'release',
					totalMB: this.totalLeakedMB,
					currentMemoryMB: Math.round(currentMemory.heapUsed / 1024 / 1024),
				});
				break;
		}
	}
	
	/**
	 * Leak memory by creating large objects
	 */
	private leakMemory(megabytes: number): void {
		const bytes = megabytes * 1024 * 1024;
		const arraySize = Math.floor(bytes / 8); // 8 bytes per number
		
		try {
			const leak = new Array(arraySize).fill(Math.random());
			leakedMemory.push(leak);
		} catch (error) {
			this.logger?.errorSync(
				'Failed to allocate memory for leak simulation',
				error instanceof Error ? error : new Error(String(error)),
				{
					component: LogComponents.metrics,
					requestedMB: megabytes,
				}
			);
		}
	}
	
	/**
	 * Release leaked memory
	 */
	private releaseMemory(megabytes: number): void {
		const bytes = megabytes * 1024 * 1024;
		const arraySize = Math.floor(bytes / 8);
		
		// Remove arrays from leaked memory
		let released = 0;
		while (released < arraySize && leakedMemory.length > 0) {
			const array = leakedMemory.pop();
			released += array?.length || 0;
		}
	}
}

/**
 * Get current simulation status (for backward compatibility)
 */
export function getSimulationStatus(): any {
	return {
		running: simulationInterval !== undefined,
		totalLeakedMB: leakedMemory.reduce((sum, arr) => sum + (arr.length * 8 / 1024 / 1024), 0),
		arrayCount: leakedMemory.length,
	};
}
