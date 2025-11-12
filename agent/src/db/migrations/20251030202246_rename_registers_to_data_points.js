/**
 * Migration: Rename 'registers' to 'data_points' for protocol-neutral design
 * Supports Modbus registers, OPC-UA nodes, CAN messages, and future protocols
 */

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // Rename registers column to data_points for protocol neutrality
  await knex.schema.alterTable('protocol_adapter_devices', (table) => {
    table.renameColumn('registers', 'data_points');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  // Revert back to registers
  await knex.schema.alterTable('protocol_adapter_devices', (table) => {
    table.renameColumn('data_points', 'registers');
  });
};
