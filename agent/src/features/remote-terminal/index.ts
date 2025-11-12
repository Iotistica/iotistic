/**
 * Remote Terminal Feature
 * Integrates TerminalManager with agent WebSocket to enable remote terminal access
 */

import { BaseFeature, FeatureConfig } from '../index.js';
import { AgentLogger } from '../../logging/agent-logger.js';
import { TerminalManager } from './terminal-manager.js';
import type { WebSocket } from 'ws';

export interface RemoteTerminalConfig extends FeatureConfig {
  maxSessions?: number;
  sessionTimeout?: number; // milliseconds
  allowedShells?: string[]; // Whitelist of allowed shells (e.g., ['/bin/bash', '/bin/sh'])
}

/**
 * Remote Terminal Feature
 * Manages terminal sessions for remote access via WebSocket
 */
export class RemoteTerminalFeature extends BaseFeature {
  private terminalManager?: TerminalManager;
  private terminalConfig: RemoteTerminalConfig;
  private websocket?: WebSocket;
  private agentLogger: AgentLogger;

  constructor(
    config: RemoteTerminalConfig,
    agentLogger: AgentLogger,
    deviceUuid: string
  ) {
    super(
      config,
      agentLogger,
      'remote-terminal',
      deviceUuid,
      false // doesn't require MQTT
    );
    this.terminalConfig = config;
    this.agentLogger = agentLogger;
  }

  protected async onInitialize(): Promise<void> {
    this.logger.info('Initializing Remote Terminal feature');

    // Initialize terminal manager
    this.terminalManager = new TerminalManager(this.agentLogger, {
      maxSessions: this.terminalConfig.maxSessions || 5,
      sessionTimeout: this.terminalConfig.sessionTimeout || 30 * 60 * 1000, // 30 min
    });

    // Forward terminal output events to WebSocket
    this.terminalManager.on('output', ({ sessionId, data }) => {
      this.sendToCloud({
        type: 'terminal:output',
        sessionId,
        data,
      });
    });

    this.terminalManager.on('exit', ({ sessionId, code }) => {
      this.sendToCloud({
        type: 'terminal:exit',
        sessionId,
        code,
      });
    });

    this.terminalManager.on('error', ({ sessionId, error }) => {
      this.sendToCloud({
        type: 'terminal:error',
        sessionId,
        error: error.message,
      });
    });
  }

  protected async onStart(): Promise<void> {
    this.logger.info('Remote Terminal feature ready');
  }

  protected async onStop(): Promise<void> {
    this.logger.info('Stopping Remote Terminal feature');

    if (this.terminalManager) {
      this.terminalManager.shutdown();
      this.terminalManager = undefined;
    }
  }

  /**
   * Set WebSocket connection for sending messages to cloud
   */
  setWebSocket(ws: WebSocket): void {
    this.websocket = ws;
  }

  /**
   * Handle WebSocket messages from cloud
   */
  handleMessage(message: any): void {
    if (!this.terminalManager) {
      this.logger.warn('Terminal manager not initialized');
      return;
    }

    try {
      switch (message.type) {
        case 'terminal:start':
          this.handleStartSession(message);
          break;

        case 'terminal:input':
          this.handleInput(message);
          break;

        case 'terminal:resize':
          this.handleResize(message);
          break;

        case 'terminal:close':
          this.handleClose(message);
          break;

        case 'terminal:list':
          this.handleListSessions();
          break;

        default:
          this.logger.warn(`Unknown terminal message type: ${message.type}`);
      }
    } catch (error) {
      this.logger.error('Error handling terminal message', error);
      this.sendToCloud({
        type: 'terminal:error',
        sessionId: message.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle start session request
   */
  private handleStartSession(message: any): void {
    const { sessionId, cols, rows, shell, cwd } = message;

    // Validate shell if whitelist is configured
    if (this.terminalConfig.allowedShells && shell) {
      if (!this.terminalConfig.allowedShells.includes(shell)) {
        throw new Error(`Shell ${shell} is not allowed`);
      }
    }

    this.terminalManager!.startSession(sessionId, {
      cols: cols || 80,
      rows: rows || 24,
      shell,
      cwd,
    });

    // Send confirmation
    this.sendToCloud({
      type: 'terminal:started',
      sessionId,
    });
  }

  /**
   * Handle terminal input (user typed something)
   */
  private handleInput(message: any): void {
    const { sessionId, data } = message;
    this.terminalManager!.writeInput(sessionId, data);
  }

  /**
   * Handle terminal resize
   */
  private handleResize(message: any): void {
    const { sessionId, cols, rows } = message;
    this.terminalManager!.resize(sessionId, cols, rows);
  }

  /**
   * Handle close session
   */
  private handleClose(message: any): void {
    const { sessionId } = message;
    this.terminalManager!.closeSession(sessionId);

    // Send confirmation
    this.sendToCloud({
      type: 'terminal:closed',
      sessionId,
    });
  }

  /**
   * Handle list sessions request
   */
  private handleListSessions(): void {
    const sessions = this.terminalManager!.getActiveSessions();

    this.sendToCloud({
      type: 'terminal:sessions',
      sessions,
    });
  }

  /**
   * Send message to cloud via WebSocket
   */
  private sendToCloud(message: any): void {
    if (!this.websocket || this.websocket.readyState !== 1) {
      this.logger.warn('WebSocket not connected, cannot send terminal message');
      return;
    }

    try {
      this.websocket.send(JSON.stringify(message));
    } catch (error) {
      this.logger.error('Failed to send terminal message to cloud', error);
    }
  }

  /**
   * Get feature status
   */
  async getStatus(): Promise<any> {
    const sessions = this.terminalManager?.getActiveSessions() || [];

    return {
      enabled: this.config.enabled,
      activeSessions: sessions.length,
      maxSessions: this.terminalConfig.maxSessions || 5,
      sessions: sessions.map((s) => ({
        sessionId: s.sessionId,
        startedAt: s.startedAt,
        uptime: s.uptime,
        shell: s.shell,
      })),
    };
  }
}
