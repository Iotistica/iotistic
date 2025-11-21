import $ from 'jquery'
import RED from 'node-red'
import * as api from '../api'
import dialogDeviceEditTemplate from '../templates/deviceEditDialog.html'
import deviceItemTemplate from '../templates/deviceItem.html'
// import deviceLogs from '../templates/deviceLogs.html'
import { publishDeviceCommand } from '../api'
import * as events from '../events.js'
// import mqtt from 'mqtt'

RED.comms.subscribe('notification/device-status-update', async function (device, event) {
    const lastSeen = new Date()
    const update = {
        id: event.device,
        lastSeen
    }

    const uiUpdate = {
        id: event.device,
        status: event.payload.state,
        metrics: {
            cpu: event.payload.health.cpuUsage,
            memory: event.payload.health.memoryUsage
        },
        lastSeen
    }

    try {
        // update db
        await api.addDevice(update)

        // update UI
        const deviceEl = $(`.ff-nr-tools-device[data-id="${update.id}"]`)
        if (deviceEl.length) {
            updateDeviceInfo(deviceEl, uiUpdate)
        }
    } catch (err) {
        console.error('Failed to update device backend/ui:', err)
    }
})

export function DeviceListItem (data) {
    const content = $(deviceItemTemplate) // Load the HTML template into a jQuery object

    content.attr('data-id', data.id)

    // Initialize the device information
    updateDeviceInfo(content, data)

    // Pin state handling
    const pinnedDevices = getPinnedDevices()
    const isPinned = pinnedDevices.includes(data.id)

    if (isPinned) {
        content.addClass('pinned')
    }

    content.find('.ff-nr-tools-pin-icon')
        .attr('title', isPinned ? 'Unpin device' : 'Pin device')
        .toggleClass('pinned', isPinned)
        .on('click', function (evt) {
            evt.stopPropagation()
            const pinned = togglePinDevice(data.id)
            $(this)
                .attr('title', pinned ? 'Unpin device' : 'Pin device')
                .toggleClass('pinned', pinned)
            content.toggleClass('pinned', pinned)
            // $('.ff-nr-tools-device-list').trigger('refreshDeviceOrder')
        })

    content.find('.fa-angle-right').on('click', function (evt) {
        evt.stopPropagation() // Prevent bubbling to parent clicks
        if (content.hasClass('expanded')) {
            content.removeClass('expanded')
        } else {
            console.log('DeviceListItem', data)
            $('.ff-nr-tools-device').removeClass('expanded')
            content.addClass('expanded')
        }
    })

    // Handle settings button click (open edit dialog)
    content.find('#ff-nr-tools-show-settings').on('click', function (evt) {
        evt.stopPropagation()
        console.log(data)
        showDeviceEditDialog(data)
    })

    content.find('#ff-nr-tools-device-start').on('click', function () {
        sendCommand('start', data.id)
    })

    content.find('#ff-nr-tools-device-stop').on('click', function () {
        sendCommand('stop', data.id)
    })

    content.find('#ff-nr-tools-device-delete').on('click', function () {
        sendCommand('delete', data.id)
    })

    return content
}

async function sendCommand (command, deviceId) {
    await publishDeviceCommand({ command, deviceId })
}

export function updateDeviceInfo (content, data) {
    // Update device status
    const stateIcon = content.find('.ff-nr-tools-device-state')
    if (data.state === 'active') {
        stateIcon.html('<i class="fa fa-circle" style="color: #5a8;"></i>')
    } else if (data.state === 'inactive') {
        stateIcon.html('<i class="fa fa-circle" style="color: red;"></i>')
    } else {
        stateIcon.html('<i class="fa fa-circle" style="color: grey;"></i>')
    }
    // Update name, id, and last seen
    content.find('.ff-nr-tools-device-name').text(data.name)
    content.find('.ff-nr-tools-device-lastseen').html('<i class="fa fa-eye" style="margin-right: 4px;"></i>' + humanizeSinceDate(new Date(data.lastSeen)))

    // Update the metrics (CPU and Memory bars)
    updateDeviceMetrics(content, data.metrics)
}

