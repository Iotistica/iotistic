/**
 * Default Target State Generator
 * 
 * Generates default device target state configuration based on license features.
 * This ensures every device gets proper configuration automatically during provisioning.
 * 
 * License Features → Agent Config Mapping (from billing service):
 * - plan (starter/professional/enterprise) → Different metrics intervals
 * - hasDedicatedPrometheus (billing feature) → enableMetricsExport: true
 * - hasAdvancedAlerts/hasCustomDashboards → enableAdvancedLogging: true (debug level)
 * 
 * Note: enableCloudJobs is always enabled since API access is required for the system to work.
 * 
 * Config Structure:
 * {
 *   "logging": {
 *     "level": "info" | "debug",
 *     "enableRemoteLogging": true
 *   },
 *   "features": {
 *     "enableShadow": true,
 *     "enableCloudJobs": true (always enabled),
 *     "enableMetricsExport": boolean (from hasDedicatedPrometheus)
 *   },
 *   "settings": {
 *     "metricsIntervalMs": number (plan-based: 60s/30s/10s),
 *     "deviceReportIntervalMs": number (plan-based),
 *     "stateReportIntervalMs": number (plan-based)
 *   }
 * }
 */

import logger from '../utils/logger';

interface LicenseData {
  plan: string; // "trial" | "starter" | "professional" | "enterprise"
  features: {
    // Monitoring & observability
    hasDedicatedPrometheus?: boolean;
    hasDedicatedGrafana?: boolean;
    prometheusRetentionDays?: number;
    prometheusStorageGb?: number;
    
    // Job execution capabilities (maps to enableCloudJobs)
    canExecuteJobs?: boolean;
    canScheduleJobs?: boolean;
    
    // Remote access & control
    canRemoteAccess?: boolean;
    canOtaUpdates?: boolean;
    
    // Advanced features (maps to enhanced logging)
    hasAdvancedAlerts?: boolean;
    hasCustomDashboards?: boolean;
    
    // Core device management
    maxDevices?: number;
  };
  limits?: {
    maxJobTemplates?: number;
    maxAlertRules?: number;
    maxUsers?: number;
  };
  trial?: {
    isTrialMode?: boolean;
    expiresAt?: string;
  };
  subscription: {
    status: string; // "active" | "past_due" | "canceled" | "trialing"
    currentPeriodEndsAt?: string;
  };
}

interface TargetStateConfig {
  logging: {
    level: string;
    enableRemoteLogging: boolean;
    enableFilePersistence: boolean;
  };
  features: {
    enableDeviceJobs: boolean;
    enableDeviceSensorPublish?: boolean;
    enableDeviceRemoteAccess: boolean;
  };
  settings: {
    metricsIntervalMs: number;
    deviceReportIntervalMs: number;
    stateReportIntervalMs: number;
    scheduledRestart: {
        enabled: boolean,
        intervalDays: number,
        reason: string
      }
  };
}

/**
 * Generate default target state config based on license features
 * 
 * @param licenseData - License data from system_config.license_data
 * @returns Target state configuration object
 */
export function generateDefaultTargetStateConfig(
  licenseData: LicenseData | null
): TargetStateConfig {
  // Default config for trial/basic plan
  const defaultConfig: TargetStateConfig = {
    logging: {
      level: 'info',
      enableRemoteLogging: true,
      enableFilePersistence: false,
    },
    features: {
      enableDeviceJobs: true, // Always enabled (API access required for system to work)
      enableDeviceSensorPublish:true,
      enableDeviceRemoteAccess: true,
    },
    settings: {
      metricsIntervalMs: 60000, // 1 minute (starter plan)
      deviceReportIntervalMs: 30000, // 30 seconds
      stateReportIntervalMs: 10000, // 10 seconds
       scheduledRestart: {
        enabled: true,
        intervalDays: 7,
        reason: "heap_fragmentation_cleanup"
      }
    },
  };

  // If no license data, return default
  if (!licenseData) {
    logger.warn('No license data found - using default config');
    return defaultConfig;
  }

  // Extract plan and features
  const plan = licenseData.plan?.toLowerCase() || 'starter';
  const features = licenseData.features || {};
  const subscriptionActive = licenseData.subscription?.status === 'active';

  logger.info(`Generating target state for plan: ${plan}, active: ${subscriptionActive}`);

  // Apply plan-based settings
  switch (plan) {
    case 'professional':
      defaultConfig.settings.metricsIntervalMs = 30000; // 30 seconds
      defaultConfig.settings.deviceReportIntervalMs = 20000; // 20 seconds
      defaultConfig.logging.level = 'info';
      break;

    case 'enterprise':
      defaultConfig.settings.metricsIntervalMs = 10000; // 10 seconds (fastest)
      defaultConfig.settings.deviceReportIntervalMs = 10000; // 10 seconds
      defaultConfig.logging.level = 'debug'; // Enhanced logging
      break;

    case 'starter':
    default:
      // Use default values (1 minute metrics)
      break;
  }


  if (features.hasAdvancedAlerts || features.hasCustomDashboards) {
    defaultConfig.logging.level = 'debug';
    logger.info('Enhanced logging (hasAdvancedAlerts/hasCustomDashboards)');
  }

  // If subscription not active (and not trialing), disable premium features
  if (!subscriptionActive && licenseData.trial?.isTrialMode !== true) {
    logger.warn('Subscription not active - disabling premium features');
    defaultConfig.settings.metricsIntervalMs = 300000; // 5 minutes (minimal)
  }

  return defaultConfig;
}

/**
 * Generate complete target state (apps + config) for new device
 * 
 * @param licenseData - License data from system_config
 * @returns Complete target state with empty apps and generated config
 */
export function generateDefaultTargetState(licenseData: LicenseData | null) {
  return {
    apps: {}, // No apps deployed by default
    config: generateDefaultTargetStateConfig(licenseData),
  };
}
