"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
const monitor_1 = require("./services/monitor");
const logger_1 = require("./utils/logger");
const routes_1 = __importDefault(require("./routes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = parseInt(process.env.PORT || '3500');
const HOST = process.env.HOST || '0.0.0.0';
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use((req, res, next) => {
    logger_1.logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('user-agent')
    });
    next();
});
app.get('/health', (_req, res) => {
    res.json({
        status: 'healthy',
        service: 'mqtt-monitor',
        timestamp: new Date().toISOString()
    });
});
app.get('/ready', (req, res) => {
    res.json({
        status: 'ready',
        service: 'mqtt-monitor',
        timestamp: new Date().toISOString()
    });
});
app.use('/api/v1', routes_1.default);
app.use((err, req, res, next) => {
    logger_1.logger.error('Unhandled error', {
        error: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method
    });
    res.status(500).json({
        success: false,
        error: 'Internal server error'
    });
});
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});
async function initializeDatabase() {
    const pool = new pg_1.Pool({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        database: process.env.DB_NAME || 'iotistic',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        max: parseInt(process.env.DB_POOL_SIZE || '10'),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
    });
    try {
        await pool.query('SELECT 1');
        logger_1.logger.info('Database connection established');
        return pool;
    }
    catch (error) {
        logger_1.logger.error('Failed to connect to database', { error: error.message });
        throw error;
    }
}
async function start() {
    try {
        logger_1.logger.info('Starting MQTT Monitor Service');
        const dbPool = await initializeDatabase();
        const { instance: monitor, dbService } = await monitor_1.MQTTMonitorService.initialize(dbPool);
        const { setMonitorInstance } = await Promise.resolve().then(() => __importStar(require('./routes')));
        setMonitorInstance(monitor, dbService);
        app.listen(PORT, HOST, () => {
            logger_1.logger.info(`MQTT Monitor Service listening on ${HOST}:${PORT}`);
            logger_1.logger.info(`Health check: http://${HOST}:${PORT}/health`);
            logger_1.logger.info(`API documentation: http://${HOST}:${PORT}/api/v1/status`);
        });
        const shutdown = async (signal) => {
            logger_1.logger.info(`Received ${signal}, shutting down gracefully`);
            if (monitor) {
                await monitor.stop();
            }
            await dbPool.end();
            process.exit(0);
        };
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    }
    catch (error) {
        logger_1.logger.error('Failed to start service', { error: error.message });
        process.exit(1);
    }
}
start();
//# sourceMappingURL=index.js.map