/**
 * Windows Named Pipe Connection Test
 * 
 * This script tests connecting to a Windows Named Pipe created by the Modbus adapter.
 * 
 * Usage:
 *   node test-named-pipe.js
 *   node test-named-pipe.js custom-pipe-name
 */

const net = require('net');

// Get pipe name from command line or use default
const pipeName = process.argv[2] || 'modbus';
const pipePath = `\\\\.\\pipe\\${pipeName}`;

console.log('🧪 Testing Windows Named Pipe Connection');
console.log('━'.repeat(50));
console.log(`📍 Pipe Path: ${pipePath}`);
console.log(`⏰ Timestamp: ${new Date().toISOString()}`);
console.log('━'.repeat(50));
console.log('');

let messageCount = 0;
let bytesReceived = 0;
const startTime = Date.now();

// Create connection to Named Pipe
const client = net.createConnection(pipePath);

client.on('connect', () => {
  console.log('✅ Successfully connected to Named Pipe!');
  console.log('📨 Waiting for data...');
  console.log('');
});

client.on('data', (data) => {
  messageCount++;
  bytesReceived += data.length;
  
  const dataStr = data.toString();
  const lines = dataStr.split('\n').filter(line => line.trim());
  
  lines.forEach((line, index) => {
    try {
      const json = JSON.parse(line);
      console.log(`📨 Message #${messageCount}:`);
      console.log(`   Device: ${json.deviceName || 'N/A'}`);
      console.log(`   Register: ${json.registerName || 'N/A'}`);
      console.log(`   Value: ${json.value} ${json.unit || ''}`);
      console.log(`   Timestamp: ${json.timestamp || 'N/A'}`);
      console.log('');
    } catch (err) {
      console.log(`📨 Message #${messageCount}: ${line}`);
    }
  });
});

client.on('error', (err) => {
  console.error('');
  console.error('❌ Connection Error!');
  console.error('━'.repeat(50));
  console.error(`Error Code: ${err.code || 'UNKNOWN'}`);
  console.error(`Message: ${err.message}`);
  console.error('');
  
  if (err.code === 'ENOENT') {
    console.error('💡 Troubleshooting:');
    console.error('   1. Is the Modbus adapter running?');
    console.error('   2. Check adapter logs for "IPC server started"');
    console.error('   3. Verify pipe name matches adapter config');
    console.error('');
    console.error('   Start adapter with:');
    console.error('   cd agent/protocol-adapters');
    console.error('   node dist/modbus/index.js --config modbus/config/windows.json');
  } else if (err.code === 'EPIPE') {
    console.error('💡 The adapter closed the connection');
    console.error('   Check adapter logs for errors');
  }
  
  console.error('━'.repeat(50));
  process.exit(1);
});

client.on('close', () => {
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  
  console.log('');
  console.log('🔌 Connection Closed');
  console.log('━'.repeat(50));
  console.log(`📊 Statistics:`);
  console.log(`   Messages Received: ${messageCount}`);
  console.log(`   Bytes Received: ${bytesReceived}`);
  console.log(`   Duration: ${duration}s`);
  if (messageCount > 0) {
    console.log(`   Avg Rate: ${(messageCount / duration).toFixed(2)} msg/s`);
  }
  console.log('━'.repeat(50));
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('');
  console.log('⏹️  Stopping test...');
  client.destroy();
});

// Set timeout for initial connection
setTimeout(() => {
  if (!client.writable) {
    console.error('');
    console.error('⏱️  Connection Timeout (30s)');
    console.error('━'.repeat(50));
    console.error('💡 The adapter may not be running or the pipe name is incorrect.');
    console.error('');
    console.error('   Verify adapter is running:');
    console.error('   Get-Process node');
    console.error('');
    console.error('   Check available pipes:');
    console.error('   Get-ChildItem \\\\.\\pipe\\ | Where-Object { $_.Name -like "*modbus*" }');
    console.error('━'.repeat(50));
    process.exit(1);
  }
}, 30000);

console.log('⏳ Attempting to connect...');
console.log('   (Press Ctrl+C to stop)');
console.log('');
