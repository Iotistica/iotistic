import RED from 'node-red'
import $ from 'jquery'
import { deviceSection } from './deviceSection'
// import { userSection } from './userSection'
import * as events from '../events'
import mainTemplate from '../templates/main.html'

events.on('instance', async (_instance) => {
    $('.ff-nr-tools-pane-stack').toggle(!!_instance)
    $('.ff-nr-tools-pane-placeholder').toggle(!_instance)
})

const mainPane = {
    id: 'main',
    onshow: () => {},
    content: () => {
        const pane = $(mainTemplate)
        const sections = RED.stack.create({
            container: pane.find('.ff-nr-tools-pane-stack'),
            singleExpanded: true
        })

        // RED.tabs.create({
        //     id: 'main-tabs-header',
        //     onchange: function (tab) {
        //         $('.device-tab-content').hide()
        //         $('#' + tab.id).show()
        //     }
        // })

        deviceSection(sections)
        // userSection(sections)
        return pane
    }
}

export {
    mainPane
}
