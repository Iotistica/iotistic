/**
 * Migration: Add protocol adapter configuration tables
 * Stores Modbus, CAN, OPC-UA device configurations in SQLite instead of JSON files
 */

exports.up = async function(knex) {
  // Protocol adapter devices table (Modbus, CAN, OPC-UA sensors)
  await knex.schema.createTable('protocol_adapter_devices', (table) => {
    table.increments('id').primary();
    table.string('name', 255).notNullable().unique(); // e.g., "temperature-sensor"
    table.string('protocol', 50).notNullable(); // "modbus", "can", "opcua"
    table.boolean('enabled').notNullable().defaultTo(true);
    table.integer('poll_interval').notNullable().defaultTo(5000); // ms
    table.jsonb('connection').notNullable(); // Connection details (host, port, serial, etc.)
    table.jsonb('registers'); // DEPRECATED: Use data_points (migration will rename this)
    table.jsonb('metadata'); // Additional protocol-specific config
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
    
    table.index('protocol');
    table.index('enabled');
  });

  // Protocol adapter output config (where data goes after collection)
  await knex.schema.createTable('protocol_adapter_outputs', (table) => {
    table.increments('id').primary();
    table.string('protocol', 50).notNullable().unique(); // One output per protocol type
    table.string('socket_path', 500).notNullable(); // Named pipe or Unix socket
    table.string('data_format', 50).notNullable().defaultTo('json'); // json, csv, etc.
    table.string('delimiter', 10).notNullable().defaultTo('\n');
    table.boolean('include_timestamp').notNullable().defaultTo(true);
    table.boolean('include_device_name').notNullable().defaultTo(true);
    table.jsonb('logging'); // Logging configuration
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('updated_at').notNullable().defaultTo(knex.fn.now());
  });

  // Migrate existing config from windows.json if it exists
  // This will be handled by the agent on startup
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('protocol_adapter_outputs');
  await knex.schema.dropTableIfExists('protocol_adapter_devices');
};
