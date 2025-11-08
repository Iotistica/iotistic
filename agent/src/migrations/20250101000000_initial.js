/**
 * Initial migration for container-manager database
 * Creates tables for apps, services, images, and state tracking
 */

export async function up(knex) {
	// Create app table
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

	// Create service table
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

	// Create image table
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

	// Create state snapshot table
	await knex.schema.createTable('stateSnapshot', (table) => {
		table.increments('id').primary();
		table.string('type').notNullable(); // 'current' or 'target'
		table.json('state'); // Full state snapshot
		table.timestamp('createdAt').defaultTo(knex.fn.now());
	});

	console.log('Created database tables: app, service, image, stateSnapshot');
}

export async function down(knex) {
	await knex.schema.dropTableIfExists('stateSnapshot');
	await knex.schema.dropTableIfExists('image');
	await knex.schema.dropTableIfExists('service');
	await knex.schema.dropTableIfExists('app');
}