// Function to update the metrics (CPU and Memory)
export function updateDeviceMetrics (content, metrics) {
    const cpu = metrics?.cpu || Math.floor(Math.random() * 70 + 10)
    const mem = metrics?.memory || Math.floor(Math.random() * 70 + 20)
    const io = metrics?.io || Math.floor(Math.random() * 70 + 10)
    const pw = metrics?.pw || Math.floor(Math.random() * 70 + 10) // New simulated PW metric

    const maxVal = 100
    const chartHeight = 60
    const barWidth = 40
    const spacing = 20

    const cpuHeight = (cpu / maxVal) * (chartHeight - 15)
    const memHeight = (mem / maxVal) * (chartHeight - 15)
    const ioHeight = (io / maxVal) * (chartHeight - 15)
    const pwHeight = (pw / maxVal) * (chartHeight - 15)

    const cpuY = chartHeight - cpuHeight
    const memY = chartHeight - memHeight
    const ioY = chartHeight - ioHeight
    const pwY = chartHeight - pwHeight

    const cpuX = 10
    const memX = cpuX + barWidth + spacing
    const ioX = memX + barWidth + spacing
    const pwX = ioX + barWidth + spacing // Position for PW bar

    const bars = `
        <svg width="${(barWidth + spacing) * 4 + 20}" height="${chartHeight + 25}">
            <rect x="${cpuX}" y="${cpuY}" width="${barWidth}" height="${cpuHeight}" fill="#87A980" rx="2"/>
            <text x="${cpuX + barWidth / 2}" y="${cpuY - 5}" text-anchor="middle" font-size="9" fill="#FFFFFF">${cpu}%</text>
            <text x="${cpuX + barWidth / 2}" y="${chartHeight + 12}" text-anchor="middle" font-size="9" fill="#FFFFFF">CPU</text>

            <rect x="${memX}" y="${memY}" width="${barWidth}" height="${memHeight}" fill="#2196f3" rx="2"/>
            <text x="${memX + barWidth / 2}" y="${memY - 5}" text-anchor="middle" font-size="9" fill="#FFFFFF">${mem}%</text>
            <text x="${memX + barWidth / 2}" y="${chartHeight + 12}" text-anchor="middle" font-size="9" fill="#FFFFFF">MEM</text>

            <rect x="${ioX}" y="${ioY}" width="${barWidth}" height="${ioHeight}" fill="#ff9800" rx="2"/>
            <text x="${ioX + barWidth / 2}" y="${ioY - 5}" text-anchor="middle" font-size="9" fill="#FFFFFF">${io}%</text>
            <text x="${ioX + barWidth / 2}" y="${chartHeight + 12}" text-anchor="middle" font-size="9" fill="#FFFFFF">IO</text>

            <rect x="${pwX}" y="${pwY}" width="${barWidth}" height="${pwHeight}" fill="#9c27b0" rx="2"/>
            <text x="${pwX + barWidth / 2}" y="${pwY - 5}" text-anchor="middle" font-size="9" fill="#FFFFFF">${pw}%</text>
            <text x="${pwX + barWidth / 2}" y="${chartHeight + 12}" text-anchor="middle" font-size="9" fill="#FFFFFF">PW</text>
        </svg>
    `

    content.find('.ff-nr-tools-device-metrics').html(bars)
}

