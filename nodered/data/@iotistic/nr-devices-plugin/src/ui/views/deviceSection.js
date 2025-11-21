import RED from 'node-red'
import $ from 'jquery'
import * as api from '../api'
import * as events from '../events'
import { DeviceListItem, getPinnedDevices } from '../components/deviceListItem'
import deviceAddTemplate from '../templates/deviceAddDialog.html'

events.on('refreshDevices', async (_update) => {
    refreshDevices()
})

events.on('deviceCountUpdate', async (_update) => {
    console.log('Devices count updated:', _update.count, _update.filter)
    const label = `Devices (${_update.count})`
    sectionTitleSpan.text(label)
})

let deviceList = null
let filterType = 'filterAll'
let sectionTitleSpan = null
let prevBtn = null
let nextBtn = null

let currentPage = 1
const pageSize = 5

async function refreshDevices (filter = 'all', page = 1) {
    deviceList.editableList('empty')

    const response = await api.getDevices(page, pageSize, filter)
    console.log(response)
    let devices = response.devices || []

    const pinned = getPinnedDevices()

    if (filter && filter.toLowerCase() !== 'all') {
        devices = devices.filter(device => device.state?.toLowerCase() === filter.toLowerCase())
    }

    devices.sort((a, b) => {
        const aPinned = pinned.includes(a.id)
        const bPinned = pinned.includes(b.id)
        return aPinned === bPinned ? 0 : aPinned ? -1 : 1
    })

    if (devices.length > 0) {
        deviceList.editableList('addItems', devices)
    } else {
        deviceList.editableList('addItem', { empty: true })
    }

    currentPage = page

    events.emit('deviceCountUpdate', {
        count: response.pagination.totalDevices || devices.length,
        filter: filter || 'All'
    })

    updatePaginationControls(response.pagination.totalDevices || devices.length)
}

