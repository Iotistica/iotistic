const mqtt = require('mqtt')
let mqttClient

async function setupMqtt (RED, accountId, broker) {
    const deviceStatusTopic = `iot/v1/${accountId}/d/+/live/status`
    // TODO: remove!!!! using docker container for local testing
    broker.url = 'mqtt://mosquitto:1883'
    mqttClient = mqtt.connect(broker.url, {
        clientId: broker.username,
        username: broker.username,
        password: broker.password
    })

    mqttClient.on('connect', (connack) => {
        console.log('Device manager connecting to broker')
        mqttClient.subscribe(deviceStatusTopic, (err) => {
            if (err) {
                console.log(`Device manager failed to subscribe to ${deviceStatusTopic}`)
            } else {
                console.log(`Device manager subscribed to ${deviceStatusTopic}`)
            }
        })
    })

    mqttClient.on('message', (topic, payload) => {
        const deviceId = topic.split('/')[4]
        if (topic.endsWith('/status')) {
            const statusUpdate = JSON.parse(payload.toString())
            console.log(statusUpdate)
            RED.comms.publish('notification/device-status-update', {
                device: deviceId,
                payload: statusUpdate
            })
        }
    })

    mqttClient.on('error', (err) => {
        console.error('MQTT Error:', err.message)
    })
}
function publishDeviceCommand (data) {
    console.log(`Sending command: ${data.command} for device: ${data.deviceId}`)
    const topic = `/device/${data.deviceId}/command`
    const payload = JSON.stringify(data)

    mqttClient.publish(topic, payload)
}

module.exports = {
    setupMqtt,
    getMqttClient: () => mqttClient, // Use a getter to safely access mqttClient
    publishDeviceCommand
}
