#!/usr/bin/env node

/**
 * Simple test script for Modbus Adapter
 * Tests the Unix socket output by creating a mock Modbus TCP server
 */

const net = require('net');
const fs = require('fs');
const path = require('path');

// Simple Modbus TCP server for testing
class MockModbusServer {
  constructor(port = 5020) {
    this.port = port;
    this.server = null;
  }

  start() {
    this.server = net.createServer((socket) => {
      console.log('Modbus client connected');
      
      socket.on('data', (data) => {
        // Simple mock response for holding registers read (function code 3)
        if (data.length >= 8 && data[7] === 0x03) {
          const response = Buffer.from([
            data[0], data[1],  // Transaction ID
            0x00, 0x00,        // Protocol ID
            0x00, 0x05,        // Length
            data[6],           // Unit ID
            0x03,              // Function code
            0x02,              // Byte count
            0x00, 0x64         // Data (100 in decimal)
          ]);
          socket.write(response);
        }
      });

      socket.on('end', () => {
        console.log('Modbus client disconnected');
      });
    });

    this.server.listen(this.port, () => {
      console.log(`Mock Modbus server listening on port ${this.port}`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      console.log('Mock Modbus server stopped');
    }
  }
}

// Socket reader for testing
class SocketReader {
  constructor(socketPath) {
    this.socketPath = socketPath;
    this.client = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.client = net.connect(this.socketPath, () => {
        console.log('Connected to Unix socket');
        resolve();
      });

      this.client.on('data', (data) => {
        console.log('Received data:', data.toString());
      });

      this.client.on('error', (err) => {
        console.error('Socket error:', err.message);
        reject(err);
      });

      this.client.on('end', () => {
        console.log('Socket connection ended');
      });
    });
  }

  disconnect() {
    if (this.client) {
      this.client.end();
    }
  }
}

// Test configuration
const testConfig = {
  devices: [
    {
      name: 'test-device',
      slaveId: 1,
      connection: {
        type: 'tcp',
        host: 'localhost',
        port: 5020,
        timeout: 5000,
        retryAttempts: 3,
        retryDelay: 1000
      },
      registers: [
        {
          name: 'test-register',
          address: 40001,
          functionCode: 3,
          dataType: 'uint16',
          count: 1,
          endianness: 'big',
          scale: 1,
          offset: 0,
          unit: 'units',
          description: 'Test register'
        }
      ],
      pollInterval: 2000,
      enabled: true
    }
  ],
  output: {
    socketPath: '/tmp/test-modbus.sock',
    dataFormat: 'json',
    delimiter: '\n',
    includeTimestamp: true,
    includeDeviceName: true
  },
  logging: {
    level: 'debug',
    enableConsole: true,
    enableFile: false
  }
};

async function runTest() {
  console.log('🧪 Starting Modbus Adapter Test\n');

  // Start mock Modbus server
  const server = new MockModbusServer(5020);
  server.start();

  // Wait a bit for server to start
  await new Promise(resolve => setTimeout(resolve, 1000));

  try {
    // Import and create adapter (would need actual implementation)
    console.log('📝 Test configuration:');
    console.log(JSON.stringify(testConfig, null, 2));
    
    console.log('\n✅ Mock Modbus server started on port 5020');
    console.log('📡 Expected socket output at:', testConfig.output.socketPath);
    
    // In real test, you would:
    // const { ModbusAdapter, ConsoleLogger } = require('./dist/index.js');
    // const logger = new ConsoleLogger('debug', true);
    // const adapter = new ModbusAdapter(testConfig, logger);
    // await adapter.start();
    
    console.log('\n📋 To test manually:');
    console.log('1. Build the adapter: npm run build');
    console.log('2. Save test config to file: test-config.json');
    console.log('3. Run adapter: node dist/index.js --config test-config.json');
    console.log('4. In another terminal, read from socket:');
    console.log(`   nc -U ${testConfig.output.socketPath}`);
    
    // Keep running for manual testing
    console.log('\n⏳ Press Ctrl+C to stop...');
    
    process.on('SIGINT', () => {
      console.log('\n🛑 Stopping test...');
      server.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    server.stop();
    process.exit(1);
  }
}

// Write test config to file
const configPath = path.join(__dirname, 'test-config.json');
fs.writeFileSync(configPath, JSON.stringify(testConfig, null, 2));
console.log(`📄 Test configuration saved to: ${configPath}`);

// Run test
runTest();