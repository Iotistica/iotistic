/**
 * ANOMALY DETECTION SERVICE - MAIN ORCHESTRATOR
 * ===============================================
 * 
 * Edge-appropriate anomaly detection for sensor data and system metrics
 */

import { randomUUID } from 'crypto';
import type { AgentLogger } from '../logging/agent-logger';
import { LogComponents } from '../logging/types';
import type {
	DataPoint,
	AnomalyConfig,
	AnomalyAlert,
	MetricConfig,
	StatisticalBuffer,
	DetectionMethod,
	AnomalySeverity,
} from './types';
import { createBuffer, addValue, getRecentValues, getTrend } from './buffer';
import { getDetector } from './detectors';
import { AlertManager } from './alert-manager';

export class AnomalyDetectionService {
	private config: AnomalyConfig;
	private buffers = new Map<string, StatisticalBuffer>();
	private alertManager: AlertManager;
	private logger?: AgentLogger;
	private enabled: boolean = false;
	
	constructor(config: AnomalyConfig, logger?: AgentLogger) {
		this.config = config;
		this.logger = logger;
		this.enabled = config.enabled;
		
		this.alertManager = new AlertManager(
			config.alerts.maxQueueSize,
			config.alerts.cooldownMs
		);
		
		// Initialize buffers for configured metrics
		for (const metricConfig of config.metrics) {
			if (metricConfig.enabled) {
				const buffer = createBuffer(metricConfig.windowSize);
				this.buffers.set(metricConfig.name, buffer);
			}
		}
		
		this.logger?.infoSync('Anomaly detection service initialized', {
			component: LogComponents.metrics,
			enabled: this.enabled,
			metricsCount: config.metrics.filter(m => m.enabled).length,
			methods: this.getUniqueDetectionMethods(),
		});
	}
	
	/**
	 * Process a new data point
	 */
	processDataPoint(dataPoint: DataPoint): void {
		if (!this.enabled) return;
		
		// Skip BAD quality data
		if (dataPoint.quality === 'BAD') {
			this.logger?.debugSync('Skipping BAD quality data point', {
				component: LogComponents.metrics,
				metric: dataPoint.metric,
			});
			return;
		}
		
		const metricConfig = this.getMetricConfig(dataPoint.metric);
		if (!metricConfig || !metricConfig.enabled) {
			return; // Metric not configured for anomaly detection
		}
		
		// Get or create buffer
		let buffer = this.buffers.get(dataPoint.metric);
		if (!buffer) {
			buffer = createBuffer(metricConfig.windowSize);
			this.buffers.set(dataPoint.metric, buffer);
		}
		
		// Add value to buffer
		addValue(buffer, dataPoint.value, dataPoint.timestamp);
		
		// Run detection if buffer has enough samples
		if (buffer.size >= 10) {
			this.runDetection(dataPoint, buffer, metricConfig);
		}
	}
	
	/**
	 * Run all configured detection methods on a data point
	 */
	private runDetection(
		dataPoint: DataPoint,
		buffer: StatisticalBuffer,
		metricConfig: MetricConfig
	): void {
		const results: AnomalyAlert[] = [];
		
		// Run each configured detection method
		for (const method of metricConfig.methods) {
			const detector = getDetector(method);
			if (!detector) {
				this.logger?.warnSync(`Unknown detection method: ${method}`, {
					component: LogComponents.metrics,
				});
				continue;
			}
			
			const result = detector.detect(dataPoint.value, buffer, metricConfig);
			
			// Filter by confidence threshold
			const minConfidence = metricConfig.minConfidence || this.config.alerts.minConfidence;
			if (result.isAnomaly && result.confidence >= minConfidence) {
				const alert = this.createAlert(dataPoint, buffer, metricConfig, result);
				results.push(alert);
			}
		}
		
		// Add alerts to manager
		for (const alert of results) {
			this.alertManager.addAlert(alert);
			
			this.logger?.warnSync('Anomaly detected', {
				component: LogComponents.metrics,
				metric: alert.metric,
				value: alert.value,
				method: alert.detectionMethod,
				severity: alert.severity,
				confidence: alert.confidence,
				deviation: alert.deviation,
			});
		}
	}
	
