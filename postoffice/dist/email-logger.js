"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logEmailQueued = logEmailQueued;
exports.logEmailSent = logEmailSent;
exports.logEmailFailed = logEmailFailed;
exports.getEmailLog = getEmailLog;
exports.getEmailLogsByRecipient = getEmailLogsByRecipient;
exports.getRecentEmailLogs = getRecentEmailLogs;
exports.getEmailStats = getEmailStats;
const db_1 = require("./db");
const logger_1 = __importDefault(require("./utils/logger"));
async function logEmailQueued(data) {
    try {
        const result = await (0, db_1.query)(`INSERT INTO email_logs (
        job_id,
        recipient_email,
        recipient_name,
        template_name,
        subject,
        status,
        metadata,
        user_id,
        queued_at
      ) VALUES ($1, $2, $3, $4, $5, 'queued', $6, $7, NOW())
      RETURNING id`, [
            data.jobId,
            data.recipientEmail,
            data.recipientName,
            data.templateName,
            data.subject,
            data.metadata ? JSON.stringify(data.metadata) : null,
            data.userId,
        ]);
        const logId = result.rows[0]?.id;
        logger_1.default.debug('Email log created', { logId, jobId: data.jobId });
        return logId;
    }
    catch (error) {
        logger_1.default.error('Failed to log queued email', {
            jobId: data.jobId,
            error: error.message,
        });
        return null;
    }
}
async function logEmailSent(jobId) {
    try {
        await (0, db_1.query)(`UPDATE email_logs 
       SET status = 'sent', 
           sent_at = NOW(),
           updated_at = NOW()
       WHERE job_id = $1`, [jobId]);
        logger_1.default.debug('Email log updated to sent', { jobId });
    }
    catch (error) {
        logger_1.default.error('Failed to update email log to sent', {
            jobId,
            error: error.message,
        });
    }
}
async function logEmailFailed(jobId, errorMessage) {
    try {
        await (0, db_1.query)(`UPDATE email_logs 
       SET status = 'failed', 
           error_message = $2,
           updated_at = NOW()
       WHERE job_id = $1`, [jobId, errorMessage]);
        logger_1.default.debug('Email log updated to failed', { jobId, error: errorMessage });
    }
    catch (error) {
        logger_1.default.error('Failed to update email log to failed', {
            jobId,
            error: error.message,
        });
    }
}
async function getEmailLog(jobId) {
    try {
        const result = await (0, db_1.query)(`SELECT * FROM email_logs WHERE job_id = $1`, [jobId]);
        return result.rows[0] || null;
    }
    catch (error) {
        logger_1.default.error('Failed to get email log', {
            jobId,
            error: error.message,
        });
        return null;
    }
}
async function getEmailLogsByRecipient(recipientEmail, limit = 50) {
    try {
        const result = await (0, db_1.query)(`SELECT * FROM email_logs 
       WHERE recipient_email = $1 
       ORDER BY created_at DESC 
       LIMIT $2`, [recipientEmail, limit]);
        return result.rows;
    }
    catch (error) {
        logger_1.default.error('Failed to get email logs by recipient', {
            recipientEmail,
            error: error.message,
        });
        return [];
    }
}
async function getRecentEmailLogs(limit = 100) {
    try {
        const result = await (0, db_1.query)(`SELECT * FROM email_logs 
       ORDER BY created_at DESC 
       LIMIT $1`, [limit]);
        return result.rows;
    }
    catch (error) {
        logger_1.default.error('Failed to get recent email logs', {
            error: error.message,
        });
        return [];
    }
}
async function getEmailStats() {
    try {
        const result = await (0, db_1.query)(`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'sent') as sent,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'queued') as queued
      FROM email_logs
    `);
        return {
            total: parseInt(result.rows[0].total),
            sent: parseInt(result.rows[0].sent),
            failed: parseInt(result.rows[0].failed),
            queued: parseInt(result.rows[0].queued),
        };
    }
    catch (error) {
        logger_1.default.error('Failed to get email stats', {
            error: error.message,
        });
        return { total: 0, sent: 0, failed: 0, queued: 0 };
    }
}
//# sourceMappingURL=email-logger.js.map