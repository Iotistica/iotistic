import RED from 'node-red'
import $ from 'jquery'
import * as api from '../api'
import { SnapshotListItem } from '../components/snapshotListItem'
import * as events from '../events'

let team = null
let instance = null
events.on('instance', async (_instance) => {
    instance = _instance
    if (instance) {
        refreshSnapshots()
    }
})
events.on('team', async (_team) => {
    team = _team
})

let snapshotList = null

async function refreshSnapshots () {
    snapshotList.editableList('empty')
    if (instance) {
        const snapshots = await api.getProjectSnapshots(instance.id)
        if (snapshots.snapshots && snapshots.snapshots.length > 0) {
            snapshotList.editableList('addItems', snapshots.snapshots || [])
            return
        }
    }
    snapshotList.editableList('addItem', { empty: true })
}

export function snapshotSection (sections) {
    const sectionSnapshots = sections.add({
        title: 'Snapshots'
    })
    sectionSnapshots.expand()
    sectionSnapshots.content.css({
        height: '100%',
        display: 'flex',
        'flex-direction': 'column'
    })

    const snapshotHeader = $('<div class="red-ui-sidebar-header"></div>').css({
        'border-top': '1px solid var(--red-ui-secondary-border-color)'
    }).appendTo(sectionSnapshots.content)
    $('<button type="button" class="red-ui-sidebar-header-button"><i class="fa fa-plus"></i> snapshot</button>')
        .appendTo(snapshotHeader)
        .on('click', function (evt) {
            showSnapshotDialog()
        })

    const snapshotBody = $('<div></div>').css({
        'flex-grow': 1,
        'overflow-y': 'auto'
    }).appendTo(sectionSnapshots.content)

    snapshotList = $('<ol>').appendTo(snapshotBody).editableList({
        addButton: false,
        height: 'auto',
        addItem: function (row, index, data) {
            if (data.empty) {
                $('<i>No snapshots available</i>').appendTo(row)
            } else {
                SnapshotListItem(data).appendTo(row)
            }
        }
    })
}
let snapshotDialog
function showSnapshotDialog () {
    if (!snapshotDialog) {
        snapshotDialog = $('<div id="ff-nr-tools-snapshot-dialog"><form class="ff-nr-tools-form dialog-form form-horizontal"></form></div>')
            .appendTo('#red-ui-editor')
            .dialog({
                title: 'Create Snapshot',
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
                        id: 'ff-nr-tools-snapshot-dialog-okay',
                        class: 'primary',
                        text: 'Create Snapshot',
                        click: function () {
                            const modules = {}
                            const moduleList = getCurrentModuleList()
                            moduleList.forEach(m => {
                                modules[m.name] = m.version
                            })
                            const options = {
                                name: $('#ff-nr-tools-snapshot-name').val(),
                                description: $('#ff-nr-tools-snapshot-description').val(),
                                settings: {
                                    modules
                                }
                            }
                            api.createProjectSnapshot(instance.id, options).then(() => {
                                refreshSnapshots()
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

    const dialogContainer = snapshotDialog.children('.dialog-form').empty()
    const form = $(`
<div class="form-row">
    <label>Instance</label>
    <div class="uneditable-input" style="width: 100%; color: var(--red-ui-form-text-color);">
        <img width="18px" id="ff-nr-tools-snapshot-team-avatar"> <span id="ff-nr-tools-snapshot-instance-name"></span>
    </div>
</div>
<div class="form-row">
    <label>Name</label>
    <input type="text" id="ff-nr-tools-snapshot-name">
</div>
<div class="form-row">
    <label>Description</label>
    <textarea id="ff-nr-tools-snapshot-description"></textarea>
</div>
<div class="form-row">
    <label>Modules</label>
    <div><ol astyle="height: 100px" id="ff-nr-tools-snapshot-module-list"></ol></div>
</div>
`).appendTo(dialogContainer)
    form.find('#ff-nr-tools-snapshot-name').on('keydown paste change', function (evt) {
        const value = $(this).val().trim()
        $('#ff-nr-tools-snapshot-dialog-okay').button(value ? 'enable' : 'disable')
    })
    $('#ff-nr-tools-snapshot-dialog-okay').button('disable')
    form.find('#ff-nr-tools-snapshot-module-list').editableList({
        addButton: false,
        height: 100,
        scrollOnAdd: false,
        addItem: function (row, index, data) {
            row.css({
                display: 'flex'
            })
            $('<span>').css({ 'flex-grow': 1 }).text(data.name).appendTo(row)
            $('<span>').text(data.version).appendTo(row)
        }
    })
    form.find('#ff-nr-tools-snapshot-module-list').editableList('addItems', getCurrentModuleList())
    if (team && instance) {
        form.find('#ff-nr-tools-snapshot-team-avatar').attr('src', team.avatar)
        form.find('#ff-nr-tools-snapshot-instance-name').text(instance.name)
    }
    snapshotDialog.dialog('open')
}
function getCurrentModuleList () {
    const moduleList = RED.nodes.registry.getModuleList()
    const usedModules = new Set(['node-red'])
    const modules = []
    const filterModules = n => { usedModules.add(n._def.set.module) }
    RED.nodes.eachNode(filterModules)
    RED.nodes.eachConfig(filterModules)
    usedModules.forEach(m => {
        modules.push({ name: m, version: moduleList[m].version })
    })
    return modules
}
