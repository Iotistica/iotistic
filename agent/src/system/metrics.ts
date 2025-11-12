/**
 * SYSTEM METRICS MODULE
 * ======================
 * 
 * Simplified version of balena-supervisor system-info module
 * Collects hardware metrics from the device running container-manager
 * 
 * Adapted from: src/lib/system-info.ts
 */

import systeminformation from 'systeminformation';
import { promises as fs } from 'fs';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCallback);

// ============================================================================
// TYPES
// ============================================================================

export interface ProcessInfo {
	pid: number;
	name: string;
	cpu: number;
	mem: number;
	command?: string; // Optional - excluded to reduce data size
}

export interface NetworkInterfaceInfo {
	name: string;
	ip4: string | null;
	ip6: string | null;
	mac: string | null;
	type: string | null;
	default: boolean;
	virtual: boolean;
	operstate: string | null;
	ssid?: string;
	signalLevel?: number;
}

export interface SystemMetrics {
	// CPU metrics
	cpu_usage: number;
	cpu_temp: number | null;
	cpu_cores: number;

	// Memory metrics
	memory_usage: number;
	memory_total: number;
	memory_percent: number;

	// Storage metrics
	storage_usage: number | null;
	storage_total: number | null;
	storage_percent: number | null;

	// System info
	uptime: number;
	hostname: string;

	// Health checks
	is_undervolted: boolean;

	// Process info
	top_processes: ProcessInfo[];

	// Networking
	network_interfaces: NetworkInterfaceInfo[];

	// Timestamp
	timestamp: Date;
}
// NETWORK METRICS
// ============================================================================

/**
 * Get network interfaces and their details
 */
/**
 * Get network interfaces and their details
 */
export async function getNetworkInterfaces(): Promise<NetworkInterfaceInfo[]> {
	try {
		const interfaces = await systeminformation.networkInterfaces();
		const defaultIface = await systeminformation.networkInterfaceDefault();

		const formatted = interfaces.map((iface) => {
			const base: NetworkInterfaceInfo = {
				name: iface.iface,
				ip4: iface.ip4 || null,
				ip6: iface.ip6 || null,
				mac: iface.mac || null,
				type: iface.type || null,
				default: iface.iface === defaultIface,
				virtual: iface.virtual || false,
				operstate: iface.operstate || null,
			};

			// Only add ssid/signalLevel if present (for wifi)
			if ('ssid' in iface && typeof iface.ssid === 'string') {
				(base as any).ssid = iface.ssid;
			}
			if ('signalLevel' in iface && typeof iface.signalLevel === 'number') {
				(base as any).signalLevel = iface.signalLevel;
			}

		return base;
	});

	// Debug logging removed - metrics collected successfully
	return formatted;
} catch (error) {
	// Silently return empty array - caller will handle missing data
	return [];
}
}// ============================================================================
// CPU METRICS
// ============================================================================

/**
 * Get average CPU usage across all cores (0-100)
 */
export async function getCpuUsage(): Promise<number> {
	try {
		const cpuData = await systeminformation.currentLoad();
		const totalLoad = cpuData.cpus.reduce((sum, cpu) => sum + cpu.load, 0);
		return Math.round(totalLoad / cpuData.cpus.length);
	} catch (error) {
		// Silently return 0 - caller will handle
		return 0;
	}
}

/**
 * Get CPU temperature in Celsius
 * Returns null if temperature sensor not available
 */
export async function getCpuTemp(): Promise<number | null> {
	try {
		const tempInfo = await systeminformation.cpuTemperature();
		return tempInfo.main > 0 ? Math.round(tempInfo.main) : null;
	} catch (error) {
		return null;
	}
}

/**
 * Get number of CPU cores
 */
export async function getCpuCores(): Promise<number> {
	try {
		const cpuInfo = await systeminformation.cpu();
		return cpuInfo.cores;
	} catch (error) {
		return 1;
	}
}

// ============================================================================
// MEMORY METRICS
// ============================================================================

/**
 * Get memory usage information
 */
