const { setupAuthRoutes } = require('./httpAuthMiddleware')

module.exports = (RED) => {
    RED.plugins.registerPlugin('iot-auth-plugin', {
        onadd: () => {
            // const authOptions = RED.settings?.iotAuth || {}
            // RED.httpNode.use(init(authOptions))
            setupAuthRoutes(RED.httpNode)
        }
    })
}
