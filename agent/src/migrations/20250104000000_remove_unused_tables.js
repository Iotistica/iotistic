/**
 * Remove unused tables (app, service, image)
 * 
 * These tables were created for future Balena-style orchestration
 * but are currently unused. The system uses stateSnapshot table instead.
 * 
 * Keeping only:
 * - device (for device identity/provisioning)
 * - stateSnapshot (for container state)
 */

export async function up(knex) {
	console.log('Removing unused tables: app, service, image');
	
	// Drop tables in reverse order of dependencies
	await knex.schema.dropTableIfExists('service');
	await knex.schema.dropTableIfExists('image');
	await knex.schema.dropTableIfExists('app');
	
	console.log('Removed unused tables');
}

export async function down(knex) {
	console.log('Recreating app, service, and image tables');
	
	// Recreate app table
	await knex.schema.createTable('app', (table) => {
		table.increments('id').primary();
		table.integer('appId').notNullable().unique();
		table.string('appName').notNullable();
		table.string('commit');
		table.integer('releaseId');
		table.json('services'); // Stored as JSON for flexibility
		table.timestamp('createdAt').defaultTo(knex.fn.now());
		table.timestamp('updatedAt').defaultTo(knex.fn.now());
	});

	// Recreate service table
	await knex.schema.createTable('service', (table) => {
		table.increments('id').primary();
		table.integer('serviceId').notNullable();
		table.string('serviceName').notNullable();
		table.integer('appId').notNullable();
		table.string('imageName').notNullable();
		table.json('config'); // Full service configuration
		table.string('status').defaultTo('stopped'); // stopped, starting, running, stopping
		table.string('containerId'); // Docker container ID
		table.timestamp('createdAt').defaultTo(knex.fn.now());
		table.timestamp('updatedAt').defaultTo(knex.fn.now());
		
		// Composite unique constraint
		table.unique(['appId', 'serviceId']);
	});

	// Recreate image table
	await knex.schema.createTable('image', (table) => {
		table.increments('id').primary();
		table.string('imageName').notNullable().unique();
		table.integer('appId');
		table.integer('serviceId');
		table.string('dockerImageId'); // Docker's image ID
		table.bigInteger('size'); // Image size in bytes
		table.timestamp('pulledAt').defaultTo(knex.fn.now());
		table.timestamp('createdAt').defaultTo(knex.fn.now());
	});
	
	console.log('Recreated tables (rollback complete)');
}
