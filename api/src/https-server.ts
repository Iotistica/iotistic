import https from 'https';
import fs from 'fs';
import logger from './utils/logger';
import type { Express } from 'express';

export interface HttpsConfig {
  enabled: boolean;
  port: number;
  certPath: string;
  keyPath: string;
  caCertPath?: string;
  requestCert?: boolean;
  rejectUnauthorized?: boolean;
}

export function createHttpsServer(app: Express, config: HttpsConfig): https.Server | null {
  if (!config.enabled) {
    logger.info('HTTPS disabled');
    return null;
  }

  try {
    // Check if certificate files exist
    if (!fs.existsSync(config.certPath)) {
      logger.warn(`HTTPS certificate not found: ${config.certPath}`);
      logger.warn('HTTPS server will not be started. Run ./scripts/generate-san-cert.ps1 to generate certificates.');
      return null;
    }

    if (!fs.existsSync(config.keyPath)) {
      logger.warn(`HTTPS key not found: ${config.keyPath}`);
      logger.warn('HTTPS server will not be started. Run ./scripts/generate-san-cert.ps1 to generate certificates.');
      return null;
    }

    // Read certificate files
    const cert = fs.readFileSync(config.certPath, 'utf8');
    const key = fs.readFileSync(config.keyPath, 'utf8');
    
    // Optional: Read CA certificate for chain verification
    let ca: string | undefined;
    if (config.caCertPath && fs.existsSync(config.caCertPath)) {
      ca = fs.readFileSync(config.caCertPath, 'utf8');
      logger.info(`Using CA certificate: ${config.caCertPath}`);
    }

    // Optional: Client certificate verification (mutual TLS)
    const httpsOptions: https.ServerOptions = {
      cert,
      key,
      ca, // CA certificate for chain verification
      requestCert: config.requestCert || false,
      rejectUnauthorized: config.rejectUnauthorized || false,
    };

    // Create HTTPS server
    const server = https.createServer(httpsOptions, app);

    server.listen(config.port, () => {
      logger.info('='.repeat(80));
      logger.info('🔒 Iotistic API HTTPS Server');
      logger.info('='.repeat(80));
      logger.info(`HTTPS Server running on https://localhost:${config.port}`);
      logger.info(`Certificate: ${config.certPath}`);
      logger.info('='.repeat(80));
    });

    return server;
  } catch (error) {
    logger.error('Failed to create HTTPS server', { error });
    return null;
  }
}
