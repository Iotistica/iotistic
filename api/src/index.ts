/**
 * Unified Iotistic API Server
 */

import express from 'express';
import cors from 'cors';
import logger from './utils/logger';

// Import route modules
import authRoutes from './routes/auth';
import usersRoutes from './routes/users';
import deviceStateRoutes from './routes/device-state';
import deviceLogsRoutes from './routes/device-logs';
import deviceMetricsRoutes from './routes/device-metrics';
import provisioningRoutes from './routes/provisioning';
import devicesRoutes from './routes/devices';
import adminRoutes from './routes/admin';
import appsRoutes from './routes/apps';
import webhookRoutes from './routes/webhooks';
import imageRegistryRoutes from './routes/image-registry';
import deviceJobsRoutes from './routes/device-jobs';
import scheduledJobsRoutes from './routes/scheduled-jobs';
import rotationRoutes from './routes/rotation';
import digitalTwinRoutes from './routes/digital-twin';
import digitalTwinGraphRoutes from './routes/digital-twin-graph';
import mqttMonitorRoutes from './routes/mqtt-monitor';
import eventsRoutes from './routes/events';
import mqttBrokerRoutes from './routes/mqtt-broker';
import sensorsRoutes from './routes/sensors';
import { router as protocolDevicesRoutes } from './routes/device-sensors';
import { router as trafficRoutes } from './routes/traffic';
import { router as deviceTagsRoutes } from './routes/device-tags';
import housekeeperRoutes, { setHousekeeperInstance } from './routes/housekeeper';
import dashboardLayoutsRoutes from './routes/dashboard-layouts';
import mosquittoAuthRoutes from './routes/mosquitto-auth';
import { trafficLogger} from "./middleware/traffic-logger";
import { startTrafficFlushService, stopTrafficFlushService } from './services/traffic-flush-service';
// Import entity/graph routes
import { createEntitiesRouter } from './routes/entities';
import { createRelationshipsRouter } from './routes/relationships';
import { createGraphRouter } from './routes/graph';

// Import jobs

import { jobScheduler } from './services/job-scheduler';
import poolWrapper from './db/connection';
import { initializeMqtt, shutdownMqtt } from './mqtt';
import { initializeSchedulers, shutdownSchedulers } from './services/rotation-scheduler';
import { createHousekeeper } from './housekeeper';
import { setMonitorInstance } from './routes/mqtt-monitor';
import { MQTTMonitorService } from './services/mqtt-monitor';
import { MQTTDatabaseService } from './services/mqtt-database-service';
import { LicenseValidator } from './services/license-validator';
import licenseRoutes from './routes/license';
import billingRoutes from './routes/billing';
import { websocketManager } from './services/websocket-manager';

// API Version Configuration - Change here to update all routesggg
const API_VERSION = process.env.API_VERSION || 'v1';
const API_BASE = `/api/${API_VERSION}`;
const MQTT_MONITOR_ENABLED = process.env.MQTT_MONITOR_ENABLED === 'true';

const app = express();
const PORT = process.env.PORT || 3002;
const housekeeper = createHousekeeper();

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3001', 'http://localhost:3000', 'http://localhost:4002'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-API-Key']
}));

app.options('*', cors());

// Support compressed (gzip) request bodies
app.use(express.json({ 
  limit: '10mb',
  inflate: true  // Automatically decompress gzip/deflate
}));
app.use(express.urlencoded({ 
  limit: '10mb', 
  extended: true,
  inflate: true  // Automatically decompress gzip/deflate
}));

app.use(trafficLogger);

// Request logging with Winston
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Log incoming request at debug level (less noisy)
  logger.debug(`${req.method} ${req.path}`, {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip
  });
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    
    // Log only the message without metadata object
    logger[logLevel](`${res.statusCode} ${req.method} ${req.path} - ${duration}ms`);
  });
  
  next();
});


// Root endpoint
app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Iotistic Unified API',
    version: '2.0.0',
    apiVersion: API_VERSION,
    apiBase: API_BASE,
    documentation: '/api/docs'
  });
});



// Health check endpoint (for Kubernetes probes)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Setup API documentation
import { setupApiDocs } from './docs';
setupApiDocs(app, API_BASE);

// Mount route modules - All routes now use centralized versioning via API_BASE
app.use(`${API_BASE}/auth`, authRoutes);
app.use(`${API_BASE}/users`, usersRoutes);
app.use(API_BASE, licenseRoutes);

