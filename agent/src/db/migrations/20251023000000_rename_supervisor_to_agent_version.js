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
	} 
	
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
