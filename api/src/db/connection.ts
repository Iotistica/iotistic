/**
 * Database connection and query interface
 * PostgreSQL connection pool management
 */

import { Pool, PoolClient, QueryResult } from 'pg';
import logger from '../utils/logger';

// Database configuration from environment variables
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'iotistic',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: parseInt(process.env.DB_POOL_SIZE || '20'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

// Create connection pool
export const pool = new Pool(dbConfig);

// Handle pool errors
pool.on('error', (err) => {
  logger.error('Unexpected error on idle database client', err);
  process.exit(-1);
});

/**
 * Execute a query with parameterized values
 */
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    return result;
  } catch (error) {
    logger.error('Query error', { text, error });
    throw error;
  }
}

/**
 * Get a client from the pool for transactions
 */
export async function getClient(): Promise<PoolClient> {
  const client = await pool.connect();
  return client;
}

/**
 * Execute a function within a transaction
 */
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Test database connection
 */
export async function testConnection(): Promise<boolean> {
  try {
    logger.info('Testing database connection with config:', {
      host: dbConfig.host,
      port: dbConfig.port,
      database: dbConfig.database,
      user: dbConfig.user,
    });
    
    const result = await query('SELECT NOW() as now');
    logger.log(' Database connected successfully at', result.rows[0].now);
    return true;
  } catch (error) {
    logger.error(' Database connection failed:', error);
    if (error instanceof Error) {
      logger.error('Connection error details:', {
        message: error.message,
        code: (error as any).code,
        host: dbConfig.host,
        port: dbConfig.port,
      });
    }
    return false;
  }
}

/**
 * Initialize database schema
 * @deprecated Use runMigrations() from migrations.ts instead
 */
export async function initializeSchema(): Promise<void> {
  logger.warn('  initializeSchema() is deprecated, using migration system instead');
  
  // Import and run migrations
  const { runMigrations } = await import('./migrations');
  await runMigrations();
}

/**
 * Close all database connections
 */
export async function close(): Promise<void> {
  await pool.end();
  logger.info('Database connections closed');
}

export default {
  query,
  getClient,
  transaction,
  testConnection,
  initializeSchema,
  close,
  pool,
};
