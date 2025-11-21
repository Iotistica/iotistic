/**
 * Migration: Add agent_metadata table
 * Purpose: Store discovery metadata and other agent operational state
 */

exports.up = async function(knex) {
  await knex.schema.createTable('agent_metadata', (table) => {
    table.string('key', 255).primary();
    table.text('value').notNullable();
    table.timestamp('createdAt').defaultTo(knex.fn.now());
    table.timestamp('updatedAt').defaultTo(knex.fn.now());
  });

  console.log('✓ Created agent_metadata table');
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('agent_metadata');
};
