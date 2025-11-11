import request from 'supertest';
import express from 'express';
import { PeerManager } from '../src/peer-manager';
import { WireGuardManager } from '../src/wireguard';

// Mock dependencies
jest.mock('../src/peer-manager');
jest.mock('../src/wireguard');
jest.mock('../src/db');

const mockPeerManager = PeerManager as jest.MockedClass<typeof PeerManager>;

describe('WireGuard Server API', () => {
  let app: express.Application;
  let mockPeerManagerInstance: jest.Mocked<PeerManager>;

  beforeAll(() => {
    // Create Express app with routes (simplified version of server.ts)
    app = express();
    app.use(express.json());

    const wg = new WireGuardManager('wg0');
    mockPeerManagerInstance = new PeerManager(wg) as jest.Mocked<PeerManager>;

    // Health check
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', service: 'wg-server' });
    });

    // Create peer
    app.post('/api/peers', async (req, res) => {
      try {
        const { deviceId, deviceName, notes } = req.body;
        const peer = await mockPeerManagerInstance.createPeer(deviceId, deviceName, notes);
        res.status(201).json(peer);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get peer
    app.get('/api/peers/:peerId', async (req, res) => {
      try {
        const peer = await mockPeerManagerInstance.getPeer(req.params.peerId);
        if (!peer) {
          return res.status(404).json({ error: 'Peer not found' });
        }
        res.json(peer);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Delete peer
    app.delete('/api/peers/:peerId', async (req, res) => {
      try {
        await mockPeerManagerInstance.deletePeer(req.params.peerId);
        res.status(204).send();
      } catch (error: any) {
        if (error.message === 'Peer not found') {
          return res.status(404).json({ error: 'Peer not found' });
        }
        res.status(500).json({ error: error.message });
      }
    });

    // Get peer config
    app.get('/api/peers/:peerId/config', async (req, res) => {
      try {
        const serverEndpoint = process.env.SERVER_ENDPOINT || 'vpn.example.com';
        const config = await mockPeerManagerInstance.generateConfig(req.params.peerId, serverEndpoint);
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="wg-client.conf"`);
        res.send(config);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // Get peer QR code
    app.get('/api/peers/:peerId/qr', async (req, res) => {
      try {
        const serverEndpoint = process.env.SERVER_ENDPOINT || 'vpn.example.com';
        const qrCode = await mockPeerManagerInstance.generateQRCode(req.params.peerId, serverEndpoint);
        const base64Data = qrCode.replace(/^data:image\/png;base64,/, '');
        res.setHeader('Content-Type', 'image/png');
        res.send(Buffer.from(base64Data, 'base64'));
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });

    // List peers
    app.get('/api/peers', async (req, res) => {
      try {
        const peers = await mockPeerManagerInstance.listPeers();
        res.json(peers);
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'ok',
        service: 'wg-server'
      });
    });
  });

  describe('POST /api/peers', () => {
    it('should create a new peer', async () => {
      const mockPeer = {
        peerId: 'peer-123',
        publicKey: 'publicKey456=',
        ipAddress: '10.8.0.2',
        deviceId: 'device-123',
        deviceName: 'Test Device',
        createdAt: new Date().toISOString()
      };

      mockPeerManagerInstance.createPeer.mockResolvedValue(mockPeer as any);

      const response = await request(app)
        .post('/api/peers')
        .send({
          deviceId: 'device-123',
          deviceName: 'Test Device',
          notes: 'Test notes'
        });

      expect(response.status).toBe(201);
      expect(response.body).toEqual(mockPeer);
      expect(mockPeerManagerInstance.createPeer).toHaveBeenCalledWith(
        'device-123',
        'Test Device',
        'Test notes'
      );
    });

    it('should handle creation errors', async () => {
      mockPeerManagerInstance.createPeer.mockRejectedValue(new Error('No available IP addresses'));

      const response = await request(app)
        .post('/api/peers')
        .send({
          deviceId: 'device-123'
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'No available IP addresses' });
    });
  });

  describe('GET /api/peers/:peerId', () => {
    it('should get peer by ID', async () => {
      const mockPeer = {
        peerId: 'peer-123',
        publicKey: 'publicKey456=',
        ipAddress: '10.8.0.2',
        deviceId: 'device-123',
        deviceName: 'Test Device'
      };

      mockPeerManagerInstance.getPeer.mockResolvedValue(mockPeer as any);

      const response = await request(app).get('/api/peers/peer-123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockPeer);
    });

    it('should return 404 when peer not found', async () => {
      mockPeerManagerInstance.getPeer.mockResolvedValue(null);

      const response = await request(app).get('/api/peers/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Peer not found' });
    });
  });

  describe('DELETE /api/peers/:peerId', () => {
    it('should delete a peer', async () => {
      mockPeerManagerInstance.deletePeer.mockResolvedValue(undefined as any);

      const response = await request(app).delete('/api/peers/peer-123');

      expect(response.status).toBe(204);
      expect(mockPeerManagerInstance.deletePeer).toHaveBeenCalledWith('peer-123');
    });

    it('should return 404 when deleting nonexistent peer', async () => {
      mockPeerManagerInstance.deletePeer.mockRejectedValue(new Error('Peer not found'));

      const response = await request(app).delete('/api/peers/nonexistent');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/peers/:peerId/config', () => {
    it('should return peer configuration', async () => {
      const mockConfig = `[Interface]
PrivateKey = privateKey123=
Address = 10.8.0.2/32

[Peer]
PublicKey = serverPublicKey456=
Endpoint = vpn.example.com:51820
AllowedIPs = 0.0.0.0/0, ::/0
PersistentKeepalive = 25`;

      mockPeerManagerInstance.generateConfig.mockResolvedValue(mockConfig);

      const response = await request(app).get('/api/peers/peer-123/config');

      expect(response.status).toBe(200);
      expect(response.text).toBe(mockConfig);
      expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
      expect(response.headers['content-disposition']).toContain('attachment');
    });
  });

  describe('GET /api/peers/:peerId/qr', () => {
    it('should return QR code image', async () => {
      const mockQRCode = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUA';

      mockPeerManagerInstance.generateQRCode.mockResolvedValue(mockQRCode);

      const response = await request(app).get('/api/peers/peer-123/qr');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('image/png');
    });
  });

  describe('GET /api/peers', () => {
    it('should list all peers', async () => {
      const mockPeers = [
        {
          peerId: 'peer-1',
          publicKey: 'key1=',
          ipAddress: '10.8.0.2',
          deviceId: 'device-1',
          deviceName: 'Device 1',
          enabled: true
        },
        {
          peerId: 'peer-2',
          publicKey: 'key2=',
          ipAddress: '10.8.0.3',
          deviceId: 'device-2',
          deviceName: 'Device 2',
          enabled: true
        }
      ];

      mockPeerManagerInstance.listPeers.mockResolvedValue(mockPeers as any);

      const response = await request(app).get('/api/peers');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockPeers);
      expect(response.body).toHaveLength(2);
    });
  });
});
