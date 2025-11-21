const settings = require('./settings')
const api = require('./api')

module.exports = (RED) => {
    RED.plugins.registerPlugin('iotistic-nr-tools', {
        settings: {
            '*': { exportable: true }
        },
        onadd: function () {
            settings.init(RED)
            api.setupRoutes(RED)
            
            // Note: Device flow extraction now happens in cloud API
            // when flows are saved via storage API

            // This is a bit of a hack, but it lets the plugin know when the
            // comms connection has been established - such as after a runtime
            // restart

            RED.comms.publish('nr-tools/connected', true, true)
        }
    })
}
