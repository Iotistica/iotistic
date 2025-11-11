/**
 * Device Agent
 *
 * Orchestrates all device-side operations:
 * - Container management
 * - Device provisioning
 * - System monitoring
 * - Device API server
 * - Logging
 */

import { StateReconciler } from "./orchestrator/state-reconciler.js";
import type { DeviceState } from "./orchestrator/state-reconciler.js";
import ContainerManager from "./compose/container-manager.js";
import { DeviceManager } from "./provisioning/index.js";
import type { DeviceInfo } from "./provisioning/types.js";
import { DeviceAPI } from "./device-api/index.js";
import { router as v1Router } from "./device-api/v1.js";
import { router as v2Router } from "./device-api/v2.js";
import * as deviceActions from "./device-api/actions.js";
import { ApiBinder } from "./sync-state.js";
import * as db from "./db.js";
import { LocalLogBackend } from "./logging/local-backend.js";
import { CloudLogBackend } from "./logging/cloud-backend.js";
import { ContainerLogMonitor } from "./logging/monitor.js";
import { AgentLogger } from "./logging/agent-logger.js";
import type { LogBackend } from "./logging/types.js";
import { JobsFeature } from "./features/jobs/src/jobs-feature.js";
import { SensorPublishFeature } from "./features/sensor-publish/index.js";
import { SensorConfigHandler } from "./features/sensor-publish/config-handler.js";
import { MqttManager } from "./mqtt/mqtt-manager.js";
import {
  SensorsFeature as SensorsFeature,
  SensorConfig,
} from "./features/sensors/index.js";
import { AgentFirewall } from "./security/firewall.js";
import { readFileSync } from "fs";
import { join } from "path";

// Read version from package.json
const getPackageVersion = (): string => {
  try {
    const packageJsonPath = join(process.cwd(), "package.json");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
    return packageJson.version || "unknown";
  } catch (error) {
    return "unknown";
  }
};

export default class DeviceAgent {
  private stateReconciler!: StateReconciler; // Main state manager
  private containerManager!: ContainerManager; // Keep for backward compatibility with DeviceAPI
  private deviceManager!: DeviceManager;
  private deviceInfo!: DeviceInfo; // Cache device info after initialization
  private deviceAPI!: DeviceAPI;
  private apiBinder?: ApiBinder;
  private logBackend!: LocalLogBackend;
  private logBackends: LogBackend[] = [];
  private logMonitor?: ContainerLogMonitor;
  private agentLogger!: AgentLogger; // Structured logging for agent-level events
  private firewall?: AgentFirewall; // Network firewall protection
  private jobs?: JobsFeature;
  private sensorPublish?: SensorPublishFeature;
  private sensors?: SensorsFeature;
  private sensorConfigHandler?: SensorConfigHandler;

  // Cached target state (updated when target state changes)
  private cachedTargetState: any = null;

  // System settings (config-driven with env var defaults)
  private reconciliationIntervalMs: number;

  private readonly DEVICE_API_PORT = parseInt(
    process.env.DEVICE_API_PORT || "48484",
    10
  );
  private readonly RECONCILIATION_INTERVAL = parseInt(
    process.env.RECONCILIATION_INTERVAL_MS || "30000",
    10
  );
  // Cloud API endpoint with fallback logic for network_mode: host
  // When using host networking, container names don't resolve - use localhost instead
  private readonly CLOUD_API_ENDPOINT =
    process.env.CLOUD_API_ENDPOINT || this.getDefaultCloudEndpoint();

  private getDefaultCloudEndpoint(): string {
    // If running in container with host networking, use localhost
    // If running in bridge network, use container name 'api'
    // Check if we're in Docker with host networking
    if (process.env.CLOUD_API_ENDPOINT) {
      return process.env.CLOUD_API_ENDPOINT;
    }
    // Default to localhost for host networking (most common edge device setup)
    return "http://localhost:3002";
  }

  constructor() {
    // Initialize with default from env var
    this.reconciliationIntervalMs = this.RECONCILIATION_INTERVAL;
  }

