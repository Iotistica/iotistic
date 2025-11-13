/**
 * Add mqttBrokerConfig column to device table
 * Stores TLS/SSL configuration from provisioning response
 */

exports.up = function(knex) {
  return knex.schema.table('device', (table) => {
    table.text('mqttBrokerConfig').nullable().comment('JSON config for MQTT TLS/SSL settings');
  });
};

exports.down = function(knex) {
  return knex.schema.table('device', (table) => {
    table.dropColumn('mqttBrokerConfig');
  });
};
