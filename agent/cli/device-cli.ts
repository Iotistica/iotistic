#!/usr/bin/env node
/**
 * Iotistic Device CLI
 * ==================
 * Command-line interface for device management and configuration
 * 
 * Usage:
 *   device-cli config set-api <url>       - Update cloud API endpoint
 *   device-cli config get-api             - Show current API endpoint
 *   device-cli config show                - Show all configuration
 *   device-cli status                     - Show device status
 *   device-cli restart                    - Restart device agent
 *   device-cli logs [--follow]            - Show device logs
 *   device-cli help                       - Show this help
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, statSync } from 'fs';
import { join, dirname } from 'path';


// Configuration file paths
const CONFIG_DIR = process.env.CONFIG_DIR || '/app/data';
const CONFIG_FILE = join(CONFIG_DIR, 'device-config.json');
const DB_PATH = join(CONFIG_DIR, 'database.sqlite');

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
// Configuration Management
// ============================================================================

function loadConfig(): DeviceConfig {
	try {
		if (existsSync(CONFIG_FILE)) {
			const content = readFileSync(CONFIG_FILE, 'utf-8');
			return JSON.parse(content);
		}
	} catch (error) {
		console.error('⚠️  Failed to load config:', error);
	}
	return {};
}

function saveConfig(config: DeviceConfig): void {
	try {
		// Ensure config directory exists
		if (!existsSync(CONFIG_DIR)) {
			mkdirSync(CONFIG_DIR, { recursive: true });
		}
		
		writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
		console.log('✅ Configuration saved');
	} catch (error) {
		console.error('❌ Failed to save config:', error);
		process.exit(1);
	}
}

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
║                        Iotistic Device CLI                                 ║
╚═══════════════════════════════════════════════════════════════════════════╝

CONFIGURATION COMMANDS:

  config set-api <url>              Update cloud API endpoint
                                    Example: config set-api https://api.example.com

  config get-api                    Show current API endpoint

  config set <key> <value>          Set any configuration value
                                    Example: config set pollInterval 60000

  config get <key>                  Get specific configuration value

  config show                       Show all configuration settings

  config reset                      Reset to default configuration


DEVICE MANAGEMENT:

  status                            Show device status and health

  restart                           Restart device agent service

  logs [--follow] [-n <lines>]      Show device logs
                                    --follow, -f : Follow log output
                                    -n <lines>   : Number of lines to show


PROVISIONING:

  provision <uuid>                  Provision device with UUID

  deprovision                       Remove device provisioning


SYSTEM:

  help                              Show this help message

  version                           Show CLI version


EXAMPLES:

  # Set cloud API endpoint
  device-cli config set-api https://cloud.iotistic.ca

  # View current configuration
  device-cli config show

  # Check device status
  device-cli status

  # Follow logs in real-time
  device-cli logs --follow

  # Set custom poll interval (60 seconds)
  device-cli config set pollInterval 60000

`);
}

function configSetApi(url: string): void {
	if (!url) {
		console.error('❌ Error: API URL is required');
		console.log('Usage: device-cli config set-api <url>');
		process.exit(1);
	}
	
	if (!validateUrl(url)) {
		console.error('❌ Error: Invalid URL format');
		console.log('   URL must start with http:// or https://');
		process.exit(1);
	}
	
	// Remove trailing slash
	url = url.replace(/\/$/, '');
	
	const config = loadConfig();
	config.cloudApiEndpoint = url;
	saveConfig(config);
	
	console.log(`✅ Cloud API endpoint updated to: ${url}`);
	console.log('');
	console.log('⚠️  Restart the device agent for changes to take effect:');
	console.log('   sudo systemctl restart device-agent');
}

function configGetApi(): void {
	const config = loadConfig();
	
	if (config.cloudApiEndpoint) {
		console.log(`📡 Cloud API Endpoint: ${config.cloudApiEndpoint}`);
	} else {
		console.log('⚠️  Cloud API endpoint not configured');
		console.log('   Set it with: device-cli config set-api <url>');
	}
}

function configSet(key: string, value: string): void {
	if (!key || !value) {
		console.error('❌ Error: Both key and value are required');
		console.log('Usage: device-cli config set <key> <value>');
		process.exit(1);
	}
	
	const config = loadConfig();
	
	// Try to parse as JSON (for numbers, booleans, objects)
	let parsedValue: any = value;
	try {
		parsedValue = JSON.parse(value);
	} catch {
		// Keep as string if not valid JSON
	}
	
	config[key] = parsedValue;
	saveConfig(config);
	
	console.log(`✅ Configuration updated: ${key} = ${JSON.stringify(parsedValue)}`);
}

function configGet(key: string): void {
	if (!key) {
		console.error('❌ Error: Key is required');
		console.log('Usage: device-cli config get <key>');
		process.exit(1);
	}
	
	const config = loadConfig();
	
	if (key in config) {
		console.log(`${key}: ${JSON.stringify(config[key], null, 2)}`);
	} else {
		console.log(`⚠️  Configuration key '${key}' not found`);
	}
}

function configShow(): void {
	const config = loadConfig();
	
	if (Object.keys(config).length === 0) {
		console.log('⚠️  No configuration found');
		console.log('   Use "device-cli config set-api <url>" to get started');
		return;
	}
	
	console.log('📋 Device Configuration:');
	console.log('');
	console.log(JSON.stringify(config, null, 2));
	console.log('');
	console.log(`📁 Config file: ${CONFIG_FILE}`);
}

function configReset(): void {
	if (existsSync(CONFIG_FILE)) {
		unlinkSync(CONFIG_FILE);
		console.log('✅ Configuration reset to defaults');
	} else {
		console.log('⚠️  No configuration file found');
	}
}

function showStatus(): void {
	console.log('📊 Device Status:');
	console.log('');
	
	// Check if config exists
	const config = loadConfig();
	if (config.cloudApiEndpoint) {
		console.log(`✅ API Endpoint: ${config.cloudApiEndpoint}`);
	} else {
		console.log('⚠️  API Endpoint: Not configured');
	}
	
	// Check if database exists
	if (existsSync(DB_PATH)) {
		const stats = statSync(DB_PATH);
		console.log(`✅ Database: ${(stats.size / 1024).toFixed(2)} KB`);
	} else {
		console.log('⚠️  Database: Not initialized');
	}
	
	// Check config file
	if (existsSync(CONFIG_FILE)) {
		console.log(`✅ Config File: ${CONFIG_FILE}`);
	} else {
		console.log('⚠️  Config File: Not found');
	}
	
	console.log('');
	console.log('💡 Tip: Use "device-cli logs --follow" to monitor device activity');
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
				console.log(`Iotistic Device CLI v${packageJson.version}`);
				return;
			}
		} catch {
			continue;
		}
	}
	
	// Fallback version
	console.log('Iotistic Device CLI v1.0.0');
}

// ============================================================================
// Main CLI Parser
// ============================================================================

function main(): void {
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
		case 'config':
			switch (subcommand) {
				case 'set-api':
					configSetApi(arg1);
					break;
				case 'get-api':
					configGetApi();
					break;
				case 'set':
					configSet(arg1, arg2);
					break;
				case 'get':
					configGet(arg1);
					break;
				case 'show':
					configShow();
					break;
				case 'reset':
					configReset();
					break;
				default:
					console.error(`❌ Unknown config command: ${subcommand}`);
					console.log('Use "device-cli help" for usage information');
					process.exit(1);
			}
			break;
			
		case 'status':
			showStatus();
			break;
			
		case 'restart':
			console.log('🔄 Restarting device agent...');
			console.log('   sudo systemctl restart device-agent');
			console.log('');
			console.log('⚠️  Note: This command shows the restart command.');
			console.log('   Run it manually with sudo privileges.');
			break;
			
		case 'logs':
			console.log('📜 Device Logs:');
			console.log('   sudo journalctl -u device-agent -f');
			console.log('');
			console.log('⚠️  Note: This command shows the logs command.');
			console.log('   Run it manually to view logs.');
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
			console.error(`❌ Unknown command: ${command}`);
			console.log('Use "device-cli help" for usage information');
			process.exit(1);
	}
}

// Run CLI
main();