  public async init(): Promise<void> {

      // 1. Initialize logging FIRST (so all other components can use agentLogger)
      await this.initializeLogging();

      // 2. Initialize database
      await this.initializeDatabase();

      // 3. Initialize device provisioning
      await this.initializeDeviceManager();

      // 4. Initialize MQTT Manager (before any features that use MQTT)
      await this.initializeMqttManager();

      // 5. Initialize container manager
      await this.initializeContainerManager();

      // 6. Initialize device API
      await this.initializeDeviceAPI();

      const configFeatures = this.getConfigFeatures();
      const configSettings = this.getConfigSettings();
      const configLogging = this.getConfigLogging();

      const enableJobs = configFeatures.enableDeviceJobs ?? process.env.ENABLE_CLOUD_JOBS === "true";
      const enableSensorPublish = configFeatures.enableDeviceSensorPublish ??process.env.ENABLE_SENSOR_PUBLISH === "true";

      // Auto-enable protocol adapters if sensors are configured in target state
      const hasSensors = this.cachedTargetState?.config?.sensors &&Array.isArray(this.cachedTargetState.config.sensors) &&this.cachedTargetState.config.sensors.length > 0;

      // Get system settings from config (with defaults)
      const reconciliationIntervalMs = configSettings.reconciliationIntervalMs || this.RECONCILIATION_INTERVAL;

      // Get logging settings from config
      const logLevel = configLogging.level || "info";

      // Apply log level if configured
      if (
        this.agentLogger &&
        ["debug", "info", "warn", "error"].includes(logLevel)
      ) {
        this.agentLogger.setLogLevel(
          logLevel as "debug" | "info" | "warn" | "error"
        );
      }

      // Update instance variable with config value
      this.reconciliationIntervalMs = reconciliationIntervalMs;

      // 10. Initialize Jobs Feature (MQTT primary + HTTP fallback)
      if (enableJobs) {
        await this.initializeJobs(configSettings);
      }

      // 11. Initialize Sensor Publish Feature (if enabled by config)
      if (enableSensorPublish) {
        await this.initializeSensorPublish();
      }

      if (hasSensors) {
        // 12. Initialize Protocol Adapters Feature (if enabled by config)
        await this.initializeDeviceSensors(configFeatures);
      }

      // 13. Initialize API Binder (AFTER features are initialized so it can access sensor health)
      await this.initializeDeviceSync(configSettings);

      // 14. Initialize Sensor Config Handler (if Sensor Publish enabled)
      await this.initializeSensorConfigHandler();

      // 15. Initialize MQTT Update Listener (if MQTT enabled)
      await this.initializeMqttUpdateListener();

      // 16. Initialize Firewall (if enabled)
      await this.initializeFirewall(configSettings);

      // 17. Start auto-reconciliation
      this.startAutoReconciliation();

      //Final words
      const mode = this.deviceInfo.provisioned
        ? "Cloud-connected"
        : this.CLOUD_API_ENDPOINT
        ? "Standalone (not provisioned)"
        : "Standalone (no cloud endpoint)";

      this.agentLogger.infoSync("Device Agent initialized successfully", {
        component: "Agent",
        mode,
        deviceApiPort: this.DEVICE_API_PORT,
        reconciliationInterval: this.reconciliationIntervalMs,
        cloudApiEndpoint: this.CLOUD_API_ENDPOINT || "Not configured",
        cloudFeaturesEnabled: this.deviceInfo.provisioned && !!this.apiBinder,
      });

     
  }

  private async initializeLogging(): Promise<void> {
    // Local backend (always enabled)

    this.logBackend = new LocalLogBackend({
      maxLogs: parseInt(process.env.MAX_LOGS || "1000", 10),
      maxAge: parseInt(process.env.LOG_MAX_AGE || "3600000", 10), // 1 hour
      enableFilePersistence: process.env.LOG_FILE_PERSISTANCE === 'true', //TODO: should be coming from target state later
      logDir: process.env.LOG_DIR || "./data/logs",
      maxFileSize: parseInt(process.env.MAX_LOG_FILE_SIZE || "5242880", 10), // 5MB
    });
    await this.logBackend.initialize();
    this.logBackends.push(this.logBackend);

    // Create AgentLogger for structured agent-level logging

    this.agentLogger = new AgentLogger(this.logBackends);

    // We'll set device ID after device manager initialization
    this.agentLogger.infoSync("Agent logger initialized", {
      component: "Agent",
      backendCount: this.logBackends.length,
    });
  }

  private async initializeDatabase(): Promise<void> {
    await db.initialized();
    this.agentLogger.infoSync("Database initialized", { component: "Agent" });
  }

