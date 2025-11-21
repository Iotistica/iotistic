const crypto = require('crypto')
const mqtt = require('mqtt')

// Shared MQTT client for flow manager
let sharedMqttClient = null;

function getSharedMqttClient(RED) {
    if (!sharedMqttClient || !sharedMqttClient.connected) {
        const mqttBroker = RED.settings.mqttBroker || 'mqtt://mosquitto:1883';
        const mqttUsername = RED.settings.mqttUsername;
        const mqttPassword = RED.settings.mqttPassword;

        const connectOptions = {
            clientId: `nodered-flow-manager`,
            clean: true,
            reconnectPeriod: 5000
        };

        if (mqttUsername && mqttPassword) {
            connectOptions.username = mqttUsername;
            connectOptions.password = mqttPassword;
        }

        sharedMqttClient = mqtt.connect(mqttBroker, connectOptions);
        
        sharedMqttClient.on('error', (err) => {
            RED.log.error(`Flow manager MQTT client error: ${err.message}`);
        });

        sharedMqttClient.on('connect', () => {
            RED.log.info('Flow manager MQTT client connected');
        });
    }
    return sharedMqttClient;
}

function setupFlowManager (RED) {
    const mqttClient = getSharedMqttClient(RED);

    const onFlowReload = (flowData) => {
        RED.log.info('Flow restart event detected')
        onFlowReloadHandler(flowData, mqttClient, RED)
    }

    RED.events.on('flows:started', onFlowReload)
    
    RED.log.info('Flow manager initialized with shared MQTT client')
}

// function extractSubflowNodes (subflow) {
//     return subflow.map(node => ({ type: node.type }))
// }

function generateHash (obj, excludeKeys = []) {
    const filteredObj = JSON.parse(
        JSON.stringify(obj, (key, value) =>
            excludeKeys.includes(key) ? undefined : value
        )
    )

    const hash = crypto.createHash('sha256')
    hash.update(JSON.stringify(filteredObj))
    return hash.digest('hex')
}

function selectSubflowWithNodes (array, parentId) {
    const parent = array.find((obj) => obj.id === parentId)
    if (!parent) return []

    const children = array.filter((obj) => obj.z === parentId)
    const cleanObjects = [parent, ...children]
    return cleanObjects
}

function onFlowReloadHandler (flowData, mqttClient, RED) {
    const subflows = []
    const subflowsWithNodes = []
    const currentSubflowHashes = {}
    const changedSubflows = []
    flowData.config.flows
        .filter(
            (flow) =>
                flow.type === 'subflow' &&
          flow.env?.some((envVar) => envVar.name === 'DeviceId' && envVar.value)
        )
        .forEach((subflow) => {
            subflows.push({ ...subflow })
            subflowsWithNodes.push({ ...subflow })

            const nodes = flowData.config.flows.filter(
                (node) => node.z === subflow.id
            )
            nodes.forEach((node) => {
                subflowsWithNodes.push({ ...node })
            })
        })

    subflows.forEach((flow) => {
        const subflowId = flow.id
        const subflow = selectSubflowWithNodes(subflowsWithNodes, subflowId)
        const currentHash = generateHash(subflow, [])
        currentSubflowHashes[subflowId] = currentHash
        changedSubflows.push(subflow)
    })

    RED.log.info(`Changed subflows: ${changedSubflows.length}`)

    changedSubflows.forEach((subflow) => {
        publishSubflows(subflow, mqttClient, RED)
    })
}

async function publishSubflows (subflow, mqttClient, RED) {
    const subflowEntry = subflow.find((item) => item.type === 'subflow')
    const deviceIdEntry = subflowEntry.env.find(
        (envVar) => envVar.name === 'DeviceId'
    )
    const deviceIds = JSON.parse(deviceIdEntry.value)

    for (const deviceId of deviceIds) {
        const topic = `iot/device/${deviceId}/subflow/snapshot`
        const payload = JSON.stringify({
            name: 'Auto snapshot',
            description: `Auto snapshot for device ${deviceId}`,
            flows: subflow,
            modules: null
        })
        mqttClient.publish(topic, payload, { retain: false }, (err) => {
            if (err) {
                RED.log.error(`Error publishing subflow for device ${deviceId}: ${err.message}`)
            } else {
                RED.log.info(`Published subflow snapshot for device ${deviceId}`)
            }
        })
    }
}

// async function getInstalledNodes () {
//     try {
//         const token = ''

//         const response = await axios.get('http://nodered:1880/nodes', {
//             headers: {
//                 Authorization: `Bearer ${token}`,
//                 Accept: 'application/json'
//             }
//         })
//         return response.data
//     } catch (error) {
//         console.error('Error fetching installed nodes:', error)
//         return []
//     }
// }

// async function getRequiredPackages (subflowNodes) {
//     const installedNodes = await getInstalledNodes()
//     const requiredPackages = new Set()

//     subflowNodes.forEach(node => {
//         const nodeInfo = installedNodes.find(installedNode =>
//             installedNode.types.includes(node.type)
//         )

//         if (nodeInfo) {
//             requiredPackages.add(nodeInfo)
//         } else {
//             console.log(`No package found for node type: ${node.type}`)
//         }
//     })

//     return Array.from(requiredPackages)
// }

module.exports = {
    setupFlowManager,
    onFlowReloadHandler
}
