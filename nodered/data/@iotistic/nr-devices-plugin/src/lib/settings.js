// Settings object populated from Node-RED's global settings on init()
// All values come from Node-RED settings.js
const settings = {}

function init (RED) {
    // Initialize iotisticURL from Node-RED's global settings
    if (RED.settings && RED.settings.iotisticURL) {
        settings.iotisticURL = RED.settings.iotisticURL
        console.log('[nr-devices-plugin] Initialized iotisticURL from settings:', settings.iotisticURL)
    } else {
        console.warn('[nr-devices-plugin] No iotisticURL found in Node-RED settings')
    }

    // Initialize MQTT broker URL from Node-RED's global settings
    if (RED.settings && RED.settings.mqttBroker) {
        settings.mqttBroker = RED.settings.mqttBroker
        console.log('[nr-devices-plugin] Initialized mqttBroker from settings:', settings.mqttBroker)
    } else {
        console.warn('[nr-devices-plugin] No mqttBroker found in Node-RED settings, using default: mqtt://mosquitto:1883')
        settings.mqttBroker = 'mqtt://mosquitto:1883'
    }

    // Initialize MQTT credentials from Node-RED's global settings
    if (RED.settings && RED.settings.mqttUsername) {
        settings.mqttUsername = RED.settings.mqttUsername
        console.log('[nr-devices-plugin] Initialized mqttUsername from settings:', settings.mqttUsername)
    }
    
    if (RED.settings && RED.settings.mqttPassword) {
        settings.mqttPassword = RED.settings.mqttPassword
        console.log('[nr-devices-plugin] Initialized mqttPassword from settings: ****')
    }
}

const get = key => settings[key]
const set = (key, value) => {
    if (key === 'iotisticURL') {
        if (value && !/^https?:\/\//i.test(value)) {
            value = `https://${value}`
        }
    }
    settings[key] = value
}
const exportPublicSettings = () => { return { ...settings } }
module.exports = {
    init,
    get,
    set,
    exportPublicSettings
}