  private async initializeDeviceManager(): Promise<void> {
    this.deviceManager = new DeviceManager();
    await this.deviceManager.initialize();

    let deviceInfo = this.deviceManager.getDeviceInfo();

    // Auto-provision if not yet provisioned, cloud endpoint is set, AND provisioning key is available
    const provisioningApiKey = process.env.PROVISIONING_API_KEY;
    if (
      !deviceInfo.provisioned &&
      provisioningApiKey &&
      this.CLOUD_API_ENDPOINT
    ) {
      this.agentLogger.infoSync(
        "Auto-provisioning device with two-phase authentication",
        {
          component: "Agent",
        }
      );
      try {
        // Auto-detect system information if not provided via env vars
        const { getMacAddress, getOsVersion } = await import(
          "./system-metrics.js"
        );
        const macAddress = process.env.MAC_ADDRESS || (await getMacAddress());
        const osVersion = process.env.OS_VERSION || (await getOsVersion());

        this.agentLogger.infoSync("System information detected", {
          component: "Agent",
          macAddress: macAddress
            ? `${macAddress.substring(0, 8)}...`
            : "unknown",
          osVersion: osVersion || "unknown",
        });

        await this.deviceManager.provision({
          provisioningApiKey, // Required for two-phase auth
          deviceName:
            process.env.DEVICE_NAME || `device-${deviceInfo.uuid.slice(0, 8)}`,
          deviceType: process.env.DEVICE_TYPE || "standalone",
          apiEndpoint: this.CLOUD_API_ENDPOINT,
          applicationId: process.env.APPLICATION_ID
            ? parseInt(process.env.APPLICATION_ID, 10)
            : undefined,
          macAddress,
          osVersion,
          agentVersion: process.env.AGENT_VERSION || getPackageVersion(),
        });
        deviceInfo = this.deviceManager.getDeviceInfo();
        this.agentLogger.infoSync("Device auto-provisioned successfully", {
          component: "Agent",
        });
      } catch (error: any) {
        this.agentLogger.errorSync(
          "Auto-provisioning failed",
          error instanceof Error ? error : new Error(error.message),
          {
            component: "Agent",
            note: "Device will remain unprovisioned. Set PROVISIONING_API_KEY to retry.",
          }
        );

        // Optional: Fail-fast if REQUIRE_PROVISIONING is set
        if (process.env.REQUIRE_PROVISIONING === "true") {
          this.agentLogger.errorSync(
            "REQUIRE_PROVISIONING enabled - exiting due to provisioning failure",
            undefined,
            {
              component: "Agent",
            }
          );
          process.exit(1);
        }
      }
    } else if (
      !deviceInfo.provisioned &&
      this.CLOUD_API_ENDPOINT &&
      !provisioningApiKey
    ) {
      this.agentLogger.warnSync("Device not provisioned", {
        component: "Agent",
        note: "Set PROVISIONING_API_KEY environment variable to enable auto-provisioning",
      });

      // Optional: Fail-fast if REQUIRE_PROVISIONING is set
      if (process.env.REQUIRE_PROVISIONING === "true") {
        this.agentLogger.errorSync(
          "REQUIRE_PROVISIONING enabled - exiting due to missing provisioning",
          undefined,
          {
            component: "Agent",
          }
        );
        process.exit(1);
      }
    } else if (!deviceInfo.provisioned && !this.CLOUD_API_ENDPOINT) {
      // Local mode - device never provisioned and no cloud endpoint
      this.agentLogger.infoSync("Running in local mode (no cloud connection)", {
        component: "Agent",
      });
      await this.deviceManager.markAsLocalMode();
      deviceInfo = this.deviceManager.getDeviceInfo();
    } else if (deviceInfo.provisioned && !this.CLOUD_API_ENDPOINT) {
      // Device was previously provisioned but now running in local mode
      this.agentLogger.infoSync("Switching to local mode (no cloud connection)", {
        component: "Agent",
        note: "Device was previously provisioned but CLOUD_API_ENDPOINT is not set",
      });
      await this.deviceManager.markAsLocalMode();
      deviceInfo = this.deviceManager.getDeviceInfo();
    }

    // Cache device info for reuse across all methods
    this.deviceInfo = deviceInfo;
    
    // Always update agent version on startup (in case of upgrades)
    const currentVersion = process.env.AGENT_VERSION || getPackageVersion();
    if (this.deviceInfo.agentVersion !== currentVersion) {
      this.agentLogger.infoSync("Updating agent version", {
        component: "Agent",
        oldVersion: this.deviceInfo.agentVersion || "unknown",
        newVersion: currentVersion,
      });
      await this.deviceManager.updateAgentVersion(currentVersion);
      this.deviceInfo = this.deviceManager.getDeviceInfo();
    }
    
    // Now set the device ID on the logger
    this.agentLogger.setDeviceId(this.deviceInfo.uuid);

    this.agentLogger.infoSync("Device manager initialized", {
      component: "Agent",
      uuid: this.deviceInfo.uuid,
      name: this.deviceInfo.deviceName || "Not set",
      provisioned: this.deviceInfo.provisioned,
      hasApiKey: !!this.deviceInfo.deviceApiKey,
      agentVersion: this.deviceInfo.agentVersion,
    });
  }

  private async initializeMqttManager(): Promise<void> {
    this.agentLogger.infoSync("Initializing MQTT Manager", {
      component: "Agent",
    });

    try {
      // Use MQTT credentials from provisioning if available, otherwise fall back to env vars
      const mqttBrokerUrl =
        this.deviceInfo.mqttBrokerUrl || process.env.MQTT_BROKER;
      const mqttUsername =
        this.deviceInfo.mqttUsername || process.env.MQTT_USERNAME;
      const mqttPassword =
        this.deviceInfo.mqttPassword || process.env.MQTT_PASSWORD;

      // Debug: Log broker URL being used
      this.agentLogger.debugSync(`MQTT Broker URL: ${mqttBrokerUrl}`, {
        component: "Agent",
        source: this.deviceInfo.mqttBrokerUrl ? "provisioning" : "environment",
        hasUsername: !!mqttUsername,
      });

      if (!mqttBrokerUrl) {
        this.agentLogger.debugSync("MQTT disabled - no broker URL provided", {
          component: "Agent",
          note: "Provision device or set MQTT_BROKER env var to enable",
        });
        return;
      }

      const mqttManager = MqttManager.getInstance();

      // Connect to MQTT broker with provisioned credentials
      await mqttManager.connect(mqttBrokerUrl, {
        clientId: `device_${this.deviceInfo.uuid}`,
        clean: true,
        reconnectPeriod: 5000,
        username: mqttUsername,
        password: mqttPassword,
      });

      // Enable debug mode if requested
      if (process.env.MQTT_DEBUG === "true") {
        mqttManager.setDebug(true);
      }

      // Add MQTT backend to logging
      const enableCloudLogging = process.env.ENABLE_CLOUD_LOGGING !== "false";

      // Add Cloud backend if configured AND device is provisioned
      if (
        this.CLOUD_API_ENDPOINT &&
        enableCloudLogging &&
        this.deviceInfo.provisioned &&
        this.deviceInfo.deviceApiKey
      ) {
        try {
          const cloudLogBackend = new CloudLogBackend(
            {
              cloudEndpoint: this.CLOUD_API_ENDPOINT,
              deviceUuid: this.deviceInfo.uuid,
              deviceApiKey: this.deviceInfo.apiKey,
              compression: process.env.LOG_COMPRESSION !== "false",
            },
            this.agentLogger
          );
          await cloudLogBackend.initialize();
          this.logBackends.push(cloudLogBackend);

          // Update agentLogger with new backend
          (this.agentLogger as any).logBackends = this.logBackends;

          this.agentLogger.infoSync("Cloud log backend initialized", {
            component: "Agent",
            cloudEndpoint: this.CLOUD_API_ENDPOINT,
          });
        } catch (error) {
          this.agentLogger.errorSync(
            "Failed to initialize cloud log backend. Continuing without cloud logging",
            error instanceof Error ? error : new Error(String(error)),
            {
              component: "Agent",
            }
          );
        }
      } else if (
        this.CLOUD_API_ENDPOINT &&
        enableCloudLogging &&
        !this.deviceInfo.provisioned
      ) {
        this.agentLogger.warnSync(
          "Cloud logging disabled - device not provisioned",
          {
            component: "Agent",
            note: "Device must be provisioned before enabling cloud log streaming",
          }
        );
      }
      this.agentLogger.infoSync("MQTT Manager connected", {
        component: "Agent",
        brokerUrl: mqttBrokerUrl,
        clientId: `device_${this.deviceInfo.uuid}`,
        username: mqttUsername || "(none)",
        credentialsSource: this.deviceInfo.mqttUsername
          ? "provisioning"
          : "environment",
        debugMode: process.env.MQTT_DEBUG === "true",
        totalLogBackends: this.logBackends.length,
      });
    } catch (error) {
      this.agentLogger.errorSync(
        "Failed to initialize MQTT Manager",
        error instanceof Error ? error : new Error(String(error)),
        {
          component: "Agent",
          note: "MQTT features will be unavailable",
        }
      );
      // Don't throw - allow agent to continue without MQTT
    }
  }

