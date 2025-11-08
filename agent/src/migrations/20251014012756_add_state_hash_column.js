/**
 * Add stateHash column for efficient state comparison
 * 
 * This migration adds a SHA-256 hash column to the stateSnapshot table.
 * The hash is used for fast comparison (64 bytes vs 2-10KB JSON).
 * The original state JSON is kept for recovery and visualization.
 * 
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  // Add stateHash column (nullable initially for backward compatibility)
  await knex.schema.table('stateSnapshot', (table) => {
    table.string('stateHash', 64).nullable().index();
  });
  
  // Compute and populate hashes for existing records
  const crypto = require('crypto');
  const snapshots = await knex('stateSnapshot').select('*');
  
  for (const snapshot of snapshots) {
    const hash = crypto.createHash('sha256')
      .update(snapshot.state)
      .digest('hex');
    
    await knex('stateSnapshot')
      .where({ id: snapshot.id })
      .update({ stateHash: hash });
  }
  
  console.log(`Added stateHash column and computed hashes for ${snapshots.length} record(s)`);
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.table('stateSnapshot', (table) => {
    table.dropColumn('stateHash');
  });
  
  console.log('Removed stateHash column');
};