export async function getMemoryInfo(): Promise<{
	used: number;
	total: number;
	percent: number;
}> {
	try {
		const mem = await systeminformation.mem();
		// Exclude cached and buffers from used memory (like balena does)
		const usedMb = bytesToMb(mem.used - mem.cached - mem.buffers);
		const totalMb = bytesToMb(mem.total);
	const percent = Math.round((usedMb / totalMb) * 100);
	
	return {
		used: usedMb,
		total: totalMb,
		percent,
	};
} catch (error) {
	// Silently return zero values - caller will handle
	return { used: 0, total: 0, percent: 0 };
}
}// ============================================================================
// STORAGE METRICS
// ============================================================================

/**
 * Get storage usage information
 * Looks for /data partition or falls back to root
 */
export async function getStorageInfo(): Promise<{
	used: number | null;
	total: number | null;
	percent: number | null;
}> {
	try {
		const fsInfo = await systeminformation.fsSize();
		
		// Look for /data partition first (like balena)
		let targetPartition = fsInfo.find(fs => fs.mount === '/data');
		
		// Fallback to root if no /data partition
		if (!targetPartition) {
			targetPartition = fsInfo.find(fs => fs.mount === '/');
		}
		
		if (!targetPartition) {
			return { used: null, total: null, percent: null };
	}
	
	return {
		used: bytesToMb(targetPartition.used),
		total: bytesToMb(targetPartition.size),
		percent: Math.round(targetPartition.use),
	};
} catch (error) {
	// Silently return null values - caller will handle
	return { used: null, total: null, percent: null };
}
}// ============================================================================
// SYSTEM INFO
// ============================================================================

/**
 * Get system uptime in seconds
 */
export async function getUptime(): Promise<number> {
	try {
		const timeInfo = await systeminformation.time();
		return timeInfo.uptime;
	} catch (error) {
		return 0;
	}
}

/**
 * Get system hostname
 */
export async function getHostname(): Promise<string> {
	try {
		const osInfo = await systeminformation.osInfo();
		return osInfo.hostname;
	} catch (error) {
		return 'unknown';
	}
}

/**
 * Get primary MAC address (from default network interface)
 */
export async function getMacAddress(): Promise<string | undefined> {
	try {
		const defaultIface = await systeminformation.networkInterfaceDefault();
		const interfaces = await systeminformation.networkInterfaces();
		const primaryInterface = interfaces.find(i => i.iface === defaultIface);
		return primaryInterface?.mac || undefined;
	} catch (error) {
		// Silently return undefined - caller will handle
		return undefined;
	}
}

/**
 * Get OS version string
 */
export async function getOsVersion(): Promise<string | undefined> {
	try {
		const osInfo = await systeminformation.osInfo();
		// Format: "Debian GNU/Linux 12 (bookworm)" or similar
		return `${osInfo.distro} ${osInfo.release}${osInfo.codename ? ` (${osInfo.codename})` : ''}`;
	} catch (error) {
		// Silently return undefined - caller will handle
		return undefined;
	}
}

// ============================================================================
// HEALTH CHECKS
// ============================================================================

/**
 * Check if system has detected undervoltage (Raspberry Pi)
 * Scans dmesg for undervoltage warnings
 */
export async function isUndervolted(): Promise<boolean> {
	try {
		const { stdout } = await exec('dmesg');
		const undervoltageRegex = /under.*voltage/i;
		return undervoltageRegex.test(stdout);
	} catch (error) {
		// dmesg requires root, so this might fail
		return false;
	}
}

// ============================================================================
// PROCESS METRICS
// ============================================================================

/**
 * Get top 10 processes by CPU and memory usage
 * Returns combined list sorted by resource usage
 */