  private async initializeContainerManager(): Promise<void> {
    this.agentLogger?.infoSync("Initializing state reconciler", {
      component: "Agent",
    });

    // Create StateReconciler (manages both containers and config)
    this.stateReconciler = new StateReconciler(this.agentLogger);
    await this.stateReconciler.init();

    // For backward compatibility, keep ContainerManager reference for DeviceAPI
    this.containerManager = this.stateReconciler.getContainerManager();

    // Set up log monitor for Docker containers
    const docker = this.containerManager.getDocker();
    if (docker) {
      // Use all configured log backends
      this.logMonitor = new ContainerLogMonitor(docker, this.logBackends);
      this.containerManager.setLogMonitor(this.logMonitor);
      await this.containerManager.attachLogsToAllContainers();
      this.agentLogger?.infoSync("Log monitor attached to container manager", {
        component: "Agent",
        backendCount: this.logBackends.length,
      });
    }

    // Watch for target state changes to update cache
    // Note: Config handling is now done by ConfigManager inside StateReconciler
    this.stateReconciler.on("target-state-changed", (newState: DeviceState) => {
      // Update cached target state
      this.updateCachedTargetState();

      // Config is now handled by ConfigManager automatically
      // No need for handleConfigUpdate here
    });

    // Initialize cache with current target state
    this.updateCachedTargetState();

    this.agentLogger?.infoSync("State reconciler initialized", {
      component: "Agent",
    });
  }

  private async initializeDeviceAPI(): Promise<void> {
    this.agentLogger?.infoSync("Initializing device API", {
      component: "Agent",
    });

    // Initialize device actions with managers
    deviceActions.initialize(this.containerManager, this.deviceManager);

    // Health checks
    const healthchecks = [
      async () => {
        try {
          this.containerManager.getStatus();
          return true;
        } catch {
          return false;
        }
      },
    ];

    // Create device API with routers
    this.deviceAPI = new DeviceAPI({
      routers: [v1Router, v2Router],
      healthchecks,
    });

    // Start listening
    await this.deviceAPI.listen(this.DEVICE_API_PORT);
    this.agentLogger?.infoSync("Device API started", {
      component: "Agent",
      port: this.DEVICE_API_PORT,
    });
  }

