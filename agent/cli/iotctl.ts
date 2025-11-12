#!/usr/bin/env node
/**
 * iotctl - IoT Control CLI
 * ========================
 * Iotistic device management and configuration tool
 * 
 * Usage:
 *   iotctl provision <key>            - Provision device with cloud
 *   iotctl config set-api <url>       - Update cloud API endpoint
 *   iotctl config get-api             - Show current API endpoint
 *   iotctl config show                - Show all configuration
 *   iotctl status                     - Show device status
 *   iotctl apps list                  - List all applications
 *   iotctl apps start <appId>         - Start an application
 *   iotctl apps stop <appId>          - Stop an application
 *   iotctl apps restart <appId>       - Restart an application
 *   iotctl help                       - Show this help
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { spawn } from 'child_process';


// Configuration paths
const CONFIG_DIR = process.env.CONFIG_DIR || '/app/data';
const DB_PATH = join(CONFIG_DIR, 'database.sqlite');

// Device API endpoint - construct from DEVICE_API_PORT or fall back to DEVICE_API_URL
const DEVICE_API_PORT = process.env.DEVICE_API_PORT || '48484';
const DEVICE_API_BASE = process.env.DEVICE_API_URL || `http://localhost:${DEVICE_API_PORT}`;
const DEVICE_API_V1 = `${DEVICE_API_BASE}/v1`;

// ============================================================================
// Simple Logger (console output)
// ============================================================================

class CLILogger {
	info(message: string, context?: Record<string, any>): void {
		const contextStr = context ? ` ${JSON.stringify(context)}` : '';
		console.log(`[INFO] ${message}${contextStr}`);
	}

	error(message: string, error?: Error, context?: Record<string, any>): void {
		const errorStr = error ? ` - ${error.message}` : '';
		const contextStr = context ? ` ${JSON.stringify(context)}` : '';
		console.error(`[ERROR] ${message}${errorStr}${contextStr}`);
	}

	warn(message: string, context?: Record<string, any>): void {
		const contextStr = context ? ` ${JSON.stringify(context)}` : '';
		console.warn(`[WARN] ${message}${contextStr}`);
	}

	debug(message: string, context?: Record<string, any>): void {
		if (process.env.DEBUG === 'true') {
			const contextStr = context ? ` ${JSON.stringify(context)}` : '';
			console.log(`[DEBUG] ${message}${contextStr}`);
		}
	}
}

const logger = new CLILogger();

interface DeviceConfig {
	cloudApiEndpoint?: string;
	pollInterval?: number;
	reportInterval?: number;
	metricsInterval?: number;
	enableRemoteAccess?: boolean;
	deviceName?: string;
	[key: string]: any;
}

// ============================================================================
// Device API Client
// ============================================================================

async function apiRequest(endpoint: string, options: RequestInit = {}): Promise<any> {
	try {
		const response = await fetch(endpoint, {
			...options,
			headers: {
				'Content-Type': 'application/json',
				...options.headers,
			},
		});

		if (!response.ok) {
			const error = await response.text();
			throw new Error(`HTTP ${response.status}: ${error}`);
		}

		// Handle empty responses
		const text = await response.text();
		if (!text || text === 'OK') {
			return { success: true };
		}

		return JSON.parse(text);
	} catch (error) {
		if ((error as any).code === 'ECONNREFUSED') {
			logger.error('Cannot connect to agent', undefined, {
				endpoint: DEVICE_API_BASE,
				hint: 'Make sure the agent is running'
			});
			process.exit(1);
		}
		throw error;
	}
}

// ============================================================================
// Utility Functions
// ============================================================================

function validateUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return parsed.protocol === 'http:' || parsed.protocol === 'https:';
	} catch {
		return false;
	}
}

// ============================================================================
// Commands
// ============================================================================

function showHelp(): void {
	console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                           iotctl - IoT Control                             ║
║                        Iotistic Device Management CLI                      ║
╚═══════════════════════════════════════════════════════════════════════════╝

PROVISIONING COMMANDS:

  provision <key>                   Provision device with provisioning key
                                    Options: --api <endpoint> --name <name> --type <type>
                                    Example: iotctl provision abc123 --api https://api.iotistic.com

  provision status                  Show device provisioning status

  deprovision                       Remove cloud registration (keeps UUID and deviceApiKey)
                                    Clears: deviceId, MQTT credentials, cloud endpoint
                                    Preserves: UUID, deviceApiKey for re-provisioning

  factory-reset                     WARNING: Complete data wipe
                                    Deletes: All apps, services, state, sensors, credentials
                                    Preserves: Only device UUID
                                    This action cannot be undone!

CONFIGURATION COMMANDS:

  config set-api <url>              Update cloud API endpoint
                                    Example: iotctl config set-api https://api.example.com

  config get-api                    Show current API endpoint

  config set <key> <value>          Set any configuration value
                                    Example: iotctl config set pollInterval 60000

  config get <key>                  Get specific configuration value

  config show                       Show all configuration settings

  config reset                      Reset to default configuration


DEVICE MANAGEMENT:

  status                            Show device status and health

  restart                           Restart device agent service

  logs [--follow] [-n <lines>]      Show device logs
                                    --follow, -f : Follow log output
                                    -n <lines>   : Number of lines to show


CONTAINER/APPLICATION MANAGEMENT:

  apps list                         List all applications and containers

  apps start <appId>                Start an application

  apps stop <appId>                 Stop an application

  apps restart <appId>              Restart an application

  apps info <appId>                 Show application details

  apps purge <appId>                Purge application data (volumes)


SYSTEM:

  help                              Show this help message

  version                           Show CLI version


EXAMPLES:

  # Set cloud API endpoint
  iotctl config set-api https://cloud.iotistic.ca

  # View current configuration
  iotctl config show

  # Check device status
  iotctl status

  # List all running applications
  iotctl apps list

  # Restart an application
  iotctl apps restart 1001

  # Follow logs in real-time
  iotctl logs --follow

  # Set custom poll interval (60 seconds)
  iotctl config set pollInterval 60000

`);
}

async function configSetApi(url: string): Promise<void> {
	if (!url) {
		logger.error('API URL is required', undefined, {
			usage: 'iotctl config set-api <url>'
		});
		process.exit(1);
	}
	
	if (!validateUrl(url)) {
		logger.error('Invalid URL format', undefined, {
			hint: 'URL must start with http:// or https://'
		});
		process.exit(1);
	}
	
	// Remove trailing slash
	url = url.replace(/\/$/, '');
	
	try {
		await apiRequest(`${DEVICE_API_V1}/config`, {
			method: 'POST',
			body: JSON.stringify({ cloudApiEndpoint: url })
		});
		
		logger.info('Cloud API endpoint updated', { endpoint: url });
		logger.warn('Restart required', {
			hint: 'Run: iotctl system restart'
		});
	} catch (error) {
		logger.error('Failed to update API endpoint', error as Error);
		process.exit(1);
	}
}

async function configGetApi(): Promise<void> {
	try {
		const provisionStatus = await apiRequest(`${DEVICE_API_V1}/provision/status`);
		
		if (provisionStatus.apiEndpoint) {
			logger.info('Cloud API Endpoint', { endpoint: provisionStatus.apiEndpoint });
		} else {
			logger.warn('Cloud API endpoint not configured');
		}
	} catch (error) {
		logger.error('Failed to retrieve API endpoint', error as Error);
		process.exit(1);
	}
}

async function configSet(key: string, value: string): Promise<void> {
	if (!key || !value) {
		logger.error('Both key and value are required', undefined, {
			usage: 'iotctl config set <key> <value>'
		});
		process.exit(1);
	}
	
	// Try to parse as JSON (for numbers, booleans, objects)
	let parsedValue: any = value;
	try {
		parsedValue = JSON.parse(value);
	} catch {
		// Keep as string if not valid JSON
	}
	
	try {
		await apiRequest(`${DEVICE_API_V1}/config`, {
			method: 'POST',
			body: JSON.stringify({ [key]: parsedValue })
		});
		
		logger.info('Configuration updated', { key, value: parsedValue });
	} catch (error) {
		logger.error('Failed to update configuration', error as Error);
		process.exit(1);
	}
}

async function configGet(key: string): Promise<void> {
	if (!key) {
		logger.error('Key is required', undefined, {
			usage: 'iotctl config get <key>'
		});
		process.exit(1);
	}
	
	try {
		const deviceState = await apiRequest(`${DEVICE_API_V1}/device`);
		const config = deviceState.config || {};
		
		if (key in config) {
			logger.info('Configuration value', { key, value: config[key] });
		} else {
			logger.warn('Configuration key not found', { key });
		}
	} catch (error) {
		logger.error('Failed to retrieve configuration', error as Error);
		process.exit(1);
	}
}

async function configShow(): Promise<void> {
	try {
		// Get device state from API
		const deviceState = await apiRequest(`${DEVICE_API_V1}/device`);
		
		// Get provision status for additional config
		const provisionStatus = await apiRequest(`${DEVICE_API_V1}/provision/status`);
		
		const config = {
			uuid: deviceState.uuid,
			deviceId: provisionStatus.deviceId || 'not assigned',
			deviceName: provisionStatus.deviceName || 'not set',
			cloudApiEndpoint: provisionStatus.apiEndpoint || 'not configured',
			mqttConfigured: provisionStatus.mqttConfigured || false,
			provisioned: provisionStatus.provisioned || false,
			online: deviceState.is_online || false,
			version: deviceState.version || 0
		};
		
		logger.info('Device Configuration', config);
	} catch (error) {
		logger.error('Failed to retrieve configuration', error as Error, {
			hint: 'Ensure the agent is running'
		});
	}
}

async function configReset(): Promise<void> {
	try {
		await apiRequest(`${DEVICE_API_V1}/factory-reset`, {
			method: 'POST'
		});
		logger.info('Configuration reset to factory defaults');
		logger.warn('Device needs to be re-provisioned');
	} catch (error) {
		logger.error('Failed to reset configuration', error as Error);
		process.exit(1);
	}
}

async function showStatusEnhanced(): Promise<void> {
	logger.info('Checking device health...');
	
	try {
		// Check agent API connectivity
		const deviceState = await apiRequest(`${DEVICE_API_V1}/device`);
		logger.info('Agent running', {
			uuid: deviceState.uuid,
			online: deviceState.is_online
		});
		
		// Count apps
		const apps = deviceState.apps || {};
		const appCount = Object.keys(apps).length;
		
		// Show running services count
		let runningCount = 0;
		for (const appId in apps) {
			const app = apps[appId];
			if (app.services) {
				runningCount += app.services.filter((s: any) => s.status === 'Running').length;
			}
		}
		
		logger.info('Applications', {
			configured: appCount,
			runningServices: runningCount
		});
		
		// Cloud connection info from provision status
		try {
			const provisionStatus = await apiRequest(`${DEVICE_API_V1}/provision/status`);
			if (provisionStatus.apiEndpoint) {
				logger.info('Cloud connection', {
					endpoint: provisionStatus.apiEndpoint,
					status: deviceState.is_online ? 'Connected' : 'Disconnected'
				});
			}
		} catch {
			// Ignore if provision status unavailable
		}
		
		// Database size
		if (existsSync(DB_PATH)) {
			const stats = statSync(DB_PATH);
			logger.info('Database', {
				size_mb: (stats.size / 1024 / 1024).toFixed(2)
			});
		}
	} catch (error) {
		logger.error('Agent not running or unreachable', error as Error);
		showStatus();
	}
}

function showStatus(): void {
	logger.info('Device Status');
	logger.warn('API Endpoint not configured');
	
	// Check if database exists
	if (existsSync(DB_PATH)) {
		const stats = statSync(DB_PATH);
		logger.info('Database found', { size_kb: (stats.size / 1024).toFixed(2) });
	} else {
		logger.warn('Database not initialized');
	}
	
	logger.info('Tip: Use "iotctl logs --follow" to monitor device activity');
}

// ============================================================================
// Application/Container Commands
// ============================================================================

async function appsList(): Promise<void> {
	try {
		const deviceState = await apiRequest(`${DEVICE_API_V1}/device`);
		const apps = deviceState.apps || {};
		
		if (Object.keys(apps).length === 0) {
			logger.info('No applications configured');
			return;
		}
		
		logger.info('Applications');
		
		for (const appId in apps) {
			const app = apps[appId];
			const appInfo: any = {
				appId,
				appName: app.appName || 'Unknown'
			};
			
			if (app.services && app.services.length > 0) {
				appInfo.services = app.services.map((service: any) => ({
					name: service.serviceName,
					status: service.status,
					containerId: service.containerId?.substring(0, 12)
				}));
			}
			
			logger.info(`App ${appId}`, appInfo);
		}
	} catch (error) {
		logger.error('Failed to list applications', error as Error);
		process.exit(1);
	}
}

async function appsStart(appId: string): Promise<void> {
	if (!appId) {
		logger.error('Application ID is required', undefined, {
			usage: 'iotctl apps start <appId>'
		});
		process.exit(1);
	}
	
	try {
		logger.info('Starting application', { appId });
		const result = await apiRequest(`${DEVICE_API_V1}/apps/${appId}/start`, {
			method: 'POST',
			body: JSON.stringify({ force: false })
		});
		
		logger.info('Application started', { 
			appId, 
			containerId: result.containerId 
		});
	} catch (error) {
		logger.error('Failed to start application', error as Error, { appId });
		process.exit(1);
	}
}

async function appsStop(appId: string): Promise<void> {
	if (!appId) {
		logger.error('Application ID is required', undefined, {
			usage: 'iotctl apps stop <appId>'
		});
		process.exit(1);
	}
	
	try {
		logger.info('Stopping application', { appId });
		const result = await apiRequest(`${DEVICE_API_V1}/apps/${appId}/stop`, {
			method: 'POST',
			body: JSON.stringify({ force: false })
		});
		
		logger.info('Application stopped', { 
			appId, 
			containerId: result.containerId 
		});
	} catch (error) {
		logger.error('Failed to stop application', error as Error, { appId });
		process.exit(1);
	}
}

async function appsRestart(appId: string): Promise<void> {
	if (!appId) {
		logger.error('Application ID is required', undefined, {
			usage: 'iotctl apps restart <appId>'
		});
		process.exit(1);
	}
	
	try {
		logger.info('Restarting application', { appId });
		await apiRequest(`${DEVICE_API_V1}/restart`, {
			method: 'POST',
			body: JSON.stringify({ appId, force: false })
		});
		
		logger.info('Application restarted', { appId });
	} catch (error) {
		logger.error('Failed to restart application', error as Error, { appId });
		process.exit(1);
	}
}

async function appsInfo(appId: string): Promise<void> {
	if (!appId) {
		logger.error('Application ID is required', undefined, {
			usage: 'iotctl apps info <appId>'
		});
		process.exit(1);
	}
	
	try {
		const app = await apiRequest(`${DEVICE_API_V1}/apps/${appId}`);
		logger.info('Application details', { appId, details: app });
	} catch (error) {
		logger.error('Failed to get application info', error as Error, { appId });
		process.exit(1);
	}
}

async function appsPurge(appId: string): Promise<void> {
	if (!appId) {
		logger.error('Application ID is required', undefined, {
			usage: 'iotctl apps purge <appId>'
		});
		process.exit(1);
	}
	
	try {
		logger.warn('Purging application data', { 
			appId,
			warning: 'This removes all volumes and data'
		});
		await apiRequest(`${DEVICE_API_V1}/purge`, {
			method: 'POST',
			body: JSON.stringify({ appId, force: true })
		});
		
		logger.info('Application data purged', { appId });
	} catch (error) {
		logger.error('Failed to purge application', error as Error, { appId });
		process.exit(1);
	}
}

// ============================================================================
// System Commands
// ============================================================================

function restart(): void {
	logger.info('Restarting device agent...');
	
	// Try systemctl first (for systemd systems)
	try {
		const result = spawn('systemctl', ['restart', 'device-agent'], {
			stdio: 'inherit',
			shell: true
		});
		
		result.on('error', (error) => {
			logger.warn('Failed to restart via systemctl, trying Docker restart');
			
			// Fallback to docker restart
			const dockerResult = spawn('docker', ['restart', 'agent'], {
				stdio: 'inherit',
				shell: true
			});
			
			dockerResult.on('error', (err) => {
				logger.error('Failed to restart agent', err, {
					hint_systemctl: 'sudo systemctl restart device-agent',
					hint_docker: 'docker restart agent'
				});
				process.exit(1);
			});
		});
		
		logger.info('Restart command sent');
	} catch (error) {
		logger.error('Failed to restart agent', error as Error);
		process.exit(1);
	}
}

function showLogs(follow: boolean = false, lines: number = 50): void {
	logger.info('Device Logs', { following: follow, lines });
	
	// Try journalctl first (for systemd systems)
	const journalArgs = ['-u', 'device-agent'];
	if (follow) {
		journalArgs.push('-f');
	} else {
		journalArgs.push('-n', lines.toString());
	}
	
	const journal = spawn('journalctl', journalArgs, {
		stdio: 'inherit',
		shell: true
	});
	
	journal.on('error', (error) => {
		logger.warn('journalctl not available, trying Docker logs');
		
		// Fallback to docker logs
		const dockerArgs = ['logs'];
		if (follow) {
			dockerArgs.push('-f');
		} else {
			dockerArgs.push('--tail', lines.toString());
		}
		dockerArgs.push('agent');
		
		const docker = spawn('docker', dockerArgs, {
			stdio: 'inherit',
			shell: true
		});
		
		docker.on('error', (err) => {
			logger.error('Failed to get logs', err, {
				hint_systemd: 'sudo journalctl -u device-agent -f',
				hint_docker: 'docker logs -f agent'
			});
			process.exit(1);
		});
	});
}

function showVersion(): void {
	// Try to read package.json version from multiple possible locations
	const possiblePaths = [
		join(process.cwd(), 'package.json'),           // Running from agent/
		join(process.cwd(), '..', 'package.json'),     // Running from agent/cli/
		'/app/package.json',                           // Container path
	];
	
	for (const packagePath of possiblePaths) {
		try {
			if (existsSync(packagePath)) {
				const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
				logger.info('iotctl - IoT Control CLI', { version: packageJson.version });
				return;
			}
		} catch {
			continue;
		}
	}
	
	// Fallback version
	logger.info('iotctl - IoT Control CLI', { version: '1.0.0' });
}

// ============================================================================
// Provisioning Commands
// ============================================================================

async function provisionWithKey(key: string): Promise<void> {
	if (!key) {
		logger.error('Provisioning key is required', undefined, {
			usage: 'iotctl provision <key> [--api <endpoint>] [--name <device-name>]'
		});
		process.exit(1);
	}
	
	try {
		// Parse optional flags
		const args = process.argv.slice(2);
		const apiIndex = args.indexOf('--api');
		const nameIndex = args.indexOf('--name');
		const typeIndex = args.indexOf('--type');
		
		const config: any = {
			provisioningApiKey: key
		};
		
		if (apiIndex !== -1 && args[apiIndex + 1]) {
			config.apiEndpoint = args[apiIndex + 1];
		}
		
		if (nameIndex !== -1 && args[nameIndex + 1]) {
			config.deviceName = args[nameIndex + 1];
		}
		
		if (typeIndex !== -1 && args[typeIndex + 1]) {
			config.deviceType = args[typeIndex + 1];
		}
		
		logger.info('Provisioning device', { 
			apiEndpoint: config.apiEndpoint || 'default',
			deviceName: config.deviceName || 'auto-generated'
		});
		
		const result = await apiRequest(`${DEVICE_API_V1}/provision`, {
			method: 'POST',
			body: JSON.stringify(config)
		});
		
		logger.info('Device provisioned successfully', {
			uuid: result.device.uuid,
			deviceId: result.device.deviceId,
			deviceName: result.device.deviceName,
			mqttBrokerUrl: result.device.mqttBrokerUrl
		});
	} catch (error) {
		logger.error('Provisioning failed', error as Error);
		process.exit(1);
	}
}

async function provisionStatus(): Promise<void> {
	try {
		const status = await apiRequest(`${DEVICE_API_V1}/provision/status`);
		
		logger.info('Provisioning status', {
			provisioned: status.provisioned,
			uuid: status.uuid,
			deviceId: status.deviceId || 'not assigned',
			deviceName: status.deviceName || 'not set',
			apiEndpoint: status.apiEndpoint || 'not set',
			mqttConfigured: status.mqttConfigured
		});
		
		if (!status.provisioned) {
			logger.info('Device not provisioned', {
				hint: 'Use "iotctl provision <key>" to provision this device'
			});
		}
	} catch (error) {
		logger.error('Failed to get provisioning status', error as Error);
		process.exit(1);
	}
}

async function deprovision(): Promise<void> {
	try {
		logger.warn('Deprovisioning device - this will remove cloud registration');
		
		const result = await apiRequest(`${DEVICE_API_V1}/deprovision`, {
			method: 'POST'
		});
		
		logger.info('Device deprovisioned', {
			message: result.message,
			status: result.status
		});
	} catch (error) {
		logger.error('Deprovision failed', error as Error);
		process.exit(1);
	}
}

async function factoryReset(): Promise<void> {
	try {
		logger.warn('WARNING: Factory reset will DELETE ALL DATA');
		logger.warn('This includes all apps, services, state snapshots, and sensor data');
		logger.warn('Only the device UUID will be preserved');
		logger.warn('This action cannot be undone');
		
		// In production, you might want to add a confirmation prompt here
		// For now, proceed with the reset
		
		const result = await apiRequest(`${DEVICE_API_V1}/factory-reset`, {
			method: 'POST'
		});
		
		logger.info('Factory reset complete', {
			message: result.message,
			status: result.status
		});
	} catch (error) {
		logger.error('Factory reset failed', error as Error);
		process.exit(1);
	}
}

// ============================================================================
// Main CLI Parser
// ============================================================================

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	
	if (args.length === 0) {
		showHelp();
		return;
	}
	
	const command = args[0];
	const subcommand = args[1];
	const arg1 = args[2];
	const arg2 = args[3];
	
	switch (command) {
		case 'provision':
			if (!subcommand || subcommand.startsWith('--')) {
				// iotctl provision <key> [flags]
				provisionWithKey(subcommand);
			} else if (subcommand === 'status') {
				// iotctl provision status
				provisionStatus();
			} else {
				// Treat as key
				provisionWithKey(subcommand);
			}
			break;
			
		case 'deprovision':
			deprovision();
			break;
		
		case 'factory-reset':
			factoryReset();
			break;
		
		case 'config':
			switch (subcommand) {
				case 'set-api':
					await configSetApi(arg1);
					break;
				case 'get-api':
					await configGetApi();
					break;
				case 'set':
					await configSet(arg1, arg2);
					break;
				case 'get':
					await configGet(arg1);
					break;
				case 'show':
					await configShow();
					break;
				case 'reset':
					await configReset();
					break;
				default:
					logger.error('Unknown config command', undefined, {
						command: subcommand,
						hint: 'Use "iotctl help" for usage information'
					});
					process.exit(1);
			}
			break;
		
		case 'apps':
			switch (subcommand) {
				case 'list':
					appsList();
					break;
				case 'start':
					appsStart(arg1);
					break;
				case 'stop':
					appsStop(arg1);
					break;
				case 'restart':
					appsRestart(arg1);
					break;
				case 'info':
					appsInfo(arg1);
					break;
				case 'purge':
					appsPurge(arg1);
					break;
				default:
					logger.error('Unknown apps command', undefined, {
						command: subcommand,
						hint: 'Use "iotctl help" for usage information'
					});
					process.exit(1);
			}
			break;
			
		case 'status':
			showStatusEnhanced();
			break;
			
		case 'restart':
			restart();
			break;
			
		case 'logs':
			const follow = args.includes('--follow') || args.includes('-f');
			const linesIndex = args.indexOf('-n');
			const lines = linesIndex !== -1 && args[linesIndex + 1] 
				? parseInt(args[linesIndex + 1]) 
				: 50;
			showLogs(follow, lines);
			break;
			
		case 'help':
		case '--help':
		case '-h':
			showHelp();
			break;
			
		case 'version':
		case '--version':
		case '-v':
			showVersion();
			break;
			
		default:
			logger.error('Unknown command', undefined, {
				command,
				hint: 'Use "iotctl help" for usage information'
			});
			process.exit(1);
	}
}

// Run CLI
main();
