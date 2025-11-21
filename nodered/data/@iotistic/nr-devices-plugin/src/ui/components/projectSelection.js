import $ from 'jquery'
import RED from 'node-red'
import * as api from '../api.js'
import * as events from '../events.js'

// const listContainsId = (list, id) => !!list.find(l => l.id === id)

export function ProjectSelectionWidget () {
    let currentTeam = ''
    let currentProject = ''
    let projects = []
    const widget = $('<span>')
    const button = $('<button type="button" class="red-ui-sidebar-header-button"><i style="position: relative; top: 1px; margin-left: -2px;" class="fa fa-caret-down"></i> <span></span> <i class="spinner" style="float: right; height:13px"></i></button>')
    button.appendTo(widget)
    button.on('click', function (evt) {
        RED.popover.menu({
            options: projects.map(p => {
                return {
                    label: p.name,
                    id: p.id
                }
            }),
            width: 200,
            onselect: (item) => {
                selectProject(item.id)
            }
        }).show({ target: widget })
    })
    widget.hide()

    async function selectProject (id) {
        const project = projects.find(project => project.id === id)
        if (project) {
            widget.find('span').text(project.name)
        } else if (projects.length === 0) {
            widget.find('span').html('<i>no instances available</i>')
        } else {
            widget.find('span').html('<i>select instance</i>')
        }
        currentProject = id
        if (project) {
            const projectInfo = await api.getProject(currentProject)
            if (projectInfo.code) {
                events.emit('instance', null)
            } else {
                events.emit('instance', projectInfo)
            }
        } else {
            events.emit('instance', null)
        }
    }
    events.on('connection-state', async function (state) {
        if (!state) {
            widget.hide()
        }
    })
    events.on('team', async function (team) {
        const projectSelectionAllowed = api.getSettings().allowProjectSelection !== false
        button.children().hide()
        button.attr('disabled', 'disabled')
        button.find('.spinner').show()
        widget.show()
        try {
            const projectList = await api.getTeamProjects(team.id)

            if (projectList.projects) {
                projects = [...projectList.projects]
            } else {
                projects = []
            }

            if (!currentProject) {
                currentProject = api.getSettings().project || projects[0]?.id
            } else if (currentTeam !== team.id) {
                currentProject = projects[0]?.id
            }
            currentTeam = team.id
            await selectProject(currentProject)
            button.children().show()
            button.find('.spinner').hide()
            if (projectSelectionAllowed && projects.length > 0) {
                button.removeAttr('disabled')
            } else {
                button.find('.fa-caret-down').hide()
            }
        } catch (err) {
            console.warn('Failed to load instance list:', err.toString())
        }
    })
    return widget
}
