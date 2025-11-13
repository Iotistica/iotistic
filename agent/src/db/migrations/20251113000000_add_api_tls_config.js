/**
 * Add apiTlsConfig column to device table
 * Stores API HTTPS TLS/SSL configuration from provisioning response
 */

exports.up = function(knex) {
  return knex.schema.table('device', (table) => {
    table.text('apiTlsConfig').nullable().comment('JSON config for API HTTPS TLS/SSL settings');
  });
};

exports.down = function(knex) {
  return knex.schema.table('device', (table) => {
    table.dropColumn('apiTlsConfig');
  });
};
