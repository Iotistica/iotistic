const settings = require('../settings')
const { ffGet, ffPost } = require('../client')

const activeTokens = { }

function getUserForRequest (request) {
    let sessionUsername = '_'
    if (request.user) {
        console.log('User:', request.user)
        // adminAuth is configured
        sessionUsername = request.user.username || '_'
    }
    return sessionUsername
}

function setUserToken (user, token) {
    activeTokens[user] = token
    // JWT tokens expire in 1 hour by default, refresh at 50 minutes
    const refreshInterval = 50 * 60 * 1000 // 50 minutes
    token.refreshTimeout = setTimeout(async () => {
        try {
            const newTokens = await refreshToken(token)
            setUserToken(user, newTokens)
        } catch (err) {
            console.error('Failed to refresh token:', err)
            delete activeTokens[user]
        }
    }, refreshInterval)
}

function getUserTokenForRequest (request) {
    const token = activeTokens[getUserForRequest(request)]
    return token
}

function deleteUserTokenForRequest (request) {
    const token = activeTokens[getUserForRequest(request)]
    if (token) {
        clearTimeout(token.refreshTimeout)
    }
    delete activeTokens[getUserForRequest(request)]
}

function needsIotToken (request, response, next) {
    // Priority 1: Check if user is authenticated via nr-auth (request.user from adminAuth)
    if (request.user && request.user.accessToken) {
        // User authenticated via nr-auth plugin - use their token
        request.iotToken = request.user.accessToken
        return next()
    }
    
    // Priority 2: Check for Bearer token in Authorization header
    if (request.user) {
        const authHeader = request.headers.authorization
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1]
            request.iotToken = token
            return next()
        }
    }
    
    // Priority 3: Get JWT token from plugin's own memory storage (fallback)
    const token = getUserTokenForRequest(request)
    if (token && token.accessToken) {
        request.iotToken = token.accessToken
        return next()
    }
    
    // No valid token found
    return response.status(401).end()
}

async function refreshToken (token) {
    try {
        const response = await ffPost('/api/v1/auth/refresh', null, {
            refreshToken: token.refreshToken
        })
        return {
            accessToken: response.data.accessToken,
            refreshToken: response.data.refreshToken
        }
    } catch (err) {
        console.error('Token refresh failed:', err)
        throw err
    }
}

function setupRoutes (RED) {
    // ** All routes after this point must have a valid Node-RED session user **
    RED.httpAdmin.use('/nr-tools/*', RED.auth.needsPermission('flowfuse.write'))

    RED.httpAdmin.post('/nr-tools/auth/login', async (request, response) => {
        try {
            const { iotisticURL, username, password } = request.body
            
            if (iotisticURL) {
                settings.set('iotisticURL', iotisticURL.replace(/\/$/, ''))
            }
            
            if (!username || !password) {
                return response.status(400).send({ 
                    error: 'Username and password required',
                    code: 'missing_credentials' 
                })
            }

            // Login via JWT
            const result = await ffPost('/api/v1/auth/login', null, {
                username,
                password
            })

            if (result.data && result.data.accessToken) {
                const tokens = {
                    accessToken: result.data.accessToken,
                    refreshToken: result.data.refreshToken
                }
                setUserToken(getUserForRequest(request), tokens)
                response.send({ 
                    success: true,
                    user: result.data.user 
                })
            } else {
                throw new Error('Invalid login response')
            }
        } catch (err) {
            RED.log.error(`[nr-tools] Login failed: ${err.toString()}`)
            response.status(401).send({ 
                error: err.message || err.toString(), 
                code: 'login_failed' 
            })
        }
    })
    RED.httpAdmin.post('/nr-tools/auth/logout', async (request, response) => {
        try {
            const token = getUserTokenForRequest(request)
            if (token && token.accessToken) {
                await ffPost('/api/v1/auth/logout', token.accessToken)
            }
            deleteUserTokenForRequest(request)
            response.send({ success: true })
        } catch (err) {
            RED.log.error(`[nr-tools] Failed to logout: ${err.toString()}`)
            // Still delete local token even if server logout fails
            deleteUserTokenForRequest(request)
            response.send({ success: true })
        }
    })
}

module.exports = {
    setupRoutes,
    getUserTokenForRequest,
    deleteUserTokenForRequest,
    needsIotToken
}
