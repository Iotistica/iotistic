export interface EmailConfig {
    enabled: boolean;
    from?: string;
    debug?: boolean;
    smtp?: {
        host: string;
        port: number;
        secure?: boolean;
        auth?: {
            user: string;
            pass: string;
        };
    };
    transport?: any;
    ses?: {
        region: string;
        sourceArn?: string;
        fromArn?: string;
    };
}
export interface User {
    email: string;
    name?: string;
}
export interface EmailTemplate {
    subject: string;
    text: string;
    html: string;
}
export interface CompiledTemplate {
    subject: (context: any) => string;
    text: (context: any) => string;
    html: (context: any) => string;
}
export interface LogEntry {
    ts: number;
    level: string;
    msg: string;
}
export interface SanitizedText {
    text: string;
    html: string;
}
export interface SanitizedLog {
    text: Array<{
        timestamp: string;
        level: string;
        message: string;
    }>;
    html: Array<{
        timestamp: string;
        level: string;
        message: string;
    }>;
}
export interface MailOptions {
    to: string;
    subject: string;
    text: string;
    html: string;
}
export interface Logger {
    warn(message: string): void;
    info(message: string): void;
    error(message: string): void;
}
//# sourceMappingURL=types.d.ts.map