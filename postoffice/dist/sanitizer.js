"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeText = sanitizeText;
exports.sanitizeLog = sanitizeLog;
function sanitizeText(value) {
    return {
        text: value.replace(/\./g, ' '),
        html: value
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\./g, '<br style="display: none;"/>.')
    };
}
function sanitizeLog(log) {
    const isoTime = (ts) => {
        if (!ts)
            return '';
        try {
            let timestamp = ts;
            if (ts > 99999999999999) {
                timestamp = ts / 10000;
            }
            const dt = new Date(timestamp);
            let str = dt.toISOString().replace('T', ' ').replace('Z', '');
            str = str.substring(0, str.length - 4);
            return str;
        }
        catch (e) {
            return '';
        }
    };
    const htmlEscape = (str) => (str + '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return {
        text: log.map(entry => ({
            timestamp: entry.ts ? isoTime(+entry.ts) : '',
            level: entry.level || '',
            message: entry.msg || ''
        })),
        html: log.map(entry => ({
            timestamp: entry.ts ? isoTime(+entry.ts) : '',
            level: htmlEscape(entry.level || ''),
            message: htmlEscape(entry.msg || '')
        }))
    };
}
//# sourceMappingURL=sanitizer.js.map