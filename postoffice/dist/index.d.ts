import { EmailConfig, User, EmailTemplate, Logger } from './types';
export declare class PostOffice {
    private config;
    private logger;
    private baseUrl;
    private mailTransport?;
    private templates;
    private enabled;
    private readonly mailDefaults;
    private exportableSettings;
    constructor(config: EmailConfig, logger: Logger, baseUrl?: string);
    private isConfigured;
    private init;
    private initSMTP;
    private initTransport;
    private initSES;
    registerTemplate(templateName: string, template: EmailTemplate): void;
    private getTemplate;
    send(user: User, templateName: string, context?: any): Promise<void>;
    isEnabled(): boolean;
    getSettings(isAdmin?: boolean): Record<string, any> | boolean;
    close(): Promise<void>;
}
//# sourceMappingURL=index.d.ts.map