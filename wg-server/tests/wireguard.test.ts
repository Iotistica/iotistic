import { WireGuardManager } from '../src/wireguard';
import { exec } from 'child_process';

// Mock child_process exec
jest.mock('child_process', () => ({
  exec: jest.fn()
}));

const mockExec = exec as unknown as jest.Mock;

describe('WireGuardManager', () => {
  let wgManager: WireGuardManager;

  beforeEach(() => {
    wgManager = new WireGuardManager('wg0');
    jest.clearAllMocks();
  });

  describe('generateKeyPair', () => {
    it('should generate a valid key pair', async () => {
      const mockPrivateKey = 'YGbW8f1234567890abcdefghijklmnopqrstuvwxyz=';
      const mockPublicKey = 'SAe7/qU7wKgDx32mUxd8t4pIDATRlpjmgPqtdYrVPEw=';

      // Mock first call for private key
      mockExec.mockImplementationOnce((cmd, callback: any) => {
        callback(null, { stdout: mockPrivateKey + '\n', stderr: '' });
      });

      // Mock second call for public key
      mockExec.mockImplementationOnce((cmd, callback: any) => {
        callback(null, { stdout: mockPublicKey + '\n', stderr: '' });
      });

      const result = await wgManager.generateKeyPair();

      expect(result).toEqual({
        privateKey: mockPrivateKey,
        publicKey: mockPublicKey
      });
      expect(mockExec).toHaveBeenCalledTimes(2);
    });

    it('should handle key generation errors', async () => {
      mockExec.mockImplementationOnce((cmd, callback: any) => {
        callback(new Error('wg command not found'), null);
      });

      await expect(wgManager.generateKeyPair()).rejects.toThrow('wg command not found');
    });
  });

  describe('generatePresharedKey', () => {
    it('should generate a preshared key', async () => {
      const mockKey = 'preshared1234567890abcdefghijklmnopqrstuvwxyz=';
      
      mockExec.mockImplementationOnce((cmd, callback: any) => {
        callback(null, { stdout: mockKey + '\n', stderr: '' });
      });

      const result = await wgManager.generatePresharedKey();

      expect(result).toBe(mockKey);
    });
  });

  describe('addPeer', () => {
    it('should add a peer to the interface', async () => {
      mockExec.mockImplementationOnce((cmd, options, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const peer = {
        publicKey: 'SAe7/qU7wKgDx32mUxd8t4pIDATRlpjmgPqtdYrVPEw=',
        presharedKey: 'preshared1234567890=',
        allowedIPs: '10.8.0.2/32',
        persistentKeepalive: 25
      };

      await wgManager.addPeer(peer);

      expect(mockExec).toHaveBeenCalled();
    });

    it('should add peer without optional parameters', async () => {
      mockExec.mockImplementationOnce((cmd, options, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const peer = {
        publicKey: 'SAe7/qU7wKgDx32mUxd8t4pIDATRlpjmgPqtdYrVPEw=',
        allowedIPs: '10.8.0.2/32'
      };

      await wgManager.addPeer(peer);

      expect(mockExec).toHaveBeenCalled();
    });
  });

  describe('removePeer', () => {
    it('should remove a peer from the interface', async () => {
      mockExec.mockImplementationOnce((cmd, callback: any) => {
        callback(null, { stdout: '', stderr: '' });
      });

      const publicKey = 'SAe7/qU7wKgDx32mUxd8t4pIDATRlpjmgPqtdYrVPEw=';
      await wgManager.removePeer(publicKey);

      expect(mockExec).toHaveBeenCalled();
    });
  });

  describe('generateClientConfig', () => {
    it('should generate a valid client configuration', () => {
      const config = wgManager.generateClientConfig(
        'clientPrivateKey123=',
        '10.8.0.2/32',
        'serverPublicKey456=',
        'vpn.example.com',
        51820,
        '8.8.8.8, 1.1.1.1',
        'presharedKey789='
      );

      expect(config).toContain('[Interface]');
      expect(config).toContain('PrivateKey = clientPrivateKey123=');
      expect(config).toContain('Address = 10.8.0.2/32');
      expect(config).toContain('[Peer]');
      expect(config).toContain('PublicKey = serverPublicKey456=');
      expect(config).toContain('Endpoint = vpn.example.com:51820');
      expect(config).toContain('PresharedKey = presharedKey789=');
      expect(config).toContain('AllowedIPs = 0.0.0.0/0, ::/0');
      expect(config).toContain('DNS = 8.8.8.8, 1.1.1.1');
      expect(config).toContain('PersistentKeepalive = 25');
    });

    it('should generate config with default AllowedIPs', () => {
      const config = wgManager.generateClientConfig(
        'clientPrivateKey123=',
        '10.8.0.2/32',
        'serverPublicKey456=',
        'vpn.example.com'
      );

      expect(config).toContain('AllowedIPs = 0.0.0.0/0, ::/0');
    });

    it('should generate config without optional parameters', () => {
      const config = wgManager.generateClientConfig(
        'clientPrivateKey123=',
        '10.8.0.2/32',
        'serverPublicKey456=',
        'vpn.example.com'
      );

      expect(config).not.toContain('PresharedKey');
      expect(config).not.toContain('DNS =');
    });
  });

  describe('getInterfaceStatus', () => {
    it('should get interface status', async () => {
      const mockOutput = `interface: wg0
  public key: SAe7/qU7wKgDx32mUxd8t4pIDATRlpjmgPqtdYrVPEw=
  private key: (hidden)
  listening port: 51820`;

      mockExec.mockImplementationOnce((cmd, callback: any) => {
        callback(null, { stdout: mockOutput, stderr: '' });
      });

      const result = await wgManager.getInterfaceStatus();

      expect(result).toBe(mockOutput);
      expect(mockExec).toHaveBeenCalled();
    });
  });

  describe('interfaceExists', () => {
    it('should return true if interface exists', async () => {
      mockExec.mockImplementationOnce((cmd, callback: any) => {
        callback(null, { stdout: 'wg0: <POINTOPOINT,NOARP,UP,LOWER_UP>', stderr: '' });
      });

      const result = await wgManager.interfaceExists();

      expect(result).toBe(true);
    });

    it('should return false if interface does not exist', async () => {
      mockExec.mockImplementationOnce((cmd, callback: any) => {
        callback(new Error('Device not found'), null);
      });

      const result = await wgManager.interfaceExists();

      expect(result).toBe(false);
    });
  });
});

