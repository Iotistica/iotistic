/**
 * Remote Terminal Manager
 * Manages PTY (pseudo-terminal) sessions for remote access from admin dashboard
 * Uses node-pty to spawn real shells with proper terminal emulation
 */

import { EventEmitter } from 'events';
import type { AgentLogger } from '../../logging/agent-logger';
import os from 'os';

// Import node-pty only if available (optional dependency)
let spawnPty: any;
let IPty: any;

try {
  const nodePty = require('node-pty');
  spawnPty = nodePty.spawn;
  IPty = nodePty.IPty;
} catch (error) {
  // node-pty not installed - will use fallback or error at runtime
  console.warn('node-pty not installed. Remote terminal feature will not work. Install with: npm install node-pty');
}

export interface TerminalSession {
  sessionId: string;
  pty: any; // IPty when node-pty is available
  startedAt: Date;
  lastActivityAt: Date;
  cols: number;
  rows: number;
  shell: string;
  cwd: string;
}

export interface TerminalSessionInfo {
  sessionId: string;
  startedAt: Date;
  lastActivityAt: Date;
  cols: number;
  rows: number;
  shell: string;
  cwd: string;
  uptime: number; // seconds
}

interface TerminalManagerEvents {
  output: (data: { sessionId: string; data: string }) => void;
  exit: (data: { sessionId: string; code: number }) => void;
  error: (data: { sessionId: string; error: Error }) => void;
}

export declare interface TerminalManager {
  on<K extends keyof TerminalManagerEvents>(
    event: K,
    listener: TerminalManagerEvents[K]
  ): this;
  emit<K extends keyof TerminalManagerEvents>(
    event: K,
    ...args: Parameters<TerminalManagerEvents[K]>
  ): boolean;
}

/**
 * Manages remote terminal sessions
 */
