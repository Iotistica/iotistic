const got = require('got')

let settings

module.exports = (options) => {
    // If called as a function (like adminAuth pattern), use options directly
    // Support both 'iotisticURL' and legacy 'baseURL' for backwards compatibility
    if (options && ((options.iotisticURL || options.baseURL) || options.token)) {
        settings = {
            baseURL: options.iotisticURL || options.baseURL,
            token: options.token
        }
        
        if (!settings.baseURL) {
            throw new Error('No iotisticURL found in storage settings')
        }
        
        if (!settings.token) {
            throw new Error('No token found in storage settings')
        }
        
        const client = got.extend({
            prefixUrl: settings.baseURL + '/api/v1/nr/storage/',
            headers: {
                'user-agent': 'Iotistic HTTP Storage v0.1',
                authorization: 'Bearer ' + settings.token
            },
            timeout: {
                request: 20000
            }
        })
        
        return createStorageModule(client)
    }
    
    // Return module with init() for legacy pattern
    return createStorageModule()
}

function createStorageModule(client) {
    let _client = client

    return {
        init: (nrSettings) => {
            if (_client) {
                // Already initialized via factory function
                return Promise.resolve()
            }

            settings = nrSettings.httpStorage || {}

            if (Object.keys(settings) === 0) {
                const err = Promise.reject(new Error('No settings for flow storage module found'))
                return err
            }

            if (!settings.baseURL) {
                const err = Promise.reject(new Error('No baseURL found in storage settings'))
                return err
            }

            if (!settings.token) {
                const err = Promise.reject(new Error('No token found in storage settings'))
                return err
            }

            _client = got.extend({
                prefixUrl: settings.baseURL + '/api/v1/nr/storage/',
                headers: {
                    'user-agent': 'Iotistic HTTP Storage v0.1',
                    authorization: 'Bearer ' + settings.token
                },
                timeout: {
                    request: 20000
                }
            })

            return Promise.resolve()
        },
        getFlows: async () => {
            const response = await _client.get('flows').json()
            return response.flows
        },
        saveFlows: async (flow) => {
            return _client.post('flows', {
                json: flow,
                responseType: 'json'
            })
        },
        getCredentials: async () => {
            return _client.get('credentials').json()
        },
        saveCredentials: async (credentials) => {
            return _client.post('credentials', {
                json: credentials,
                responseType: 'json'
            })
        },
        getSettings: () => {
            return _client.get('settings').json()
        },
        saveSettings: (settings) => {
            return _client.post('settings', {
                json: settings,
                responseType: 'json'
            })
        },
        getSessions: () => {
            _client.get('sessions').json()
        },
        saveSessions: (sessions) => {
            return _client.post('sessions', {
                json: sessions,
                responseType: 'json'
            })
        },
        getLibraryEntry: (type, name) => {
            return _client.get('library/' + type, {
                searchParams: {
                    name
                }
            }).then(entry => {
                if (entry.headers['content-type'].startsWith('application/json')) {
                    return JSON.parse(entry.body)
                } else {
                    return entry.body
                }
            })
        },
        saveLibraryEntry: (type, name, meta, body) => {
            return _client.post('library/' + type, {
                json: {
                    name,
                    meta,
                    body
                },
                responseType: 'json'
            })
        }
    }
}
