import { z } from 'zod';
/**
 * Modbus Function Code enumeration
 */
export declare enum ModbusFunctionCode {
    READ_COILS = 1,
    READ_DISCRETE_INPUTS = 2,
    READ_HOLDING_REGISTERS = 3,
    READ_INPUT_REGISTERS = 4,
    WRITE_SINGLE_COIL = 5,
    WRITE_SINGLE_REGISTER = 6,
    WRITE_MULTIPLE_COILS = 15,
    WRITE_MULTIPLE_REGISTERS = 16
}
/**
 * Modbus Connection Type enumeration
 */
export declare enum ModbusConnectionType {
    TCP = "tcp",
    RTU = "rtu",
    ASCII = "ascii"
}
/**
 * Data Type enumeration for register interpretation
 */
export declare enum ModbusDataType {
    INT16 = "int16",
    UINT16 = "uint16",
    INT32 = "int32",
    UINT32 = "uint32",
    FLOAT32 = "float32",
    BOOLEAN = "boolean",
    STRING = "string"
}
/**
 * Endianness for multi-register data types
 */
export declare enum Endianness {
    BIG = "big",
    LITTLE = "little"
}
/**
 * Modbus Register Configuration Schema
 */
export declare const ModbusRegisterSchema: z.ZodObject<{
    name: z.ZodString;
    address: z.ZodNumber;
    functionCode: z.ZodNativeEnum<typeof ModbusFunctionCode>;
    dataType: z.ZodNativeEnum<typeof ModbusDataType>;
    count: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    endianness: z.ZodDefault<z.ZodOptional<z.ZodNativeEnum<typeof Endianness>>>;
    scale: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    offset: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    unit: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    description: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    address: number;
    functionCode: ModbusFunctionCode;
    dataType: ModbusDataType;
    count: number;
    endianness: Endianness;
    scale: number;
    offset: number;
    unit: string;
    description: string;
}, {
    name: string;
    address: number;
    functionCode: ModbusFunctionCode;
    dataType: ModbusDataType;
    count?: number | undefined;
    endianness?: Endianness | undefined;
    scale?: number | undefined;
    offset?: number | undefined;
    unit?: string | undefined;
    description?: string | undefined;
}>;
export type ModbusRegister = z.infer<typeof ModbusRegisterSchema>;
/**
 * Modbus Connection Configuration Schema
 */
export declare const ModbusConnectionSchema: z.ZodEffects<z.ZodObject<{
    type: z.ZodNativeEnum<typeof ModbusConnectionType>;
    host: z.ZodOptional<z.ZodString>;
    port: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    serialPort: z.ZodOptional<z.ZodString>;
    baudRate: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    dataBits: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    stopBits: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    parity: z.ZodDefault<z.ZodOptional<z.ZodEnum<["none", "even", "odd"]>>>;
    timeout: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    retryAttempts: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    retryDelay: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}, "strip", z.ZodTypeAny, {
    type: ModbusConnectionType;
    port: number;
    baudRate: number;
    dataBits: number;
    stopBits: number;
    parity: "none" | "even" | "odd";
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
    host?: string | undefined;
    serialPort?: string | undefined;
}, {
    type: ModbusConnectionType;
    host?: string | undefined;
    port?: number | undefined;
    serialPort?: string | undefined;
    baudRate?: number | undefined;
    dataBits?: number | undefined;
    stopBits?: number | undefined;
    parity?: "none" | "even" | "odd" | undefined;
    timeout?: number | undefined;
    retryAttempts?: number | undefined;
    retryDelay?: number | undefined;
}>, {
    type: ModbusConnectionType;
    port: number;
    baudRate: number;
    dataBits: number;
    stopBits: number;
    parity: "none" | "even" | "odd";
    timeout: number;
    retryAttempts: number;
    retryDelay: number;
    host?: string | undefined;
    serialPort?: string | undefined;
}, {
    type: ModbusConnectionType;
    host?: string | undefined;
    port?: number | undefined;
    serialPort?: string | undefined;
    baudRate?: number | undefined;
    dataBits?: number | undefined;
    stopBits?: number | undefined;
    parity?: "none" | "even" | "odd" | undefined;
    timeout?: number | undefined;
    retryAttempts?: number | undefined;
    retryDelay?: number | undefined;
}>;
export type ModbusConnectionConfig = z.infer<typeof ModbusConnectionSchema>;
/**
 * Modbus Device Configuration Schema
 */
