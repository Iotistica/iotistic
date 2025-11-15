/**
 * MQTT Metrics Routes
 * Proxies metrics from the mqtt-exporter service
 */

import express, { Router } from 'express';
import fetch from 'node-fetch';

const router = Router();

const MQTT_EXPORTER_URL = process.env.MQTT_EXPORTER_URL || 'http://mqtt-exporter:9234';

/**
 * GET /api/v1/mqtt/metrics
 * Get MQTT broker metrics from mqtt-exporter service
 */
router.get('/metrics', async (req, res) => {
  try {
    const response = await fetch(`${MQTT_EXPORTER_URL}/metrics`);
    
    if (!response.ok) {
      throw new Error(`mqtt-exporter returned ${response.status}`);
    }
    
    const metricsText = await response.text();
    
    // Parse Prometheus metrics into JSON
    const metrics = parsePrometheusMetrics(metricsText);
    
    res.json({
      connected: metrics.mqtt_broker_connected === 1,
      clients: metrics.mosquitto_broker_clients_connected || 0,
      subscriptions: metrics.mosquitto_broker_subscriptions || 0,
      retainedMessages: metrics.mosquitto_broker_retained_messages || 0,
      totalMessagesSent: metrics.mosquitto_broker_messages_sent || 0,
      totalMessagesReceived: metrics.mosquitto_broker_messages_received || 0,
      systemStats: {
        publish: {
          messages: {
            sent: metrics.mosquitto_broker_messages_sent || 0,
            dropped: 0 // Not available in current metrics
          }
        },
        bytes: {
          sent: metrics.mosquitto_broker_bytes_sent || 0,
          received: metrics.mosquitto_broker_bytes_received || 0
        }
      },
      messageRate: {
        published: 0, // Calculate from deltas if needed
        received: 0
      },
      throughput: {
        inbound: 0, // Calculate from deltas if needed
        outbound: 0
      }
    });
  } catch (error: any) {
    console.error('Error fetching MQTT metrics:', error);
    res.status(503).json({
      error: 'Failed to fetch MQTT metrics',
      message: error.message,
      connected: false
    });
  }
});

/**
 * GET /api/v1/mqtt/health
 * Get MQTT broker health from mqtt-exporter service
 */
router.get('/health', async (req, res) => {
  try {
    const response = await fetch(`${MQTT_EXPORTER_URL}/health`);
    const data = await response.json();
    res.json(data);
  } catch (error: any) {
    console.error('Error fetching MQTT health:', error);
    res.status(503).json({
      status: 'error',
      connected: false,
      message: error.message
    });
  }
});

/**
 * Parse Prometheus metrics text format into key-value object
 */
function parsePrometheusMetrics(text: string): Record<string, number> {
  const metrics: Record<string, number> = {};
  const lines = text.split('\n');
  
  for (const line of lines) {
    // Skip comments and empty lines
    if (line.startsWith('#') || line.trim() === '') {
      continue;
    }
    
    // Parse metric line: metric_name{labels} value
    const match = line.match(/^([a-z_]+)(?:\{[^}]*\})?\s+([0-9.eE+-]+)/);
    if (match) {
      const [, name, value] = match;
      metrics[name] = parseFloat(value);
    }
  }
  
  return metrics;
}

export default router;
