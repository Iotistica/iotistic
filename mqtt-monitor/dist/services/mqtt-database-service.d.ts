import { Pool } from 'pg';
export interface MQTTTopicRecord {
    id?: number;
    topic: string;
    messageType?: 'json' | 'xml' | 'string' | 'binary';
    schema?: any;
    lastMessage?: string;
    messageCount: number;
    qos?: number;
    retain?: boolean;
    firstSeen?: Date;
    lastSeen?: Date;
}
export interface BrokerStatsRecord {
    connectedClients?: number;
    disconnectedClients?: number;
    totalClients?: number;
    subscriptions?: number;
    retainedMessages?: number;
    messagesSent?: number;
    messagesReceived?: number;
    messagesPublished?: number;
    messagesDropped?: number;
    bytesSent?: number;
    bytesReceived?: number;
    messageRatePublished?: number;
    messageRateReceived?: number;
    throughputInbound?: number;
    throughputOutbound?: number;
    sysData?: any;
}
export interface TopicMetrics {
    topic: string;
    messageCount: number;
    bytesReceived: number;
    messageRate?: number;
    avgMessageSize?: number;
}
export declare class MQTTDatabaseService {
    private pool;
    constructor(pool: Pool);
    upsertTopic(data: MQTTTopicRecord): Promise<void>;
    batchUpsertTopics(topics: MQTTTopicRecord[]): Promise<void>;
    getTopics(options?: {
        messageType?: string;
        hasSchema?: boolean;
        limit?: number;
        offset?: number;
    }): Promise<MQTTTopicRecord[]>;
    getTopicByName(topic: string): Promise<MQTTTopicRecord | null>;
    saveSchemaHistory(topic: string, schema: any, sampleMessage?: string): Promise<void>;
    getSchemaHistory(topic: string): Promise<any[]>;
    saveBrokerStats(stats: BrokerStatsRecord): Promise<void>;
    getLatestBrokerStats(): Promise<BrokerStatsRecord | null>;
    getBrokerStatsHistory(hours?: number): Promise<BrokerStatsRecord[]>;
    saveTopicMetrics(metrics: TopicMetrics): Promise<void>;
    getStatsSummary(): Promise<any>;
    getRecentMessageCounts(windowMinutes?: number): Promise<Array<{
        topic: string;
        messageCount: number;
        messageRate: number;
        windowMinutes: number;
        oldestTimestamp: Date;
        latestTimestamp: Date;
    }>>;
    getTopicRecentActivity(topic: string, windowMinutes?: number): Promise<{
        topic: string;
        messageCount: number;
        messageRate: number;
        dataPoints: Array<{
            timestamp: Date;
            count: number;
        }>;
    } | null>;
    loadInitialState(): Promise<{
        topics: MQTTTopicRecord[];
        stats: BrokerStatsRecord | null;
    }>;
    cleanupOldData(retentionDays?: number): Promise<number>;
}
//# sourceMappingURL=mqtt-database-service.d.ts.map