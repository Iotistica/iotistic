const got = require('got')

let settings

module.exports = {
    init: (nrSettings) => {
        settings = nrSettings.httpStorage || {}

        if (Object.keys(settings) === 0) {
            const err = Promise.reject(new Error('No settings for flow storage module found'))
            // err.catch(err => {})
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

        this._client = got.extend({
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
        const response = await this._client.get('flows').json()
        return response.flows
    },
    saveFlows: async (flow) => {
        return this._client.post('flows', {
            json: flow,
            responseType: 'json'
        })
    },
    getCredentials: async () => {
        return this._client.get('credentials').json()
    },
    saveCredentials: async (credentials) => {
        return this._client.post('credentials', {
            json: credentials,
            responseType: 'json'
        })
    },
    getSettings: () => {
        return this._client.get('settings').json()
    },
    saveSettings: (settings) => {
        return this._client.post('settings', {
            json: settings,
            responseType: 'json'
        })
    },
    getSessions: () => {
        this._client.get('sessions').json()
    },
    saveSessions: (sessions) => {
        return this._client.post('sessions', {
            json: sessions,
            responseType: 'json'
        })
    },
    getLibraryEntry: (type, name) => {
        return this._client.get('library/' + type, {
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
        return this._client.post('library/' + type, {
            json: {
                name,
                meta,
                body
            },
            responseType: 'json'
        })
    }
}
