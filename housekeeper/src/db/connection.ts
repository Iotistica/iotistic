/**
 * Database Connection Pool
 * Shared PostgreSQL connection for housekeeper service
 */

import { Pool, PoolConfig } from 'pg';
import logger from '../utils/logger';

const config: PoolConfig = {
  host: process.env.DB_HOST || 'postgres',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'iotistic',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: parseInt(process.env.DB_POOL_MAX || '10'),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || '10000'),
};

export const pool = new Pool(config);

// Log connection events
pool.on('connect', () => {
  logger.debug('New database connection established');
});

pool.on('error', (err) => {
  logger.error('Unexpected database error', { error: err.message, stack: err.stack });
});

// Test connection on startup
export async function testConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as now, current_database() as database');
    client.release();
    
    logger.info('Database connection successful', {
      database: result.rows[0].database,
      timestamp: result.rows[0].now
    });
    
    return true;
  } catch (error: any) {
    logger.error('Database connection failed', {
      error: error.message,
      host: config.host,
      database: config.database
    });
    return false;
  }
}

// Graceful shutdown
export async function closePool(): Promise<void> {
  try {
    await pool.end();
    logger.info('Database connection pool closed');
  } catch (error: any) {
    logger.error('Error closing database pool', { error: error.message });
  }
}
