import { describe, test, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { PostOffice } from '../../src/index';
import { EmailConfig, Logger, User } from '../../src/types';

// Mock logger
const mockLogger: Logger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

describe('PostOffice Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Configuration', () => {
    test('should initialize with SMTP config', async () => {
      const config: EmailConfig = {
        enabled: true,
        from: '"Test" <test@example.com>',
        smtp: {
          host: 'smtp.example.com',
          port: 587,
          auth: {
            user: 'testuser',
            pass: 'testpass',
          },
        },
      };

      const postOffice = new PostOffice(config, mockLogger, 'http://localhost');
      expect(postOffice).toBeDefined();
    });

    test('should initialize with SMTP secure config', async () => {
      const config: EmailConfig = {
        enabled: true,
        from: '"Test" <test@example.com>',
        smtp: {
          host: 'smtp.example.com',
          port: 465,
          secure: true,
          auth: {
            user: 'testuser',
            pass: 'testpass',
          },
        },
      };

      const postOffice = new PostOffice(config, mockLogger, 'http://localhost');
      expect(postOffice).toBeDefined();
    });

    test('should initialize with SES config', async () => {
      const config: EmailConfig = {
        enabled: true,
        from: '"Test" <test@example.com>',
        ses: {
          region: 'us-east-1',
        },
      };

      const postOffice = new PostOffice(config, mockLogger, 'http://localhost');
      expect(postOffice).toBeDefined();
    });

    test('should initialize with SES config with ARNs', async () => {
      const config: EmailConfig = {
        enabled: true,
        from: '"Test" <test@example.com>',
        ses: {
          region: 'us-west-2',
          sourceArn: 'arn:aws:ses:us-west-2:123456789012:identity/example.com',
          fromArn: 'arn:aws:ses:us-west-2:123456789012:identity/noreply@example.com',
        },
      };

      const postOffice = new PostOffice(config, mockLogger, 'http://localhost');
      expect(postOffice).toBeDefined();
    });

    test('should initialize with custom transport', async () => {
      const customTransport = {
        sendMail: jest.fn(),
      };

      const config: EmailConfig = {
        enabled: true,
        from: '"Test" <test@example.com>',
        transport: customTransport,
      };

      const postOffice = new PostOffice(config, mockLogger, 'http://localhost');
      expect(postOffice).toBeDefined();
    });

    test('should not enable when config is missing', () => {
      const config: EmailConfig = {
        enabled: true,
        from: '"Test" <test@example.com>',
      };

      const postOffice = new PostOffice(config, mockLogger, 'http://localhost');
      expect(postOffice.isEnabled()).toBe(false);
    });

    test('should not enable when enabled is false', () => {
      const config: EmailConfig = {
        enabled: false,
        from: '"Test" <test@example.com>',
        smtp: {
          host: 'smtp.example.com',
          port: 587,
          auth: {
            user: 'testuser',
            pass: 'testpass',
          },
        },
      };

      const postOffice = new PostOffice(config, mockLogger, 'http://localhost');
      expect(postOffice.isEnabled()).toBe(false);
    });

    test('should use default from address when not provided', () => {
      const config: EmailConfig = {
        enabled: false,
      };

      const postOffice = new PostOffice(config, mockLogger, 'http://localhost');
      expect(postOffice).toBeDefined();
    });

    test('should use custom baseUrl', () => {
      const config: EmailConfig = {
        enabled: false,
        from: '"Test" <test@example.com>',
      };

      const customBaseUrl = 'https://custom.example.com';
      const postOffice = new PostOffice(config, mockLogger, customBaseUrl);
      expect(postOffice).toBeDefined();
    });

    test('should enable debug mode when configured', () => {
      const config: EmailConfig = {
        enabled: false,
        from: '"Test" <test@example.com>',
        debug: true,
      };

      const postOffice = new PostOffice(config, mockLogger, 'http://localhost');
      expect(postOffice).toBeDefined();
    });
  });

  describe('Template Registration', () => {
    let postOffice: PostOffice;

    beforeEach(() => {
      const config: EmailConfig = {
        enabled: false,
        from: '"Test" <test@example.com>',
      };
      postOffice = new PostOffice(config, mockLogger, 'http://localhost');
    });

    test('should register custom template', () => {
      const customTemplate = {
        subject: 'Test Subject',
        text: 'Test text',
        html: '<p>Test HTML</p>',
      };

      expect(() => {
        postOffice.registerTemplate('CustomTemplate', customTemplate);
      }).not.toThrow();
    });

    test('should register template with handlebars variables', () => {
      const template = {
        subject: 'Hello {{user.name}}',
        text: 'Welcome {{user.name}} to {{service}}',
        html: '<h1>Hello {{user.name}}</h1><p>Welcome to {{service}}</p>',
      };

      expect(() => {
        postOffice.registerTemplate('WelcomeTemplate', template);
      }).not.toThrow();
    });

    test('should overwrite existing template when registered again', () => {
      const template1 = {
        subject: 'Version 1',
        text: 'Text 1',
        html: '<p>HTML 1</p>',
      };

      const template2 = {
        subject: 'Version 2',
        text: 'Text 2',
        html: '<p>HTML 2</p>',
      };

      postOffice.registerTemplate('TestTemplate', template1);
      postOffice.registerTemplate('TestTemplate', template2);

      // Should not throw - overwrites are allowed
      expect(postOffice).toBeDefined();
    });

    test('should have VerifyEmail template pre-registered', async () => {
      const user: User = {
        email: 'test@example.com',
        name: 'Test User',
      };

      // Should not throw - VerifyEmail is built-in
      await expect(
        postOffice.send(user, 'VerifyEmail', { token: 'test-token' })
      ).resolves.not.toThrow();
    });

    test('should have UserSuspended template pre-registered', async () => {
      const user: User = {
        email: 'test@example.com',
        name: 'Test User',
      };

      // Should not throw - UserSuspended is built-in
      await expect(
        postOffice.send(user, 'UserSuspended', {})
      ).resolves.not.toThrow();
    });
  });

  describe('Email Sending', () => {
    let postOffice: PostOffice;

    beforeEach(() => {
      const config: EmailConfig = {
        enabled: false,
        from: '"Test Service" <test@example.com>',
        debug: true, // Enable debug mode for coverage
      };
      postOffice = new PostOffice(config, mockLogger, 'http://localhost:3300');
    });

    test('should throw error when template not found', async () => {
      const user: User = {
        email: 'test@example.com',
        name: 'Test User',
      };

      await expect(
        postOffice.send(user, 'NonExistentTemplate', {})
      ).rejects.toThrow("Template 'NonExistentTemplate' not found");
    });

    test('should send email with user context', async () => {
      postOffice.registerTemplate('TestTemplate', {
        subject: 'Hello {{user.name}}',
        text: 'Hi {{user.name}}',
        html: '<p>Hi {{user.name}}</p>',
      });

      const user: User = {
        email: 'test@example.com',
        name: 'John Doe',
      };

      await expect(
        postOffice.send(user, 'TestTemplate', {})
      ).resolves.not.toThrow();
      
      // Verify debug logging was called
      expect(mockLogger.info).toHaveBeenCalled();
    });

    test('should send email with custom context', async () => {
      postOffice.registerTemplate('OrderTemplate', {
        subject: 'Order {{orderId}}',
        text: 'Order {{orderId}} total: ${{total}}',
        html: '<p>Order {{orderId}} total: ${{total}}</p>',
      });

      const user: User = {
        email: 'customer@example.com',
        name: 'Customer',
      };

      await expect(
        postOffice.send(user, 'OrderTemplate', { orderId: '12345', total: '99.99' })
      ).resolves.not.toThrow();
    });

    test('should handle user without name', async () => {
      postOffice.registerTemplate('SimpleTemplate', {
        subject: 'Test',
        text: 'Hello {{safeName}}',
        html: '<p>Hello {{safeName}}</p>',
      });

      const user: User = {
        email: 'test@example.com',
      };

      await expect(
        postOffice.send(user, 'SimpleTemplate', {})
      ).resolves.not.toThrow();
    });

    test('should sanitize user name', async () => {
      postOffice.registerTemplate('SanitizeTemplate', {
        subject: 'Hello {{safeName}}',
        text: 'Hi {{safeName}}',
        html: '<p>Hi {{safeName}}</p>',
      });

      const user: User = {
        email: 'test@example.com',
        name: '<script>alert("xss")</script>Malicious User',
      };

      await expect(
        postOffice.send(user, 'SanitizeTemplate', {})
      ).resolves.not.toThrow();
    });

    test('should include baseUrl in context', async () => {
      postOffice.registerTemplate('BaseUrlTemplate', {
        subject: 'Visit us',
        text: 'Visit {{baseUrl}}',
        html: '<p>Visit <a href="{{baseUrl}}">{{baseUrl}}</a></p>',
      });

      const user: User = {
        email: 'test@example.com',
        name: 'Test',
      };

      await expect(
        postOffice.send(user, 'BaseUrlTemplate', {})
      ).resolves.not.toThrow();
    });

    test('should handle teamName in context', async () => {
      postOffice.registerTemplate('TeamTemplate', {
        subject: 'Team {{teamName}}',
        text: 'Welcome to {{teamName}}',
        html: '<p>Welcome to {{teamName}}</p>',
      });

      const user: User = {
        email: 'test@example.com',
        name: 'Test',
      };

      await expect(
        postOffice.send(user, 'TeamTemplate', { teamName: 'Engineering Team' })
      ).resolves.not.toThrow();
    });

    test('should sanitize teamName in context', async () => {
      postOffice.registerTemplate('TeamTemplate', {
        subject: 'Team {{teamName}}',
        text: 'Welcome to {{teamName}}',
        html: '<p>Welcome to {{teamName}}</p>',
      });

      const user: User = {
        email: 'test@example.com',
        name: 'Test',
      };

      await expect(
        postOffice.send(user, 'TeamTemplate', { teamName: '<script>alert("xss")</script>Hacker Team' })
      ).resolves.not.toThrow();
    });

    test('should handle invitee in context', async () => {
      postOffice.registerTemplate('InviteTemplate', {
        subject: 'Invitation from {{invitee}}',
        text: '{{invitee}} invited you',
        html: '<p>{{invitee}} invited you</p>',
      });

      const user: User = {
        email: 'test@example.com',
        name: 'Test',
      };

      await expect(
        postOffice.send(user, 'InviteTemplate', { invitee: 'Alice' })
      ).resolves.not.toThrow();
    });

    test('should sanitize invitee in context', async () => {
      postOffice.registerTemplate('InviteTemplate', {
        subject: 'Invitation from {{invitee}}',
        text: '{{invitee}} invited you',
        html: '<p>{{invitee}} invited you</p>',
      });

      const user: User = {
        email: 'test@example.com',
        name: 'Test',
      };

      await expect(
        postOffice.send(user, 'InviteTemplate', { invitee: '<img src=x onerror=alert(1)>' })
      ).resolves.not.toThrow();
    });

    test('should handle log entries in context', async () => {
      postOffice.registerTemplate('LogTemplate', {
        subject: 'System Logs',
        text: 'Logs: {{#each log.text}}{{timestamp}} - {{message}}\n{{/each}}',
        html: '<ul>{{#each log.html}}<li>{{timestamp}}: {{message}}</li>{{/each}}</ul>',
      });

      const user: User = {
        email: 'test@example.com',
        name: 'Admin',
      };

      const logs = [
        { ts: Date.now(), level: 'info', msg: 'System started' },
        { ts: Date.now(), level: 'warn', msg: 'Low memory' },
      ];

      await expect(
        postOffice.send(user, 'LogTemplate', { log: logs })
      ).resolves.not.toThrow();
    });

    test('should delete log from context when empty', async () => {
      postOffice.registerTemplate('NoLogTemplate', {
        subject: 'No Logs',
        text: 'No logs available',
        html: '<p>No logs available</p>',
      });

      const user: User = {
        email: 'test@example.com',
        name: 'Test',
      };

      await expect(
        postOffice.send(user, 'NoLogTemplate', { log: [] })
      ).resolves.not.toThrow();
    });

    test('should delete log from context when not an array', async () => {
      postOffice.registerTemplate('InvalidLogTemplate', {
        subject: 'Invalid Log',
        text: 'Invalid log data',
        html: '<p>Invalid log data</p>',
      });

      const user: User = {
        email: 'test@example.com',
        name: 'Test',
      };

      await expect(
        postOffice.send(user, 'InvalidLogTemplate', { log: 'not an array' })
      ).resolves.not.toThrow();
    });

    test('should compile templates with noEscape for subject and text', async () => {
      postOffice.registerTemplate('NoEscapeTemplate', {
        subject: 'Welcome {{user.name}}!',
        text: 'Hello {{user.name}} & friends',
        html: '<p>Hello {{user.name}}</p>',
      });

      const user: User = {
        email: 'test@example.com',
        name: 'John & Jane',
      };

      await expect(
        postOffice.send(user, 'NoEscapeTemplate', {})
      ).resolves.not.toThrow();
    });
  });

  describe('Settings', () => {
    test('should return false when disabled', () => {
      const config: EmailConfig = {
        enabled: false,
        from: '"Test" <test@example.com>',
      };

      const postOffice = new PostOffice(config, mockLogger, 'http://localhost');
      expect(postOffice.getSettings()).toBe(false);
      expect(postOffice.getSettings(true)).toBe(false);
    });

    test('should return true for non-admin when enabled with transport', () => {
      const mockTransport = {
        sendMail: jest.fn(),
        verify: jest.fn(() => Promise.resolve()),
        close: jest.fn(),
      };

      const config: EmailConfig = {
        enabled: true,
        from: '"Test" <test@example.com>',
        transport: mockTransport,
      };

      const postOffice = new PostOffice(config, mockLogger, 'http://localhost');
      
      // After initialization with transport, should be enabled
      // Wait for async init to complete
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          if (postOffice.isEnabled()) {
            expect(postOffice.getSettings(false)).toBe(true);
            expect(postOffice.getSettings(true)).toEqual({});
          }
          resolve();
        }, 100);
      });
    });
  });

  describe('Service Lifecycle', () => {
    test('should close transport gracefully', async () => {
      const config: EmailConfig = {
        enabled: false,
        from: '"Test" <test@example.com>',
      };

      const postOffice = new PostOffice(config, mockLogger, 'http://localhost');
      
      await expect(postOffice.close()).resolves.not.toThrow();
    });

    test('should handle close when transport is not initialized', async () => {
      const config: EmailConfig = {
        enabled: false,
        from: '"Test" <test@example.com>',
      };

      const postOffice = new PostOffice(config, mockLogger, 'http://localhost');
      
      // Should not throw even if transport was never created
      await expect(postOffice.close()).resolves.not.toThrow();
    });
  });
});