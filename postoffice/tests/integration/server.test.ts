import { describe, test, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import Queue from 'bull';
import { PostOffice } from '../../src/index';
import { EmailConfig, User } from '../../src/types';
import logger from '../../src/utils/logger';

// Mock Bull queue
let mockQueue: any;
let queueJobs: any[] = [];

const createMockQueue = () => {
  queueJobs = [];
  
  return {
    add: async (data: any) => {
      const jobId = String(queueJobs.length + 1);
      const job = {
        id: jobId,
        data,
        attemptsMade: 0,
        timestamp: Date.now(),
        failedReason: null,
        retry: async () => {
          return job;
        },
      };
      queueJobs.push(job);
      return job;
    },
    getWaitingCount: async () => queueJobs.filter(j => !j.processed).length,
    getActiveCount: async () => 0,
    getCompletedCount: async () => queueJobs.filter(j => j.processed && !j.failed).length,
    getFailedCount: async () => queueJobs.filter(j => j.failed).length,
    getFailed: async () => queueJobs.filter(j => j.failed),
    getJob: async (id: string) => queueJobs.find(j => j.id === id) || null,
  };
};

// Mock email logger functions
const mockEmailLogs: any[] = [];

const mockLogEmailQueued = async (data: any) => {
  mockEmailLogs.push({
    job_id: data.jobId,
    recipient_email: data.recipientEmail,
    recipient_name: data.recipientName,
    template_name: data.templateName,
    status: 'queued',
    queued_at: new Date().toISOString(),
    metadata: data.metadata,
  });
};

const mockLogEmailSent = async (jobId: string) => {
  const log = mockEmailLogs.find(l => l.job_id === jobId);
  if (log) {
    log.status = 'sent';
    log.sent_at = new Date().toISOString();
  }
};

const mockLogEmailFailed = async (jobId: string, error: string) => {
  const log = mockEmailLogs.find(l => l.job_id === jobId);
  if (log) {
    log.status = 'failed';
    log.failed_at = new Date().toISOString();
    log.error_message = error;
  }
};

const mockGetEmailLog = async (jobId: string) => {
  return mockEmailLogs.find(l => l.job_id === jobId) || null;
};

const mockGetEmailLogsByRecipient = async (email: string, limit: number) => {
  return mockEmailLogs.filter(l => l.recipient_email === email).slice(0, limit);
};

const mockGetRecentEmailLogs = async (limit: number) => {
  return mockEmailLogs.slice(-limit);
};

const mockGetEmailStats = async () => {
  return {
    total: mockEmailLogs.length,
    queued: mockEmailLogs.filter(l => l.status === 'queued').length,
    sent: mockEmailLogs.filter(l => l.status === 'sent').length,
    failed: mockEmailLogs.filter(l => l.status === 'failed').length,
  };
};

// Create a full test server with all endpoints
const createTestApp = (emailConfig: EmailConfig) => {
  const app = express();
  app.use(cors());
  app.use(express.json());

  const postOffice = new PostOffice(emailConfig, logger, 'http://localhost:3300');
  mockQueue = createMockQueue();

  // Health endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      service: 'postoffice',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      email: {
        enabled: postOffice.isEnabled(),
        settings: postOffice.getSettings(),
      },
    });
  });

  // Readiness endpoint
  app.get('/ready', async (req, res) => {
    try {
      res.json({
        status: 'ready',
        email: postOffice.isEnabled(),
        queue: 'connected',
      });
    } catch (error: any) {
      res.status(503).json({
        status: 'not ready',
        error: error.message,
      });
    }
  });

  // Root endpoint
  app.get('/', (req, res) => {
    res.json({
      service: 'iotistic-postoffice',
      version: '1.0.1',
      description: 'Standalone email service with queue processing',
      endpoints: {
        health: '/health',
        ready: '/ready',
        send: 'POST /api/email/send',
        stats: '/api/email/stats',
        failed: '/api/email/failed',
        retry: 'POST /api/email/retry/:jobId',
        logs: '/api/email/logs',
        logsByJobId: '/api/email/logs/:jobId',
        logsByRecipient: '/api/email/logs/recipient/:email',
        logsStats: '/api/email/logs/stats',
      },
    });
  });

  // Send email endpoint
  app.post('/api/email/send', async (req, res) => {
    try {
      const { user, templateName, context } = req.body;

      if (!user || !user.email) {
        return res.status(400).json({ error: 'User with email is required' });
      }

      if (!templateName) {
        return res.status(400).json({ error: 'Template name is required' });
      }

      // Add to mock queue
      const job = await mockQueue.add({
        user,
        templateName,
        context: context || {},
      });

      // Log to mock database
      await mockLogEmailQueued({
        jobId: String(job.id),
        recipientEmail: user.email,
        recipientName: user.name,
        templateName,
        metadata: context,
      });

      res.json({
        message: 'Email queued successfully',
        jobId: job.id,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get queue stats
  app.get('/api/email/stats', async (req, res) => {
    try {
      const [waiting, active, completed, failed] = await Promise.all([
        mockQueue.getWaitingCount(),
        mockQueue.getActiveCount(),
        mockQueue.getCompletedCount(),
        mockQueue.getFailedCount(),
      ]);

      res.json({
        queue: {
          waiting,
          active,
          completed,
          failed,
          total: waiting + active + completed + failed,
        },
        email: {
          enabled: postOffice.isEnabled(),
          settings: postOffice.getSettings(true),
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get failed jobs
  app.get('/api/email/failed', async (req, res) => {
    try {
      const failed = await mockQueue.getFailed();
      res.json({
        count: failed.length,
        jobs: failed.map((job: any) => ({
          id: job.id,
          data: job.data,
          failedReason: job.failedReason,
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp,
        })),
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Retry failed job
  app.post('/api/email/retry/:jobId', async (req, res) => {
    try {
      const { jobId } = req.params;
      const job = await mockQueue.getJob(jobId);

      if (!job) {
        return res.status(404).json({ error: 'Job not found' });
      }

      await job.retry();
      res.json({ message: 'Job queued for retry', jobId });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get email logs (recent)
  app.get('/api/email/logs', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = await mockGetRecentEmailLogs(limit);
      res.json({
        count: logs.length,
        logs,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get email statistics (MUST come before :jobId route)
  app.get('/api/email/logs/stats', async (req, res) => {
    try {
      const stats = await mockGetEmailStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get email logs by recipient (MUST come before :jobId route)
  app.get('/api/email/logs/recipient/:email', async (req, res) => {
    try {
      const { email } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const logs = await mockGetEmailLogsByRecipient(email, limit);
      res.json({
        count: logs.length,
        recipient: email,
        logs,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Get email log by job ID (MUST come AFTER specific routes)
  app.get('/api/email/logs/:jobId', async (req, res) => {
    try {
      const { jobId } = req.params;
      const log = await mockGetEmailLog(jobId);
      
      if (!log) {
        return res.status(404).json({ error: 'Email log not found' });
      }
      
      res.json(log);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // 404 handler
  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  return { app, postOffice };
};

describe('PostOffice Server Integration Tests', () => {
  beforeEach(() => {
    queueJobs.length = 0;
    mockEmailLogs.length = 0;
  });

  describe('Basic Endpoints', () => {
    let app: express.Application;
    let postOffice: PostOffice;

    beforeAll(() => {
      const emailConfig: EmailConfig = {
        enabled: false,
        from: '"Test Service" <test@example.com>',
      };
      const result = createTestApp(emailConfig);
      app = result.app;
      postOffice = result.postOffice;
    });

    describe('GET /', () => {
      test('should return service information', async () => {
        const response = await request(app).get('/');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('service', 'iotistic-postoffice');
        expect(response.body).toHaveProperty('version');
        expect(response.body).toHaveProperty('description');
        expect(response.body).toHaveProperty('endpoints');
      });

      test('should include all API endpoints in response', async () => {
        const response = await request(app).get('/');

        expect(response.body.endpoints).toHaveProperty('health');
        expect(response.body.endpoints).toHaveProperty('send');
        expect(response.body.endpoints).toHaveProperty('stats');
        expect(response.body.endpoints).toHaveProperty('logs');
      });
    });

    describe('GET /health', () => {
      test('should return healthy status', async () => {
        const response = await request(app).get('/health');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('status', 'healthy');
        expect(response.body).toHaveProperty('service', 'postoffice');
        expect(response.body).toHaveProperty('uptime');
        expect(response.body).toHaveProperty('timestamp');
        expect(response.body).toHaveProperty('email');
      });

      test('should include email configuration status', async () => {
        const response = await request(app).get('/health');

        expect(response.status).toBe(200);
        expect(response.body.email).toHaveProperty('enabled');
        expect(response.body.email).toHaveProperty('settings');
        expect(response.body.email.enabled).toBe(false);
      });

      test('should return valid timestamp', async () => {
        const response = await request(app).get('/health');
        const timestamp = new Date(response.body.timestamp);

        expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
        expect(timestamp.getTime()).toBeGreaterThan(Date.now() - 5000);
      });
    });

    describe('GET /ready', () => {
      test('should return readiness status', async () => {
        const response = await request(app).get('/ready');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('status', 'ready');
        expect(response.body).toHaveProperty('email');
        expect(response.body).toHaveProperty('queue');
      });

      test('should indicate queue is connected', async () => {
        const response = await request(app).get('/ready');

        expect(response.body.queue).toBe('connected');
      });
    });

    describe('404 Handler', () => {
      test('should return 404 for unknown routes', async () => {
        const response = await request(app).get('/nonexistent-route');

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('error', 'Not found');
      });

      test('should return 404 for invalid API paths', async () => {
        const response = await request(app).get('/api/invalid');

        expect(response.status).toBe(404);
      });
    });
  });

  describe('Email Queue Operations', () => {
    let app: express.Application;

    beforeAll(() => {
      const emailConfig: EmailConfig = {
        enabled: false,
        from: '"Test" <test@example.com>',
      };
      const result = createTestApp(emailConfig);
      app = result.app;
    });

    describe('POST /api/email/send', () => {
      test('should queue email successfully', async () => {
        const response = await request(app)
          .post('/api/email/send')
          .send({
            user: { email: 'test@example.com', name: 'Test User' },
            templateName: 'VerifyEmail',
            context: { token: 'test-token' },
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('message', 'Email queued successfully');
        expect(response.body).toHaveProperty('jobId');
      });

      test('should return 400 when user is missing', async () => {
        const response = await request(app)
          .post('/api/email/send')
          .send({ templateName: 'VerifyEmail' });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'User with email is required');
      });

      test('should return 400 when email is missing', async () => {
        const response = await request(app)
          .post('/api/email/send')
          .send({ user: { name: 'Test' }, templateName: 'VerifyEmail' });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'User with email is required');
      });

      test('should return 400 when template name is missing', async () => {
        const response = await request(app)
          .post('/api/email/send')
          .send({ user: { email: 'test@example.com' } });

        expect(response.status).toBe(400);
        expect(response.body).toHaveProperty('error', 'Template name is required');
      });

      test('should handle empty context', async () => {
        const response = await request(app)
          .post('/api/email/send')
          .send({
            user: { email: 'test@example.com', name: 'Test' },
            templateName: 'VerifyEmail',
          });

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('jobId');
      });

      test('should log email to database', async () => {
        const response = await request(app)
          .post('/api/email/send')
          .send({
            user: { email: 'logger@example.com', name: 'Logger Test' },
            templateName: 'VerifyEmail',
            context: { token: 'abc123' },
          });

        expect(response.status).toBe(200);
        expect(mockEmailLogs.length).toBeGreaterThan(0);
        
        const log = mockEmailLogs[mockEmailLogs.length - 1];
        expect(log.recipient_email).toBe('logger@example.com');
        expect(log.template_name).toBe('VerifyEmail');
        expect(log.status).toBe('queued');
      });
    });

    describe('GET /api/email/stats', () => {
      test('should return queue statistics', async () => {
        const response = await request(app).get('/api/email/stats');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('queue');
        expect(response.body).toHaveProperty('email');
      });

      test('should include all queue counters', async () => {
        const response = await request(app).get('/api/email/stats');

        expect(response.body.queue).toHaveProperty('waiting');
        expect(response.body.queue).toHaveProperty('active');
        expect(response.body.queue).toHaveProperty('completed');
        expect(response.body.queue).toHaveProperty('failed');
        expect(response.body.queue).toHaveProperty('total');
      });

      test('should show correct queue counts after adding jobs', async () => {
        await request(app)
          .post('/api/email/send')
          .send({
            user: { email: 'test1@example.com', name: 'Test 1' },
            templateName: 'VerifyEmail',
          });

        await request(app)
          .post('/api/email/send')
          .send({
            user: { email: 'test2@example.com', name: 'Test 2' },
            templateName: 'VerifyEmail',
          });

        const response = await request(app).get('/api/email/stats');

        expect(response.body.queue.waiting).toBeGreaterThanOrEqual(2);
      });

      test('should include email settings', async () => {
        const response = await request(app).get('/api/email/stats');

        expect(response.body.email).toHaveProperty('enabled');
        expect(response.body.email).toHaveProperty('settings');
      });
    });

    describe('GET /api/email/failed', () => {
      test('should return empty list when no failed jobs', async () => {
        const response = await request(app).get('/api/email/failed');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('count', 0);
        expect(response.body).toHaveProperty('jobs');
        expect(Array.isArray(response.body.jobs)).toBe(true);
      });

      test('should return failed jobs with details', async () => {
        // Add a job and mark it as failed
        const job = await mockQueue.add({
          user: { email: 'fail@example.com', name: 'Fail Test' },
          templateName: 'VerifyEmail',
        });
        job.failed = true;
        job.failedReason = 'SMTP connection timeout';

        const response = await request(app).get('/api/email/failed');

        expect(response.status).toBe(200);
        expect(response.body.count).toBe(1);
        expect(response.body.jobs[0]).toHaveProperty('id');
        expect(response.body.jobs[0]).toHaveProperty('data');
        expect(response.body.jobs[0]).toHaveProperty('failedReason');
      });
    });

    describe('POST /api/email/retry/:jobId', () => {
      test('should retry a failed job', async () => {
        // Add a job
        const addResponse = await request(app)
          .post('/api/email/send')
          .send({
            user: { email: 'retry@example.com', name: 'Retry Test' },
            templateName: 'VerifyEmail',
          });

        const jobId = addResponse.body.jobId;

        const response = await request(app)
          .post(`/api/email/retry/${jobId}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('message', 'Job queued for retry');
        expect(response.body).toHaveProperty('jobId', jobId);
      });

      test('should return 404 for non-existent job', async () => {
        const response = await request(app)
          .post('/api/email/retry/99999');

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('error', 'Job not found');
      });
    });
  });

  describe('Email Logging Endpoints', () => {
    let app: express.Application;

    beforeAll(() => {
      const emailConfig: EmailConfig = {
        enabled: false,
        from: '"Test" <test@example.com>',
      };
      const result = createTestApp(emailConfig);
      app = result.app;
    });

    describe('GET /api/email/logs', () => {
      test('should return empty logs initially', async () => {
        const response = await request(app).get('/api/email/logs');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('count');
        expect(response.body).toHaveProperty('logs');
        expect(Array.isArray(response.body.logs)).toBe(true);
      });

      test('should return recent logs after queuing emails', async () => {
        await request(app)
          .post('/api/email/send')
          .send({
            user: { email: 'log1@example.com', name: 'Log 1' },
            templateName: 'VerifyEmail',
          });

        await request(app)
          .post('/api/email/send')
          .send({
            user: { email: 'log2@example.com', name: 'Log 2' },
            templateName: 'UserSuspended',
          });

        const response = await request(app).get('/api/email/logs');

        expect(response.status).toBe(200);
        expect(response.body.count).toBeGreaterThanOrEqual(2);
        expect(response.body.logs.length).toBeGreaterThanOrEqual(2);
      });

      test('should respect limit parameter', async () => {
        // Add multiple emails
        for (let i = 0; i < 5; i++) {
          await request(app)
            .post('/api/email/send')
            .send({
              user: { email: `test${i}@example.com`, name: `Test ${i}` },
              templateName: 'VerifyEmail',
            });
        }

        const response = await request(app).get('/api/email/logs?limit=2');

        expect(response.status).toBe(200);
        expect(response.body.logs.length).toBeLessThanOrEqual(2);
      });

      test('should use default limit when not specified', async () => {
        const response = await request(app).get('/api/email/logs');

        expect(response.status).toBe(200);
        expect(response.body.count).toBeLessThanOrEqual(100);
      });
    });

    describe('GET /api/email/logs/:jobId', () => {
      test('should return log for specific job', async () => {
        const sendResponse = await request(app)
          .post('/api/email/send')
          .send({
            user: { email: 'specific@example.com', name: 'Specific Test' },
            templateName: 'VerifyEmail',
          });

        const jobId = sendResponse.body.jobId;
        const response = await request(app).get(`/api/email/logs/${jobId}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('job_id', jobId);
        expect(response.body).toHaveProperty('recipient_email', 'specific@example.com');
        expect(response.body).toHaveProperty('template_name', 'VerifyEmail');
        expect(response.body).toHaveProperty('status', 'queued');
      });

      test('should return 404 for non-existent job', async () => {
        const response = await request(app).get('/api/email/logs/nonexistent-job');

        expect(response.status).toBe(404);
        expect(response.body).toHaveProperty('error', 'Email log not found');
      });
    });

    describe('GET /api/email/logs/recipient/:email', () => {
      test('should return logs for specific recipient', async () => {
        const testEmail = 'recipient@example.com';

        await request(app)
          .post('/api/email/send')
          .send({
            user: { email: testEmail, name: 'Recipient Test 1' },
            templateName: 'VerifyEmail',
          });

        await request(app)
          .post('/api/email/send')
          .send({
            user: { email: testEmail, name: 'Recipient Test 2' },
            templateName: 'UserSuspended',
          });

        const response = await request(app).get(`/api/email/logs/recipient/${testEmail}`);

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('recipient', testEmail);
        expect(response.body).toHaveProperty('count');
        expect(response.body).toHaveProperty('logs');
        expect(response.body.logs.length).toBeGreaterThanOrEqual(2);
        expect(response.body.logs.every((log: any) => log.recipient_email === testEmail)).toBe(true);
      });

      test('should respect limit parameter for recipient logs', async () => {
        const testEmail = 'limited@example.com';

        for (let i = 0; i < 5; i++) {
          await request(app)
            .post('/api/email/send')
            .send({
              user: { email: testEmail, name: `Test ${i}` },
              templateName: 'VerifyEmail',
            });
        }

        const response = await request(app).get(`/api/email/logs/recipient/${testEmail}?limit=3`);

        expect(response.status).toBe(200);
        expect(response.body.logs.length).toBeLessThanOrEqual(3);
      });

      test('should return empty array for recipient with no emails', async () => {
        const response = await request(app).get('/api/email/logs/recipient/noemails@example.com');

        expect(response.status).toBe(200);
        expect(response.body.count).toBe(0);
        expect(response.body.logs).toEqual([]);
      });
    });

    describe('GET /api/email/logs/stats', () => {
      test('should return email statistics', async () => {
        const response = await request(app).get('/api/email/logs/stats');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('total');
        expect(response.body).toHaveProperty('queued');
        expect(response.body).toHaveProperty('sent');
        expect(response.body).toHaveProperty('failed');
      });

      test('should show correct counts after queuing emails', async () => {
        // Clear existing logs
        mockEmailLogs.length = 0;

        // Queue 3 emails
        for (let i = 0; i < 3; i++) {
          await request(app)
            .post('/api/email/send')
            .send({
              user: { email: `stats${i}@example.com`, name: `Stats ${i}` },
              templateName: 'VerifyEmail',
            });
        }

        const response = await request(app).get('/api/email/logs/stats');

        expect(response.status).toBe(200);
        expect(response.body.total).toBe(3);
        expect(response.body.queued).toBe(3);
        expect(response.body.sent).toBe(0);
        expect(response.body.failed).toBe(0);
      });
    });
  });
});