  private async initializeDeviceSync(
    configSettings: Record<string, any>
  ): Promise<void> {
    if (!this.CLOUD_API_ENDPOINT) {
      this.agentLogger?.warnSync(
        "Cloud API endpoint not configured - running in standalone mode",
        {
          component: "Agent",
          note: "Set CLOUD_API_ENDPOINT env var to enable cloud features",
        }
      );
      return;
    }

    // Check if device is provisioned before enabling cloud sync
    if (!this.deviceInfo.provisioned || !this.deviceInfo.deviceApiKey) {
      this.agentLogger?.warnSync(
        "Device not provisioned - cloud sync disabled",
        {
          component: "Agent",
          note: "Device must be provisioned with valid API key before enabling cloud features",
          provisioned: this.deviceInfo.provisioned,
          hasApiKey: !!this.deviceInfo.deviceApiKey,
        }
      );
      return;
    }

    this.agentLogger?.infoSync("Initializing API Binder", {
      component: "Agent",
      cloudApiEndpoint: this.CLOUD_API_ENDPOINT,
    });

    // Get intervals from config (passed as parameter during init)
    const targetStatePollIntervalMs =
      configSettings.targetStatePollIntervalMs ||
      parseInt(process.env.POLL_INTERVAL_MS || "60000", 10);
    const deviceReportIntervalMs =
      configSettings.deviceReportIntervalMs ||
      parseInt(process.env.REPORT_INTERVAL_MS || "60000", 10);
    const metricsIntervalMs =
      configSettings.metricsIntervalMs ||
      parseInt(process.env.METRICS_INTERVAL_MS || "300000", 10);

    this.apiBinder = new ApiBinder(
      this.stateReconciler, // Use StateReconciler instead of ContainerManager
      this.deviceManager,
      {
        cloudApiEndpoint: this.CLOUD_API_ENDPOINT,
        pollInterval: targetStatePollIntervalMs, // Use config value or default 60s
        reportInterval: deviceReportIntervalMs, // Use config value or default 60s
        metricsInterval: metricsIntervalMs, // Use config value or default 5min
      },
      this.agentLogger, // Pass the agent logger
      this.sensorPublish, // Pass sensor-publish for health reporting
      this.sensors, // Pass protocol-adapters for health reporting
      MqttManager.getInstance() // Pass MQTT manager singleton for state reporting (optional)
    );

    // Reinitialize device actions with apiBinder for connection health endpoint
    deviceActions.initialize(
      this.containerManager,
      this.deviceManager,
      this.apiBinder
    );

    // Config updates are now handled automatically by ConfigManager
    // No need to listen for target-state-changed here

    // Start polling for target state
    await this.apiBinder.startPoll();

    // Start reporting current state
    await this.apiBinder.startReporting();
  }

  private async initializeJobs(
    configSettings: Record<string, any>
  ): Promise<void> {
    try {
      // Get cloud API URL from environment
      const cloudApiUrl = process.env.CLOUD_API_URL || this.CLOUD_API_ENDPOINT;

      // Get polling interval from config (passed as parameter during init)
      const pollingIntervalMs =
        configSettings.cloudJobsPollingIntervalMs ||
        parseInt(process.env.CLOUD_JOBS_POLLING_INTERVAL || "30000", 10);

      // Create and start Jobs Feature
      this.jobs = new JobsFeature(
        {
          enabled: true,
          cloudApiUrl,
          deviceApiKey: this.deviceInfo.apiKey,
          pollingIntervalMs,
          maxRetries: 3,
          handlerDirectory:
            process.env.JOB_HANDLER_DIR || "/app/data/job-handlers",
          maxConcurrentJobs: 1,
          defaultHandlerTimeout: 60000,
        },
        this.agentLogger,
        this.deviceInfo.uuid
      );

      await this.jobs.start();

      this.agentLogger?.infoSync("Jobs Feature initialized", {
        component: "Agent",
        mode: this.jobs.getCurrentMode(),
        mqttActive: this.jobs.isMqttActive(),
        httpActive: this.jobs.isHttpActive(),
      });
    } catch (error) {
      this.agentLogger?.errorSync(
        "Failed to initialize Jobs Feature",
        error instanceof Error ? error : new Error(String(error)),
        {
          component: "Agent",
          note: "Continuing without Jobs",
        }
      );
      this.jobs = undefined;
    }
  }

  private async initializeSensorPublish(): Promise<void> {
    this.agentLogger?.infoSync("Initializing Sensor Publish Feature", {
      component: "Agent",
    });

    try {
      // Parse sensor configuration from environment (fallback)
      let envSensors: any[] = [];
      const sensorConfigStr = process.env.SENSOR_PUBLISH_CONFIG;
      if (sensorConfigStr) {
        try {
          const envConfig = JSON.parse(sensorConfigStr);
          envSensors = envConfig.sensors || [];
          this.agentLogger?.debugSync(
            "Loaded sensor config from environment variable",
            {
              component: "Agent",
              sensorCount: envSensors.length,
            }
          );
        } catch (error) {
          this.agentLogger?.errorSync(
            "Failed to parse SENSOR_PUBLISH_CONFIG",
            error instanceof Error ? error : new Error(String(error)),
            {
              component: "Agent",
            }
          );
        }
      }

      // Get sensor configuration from target state (takes precedence)
      let targetStateSensors: any[] = [];
      try {
        const targetState = this.containerManager?.getTargetState();
        if (
          targetState?.config?.sensors &&
          Array.isArray(targetState.config.sensors)
        ) {
          targetStateSensors = targetState.config.sensors;
          this.agentLogger?.debugSync(
            "Loaded sensor config from target state",
            {
              component: "Agent",
              sensorCount: targetStateSensors.length,
            }
          );
        }
      } catch (error) {
        this.agentLogger?.debugSync(
          "Could not load sensors from target state",
          {
            component: "Agent",
            error: error instanceof Error ? error.message : String(error),
          }
        );
      }

      // Merge configurations: env sensors as base, target state sensors override/add
      const mergedSensors = [...envSensors];
      for (const targetSensor of targetStateSensors) {
        const existingIndex = mergedSensors.findIndex(
          (s: any) => s.name === targetSensor.name
        );
        if (existingIndex >= 0) {
          // Override existing sensor from env with target state config
          mergedSensors[existingIndex] = targetSensor;
        } else {
          // Add new sensor from target state
          mergedSensors.push(targetSensor);
        }
      }

      // If no sensors configured at all, log warning and skip initialization
      if (mergedSensors.length === 0) {
        this.agentLogger?.warnSync("No sensor configurations found", {
          component: "Agent",
          note: "Add sensors via dashboard or set SENSOR_PUBLISH_CONFIG environment variable",
        });
        return;
      }

      // Build final configuration
      const sensorConfig = {
        enabled: true,
        sensors: mergedSensors,
      };

      // Create and start sensor publish feature
      this.sensorPublish = new SensorPublishFeature(
        sensorConfig as any,
        this.agentLogger!,
        this.deviceInfo.uuid
      );

      await this.sensorPublish.start();

      this.agentLogger?.infoSync("Sensor Publish Feature initialized", {
        component: "Agent",
        sensorsConfigured: mergedSensors.length,
        fromEnv: envSensors.length,
        fromTargetState: targetStateSensors.length,
        mqttTopicPattern: "iot/device/{deviceUuid}/sensor/{topic}",
      });
    } catch (error) {
      this.agentLogger?.errorSync(
        "Failed to initialize Sensor Publish",
        error instanceof Error ? error : new Error(String(error)),
        {
          component: "Agent",
          note: "Continuing without Sensor Publish",
        }
      );
      this.sensorPublish = undefined;
    }
  }

