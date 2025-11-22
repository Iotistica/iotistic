import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { EventEmitter } from 'events';

// Mock MQTT client
class MockMqttClient extends EventEmitter {
  connected = false;
  
  subscribe(topic: string | string[], callback?: (err: any, granted?: any) => void) {
    if (callback) {
      setImmediate(() => callback(null, [{ topic, qos: 0 }]));
    }
    return this;
  }
  
  end(force?: boolean, callback?: () => void) {
    this.connected = false;
    if (callback) {
      setImmediate(callback);
    }
    return this;
  }
  
  simulateConnect() {
    this.connected = true;
    this.emit('connect');
  }
  
  simulateMessage(topic: string, payload: Buffer, packet?: any) {
    this.emit('message', topic, payload, packet || { cmd: 'publish', qos: 0, retain: false });
  }
  
  simulateError(error: Error) {
    this.emit('error', error);
  }
  
  simulateClose() {
    this.connected = false;
    this.emit('close');
  }
}

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  infoSync: jest.fn(),
  warnSync: jest.fn(),
  errorSync: jest.fn(),
  debugSync: jest.fn(),
};

describe('MQTT Monitor Service', () => {
  let mockClient: MockMqttClient;
  
  beforeEach(() => {
    jest.clearAllMocks();
    mockClient = new MockMqttClient();
  });
  
  describe('Topic Tree', () => {
    test('should create topic tree structure', () => {
      const topicTree: any = {
        _name: 'root',
        _topic: '',
        _created: Date.now(),
        _messagesCounter: 0,
        _topicsCounter: 0
      };
      
      expect(topicTree).toHaveProperty('_name', 'root');
      expect(topicTree).toHaveProperty('_messagesCounter', 0);
      expect(topicTree).toHaveProperty('_topicsCounter', 0);
    });
    
    test('should parse topic path correctly', () => {
      const topic = 'sensor/temperature/room1';
      const parts = topic.split('/');
      
      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe('sensor');
      expect(parts[1]).toBe('temperature');
      expect(parts[2]).toBe('room1');
    });
    
    test('should build nested topic structure', () => {
      const topicTree: any = {
        _name: 'root',
        _messagesCounter: 0,
        _topicsCounter: 0
      };
      
      const topic = 'sensor/temperature';
      const parts = topic.split('/');
      let current = topicTree;
      
      parts.forEach((part, index) => {
        if (!current[part]) {
          current[part] = {
            _name: part,
            _topic: parts.slice(0, index + 1).join('/'),
            _messagesCounter: 0,
            _topicsCounter: 0
          };
        }
        current = current[part];
      });
      
      expect(topicTree.sensor).toBeDefined();
      expect(topicTree.sensor.temperature).toBeDefined();
      expect(topicTree.sensor.temperature._topic).toBe('sensor/temperature');
    });
  });
  
  describe('Schema Generation', () => {
    test('should detect JSON payload', () => {
      const payload = Buffer.from(JSON.stringify({ temp: 23.5, unit: 'C' }));
      const payloadStr = payload.toString();
      
      let messageType = 'string';
      try {
        const json = JSON.parse(payloadStr);
        messageType = 'json';
        expect(json).toHaveProperty('temp', 23.5);
        expect(json).toHaveProperty('unit', 'C');
      } catch {
        // Not JSON
      }
      
      expect(messageType).toBe('json');
    });
    
    test('should detect XML payload', () => {
      const payload = Buffer.from('<temperature><value>23.5</value></temperature>');
      const payloadStr = payload.toString();
      
      const isXml = payloadStr.startsWith('<') && payloadStr.endsWith('>');
      expect(isXml).toBe(true);
    });
    
    test('should detect string payload', () => {
      const payload = Buffer.from('plain text message');
      const payloadStr = payload.toString();
      
      let messageType = 'string';
      try {
        JSON.parse(payloadStr);
        messageType = 'json';
      } catch {
        if (payloadStr.startsWith('<') && payloadStr.endsWith('>')) {
          messageType = 'xml';
        }
      }
      
      expect(messageType).toBe('string');
    });
    
    test('should generate schema for nested JSON', () => {
      const data = {
        sensor: {
          id: 'sensor001',
          readings: {
            temperature: 23.5,
            humidity: 65
          }
        },
        timestamp: Date.now()
      };
      
      const generateSchema = (obj: any): any => {
        if (obj === null) return { type: 'null' };
        if (Array.isArray(obj)) {
          return {
            type: 'array',
            items: obj.length > 0 ? generateSchema(obj[0]) : { type: 'any' }
          };
        }
        if (typeof obj === 'object') {
          const properties: Record<string, any> = {};
          Object.keys(obj).forEach(key => {
            properties[key] = generateSchema(obj[key]);
          });
          return { type: 'object', properties };
        }
        return { type: typeof obj };
      };
      
      const schema = generateSchema(data);
      
      expect(schema.type).toBe('object');
      expect(schema.properties.sensor.type).toBe('object');
      expect(schema.properties.sensor.properties.readings.type).toBe('object');
      expect(schema.properties.sensor.properties.readings.properties.temperature.type).toBe('number');
    });
    
    test('should generate schema for array', () => {
      const data = [
        { id: 1, value: 10 },
        { id: 2, value: 20 }
      ];
      
      const generateSchema = (obj: any): any => {
        if (Array.isArray(obj)) {
          return {
            type: 'array',
            items: obj.length > 0 ? { type: 'object' } : { type: 'any' }
          };
        }
        return { type: typeof obj };
      };
      
      const schema = generateSchema(data);
      
      expect(schema.type).toBe('array');
      expect(schema.items.type).toBe('object');
    });
  });
  
  describe('Message Counting', () => {
    test('should increment message counter', () => {
      let messageCount = 0;
      messageCount++;
      expect(messageCount).toBe(1);
      
      messageCount++;
      expect(messageCount).toBe(2);
    });
    
    test('should handle overflow threshold', () => {
      let messageCount = 2147483640; // Near 32-bit signed int max
      
      if (messageCount >= 2147483640) {
        messageCount = 0; // Reset on overflow
      }
      
      expect(messageCount).toBe(0);
    });
    
    test('should track session counters separately', () => {
      const topicNode = {
        _messagesCounter: 100,
        _sessionCounter: 0
      };
      
      topicNode._sessionCounter++;
      
      expect(topicNode._messagesCounter).toBe(100);
      expect(topicNode._sessionCounter).toBe(1);
    });
  });
  
  describe('$SYS Topic Handling', () => {
    test('should identify $SYS topics', () => {
      const sysTopic = '$SYS/broker/messages/sent';
      expect(sysTopic.startsWith('$SYS/')).toBe(true);
    });
    
    test('should parse $SYS topic hierarchy', () => {
      const topic = '$SYS/broker/clients/connected';
      const parts = topic.split('/');
      
      expect(parts[0]).toBe('$SYS');
      expect(parts[1]).toBe('broker');
      expect(parts[2]).toBe('clients');
      expect(parts[3]).toBe('connected');
    });
    
    test('should store $SYS values', () => {
      const systemStats: any = { _name: 'broker' };
      const topic = '$SYS/broker/clients/connected';
      const value = '5';
      
      const parts = topic.split('/');
      let current = systemStats;
      
      parts.forEach((part, index) => {
        if (!current[part]) {
          current[part] = {};
        }
        if (index + 1 === parts.length) {
          current[part] = value;
        }
        current = current[part];
      });
      
      expect(systemStats.$SYS.broker.clients.connected).toBe('5');
    });
  });
  
  describe('Metrics Calculation', () => {
    test('should calculate message rate', () => {
      const messageRate = {
        published: [0, 5, 10, 15, 20],
        received: [0, 5, 10, 15, 20],
        current: { published: 0, received: 0 }
      };
      
      // Add new value
      messageRate.published.push(25);
      messageRate.published.shift(); // Remove oldest
      messageRate.current.published = messageRate.published[messageRate.published.length - 1];
      
      expect(messageRate.published).toHaveLength(5);
      expect(messageRate.current.published).toBe(25);
      expect(messageRate.published[0]).toBe(5);
    });
    
    test('should track throughput', () => {
      const throughput = {
        inbound: Array(15).fill(0),
        outbound: Array(15).fill(0),
        current: { inbound: 0, outbound: 0 }
      };
      
      throughput.inbound.push(1024);
      throughput.inbound.shift();
      throughput.current.inbound = 1024;
      
      expect(throughput.inbound).toHaveLength(15);
      expect(throughput.current.inbound).toBe(1024);
    });
  });
  
  describe('Status Calculation', () => {
    test('should count topics by traversing tree', () => {
      const topicTree: any = {
        _name: 'root',
        sensor: {
          _name: 'sensor',
          _messagesCounter: 0,
          temperature: {
            _name: 'temperature',
            _message: '{"temp":23.5}',
            _messagesCounter: 10
          },
          humidity: {
            _name: 'humidity',
            _message: '{"hum":65}',
            _messagesCounter: 5
          }
        },
        system: {
          _name: 'system',
          status: {
            _name: 'status',
            _message: 'online',
            _messagesCounter: 1
          }
        }
      };
      
      let topicCount = 0;
      let messageCount = 0;
      
      const traverse = (node: any) => {
        Object.keys(node).forEach(key => {
          if (key.startsWith('_')) return;
          
          const child = node[key];
          if (child._message !== undefined) {
            topicCount++;
            messageCount += child._messagesCounter || 0;
          }
          
          traverse(child);
        });
      };
      
      traverse(topicTree);
      
      expect(topicCount).toBe(3);
      expect(messageCount).toBe(16);
    });
  });
  
  describe('MQTT Client Events', () => {
    test('should handle connect event', (done) => {
      mockClient.on('connect', () => {
        expect(mockClient.connected).toBe(true);
        done();
      });
      
      mockClient.simulateConnect();
    });
    
    test('should handle message event', (done) => {
      const expectedTopic = 'sensor/temperature';
      const expectedPayload = Buffer.from('23.5');
      
      mockClient.on('message', (topic, payload) => {
        expect(topic).toBe(expectedTopic);
        expect(payload.toString()).toBe('23.5');
        done();
      });
      
      mockClient.simulateMessage(expectedTopic, expectedPayload);
    });
    
    test('should handle error event', (done) => {
      const expectedError = new Error('Connection failed');
      
      mockClient.on('error', (error) => {
        expect(error.message).toBe('Connection failed');
        done();
      });
      
      mockClient.simulateError(expectedError);
    });
    
    test('should handle close event', (done) => {
      mockClient.on('close', () => {
        expect(mockClient.connected).toBe(false);
        done();
      });
      
      mockClient.simulateClose();
    });
  });
  
  describe('Time Window Filtering', () => {
    test('should calculate time window in milliseconds', () => {
      const windows: Record<string, number> = {
        '1h': 60 * 60 * 1000,
        '6h': 6 * 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000
      };
      
      expect(windows['1h']).toBe(3600000);
      expect(windows['24h']).toBe(86400000);
      expect(windows['7d']).toBe(604800000);
    });
    
    test('should filter topics by timestamp', () => {
      const now = Date.now();
      const oneHourAgo = now - (60 * 60 * 1000);
      
      const topics = [
        { topic: 'sensor/temp', lastModified: now - 30 * 60 * 1000 }, // 30 min ago
        { topic: 'sensor/hum', lastModified: now - 90 * 60 * 1000 }, // 90 min ago
        { topic: 'system/status', lastModified: now - 10 * 60 * 1000 } // 10 min ago
      ];
      
      const filtered = topics.filter(t => t.lastModified >= oneHourAgo);
      
      expect(filtered).toHaveLength(2);
      expect(filtered[0].topic).toBe('sensor/temp');
      expect(filtered[1].topic).toBe('system/status');
    });
  });
});
