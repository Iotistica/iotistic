/**
 * Email Logging Service
 * Persists email communication logs to PostgreSQL for audit trail
 */

import { query } from './db';
import logger from './utils/logger';

export interface EmailLogData {
  jobId: string;
  recipientEmail: string;
  recipientName?: string;
  templateName: string;
  subject?: string;
  metadata?: any;
  userId?: number;
}

export interface EmailLogUpdate {
  status: 'queued' | 'sent' | 'failed';
  errorMessage?: string;
}

/**
 * Create initial email log entry when email is queued
 */
export async function logEmailQueued(data: EmailLogData): Promise<number | null> {
  try {
    const result = await query<{ id: number }>(
      `INSERT INTO email_logs (
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
      RETURNING id`,
      [
        data.jobId,
        data.recipientEmail,
        data.recipientName,
        data.templateName,
        data.subject,
        data.metadata ? JSON.stringify(data.metadata) : null,
        data.userId,
      ]
    );

    const logId = result.rows[0]?.id;
    logger.debug('Email log created', { logId, jobId: data.jobId });
    return logId;
  } catch (error: any) {
    logger.error('Failed to log queued email', {
      jobId: data.jobId,
      error: error.message,
    });
    // Don't throw - logging failure should not block email sending
    return null;
  }
}

/**
 * Update email log when email is successfully sent
 */
export async function logEmailSent(jobId: string): Promise<void> {
  try {
    await query(
      `UPDATE email_logs 
       SET status = 'sent', 
           sent_at = NOW(),
           updated_at = NOW()
       WHERE job_id = $1`,
      [jobId]
    );
    logger.debug('Email log updated to sent', { jobId });
  } catch (error: any) {
    logger.error('Failed to update email log to sent', {
      jobId,
      error: error.message,
    });
  }
}

/**
 * Update email log when email fails to send
 */
export async function logEmailFailed(jobId: string, errorMessage: string): Promise<void> {
  try {
    await query(
      `UPDATE email_logs 
       SET status = 'failed', 
           error_message = $2,
           updated_at = NOW()
       WHERE job_id = $1`,
      [jobId, errorMessage]
    );
    logger.debug('Email log updated to failed', { jobId, error: errorMessage });
  } catch (error: any) {
    logger.error('Failed to update email log to failed', {
      jobId,
      error: error.message,
    });
  }
}

/**
 * Get email log by job ID
 */
export async function getEmailLog(jobId: string): Promise<any | null> {
  try {
    const result = await query(
      `SELECT * FROM email_logs WHERE job_id = $1`,
      [jobId]
    );
    return result.rows[0] || null;
  } catch (error: any) {
    logger.error('Failed to get email log', {
      jobId,
      error: error.message,
    });
    return null;
  }
}

/**
 * Get email logs for a recipient
 */
export async function getEmailLogsByRecipient(
  recipientEmail: string,
  limit: number = 50
): Promise<any[]> {
  try {
    const result = await query(
      `SELECT * FROM email_logs 
       WHERE recipient_email = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [recipientEmail, limit]
    );
    return result.rows;
  } catch (error: any) {
    logger.error('Failed to get email logs by recipient', {
      recipientEmail,
      error: error.message,
    });
    return [];
  }
}

/**
 * Get recent email logs
 */
export async function getRecentEmailLogs(limit: number = 100): Promise<any[]> {
  try {
    const result = await query(
      `SELECT * FROM email_logs 
       ORDER BY created_at DESC 
       LIMIT $1`,
      [limit]
    );
    return result.rows;
  } catch (error: any) {
    logger.error('Failed to get recent email logs', {
      error: error.message,
    });
    return [];
  }
}

/**
 * Get email stats
 */
export async function getEmailStats(): Promise<{
  total: number;
  sent: number;
  failed: number;
  queued: number;
}> {
  try {
    const result = await query(`
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
  } catch (error: any) {
    logger.error('Failed to get email stats', {
      error: error.message,
    });
    return { total: 0, sent: 0, failed: 0, queued: 0 };
  }
}