  private async initializeDeviceSensors(
    configFeatures: Record<string, any>
  ): Promise<void> {
    try {
      // Get protocol adapters configuration (passed as parameter during init)
      const sensorsConfig: SensorConfig = {
        enabled: true,
        ...configFeatures.protocolAdapters,
      };

      // Check environment variable for config override
      const envConfigStr = process.env.PROTOCOL_ADAPTERS_CONFIG;
      if (envConfigStr) {
        try {
          const envConfig = JSON.parse(envConfigStr);
          Object.assign(sensorsConfig, envConfig);
          this.agentLogger?.debugSync(
            "Loaded protocol adapters config from PROTOCOL_ADAPTERS_CONFIG",
            {
              component: "Agent",
            }
          );
        } catch (error) {
          this.agentLogger?.warnSync(
            "Failed to parse PROTOCOL_ADAPTERS_CONFIG, using target state config",
            {
              component: "Agent",
            }
          );
        }
      }

      // Create and start protocol adapters feature using BaseFeature pattern
      this.sensors = new SensorsFeature(
        sensorsConfig,
        this.agentLogger,
        this.deviceInfo.uuid
      );
      await this.sensors.start();
    } catch (error) {
      this.agentLogger?.errorSync(
        "Failed to initialize Protocol Adapters",
        error instanceof Error ? error : new Error(String(error)),
        {
          component: "Agent",
          note: "Continuing without Protocol Adapters",
        }
      );
      this.sensors = undefined;
    }
  }

  private async initializeSensorConfigHandler(): Promise<void> {
    // Only initialize if Sensor Publish is enabled
    if (!this.sensorPublish) {
      return;
    }

    this.agentLogger?.infoSync("Initializing Sensor Config Handler", {
      component: "Agent",
    });

    try {
      // Create sensor config handler
      this.sensorConfigHandler = new SensorConfigHandler(this.sensorPublish);

      // Start listening for delta events
      this.sensorConfigHandler.start();

      // Report initial sensor state
      try {
        const sensors = this.sensorPublish.getSensors();
        const sensorStates: Record<string, any> = {};

        // Add sensor-publish sensors
        sensors.forEach((sensor) => {
          sensorStates[sensor.name] = {
            enabled: sensor.enabled,
            addr: sensor.addr,
            publishInterval: sensor.publishInterval,
          };
        });

        // Add protocol adapter device statuses (modbus, can, opcua, etc.)
        if (this.sensors) {
          const allDeviceStatuses = this.sensors.getAllDeviceStatuses();

          // Iterate through each protocol type (modbus, can, opcua, etc.)
          allDeviceStatuses.forEach((devices, protocolType) => {
            devices.forEach((device) => {
              // Create unique key: {protocol}-{deviceName}
              const sensorKey = `${protocolType}-${device.deviceName}`;
              sensorStates[sensorKey] = {
                type: protocolType,
                deviceName: device.deviceName,
                connected: device.connected,
                lastPoll: device.lastPoll?.toISOString() || null,
                errorCount: device.errorCount,
                lastError: device.lastError,
              };
            });
          });
        }
      } catch (error) {
        this.agentLogger?.errorSync(
          "Failed to report initial sensor state",
          error instanceof Error ? error : new Error(String(error)),
          {
            component: "Agent",
          }
        );
      }
    } catch (error) {
      this.agentLogger?.errorSync(
        "Failed to initialize Sensor Config Handler",
        error instanceof Error ? error : new Error(String(error)),
        {
          component: "Agent",
          note: "Continuing without remote sensor configuration",
        }
      );
      this.sensorConfigHandler = undefined;
    }
  }