// Mosquitto HTTP Auth Backend (no versioning, called directly by mosquitto-go-auth)
app.use('/mosquitto-auth', mosquittoAuthRoutes);
app.use(`${API_BASE}/billing`, billingRoutes);
app.use(API_BASE, provisioningRoutes);
app.use(API_BASE, devicesRoutes);
app.use(API_BASE, adminRoutes);
app.use(API_BASE, appsRoutes);
app.use(API_BASE, deviceStateRoutes);
app.use(API_BASE, deviceLogsRoutes);
app.use(API_BASE, deviceMetricsRoutes);
app.use(`${API_BASE}/webhooks`, webhookRoutes);
app.use(API_BASE, imageRegistryRoutes);
app.use(API_BASE, deviceJobsRoutes);
app.use(API_BASE, scheduledJobsRoutes);
app.use(API_BASE, rotationRoutes);
app.use(API_BASE, digitalTwinRoutes);
app.use(`${API_BASE}/digital-twin/graph`, digitalTwinGraphRoutes);
app.use(`${API_BASE}/mqtt-monitor`, mqttMonitorRoutes);
app.use(API_BASE, eventsRoutes);
app.use(`${API_BASE}/mqtt`, mqttBrokerRoutes);
app.use(API_BASE, sensorsRoutes);
app.use(API_BASE, protocolDevicesRoutes);
app.use(API_BASE, trafficRoutes);
app.use(API_BASE, deviceTagsRoutes);
app.use(`${API_BASE}/housekeeper`, housekeeperRoutes);
app.use(`${API_BASE}/dashboard-layouts`, dashboardLayoutsRoutes);

