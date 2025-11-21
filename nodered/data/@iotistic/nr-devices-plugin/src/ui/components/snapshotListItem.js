import $ from 'jquery'
import RED from 'node-red'

const itemTemplate = `
<div class="ff-nr-tools-snapshot">
    <div>
        <div class="ff-nr-tools-snapshot-user"><img></div>
        <div><i class="fa fa-angle-right"></i> <div class="ff-nr-tools-snapshot-name"></div></div>
    </div>
    <div>
        <div class="ff-nr-tools-snapshot-id"></div>
        <div class="ff-nr-tools-snapshot-created"></div>
    </div>
    <div>
        <div class="ff-nr-tools-snapshot-description"></div>
    </div>
</div>
`

export function SnapshotListItem (data) {
    const content = $(itemTemplate)
    content.on('click', function (evt) {
        if (content.hasClass('expanded')) {
            content.removeClass('expanded')
        } else {
            $('.ff-nr-tools-snapshot').removeClass('expanded')
            content.addClass('expanded')
        }
    })
    content.find('img').attr('src', data.user.avatar)
    content.find('.ff-nr-tools-snapshot-name').text(data.name)
    if (data.description) {
        content.find('.ff-nr-tools-snapshot-description').text(data.description)
    } else {
        content.find('.ff-nr-tools-snapshot-description').css('color', 'var(--red-ui-secondary-text-color)').html('<i>no further description</i>')
    }
    content.find('.ff-nr-tools-snapshot-id').text(data.id)
    content.find('.ff-nr-tools-snapshot-created').text(humanizeSinceDate(new Date(data.createdAt).getTime()))
    return content
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
