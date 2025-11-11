import { v4 as uuidv4 } from 'uuid';
import { query } from './db';
import { WireGuardManager } from './wireguard';
import QRCode from 'qrcode';
import logger from './logger';

export interface Peer {
  id?: number;
  peerId: string;
  publicKey: string;
  privateKey: string;
  presharedKey?: string;
  ipAddress: string;
  allowedIps: string;
  endpoint?: string;
  persistentKeepalive: number;
  deviceId?: string;
  deviceName?: string;
  notes?: string;
  enabled: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ServerConfig {
  interfaceName: string;
  listenPort: number;
  privateKey: string;
  publicKey: string;
  address: string;
  dns?: string;
}

export class PeerManager {
  private wg: WireGuardManager;

  constructor(wg: WireGuardManager) {
    this.wg = wg;
  }

  async createPeer(deviceId?: string, deviceName?: string, notes?: string): Promise<Peer> {
    try {
      // Generate keys
      const keyPair = await this.wg.generateKeyPair();
      const presharedKey = await this.wg.generatePresharedKey();
      
      // Allocate IP address
      const ipAddress = await this.allocateIP();
      
      const peerId = uuidv4();
      
      // Insert into database
      const result = await query(
        `INSERT INTO wg_peers (
          peer_id, public_key, private_key, preshared_key, ip_address,
          allowed_ips, persistent_keepalive, device_id, device_name, notes, enabled
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING *`,
        [
          peerId,
          keyPair.publicKey,
          keyPair.privateKey,
          presharedKey,
          ipAddress,
          '0.0.0.0/0, ::/0',
          25,
          deviceId,
          deviceName,
          notes,
          true,
        ]
      );

      const peer = this.mapRowToPeer(result.rows[0]);

      // Add to WireGuard interface
      await this.wg.addPeer({
        publicKey: peer.publicKey,
        presharedKey: peer.presharedKey,
        allowedIPs: peer.ipAddress + '/32',
        persistentKeepalive: peer.persistentKeepalive,
      });

      logger.info(`Created peer ${peer.peerId} with IP ${peer.ipAddress}`);
      return peer;
    } catch (error: any) {
      logger.error('Failed to create peer', error);
      throw error;
    }
  }

  async getPeer(peerId: string): Promise<Peer | null> {
    const result = await query('SELECT * FROM wg_peers WHERE peer_id = $1', [peerId]);
    return result.rows.length > 0 ? this.mapRowToPeer(result.rows[0]) : null;
  }

  async listPeers(enabled?: boolean): Promise<Peer[]> {
    let sql = 'SELECT * FROM wg_peers';
    const params: any[] = [];
    
    if (enabled !== undefined) {
      sql += ' WHERE enabled = $1';
      params.push(enabled);
    }
    
    sql += ' ORDER BY created_at DESC';
    
    const result = await query(sql, params);
    return result.rows.map(this.mapRowToPeer);
  }

  async deletePeer(peerId: string): Promise<boolean> {
    try {
      const peer = await this.getPeer(peerId);
      if (!peer) {
        return false;
      }

      // Remove from WireGuard interface
      await this.wg.removePeer(peer.publicKey);

      // Release IP address
      await this.releaseIP(peer.ipAddress);

      // Delete from database
      await query('DELETE FROM wg_peers WHERE peer_id = $1', [peerId]);

      logger.info(`Deleted peer ${peerId}`);
      return true;
    } catch (error: any) {
      logger.error('Failed to delete peer', error);
      throw error;
    }
  }

  async updatePeer(peerId: string, updates: Partial<Peer>): Promise<Peer | null> {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (updates.deviceName !== undefined) {
      fields.push(`device_name = $${paramIndex++}`);
      values.push(updates.deviceName);
    }
    
    if (updates.notes !== undefined) {
      fields.push(`notes = $${paramIndex++}`);
      values.push(updates.notes);
    }
    
    if (updates.enabled !== undefined) {
      fields.push(`enabled = $${paramIndex++}`);
      values.push(updates.enabled);
    }

    if (fields.length === 0) {
      return this.getPeer(peerId);
    }

    fields.push(`updated_at = NOW()`);
    values.push(peerId);

    const result = await query(
      `UPDATE wg_peers SET ${fields.join(', ')} WHERE peer_id = $${paramIndex} RETURNING *`,
      values
    );

    return result.rows.length > 0 ? this.mapRowToPeer(result.rows[0]) : null;
  }

  async generateConfig(peerId: string, serverEndpoint: string): Promise<string> {
    const peer = await this.getPeer(peerId);
    if (!peer) {
      throw new Error('Peer not found');
    }

    const serverConfig = await this.getServerConfig();

    return this.wg.generateClientConfig(
      peer.privateKey,
      peer.ipAddress + '/24',
      serverConfig.publicKey,
      serverEndpoint,
      serverConfig.listenPort,
      serverConfig.dns,
      peer.presharedKey
    );
  }

  async generateQRCode(peerId: string, serverEndpoint: string): Promise<string> {
    const config = await this.generateConfig(peerId, serverEndpoint);
    return await QRCode.toDataURL(config);
  }

  private async allocateIP(): Promise<string> {
    // Use FOR UPDATE SKIP LOCKED to prevent race conditions
    // This ensures only one transaction can grab each IP address
    const result = await query(
      `WITH next_ip AS (
         SELECT ip_address 
         FROM wg_ip_pool 
         WHERE is_available = true 
         ORDER BY ip_address 
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE wg_ip_pool 
       SET is_available = false, assigned_at = NOW()
       FROM next_ip
       WHERE wg_ip_pool.ip_address = next_ip.ip_address
       RETURNING wg_ip_pool.ip_address`
    );

    if (result.rows.length === 0) {
      throw new Error('No available IP addresses in pool');
    }

    return result.rows[0].ip_address;
  }

  private async releaseIP(ipAddress: string): Promise<void> {
    await query(
      `UPDATE wg_ip_pool 
       SET is_available = true, assigned_to = NULL, assigned_at = NULL
       WHERE ip_address = $1`,
      [ipAddress]
    );
  }

  private async getServerConfig(): Promise<ServerConfig> {
    const result = await query('SELECT * FROM wg_config LIMIT 1');
    if (result.rows.length === 0) {
      throw new Error('Server config not initialized');
    }

    const row = result.rows[0];
    return {
      interfaceName: row.interface_name,
      listenPort: row.listen_port,
      privateKey: row.private_key,
      publicKey: row.public_key,
      address: row.address,
      dns: row.dns,
    };
  }

  private mapRowToPeer(row: any): Peer {
    return {
      id: row.id,
      peerId: row.peer_id,
      publicKey: row.public_key,
      privateKey: row.private_key,
      presharedKey: row.preshared_key,
      ipAddress: row.ip_address,
      allowedIps: row.allowed_ips,
      endpoint: row.endpoint,
      persistentKeepalive: row.persistent_keepalive,
      deviceId: row.device_id,
      deviceName: row.device_name,
      notes: row.notes,
      enabled: row.enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
