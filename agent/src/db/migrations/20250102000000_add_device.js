/**
 * Migration to add device table for provisioning
 */

export async function up(knex) {
	// Create device table
	await knex.schema.createTable('device', (table) => {
		table.increments('id').primary();
		table.string('uuid').notNullable().unique();
		table.string('deviceId');
		table.string('deviceName');
		table.string('deviceType');
		table.string('apiKey');
		table.string('apiEndpoint');
		table.bigInteger('registeredAt');
		table.boolean('provisioned').defaultTo(false);
		table.timestamp('createdAt').defaultTo(knex.fn.now());
		table.timestamp('updatedAt').defaultTo(knex.fn.now());
	});

	console.log('Created device table for provisioning');
}

export async function down(knex) {
	await knex.schema.dropTableIfExists('device');
}