export function deviceSection (sections) {
    const sectionDevices = sections.add({
        title: 'Devices'
    })

    sectionDevices.expand()
    sectionDevices.content.css({
        height: '100%',
        display: 'flex',
        'flex-direction': 'column'
    })

    const header = sectionDevices.container.find('.red-ui-palette-header')

    header.css({
        display: 'flex',
        'justify-content': 'space-between',
        'align-items': 'center',
        gap: '6px'
    })

    // Optional: prevent flex from shrinking the <span>
    sectionTitleSpan = header.find('span').css({
        'flex-grow': 1
    })

    const buttonContainer = $('<div class="ff-nr-tools-device-header-buttons"></div>').css({
        display: 'flex',
        gap: '6px'
    }).appendTo(header)

    $('<button type="button" class="red-ui-sidebar-header-button"><i class="fa fa-refresh"></i></button>')
        .attr('title', 'Refresh Devices')
        .appendTo(buttonContainer)
        .on('click', function () {
            refreshDevices(filterType.replace('filter', ''))
        })

    $('<button type="button" class="red-ui-sidebar-header-button"><i class="fa fa-plus"></i></button>')
        .attr('title', 'Add Device')
        .appendTo(buttonContainer)
        .on('click', function (evt) {
            showDeviceDialog()
        })

    const toolbar = $(
        `<span class="button-group">
                <a id="red-ui-sidebar-device-status-filter" style="padding-right: 5px" class="red-ui-sidebar-header-button" href="#"><i class="fa fa-filter"></i> <span></span> <i style="padding-left: 5px;" class="fa fa-caret-down"></i></a>
            </span>`)
        .attr('title', 'Filter Devices')
        .appendTo(buttonContainer)

    // const filterDialog = $('<div class="red-ui-debug-filter-box hide"></div>').appendTo(toolbar)

    toolbar.find('#red-ui-sidebar-device-status-filter span').text('All')
    toolbar.find('#red-ui-sidebar-device-status-filter').on('click', function (e) {
        e.preventDefault()
        const options = [
            { label: $('<span><input type="radio" value="filterAll" name="filter-type" style="margin-top:0" > All</span>'), value: 'filterAll' },
            { label: $('<span><input type="radio" value="filterActive" name="filter-type" style="margin-top:0"> Active</span>'), value: 'filterActive' },
            { label: $('<span><input type="radio" value="filterInactive" name="filter-type" style="margin-top:0"> Inactive</span>'), value: 'filterInactive' }
        ]
        const menu = RED.popover.menu({
            options,
            onselect: function (item) {
                setFilterType(item.value)
            }
        })
        menu.show({
            target: $('#red-ui-sidebar-device-status-filter'),
            align: 'left',
            offset: [$('#red-ui-sidebar-device-status-filter').outerWidth() - 2, -1]
        })
        $('input[name="filter-type"][value="' + RED.settings.get('debug.filter', 'filterAll') + '"]').prop('checked', true)
    })

    $('<div class="red-ui-sidebar-header"></div>').css({
        'border-top': '1px solid var(--red-ui-secondary-border-color)'
    }).appendTo(sectionDevices.content)

    const deviceBody = $('<div></div>').css({
        'flex-grow': 1,
        'overflow-y': 'auto'
    }).appendTo(sectionDevices.content)

    deviceList = $('<ol class="ff-nr-tools-device-list">').appendTo(deviceBody).editableList({
        addButton: false,
        height: 'auto',
        addItem: function (row, index, data) {
            // Alternate row colors
            const rowClass = index % 2 === 0 ? 'even' : 'odd'
            row.addClass(rowClass)
            if (data.empty) {
                $('<i>No devices available</i>').appendTo(row)
            } else {
                DeviceListItem(data).appendTo(row)
            }
        }
    })

    const paginationControls = $('<div class="ff-nr-tools-pagination-controls"></div>').appendTo(sectionDevices.content)

    prevBtn = $('<button disabled>&lt; Prev</button>').appendTo(paginationControls)
    nextBtn = $('<button disabled>Next &gt;</button>').appendTo(paginationControls)

    prevBtn.on('click', () => {
        if (currentPage > 1) {
            refreshDevices(filterType.replace('filter', ''), currentPage - 1)
        }
    })

    nextBtn.on('click', () => {
        refreshDevices(filterType.replace('filter', ''), currentPage + 1)
    })

    deviceList.on('refreshDeviceOrder', () => {
        refreshDevices(filterType.replace('filter', ''))
    })

    // Don't call refreshDevices() here - it will be triggered by connection-state event
    // after successful authentication
}

function updatePaginationControls (totalCount) {
    const totalPages = Math.ceil(totalCount / pageSize)
    prevBtn.prop('disabled', currentPage <= 1)
    nextBtn.prop('disabled', currentPage >= totalPages)
}

function setFilterType (type) {
    if (type !== filterType) {
        filterType = type
        const filter = type.replace('filter', '')
        $('#red-ui-sidebar-device-status-filter span').text(filter)
        refreshDevices(filter)
    }
}

let deviceDialog
function showDeviceDialog () {
    if (!deviceDialog) {
        deviceDialog = $('<div id="ff-nr-tools-device-dialog"><form class="ff-nr-tools-form dialog-form form-horizontal"></form></div>')
            .appendTo('#red-ui-editor')
            .dialog({
                title: 'Add Device',
                modal: true,
                width: 400,
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
                                name: $('#ff-nr-tools-add-device-name').val(),
                                description: $('#ff-nr-tools-add-device-description').val(),
                                type: $('#ff-nr-tools-add-device-type').val()
                            }
                            console.log(options)
                            api.addDevice(options).then((data) => {
                                refreshDevices()
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

    const dialogContainer = deviceDialog.children('.dialog-form').empty()
    dialogContainer.html(deviceAddTemplate)

    $('#ff-nr-tools-device-dialog-okay').button('disable')
    dialogContainer.find('#ff-nr-tools-add-device-name').on('keydown paste change', function (evt) {
        const value = $(this).val().trim()
        $('#ff-nr-tools-device-dialog-okay').button(value ? 'enable' : 'disable')
    })

    deviceDialog.dialog('open')
}
