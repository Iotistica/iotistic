# Remote Terminal Feature

Web-based terminal access to devices via WebSocket.

## Installation

Install node-pty dependency:

```bash
cd agent
npm install node-pty@^1.0.0 --save
npm install @types/node-pty --save-dev
```

**Note**: `node-pty` requires native compilation. On Raspberry Pi or Linux:
```bash
# Install build tools first
sudo apt-get install -y python3 make g++
```

## Usage

Enable in agent configuration:

```typescript
const agentConfig = {
  features: {
    remoteTerminal: {
      enabled: true,
      maxSessions: 5,
      sessionTimeout: 1800000, // 30 minutes in milliseconds
      allowedShells: ['/bin/bash', '/bin/sh'] // Optional whitelist
    }
  }
};
```

## WebSocket Message Protocol

### Dashboard → API → Device

**Start Session**:
```json
{
  "type": "terminal:start",
  "sessionId": "term-abc123",
  "cols": 80,
  "rows": 24,
  "shell": "/bin/bash",
  "cwd": "/home/user"
}
```

**User Input**:
```json
{
  "type": "terminal:input",
  "sessionId": "term-abc123",
  "data": "ls -la\n"
}
```

**Resize**:
```json
{
  "type": "terminal:resize",
  "sessionId": "term-abc123",
  "cols": 120,
  "rows": 30
}
```

**Close**:
```json
{
  "type": "terminal:close",
  "sessionId": "term-abc123"
}
```

### Device → API → Dashboard

**Terminal Output**:
```json
{
  "type": "terminal:output",
  "sessionId": "term-abc123",
  "data": "total 64\ndrwxr-xr-x  12 user  staff   384 Nov 11 16:30 .\n"
}
```

**Session Started**:
```json
{
  "type": "terminal:started",
  "sessionId": "term-abc123"
}
```

**Session Exited**:
```json
{
  "type": "terminal:exit",
  "sessionId": "term-abc123",
  "code": 0
}
```

**Error**:
```json
{
  "type": "terminal:error",
  "sessionId": "term-abc123",
  "error": "Session not found"
}
```

## Security

- Sessions automatically close after inactivity timeout (default: 30 minutes)
- Maximum concurrent sessions limit (default: 5)
- Optional shell whitelist to restrict allowed shells
- All sessions logged with audit trail
- License validation required (`canRemoteAccess` capability)

## Architecture

```
┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│  Dashboard  │         │     API     │         │   Device    │
│   (xterm)   │◄───────►│  WebSocket  │◄───────►│  Terminal   │
│             │   WS    │   Proxy     │   WS    │   Manager   │
└─────────────┘         └─────────────┘         └─────────────┘
                                                        │
                                                        ▼
                                                  ┌──────────┐
                                                  │ node-pty │
                                                  │  (bash)  │
                                                  └──────────┘
```

## Components

### TerminalManager (`terminal-manager.ts`)
- Manages PTY instances
- Handles session lifecycle
- Cleanup idle sessions
- Emits output/exit events

### RemoteTerminalFeature (`index.ts`)
- Integrates with agent feature system
- Handles WebSocket messages
- Forwards terminal I/O
- Provides status endpoint

## Next Steps

1. **API Routes**: Create `/api/devices/:uuid/terminal` WebSocket endpoint
2. **Dashboard Component**: Build xterm.js terminal UI
3. **License Check**: Add `canRemoteAccess` validation in API
4. **Audit Logging**: Log all terminal sessions for compliance
