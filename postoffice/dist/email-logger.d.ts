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
export declare function logEmailQueued(data: EmailLogData): Promise<number | null>;
export declare function logEmailSent(jobId: string): Promise<void>;
export declare function logEmailFailed(jobId: string, errorMessage: string): Promise<void>;
export declare function getEmailLog(jobId: string): Promise<any | null>;
export declare function getEmailLogsByRecipient(recipientEmail: string, limit?: number): Promise<any[]>;
export declare function getRecentEmailLogs(limit?: number): Promise<any[]>;
export declare function getEmailStats(): Promise<{
    total: number;
    sent: number;
    failed: number;
    queued: number;
}>;
//# sourceMappingURL=email-logger.d.ts.map