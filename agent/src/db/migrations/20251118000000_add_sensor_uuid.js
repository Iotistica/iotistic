/**
 * Migration: Add UUID to sensors table
 * Purpose: Provide stable identifier for cloud/edge sync (name can change)
 */

const { v4: uuidv4 } = require('uuid');

exports.up = async function(knex) {
  // Add uuid column (nullable initially)
  await knex.schema.table('sensors', (table) => {
    table.string('uuid', 36).unique();
    table.index('uuid');
  });

  // Generate UUIDs for existing sensors
  const sensors = await knex('sensors').select('id', 'name');
  for (const sensor of sensors) {
    await knex('sensors')
      .where({ id: sensor.id })
      .update({ uuid: uuidv4() });
  }

  // Make uuid NOT NULL after populating
  await knex.raw('UPDATE sensors SET uuid = ? WHERE uuid IS NULL', [uuidv4()]);
  
  console.log(`✓ Added UUIDs to ${sensors.length} existing sensors`);
};

exports.down = async function(knex) {
  await knex.schema.table('sensors', (table) => {
    table.dropColumn('uuid');
  });
};
