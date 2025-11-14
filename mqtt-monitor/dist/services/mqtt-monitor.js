"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MQTTMonitorService = void 0;
const mqtt_1 = __importDefault(require("mqtt"));
const events_1 = require("events");
const is_utf8_1 = __importDefault(require("is-utf8"));
const mqtt_database_service_1 = require("./mqtt-database-service");
const logger_1 = __importDefault(require("../utils/logger"));
const METRICS_UPDATE_INTERVAL = parseInt(process.env.MQTT_METRICS_UPDATE_INTERVAL || '5000');
const TOPIC_TREE_UPDATE_INTERVAL = parseInt(process.env.MQTT_TOPIC_TREE_UPDATE_INTERVAL || '5000');
class SchemaGenerator {
    static getObjectType(obj) {
        let type = typeof obj;
        if (type === 'object') {
            if (Array.isArray(obj)) {
                type = 'array';
            }
            else if (obj === null) {
                type = 'null';
            }
        }
        return type;
    }
    static handleArray(obj) {
        const schema = { type: 'array' };
        if (obj.length === 0)
            return schema;
        let arrayType;
        let multipleTypes = false;
        let itemsSchema;
        for (let i = 0; i < obj.length; i++) {
            const elementSchema = this.generateSchema(obj[i]);
            const elementType = elementSchema.type;
            if (i > 0 && elementType !== arrayType) {
                multipleTypes = true;
                break;
            }
            else {
                arrayType = elementType;
                if (elementType === 'object') {
                    if (!itemsSchema) {
                        itemsSchema = elementSchema;
                    }
                    else {
                        const keys = Object.keys(elementSchema.properties || {});
                        keys.forEach(key => {
                            if (!itemsSchema.properties[key]) {
                                itemsSchema.properties[key] = elementSchema.properties[key];
                            }
                        });
                    }
                }
                else {
                    itemsSchema = this.generateSchema(obj[i]);
                }
            }
        }
        if (!multipleTypes && arrayType) {
            schema.items = itemsSchema;
        }
        return schema;
    }
    static handleObject(obj) {
        const schema = {
            type: 'object',
            properties: {}
        };
        for (const [key, value] of Object.entries(obj)) {
            schema.properties[key] = this.generateSchema(value);
        }
        return schema;
    }
    static generateSchema(obj) {
        const type = this.getObjectType(obj);
        switch (type) {
            case 'object':
                return this.handleObject(obj);
            case 'array':
                return this.handleArray(obj);
            default:
                return { type };
        }
    }
}
class MQTTMonitorService extends events_1.EventEmitter {
    client = null;
    options;
    connected = false;
    stopped = true;
    dbService;
    topicTree;
    topicTreeUpdateInterval;
    lastTopicTreeUpdate = 0;
    systemStats;
    metricsUpdateInterval;
    dbSyncInterval;
    metrics;
    lastMetricsSnapshot = {
        messagesSent: 0,
        messagesReceived: 0,
        bytesSent: 0,
        bytesReceived: 0,
        timestamp: Date.now()
    };
    pendingTopicUpdates = new Set();
    constructor(options, dbService) {
        super();
        this.options = {
            topicTreeEnabled: true,
            metricsEnabled: true,
            schemaGenerationEnabled: true,
            persistToDatabase: false,
            dbSyncInterval: 30000,
            ...options
        };
        this.dbService = dbService;
        this.topicTree = {
            _name: 'root',
            _topic: '',
            _created: Date.now(),
            _messagesCounter: 0,
            _topicsCounter: 0
        };
        this.systemStats = {
            _name: 'broker'
        };
        this.metrics = {
            messageRate: {
                published: Array(15).fill(0),
                received: Array(15).fill(0),
                current: { published: 0, received: 0 }
            },
            throughput: {
                inbound: Array(15).fill(0),
                outbound: Array(15).fill(0),
                current: { inbound: 0, outbound: 0 }
            },
            clients: 0,
            subscriptions: 0,
            retainedMessages: 0,
            totalMessagesSent: 0,
            totalMessagesReceived: 0,
            timestamp: Date.now()
        };
    }
    static async initialize(dbPool) {
        const brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883';
        const username = process.env.MQTT_USERNAME;
        const password = process.env.MQTT_PASSWORD;
        const persistToDatabase = process.env.MQTT_PERSIST_DB !== 'false';
        const dbSyncInterval = parseInt(process.env.MQTT_DB_SYNC_INTERVAL || '30000');
        let dbService = null;
        try {
            if (persistToDatabase) {
                dbService = new mqtt_database_service_1.MQTTDatabaseService(dbPool);
            }
            const monitor = new MQTTMonitorService({
                brokerUrl,
                username,
                password,
                topicTreeEnabled: true,
                metricsEnabled: true,
                schemaGenerationEnabled: true,
                persistToDatabase,
                dbSyncInterval,
            }, dbService);
            monitor.on('connected', () => {
                logger_1.default.info(`MQTT Monitor connected to broker at ${brokerUrl}`);
            });
            monitor.on('error', (error) => {
                logger_1.default.error('MQTT Monitor error', { error: error.message });
            });
            await monitor.start();
            logger_1.default.info('MQTT Monitor Service started');
            return { instance: monitor, dbService };
        }
        catch (err) {
            logger_1.default.error('Failed to start MQTT Monitor', { error: err.message || err });
            logger_1.default.info('Retrying initialization every 15s...');
            this.retryInitialization(dbPool);
            return { instance: null, dbService };
        }
    }
    static retryInitialization(dbPool, intervalMs = 15000) {
        const timer = setInterval(async () => {
            try {
                const { instance } = await this.initialize(dbPool);
                if (instance) {
                    logger_1.default.info('MQTT reconnected successfully');
                    clearInterval(timer);
                }
            }
            catch (err) {
                logger_1.default.warn(`MQTT still unavailable (${err?.message || err})`);
            }
        }, intervalMs);
    }
    async start() {
        if (this.client) {
            await this.stop();
        }
        this.stopped = false;
        if (this.options.persistToDatabase && this.dbService) {
            await this.loadStateFromDatabase();
        }
        await this.connect();
        if (this.options.persistToDatabase && this.dbService) {
            this.startDatabaseSync();
        }
    }
    async connect() {
        const mqttOptions = {
            clientId: this.options.clientId || `mqtt-monitor`,
            username: this.options.username,
            password: this.options.password,
            reconnectPeriod: 5000
        };
        logger_1.default.info(`Connecting to ${this.options.brokerUrl}...`);
        this.client = mqtt_1.default.connect(this.options.brokerUrl, mqttOptions);
        this.client.on('connect', () => {
            this.connected = true;
            logger_1.default.info(`Connected to ${this.options.brokerUrl}`);
            this.emit('connected');
            this.resetSessionCounters();
            if (this.options.topicTreeEnabled) {
                this.client.subscribe('#', (err) => {
                    if (err) {
                        logger_1.default.error('Failed to subscribe to all topics', { error: err.message });
                    }
                    else {
                        logger_1.default.info('Subscribed to all topics (#)');
                    }
                });
            }
            if (this.options.metricsEnabled) {
                this.client.subscribe('$SYS/#', (err) => {
                    if (err) {
                        logger_1.default.error('Failed to subscribe to $SYS topics', { error: err.message });
                    }
                    else {
                        logger_1.default.info('Subscribed to $SYS topics');
                    }
                });
            }
            this.startMetricsCalculation();
        });
        this.client.on('error', (error) => {
            logger_1.default.error('MQTT error', { error: error.message });
            this.emit('error', error);
        });
        this.client.on('close', () => {
            logger_1.default.info('Connection closed');
            this.connected = false;
        });
        this.client.on('message', (topic, payload, packet) => {
            if (topic.startsWith('$SYS/')) {
                this.updateSystemStats(topic, payload.toString());
                return;
            }
            if (this.options.topicTreeEnabled) {
                this.updateTopicTree(topic, payload, packet);
            }
        });
    }
    updateSystemStats(topic, message) {
        const parts = topic.split('/');
        let current = this.systemStats;
        parts.forEach((part, index) => {
            if (!current[part]) {
                current[part] = {};
            }
            if (index + 1 === parts.length) {
                current[part] = message;
            }
            current = current[part];
        });
        this.emit('system-stats-updated', this.systemStats);
    }
    updateTopicTree(topic, payload, packet) {
        const parts = topic.split('/');
        let current = this.topicTree;
        let newTopic = false;
        for (let index = 0; index < parts.length; index++) {
            const part = parts[index];
            const isLeaf = index === parts.length - 1;
            const topicPath = parts.slice(0, index + 1).join('/');
            if (!current[part]) {
                current[part] = {
                    _name: part,
                    _topic: topicPath,
                    _created: Date.now(),
                    _messagesCounter: 0,
                    _topicsCounter: 0
                };
                newTopic = true;
            }
            current[part]._lastModified = Date.now();
            if (isLeaf) {
                if (typeof current[part]._messagesCounter === 'number' &&
                    current[part]._messagesCounter >= 2147483640) {
                    logger_1.default.warn(`Overflow threshold reached for ${topicPath}. Resetting counter.`);
                    current[part]._messagesCounter = 0;
                }
                current[part]._messagesCounter = (current[part]._messagesCounter || 0) + 1;
                current[part]._sessionCounter = (current[part]._sessionCounter || 0) + 1;
                if (current[part]._messagesCounter > 1_000_000) {
                    logger_1.default.warn(`High message count for ${topicPath}`, { count: current[part]._messagesCounter });
                }
            }
            if (isLeaf) {
                const messageStr = payload.toString();
                current[part]._message = messageStr;
                current[part]._cmd = packet?.cmd;
                current[part]._dup = packet?.dup;
                current[part]._retain = packet?.retain;
                current[part]._qos = packet?.qos;
                if (this.options.schemaGenerationEnabled) {
                    if ((0, is_utf8_1.default)(payload)) {
                        if (messageStr.startsWith('<') && messageStr.endsWith('>')) {
                            current[part]._messageType = 'xml';
                        }
                        else {
                            try {
                                const json = JSON.parse(messageStr);
                                current[part]._messageType = 'json';
                                current[part]._schema = SchemaGenerator.generateSchema(json);
                            }
                            catch {
                                current[part]._messageType = 'string';
                            }
                        }
                    }
                    else {
                        current[part]._messageType = 'binary';
                    }
                }
            }
            current = current[part];
        }
        if (newTopic) {
            current = this.topicTree;
            for (let i = 0; i < parts.length - 1; i++) {
                const p = parts[i];
                if (current[p]) {
                    current[p]._topicsCounter = (current[p]._topicsCounter || 0) + 1;
                    current = current[p];
                }
                else {
                    break;
                }
            }
        }
        if (this.options.persistToDatabase && this.dbService) {
            this.pendingTopicUpdates.add(topic);
        }
        const now = Date.now();
        if (now - this.lastTopicTreeUpdate > TOPIC_TREE_UPDATE_INTERVAL) {
            this.lastTopicTreeUpdate = now;
            this.emit('topic-tree-updated', this.topicTree);
        }
    }
    startMetricsCalculation() {
        this.metricsUpdateInterval = setInterval(() => {
            this.calculateMetrics();
        }, METRICS_UPDATE_INTERVAL);
    }
    calculateMetrics() {
        const stats = this.systemStats.$SYS?.broker;
        if (!stats)
            return;
        const now = Date.now();
        const timeDelta = (now - this.lastMetricsSnapshot.timestamp) / 1000;
        const messagesSent = parseInt(stats.messages?.sent || '0');
        const messagesReceived = parseInt(stats.messages?.received || '0');
        const bytesSent15min = parseFloat(stats.load?.bytes?.sent?.['15min'] || '0');
        const bytesReceived15min = parseFloat(stats.load?.bytes?.received?.['15min'] || '0');
        const publishedRate = Math.max(0, (messagesSent - this.lastMetricsSnapshot.messagesSent) / timeDelta);
        const receivedRate = Math.max(0, (messagesReceived - this.lastMetricsSnapshot.messagesReceived) / timeDelta);
        this.metrics.messageRate.published.push(Math.round(publishedRate));
        if (this.metrics.messageRate.published.length > 15) {
            this.metrics.messageRate.published.shift();
        }
        this.metrics.messageRate.received.push(Math.round(receivedRate));
        if (this.metrics.messageRate.received.length > 15) {
            this.metrics.messageRate.received.shift();
        }
        this.metrics.messageRate.current = {
            published: Math.round(publishedRate),
            received: Math.round(receivedRate)
        };
        this.metrics.throughput.current = {
            outbound: Math.round(bytesSent15min / 1024),
            inbound: Math.round(bytesReceived15min / 1024)
        };
        this.metrics.throughput.outbound.push(this.metrics.throughput.current.outbound);
        if (this.metrics.throughput.outbound.length > 15) {
            this.metrics.throughput.outbound.shift();
        }
        this.metrics.throughput.inbound.push(this.metrics.throughput.current.inbound);
        if (this.metrics.throughput.inbound.length > 15) {
            this.metrics.throughput.inbound.shift();
        }
        this.metrics.clients = parseInt(stats.clients?.connected || '0');
        this.metrics.subscriptions = parseInt(stats.subscriptions?.count || '0');
        this.metrics.retainedMessages = parseInt(stats['retained messages']?.count || '0');
        this.metrics.totalMessagesSent = messagesSent;
        this.metrics.totalMessagesReceived = messagesReceived;
        this.metrics.timestamp = now;
        this.lastMetricsSnapshot = {
            messagesSent,
            messagesReceived,
            bytesSent: bytesSent15min,
            bytesReceived: bytesReceived15min,
            timestamp: now
        };
        this.emit('metrics-updated', this.metrics);
    }
    async stop() {
        this.stopped = true;
        if (this.options.persistToDatabase && this.dbService) {
            logger_1.default.info('Syncing to database before stop...');
            await this.syncToDatabase();
        }
        if (this.topicTreeUpdateInterval) {
            clearInterval(this.topicTreeUpdateInterval);
        }
        if (this.metricsUpdateInterval) {
            clearInterval(this.metricsUpdateInterval);
        }
        if (this.dbSyncInterval) {
            clearInterval(this.dbSyncInterval);
        }
        if (this.client) {
            this.client.end();
            this.client = null;
        }
        this.connected = false;
        logger_1.default.info('Stopped');
    }
    getTopicTree() {
        return this.topicTree;
    }
    getSystemStats() {
        return this.systemStats;
    }
    getMetrics() {
        return this.metrics;
    }
    getStatus() {
        return {
            connected: this.connected,
            topicCount: this.topicTree._topicsCounter,
            messageCount: this.topicTree._messagesCounter
        };
    }
    getFlattenedTopics(filterTimestamp) {
        const topics = [];
        const traverse = (node, parentPath = '') => {
            Object.keys(node).forEach(key => {
                if (key.startsWith('_'))
                    return;
                const child = node[key];
                const fullPath = parentPath ? `${parentPath}/${key}` : key;
                if (child._message !== undefined) {
                    const lastModified = child._lastModified || child._created;
                    if (filterTimestamp && lastModified && lastModified < filterTimestamp) {
                        return;
                    }
                    const topicData = {
                        topic: fullPath,
                        messageCount: child._messagesCounter,
                        sessionCount: child._sessionCounter || 0,
                        lastMessage: child._message,
                        lastModified: lastModified
                    };
                    if (child._messageType) {
                        topicData.messageType = child._messageType;
                    }
                    if (child._schema) {
                        topicData.schema = child._schema;
                    }
                    topics.push(topicData);
                }
                traverse(child, fullPath);
            });
        };
        traverse(this.topicTree);
        return topics;
    }
    getTopicSchema(topic) {
        const parts = topic.split('/');
        let current = this.topicTree;
        for (const part of parts) {
            if (!current[part]) {
                return null;
            }
            current = current[part];
        }
        if (current._schema || current._messageType) {
            return {
                schema: current._schema,
                messageType: current._messageType
            };
        }
        return null;
    }
    async loadStateFromDatabase() {
        if (!this.dbService)
            return;
        try {
            logger_1.default.info('Loading state from database...');
            const { topics, stats } = await this.dbService.loadInitialState();
            logger_1.default.info(`Loaded ${topics.length} topics from database`);
            for (const topic of topics) {
                const parts = topic.topic.split('/');
                let current = this.topicTree;
                parts.forEach((part, index) => {
                    if (!current[part]) {
                        current[part] = {
                            _name: part,
                            _topic: parts.slice(0, index + 1).join('/'),
                            _created: topic.firstSeen?.getTime() || Date.now(),
                            _messagesCounter: 0,
                            _topicsCounter: 0
                        };
                    }
                    if (index === parts.length - 1) {
                        current[part]._message = topic.lastMessage;
                        current[part]._messagesCounter = Number(topic.messageCount) || 0;
                        current[part]._messageType = topic.messageType;
                        current[part]._schema = topic.schema;
                        current[part]._qos = topic.qos;
                        current[part]._retain = topic.retain;
                        current[part]._lastModified = topic.lastSeen?.getTime();
                    }
                    current = current[part];
                });
            }
            if (stats) {
                this.lastMetricsSnapshot = {
                    messagesSent: stats.messagesSent || 0,
                    messagesReceived: stats.messagesReceived || 0,
                    bytesSent: stats.bytesSent || 0,
                    bytesReceived: stats.bytesReceived || 0,
                    timestamp: Date.now()
                };
            }
            logger_1.default.info('State loaded from database');
        }
        catch (error) {
            logger_1.default.error('Failed to load state from database', { error });
        }
    }
    resetSessionCounters() {
        const traverse = (node) => {
            Object.keys(node).forEach(key => {
                if (key.startsWith('_'))
                    return;
                const child = node[key];
                if (child._sessionCounter !== undefined) {
                    child._sessionCounter = 0;
                }
                traverse(child);
            });
        };
        traverse(this.topicTree);
        logger_1.default.info('Session counters reset');
    }
    startDatabaseSync() {
        if (this.dbSyncInterval) {
            clearInterval(this.dbSyncInterval);
        }
        this.dbSyncInterval = setInterval(() => {
            this.syncToDatabase();
        }, this.options.dbSyncInterval || 30000);
        console.log(`Database sync started (interval: ${this.options.dbSyncInterval}ms)`);
    }
    async syncToDatabase() {
        if (!this.dbService)
            return;
        try {
            const topicsToUpdate = Array.from(this.pendingTopicUpdates);
            const topicRecords = [];
            for (const topic of topicsToUpdate) {
                const parts = topic.split('/');
                let current = this.topicTree;
                for (const part of parts) {
                    if (!current[part])
                        break;
                    current = current[part];
                }
                if (current._message !== undefined) {
                    topicRecords.push({
                        topic,
                        messageType: current._messageType,
                        schema: current._schema,
                        lastMessage: current._message,
                        messageCount: current._messagesCounter || 1,
                        qos: current._qos,
                        retain: current._retain
                    });
                    if (current._schema) {
                        await this.dbService.saveSchemaHistory(topic, current._schema, current._message).catch((err) => logger_1.default.error('Failed to save schema history', { error: err.message }));
                    }
                }
            }
            if (topicRecords.length > 0) {
                await this.dbService.batchUpsertTopics(topicRecords);
                logger_1.default.info(`Synced ${topicRecords.length} topics to database`);
            }
            await this.dbService.saveBrokerStats({
                connectedClients: this.metrics.clients,
                subscriptions: this.metrics.subscriptions,
                retainedMessages: this.metrics.retainedMessages,
                messagesSent: this.metrics.totalMessagesSent,
                messagesReceived: this.metrics.totalMessagesReceived,
                messageRatePublished: this.metrics.messageRate.current.published,
                messageRateReceived: this.metrics.messageRate.current.received,
                throughputInbound: this.metrics.throughput.current.inbound,
                throughputOutbound: this.metrics.throughput.current.outbound,
                sysData: this.systemStats
            });
            for (const record of topicRecords) {
                await this.dbService.saveTopicMetrics({
                    topic: record.topic,
                    messageCount: record.messageCount,
                    bytesReceived: record.lastMessage ? Buffer.byteLength(record.lastMessage) : 0,
                    messageRate: 0,
                    avgMessageSize: record.lastMessage ? Buffer.byteLength(record.lastMessage) : undefined
                }).catch((err) => logger_1.default.error('Failed to save topic metrics', { error: err.message }));
            }
            this.pendingTopicUpdates.clear();
        }
        catch (error) {
            logger_1.default.error('Failed to sync to database', { error });
        }
    }
    async flushToDatabase() {
        if (!this.options.persistToDatabase || !this.dbService) {
            logger_1.default.warn('Database persistence not enabled');
            return;
        }
        await this.syncToDatabase();
    }
}
exports.MQTTMonitorService = MQTTMonitorService;
//# sourceMappingURL=mqtt-monitor.js.map