import express, { Request, Response } from 'express';
import { initializeDatabase, testConnection, closeDatabase } from './db';
import { WireGuardManager } from './wireguard';
import { PeerManager } from './peer-manager';
import logger from './logger';

const app = express();
const PORT = parseInt(process.env.PORT || '8080');
const WG_INTERFACE = process.env.WG_INTERFACE || 'wg0';
const SERVER_ENDPOINT = process.env.SERVER_ENDPOINT || 'vpn.example.com';

app.use(express.json());

// Middleware for logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// Initialize services
const wg = new WireGuardManager(WG_INTERFACE);
const peerManager = new PeerManager(wg);

// Health check
app.get('/health', async (req: Request, res: Response) => {
  try {
    const dbOk = await testConnection();
    const wgOk = await wg.interfaceExists();
    
    res.json({
      status: dbOk && wgOk ? 'healthy' : 'degraded',
      database: dbOk ? 'connected' : 'disconnected',
      wireguard: wgOk ? 'running' : 'stopped',
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Create new peer
app.post('/api/peers', async (req: Request, res: Response) => {
  try {
    const { deviceId, deviceName, notes } = req.body;
    const peer = await peerManager.createPeer(deviceId, deviceName, notes);
    
    res.status(201).json({
      peerId: peer.peerId,
      publicKey: peer.publicKey,
      ipAddress: peer.ipAddress,
      deviceId: peer.deviceId,
      deviceName: peer.deviceName,
      createdAt: peer.createdAt,
    });
  } catch (error: any) {
    logger.error('Error creating peer', error);
    res.status(500).json({ error: error.message });
  }
});

// List all peers
app.get('/api/peers', async (req: Request, res: Response) => {
  try {
    const enabled = req.query.enabled ? req.query.enabled === 'true' : undefined;
    const peers = await peerManager.listPeers(enabled);
    
    res.json(
      peers.map((p) => ({
        peerId: p.peerId,
        publicKey: p.publicKey,
        ipAddress: p.ipAddress,
        deviceId: p.deviceId,
        deviceName: p.deviceName,
        enabled: p.enabled,
        createdAt: p.createdAt,
      }))
    );
  } catch (error: any) {
    logger.error('Error listing peers', error);
    res.status(500).json({ error: error.message });
  }
});

// Get peer details
app.get('/api/peers/:peerId', async (req: Request, res: Response) => {
  try {
    const peer = await peerManager.getPeer(req.params.peerId);
    
    if (!peer) {
      return res.status(404).json({ error: 'Peer not found' });
    }
    
    res.json({
      peerId: peer.peerId,
      publicKey: peer.publicKey,
      ipAddress: peer.ipAddress,
      deviceId: peer.deviceId,
      deviceName: peer.deviceName,
      notes: peer.notes,
      enabled: peer.enabled,
      createdAt: peer.createdAt,
      updatedAt: peer.updatedAt,
    });
  } catch (error: any) {
    logger.error('Error getting peer', error);
    res.status(500).json({ error: error.message });
  }
});

// Update peer
app.patch('/api/peers/:peerId', async (req: Request, res: Response) => {
  try {
    const { deviceName, notes, enabled } = req.body;
    const peer = await peerManager.updatePeer(req.params.peerId, {
      deviceName,
      notes,
      enabled,
    });
    
    if (!peer) {
      return res.status(404).json({ error: 'Peer not found' });
    }
    
    res.json({
      peerId: peer.peerId,
      deviceName: peer.deviceName,
      notes: peer.notes,
      enabled: peer.enabled,
      updatedAt: peer.updatedAt,
    });
  } catch (error: any) {
    logger.error('Error updating peer', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete peer
app.delete('/api/peers/:peerId', async (req: Request, res: Response) => {
  try {
    const deleted = await peerManager.deletePeer(req.params.peerId);
    
    if (!deleted) {
      return res.status(404).json({ error: 'Peer not found' });
    }
    
    res.status(204).send();
  } catch (error: any) {
    logger.error('Error deleting peer', error);
    res.status(500).json({ error: error.message });
  }
});

// Get peer configuration
app.get('/api/peers/:peerId/config', async (req: Request, res: Response) => {
  try {
    const config = await peerManager.generateConfig(req.params.peerId, SERVER_ENDPOINT);
    
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="wg-client.conf"`);
    res.send(config);
  } catch (error: any) {
    logger.error('Error generating config', error);
    res.status(500).json({ error: error.message });
  }
});

// Get peer configuration as QR code
app.get('/api/peers/:peerId/qr', async (req: Request, res: Response) => {
  try {
    const qrCode = await peerManager.generateQRCode(req.params.peerId, SERVER_ENDPOINT);
    
    // Extract base64 data
    const base64Data = qrCode.replace(/^data:image\/png;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');
    
    res.setHeader('Content-Type', 'image/png');
    res.send(buffer);
  } catch (error: any) {
    logger.error('Error generating QR code', error);
    res.status(500).json({ error: error.message });
  }
});

// Get WireGuard interface status
app.get('/api/status', async (req: Request, res: Response) => {
  try {
    const status = await wg.getInterfaceStatus();
    res.setHeader('Content-Type', 'text/plain');
    res.send(status);
  } catch (error: any) {
    logger.error('Error getting status', error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
async function startServer() {
  try {
    // Initialize database
    initializeDatabase();
    const dbOk = await testConnection();
    
    if (!dbOk) {
      throw new Error('Database connection failed');
    }

    // Check WireGuard interface
    const wgExists = await wg.interfaceExists();
    if (!wgExists) {
      logger.warn(`WireGuard interface ${WG_INTERFACE} not found. Make sure it's configured.`);
    }

    app.listen(PORT, () => {
      logger.info(`WireGuard server listening on port ${PORT}`);
      logger.info(`WireGuard interface: ${WG_INTERFACE}`);
      logger.info(`Server endpoint: ${SERVER_ENDPOINT}`);
    });
  } catch (error: any) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await closeDatabase();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await closeDatabase();
  process.exit(0);
});

startServer();
