import { exec } from 'child_process';
import { promisify } from 'util';
import logger from './logger';

const execAsync = promisify(exec);

export interface WireGuardKeyPair {
  privateKey: string;
  publicKey: string;
}

export interface WireGuardPeer {
  publicKey: string;
  presharedKey?: string;
  allowedIPs: string;
  endpoint?: string;
  persistentKeepalive?: number;
}

export class WireGuardManager {
  private interfaceName: string;

  constructor(interfaceName: string = 'wg0') {
    this.interfaceName = interfaceName;
  }

  async generateKeyPair(): Promise<WireGuardKeyPair> {
    try {
      const { stdout: privateKey } = await execAsync('wg genkey');
      const { stdout: publicKey } = await execAsync(`echo "${privateKey.trim()}" | wg pubkey`);
      
      return {
        privateKey: privateKey.trim(),
        publicKey: publicKey.trim(),
      };
    } catch (error: any) {
      logger.error('Failed to generate WireGuard key pair', error);
      throw error;
    }
  }

  async generatePresharedKey(): Promise<string> {
    try {
      const { stdout } = await execAsync('wg genpsk');
      return stdout.trim();
    } catch (error: any) {
      logger.error('Failed to generate preshared key', error);
      throw error;
    }
  }

  async addPeer(peer: WireGuardPeer): Promise<void> {
    try {
      let cmd = `wg set ${this.interfaceName} peer ${peer.publicKey}`;
      cmd += ` allowed-ips ${peer.allowedIPs}`;
      
      if (peer.presharedKey) {
        cmd += ` preshared-key <(echo "${peer.presharedKey}")`;
      }
      
      if (peer.persistentKeepalive) {
        cmd += ` persistent-keepalive ${peer.persistentKeepalive}`;
      }

      await execAsync(cmd, { shell: '/bin/bash' });
      logger.info(`Added peer ${peer.publicKey.substring(0, 8)}... to ${this.interfaceName}`);
    } catch (error: any) {
      logger.error('Failed to add peer', error);
      throw error;
    }
  }

  async removePeer(publicKey: string): Promise<void> {
    try {
      await execAsync(`wg set ${this.interfaceName} peer ${publicKey} remove`);
      logger.info(`Removed peer ${publicKey.substring(0, 8)}... from ${this.interfaceName}`);
    } catch (error: any) {
      logger.error('Failed to remove peer', error);
      throw error;
    }
  }

  async saveConfig(configPath: string = `/etc/wireguard/${this.interfaceName}.conf`): Promise<void> {
    try {
      await execAsync(`wg-quick save ${this.interfaceName}`);
      logger.info(`Saved WireGuard config to ${configPath}`);
    } catch (error: any) {
      logger.error('Failed to save config', error);
      throw error;
    }
  }

  async getInterfaceStatus(): Promise<string> {
    try {
      const { stdout } = await execAsync(`wg show ${this.interfaceName}`);
      return stdout;
    } catch (error: any) {
      logger.error('Failed to get interface status', error);
      throw error;
    }
  }

  async interfaceExists(): Promise<boolean> {
    try {
      await execAsync(`ip link show ${this.interfaceName}`);
      return true;
    } catch {
      return false;
    }
  }

  generateClientConfig(
    clientPrivateKey: string,
    clientAddress: string,
    serverPublicKey: string,
    serverEndpoint: string,
    serverPort: number = 51820,
    dns?: string,
    presharedKey?: string
  ): string {
    let config = `[Interface]
PrivateKey = ${clientPrivateKey}
Address = ${clientAddress}
${dns ? `DNS = ${dns}` : ''}

[Peer]
PublicKey = ${serverPublicKey}
Endpoint = ${serverEndpoint}:${serverPort}
AllowedIPs = 0.0.0.0/0, ::/0
${presharedKey ? `PresharedKey = ${presharedKey}` : ''}
PersistentKeepalive = 25
`;
    return config.trim();
  }
}