  private async initializeMqttUpdateListener(): Promise<void> {
    const mqttManager = MqttManager.getInstance();
    
    if (!mqttManager.isConnected()) {
      this.agentLogger?.debugSync("MQTT not connected - skipping update listener", {
        component: "Agent",
        note: "Update listener will not be available"
      });
      return;
    }

    const updateTopic = `agent/${this.deviceInfo.uuid}/update`;
    const statusTopic = `agent/${this.deviceInfo.uuid}/status`;
    
    try {
      // Subscribe to update commands with message handler
      await mqttManager.subscribe(updateTopic, undefined, async (topic: string, message: Buffer) => {
        try {
          const command = JSON.parse(message.toString());
          
          if (command.action === 'update') {
            const { version, scheduled_time, force } = command;
            
            this.agentLogger?.infoSync("Agent update command received", {
              component: "Agent",
              version,
              scheduled_time,
              force: !!force
            });

            // Report update command received
            await mqttManager.publish(statusTopic, JSON.stringify({
              type: 'update_command_received',
              version,
              timestamp: Date.now()
            }));

            // If scheduled, wait until that time
            if (scheduled_time) {
              const scheduledDate = new Date(scheduled_time);
              const delay = scheduledDate.getTime() - Date.now();
              
              if (delay > 0) {
                this.agentLogger?.infoSync("Update scheduled for later", {
                  component: "Agent",
                  scheduled_time,
                  delay_ms: delay,
                  delay_hours: Math.round(delay / 3600000)
                });
                
                await mqttManager.publish(statusTopic, JSON.stringify({
                  type: 'update_scheduled',
                  version,
                  scheduled_time,
                  timestamp: Date.now()
                }));
                
                setTimeout(() => this.performUpdate(version, force), delay);
                return;
              }
            }

            // Execute immediately
            await this.performUpdate(version, force);
          }
        } catch (error) {
          this.agentLogger?.errorSync(
            "Failed to process update command",
            error instanceof Error ? error : new Error(String(error)),
            {
              component: "Agent",
              topic
            }
          );
        }
      });
      
      this.agentLogger?.infoSync("MQTT update listener initialized", {
        component: "Agent",
        updateTopic,
        statusTopic
      });
      
    } catch (error) {
      this.agentLogger?.errorSync(
        "Failed to initialize MQTT update listener",
        error instanceof Error ? error : new Error(String(error)),
        {
          component: "Agent"
        }
      );
    }
  }

  private async performUpdate(version: string, force: boolean = false): Promise<void> {
    const { existsSync } = await import('fs');
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    // Detect deployment type
    const deploymentType = process.env.DEPLOYMENT_TYPE || 
      (existsSync('/.dockerenv') ? 'docker' : 'systemd');
    
    const currentVersion = process.env.AGENT_VERSION || getPackageVersion();
    
    this.agentLogger?.infoSync("Starting agent self-update", {
      component: "Agent",
      currentVersion,
      targetVersion: version,
      deploymentType,
      force
    });

    // Report update started
    const mqttManager = MqttManager.getInstance();
    const statusTopic = `agent/${this.deviceInfo.uuid}/status`;
    
    try {
      await mqttManager.publish(statusTopic, JSON.stringify({
        type: 'update_started',
        current_version: currentVersion,
        target_version: version,
        deployment_type: deploymentType,
        timestamp: Date.now()
      }));
    } catch (error) {
      this.agentLogger?.warnSync("Failed to publish update started status", {
        component: "Agent",
        error: error instanceof Error ? error.message : String(error)
      });
    }

    // Determine update script path
    const updateScript = deploymentType === 'docker'
      ? '/app/bin/update-agent-docker.sh'
      : '/usr/local/bin/update-agent-systemd.sh';
    
    // Check if update script exists
    if (!existsSync(updateScript)) {
      this.agentLogger?.errorSync(
        "Update script not found",
        new Error(`Script not found: ${updateScript}`),
        {
          component: "Agent",
          updateScript,
          deploymentType
        }
      );
      
      await mqttManager.publish(statusTopic, JSON.stringify({
        type: 'update_failed',
        reason: 'update_script_not_found',
        script_path: updateScript,
        timestamp: Date.now()
      }));
      
      return;
    }

    this.agentLogger?.infoSync("Executing update script", {
      component: "Agent",
      script: updateScript,
      version,
      note: "Agent will restart shortly"
    });

    // Execute update script in background (agent will restart)
    // Pass version and force flag as arguments
    const forceFlag = force ? 'true' : 'false';
    const command = `${updateScript} ${version} ${forceFlag} > /tmp/agent-update.log 2>&1 &`;
    
    try {
      execAsync(command);
      
      this.agentLogger?.infoSync("Update script executed", {
        component: "Agent",
        note: "Agent will restart to complete update"
      });
      
    } catch (error) {
      this.agentLogger?.errorSync(
        "Failed to execute update script",
        error instanceof Error ? error : new Error(String(error)),
        {
          component: "Agent",
          script: updateScript
        }
      );
      
      await mqttManager.publish(statusTopic, JSON.stringify({
        type: 'update_failed',
        reason: 'script_execution_failed',
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      }));
    }
  }

