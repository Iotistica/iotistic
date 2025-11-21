// Import the css so it gets included in the output
// eslint-disable-next-line no-unused-vars
import style from './style.css'
// import { refreshSettings } from './api'

// Import the globals
import RED from 'node-red'
import * as sidebar from './sidebar'
import * as mqttTreeSidebar from './mqttTreeSidebar'
import * as settingsPane from './views/settingsPane'

RED.plugins.registerPlugin('iotistic-nr-devices', {
    onadd: async function () {
        sidebar.init()
        // mqttTreeSidebar is now integrated into main sidebar
        settingsPane.init()
        // refreshSettings()
    }
})
