import { EventEmitter } from 'events';
import { MQTTDatabaseService } from './db';
interface JSONSchema {
    type: string;
    properties?: Record<string, any>;
    items?: any;
}
interface TopicNode {
    _name: string;
    _topic: string;
    _created: number;
    _lastModified?: number;
    _messagesCounter: number;
    _sessionCounter?: number;
    _topicsCounter: number;
    _message?: string;
    _messageType?: 'json' | 'xml' | 'string' | 'binary';
    _schema?: JSONSchema;
    _cmd?: string;
    _dup?: boolean;
    _retain?: boolean;
    _qos?: number;
    [key: string]: any;
}
interface BrokerStats {
    _name: string;
    $SYS?: {
        broker?: {
            messages?: {
                sent?: string;
                received?: string;
                stored?: string;
            };
            subscriptions?: {
                count?: string;
            };
            clients?: {
                connected?: string;
                total?: string;
                maximum?: string;
            };
            load?: {
                messages?: {
                    sent?: {
                        '1min'?: string;
                        '5min'?: string;
                        '15min'?: string;
                    };
                    received?: {
                        '1min'?: string;
                        '5min'?: string;
                        '15min'?: string;
                    };
                };
                bytes?: {
                    sent?: {
                        '1min'?: string;
                        '5min'?: string;
                        '15min'?: string;
                    };
                    received?: {
                        '1min'?: string;
                        '5min'?: string;
                        '15min'?: string;
                    };
                };
            };
            'retained messages'?: {
                count?: string;
            };
        };
    };
}
interface CalculatedMetrics {
    messageRate: {
        published: number[];
        received: number[];
        current: {
            published: number;
            received: number;
        };
    };
    throughput: {
        inbound: number[];
        outbound: number[];
        current: {
            inbound: number;
            outbound: number;
        };
    };
    clients: number;
    subscriptions: number;
    retainedMessages: number;
    totalMessagesSent: number;
    totalMessagesReceived: number;
    timestamp: number;
}
interface MonitorOptions {
    brokerUrl: string;
    username?: string;
    password?: string;
    clientId?: string;
    topicTreeEnabled?: boolean;
    metricsEnabled?: boolean;
    schemaGenerationEnabled?: boolean;
    persistToDatabase?: boolean;
    dbSyncInterval?: number;
}
export declare class MQTTMonitorService extends EventEmitter {
    private client;
    private options;
    private connected;
    private stopped;
    private dbService?;
    private topicTree;
    private topicTreeUpdateInterval?;
    private lastTopicTreeUpdate;
    private systemStats;
    private metricsUpdateInterval?;
    private dbSyncInterval?;
    private metrics;
    private lastMetricsSnapshot;
    private pendingTopicUpdates;
    constructor(options: MonitorOptions, dbService?: any);
    static initialize(dbPool: any): Promise<{
        instance: MQTTMonitorService;
        dbService: MQTTDatabaseService | null;
    }>;
    private static retryInitialization;
    start(): Promise<void>;
    private connect;
    private updateSystemStats;
    private updateTopicTree;
    private startMetricsCalculation;
    private calculateMetrics;
    stop(): Promise<void>;
    getTopicTree(): TopicNode;
    getSystemStats(): BrokerStats;
    getMetrics(): CalculatedMetrics;
    getStatus(): {
        connected: boolean;
        topicCount: number;
        messageCount: number;
    };
    getFlattenedTopics(filterTimestamp?: number | null): Array<{
        topic: string;
        messageCount: number;
        lastMessage?: string;
        messageType?: string;
        schema?: JSONSchema;
        lastModified?: number;
    }>;
    getTopicSchema(topic: string): {
        schema?: JSONSchema;
        messageType?: string;
    } | null;
    private loadStateFromDatabase;
    private resetSessionCounters;
    private startDatabaseSync;
    private syncToDatabase;
    flushToDatabase(): Promise<void>;
}
export {};
//# sourceMappingURL=monitor.d.ts.map