  /**
   * Initialize network firewall protection
   * Protects Device API and MQTT from unauthorized access
   */
  private async initializeFirewall(
    configSettings: Record<string, any>
  ): Promise<void> {
    // Get firewall configuration from config or environment
    const firewallMode = 
      configSettings.firewallMode || 
      process.env.FIREWALL_MODE || 
      'auto';
    
    // Check if firewall is enabled
    if (firewallMode === 'disabled' || process.env.FIREWALL_ENABLED === 'false') {
      this.agentLogger?.infoSync('Firewall disabled by configuration', {
        component: 'Agent',
      });
      return;
    }

    // Determine MQTT port (if Mosquitto is running locally)
    const mqttPort = process.env.MQTT_LOCAL_PORT 
      ? parseInt(process.env.MQTT_LOCAL_PORT) 
      : undefined;

    this.agentLogger?.infoSync('Initializing firewall', {
      component: 'Agent',
      mode: firewallMode,
      deviceApiPort: this.DEVICE_API_PORT,
      mqttPort: mqttPort || 'not configured',
    });

    try {
      this.firewall = new AgentFirewall(
        {
          enabled: true,
          mode: firewallMode as 'on' | 'off' | 'auto',
          deviceApiPort: this.DEVICE_API_PORT,
          mqttPort,
        },
        this.agentLogger
      );

      await this.firewall.initialize();
    } catch (error) {
      this.agentLogger?.errorSync(
        'Failed to initialize firewall',
        error instanceof Error ? error : new Error(String(error)),
        {
          component: 'Agent',
          note: 'Agent will continue without firewall protection',
        }
      );
      this.firewall = undefined;
    }
  }

  private startAutoReconciliation(): void {
    this.containerManager.startAutoReconciliation(
      this.reconciliationIntervalMs
    );
    this.agentLogger?.infoSync("Auto-reconciliation started", {
      component: "Agent",
      intervalMs: this.reconciliationIntervalMs,
    });
  }


  public async stop(): Promise<void> {
    this.agentLogger?.infoSync("Stopping Device Agent", { component: "Agent" });

    try {
      // Stop Sensor Publish
      if (this.sensorPublish) {
        await this.sensorPublish.stop();
        this.agentLogger?.infoSync("Sensor Publish stopped", {
          component: "Agent",
        });
      }

      // Stop Protocol Adapters
      if (this.sensors) {
        await this.sensors.stop();
        this.agentLogger?.infoSync("Protocol Adapters stopped", {
          component: "Agent",
        });
      }

      // Stop Sensor Config Handler
      if (this.sensorConfigHandler) {
        // No explicit stop method, just clear reference
        this.agentLogger?.infoSync("Sensor Config Handler cleanup", {
          component: "Agent",
        });
      }

      // Stop Jobs Feature (handles both MQTT and HTTP)
      if (this.jobs) {
        await this.jobs.stop();
        this.agentLogger?.infoSync("Jobs Feature stopped", {
          component: "Agent",
        });
      } 
     
      // Stop API binder
      if (this.apiBinder) {
        await this.apiBinder.stop();
        this.agentLogger?.infoSync("API Binder stopped", {
          component: "Agent",
        });
      }

      // Stop firewall
      if (this.firewall) {
        await this.firewall.stop();
        this.agentLogger?.infoSync("Firewall stopped", {
          component: "Agent",
        });
      }

      // Stop log backends (flush buffers, clear timers)
      this.agentLogger?.infoSync("Stopping log backends", {
        component: "Agent",
      });
      for (const backend of this.logBackends) {
        try {
          if (
            "disconnect" in backend &&
            typeof backend.disconnect === "function"
          ) {
            await backend.disconnect();
          } else if ("stop" in backend && typeof backend.stop === "function") {
            await (backend as any).stop();
          }
        } catch (error) {
          this.agentLogger?.warnSync("Error stopping log backend", {
            component: "Agent",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
      this.agentLogger?.infoSync("Log backends stopped", {
        component: "Agent",
      });

      // Stop MQTT Manager (shared singleton - do this after all MQTT-dependent features)
      const mqttManager = MqttManager.getInstance();
      if (mqttManager.isConnected()) {
        await mqttManager.disconnect();
        this.agentLogger?.infoSync("MQTT Manager disconnected", {
          component: "Agent",
        });
      }

      // Stop device API
      if (this.deviceAPI) {
        await this.deviceAPI.stop();
        this.agentLogger?.infoSync("Device API stopped", {
          component: "Agent",
        });
      }

      // Stop container manager
      if (this.containerManager) {
        this.containerManager.stopAutoReconciliation();
        this.agentLogger?.infoSync("Container manager stopped", {
          component: "Agent",
        });
      }

      this.agentLogger?.infoSync("Device Agent stopped successfully", {
        component: "Agent",
      });
    } catch (error) {
      this.agentLogger?.errorSync(
        "Error stopping Device Agent",
        error instanceof Error ? error : new Error(String(error)),
        {
          component: "Agent",
        }
      );
      throw error;
    }
  }

  
  private updateCachedTargetState(): void {
    this.cachedTargetState = this.stateReconciler.getTargetState();
  }

  private getConfigFeatures(): Record<string, any> {
    return this.cachedTargetState?.config?.features || {};
  }


  private getConfigSettings(): Record<string, any> {
    return this.cachedTargetState?.config?.settings || {};
  }

  private getConfigLogging(): Record<string, any> {
    return this.cachedTargetState?.config?.logging || {};
  }

  // Getters for external access (if needed)
  public getContainerManager(): ContainerManager {
    return this.containerManager;
  }

  public getDeviceManager(): DeviceManager {
    return this.deviceManager;
  }

  public getDeviceAPI(): DeviceAPI {
    return this.deviceAPI;
  }

  public getJobEngine() {
    return this.jobs?.getJobEngine();
  }
}
