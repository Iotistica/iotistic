/**
 * FORECASTER - TIME SERIES PREDICTION
 * =====================================
 * 
 * Simple forecasting algorithms for edge devices:
 * - Linear regression prediction
 * - Moving average smoothing
 * - Time-to-threshold estimation
 * - Confidence scoring
 */

import type { StatisticalBuffer } from './types';
import { getRecentValues } from './buffer';

export interface Prediction {
	current: number;
	predicted_next: number;
	trend: 'increasing' | 'decreasing' | 'stable';
	trend_strength: number; // 0-1 scale
	confidence: number; // 0-1 scale
	time_to_threshold?: {
		threshold: number;
		estimated_seconds: number;
		confidence: number;
	};
}

/**
 * Simple linear regression predictor
 * Uses recent values to predict next value
 */
export class LinearPredictor {
	/**
	 * Predict next value using linear regression
	 * @param buffer Statistical buffer with historical data
	 * @param lookbackWindow Number of recent points to use (default: 20)
	 */
	predict(buffer: StatisticalBuffer, lookbackWindow: number = 20): Prediction | null {
		if (buffer.size < 5) {
			return null; // Need minimum data
		}
		
		const recentValues = getRecentValues(buffer, lookbackWindow);
		if (recentValues.length < 5) {
			return null;
		}
		
		// Simple linear regression: y = mx + b
		const n = recentValues.length;
		let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
		
		for (let i = 0; i < n; i++) {
			const x = i; // Time index
			const y = recentValues[i];
			sumX += x;
			sumY += y;
			sumXY += x * y;
			sumX2 += x * x;
		}
		
		const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
		const intercept = (sumY - slope * sumX) / n;
		
		// Predict next value (time index = n)
		const predictedNext = slope * n + intercept;
		
		// Calculate trend
		const trend = this.calculateTrend(slope, buffer.stdDev);
		const trendStrength = this.calculateTrendStrength(slope, buffer.stdDev);
		
		// Calculate confidence based on R-squared
		const confidence = this.calculateConfidence(recentValues, slope, intercept);
		
		return {
			current: recentValues[recentValues.length - 1],
			predicted_next: predictedNext,
			trend: trend.direction,
			trend_strength: trendStrength,
			confidence
		};
	}
	
	/**
	 * Estimate time until threshold is reached
	 */
	estimateTimeToThreshold(
		buffer: StatisticalBuffer,
		threshold: number,
		samplingIntervalMs: number = 60000 // Default: 1 minute
	): { estimated_seconds: number; confidence: number } | null {
		if (buffer.size < 10) {
			return null;
		}
		
		const recentValues = getRecentValues(buffer, 30);
		const n = recentValues.length;
		
		// Linear regression
		let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
		for (let i = 0; i < n; i++) {
			sumX += i;
			sumY += recentValues[i];
			sumXY += i * recentValues[i];
			sumX2 += i * i;
		}
		
		const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
		const intercept = (sumY - slope * sumX) / n;
		
		// If not trending toward threshold, return null
		const current = recentValues[n - 1];
		const movingTowardThreshold = 
			(slope > 0 && threshold > current) || 
			(slope < 0 && threshold < current);
		
		if (!movingTowardThreshold || Math.abs(slope) < 0.01) {
			return null; // Not trending toward threshold
		}
		
		// Calculate time to reach threshold
		// threshold = slope * t + intercept
		// t = (threshold - intercept) / slope
		const stepsToThreshold = (threshold - intercept) / slope;
		const estimatedSeconds = stepsToThreshold * (samplingIntervalMs / 1000);
		
		// Confidence based on how linear the trend is
		const confidence = this.calculateConfidence(recentValues, slope, intercept);
		
		return {
			estimated_seconds: Math.max(0, estimatedSeconds),
			confidence
		};
	}
	
	/**
	 * Calculate trend direction
	 */
	private calculateTrend(slope: number, stdDev: number): { direction: 'increasing' | 'decreasing' | 'stable' } {
		const threshold = stdDev * 0.1; // 10% of standard deviation
		
		if (slope > threshold) {
			return { direction: 'increasing' };
		} else if (slope < -threshold) {
			return { direction: 'decreasing' };
		} else {
			return { direction: 'stable' };
		}
	}
	
	/**
	 * Calculate trend strength (0-1)
	 */
	private calculateTrendStrength(slope: number, stdDev: number): number {
		if (stdDev === 0) return 0;
		
		// Normalize slope by standard deviation
		const normalizedSlope = Math.abs(slope) / stdDev;
		
		// Cap at 1.0
		return Math.min(1.0, normalizedSlope);
	}
	
	/**
	 * Calculate prediction confidence using R-squared
	 */
	private calculateConfidence(values: number[], slope: number, intercept: number): number {
		const n = values.length;
		
		// Calculate mean
		const mean = values.reduce((sum, val) => sum + val, 0) / n;
		
		// Calculate R-squared
		let ssRes = 0; // Sum of squared residuals
		let ssTot = 0; // Total sum of squares
		
		for (let i = 0; i < n; i++) {
			const predicted = slope * i + intercept;
			const actual = values[i];
			ssRes += Math.pow(actual - predicted, 2);
			ssTot += Math.pow(actual - mean, 2);
		}
		
		if (ssTot === 0) return 0;
		
		const rSquared = 1 - (ssRes / ssTot);
		
		// Convert to 0-1 confidence (R-squared is already 0-1)
		return Math.max(0, Math.min(1, rSquared));
	}
}

/**
 * Exponential moving average predictor (faster, but simpler)
 */
export class EMAPredictor {
	private alpha: number; // Smoothing factor (0-1)
	
	constructor(alpha: number = 0.3) {
		this.alpha = alpha;
	}
	
	/**
	 * Predict next value using EMA
	 */
	predict(buffer: StatisticalBuffer): Prediction | null {
		if (buffer.size < 3) {
			return null;
		}
		
		const recentValues = getRecentValues(buffer, 10);
		if (recentValues.length < 3) {
			return null;
		}
		
		// Calculate EMA
		let ema = recentValues[0];
		for (let i = 1; i < recentValues.length; i++) {
			ema = this.alpha * recentValues[i] + (1 - this.alpha) * ema;
		}
		
		// Simple trend detection
		const current = recentValues[recentValues.length - 1];
		const previous = recentValues[recentValues.length - 2];
		const change = current - previous;
		
		// Predict next value (extrapolate)
		const predictedNext = ema + change;
		
		// Determine trend
		let trend: 'increasing' | 'decreasing' | 'stable';
		if (Math.abs(change) < buffer.stdDev * 0.1) {
			trend = 'stable';
		} else if (change > 0) {
			trend = 'increasing';
		} else {
			trend = 'decreasing';
		}
		
		// Simple confidence based on recent variance
		const recentVariance = this.calculateRecentVariance(recentValues);
		const confidence = Math.max(0, 1 - (recentVariance / (buffer.stdDev * buffer.stdDev)));
		
		return {
			current,
			predicted_next: predictedNext,
			trend,
			trend_strength: Math.min(1, Math.abs(change) / buffer.stdDev),
			confidence
		};
	}
	
	private calculateRecentVariance(values: number[]): number {
		const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
		const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
		return variance;
	}
}