	/**
	 * Create an anomaly alert from detection result
	 */
	private createAlert(
		dataPoint: DataPoint,
		buffer: StatisticalBuffer,
		metricConfig: MetricConfig,
		result: any
	): AnomalyAlert {
		const severity = this.calculateSeverity(result.confidence, result.deviation);
		
		return {
			id: randomUUID(),
			severity,
			metric: dataPoint.metric,
			value: dataPoint.value,
			expectedRange: result.expectedRange,
			deviation: result.deviation,
			detectionMethod: result.method,
			timestamp: dataPoint.timestamp,
			confidence: result.confidence,
			context: {
				recent_values: getRecentValues(buffer, 10),
				baseline: buffer.mean,
				trend: getTrend(buffer),
				windowSize: buffer.size,
			},
			message: result.message,
			fingerprint: '', // Set by AlertManager
			count: 1,
		};
	}
	
	/**
	 * Calculate severity based on confidence and deviation
	 */
	private calculateSeverity(confidence: number, deviation: number): AnomalySeverity {
		if (confidence >= 0.85 || deviation >= 5.0) {
			return 'critical';
		} else if (confidence >= 0.7 || deviation >= 3.0) {
			return 'warning';
		} else {
			return 'info';
		}
	}
	
	/**
	 * Get metric configuration by name
	 */
	private getMetricConfig(metricName: string): MetricConfig | undefined {
		return this.config.metrics.find(m => m.name === metricName);
	}
	
	/**
	 * Get all unique detection methods across metrics
	 */
	private getUniqueDetectionMethods(): DetectionMethod[] {
		const methods = new Set<DetectionMethod>();
		for (const metric of this.config.metrics) {
			if (metric.enabled) {
				metric.methods.forEach(m => methods.add(m));
			}
		}
		return Array.from(methods);
	}
	
	/**
	 * Get all alerts
	 */
	getAlerts(since?: number): AnomalyAlert[] {
		return this.alertManager.getAlerts(since);
	}
	
	/**
	 * Get alerts by severity
	 */
	getAlertsBySeverity(severity: AnomalySeverity): AnomalyAlert[] {
		return this.alertManager.getAlertsBySeverity(severity);
	}
	
	/**
	 * Get alerts by metric
	 */
	getAlertsByMetric(metric: string): AnomalyAlert[] {
		return this.alertManager.getAlertsByMetric(metric);
	}
	
	/**
	 * Clear all alerts
	 */
	clearAlerts(): void {
		this.alertManager.clearAlerts();
	}
	
	/**
	 * Get service statistics
	 */
	getStats() {
		return {
			enabled: this.enabled,
			metricsTracked: this.buffers.size,
			alertQueueSize: this.alertManager.getQueueSize(),
			criticalAlerts: this.alertManager.getAlertsBySeverity('critical').length,
			warningAlerts: this.alertManager.getAlertsBySeverity('warning').length,
			infoAlerts: this.alertManager.getAlertsBySeverity('info').length,
		};
	}
	
	/**
	 * Get summary for cloud reporting (lightweight)
	 * Includes recent alerts and statistics
	 */
	getSummaryForReport(maxRecentAlerts: number = 10) {
		if (!this.enabled) {
			return undefined;
		}
		
		const allAlerts = this.alertManager.getAlerts();
		const recentAlerts = allAlerts.slice(0, maxRecentAlerts);
		
		// Lightweight alert format for reporting
		const alertsForReport = recentAlerts.map(alert => ({
			id: alert.id,
			severity: alert.severity,
			metric: alert.metric,
			value: alert.value,
			deviation: alert.deviation,
			method: alert.detectionMethod,
			timestamp: alert.timestamp,
			confidence: alert.confidence,
			count: alert.count,
		}));
		
		return {
			enabled: true,
			stats: {
				metricsTracked: this.buffers.size,
				totalAlerts: allAlerts.length,
				criticalCount: this.alertManager.getAlertsBySeverity('critical').length,
				warningCount: this.alertManager.getAlertsBySeverity('warning').length,
				infoCount: this.alertManager.getAlertsBySeverity('info').length,
			},
			recentAlerts: alertsForReport,
		};
	}
	
	/**
	 * Enable/disable detection
	 */
	setEnabled(enabled: boolean): void {
		this.enabled = enabled;
		this.logger?.infoSync(`Anomaly detection ${enabled ? 'enabled' : 'disabled'}`, {
			component: LogComponents.metrics,
		});
	}
	
	/**
	 * Update configuration
	 */
	updateConfig(config: Partial<AnomalyConfig>): void {
		this.config = { ...this.config, ...config };
		this.enabled = this.config.enabled;
		
		this.logger?.infoSync('Anomaly detection configuration updated', {
			component: LogComponents.metrics,
		});
	}
}
