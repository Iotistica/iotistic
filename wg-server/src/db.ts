import { Pool } from 'pg';
import logger from './logger';

let pool: Pool | null = null;

export function initializeDatabase() {
  const config = {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'wireguard',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };

  pool = new Pool(config);

  pool.on('error', (err) => {
    logger.error('Unexpected database error', err);
  });

  logger.info('Database connection pool initialized');
  return pool;
}

export function getPool(): Pool {
  if (!pool) {
    throw new Error('Database not initialized. Call initializeDatabase() first.');
  }
  return pool;
}

export async function query(text: string, params?: any[]) {
  const pool = getPool();
  const start = Date.now();
  
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    
    logger.debug('Database query executed', {
      query: text.substring(0, 100),
      duration: `${duration}ms`,
      rows: result.rowCount,
    });
    
    return result;
  } catch (error: any) {
    logger.error('Database query error', {
      query: text,
      error: error.message,
    });
    throw error;
  }
}

export async function testConnection(): Promise<boolean> {
  try {
    await query('SELECT 1');
    logger.info('Database connection successful');
    return true;
  } catch (error: any) {
    logger.error('Database connection failed', error);
    return false;
  }
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database connection pool closed');
  }
}
