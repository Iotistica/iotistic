export function userSection (sections) {
    const sectionUsers = sections.add({
        title: 'Users'
    })

    sectionUsers.expand()
    sectionUsers.content.css({
        height: '100%',
        display: 'flex',
        'flex-direction': 'column'
    })
}
