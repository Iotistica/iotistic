"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeDatabase = initializeDatabase;
exports.getPool = getPool;
exports.query = query;
exports.getClient = getClient;
exports.closeDatabase = closeDatabase;
exports.testConnection = testConnection;
const pg_1 = require("pg");
const logger_1 = __importDefault(require("./utils/logger"));
let pool = null;
function initializeDatabase() {
    if (pool) {
        return pool;
    }
    const config = {
        host: process.env.DB_HOST || 'postgres',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'iotistic',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
    };
    pool = new pg_1.Pool({
        ...config,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
    });
    pool.on('error', (err) => {
        logger_1.default.error('Unexpected database pool error', { error: err.message });
    });
    pool.on('connect', () => {
        logger_1.default.debug('New database connection established');
    });
    logger_1.default.info('Database connection pool initialized', {
        host: config.host,
        port: config.port,
        database: config.database,
    });
    return pool;
}
function getPool() {
    if (!pool) {
        throw new Error('Database pool not initialized. Call initializeDatabase() first.');
    }
    return pool;
}
async function query(text, params) {
    const pool = getPool();
    const start = Date.now();
    try {
        const result = await pool.query(text, params);
        const duration = Date.now() - start;
        logger_1.default.debug('Database query executed', {
            query: text.substring(0, 100),
            duration: `${duration}ms`,
            rows: result.rowCount,
        });
        return result;
    }
    catch (error) {
        const duration = Date.now() - start;
        logger_1.default.error('Database query failed', {
            query: text.substring(0, 100),
            duration: `${duration}ms`,
            error: error.message,
        });
        throw error;
    }
}
async function getClient() {
    const pool = getPool();
    return pool.connect();
}
async function closeDatabase() {
    if (pool) {
        await pool.end();
        pool = null;
        logger_1.default.info('Database connection pool closed');
    }
}
async function testConnection() {
    try {
        const result = await query('SELECT NOW() as current_time');
        logger_1.default.info('Database connection test successful', {
            currentTime: result.rows[0].current_time,
        });
        return true;
    }
    catch (error) {
        logger_1.default.error('Database connection test failed', { error: error.message });
        return false;
    }
}
//# sourceMappingURL=db.js.map