/**
 * Rename sensors table to endpoints
 * The name "sensors" was misleading as these are protocol endpoints/devices
 */

exports.up = async function(knex) {
  // SQLite doesn't support ALTER TABLE RENAME directly in some versions
  // So we'll use a transaction to rename the table safely
  
  // Rename the table
  await knex.schema.renameTable('sensors', 'endpoints');
};

exports.down = async function(knex) {
  // Revert: rename back to sensors
  await knex.schema.renameTable('endpoints', 'sensors');
};
