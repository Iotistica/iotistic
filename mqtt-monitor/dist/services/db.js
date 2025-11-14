"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MQTTDatabaseService = void 0;
const crypto_1 = __importDefault(require("crypto"));
class MQTTDatabaseService {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async upsertTopic(data) {
        const client = await this.pool.connect();
        try {
            await client.query(`INSERT INTO mqtt_topics (
          topic, message_type, schema, last_message, message_count, qos, retain
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (topic) 
        DO UPDATE SET
          message_type = COALESCE(EXCLUDED.message_type, mqtt_topics.message_type),
          schema = COALESCE(EXCLUDED.schema, mqtt_topics.schema),
          last_message = EXCLUDED.last_message,
          message_count = EXCLUDED.message_count,
          qos = COALESCE(EXCLUDED.qos, mqtt_topics.qos),
          retain = COALESCE(EXCLUDED.retain, mqtt_topics.retain),
          last_seen = NOW(),
          updated_at = NOW()`, [
                data.topic,
                data.messageType,
                data.schema ? JSON.stringify(data.schema) : null,
                data.lastMessage,
                data.messageCount || 1,
                data.qos,
                data.retain,
            ]);
        }
        finally {
            client.release();
        }
    }
    async batchUpsertTopics(topics) {
        if (topics.length === 0)
            return;
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            for (const topic of topics) {
                await client.query(`INSERT INTO mqtt_topics (
            topic, message_type, schema, last_message, message_count, qos, retain
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (topic) 
          DO UPDATE SET
            message_type = COALESCE(EXCLUDED.message_type, mqtt_topics.message_type),
            schema = COALESCE(EXCLUDED.schema, mqtt_topics.schema),
            last_message = EXCLUDED.last_message,
            message_count = EXCLUDED.message_count,
            qos = COALESCE(EXCLUDED.qos, mqtt_topics.qos),
            retain = COALESCE(EXCLUDED.retain, mqtt_topics.retain),
            last_seen = NOW(),
            updated_at = NOW()`, [
                    topic.topic,
                    topic.messageType,
                    topic.schema ? JSON.stringify(topic.schema) : null,
                    topic.lastMessage,
                    topic.messageCount || 1,
                    topic.qos,
                    topic.retain,
                ]);
            }
            await client.query('COMMIT');
        }
        catch (error) {
            await client.query('ROLLBACK');
            throw error;
        }
        finally {
            client.release();
        }
    }
    async getTopics(options) {
        let query = 'SELECT * FROM mqtt_topics WHERE 1=1';
        const params = [];
        let paramIndex = 1;
        if (options?.messageType) {
            query += ` AND message_type = $${paramIndex++}`;
            params.push(options.messageType);
        }
        if (options?.hasSchema !== undefined) {
            query += options.hasSchema
                ? ` AND schema IS NOT NULL`
                : ` AND schema IS NULL`;
        }
        query += ' ORDER BY last_seen DESC';
        if (options?.limit) {
            query += ` LIMIT $${paramIndex++}`;
            params.push(options.limit);
        }
        if (options?.offset) {
            query += ` OFFSET $${paramIndex++}`;
            params.push(options.offset);
        }
        const result = await this.pool.query(query, params);
        return result.rows.map(row => ({
            ...row,
            schema: row.schema,
            firstSeen: row.first_seen,
            lastSeen: row.last_seen,
            messageCount: row.message_count,
            messageType: row.message_type,
            lastMessage: row.last_message,
        }));
    }
    async getTopicByName(topic) {
        const result = await this.pool.query('SELECT * FROM mqtt_topics WHERE topic = $1', [topic]);
        if (result.rows.length === 0)
            return null;
        const row = result.rows[0];
        return {
            ...row,
            schema: row.schema,
            firstSeen: row.first_seen,
            lastSeen: row.last_seen,
            messageCount: row.message_count,
            messageType: row.message_type,
            lastMessage: row.last_message,
        };
    }
    async saveSchemaHistory(topic, schema, sampleMessage) {
        const schemaStr = JSON.stringify(schema);
        const schemaHash = crypto_1.default.createHash('md5').update(schemaStr).digest('hex');
        const existing = await this.pool.query('SELECT id FROM mqtt_schema_history WHERE topic = $1 AND schema_hash = $2', [topic, schemaHash]);
        if (existing.rows.length === 0) {
            await this.pool.query(`INSERT INTO mqtt_schema_history (topic, schema, schema_hash, sample_message)
         VALUES ($1, $2, $3, $4)`, [topic, schema, schemaHash, sampleMessage]);
        }
    }
    async getSchemaHistory(topic) {
        const result = await this.pool.query(`SELECT schema, detected_at, sample_message 
       FROM mqtt_schema_history 
       WHERE topic = $1 
       ORDER BY detected_at DESC`, [topic]);
        return result.rows.map(row => ({
            schema: row.schema,
            detectedAt: row.detected_at,
            sampleMessage: row.sample_message,
        }));
    }
    async saveBrokerStats(stats) {
        await this.pool.query(`INSERT INTO mqtt_broker_stats (
        connected_clients, disconnected_clients, total_clients, subscriptions, retained_messages,
        messages_sent, messages_received, messages_published, messages_dropped,
        bytes_sent, bytes_received,
        message_rate_published, message_rate_received,
        throughput_inbound, throughput_outbound,
        sys_data
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`, [
            stats.connectedClients,
            stats.disconnectedClients,
            stats.totalClients,
            stats.subscriptions,
            stats.retainedMessages,
            stats.messagesSent,
            stats.messagesReceived,
            stats.messagesPublished,
            stats.messagesDropped,
            stats.bytesSent,
            stats.bytesReceived,
            stats.messageRatePublished,
            stats.messageRateReceived,
            stats.throughputInbound,
            stats.throughputOutbound,
            stats.sysData ? JSON.stringify(stats.sysData) : null,
        ]);
    }
    async getLatestBrokerStats() {
        const result = await this.pool.query(`SELECT * FROM mqtt_broker_stats ORDER BY timestamp DESC LIMIT 1`);
        if (result.rows.length === 0)
            return null;
        const row = result.rows[0];
        return {
            connectedClients: row.connected_clients,
            disconnectedClients: row.disconnected_clients,
            totalClients: row.total_clients,
            subscriptions: row.subscriptions,
            retainedMessages: row.retained_messages,
            messagesSent: row.messages_sent,
            messagesReceived: row.messages_received,
            messagesPublished: row.messages_published,
            messagesDropped: row.messages_dropped,
            bytesSent: row.bytes_sent,
            bytesReceived: row.bytes_received,
            messageRatePublished: parseFloat(row.message_rate_published),
            messageRateReceived: parseFloat(row.message_rate_received),
            throughputInbound: parseFloat(row.throughput_inbound),
            throughputOutbound: parseFloat(row.throughput_outbound),
            sysData: row.sys_data,
        };
    }
    async getBrokerStatsHistory(hours = 24) {
        const result = await this.pool.query(`SELECT * FROM mqtt_broker_stats 
       WHERE timestamp > NOW() - INTERVAL '1 hour' * $1
       ORDER BY timestamp ASC`, [hours]);
        return result.rows.map(row => ({
            connectedClients: row.connected_clients,
            subscriptions: row.subscriptions,
            messageRatePublished: parseFloat(row.message_rate_published),
            messageRateReceived: parseFloat(row.message_rate_received),
            throughputInbound: parseFloat(row.throughput_inbound),
            throughputOutbound: parseFloat(row.throughput_outbound),
        }));
    }
    async saveTopicMetrics(metrics) {
        await this.pool.query(`INSERT INTO mqtt_topic_metrics (
        topic, message_count, bytes_received, message_rate, avg_message_size
      ) VALUES ($1, $2, $3, $4, $5)`, [
            metrics.topic,
            metrics.messageCount,
            metrics.bytesReceived,
            metrics.messageRate,
            metrics.avgMessageSize,
        ]);
    }
    async getStatsSummary() {
        const result = await this.pool.query(`
      SELECT 
        COUNT(*) as total_topics,
        COUNT(CASE WHEN schema IS NOT NULL THEN 1 END) as topics_with_schemas,
        COUNT(CASE WHEN message_type = 'json' THEN 1 END) as json_topics,
        COUNT(CASE WHEN message_type = 'xml' THEN 1 END) as xml_topics,
        COUNT(CASE WHEN message_type = 'string' THEN 1 END) as string_topics,
        COUNT(CASE WHEN message_type = 'binary' THEN 1 END) as binary_topics,
        SUM(message_count) as total_messages,
        MAX(last_seen) as last_activity
      FROM mqtt_topics
    `);
        return result.rows[0];
    }
    async getRecentMessageCounts(windowMinutes = 15) {
        const result = await this.pool.query(`
      WITH recent_metrics AS (
        SELECT 
          topic,
          message_count,
          timestamp,
          LAG(message_count) OVER (PARTITION BY topic ORDER BY timestamp) as prev_message_count,
          LAG(timestamp) OVER (PARTITION BY topic ORDER BY timestamp) as prev_timestamp
        FROM mqtt_topic_metrics
        WHERE timestamp >= NOW() - INTERVAL '${windowMinutes} minutes'
      ),
      topic_activity AS (
        SELECT 
          topic,
          MAX(message_count) - MIN(message_count) as message_count,
          MIN(timestamp) as oldest_timestamp,
          MAX(timestamp) as latest_timestamp,
          EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))) / 60.0 as actual_window_minutes
        FROM recent_metrics
        WHERE message_count IS NOT NULL
        GROUP BY topic
      )
      SELECT 
        topic,
        message_count,
        CASE 
          WHEN actual_window_minutes > 0 
          THEN ROUND((message_count / actual_window_minutes)::numeric, 2)
          ELSE 0
        END as message_rate,
        $1 as window_minutes,
        oldest_timestamp,
        latest_timestamp
      FROM topic_activity
      WHERE message_count > 0
      ORDER BY message_count DESC
    `, [windowMinutes]);
        return result.rows.map(row => ({
            topic: row.topic,
            messageCount: parseInt(row.message_count),
            messageRate: parseFloat(row.message_rate),
            windowMinutes: windowMinutes,
            oldestTimestamp: row.oldest_timestamp,
            latestTimestamp: row.latest_timestamp,
        }));
    }
    async getTopicRecentActivity(topic, windowMinutes = 15) {
        const result = await this.pool.query(`
      SELECT 
        topic,
        message_count,
        timestamp
      FROM mqtt_topic_metrics
      WHERE topic = $1 
        AND timestamp >= NOW() - INTERVAL '${windowMinutes} minutes'
      ORDER BY timestamp ASC
    `, [topic]);
        if (result.rows.length === 0) {
            return null;
        }
        const dataPoints = result.rows.map(row => ({
            timestamp: row.timestamp,
            count: parseInt(row.message_count),
        }));
        const oldestCount = dataPoints[0].count;
        const latestCount = dataPoints[dataPoints.length - 1].count;
        const messageCount = Math.max(0, latestCount - oldestCount);
        const messageRate = messageCount / windowMinutes;
        return {
            topic,
            messageCount,
            messageRate: Math.round(messageRate * 100) / 100,
            dataPoints,
        };
    }
    async loadInitialState() {
        const topics = await this.getTopics({ limit: 10000 });
        const stats = await this.getLatestBrokerStats();
        return { topics, stats };
    }
    async cleanupOldData(retentionDays = 30) {
        const result = await this.pool.query('SELECT cleanup_old_mqtt_metrics($1)', [retentionDays]);
        return result.rows[0].cleanup_old_mqtt_metrics;
    }
}
exports.MQTTDatabaseService = MQTTDatabaseService;
//# sourceMappingURL=db.js.map