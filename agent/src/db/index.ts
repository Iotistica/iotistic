/**
 * Database Module
 * ===============
 * 
 * Exports database connection, models, and client interface
 */

// Re-export everything from connection (Knex instance, models, utilities)
export * from './connection';

// Re-export database client interface (for device-manager abstraction)
export * from './client';