export async function getTopProcesses(): Promise<ProcessInfo[]> {
	try {
		// On Windows, we need to call processes() twice with a delay to get accurate CPU readings
		// First call initializes the measurement
		await systeminformation.processes();
		
		// Wait 1 second for CPU measurement to stabilize (Windows requirement)
		await new Promise(resolve => setTimeout(resolve, 1000));
		
		// Second call gets the actual CPU usage
		const processes = await systeminformation.processes();
		
	// If systeminformation returns empty, try fallback method
	if (processes.list.length === 0) {
		// Silently fallback - debug logging removed
		return await getTopProcessesFallback();
	}
	
	// Filter out kernel threads (names starting with [])
	// Keep all user processes including those with low CPU/memory
	const userProcesses = processes.list.filter(proc => 
		!proc.name.startsWith('[') && proc.name !== ''
	);
	
	// Sort by combined CPU and memory score (weighted)
	// CPU gets 60% weight, memory gets 40% weight
	const sortedProcesses = userProcesses.sort((a, b) => {
		const scoreA = (a.cpu * 0.6) + (a.mem * 0.4);
		const scoreB = (b.cpu * 0.6) + (b.mem * 0.4);
		return scoreB - scoreA;
	});
	
	// Take top 10
	const topProcs = sortedProcesses.slice(0, 10);
	
	// Format for our interface
	const formattedProcs = topProcs.map(proc => ({
		pid: proc.pid,
		name: proc.name,
		cpu: Math.round(proc.cpu * 10) / 10, // Round to 1 decimal
		mem: Math.round(proc.mem * 10) / 10, // Round to 1 decimal
	}));
	
	// Debug logging removed - processes collected successfully
	return formattedProcs;
} catch (error) {
	// Silently try fallback method - debug logging removed
	return await getTopProcessesFallback();
}
}/**
 * Fallback method using ps command directly
 * Used when systeminformation fails to get process list
 */
async function getTopProcessesFallback(): Promise<ProcessInfo[]> {
	try {
		// Use ps command to get process info
		// Format: PID %CPU %MEM COMMAND
		const { stdout } = await exec('ps aux --sort=-%cpu | head -n 11 | tail -n +2');
		
		const lines = stdout.trim().split('\n');
		const processes: ProcessInfo[] = [];
		
		for (const line of lines) {
			// Parse ps output: USER PID %CPU %MEM VSZ RSS TTY STAT START TIME COMMAND
			const parts = line.trim().split(/\s+/);
			
			if (parts.length >= 11) {
				const pid = parseInt(parts[1]);
				const cpu = parseFloat(parts[2]);
				const mem = parseFloat(parts[3]);
				const command = parts.slice(10).join(' ');
				const name = parts[10].split('/').pop() || parts[10];
				
				processes.push({
					pid,
				name,
				cpu: Math.round(cpu * 10) / 10,
				mem: Math.round(mem * 10) / 10,
				command,
			});
		}
	}
	
	// Debug logging removed - processes collected successfully
	return processes;
} catch (error) {
	// Silently return empty array - caller will handle
	return [];
}
}// ============================================================================
// MAIN METRICS FUNCTION
// ============================================================================

/**
 * Get all system metrics in one call
 * This is the main function to use
 */
export async function getSystemMetrics(): Promise<SystemMetrics> {
	// Gather all metrics in parallel for speed
		const [
			cpuUsage,
			cpuTemp,
			cpuCores,
			memoryInfo,
			storageInfo,
			uptime,
			hostname,
			undervolted,
			topProcesses,
			networkInterfaces,
		] = await Promise.all([
			getCpuUsage(),
			getCpuTemp(),
			getCpuCores(),
			getMemoryInfo(),
			getStorageInfo(),
			getUptime(),
			getHostname(),
			isUndervolted(),
			getTopProcesses(),
			getNetworkInterfaces(),
		]);

		return {
			// CPU
			cpu_usage: cpuUsage,
			cpu_temp: cpuTemp,
			cpu_cores: cpuCores,

			// Memory
			memory_usage: memoryInfo.used,
			memory_total: memoryInfo.total,
			memory_percent: memoryInfo.percent,

			// Storage
			storage_usage: storageInfo.used,
			storage_total: storageInfo.total,
			storage_percent: storageInfo.percent,

			// System
			uptime,
			hostname,

			// Health
			is_undervolted: undervolted,

			// Processes
			top_processes: topProcesses,

			// Networking
			network_interfaces: networkInterfaces,

			// Metadata
			timestamp: new Date(),
		};
	}


// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Convert bytes to megabytes
 */
function bytesToMb(bytes: number): number {
	return Math.floor(bytes / 1024 / 1024);
}

/**
 * Format uptime to human readable string
 */
export function formatUptime(seconds: number): string {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	
	const parts: string[] = [];
	if (days > 0) parts.push(`${days}d`);
	if (hours > 0) parts.push(`${hours}h`);
	if (minutes > 0) parts.push(`${minutes}m`);
	
	return parts.length > 0 ? parts.join(' ') : '0m';
}
