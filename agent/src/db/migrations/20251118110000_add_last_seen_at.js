/**
 * Migration: Add lastSeenAt to sensors table
 * Purpose: Track when discovered devices were last seen during discovery
 */

exports.up = async function(knex) {
  await knex.schema.table('sensors', (table) => {
    table.timestamp('lastSeenAt');
    table.index('lastSeenAt');
  });

  // Set lastSeenAt to now for existing sensors
  await knex('sensors').update({ lastSeenAt: new Date().toISOString() });

  console.log('✓ Added lastSeenAt column to sensors table');
};

exports.down = async function(knex) {
  await knex.schema.table('sensors', (table) => {
    table.dropColumn('lastSeenAt');
  });
};