let deviceEditDialog
function showDeviceEditDialog (data) {
    if (!deviceEditDialog) {
        deviceEditDialog = $('<div id="ff-nr-tools-device-dialog"><form class="ff-nr-tools-form dialog-form form-horizontal"></form></div>')
            .appendTo('#red-ui-editor')
            .dialog({
                title: 'Edit Device',
                modal: true,
                width: 500,
                autoOpen: false,
                resizable: false,
                classes: {
                    'ui-dialog': 'red-ui-editor-dialog',
                    'ui-dialog-titlebar-close': 'hide',
                    'ui-widget-overlay': 'red-ui-editor-dialog'
                },
                buttons: [
                    {
                        text: RED._('common.label.cancel'),
                        click: function () { $(this).dialog('close') }
                    },
                    {
                        id: 'ff-nr-tools-device-dialog-okay',
                        class: 'primary',
                        text: 'Save',
                        click: function () {
                            const options = {
                                id: $('#ff-nr-tools-device-id').val(),
                                name: $('#ff-nr-tools-device-name').val(),
                                description: $('#ff-nr-tools-device-description').val(),
                                type: $('#ff-nr-tools-device-type').val()
                            }
                            api.addDevice(options).then(() => {
                                events.emit('refreshDevices', null)
                            }).catch(err => {
                                console.log(err)
                            }).finally(() => {
                                $(this).dialog('close')
                            })
                        }
                    }
                ],
                open: function (event, ui) {
                    RED.keyboard.disable()
                },
                close: function (e) {
                    RED.keyboard.enable()
                }
            })
    }

    deviceEditDialog.dialog('option', 'title', data.name || 'Edit Device')

    const dialogContainer = deviceEditDialog.children('.dialog-form').empty()
    dialogContainer.html(dialogDeviceEditTemplate)

    console.log('edit device dialog with data: ')
    console.log(data)

    // 1. Create tabs
    const tabs = RED.tabs.create({
        id: 'device-tabs-header',
        onchange: function (tab) {
            $('.device-tab-content').hide()
            $('#' + tab.id).show()
            if (tab.id === 'device-tab-connect') {
                const deviceId = $('#ff-nr-tools-device-id').val()
                console.log(deviceId)
                api.getDeviceOTC(deviceId).then((data) => {
                    console.log(data)
                    const command = `${data.command}`
                    $('#device-otc-code').text(command || 'No OTC available')
                }).catch(err => {
                    console.log(err)
                })
            }

            // if (tab.id === 'device-tab-logs') {
            //     const deviceId = $('#ff-nr-tools-device-id').val()
            //     getDeviceLogs(deviceId)
            // }
        }
    })

    // 2. Add tabs
    tabs.addTab({ id: 'device-tab-general', label: 'General' })
    tabs.addTab({ id: 'device-tab-connect', label: 'Connect' })
    tabs.addTab({ id: 'device-tab-logs', label: 'Logs' })
    tabs.addTab({ id: 'device-tab-control', label: 'Control' })

    // Fill fields
    $('#ff-nr-tools-device-id').val(data.id || '')
    $('#ff-nr-tools-device-name').val(data.name || '')
    $('#ff-nr-tools-device-description').val(data.description || '')
    $('#ff-nr-tools-device-type').val(data.type || '')

    // Enable save button only if name is non-empty
    const initialName = data.name || ''
    $('#ff-nr-tools-device-dialog-okay').button(initialName.trim() ? 'enable' : 'disable')

    // Handle input change
    dialogContainer.find('#ff-nr-tools-device-name').on('keydown paste change', function (evt) {
        const value = $(this).val().trim()
        $('#ff-nr-tools-device-dialog-okay').button(value ? 'enable' : 'disable')
    })
    // Load logs
    // dialogContainer.find('#device-tab-logs').html(deviceLogs)

    deviceEditDialog.dialog('open')

    $('#copy-command').on('click', function () {
        const text = $('#iotistic-command').text()
        navigator.clipboard.writeText(text).then(() => {
            const $button = $(this)
            const $label = $button.find('.copy-label')
            $label.text('Copied!')
            setTimeout(() => $label.text('Copy'), 2000)
        }).catch(() => {
            RED.notify('Failed to copy command', 'error')
        })
    })
}

// function getDeviceLogs (deviceId) {
//     api.getDeviceLogCreds(deviceId)
//         .then(res => res.json())
//         .then(creds => {
//             // use creds here
//             console.log(creds)

//             const client = mqtt.connect(creds.url, {
//                 username: creds.username,
//                 password: creds.password,
//                 reconnectPeriod: 0
//             })

//             const topic = `iot/v1/${deviceId}/d/${deviceId}/logs`
//             // let keepAliveInterval

//             client.on('connect', () => {
//                 client.subscribe(topic)
//                 client.publish(`${topic}/heartbeat`, 'alive')
//                 // keepAliveInterval = setInterval(() => {
//                 //     client.publish(`${topic}/heartbeat`, 'alive')
//                 // }, 10000)
//             })
//         })
//         .catch(err => {
//             console.error('Error fetching creds or connecting to MQTT:', err)
//         })
// }

export function getPinnedDevices () {
    const pinned = localStorage.getItem('pinnedDevices')
    return pinned ? JSON.parse(pinned) : []
}

function togglePinDevice (deviceId) {
    const pinned = getPinnedDevices()
    const index = pinned.indexOf(deviceId)
    if (index !== -1) {
        pinned.splice(index, 1)
    } else {
        pinned.push(deviceId)
    }
    localStorage.setItem('pinnedDevices', JSON.stringify(pinned))
    return pinned.includes(deviceId)
}

function humanizeSinceDate (date) {
    const delta = (Date.now() - date) / 1000
    const daysDelta = Math.floor(delta / (60 * 60 * 24))
    if (daysDelta > 30) {
        return (new Date(date)).toLocaleDateString()
    } else if (daysDelta > 0) {
        return RED._('sidebar.project.versionControl.daysAgo', { count: daysDelta })
    }
    const hoursDelta = Math.floor(delta / (60 * 60))
    if (hoursDelta > 0) {
        return RED._('sidebar.project.versionControl.hoursAgo', { count: hoursDelta })
    }
    const minutesDelta = Math.floor(delta / 60)
    if (minutesDelta > 0) {
        return RED._('sidebar.project.versionControl.minsAgo', { count: minutesDelta })
    }
    return RED._('sidebar.project.versionControl.secondsAgo')
}
