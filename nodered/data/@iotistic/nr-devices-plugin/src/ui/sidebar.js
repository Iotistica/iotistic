// Import the globals
import $ from 'jquery'
import RED from 'node-red'

import * as api from './api.js'
import * as events from './events.js'
import { loginPane } from './views/loginPane.js'
import { mainPane } from './views/mainPane.js'
import { ConnectionStatusWidget } from './components/connectionStatus'
import * as mqttTreeModule from './mqttTreeSidebar.js'

const sidebarContentTemplate = `
<div class="ff-nr-tools">
    <div class="red-ui-sidebar-header ff-nr-tools-header">
        <!-- Left Header -->
        <span id="ff-nr-tools-header-left">
        </span>
        <!-- Right Header -->
        <span id="ff-nr-tools-header-right">
            <button type="button" class="red-ui-sidebar-header-button" id="ff-nr-tools-show-settings"><i class="fa fa-cog"></i></button>
        </span>
    </div>
    <div class="ff-nr-tools" id="ff-nr-tools-body">
    </div>
</div>
`
const sidebarToolbarTemplate = '<div></div>'

async function init () {
    const content = $(sidebarContentTemplate)
    content.find('#ff-nr-tools-show-settings').on('click', function (evt) {
        evt.preventDefault()
        RED.userSettings.show('flowfuse-nr-tools')
    })
    const contentBody = content.find('#ff-nr-tools-body')
    const toolbar = $(sidebarToolbarTemplate)

    ConnectionStatusWidget().appendTo(toolbar)

    const panes = {
        login: loginPane,
        main: mainPane
    }

    let activePane = null
    function showPane (id) {
        if (activePane) {
            if (activePane.id === id) {
                return
            }
            activePane._content.remove()
            if (activePane.onhide) {
                activePane.onhide()
            }
        }
        activePane = panes[id]
        activePane._content = activePane.content()
        activePane._content.appendTo(contentBody)
        if (activePane.onshow) {
            activePane.onshow()
        }
    }

    events.on('connection-state', function (state) {
        if (!state) {
            showPane('login')
        } else {
            showPane('main')
            
            // Trigger devices refresh after successful authentication
            events.emit('refreshDevices')
        }
    })

    // Import MQTT Tree Viewer content
    const mqttTreeViewer = mqttTreeModule.init()
    
    // Create a shared header that stays visible
    const sharedHeader = $('<div class="red-ui-sidebar-header ff-nr-tools-header">').html(`
        <span id="ff-nr-tools-header-left"></span>
        <span id="ff-nr-tools-header-right">
            <button type="button" class="red-ui-sidebar-header-button" id="iotistic-view-devices" title="Device Manager">
                <i class="fa fa-thermometer-half"></i>
            </button>
            <button type="button" class="red-ui-sidebar-header-button" id="iotistic-view-mqtt" title="MQTT Topic Viewer">
                <i class="fa fa-sitemap"></i>
            </button>
            <button type="button" class="red-ui-sidebar-header-button" id="ff-nr-tools-show-settings">
                <i class="fa fa-cog"></i>
            </button>
        </span>
    `)
    
    // Attach settings button handler to new header
    sharedHeader.find('#ff-nr-tools-show-settings').on('click', function (evt) {
        evt.preventDefault()
        RED.userSettings.show('flowfuse-nr-tools')
    })
    
    // Create container for both views
    const mainContainer = $('<div>').css({ height: '100%', display: 'flex', flexDirection: 'column' })
    
    // Remove the header from content since we have a shared one now
    content.find('.ff-nr-tools-header').remove()
    
    const deviceManagerView = $('<div>').attr('id', 'iotistic-device-view').css({ flex: 1, display: 'block', overflow: 'auto' }).append(content)
    const mqttTreeView = $('<div>').attr('id', 'iotistic-mqtt-view').css({ flex: 1, display: 'none', overflow: 'auto' }).append(mqttTreeViewer.content)
    
    mainContainer.append(sharedHeader)
    mainContainer.append(deviceManagerView)
    mainContainer.append(mqttTreeView)
    
    // Get button references from shared header
    const deviceBtn = sharedHeader.find('#iotistic-view-devices')
    const mqttBtn = sharedHeader.find('#iotistic-view-mqtt')
    
    // Set initial active state
    deviceBtn.css({ background: 'var(--red-ui-primary-background)', color: 'white' })
    
    // Switch view handlers
    deviceBtn.on('click', function() {
        console.log('[Iotistic] Switching to Device Manager view')
        $('#iotistic-device-view').show()
        $('#iotistic-mqtt-view').hide()
        deviceBtn.css({ background: 'var(--red-ui-primary-background)', color: 'white' })
        mqttBtn.css({ background: '', color: '' })
        if (mqttTreeViewer.onhide) mqttTreeViewer.onhide()
    })
    
    mqttBtn.on('click', function() {
        console.log('[Iotistic] Switching to MQTT Tree view')
        $('#iotistic-device-view').hide()
        $('#iotistic-mqtt-view').show()
        mqttBtn.css({ background: 'var(--red-ui-primary-background)', color: 'white' })
        deviceBtn.css({ background: '', color: '' })
        if (mqttTreeViewer.onshow) mqttTreeViewer.onshow()
    })
    
    RED.sidebar.addTab({
        id: 'nr-tools',
        label: 'Iotistic',
        name: 'Iotistic',
        content: mainContainer,
        toolbar,
        pinned: true,
        iconClass: 'fa fa-thermometer-half',
        action: 'nr-tools:show-flowfuse-tools-tab'
    })
    RED.actions.add('nr-tools:show-flowfuse-tools-tab', function () {
        RED.sidebar.show('nr-tools')
    })
    RED.comms.subscribe('nr-tools/connected', function (topic, msg) {
        api.refreshSettings()
    })

    await api.refreshSettings()
}

export {
    init
}
