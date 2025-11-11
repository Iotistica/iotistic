import { PeerManager } from '../src/peer-manager';
import { WireGuardManager } from '../src/wireguard';
import { query } from '../src/db';
import QRCode from 'qrcode';

// Mock dependencies
jest.mock('../src/db');
jest.mock('../src/wireguard');
jest.mock('qrcode');

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockQRCode = QRCode as jest.Mocked<typeof QRCode>;

describe('PeerManager', () => {
  let peerManager: PeerManager;
  let mockWgManager: jest.Mocked<WireGuardManager>;

  beforeEach(() => {
    mockWgManager = new WireGuardManager() as jest.Mocked<WireGuardManager>;
    peerManager = new PeerManager(mockWgManager);
    jest.clearAllMocks();
  });

  describe('createPeer', () => {
    it('should create a peer with device info', async () => {
      const mockKeyPair = {
        privateKey: 'privateKey123=',
        publicKey: 'publicKey456='
      };
      const mockPresharedKey = 'presharedKey789=';
      const mockIpAddress = '10.8.0.2';
      const mockPeerId = 'peer-uuid-1234';

      mockWgManager.generateKeyPair.mockResolvedValue(mockKeyPair);
      mockWgManager.generatePresharedKey.mockResolvedValue(mockPresharedKey);
      mockWgManager.addPeer.mockResolvedValue();

      // Mock IP allocation
      mockQuery.mockResolvedValueOnce({
        rows: [{ ip_address: mockIpAddress }],
        command: '',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      // Mock peer insertion
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          peer_id: mockPeerId,
          public_key: mockKeyPair.publicKey,
          private_key: mockKeyPair.privateKey,
          preshared_key: mockPresharedKey,
          ip_address: mockIpAddress,
          allowed_ips: '0.0.0.0/0, ::/0',
          endpoint: null,
          persistent_keepalive: 25,
          device_id: 'device-123',
          device_name: 'Test Device',
          notes: 'Auto-provisioned',
          enabled: true,
          created_at: new Date(),
          updated_at: new Date()
        }],
        command: '',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      const result = await peerManager.createPeer('device-123', 'Test Device', 'Auto-provisioned');

      expect(result.peerId).toBeDefined();
      expect(result.publicKey).toBe(mockKeyPair.publicKey);
      expect(result.ipAddress).toBe(mockIpAddress);
      expect(result.deviceId).toBe('device-123');
      expect(mockWgManager.generateKeyPair).toHaveBeenCalled();
      expect(mockWgManager.generatePresharedKey).toHaveBeenCalled();
      expect(mockWgManager.addPeer).toHaveBeenCalledWith({
        publicKey: mockKeyPair.publicKey,
        presharedKey: mockPresharedKey,
        allowedIPs: `${mockIpAddress}/32`,
        persistentKeepalive: 25
      });
    });

    it('should create a peer without device info', async () => {
      const mockKeyPair = {
        privateKey: 'privateKey123=',
        publicKey: 'publicKey456='
      };
      const mockPresharedKey = 'presharedKey789=';
      const mockIpAddress = '10.8.0.3';

      mockWgManager.generateKeyPair.mockResolvedValue(mockKeyPair);
      mockWgManager.generatePresharedKey.mockResolvedValue(mockPresharedKey);
      mockWgManager.addPeer.mockResolvedValue();

      mockQuery.mockResolvedValueOnce({
        rows: [{ ip_address: mockIpAddress }],
        command: '',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 2,
          peer_id: 'peer-uuid-5678',
          public_key: mockKeyPair.publicKey,
          private_key: mockKeyPair.privateKey,
          preshared_key: mockPresharedKey,
          ip_address: mockIpAddress,
          allowed_ips: '0.0.0.0/0, ::/0',
          endpoint: null,
          persistent_keepalive: 25,
          device_id: null,
          device_name: null,
          notes: null,
          enabled: true,
          created_at: new Date(),
          updated_at: new Date()
        }],
        command: '',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      const result = await peerManager.createPeer();

      expect(result.deviceId).toBeNull();
      expect(result.deviceName).toBeNull();
    });

    it('should throw error when no IPs available', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: '',
        rowCount: 0,
        oid: 0,
        fields: []
      });

      await expect(peerManager.createPeer()).rejects.toThrow('No available IP addresses');
    });
  });

  describe('deletePeer', () => {
    it('should delete a peer and release IP', async () => {
      const mockPeerId = 'peer-123';
      const mockPublicKey = 'publicKey456=';
      const mockIpAddress = '10.8.0.5';

      mockQuery.mockResolvedValueOnce({
        rows: [{
          public_key: mockPublicKey,
          ip_address: mockIpAddress
        }],
        command: '',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      mockWgManager.removePeer.mockResolvedValue();

      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: '',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: '',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      await peerManager.deletePeer(mockPeerId);

      expect(mockWgManager.removePeer).toHaveBeenCalledWith(mockPublicKey);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM wg_peers'),
        [mockPeerId]
      );
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE wg_ip_pool'),
        [mockIpAddress]
      );
    });

    it('should return false when peer not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: '',
        rowCount: 0,
        oid: 0,
        fields: []
      });

      const result = await peerManager.deletePeer('nonexistent-peer');

      expect(result).toBe(false);
    });
  });

  describe('getPeer', () => {
    it('should get peer by ID', async () => {
      const mockPeer = {
        id: 1,
        peer_id: 'peer-123',
        public_key: 'publicKey456=',
        ip_address: '10.8.0.2',
        device_id: 'device-123',
        device_name: 'Test Device',
        enabled: true,
        created_at: new Date(),
        updated_at: new Date()
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockPeer],
        command: '',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      const result = await peerManager.getPeer('peer-123');

      expect(result).toEqual(expect.objectContaining({
        peerId: mockPeer.peer_id,
        publicKey: mockPeer.public_key,
        ipAddress: mockPeer.ip_address,
        deviceId: mockPeer.device_id
      }));
    });

    it('should return null when peer not found', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [],
        command: '',
        rowCount: 0,
        oid: 0,
        fields: []
      });

      const result = await peerManager.getPeer('nonexistent-peer');

      expect(result).toBeNull();
    });
  });

  describe('generateConfig', () => {
    it('should generate WireGuard config for peer', async () => {
      const mockPeer = {
        peer_id: 'peer-123',
        private_key: 'privateKey123=',
        ip_address: '10.8.0.2',
        preshared_key: 'presharedKey789=',
        public_key: 'publicKey456=',
        allowed_ips: '0.0.0.0/0, ::/0',
        persistent_keepalive: 25,
        enabled: true
      };

      const mockServerConfig = {
        interface_name: 'wg0',
        listen_port: 51820,
        private_key: 'serverPrivateKey=',
        public_key: 'serverPublicKey456=',
        address: '10.8.0.1/24',
        dns: null
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockPeer],
        command: '',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      mockQuery.mockResolvedValueOnce({
        rows: [mockServerConfig],
        command: '',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      mockWgManager.generateClientConfig.mockReturnValue('[Interface]\nPrivateKey = privateKey123=\n...');

      const result = await peerManager.generateConfig('peer-123', 'vpn.example.com');

      expect(result).toContain('[Interface]');
      expect(mockWgManager.generateClientConfig).toHaveBeenCalledWith(
        mockPeer.private_key,
        `${mockPeer.ip_address}/24`,
        mockServerConfig.public_key,
        'vpn.example.com',
        mockServerConfig.listen_port,
        mockServerConfig.dns,
        mockPeer.preshared_key
      );
    });
  });

  describe('generateQRCode', () => {
    it('should generate QR code for peer config', async () => {
      const mockPeer = {
        peer_id: 'peer-123',
        private_key: 'privateKey123=',
        ip_address: '10.8.0.2',
        preshared_key: 'presharedKey789=',
        public_key: 'publicKey456=',
        allowed_ips: '0.0.0.0/0, ::/0',
        persistent_keepalive: 25,
        enabled: true
      };

      const mockServerConfig = {
        interface_name: 'wg0',
        listen_port: 51820,
        private_key: 'serverPrivateKey=',
        public_key: 'serverPublicKey456=',
        address: '10.8.0.1/24',
        dns: null
      };

      mockQuery.mockResolvedValueOnce({
        rows: [mockPeer],
        command: '',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      mockQuery.mockResolvedValueOnce({
        rows: [mockServerConfig],
        command: '',
        rowCount: 1,
        oid: 0,
        fields: []
      });

      mockWgManager.generateClientConfig.mockReturnValue('[Interface]\nPrivateKey = privateKey123=\n...');
      (mockQRCode.toDataURL as jest.Mock).mockResolvedValue('data:image/png;base64,iVBORw0KGgo...');

      const result = await peerManager.generateQRCode('peer-123', 'vpn.example.com');

      expect(result).toContain('data:image/png;base64,');
      expect(mockQRCode.toDataURL).toHaveBeenCalled();
    });
  });

  describe('listPeers', () => {
    it('should list all peers', async () => {
      const mockPeers = [
        {
          id: 1,
          peer_id: 'peer-1',
          public_key: 'key1=',
          private_key: 'priv1=',
          preshared_key: 'psk1=',
          ip_address: '10.8.0.2',
          allowed_ips: '0.0.0.0/0, ::/0',
          endpoint: null,
          persistent_keepalive: 25,
          device_id: 'device-1',
          device_name: 'Device 1',
          notes: null,
          enabled: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: 2,
          peer_id: 'peer-2',
          public_key: 'key2=',
          private_key: 'priv2=',
          preshared_key: 'psk2=',
          ip_address: '10.8.0.3',
          allowed_ips: '0.0.0.0/0, ::/0',
          endpoint: null,
          persistent_keepalive: 25,
          device_id: 'device-2',
          device_name: 'Device 2',
          notes: null,
          enabled: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ];

      mockQuery.mockResolvedValueOnce({
        rows: mockPeers,
        command: '',
        rowCount: 2,
        oid: 0,
        fields: []
      });

      const result = await peerManager.listPeers();

      expect(result).toHaveLength(2);
      expect(result[0].peerId).toBe('peer-1');
      expect(result[1].peerId).toBe('peer-2');
    });
  });
});
