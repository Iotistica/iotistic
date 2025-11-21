#!/bin/sh
set -e

# Insert default sensor outputs if not exists (idempotent)
echo "Ensuring default sensor outputs exist..."
node -e "
const Database = require('better-sqlite3');
const db = new Database('/app/data/device.sqlite');

// Check if sensor_outputs table exists
const tableExists = db.prepare(\"SELECT name FROM sqlite_master WHERE type='table' AND name='sensor_outputs'\").get();

if (tableExists) {
  const isWindows = process.platform === 'win32';
  const protocols = ['modbus', 'can', 'opcua'];
  const socketPaths = {
    modbus: isWindows ? '\\\\\\\\.\\\\pipe\\\\modbus' : '/tmp/modbus.sock',
    can: isWindows ? '\\\\\\\\.\\\\pipe\\\\canbus' : '/tmp/canbus.sock',
    opcua: isWindows ? '\\\\\\\\.\\\\pipe\\\\opcua' : '/tmp/opcua.sock'
  };

  protocols.forEach(protocol => {
    const exists = db.prepare('SELECT id FROM sensor_outputs WHERE protocol = ?').get(protocol);
    if (!exists) {
      console.log(\`Inserting default output for \${protocol}\`);
      db.prepare(\`
        INSERT INTO sensor_outputs (protocol, socket_path, data_format, delimiter, include_timestamp, include_device_name, logging)
        VALUES (?, ?, 'json', '\\n', 1, 1, ?)
      \`).run(protocol, socketPaths[protocol], JSON.stringify({ level: 'info' }));
    }
  });
  
  console.log('✓ Default sensor outputs configured');
}

db.close();
" || {
    echo "Warning: Failed to ensure default sensor outputs, continuing anyway..."
}

# Start the agent
echo "Starting agent..."
exec "$@"
