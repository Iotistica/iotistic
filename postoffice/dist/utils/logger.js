"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const winston_1 = __importDefault(require("winston"));
const path_1 = __importDefault(require("path"));
const logLevel = process.env.LOG_LEVEL || 'info';
const logFormat = process.env.LOG_FORMAT || 'json';
const prettyFormat = winston_1.default.format.printf(({ level, message, timestamp, ...metadata }) => {
    let msg = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    if (Object.keys(metadata).length > 0) {
        msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
});
const logger = winston_1.default.createLogger({
    level: logLevel,
    format: winston_1.default.format.combine(winston_1.default.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }), winston_1.default.format.errors({ stack: true }), logFormat === 'pretty'
        ? prettyFormat
        : winston_1.default.format.json()),
    defaultMeta: { service: 'postoffice' },
    transports: [
        new winston_1.default.transports.Console({
            format: winston_1.default.format.combine(logFormat === 'pretty' ? winston_1.default.format.colorize() : winston_1.default.format.uncolorize(), logFormat === 'pretty'
                ? prettyFormat
                : winston_1.default.format.json()),
        }),
        new winston_1.default.transports.File({
            filename: path_1.default.join(process.cwd(), 'logs', 'error.log'),
            level: 'error',
            maxsize: 10485760,
            maxFiles: 5,
        }),
        new winston_1.default.transports.File({
            filename: path_1.default.join(process.cwd(), 'logs', 'combined.log'),
            maxsize: 10485760,
            maxFiles: 10,
        }),
    ],
});
const fs_1 = require("fs");
try {
    (0, fs_1.mkdirSync)(path_1.default.join(process.cwd(), 'logs'), { recursive: true });
}
catch (error) {
}
exports.default = logger;
//# sourceMappingURL=logger.js.map