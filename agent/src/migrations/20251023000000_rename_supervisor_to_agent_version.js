/**
 * Migration to rename supervisorVersion to agentVersion
 * Part of supervisor_version → agent_version refactoring
 */

export async function up(knex) {
	// Check if the old column exists before renaming
	const hasOldColumn = await knex.schema.hasColumn('device', 'supervisorVersion');
	
	if (hasOldColumn) {
		console.log('Renaming supervisorVersion → agentVersion in device table...');
		
		// SQLite doesn't support ALTER TABLE RENAME COLUMN directly
		// We need to use a different approach
		await knex.schema.table('device', (table) => {
			table.string('agentVersion');
		});
		
		// Copy data from old column to new column
		await knex.raw('UPDATE device SET agentVersion = supervisorVersion');
		
		// Drop old column
		await knex.schema.table('device', (table) => {
			table.dropColumn('supervisorVersion');
		});
		
		console.log('Column renamed successfully');
	} else {
		console.log('supervisorVersion column does not exist (already migrated or new installation)');
	}
	
	// Set default value from environment variable if agentVersion is null
	const agentVersion = process.env.AGENT_VERSION || '1.0.0';
	await knex.raw('UPDATE device SET agentVersion = ? WHERE agentVersion IS NULL', [agentVersion]);
	console.log(`Set default agent version to ${agentVersion} for devices with null value`);
}

export async function down(knex) {
	// Reverse: rename agentVersion back to supervisorVersion
	const hasNewColumn = await knex.schema.hasColumn('device', 'agentVersion');
	
	if (hasNewColumn) {
		await knex.schema.table('device', (table) => {
			table.string('supervisorVersion');
		});
		
		await knex.raw('UPDATE device SET supervisorVersion = agentVersion');
		
		await knex.schema.table('device', (table) => {
			table.dropColumn('agentVersion');
		});
	}
}
