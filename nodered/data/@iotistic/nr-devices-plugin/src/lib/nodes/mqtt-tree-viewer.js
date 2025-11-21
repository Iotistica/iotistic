module.exports = function (RED) {
    function MqttTreeViewerNode (config) {
        RED.nodes.createNode(this, config)
        const node = this

        node.deviceUuid = config.deviceUuid

        // Status
        node.status({ fill: 'green', shape: 'dot', text: 'active' })

        // Message counter
        let messageCount = 0

        // Handle incoming messages
        node.on('input', (msg) => {
            messageCount++
            node.status({ fill: 'green', shape: 'dot', text: `${messageCount} messages` })

            // Filter by device UUID if configured
            if (node.deviceUuid && msg.topic && !msg.topic.includes(node.deviceUuid)) {
                return
            }

            // Publish to all connected clients via websocket
            RED.comms.publish('mqtt-tree-viewer/' + node.id, {
                topic: msg.topic,
                payload: typeof msg.payload === 'string' ? msg.payload : JSON.stringify(msg.payload),
                timestamp: Date.now()
            })

            node.log(`Received message on topic: ${msg.topic}`)
        })

        node.on('close', () => {
            node.status({})
        })
    }

    RED.nodes.registerType('mqtt-tree-viewer', MqttTreeViewerNode)
}