export class TerminalManager extends EventEmitter {
  private sessions = new Map<string, TerminalSession>();
  private logger?: AgentLogger;
  private maxSessions: number;
  private sessionTimeout: number; // milliseconds
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    logger?: AgentLogger,
    options?: {
      maxSessions?: number;
      sessionTimeout?: number; // milliseconds
    }
  ) {
    super();
    this.logger = logger;
    this.maxSessions = options?.maxSessions || 5;
    this.sessionTimeout = options?.sessionTimeout || 30 * 60 * 1000; // 30 minutes default

    // Start cleanup interval to close idle sessions
    this.startCleanupInterval();
  }

  /**
   * Start new terminal session
   */
  startSession(
    sessionId: string,
    options?: {
      cols?: number;
      rows?: number;
      shell?: string;
      cwd?: string;
      env?: { [key: string]: string };
    }
  ): void {
    if (this.sessions.has(sessionId)) {
      throw new Error(`Terminal session ${sessionId} already exists`);
    }

    // Check max sessions limit
    if (this.sessions.size >= this.maxSessions) {
      throw new Error(
        `Maximum terminal sessions (${this.maxSessions}) reached. Close existing sessions first.`
      );
    }

    const cols = options?.cols || 80;
    const rows = options?.rows || 24;
    const shell = options?.shell || this.getDefaultShell();
    const cwd = options?.cwd || process.env.HOME || '/root';
    const env = {
      ...process.env,
      ...options?.env,
      TERM: 'xterm-256color',
    } as { [key: string]: string };

    this.logger?.infoSync(`Starting terminal session: ${sessionId}`, {
      shell,
      cwd,
      cols,
      rows,
    });

    // Check if node-pty is available
    if (!spawnPty) {
      throw new Error('node-pty is not installed. Run: npm install node-pty');
    }

    try {
      // Spawn shell with PTY
      const pty = spawnPty(shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd,
        env,
      });

      // Store session
      const session: TerminalSession = {
        sessionId,
        pty,
        startedAt: new Date(),
        lastActivityAt: new Date(),
        cols,
        rows,
        shell,
        cwd,
      };

      this.sessions.set(sessionId, session);

      // Listen to output from shell
      pty.onData((data: string) => {
        session.lastActivityAt = new Date();
        this.emit('output', { sessionId, data });
      });

      // Listen to exit event
      pty.onExit(({ exitCode }: { exitCode: number; signal?: number }) => {
        this.logger?.infoSync(
          `Terminal session ${sessionId} exited with code ${exitCode}`
        );
        this.emit('exit', { sessionId, code: exitCode });
        this.sessions.delete(sessionId);
      });

      this.logger?.infoSync(`Terminal session started: ${sessionId}`);
    } catch (error) {
      this.logger?.errorSync(`Failed to start terminal session: ${sessionId}`, error as Error);
      throw error;
    }
  }

  /**
   * Write input to terminal (user typed something)
   */
  writeInput(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Terminal session ${sessionId} not found`);
    }

    try {
      session.pty.write(data);
      session.lastActivityAt = new Date();
    } catch (error) {
      this.logger?.errorSync(`Failed to write to terminal ${sessionId}:`, error as Error);
      this.emit('error', {
        sessionId,
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Resize terminal window
   */
  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Terminal session ${sessionId} not found`);
    }

    try {
      session.pty.resize(cols, rows);
      session.cols = cols;
      session.rows = rows;
      session.lastActivityAt = new Date();

      this.logger?.debugSync(`Terminal ${sessionId} resized to ${cols}x${rows}`);
    } catch (error) {
      this.logger?.errorSync(`Failed to resize terminal ${sessionId}:`, error as Error);
    }
  }

  /**
   * Close terminal session
   */
  closeSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.logger?.warnSync(`Terminal session ${sessionId} not found (already closed?)`);
      return;
    }

    try {
      session.pty.kill();
      this.sessions.delete(sessionId);
      this.logger?.infoSync(`Terminal session closed: ${sessionId}`);
    } catch (error) {
      this.logger?.errorSync(`Failed to close terminal ${sessionId}:`, error as Error);
    }
  }

  /**
   * Get active sessions info
   */
  getActiveSessions(): TerminalSessionInfo[] {
    const now = new Date();
    return Array.from(this.sessions.values()).map((session) => ({
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      lastActivityAt: session.lastActivityAt,
      cols: session.cols,
      rows: session.rows,
      shell: session.shell,
      cwd: session.cwd,
      uptime: Math.floor((now.getTime() - session.startedAt.getTime()) / 1000),
    }));
  }

  /**
   * Get session info
   */
  getSession(sessionId: string): TerminalSessionInfo | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const now = new Date();
    return {
      sessionId: session.sessionId,
      startedAt: session.startedAt,
      lastActivityAt: session.lastActivityAt,
      cols: session.cols,
      rows: session.rows,
      shell: session.shell,
      cwd: session.cwd,
      uptime: Math.floor((now.getTime() - session.startedAt.getTime()) / 1000),
    };
  }

  /**
   * Close all sessions
   */
  closeAllSessions(): void {
    this.logger?.infoSync(
      `Closing all terminal sessions (${this.sessions.size} active)`
    );

    for (const sessionId of Array.from(this.sessions.keys())) {
      this.closeSession(sessionId);
    }
  }

  /**
   * Cleanup idle sessions
   */
  private cleanupIdleSessions(): void {
    const now = new Date();
    const sessionsToClose: string[] = [];

    for (const [sessionId, session] of this.sessions) {
      const idleTime = now.getTime() - session.lastActivityAt.getTime();
      if (idleTime > this.sessionTimeout) {
        sessionsToClose.push(sessionId);
      }
    }

    if (sessionsToClose.length > 0) {
      this.logger?.infoSync(
        `Closing ${sessionsToClose.length} idle terminal sessions`
      );
      for (const sessionId of sessionsToClose) {
        this.closeSession(sessionId);
      }
    }
  }

  /**
   * Start cleanup interval
   */
  private startCleanupInterval(): void {
    // Check every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleSessions();
    }, 5 * 60 * 1000);
  }

  /**
   * Stop cleanup interval
   */
  private stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /**
   * Get default shell for the platform
   */
  private getDefaultShell(): string {
    const platform = os.platform();

    if (platform === 'win32') {
      return process.env.COMSPEC || 'cmd.exe';
    }

    // Unix-like systems (Linux, macOS, etc.)
    return process.env.SHELL || '/bin/bash';
  }

  /**
   * Shutdown terminal manager
   */
  shutdown(): void {
    this.logger?.infoSync('Shutting down terminal manager');
    this.stopCleanupInterval();
    this.closeAllSessions();
  }
}
