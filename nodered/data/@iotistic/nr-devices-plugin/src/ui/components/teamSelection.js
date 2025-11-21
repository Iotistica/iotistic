import $ from 'jquery'
import RED from 'node-red'
import * as api from '../api.js'
import * as events from '../events.js'

export function TeamSelectionWidget () {
    let currentTeam = ''
    let teams = []
    const widget = $('<span>')
    const button = $('<button type="button" style="padding: 1px 1px 1px 5px;" class="red-ui-sidebar-header-button"><i style="position: relative; top: 1px; margin-left: -2px;" class="fa fa-caret-down"></i> <img style="height:21px">  <i style="margin: 4px 3px 3px 1px" class="spinner"></i></button>')
    button.appendTo(widget)
    button.on('click', function (evt) {
        RED.popover.menu({
            options: teams.map(t => {
                const l = $('<span>')
                $('<img>').css({ height: '16px' }).attr('src', t.avatar).appendTo(l)
                $('<span>').css({ paddingLeft: '4px' }).text(t.name).appendTo(l)
                return {
                    label: l,
                    id: t.id
                }
            }),
            width: 200,
            onselect: (item) => {
                selectTeam(item.id)
            }
        }).show({ target: widget })
    })
    widget.hide()

    function selectTeam (id) {
        const team = teams.find(team => team.id === id)
        if (team) {
            widget.find('img').attr('src', team.avatar)
            currentTeam = id
            events.emit('team', team)
        }
    }

    function getTeam (teamId) {
        return teams.find(t => t.id === teamId)
    }
    events.on('connection-state', async function (state) {
        if (!state) {
            widget.hide()
            return
        }
        const projectSelectionAllowed = api.getSettings().allowProjectSelection !== false
        button.children().hide()
        button.attr('disabled', 'disabled')
        button.find('.spinner').show()
        widget.show()
        try {
            const teamList = await api.getUserTeams()
            const settings = api.getSettings()
            if (teamList.teams) {
                teams = [...teamList.teams]
            }
            const activeTeam = getTeam(currentTeam) ||
                                getTeam(settings.team) ||
                                getTeam(settings.user?.defaultTeam) ||
                                getTeam(teams[0]?.id)
            selectTeam(activeTeam?.id)
            button.children().show()
            button.find('.spinner').hide()
            if (projectSelectionAllowed) {
                button.removeAttr('disabled')
            } else {
                button.find('.fa-caret-down').hide()
            }
        } catch (err) {
            console.warn('Failed to load project list:', err.toString())
        }
    })
    return widget
}
