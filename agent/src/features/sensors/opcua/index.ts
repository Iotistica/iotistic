/**
 * OPC-UA Adapter Standalone Entry Point
 * 
 * Run this adapter standalone for testing or independent use.
 * 
 * Usage:
 *   node dist/features/sensors/opcua/index.js --config opcua-config.json
 * 
 * Configuration file format: see opcua-config.example.json
 */

import * as fs from 'fs';
import { OPCUAAdapter } from './opcua-adapter.js';
import { OPCUAAdapterConfigSchema, OPCUADeviceConfig } from './types.js';
import { SocketServer } from '../common/socket-server.js';
import { ConsoleLogger } from '../common/logger.js';
import { SensorDataPoint, SocketOutput } from '../common/types.js';

/**
 * Load configuration from file
 */
function loadConfig(configPath: string): { devices: OPCUADeviceConfig[], output: SocketOutput } {
  try {
    const configData = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(configData);
    
    // Validate configuration
    const validatedConfig = OPCUAAdapterConfigSchema.parse(config);
    
    // Validate output config exists for standalone mode
    if (!config.output) {
      throw new Error('Output configuration is required for standalone mode');
    }
    
    return {
      devices: validatedConfig.devices,
      output: config.output as SocketOutput,
    };
  } catch (error) {
    console.error(`Failed to load configuration: ${error}`);
    process.exit(1);
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  
  // Parse arguments
  let configPath = 'opcua-config.json';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--config' && i + 1 < args.length) {
      configPath = args[i + 1];
    }
  }
  
  // Load configuration
  const { devices, output } = loadConfig(configPath);
  
  // Create logger
  const logger = new ConsoleLogger('info');
  logger.info('Starting OPC-UA adapter in standalone mode...');
  logger.info(`Configuration: ${configPath}`);
  logger.info(`Devices: ${devices.length}`);
  logger.info(`Socket path: ${output.socketPath}`);
  
  // Create socket server
  const socketServer = new SocketServer(output, logger);
  
  // Create adapter
  const adapter = new OPCUAAdapter(devices);
  
  // Wire adapter data events to socket server
  adapter.on('data', (dataPoints: SensorDataPoint[]) => {
    socketServer.sendData(dataPoints);
  });
  
  adapter.on('device-connected', (deviceName: string) => {
    logger.info(`Device connected: ${deviceName}`);
  });
  
  adapter.on('device-disconnected', (deviceName: string) => {
    logger.warn(`Device disconnected: ${deviceName}`);
  });
  
  adapter.on('device-error', (deviceName: string, error: Error) => {
    logger.error(`Device error (${deviceName}): ${error.message}`);
  });
  
  // Start socket server
  await socketServer.start();
  logger.info('Socket server started');
  
  // Start adapter
  await adapter.start();
  logger.info('OPC-UA adapter started');
  
  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down...');
    
    try {
      await adapter.stop();
      logger.info('OPC-UA adapter stopped');
      
      await socketServer.stop();
      logger.info('Socket server stopped');
      
      process.exit(0);
    } catch (error) {
      logger.error(`Shutdown error: ${error}`);
      process.exit(1);
    }
  };
  
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  
  logger.info('OPC-UA adapter running. Press Ctrl+C to stop.');
}

// Run main function
main().catch((error) => {
  console.error(`Fatal error: ${error}`);
  process.exit(1);
});
