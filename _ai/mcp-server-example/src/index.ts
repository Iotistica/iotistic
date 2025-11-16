#!/usr/bin/env node

/**
 * Iotistic MCP Server
 * 
 * Exposes Iotistic IoT Platform API to LLMs via Model Context Protocol
 * 
 * Usage:
 *   iotistic-mcp --api-url http://localhost:4002 --api-key your-key
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosInstance } from 'axios';

// API Configuration
const API_URL = process.env.IOTISTIC_API_URL || 'http://localhost:4002';
const API_KEY = process.env.IOTISTIC_API_KEY || '';

// API Client
class IotisticClient {
  private client: AxiosInstance;

  constructor(baseURL: string, apiKey: string) {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey && { 'Authorization': `Bearer ${apiKey}` }),
      },
    });
  }

  // Device Management
  async listDevices() {
    const { data } = await this.client.get('/api/v1/devices');
    return data;
  }

  async getDevice(uuid: string) {
    const { data } = await this.client.get(`/api/v1/devices/${uuid}`);
    return data;
  }

  async getDeviceState(uuid: string) {
    const { data } = await this.client.get(`/api/v1/devices/${uuid}/state`);
    return data;
  }

  // Metrics
  async getDeviceMetrics(uuid: string, hours: number = 24) {
    const { data } = await this.client.get(`/api/v1/devices/${uuid}/metrics`, {
      params: { hours },
    });
    return data;
  }

  // Logs
  async getDeviceLogs(uuid: string, service?: string, limit: number = 100) {
    const { data } = await this.client.get(`/api/v1/devices/${uuid}/logs`, {
      params: { service, limit },
    });
    return data;
  }

  async getLogServices(uuid: string) {
    const { data } = await this.client.get(`/api/v1/devices/${uuid}/logs/services`);
    return data;
  }

  // Container Management
  async listContainers(uuid: string) {
    const { data } = await this.client.get(`/api/v1/devices/${uuid}/containers`);
    return data;
  }

  async getContainer(uuid: string, containerId: string) {
    const { data } = await this.client.get(`/api/v1/devices/${uuid}/containers/${containerId}`);
    return data;
  }

  async startContainer(uuid: string, containerId: string) {
    const { data } = await this.client.post(`/api/v1/devices/${uuid}/containers/${containerId}/start`);
    return data;
  }

  async stopContainer(uuid: string, containerId: string) {
    const { data } = await this.client.post(`/api/v1/devices/${uuid}/containers/${containerId}/stop`);
    return data;
  }

  async restartContainer(uuid: string, containerId: string) {
    const { data } = await this.client.post(`/api/v1/devices/${uuid}/containers/${containerId}/restart`);
    return data;
  }

  // Events
  async getDeviceEvents(uuid: string, hours: number = 24) {
    const { data } = await this.client.get(`/api/v1/devices/${uuid}/events`, {
      params: { hours },
    });
    return data;
  }

  // MQTT Topics
  async getMqttTopics(uuid: string) {
    const { data } = await this.client.get(`/api/v1/devices/${uuid}/mqtt/topics`);
    return data;
  }

  async publishMqtt(uuid: string, topic: string, message: any) {
    const { data } = await this.client.post(`/api/v1/devices/${uuid}/mqtt/publish`, {
      topic,
      message,
    });
    return data;
  }
}

// Initialize API client
const apiClient = new IotisticClient(API_URL, API_KEY);

// Define MCP Tools
const tools: Tool[] = [
  {
    name: 'list_devices',
    description: 'List all IoT devices in the platform',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_device',
    description: 'Get detailed information about a specific device',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: {
          type: 'string',
          description: 'Device UUID',
        },
      },
      required: ['uuid'],
    },
  },
  {
    name: 'get_device_state',
    description: 'Get current state of a device (containers, applications, target state)',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: {
          type: 'string',
          description: 'Device UUID',
        },
      },
      required: ['uuid'],
    },
  },
  {
    name: 'get_device_metrics',
    description: 'Get device metrics (CPU, memory, storage) for a time period',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: {
          type: 'string',
          description: 'Device UUID',
        },
        hours: {
          type: 'number',
          description: 'Number of hours to retrieve (default: 24)',
          default: 24,
        },
      },
      required: ['uuid'],
    },
  },
  {
    name: 'get_device_logs',
    description: 'Get container logs from a device',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: {
          type: 'string',
          description: 'Device UUID',
        },
        service: {
          type: 'string',
          description: 'Optional: Filter by service/container name',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of log entries (default: 100)',
          default: 100,
        },
      },
      required: ['uuid'],
    },
  },
  {
    name: 'list_containers',
    description: 'List all containers running on a device',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: {
          type: 'string',
          description: 'Device UUID',
        },
      },
      required: ['uuid'],
    },
  },
  {
    name: 'start_container',
    description: 'Start a container on a device',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: {
          type: 'string',
          description: 'Device UUID',
        },
        containerId: {
          type: 'string',
          description: 'Container ID or name',
        },
      },
      required: ['uuid', 'containerId'],
    },
  },
  {
    name: 'stop_container',
    description: 'Stop a container on a device',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: {
          type: 'string',
          description: 'Device UUID',
        },
        containerId: {
          type: 'string',
          description: 'Container ID or name',
        },
      },
      required: ['uuid', 'containerId'],
    },
  },
  {
    name: 'restart_container',
    description: 'Restart a container on a device',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: {
          type: 'string',
          description: 'Device UUID',
        },
        containerId: {
          type: 'string',
          description: 'Container ID or name',
        },
      },
      required: ['uuid', 'containerId'],
    },
  },
  {
    name: 'get_device_events',
    description: 'Get events from a device (system events, alerts, state changes)',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: {
          type: 'string',
          description: 'Device UUID',
        },
        hours: {
          type: 'number',
          description: 'Number of hours to retrieve (default: 24)',
          default: 24,
        },
      },
      required: ['uuid'],
    },
  },
  {
    name: 'get_mqtt_topics',
    description: 'Get list of MQTT topics for a device',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: {
          type: 'string',
          description: 'Device UUID',
        },
      },
      required: ['uuid'],
    },
  },
  {
    name: 'publish_mqtt',
    description: 'Publish a message to an MQTT topic',
    inputSchema: {
      type: 'object',
      properties: {
        uuid: {
          type: 'string',
          description: 'Device UUID',
        },
        topic: {
          type: 'string',
          description: 'MQTT topic',
        },
        message: {
          type: 'object',
          description: 'Message payload (JSON object)',
        },
      },
      required: ['uuid', 'topic', 'message'],
    },
  },
];

// Create MCP Server
const server = new Server(
  {
    name: 'iotistic-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle tool list request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case 'list_devices':
        result = await apiClient.listDevices();
        break;

      case 'get_device':
        result = await apiClient.getDevice(args.uuid as string);
        break;

      case 'get_device_state':
        result = await apiClient.getDeviceState(args.uuid as string);
        break;

      case 'get_device_metrics':
        result = await apiClient.getDeviceMetrics(
          args.uuid as string,
          args.hours as number
        );
        break;

      case 'get_device_logs':
        result = await apiClient.getDeviceLogs(
          args.uuid as string,
          args.service as string | undefined,
          args.limit as number
        );
        break;

      case 'list_containers':
        result = await apiClient.listContainers(args.uuid as string);
        break;

      case 'start_container':
        result = await apiClient.startContainer(
          args.uuid as string,
          args.containerId as string
        );
        break;

      case 'stop_container':
        result = await apiClient.stopContainer(
          args.uuid as string,
          args.containerId as string
        );
        break;

      case 'restart_container':
        result = await apiClient.restartContainer(
          args.uuid as string,
          args.containerId as string
        );
        break;

      case 'get_device_events':
        result = await apiClient.getDeviceEvents(
          args.uuid as string,
          args.hours as number
        );
        break;

      case 'get_mqtt_topics':
        result = await apiClient.getMqttTopics(args.uuid as string);
        break;

      case 'publish_mqtt':
        result = await apiClient.publishMqtt(
          args.uuid as string,
          args.topic as string,
          args.message
        );
        break;

      default:
        throw new Error(`Unknown tool: ${name}`);
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  console.error('Starting Iotistic MCP Server...');
  console.error(`API URL: ${API_URL}`);
  console.error(`API Key: ${API_KEY ? '***' : 'Not set'}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Iotistic MCP Server running');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