export declare const ModbusDeviceSchema: z.ZodObject<{
    name: z.ZodString;
    slaveId: z.ZodNumber;
    connection: z.ZodEffects<z.ZodObject<{
        type: z.ZodNativeEnum<typeof ModbusConnectionType>;
        host: z.ZodOptional<z.ZodString>;
        port: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        serialPort: z.ZodOptional<z.ZodString>;
        baudRate: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        dataBits: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        stopBits: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        parity: z.ZodDefault<z.ZodOptional<z.ZodEnum<["none", "even", "odd"]>>>;
        timeout: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        retryAttempts: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        retryDelay: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    }, "strip", z.ZodTypeAny, {
        type: ModbusConnectionType;
        port: number;
        baudRate: number;
        dataBits: number;
        stopBits: number;
        parity: "none" | "even" | "odd";
        timeout: number;
        retryAttempts: number;
        retryDelay: number;
        host?: string | undefined;
        serialPort?: string | undefined;
    }, {
        type: ModbusConnectionType;
        host?: string | undefined;
        port?: number | undefined;
        serialPort?: string | undefined;
        baudRate?: number | undefined;
        dataBits?: number | undefined;
        stopBits?: number | undefined;
        parity?: "none" | "even" | "odd" | undefined;
        timeout?: number | undefined;
        retryAttempts?: number | undefined;
        retryDelay?: number | undefined;
    }>, {
        type: ModbusConnectionType;
        port: number;
        baudRate: number;
        dataBits: number;
        stopBits: number;
        parity: "none" | "even" | "odd";
        timeout: number;
        retryAttempts: number;
        retryDelay: number;
        host?: string | undefined;
        serialPort?: string | undefined;
    }, {
        type: ModbusConnectionType;
        host?: string | undefined;
        port?: number | undefined;
        serialPort?: string | undefined;
        baudRate?: number | undefined;
        dataBits?: number | undefined;
        stopBits?: number | undefined;
        parity?: "none" | "even" | "odd" | undefined;
        timeout?: number | undefined;
        retryAttempts?: number | undefined;
        retryDelay?: number | undefined;
    }>;
    registers: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        address: z.ZodNumber;
        functionCode: z.ZodNativeEnum<typeof ModbusFunctionCode>;
        dataType: z.ZodNativeEnum<typeof ModbusDataType>;
        count: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        endianness: z.ZodDefault<z.ZodOptional<z.ZodNativeEnum<typeof Endianness>>>;
        scale: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        offset: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        unit: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        description: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        address: number;
        functionCode: ModbusFunctionCode;
        dataType: ModbusDataType;
        count: number;
        endianness: Endianness;
        scale: number;
        offset: number;
        unit: string;
        description: string;
    }, {
        name: string;
        address: number;
        functionCode: ModbusFunctionCode;
        dataType: ModbusDataType;
        count?: number | undefined;
        endianness?: Endianness | undefined;
        scale?: number | undefined;
        offset?: number | undefined;
        unit?: string | undefined;
        description?: string | undefined;
    }>, "many">;
    pollInterval: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    enabled: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    slaveId: number;
    connection: {
        type: ModbusConnectionType;
        port: number;
        baudRate: number;
        dataBits: number;
        stopBits: number;
        parity: "none" | "even" | "odd";
        timeout: number;
        retryAttempts: number;
        retryDelay: number;
        host?: string | undefined;
        serialPort?: string | undefined;
    };
    registers: {
        name: string;
        address: number;
        functionCode: ModbusFunctionCode;
        dataType: ModbusDataType;
        count: number;
        endianness: Endianness;
        scale: number;
        offset: number;
        unit: string;
        description: string;
    }[];
    pollInterval: number;
    enabled: boolean;
}, {
    name: string;
    slaveId: number;
    connection: {
        type: ModbusConnectionType;
        host?: string | undefined;
        port?: number | undefined;
        serialPort?: string | undefined;
        baudRate?: number | undefined;
        dataBits?: number | undefined;
        stopBits?: number | undefined;
        parity?: "none" | "even" | "odd" | undefined;
        timeout?: number | undefined;
        retryAttempts?: number | undefined;
        retryDelay?: number | undefined;
    };
    registers: {
        name: string;
        address: number;
        functionCode: ModbusFunctionCode;
        dataType: ModbusDataType;
        count?: number | undefined;
        endianness?: Endianness | undefined;
        scale?: number | undefined;
        offset?: number | undefined;
        unit?: string | undefined;
        description?: string | undefined;
    }[];
    pollInterval?: number | undefined;
    enabled?: boolean | undefined;
}>;
export type ModbusDevice = z.infer<typeof ModbusDeviceSchema>;
/**
 * Unix Socket Output Configuration Schema
 */
