const { MqttNode } = require('./mqtt')

function setupRoutes (RED) {
    // Check connection status
    RED.httpAdmin.get('/broker/status', (req, res) => {
        res.json({ connected: this.connected })
    })

    // Publish a message
    RED.httpAdmin.post('/broker/publish', (req, res) => {
        const { topic, payload } = req.body
        this.publish(topic, payload)
        res.json({ success: true })
    })

    // List registered nodes
    RED.httpAdmin.get('/broker/nodes', (req, res) => {
        const nodeIds = Object.keys(this.users)
        res.json({ nodes: nodeIds })
    })

    // Register a new node dynamically via HTTP
    RED.httpAdmin.post('/broker/register', (req, res) => {
        const { id, subscriptions } = req.body

        if (!id || !Array.isArray(subscriptions)) {
            return res.status(400).json({ error: 'Missing or invalid node id or subscriptions' })
        }

        const node = new MqttNode(id, subscriptions)
        this.register(node)
        res.json({ success: true, registered: id })
    })
}

module.exports = {
    setupRoutes
}
