/**
 * AI Chat Service
 * 
 * Handles natural language queries about IoT devices using Ollama (FREE local LLM)
 * 
 * Setup:
 *   1. Install Ollama: winget install Ollama.Ollama
 *   2. Pull a model: ollama pull llama3.1
 *   3. It runs on http://localhost:11434
 */

import { DeviceModel, DeviceMetricsModel, DeviceLogsModel } from '../db/models';

// Ollama configuration (FREE local LLM)
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  deviceUuid: string;
  message: string;
  conversationHistory?: ChatMessage[];
}

/**
 * Available tools that the AI can use
 */
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_device_info',
      description: 'Get basic information about a device (name, status, online status)',
      parameters: {
        type: 'object',
        properties: {
          deviceUuid: {
            type: 'string',
            description: 'Device UUID',
          },
        },
        required: ['deviceUuid'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_device_metrics',
      description: 'Get device metrics like CPU, memory, storage usage',
      parameters: {
        type: 'object',
        properties: {
          deviceUuid: {
            type: 'string',
            description: 'Device UUID',
          },
          hours: {
            type: 'number',
            description: 'Number of hours to retrieve metrics for (default: 24)',
          },
        },
        required: ['deviceUuid'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_device_logs',
      description: 'Get recent logs from device containers',
      parameters: {
        type: 'object',
        properties: {
          deviceUuid: {
            type: 'string',
            description: 'Device UUID',
          },
          serviceName: {
            type: 'string',
            description: 'Optional: Filter by service/container name',
          },
          limit: {
            type: 'number',
            description: 'Number of log entries to retrieve (default: 50)',
          },
        },
        required: ['deviceUuid'],
      },
    },
  },
];

/**
 * Execute a tool call
 */
async function executeTool(toolName: string, args: any): Promise<string> {
  try {
    switch (toolName) {
      case 'get_device_info': {
        const device = await DeviceModel.getByUuid(args.deviceUuid);
        if (!device) return 'Device not found';
        return JSON.stringify({
          name: device.device_name,
          uuid: device.uuid,
          status: device.status,
          isOnline: device.is_online,
          lastSeen: device.last_connectivity_event,
        });
      }

      case 'get_device_metrics': {
        const hours = args.hours || 24;
        const metrics = await DeviceMetricsModel.getRecent(args.deviceUuid, hours);
        if (!metrics || metrics.length === 0) {
          return 'No metrics available for this time period';
        }

        // Calculate averages
        const avgCpu = metrics.reduce((sum, m) => sum + (m.cpu_usage || 0), 0) / metrics.length;
        const avgMem = metrics.reduce((sum, m) => sum + (m.memory_usage || 0), 0) / metrics.length;
        const latest = metrics[0];

        return JSON.stringify({
          timeRange: `Last ${hours} hours`,
          averageCpu: avgCpu.toFixed(1),
          averageMemory: avgMem.toFixed(1),
          currentCpu: latest.cpu_usage,
          currentMemory: latest.memory_usage,
          memoryTotal: latest.memory_total,
        });
      }

      case 'get_device_logs': {
        const limit = args.limit || 50;
        const logs = await DeviceLogsModel.get(args.deviceUuid, {
          serviceName: args.serviceName,
          limit,
        });

        if (!logs || logs.length === 0) {
          return 'No logs available';
        }

        // Format logs for AI
        const formattedLogs = logs
          .slice(0, 20) // Only show first 20 to avoid token limits
          .map((log) => `[${log.service_name}] ${log.message}`)
          .join('\n');

        return `Recent logs (showing ${Math.min(20, logs.length)} of ${logs.length}):\n${formattedLogs}`;
      }

      default:
        return `Unknown tool: ${toolName}`;
    }
  } catch (error: any) {
    return `Error executing tool: ${error.message}`;
  }
}

/**
 * Process a chat message with Ollama (FREE local LLM)
 */
export async function processAIChat(request: ChatRequest): Promise<string> {
  const { deviceUuid, message, conversationHistory = [] } = request;

  try {
    // Build messages array
    const messages: any[] = [
      {
        role: 'system',
        content: `You are an IoT device assistant. You help users monitor and manage their IoT devices.
Current device UUID: ${deviceUuid}

Be concise and helpful. When showing metrics, use clear formatting.
If asked to perform actions like restarting containers, explain that you can provide information but the user needs to use the dashboard controls for actions.`,
      },
      ...conversationHistory.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      {
        role: 'user',
        content: message,
      },
    ];

    // Call Ollama with function calling (FREE!)
    const response = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages,
        tools: tools,
        tool_choice: 'auto',
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error: ${response.statusText}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: any }>;
    };
    const responseMessage = data.choices[0].message;

    // Check if AI wants to use tools
    if (responseMessage.tool_calls && responseMessage.tool_calls.length > 0) {
      // Execute tool calls
      messages.push(responseMessage);

      for (const toolCall of responseMessage.tool_calls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);
        const functionResponse = await executeTool(functionName, functionArgs);

        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: functionResponse,
        });
      }

      // Get final response from Ollama
      const secondResponse = await fetch(`${OLLAMA_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: OLLAMA_MODEL,
          messages,
        }),
      });

      const secondData = await secondResponse.json() as {
        choices: Array<{ message: { content: string } }>;
      };
      return secondData.choices[0].message.content || 'No response';
    }

    return responseMessage.content || 'No response';
  } catch (error: any) {
    console.error('AI chat error:', error);
    
    // Friendly error message if Ollama is not running
    if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
      throw new Error('Ollama is not running. Please start it with: ollama serve');
    }
    
    throw new Error(`AI chat failed: ${error.message}`);
  }
}
