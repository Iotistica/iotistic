/**
 * Migration to add two-phase authentication fields to device table
 * Implements Balena-style provisioning with separate keys
 */

export async function up(knex) {
	// Add new columns for two-phase auth
	await knex.schema.table('device', (table) => {
		// Device-specific key (permanent, generated locally)
		table.string('deviceApiKey');
		
		// Provisioning/fleet key (temporary, from cloud)
		table.string('provisioningApiKey');
		
		// Application ID for fleet management
		table.integer('applicationId');
		
	// MAC address for hardware identification
	table.string('macAddress');
	
	// OS/agent versions for compatibility checks
	table.string('osVersion');
	table.string('agentVersion');
});	console.log('Added two-phase authentication fields to device table');
}

export async function down(knex) {
	await knex.schema.table('device', (table) => {
		table.dropColumn('deviceApiKey');
		table.dropColumn('provisioningApiKey');
		table.dropColumn('applicationId');
		table.dropColumn('macAddress');
		table.dropColumn('osVersion');
		table.dropColumn('agentVersion');
	});
}
