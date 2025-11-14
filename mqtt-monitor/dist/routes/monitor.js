"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setMonitorInstance = setMonitorInstance;
const express_1 = require("express");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
let monitor = null;
let mqttDbService = null;
function setMonitorInstance(monitorInstance, dbService = null) {
    monitor = monitorInstance;
    mqttDbService = dbService;
    logger_1.logger.info('Monitor instance injected into routes');
}
router.get('/status', (req, res) => {
    try {
        if (!monitor) {
            return res.json({
                success: true,
                data: {
                    connected: false,
                    message: 'Monitor not initialized'
                }
            });
        }
        const status = monitor.getStatus();
        res.json({
            success: true,
            data: status
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting status', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
router.post('/start', async (req, res) => {
    try {
        if (!monitor) {
            return res.status(400).json({
                success: false,
                error: 'Monitor not initialized'
            });
        }
        await monitor.start();
        logger_1.logger.info('MQTT monitor started via API');
        res.json({
            success: true,
            message: 'MQTT monitor started'
        });
    }
    catch (error) {
        logger_1.logger.error('Error starting monitor', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
router.post('/stop', async (req, res) => {
    try {
        if (!monitor) {
            return res.status(400).json({
                success: false,
                error: 'Monitor not running'
            });
        }
        await monitor.stop();
        logger_1.logger.info('MQTT monitor stopped via API');
        res.json({
            success: true,
            message: 'MQTT monitor stopped'
        });
    }
    catch (error) {
        logger_1.logger.error('Error stopping monitor', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
router.get('/topic-tree', (req, res) => {
    try {
        if (!monitor) {
            return res.status(400).json({
                success: false,
                error: 'Monitor not running'
            });
        }
        const topicTree = monitor.getTopicTree();
        res.json({
            success: true,
            data: topicTree
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting topic tree', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
router.get('/topics', (req, res) => {
    try {
        if (!monitor) {
            return res.status(400).json({
                success: false,
                error: 'Monitor not running'
            });
        }
        const timeWindow = req.query.timeWindow;
        const minutesParam = req.query.minutes;
        let filterTimestamp = null;
        if (timeWindow) {
            const now = Date.now();
            switch (timeWindow) {
                case '1h':
                    filterTimestamp = now - (60 * 60 * 1000);
                    break;
                case '6h':
                    filterTimestamp = now - (6 * 60 * 60 * 1000);
                    break;
                case '24h':
                    filterTimestamp = now - (24 * 60 * 60 * 1000);
                    break;
                case '7d':
                    filterTimestamp = now - (7 * 24 * 60 * 60 * 1000);
                    break;
                case '30d':
                    filterTimestamp = now - (30 * 24 * 60 * 60 * 1000);
                    break;
                case 'all':
                default:
                    filterTimestamp = null;
                    break;
            }
        }
        else if (minutesParam) {
            const minutes = parseInt(minutesParam, 10);
            if (!isNaN(minutes) && minutes > 0) {
                filterTimestamp = Date.now() - (minutes * 60 * 1000);
            }
        }
        const topics = monitor.getFlattenedTopics(filterTimestamp);
        res.json({
            success: true,
            count: topics.length,
            data: topics,
            timeWindow: timeWindow || (minutesParam ? `${minutesParam}m` : 'all'),
            filteredFrom: filterTimestamp ? new Date(filterTimestamp).toISOString() : null
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting topics', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
router.get('/topics/:topic(*)/schema', (req, res) => {
    try {
        if (!monitor) {
            return res.status(400).json({
                success: false,
                error: 'Monitor not running'
            });
        }
        const topic = req.params.topic;
        const schemaData = monitor.getTopicSchema(topic);
        if (!schemaData) {
            return res.status(404).json({
                success: false,
                error: 'Topic not found or no schema available'
            });
        }
        res.json({
            success: true,
            data: {
                topic,
                ...schemaData
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting topic schema', { error: error.message, topic: req.params.topic });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
router.get('/metrics', (req, res) => {
    try {
        if (!monitor) {
            return res.status(400).json({
                success: false,
                error: 'Monitor not running'
            });
        }
        const metrics = monitor.getMetrics();
        res.json({
            success: true,
            data: {
                messageRate: metrics.messageRate,
                throughput: metrics.throughput,
                clients: metrics.clients,
                subscriptions: metrics.subscriptions,
                retainedMessages: metrics.retainedMessages,
                totalMessages: {
                    sent: metrics.totalMessagesSent,
                    received: metrics.totalMessagesReceived
                },
                timestamp: metrics.timestamp
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting metrics', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
router.get('/system-stats', (req, res) => {
    try {
        if (!monitor) {
            return res.status(400).json({
                success: false,
                error: 'Monitor not running'
            });
        }
        const systemStats = monitor.getSystemStats();
        res.json({
            success: true,
            data: systemStats
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting system stats', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
router.get('/stats', (req, res) => {
    try {
        if (!monitor) {
            return res.status(400).json({
                success: false,
                error: 'Monitor not running'
            });
        }
        const status = monitor.getStatus();
        const metrics = monitor.getMetrics();
        const systemStats = monitor.getSystemStats();
        const topics = monitor.getFlattenedTopics();
        const topicsWithSchemas = topics.filter(t => t.schema).length;
        const messageTypeBreakdown = topics.reduce((acc, t) => {
            if (t.messageType) {
                acc[t.messageType] = (acc[t.messageType] || 0) + 1;
            }
            return acc;
        }, {});
        res.json({
            success: true,
            stats: {
                connected: status.connected,
                topicCount: status.topicCount,
                messageCount: status.messageCount,
                schemas: {
                    total: topicsWithSchemas,
                    byType: messageTypeBreakdown
                },
                messageRate: {
                    published: metrics.messageRate.current.published,
                    received: metrics.messageRate.current.received
                },
                throughput: {
                    inbound: metrics.throughput.current.inbound,
                    outbound: metrics.throughput.current.outbound
                },
                clients: metrics.clients,
                subscriptions: metrics.subscriptions,
                retainedMessages: metrics.retainedMessages,
                totalMessagesSent: metrics.totalMessagesSent,
                totalMessagesReceived: metrics.totalMessagesReceived,
                broker: systemStats.$SYS?.broker || null
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting comprehensive stats', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
router.get('/dashboard', (req, res) => {
    try {
        if (!monitor) {
            return res.status(400).json({
                success: false,
                error: 'Monitor not running'
            });
        }
        const status = monitor.getStatus();
        const topicTree = monitor.getTopicTree();
        const topics = monitor.getFlattenedTopics();
        const metrics = monitor.getMetrics();
        const topicsWithSchemas = topics.filter(t => t.schema).length;
        res.json({
            success: true,
            data: {
                status,
                topicTree,
                topics: {
                    count: topics.length,
                    withSchemas: topicsWithSchemas,
                    list: topics.slice(0, 100)
                },
                metrics: {
                    messageRate: metrics.messageRate,
                    throughput: metrics.throughput,
                    clients: metrics.clients,
                    subscriptions: metrics.subscriptions,
                    retainedMessages: metrics.retainedMessages,
                    totalMessages: {
                        sent: metrics.totalMessagesSent,
                        received: metrics.totalMessagesReceived
                    }
                },
                timestamp: Date.now()
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting dashboard data', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
router.post('/sync', async (req, res) => {
    try {
        if (!monitor) {
            return res.status(400).json({
                success: false,
                error: 'Monitor not running'
            });
        }
        await monitor.flushToDatabase();
        logger_1.logger.info('Manual database sync triggered');
        res.json({
            success: true,
            message: 'Data synced to database'
        });
    }
    catch (error) {
        logger_1.logger.error('Error syncing to database', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
router.get('/database/topics', async (req, res) => {
    try {
        if (!mqttDbService) {
            return res.status(400).json({
                success: false,
                error: 'Database persistence not enabled'
            });
        }
        const limit = req.query.limit ? parseInt(req.query.limit) : 100;
        const messageType = req.query.messageType;
        const hasSchema = req.query.hasSchema ? req.query.hasSchema === 'true' : undefined;
        const topics = await mqttDbService.getTopics({
            limit,
            messageType,
            hasSchema
        });
        res.json({
            success: true,
            count: topics.length,
            data: topics
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting database topics', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
router.get('/database/stats/summary', async (req, res) => {
    try {
        if (!mqttDbService) {
            return res.status(400).json({
                success: false,
                error: 'Database persistence not enabled'
            });
        }
        const summary = await mqttDbService.getStatsSummary();
        res.json({
            success: true,
            data: summary
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting stats summary', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
router.get('/database/schema-history/:topic(*)', async (req, res) => {
    try {
        if (!mqttDbService) {
            return res.status(400).json({
                success: false,
                error: 'Database persistence not enabled'
            });
        }
        const topic = req.params.topic;
        const history = await mqttDbService.getSchemaHistory(topic);
        res.json({
            success: true,
            topic,
            count: history.length,
            data: history
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting schema history', { error: error.message, topic: req.params.topic });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
router.get('/recent-activity', async (req, res) => {
    try {
        if (!mqttDbService) {
            return res.status(400).json({
                success: false,
                error: 'Database persistence not enabled'
            });
        }
        const windowMinutes = req.query.window ? parseInt(req.query.window) : 15;
        if (![5, 15, 30, 60].includes(windowMinutes)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid window parameter. Must be one of: 5, 15, 30, 60'
            });
        }
        const recentActivity = await mqttDbService.getRecentMessageCounts(windowMinutes);
        res.json({
            success: true,
            windowMinutes,
            count: recentActivity.length,
            data: recentActivity
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting recent activity', { error: error.message });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
router.get('/topics/:topic(*)/recent-activity', async (req, res) => {
    try {
        if (!mqttDbService) {
            return res.status(400).json({
                success: false,
                error: 'Database persistence not enabled'
            });
        }
        const topic = req.params.topic;
        const windowMinutes = req.query.window ? parseInt(req.query.window) : 15;
        const activity = await mqttDbService.getTopicRecentActivity(topic, windowMinutes);
        if (!activity) {
            return res.status(404).json({
                success: false,
                error: 'No recent activity found for this topic'
            });
        }
        res.json({
            success: true,
            data: activity
        });
    }
    catch (error) {
        logger_1.logger.error('Error getting topic recent activity', { error: error.message, topic: req.params.topic });
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
exports.default = router;
//# sourceMappingURL=monitor.js.map