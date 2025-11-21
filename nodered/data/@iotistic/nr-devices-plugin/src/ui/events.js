const allHandlers = {}

function on (evt, func) {
    allHandlers[evt] = allHandlers[evt] || []
    allHandlers[evt].push(func)
}

function off (evt, func) {
    const handlers = allHandlers[evt]
    if (handlers) {
        for (let i = 0; i < handlers.length; i++) {
            if (handlers[i] === func) {
                handlers.splice(i, 1)
                return
            }
        }
    }
}

function emit () {
    const [evt, ...args] = arguments
    if (allHandlers[evt]) {
        for (let i = 0; i < allHandlers[evt].length; i++) {
            try {
                allHandlers[evt][i].apply(null, args)
            } catch (err) {
            }
        }
    }
}

export {
    on,
    off,
    emit
}
