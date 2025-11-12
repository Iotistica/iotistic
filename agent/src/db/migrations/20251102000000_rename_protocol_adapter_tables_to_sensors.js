/**
 * Migration: Rename protocol_adapter tables to sensors
 * Renames:
 *   - protocol_adapter_devices -> sensors
 *   - protocol_adapter_outputs -> sensor_outputs
 */

exports.up = async function(knex) {
  // Rename protocol_adapter_devices to sensors
  await knex.schema.renameTable('protocol_adapter_devices', 'sensors');
  
  // Rename protocol_adapter_outputs to sensor_outputs
  await knex.schema.renameTable('protocol_adapter_outputs', 'sensor_outputs');
};

exports.down = async function(knex) {
  // Revert: Rename back to original names
  await knex.schema.renameTable('sensor_outputs', 'protocol_adapter_outputs');
  await knex.schema.renameTable('sensors', 'protocol_adapter_devices');
};
