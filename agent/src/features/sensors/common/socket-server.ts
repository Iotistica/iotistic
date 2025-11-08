import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';
import { SensorDataPoint, SocketOutput, Logger } from './types';

/**
 * IPC Socket Server that receives sensor data and serves it to connected clients
 * Supports both Unix Domain Sockets (Linux/macOS) and Named Pipes (Windows)
 */
export class SocketServer {
  private server?: net.Server;
  private clients: net.Socket[] = [];
  private config: SocketOutput;
  private logger: Logger;
  private started = false;
  private isWindowsNamedPipe: boolean;

  constructor(config: SocketOutput, logger: Logger) {
    this.config = config;
    this.logger = logger;
    
    // Detect if this is a Windows Named Pipe
    this.isWindowsNamedPipe = this.config.socketPath.startsWith('\\\\.\\pipe\\');
  }

  /**
   * Start the IPC socket server (Unix socket or Windows Named Pipe)
   */
  async start(): Promise<void> {
    if (this.started) {
      return;
    }

    try {
      // For Unix sockets, ensure directory exists and clean up old socket
      if (!this.isWindowsNamedPipe) {
        const socketDir = path.dirname(this.config.socketPath);
        if (!fs.existsSync(socketDir)) {
          fs.mkdirSync(socketDir, { recursive: true });
        }

        // Remove existing socket file if it exists
        if (fs.existsSync(this.config.socketPath)) {
          fs.unlinkSync(this.config.socketPath);
        }
      }

      this.server = net.createServer((socket) => {
        this.handleClientConnection(socket);
      });

      await new Promise<void>((resolve, reject) => {
        this.server!.listen(this.config.socketPath, () => {
          const transportType = this.isWindowsNamedPipe ? 'Windows Named Pipe' : 'Unix socket';
          this.logger.info(`IPC server started (${transportType}) at: ${this.config.socketPath}`);
          this.started = true;
          resolve();
        });

        this.server!.on('error', (error) => {
          this.logger.error(`Socket server error: ${error.message}`);
          reject(error);
        });
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to start socket server: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Stop the IPC socket server (Unix socket or Windows Named Pipe)
   */
  async stop(): Promise<void> {
    if (!this.started || !this.server) {
      return;
    }

    try {
      // Close all client connections
      for (const client of this.clients) {
        client.destroy();
      }
      this.clients = [];

      // Close server
      await new Promise<void>((resolve) => {
        this.server!.close(() => {
          const transportType = this.isWindowsNamedPipe ? 'Windows Named Pipe' : 'Unix socket';
          this.logger.info(`IPC server stopped (${transportType})`);
          resolve();
        });
      });

      // Remove Unix socket file (Named Pipes are cleaned up automatically by Windows)
      if (!this.isWindowsNamedPipe && fs.existsSync(this.config.socketPath)) {
        fs.unlinkSync(this.config.socketPath);
      }

      this.started = false;
      this.server = undefined;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error stopping socket server: ${errorMessage}`);
    }
  }

  /**
   * Send sensor data to all connected clients
   */
  sendData(dataPoints: SensorDataPoint[]): void {
    if (!this.started || this.clients.length === 0) {
      return;
    }

    try {
      const message = this.formatData(dataPoints);
      const data = message + this.config.delimiter;

      // Send to all connected clients
      this.clients.forEach((client, index) => {
        try {
          client.write(data);
        } catch (error) {
          this.logger.warn(`Failed to send data to client ${index}: ${error}`);
          this.removeClient(client);
        }
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error sending data: ${errorMessage}`);
    }
  }

  /**
   * Get number of connected clients
   */
  getClientCount(): number {
    return this.clients.length;
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.started;
  }

  /**
   * Handle new client connection
   */
  private handleClientConnection(socket: net.Socket): void {
    this.logger.info(`New client connected to socket server`);
    this.clients.push(socket);

    socket.on('error', (error) => {
      this.logger.warn(`Client socket error: ${error.message}`);
      this.removeClient(socket);
    });

    socket.on('close', () => {
      this.logger.info('Client disconnected from socket server');
      this.removeClient(socket);
    });

    socket.on('end', () => {
      this.logger.info('Client ended connection to socket server');
      this.removeClient(socket);
    });
  }

  /**
   * Remove client from the list
   */
  private removeClient(socket: net.Socket): void {
    const index = this.clients.indexOf(socket);
    if (index > -1) {
      this.clients.splice(index, 1);
      try {
        socket.destroy();
      } catch (error) {
        // Ignore errors when destroying socket
      }
    }
  }

  /**
   * Format sensor data based on configuration
   */
  private formatData(dataPoints: SensorDataPoint[]): string {
    if (this.config.dataFormat === 'csv') {
      return this.formatAsCsv(dataPoints);
    } else {
      return this.formatAsJson(dataPoints);
    }
  }

  /**
   * Format data as JSON
   */
  private formatAsJson(dataPoints: SensorDataPoint[]): string {
    const data: any = {};

    if (this.config.includeTimestamp) {
      data.timestamp = new Date().toISOString();
    }

    // Group data points by device
    const deviceData: { [key: string]: any } = {};
    
    for (const point of dataPoints) {
      if (!deviceData[point.deviceName]) {
        deviceData[point.deviceName] = {};
      }
      
      deviceData[point.deviceName][point.registerName] = {
        value: point.value,
        unit: point.unit,
        quality: point.quality,
        qualityCode: point.qualityCode,
        timestamp: point.timestamp
      };
    }

    data.devices = deviceData;
    
    return JSON.stringify(data);
  }

  /**
   * Format data as CSV
   */
  private formatAsCsv(dataPoints: SensorDataPoint[]): string {
    const rows: string[] = [];
    
    for (const point of dataPoints) {
      const row = [
        point.deviceName,
        point.registerName,
        String(point.value),
        point.unit,
        point.quality,
        point.timestamp
      ].join(',');
      
      rows.push(row);
    }
    
    return rows.join('\n');
  }
}