// Mount entity/graph routes
app.use(`${API_BASE}/entities`, createEntitiesRouter(poolWrapper.pool));
app.use(`${API_BASE}/relationships`, createRelationshipsRouter(poolWrapper.pool));
app.use(`${API_BASE}/graph`, createGraphRouter(poolWrapper.pool));

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.path} not found`,
    hint: 'See /api/docs for available endpoints'
  });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Server error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    path: req.path
  });
  
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// Start server
async function startServer() {
  logger.info('Initializing Iotistic Unified API...');

  // MQTT Monitor instance (needs to be accessible in shutdown handlers)
  let mqttMonitor: MQTTMonitorService | null = null;

  // Initialize PostgreSQL database
  try {
    const db = await import('./db/connection');
    
    // Log connection details for debugging
    logger.info('Attempting PostgreSQL connection:', {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || '5432',
      database: process.env.DB_NAME || 'iotistic',
      user: process.env.DB_USER || 'postgres',
    });
    
    const connected = await db.testConnection();
    
    if (!connected) {
      logger.error('Failed to connect to PostgreSQL database - check connection settings above');
      process.exit(1);
    }
    
    // Initialize schema
    await db.initializeSchema();
    logger.info('PostgreSQL database initialized successfully');
    
    // Initialize MQTT admin user (replaces K8s postgres-init-job)
    const { initializeMqttAdmin } = await import('./services/mqtt-bootstrap');
    await initializeMqttAdmin();
  } catch (error) {
    logger.error('Database initialization error:', error);
    if (error instanceof Error) {
      logger.error('Error details:', {
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      });
    }
    process.exit(1);
  }

  // Load system configuration (MQTT, VPN, etc.)
  try {
    const { SystemConfig } = await import('./config/system-config');
    await SystemConfig.load();
    logger.info('System configuration loaded successfully');
  } catch (error) {
    logger.error('Failed to load system configuration', { error });
    process.exit(1);
  }

  // Initialize license validator
  try {
    logger.info('Initializing license validator...');
    const licenseValidator = LicenseValidator.getInstance();
    await licenseValidator.init();
  } catch (error) {
    logger.warn('License validator initialization failed', { error });
    // Don't exit - will run in unlicensed mode with limited features
  }

  // Initialize Neo4j database for Digital Twin graph
  try {
    logger.info('Connecting to Neo4j database...');
    const { neo4jService } = await import('./services/neo4j.service');
    await neo4jService.connect();
    logger.info('Neo4j database connected successfully');
  } catch (error) {
    logger.warn('Neo4j connection failed', { error });
    // Don't exit - Digital Twin graph features will be unavailable
  }

  // Start heartbeat monitor for device connectivity
  try {
    const heartbeatMonitor = await import('./services/heartbeat-monitor');
    heartbeatMonitor.default.start();
    logger.info('Heartbeat monitor started');
  } catch (error) {
    logger.warn('Failed to start heartbeat monitor', { error });
    // Don't exit - this is not critical for API operation
  }


  // Start job scheduler for scheduled/recurring jobs
  try {
    await jobScheduler.start();
    logger.info('Job scheduler started');
  } catch (error) {
    logger.warn('Failed to start job scheduler', { error });
    // Don't exit - this is not critical for API operation
  }

  // Start housekeeper for maintenance tasks
  try {
    await housekeeper.initialize();
    setHousekeeperInstance(housekeeper);
    logger.info('Housekeeper started');
  } catch (error) {
    logger.warn('Failed to start housekeeper', { error });
    // Don't exit - this is not critical for API operation
  }

  // Start traffic flush service (persists device traffic metrics to database)
  try {
    startTrafficFlushService();
    logger.info('Traffic flush service started');
  } catch (error) {
    logger.warn('Failed to start traffic flush service', { error });
    // Don't exit - this is not critical for API operation
  }

  // Initialize MQTT Jobs Subscriber (listens for job status updates from devices)
  try {
    const { getMqttJobsSubscriber } = await import('./services/mqtt-jobs-subscriber');
    const subscriber = getMqttJobsSubscriber();
    await subscriber.initialize();
    logger.info('MQTT Jobs Subscriber started');
  } catch (error) {
    logger.warn('Failed to start MQTT Jobs Subscriber', { error });
    // Don't exit - this is not critical for API operation
  }

  // Initialize Redis for real-time pub/sub
  try {
    const { redisClient } = await import('./redis/client');
    await redisClient.connect();
    logger.info('✓ Redis client connected successfully');
  } catch (error) {
    logger.warn('⚠️  Redis connection failed - continuing without real-time features', {
      error: error instanceof Error ? error.message : String(error),
      note: 'This is non-critical - metrics will use PostgreSQL only'
    });
    // Don't exit - graceful degradation (continues with PostgreSQL only)
  }

  // Start Metrics Batch Worker (Phase 2 - Redis Streams)
  try {
    const { startMetricsBatchWorker } = await import('./workers/metrics-batch-worker');
    await startMetricsBatchWorker();
    logger.info('Metrics batch worker started');
  } catch (error) {
    logger.warn('Failed to start metrics batch worker', { error });
    // Don't exit - will fall back to direct writes
  }

  // Initialize MQTT manager for device messages
  (async () => {
    try {
      await initializeMqtt();
      // MQTT manager will log its own initialization status
    } catch (error) {
      logger.warn('⚠️  MQTT service initialization failed - will retry in background', {
        error: error instanceof Error ? error.message : String(error),
        note: 'This is non-critical - API will continue without MQTT'
      });
      retryMqttInitialization();
    }
  })();

  // Initialize API key rotation schedulers
  try {
    initializeSchedulers();
    logger.info('API key rotation schedulers started');
  } catch (error) {
    logger.warn('Failed to start rotation schedulers', { error });
    // Don't exit - this is not critical for API operation
  }

  // MQTT broker monitor
  if (MQTT_MONITOR_ENABLED) {
    const mqttMonitorBundle = await MQTTMonitorService.initialize(poolWrapper.pool);

    if (mqttMonitorBundle.instance) {
      setMonitorInstance(mqttMonitorBundle.instance, mqttMonitorBundle.dbService);
      websocketManager.setMqttMonitor(mqttMonitorBundle.instance);
      logger.info('MQTT Monitor started');
    }
  } else {
    logger.info('MQTT Monitor disabled via MQTT_MONITOR_ENABLED=false');
  }


  const server = app.listen(PORT, () => {
    logger.info('='.repeat(80));
    logger.info('☁️  Iotistic Unified API Server');
    logger.info('='.repeat(80));
    logger.info(`Server running on http://localhost:${PORT}`);
    logger.info('='.repeat(80));
  });

  // Initialize WebSocket server
  try {
    websocketManager.initialize(server);
    logger.info(`WebSocket Server initialized (ws://localhost:${PORT}/ws)`);
    
    // Initialize Redis pub/sub for real-time metrics (Phase 1)
    await websocketManager.initializeRedis();
  } catch (error) {
    logger.warn('Failed to initialize WebSocket server', { error });
    // Don't exit - this is not critical for API operation
  }

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down gracefully...');
    
    // Set a timeout to force close if shutdown hangs
    const forceCloseTimeout = setTimeout(() => {
      logger.warn('Forcefully closing server after timeout');
      process.exit(1);
    }, 10000); // 10 second timeout
    
    // Shutdown WebSocket Server
    try {
      websocketManager.shutdown();
      logger.info('WebSocket Server stopped');
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Shutdown Metrics Batch Worker
    try {
      const { stopMetricsBatchWorker } = await import('./workers/metrics-batch-worker');
      await stopMetricsBatchWorker();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Shutdown Redis
    try {
      const { redisClient } = await import('./redis/client');
      await redisClient.disconnect();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Shutdown MQTT Monitor
    try {
      if (mqttMonitor) {
        await mqttMonitor.stop();
        logger.info('MQTT Monitor stopped');
      }
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Shutdown MQTT
    try {
      await shutdownMqtt();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Shutdown rotation schedulers
    try {
      shutdownSchedulers();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    
    // Shutdown housekeeper
    try {
      await housekeeper.shutdown();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Stop heartbeat monitor
    try {
      const heartbeatMonitor = await import('./services/heartbeat-monitor');
      heartbeatMonitor.default.stop();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Stop image monitor
    try {
      const { imageMonitor } = await import('./services/image-monitor');
      imageMonitor.stop();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Stop job scheduler
    try {
      jobScheduler.stop();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Stop MQTT Jobs Subscriber
    try {
      const { getMqttJobsSubscriber } = await import('./services/mqtt-jobs-subscriber');
      const subscriber = getMqttJobsSubscriber();
      await subscriber.stop();
      logger.info('MQTT Jobs Subscriber stopped');
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Stop traffic flush service (final flush to database)
    try {
      await stopTrafficFlushService();
      logger.info('Traffic flush service stopped');
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    server.close(() => {
      logger.info('Server closed');
      clearTimeout(forceCloseTimeout);
      process.exit(0);
    });
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down gracefully...');
    
    // Set a timeout to force close if shutdown hangs
    const forceCloseTimeout = setTimeout(() => {
      logger.warn('Forcefully closing server after timeout');
      process.exit(1);
    }, 10000); // 10 second timeout
    
    // Shutdown WebSocket Server
    try {
      websocketManager.shutdown();
      logger.info('WebSocket Server stopped');
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Shutdown Metrics Batch Worker
    try {
      const { stopMetricsBatchWorker } = await import('./workers/metrics-batch-worker');
      await stopMetricsBatchWorker();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Shutdown Redis
    try {
      const { redisClient } = await import('./redis/client');
      await redisClient.disconnect();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Shutdown MQTT Monitor
    try {
      if (mqttMonitor) {
        await mqttMonitor.stop();
        logger.info('MQTT Monitor stopped');
      }
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Shutdown MQTT
    try {
      await shutdownMqtt();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Shutdown rotation schedulers
    try {
      shutdownSchedulers();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    
    // Shutdown housekeeper
    try {
      await housekeeper.shutdown();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Stop heartbeat monitor
    try {
      const heartbeatMonitor = await import('./services/heartbeat-monitor');
      heartbeatMonitor.default.stop();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Stop image monitor
    try {
      const { imageMonitor } = await import('./services/image-monitor');
      imageMonitor.stop();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Stop job scheduler
    try {
      jobScheduler.stop();
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Stop MQTT Jobs Subscriber
    try {
      const { getMqttJobsSubscriber } = await import('./services/mqtt-jobs-subscriber');
      const subscriber = getMqttJobsSubscriber();
      await subscriber.stop();
      logger.info('MQTT Jobs Subscriber stopped');
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    // Stop traffic flush service (final flush to database)
    try {
      await stopTrafficFlushService();
      logger.info('Traffic flush service stopped');
    } catch (error) {
      // Ignore errors during shutdown
    }
    
    server.close(() => {
      logger.info('Server closed');
      clearTimeout(forceCloseTimeout);
      process.exit(0);
    });
  });

  // Handle debugger disconnect/restart (VS Code specific)
  process.on('disconnect', async () => {
    logger.info('Debugger disconnected, shutting down...');
    
    // Set shorter timeout for debugger disconnect
    const forceCloseTimeout = setTimeout(() => {
      logger.warn('Forcefully closing server after debugger disconnect timeout');
      process.exit(1);
    }, 3000); // 3 second timeout for debugger disconnect
    
    server.close(() => {
      clearTimeout(forceCloseTimeout);
      process.exit(0);
    });
  });
}

async function retryMqttInitialization(intervalMs: number = 15000): Promise<void> {
  const { initializeMqtt } = await import('./mqtt');
  const interval = setInterval(async () => {
    try {
      await initializeMqtt();
      logger.info('MQTT reconnected successfully');
      clearInterval(interval);
    } catch (err: any) {
      logger.warn('MQTT still unavailable', { error: err?.message || err });
    }
  }, intervalMs);
}

startServer().catch((error) => {
  logger.error('Failed to start server', { error });
  process.exit(1);
});

export default app;
