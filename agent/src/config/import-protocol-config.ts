/**
 * Import Protocol Adapter Configuration from JSON to SQLite
 * Run this once to migrate from file-based config to database
 */

import { DeviceSensorModel } from '../models/sensors.model';
import * as fs from 'fs';
import * as path from 'path';

export async function importProtocolAdapterConfig(): Promise<void> {
  console.log('🔄 Importing protocol adapter configuration from JSON files...');

  // Import Modbus config
  const modbusConfigPath = path.join(__dirname, '../features/protocol-adapters/modbus/config/windows.json');
  if (fs.existsSync(modbusConfigPath)) {
    try {
      const modbusConfig = JSON.parse(fs.readFileSync(modbusConfigPath, 'utf-8'));
      await DeviceSensorModel.importFromJson('modbus', modbusConfig);
      console.log('✅ Imported Modbus configuration');
    } catch (error: any) {
      console.error('❌ Failed to import Modbus config:', error.message);
    }
  }

  // Import CAN config (if it exists)
  const canConfigPath = path.join(__dirname, '../features/protocol-adapters/can/config/windows.json');
  if (fs.existsSync(canConfigPath)) {
    try {
      const canConfig = JSON.parse(fs.readFileSync(canConfigPath, 'utf-8'));
      await DeviceSensorModel.importFromJson('can', canConfig);
      console.log('✅ Imported CAN configuration');
    } catch (error: any) {
      console.error('❌ Failed to import CAN config:', error.message);
    }
  }

  // Import OPC-UA config (if it exists)
  const opcuaConfigPath = path.join(__dirname, '../features/protocol-adapters/opcua/config/windows.json');
  if (fs.existsSync(opcuaConfigPath)) {
    try {
      const opcuaConfig = JSON.parse(fs.readFileSync(opcuaConfigPath, 'utf-8'));
      await DeviceSensorModel.importFromJson('opcua', opcuaConfig);
      console.log('✅ Imported OPC-UA configuration');
    } catch (error: any) {
      console.error('❌ Failed to import OPC-UA config:', error.message);
    }
  }

  console.log('✅ Protocol adapter configuration import complete');
}