export declare const SocketOutputSchema: z.ZodObject<{
    socketPath: z.ZodString;
    dataFormat: z.ZodDefault<z.ZodOptional<z.ZodEnum<["json", "csv"]>>>;
    delimiter: z.ZodDefault<z.ZodOptional<z.ZodString>>;
    includeTimestamp: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    includeDeviceName: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    socketPath: string;
    dataFormat: "json" | "csv";
    delimiter: string;
    includeTimestamp: boolean;
    includeDeviceName: boolean;
}, {
    socketPath: string;
    dataFormat?: "json" | "csv" | undefined;
    delimiter?: string | undefined;
    includeTimestamp?: boolean | undefined;
    includeDeviceName?: boolean | undefined;
}>;
export type SocketOutput = z.infer<typeof SocketOutputSchema>;
/**
 * Modbus Adapter Configuration Schema
 */
export declare const ModbusAdapterConfigSchema: z.ZodObject<{
    devices: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        slaveId: z.ZodNumber;
        connection: z.ZodEffects<z.ZodObject<{
            type: z.ZodNativeEnum<typeof ModbusConnectionType>;
            host: z.ZodOptional<z.ZodString>;
            port: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
            serialPort: z.ZodOptional<z.ZodString>;
            baudRate: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
            dataBits: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
            stopBits: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
            parity: z.ZodDefault<z.ZodOptional<z.ZodEnum<["none", "even", "odd"]>>>;
            timeout: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
            retryAttempts: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
            retryDelay: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        }, "strip", z.ZodTypeAny, {
            type: ModbusConnectionType;
            port: number;
            baudRate: number;
            dataBits: number;
            stopBits: number;
            parity: "none" | "even" | "odd";
            timeout: number;
            retryAttempts: number;
            retryDelay: number;
            host?: string | undefined;
            serialPort?: string | undefined;
        }, {
            type: ModbusConnectionType;
            host?: string | undefined;
            port?: number | undefined;
            serialPort?: string | undefined;
            baudRate?: number | undefined;
            dataBits?: number | undefined;
            stopBits?: number | undefined;
            parity?: "none" | "even" | "odd" | undefined;
            timeout?: number | undefined;
            retryAttempts?: number | undefined;
            retryDelay?: number | undefined;
        }>, {
            type: ModbusConnectionType;
            port: number;
            baudRate: number;
            dataBits: number;
            stopBits: number;
            parity: "none" | "even" | "odd";
            timeout: number;
            retryAttempts: number;
            retryDelay: number;
            host?: string | undefined;
            serialPort?: string | undefined;
        }, {
            type: ModbusConnectionType;
            host?: string | undefined;
            port?: number | undefined;
            serialPort?: string | undefined;
            baudRate?: number | undefined;
            dataBits?: number | undefined;
            stopBits?: number | undefined;
            parity?: "none" | "even" | "odd" | undefined;
            timeout?: number | undefined;
            retryAttempts?: number | undefined;
            retryDelay?: number | undefined;
        }>;
        registers: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            address: z.ZodNumber;
            functionCode: z.ZodNativeEnum<typeof ModbusFunctionCode>;
            dataType: z.ZodNativeEnum<typeof ModbusDataType>;
            count: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
            endianness: z.ZodDefault<z.ZodOptional<z.ZodNativeEnum<typeof Endianness>>>;
            scale: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
            offset: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
            unit: z.ZodDefault<z.ZodOptional<z.ZodString>>;
            description: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            address: number;
            functionCode: ModbusFunctionCode;
            dataType: ModbusDataType;
            count: number;
            endianness: Endianness;
            scale: number;
            offset: number;
            unit: string;
            description: string;
        }, {
            name: string;
            address: number;
            functionCode: ModbusFunctionCode;
            dataType: ModbusDataType;
            count?: number | undefined;
            endianness?: Endianness | undefined;
            scale?: number | undefined;
            offset?: number | undefined;
            unit?: string | undefined;
            description?: string | undefined;
        }>, "many">;
        pollInterval: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
        enabled: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    }, "strip", z.ZodTypeAny, {
        name: string;
        slaveId: number;
        connection: {
            type: ModbusConnectionType;
            port: number;
            baudRate: number;
            dataBits: number;
            stopBits: number;
            parity: "none" | "even" | "odd";
            timeout: number;
            retryAttempts: number;
            retryDelay: number;
            host?: string | undefined;
            serialPort?: string | undefined;
        };
        registers: {
            name: string;
            address: number;
            functionCode: ModbusFunctionCode;
            dataType: ModbusDataType;
            count: number;
            endianness: Endianness;
            scale: number;
            offset: number;
            unit: string;
            description: string;
        }[];
        pollInterval: number;
        enabled: boolean;
    }, {
        name: string;
        slaveId: number;
        connection: {
            type: ModbusConnectionType;
            host?: string | undefined;
            port?: number | undefined;
            serialPort?: string | undefined;
            baudRate?: number | undefined;
            dataBits?: number | undefined;
            stopBits?: number | undefined;
            parity?: "none" | "even" | "odd" | undefined;
            timeout?: number | undefined;
            retryAttempts?: number | undefined;
            retryDelay?: number | undefined;
        };
        registers: {
            name: string;
            address: number;
            functionCode: ModbusFunctionCode;
            dataType: ModbusDataType;
            count?: number | undefined;
            endianness?: Endianness | undefined;
            scale?: number | undefined;
            offset?: number | undefined;
            unit?: string | undefined;
            description?: string | undefined;
        }[];
        pollInterval?: number | undefined;
        enabled?: boolean | undefined;
    }>, "many">;
    output: z.ZodObject<{
        socketPath: z.ZodString;
        dataFormat: z.ZodDefault<z.ZodOptional<z.ZodEnum<["json", "csv"]>>>;
        delimiter: z.ZodDefault<z.ZodOptional<z.ZodString>>;
        includeTimestamp: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        includeDeviceName: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
    }, "strip", z.ZodTypeAny, {
        socketPath: string;
        dataFormat: "json" | "csv";
        delimiter: string;
        includeTimestamp: boolean;
        includeDeviceName: boolean;
    }, {
        socketPath: string;
        dataFormat?: "json" | "csv" | undefined;
        delimiter?: string | undefined;
        includeTimestamp?: boolean | undefined;
        includeDeviceName?: boolean | undefined;
    }>;
    logging: z.ZodDefault<z.ZodOptional<z.ZodObject<{
        level: z.ZodDefault<z.ZodOptional<z.ZodEnum<["debug", "info", "warn", "error"]>>>;
        enableConsole: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        enableFile: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
        filePath: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        level: "debug" | "info" | "warn" | "error";
        enableConsole: boolean;
        enableFile: boolean;
        filePath?: string | undefined;
    }, {
        level?: "debug" | "info" | "warn" | "error" | undefined;
        enableConsole?: boolean | undefined;
        enableFile?: boolean | undefined;
        filePath?: string | undefined;
    }>>>;
}, "strip", z.ZodTypeAny, {
    devices: {
        name: string;
        slaveId: number;
        connection: {
            type: ModbusConnectionType;
            port: number;
            baudRate: number;
            dataBits: number;
            stopBits: number;
            parity: "none" | "even" | "odd";
            timeout: number;
            retryAttempts: number;
            retryDelay: number;
            host?: string | undefined;
            serialPort?: string | undefined;
        };
        registers: {
            name: string;
            address: number;
            functionCode: ModbusFunctionCode;
            dataType: ModbusDataType;
            count: number;
            endianness: Endianness;
            scale: number;
            offset: number;
            unit: string;
            description: string;
        }[];
        pollInterval: number;
        enabled: boolean;
    }[];
    output: {
        socketPath: string;
        dataFormat: "json" | "csv";
        delimiter: string;
        includeTimestamp: boolean;
        includeDeviceName: boolean;
    };
    logging: {
        level: "debug" | "info" | "warn" | "error";
        enableConsole: boolean;
        enableFile: boolean;
        filePath?: string | undefined;
    };
}, {
    devices: {
        name: string;
        slaveId: number;
        connection: {
            type: ModbusConnectionType;
            host?: string | undefined;
            port?: number | undefined;
            serialPort?: string | undefined;
            baudRate?: number | undefined;
            dataBits?: number | undefined;
            stopBits?: number | undefined;
            parity?: "none" | "even" | "odd" | undefined;
            timeout?: number | undefined;
            retryAttempts?: number | undefined;
            retryDelay?: number | undefined;
        };
        registers: {
            name: string;
            address: number;
            functionCode: ModbusFunctionCode;
            dataType: ModbusDataType;
            count?: number | undefined;
            endianness?: Endianness | undefined;
            scale?: number | undefined;
            offset?: number | undefined;
            unit?: string | undefined;
            description?: string | undefined;
        }[];
        pollInterval?: number | undefined;
        enabled?: boolean | undefined;
    }[];
    output: {
        socketPath: string;
        dataFormat?: "json" | "csv" | undefined;
        delimiter?: string | undefined;
        includeTimestamp?: boolean | undefined;
        includeDeviceName?: boolean | undefined;
    };
    logging?: {
        level?: "debug" | "info" | "warn" | "error" | undefined;
        enableConsole?: boolean | undefined;
        enableFile?: boolean | undefined;
        filePath?: string | undefined;
    } | undefined;
}>;
export type ModbusAdapterConfig = z.infer<typeof ModbusAdapterConfigSchema>;
/**
 * Sensor Data Point interface
 */
export interface SensorDataPoint {
    deviceName: string;
    registerName: string;
    value: number | boolean | string;
    unit: string;
    timestamp: string;
    quality: 'good' | 'bad' | 'uncertain';
}
/**
 * Device Status interface
 */
export interface DeviceStatus {
    deviceName: string;
    connected: boolean;
    lastPoll: Date | null;
    errorCount: number;
    lastError: string | null;
}
/**
 * Logger interface
 */
export interface Logger {
    debug(message: string, ...args: any[]): void;
    info(message: string, ...args: any[]): void;
    warn(message: string, ...args: any[]): void;
    error(message: string, ...args: any[]): void;
}
//# sourceMappingURL=types.d.ts.map