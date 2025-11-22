/**
 * Housekeeper Service - Standalone Microservice
 * 
 * Runs scheduled maintenance tasks for database cleanup, partitioning, and optimization.
 * Designed to run as a single-replica service in Kubernetes or Docker Compose.
 * 
 * Features:
 * - Cron-based task scheduling
 * - Manual task triggering via REST API
 * - Task execution history tracking
 * - Graceful shutdownddd
 */

import express, { Request, Response } from 'express';
import cors from 'cors';
import { createHousekeeper } from './housekeeper';
import { testConnection, closePool } from './db/connection';
import logger from './utils/logger';
import housekeeperRoutes, { setHousekeeperInstance } from './routes/housekeeper';

const app = express();
const PORT = parseInt(process.env.PORT || '3400');
const HOST = process.env.HOST || '0.0.0.0';

// Middleware
app.use(cors());
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  logger.debug('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip,
  });
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    service: 'housekeeper',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Readiness check (for Kubernetes)
app.get('/ready', async (req: Request, res: Response) => {
  try {
    const dbHealthy = await testConnection();
    
    if (dbHealthy) {
      res.json({
        status: 'ready',
        database: 'connected',
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        database: 'disconnected',
      });
    }
  } catch (error: any) {
    logger.error('Readiness check failed', { error: error.message });
    res.status(503).json({
      status: 'not ready',
      error: error.message,
    });
  }
});

// API routes
app.use('/api/housekeeper', housekeeperRoutes);

// Root endpoint
app.get('/', (req: Request, res: Response) => {
  res.json({
    service: 'iotistic-housekeeper',
    version: '1.0.0',
    description: 'Standalone housekeeper service for maintenance tasks',
    endpoints: {
      health: '/health',
      ready: '/ready',
      tasks: '/api/housekeeper/tasks',
      status: '/api/housekeeper/status',
    },
  });
});

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: any, req: Request, res: Response, next: any) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
  });
  
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// Graceful shutdown handler
async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`${signal} signal received, starting graceful shutdown...`);

  // Stop accepting new requests
  server.close(() => {
    logger.info('HTTP server closed');
  });

  try {
    // Shutdown housekeeper (waits for running tasks to complete)
    if (housekeeper) {
      await housekeeper.shutdown();
    }

    // Close database connections
    await closePool();

    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error: any) {
    logger.error('Error during graceful shutdown', { error: error.message });
    process.exit(1);
  }
}

// Create housekeeper instance
const housekeeper = createHousekeeper({
  enabled: process.env.HOUSEKEEPER_ENABLED !== 'false',
  timezone: process.env.TIMEZONE || 'Etc/UTC',
});

// Start server
let server: any;

async function startServer(): Promise<void> {
  try {
    // Test database connection
    logger.info('Testing database connection...');
    const dbHealthy = await testConnection();
    
    if (!dbHealthy) {
      logger.error('Database connection failed, exiting...');
      process.exit(1);
    }

    // Initialize housekeeper
    logger.info('Initializing housekeeper...');
    await housekeeper.initialize();
    setHousekeeperInstance(housekeeper);

    // Start HTTP server
    server = app.listen(PORT, HOST, () => {
      logger.info(`Housekeeper service started`, {
        port: PORT,
        host: HOST,
        environment: process.env.NODE_ENV || 'production',
      });
    });

    // Setup shutdown handlers
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error: any) {
    logger.error('Failed to start server', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  }
}

// Start the service
startServer();
