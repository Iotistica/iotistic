const fetch = require('undici').fetch
const { Strategy } = require('./strategy')

module.exports = (options) => {
    if (!options.iotisticURL) {
        throw new Error('Missing configuration option iotisticURL')
    }

    const iotisticURL = options.iotisticURL
    
    // Note: baseURL will be constructed at runtime when we have access to settings.uiPort
    // For now, we'll defer URL construction until the strategy is actually used
    
    // Note: baseURL will be constructed at runtime when we have access to settings.uiPort
    // For now, we'll defer URL construction until the strategy is actually used

    const callbackURL = `http://localhost:${options.uiPort || 1880}/auth/strategy/callback`
    const loginURL = `${iotisticURL}/api/v1/auth/login`
    const refreshURL = `${iotisticURL}/api/v1/auth/refresh`
    const userInfoURL = `${iotisticURL}/api/v1/auth/me`

    const version = require('../package.json').version

    const activeUsers = {}

    async function refreshUserToken(username) {
        const user = activeUsers[username]
        if (!user || !user.refreshToken) {
            delete activeUsers[username]
            return
        }

        try {
            const response = await fetch(refreshURL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: user.refreshToken })
            })

            if (response.ok) {
                const data = await response.json()
                addUser(username, user.profile, data.data.accessToken, data.data.refreshToken)
                console.log('Refreshed JWT token for user', username)
            } else {
                console.error('Token refresh failed for user', username)
                delete activeUsers[username]
            }
        } catch (err) {
            console.error('Token refresh error:', err)
            delete activeUsers[username]
        }
    }

    function addUser (username, profile, accessToken, refreshToken) {
        if (activeUsers[username]) {
            clearTimeout(activeUsers[username].refreshTimeout)
        }
        activeUsers[username] = {
            profile,
            accessToken,
            refreshToken
        }
        // Refresh JWT token every 50 minutes (tokens expire in 1 hour)
        activeUsers[username].refreshTimeout = setTimeout(function () {
            refreshUserToken(username)
        }, 50 * 60 * 1000)
    }

    return {
        type: 'credentials',
        users: async function (username) {
            const user = activeUsers[username]
            if (user) {
                user.profile.accessToken = user.accessToken
                return user.profile
            }
            return null
        },
        authenticate: async function(username, password) {
            try {
                const response = await fetch(loginURL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                })

                if (!response.ok) {
                    console.error('Login failed:', response.status)
                    return null
                }

                const data = await response.json()
                const accessToken = data.data.accessToken
                const refreshToken = data.data.refreshToken
                const user = data.data.user

                const profile = {
                    username: user.username,
                    image: user.avatar || '',
                    name: user.fullName || user.username,
                    email: user.email,
                    permissions: ['*'],
                    accessToken: accessToken  // Include token in profile
                }

                addUser(user.username, profile, accessToken, refreshToken)
                console.log('JWT authenticated user:', user.username)
                return profile
            } catch (err) {
                console.error('Authentication error:', err)
                return null
            }
        },
        default: function() {
            return Promise.resolve(null)
        }
    }
}
