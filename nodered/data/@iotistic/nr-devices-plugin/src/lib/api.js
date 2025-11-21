const auth = require('./auth')
const settings = require('./settings')
const { ffGet, ffPost } = require('./client')
const comms = require('./comms')
const { getMqttManager, getMqttClient, MqttNode } = require('./comms/mqtt')

let mqttInitialized = false

function setupRoutes (RED) {
    auth.setupRoutes(RED)
    comms.setupRoutes(RED)

    RED.httpAdmin.get('/nr-tools/settings', async (request, response) => {
        const body = settings.exportPublicSettings()
        
        // Check if user is authenticated via nr-auth (adminAuth)
        let accessToken = null
        let authSource = null
        
        if (request.user && request.user.accessToken) {
            // User authenticated via nr-auth - use their token
            accessToken = request.user.accessToken
            authSource = 'nr-auth'
        } else {
            // Check plugin's own token storage
            const token = auth.getUserTokenForRequest(request)
            if (token && token.accessToken) {
                accessToken = token.accessToken
                authSource = 'plugin'
            }
        }
        
        if (!accessToken) {
            body.connected = false
            body.authSource = null
        } else {
            try {
                const response = await ffGet('/api/v1/auth/me', accessToken)
                if (response.code === 'unauthorized') {
                    if (authSource === 'plugin') {
                        auth.deleteUserTokenForRequest(request)
                    }
                    body.connected = false
                } else {
                    // API returns { data: { user: {...} } }
                    const userProfile = response.data?.user || response
                    body.connected = true
                    body.authSource = authSource
                    body.user = {
                        id: userProfile.id,
                        username: userProfile.username,
                        email: userProfile.email,
                        role: userProfile.role,
                        fullName: userProfile.fullName || userProfile.full_name,
                        name: userProfile.name || userProfile.fullName || userProfile.full_name,
                        avatar: userProfile.avatar || ''
                    }
                    if (userProfile.brokerClient && !mqttInitialized) {
                        // Setup shared MQTT connection pool
                        console.log('[nr-devices-plugin] Initializing MQTT connection pool')
                        const mqttManager = getMqttManager(RED, userProfile.brokerClient)
                        
                        // Register this plugin instance
                        const nodeId = 'nr-devices-plugin-main'
                        mqttManager.register(nodeId, { id: nodeId })
                        
                        // Subscribe to device state updates
                        const deviceStateTopic = 'iot/device/+/state/current'
                        mqttManager.subscribe(deviceStateTopic, (topic, message, packet) => {
                            try {
                                const payload = JSON.parse(message.toString())
                                console.log(`[nr-devices-plugin] Device state update on ${topic}:`, payload)
                                
                                // Publish to Node-RED comms for UI updates
                                const deviceId = topic.split('/')[2]
                                RED.comms.publish('notification/device-state-update', {
                                    device: deviceId,
                                    payload: payload
                                })
                            } catch (err) {
                                console.error('[nr-devices-plugin] Error parsing device state:', err)
                            }
                        }, nodeId, { qos: 1 })

                        mqttInitialized = true
                        console.log('[nr-devices-plugin] MQTT connection pool initialized')
                    }
                }
            } catch (err) {
                // Failed to get user profile
                console.error('Failed to get user profile:', err)
                body.connected = false
            }
        }
        response.send(body)
    })

    RED.httpAdmin.post('/nr-tools/settings/iotisticURL', async (request, response) => {
        try {
            const { iotisticURL } = request.body
            if (iotisticURL) {
                settings.set('iotisticURL', iotisticURL.replace(/\/$/, ''))
                response.send({ success: true })
            } else {
                response.status(400).send({ error: 'iotisticURL required' })
            }
        } catch (err) {
            console.error('Failed to save iotisticURL:', err)
            response.status(500).send({ error: err.message })
        }
    })

    // ** All routes after this point must have a valid  Token associated with the session **
    RED.httpAdmin.use('/nr-tools/*', auth.needsIotToken)

    RED.httpAdmin.get('/nr-tools/user', async (request, response) => {
        try {
            const user = await ffGet('/api/v1/auth/me', request.iotToken)
            response.send(user)
        } catch (err) {
            response.send({ error: err.toString(), code: 'request_failed' })
        }
    })

    RED.httpAdmin.get('/nr-tools/teams', async (request, response) => {
        try {
            const teams = await ffGet('/api/v1/user/teams', request.iotToken)
            response.send(teams)
        } catch (err) {
            response.send({ error: err.toString(), code: 'request_failed' })
        }
    })

    RED.httpAdmin.get('/nr-tools/teams/:teamId/projects', async (request, response) => {
        try {
            const projects = await ffGet(`/api/v1/teams/${request.params.teamId}/projects`, request.iotToken)
            response.send(projects)
        } catch (err) {
            response.send({ error: err.toString(), code: 'request_failed' })
        }
    })

    RED.httpAdmin.get('/nr-tools/projects/:projectId', async (request, response) => {
        try {
            const project = await ffGet(`/api/v1/projects/${request.params.projectId}`, request.iotToken)
            response.send(project)
        } catch (err) {
            response.send({ error: err.toString(), code: 'request_failed' })
        }
    })

    RED.httpAdmin.get('/nr-tools/projects/:projectId/snapshots', async (request, response) => {
        try {
            const project = await ffGet(`/api/v1/projects/${request.params.projectId}/snapshots`, request.iotToken)
            response.send(project)
        } catch (err) {
            response.send({ error: err.toString(), code: 'request_failed' })
        }
    })

    RED.httpAdmin.get('/nr-tools/devices', async (request, response) => {
        try {
            const page = request.query.page || 1
            const limit = request.query.limit || 10
            const filter = request.query.filter || 'all'
            const url = `/api/v1/devices?page=${page}&limit=${limit}&filter=${filter}`
            const devices = await ffGet(url, request.iotToken)
            response.send(devices)
        } catch (err) {
            response.send({ error: err.toString(), code: 'request_failed' })
        }
    })

    RED.httpAdmin.get('/nr-tools/devices/:deviceId/logs', async (request, response) => {
        try {
            const url = `/api/v1/devices/${request.params.deviceId}/logs`
            const creds = await ffGet(url, request.iotToken)
            response.send(creds)
        } catch (err) {
            response.send({ error: err.toString(), code: 'request_failed' })
        }
    })

    RED.httpAdmin.get('/nr-tools/account/:account', async (request, response) => {
        try {
            // Extract page and limit from query parameters
            const page = request.query.page || 1
            const limit = request.query.limit || 10
            const filter = request.query.filter || 'all'
            const url = `/api/v1/devices?page=${page}&limit=${limit}&filter=${filter}`
            const devices = await ffGet(url, request.iotToken)
            response.send(devices)
        } catch (err) {
            response.send({ error: err.toString(), code: 'request_failed' })
        }
    })

    RED.httpAdmin.post('/nr-tools/devices', async (request, response) => {
        try {
            const device = {
                id: request.body.id,
                userId: request.body.userId,
                name: request.body.name,
                description: request.body.description,
                type: request.body.type
            }
            const data = await ffPost('/api/v1/devices', request.iotToken, device)
            response.send(data)
        } catch (err) {
            response.send({ error: err.toString(), code: 'request_failed' })
        }
    })

    RED.httpAdmin.get('/nr-tools/devices/:deviceId/otc', async (request, response) => {
        try {
            console.log(request)
            const otc = await ffGet(`/api/v1/devices/${request.params.deviceId}/otc`, request.iotToken)
            response.send(otc)
        } catch (err) {
            response.send({ error: err.toString(), code: 'request_failed' })
        }
    })

    RED.httpAdmin.post('/nr-tools/device-publish-command', async (request, response) => {
        try {
            console.log(request.body)
            // publishDeviceCommand(request.body)
            response.send({})
        } catch (err) {
            response.send({ error: err.toString(), code: 'request_failed' })
        }
    })

    // MQTT Monitor proxy routes
    RED.httpAdmin.get('/nr-tools/mqtt-monitor/dashboard', async (request, response) => {
        try {
            const data = await ffGet('/api/v1/mqtt-monitor/dashboard', request.iotToken)
            response.send(data)
        } catch (err) {
            console.error('MQTT Monitor dashboard error:', err)
            response.send({ error: err.toString(), code: 'request_failed' })
        }
    })

    RED.httpAdmin.get('/nr-tools/mqtt-monitor/topic-tree', async (request, response) => {
        try {
            const data = await ffGet('/api/v1/mqtt-monitor/topic-tree', request.iotToken)
            response.send(data)
        } catch (err) {
            console.error('MQTT Monitor topic-tree error:', err)
            response.send({ error: err.toString(), code: 'request_failed' })
        }
    })

    RED.httpAdmin.get('/nr-tools/mqtt-monitor/topics/:topic(*)/recent-activity', async (request, response) => {
        try {
            const topic = request.params.topic
            const window = request.query.window || 15
            const url = `/api/v1/mqtt-monitor/topics/${encodeURIComponent(topic)}/recent-activity?window=${window}`
            const data = await ffGet(url, request.iotToken)
            response.send(data)
        } catch (err) {
            console.error('MQTT Monitor recent-activity error:', err)
            response.send({ error: err.toString(), code: 'request_failed' })
        }
    })

    // RED.httpAdmin.post('/nr-tools/snapshots', async (request, response) => {
    //     try {
    //         const snapshot = {
    //             sublowId: request.body.sublowId,
    //             deviceId: request.body.deviceId,
    //             data: request.body.data
    //         }
    //         await ffPost('/api/v1/snapshots', request.iotToken, snapshot)
    //         response.send({})
    //     } catch (err) {
    //         response.send({ error: err.toString(), code: 'request_failed' })
    //     }
    // })

    // RED.httpAdmin.get('/nr-tools/mqtt/status', (req, res) => {
    //     res.json({ connected: connectionManager.connected })
    // })
    // // Publish a test message
    // RED.httpAdmin.post('/nr-tools/mqtt/publish',  (req, res) => {
    //     const { topic, payload } = req.body;
    //     connectionManager.publish(topic, payload)
    //     res.json({ success: true })
    // })
}

module.exports = {
    setupRoutes
}
