import { ModbusAdapter } from '../../../src/features/sensors/modbus/adapter';
import { ModbusAdapterConfig } from '../../../src/features/sensors/modbus/types';
import { SensorDataPoint } from '../../../src/features/sensors/types';

describe('ModbusAdapter', () => {
  let mockLogger: any;
  let mockConfig: ModbusAdapterConfig;

  beforeEach(() => {
    mockLogger = {
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    mockConfig = {
      devices: [],
      logging: {
        level: 'info',
        enableConsole: false,
        enableFile: false
      }
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should create adapter instance', () => {
    const adapter = new ModbusAdapter(mockConfig, mockLogger);
    expect(adapter).toBeDefined();
  });

  it('should start with no devices', async () => {
    const adapter = new ModbusAdapter(mockConfig, mockLogger);
    await adapter.start();
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('started'));
  });

  it('should emit started event', async () => {
    const adapter = new ModbusAdapter(mockConfig, mockLogger);
    const startedSpy = jest.fn();
    adapter.on('started', startedSpy);
    
    await adapter.start();
    
    expect(startedSpy).toHaveBeenCalled();
  });

  it('should stop adapter', async () => {
    const adapter = new ModbusAdapter(mockConfig, mockLogger);
    await adapter.start();
    await adapter.stop();
    
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('stopped'));
  });

  it('should return empty device statuses when no devices', () => {
    const adapter = new ModbusAdapter(mockConfig, mockLogger);
    const statuses = adapter.getDeviceStatuses();
    expect(statuses).toEqual([]);
  });

  it('should not start twice', async () => {
    const adapter = new ModbusAdapter(mockConfig, mockLogger);
    await adapter.start();
    await adapter.start();
    
    const startedCalls = mockLogger.info.mock.calls.filter(
      (call: any[]) => call[0].includes('started')
    );
    expect(startedCalls.length).toBe(1);
  });
});
