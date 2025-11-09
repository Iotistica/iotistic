import { SanitizedText, SanitizedLog, LogEntry } from './types';

/**
 * Generates email-safe versions (both text and html) of a piece of text.
 * This is intended to make user-provided strings (eg username) that may look
 * like a URL to not looks like a URL to an email client
 */
export function sanitizeText(value: string): SanitizedText {
  return {
    text: value.replace(/\./g, ' '),
    html: value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\./g, '<br style="display: none;"/>.')
  };
}

/**
 * Generates email-safe versions (both text and html) of a log array
 * This is intended to make iso time strings and and sanitized log messages
 */
export function sanitizeLog(log: LogEntry[]): SanitizedLog {
  const isoTime = (ts: number): string => {
    if (!ts) return '';
    try {
      let timestamp = ts;
      // cater for ts with a 4 digit counter appended to the timestamp
      if (ts > 99999999999999) {
        timestamp = ts / 10000;
      }
      const dt = new Date(timestamp);
      let str = dt.toISOString().replace('T', ' ').replace('Z', '');
      str = str.substring(0, str.length - 4); // remove milliseconds
      return str;
    } catch (e) {
      return '';
    }
  };

  const htmlEscape = (str: string): string => 
    (str + '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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