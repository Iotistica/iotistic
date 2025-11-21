/**
 * Agent Metadata Model
 * Stores key-value metadata for agent operations (discovery, etc.)
 */

import { models } from '../connection';

export class MetadataModel {
  private static table = 'agent_metadata';

  /**
   * Get metadata value by key
   */
  static async get(key: string): Promise<string | null> {
    const row = await models(this.table)
      .where({ key })
      .select('value')
      .first();
    
    return row ? row.value : null;
  }

  /**
   * Set metadata value (upsert)
   */
  static async set(key: string, value: string): Promise<void> {
    const exists = await models(this.table)
      .where({ key })
      .first();

    if (exists) {
      await models(this.table)
        .where({ key })
        .update({ value, updatedAt: new Date().toISOString() });
    } else {
      await models(this.table).insert({
        key,
        value,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Delete metadata key
   */
  static async delete(key: string): Promise<void> {
    await models(this.table)
      .where({ key })
      .delete();
  }

  /**
   * Get all metadata keys with prefix
   */
  static async getByPrefix(prefix: string): Promise<Record<string, string>> {
    const rows = await models(this.table)
      .where('key', 'like', `${prefix}%`)
      .select('key', 'value');

    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  /**
   * Get object from JSON-encoded metadata
   */
  static async getObject<T>(key: string): Promise<T | null> {
    const value = await this.get(key);
    if (!value) return null;
    
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  /**
   * Set object as JSON-encoded metadata
   */
  static async setObject<T>(key: string, obj: T): Promise<void> {
    await this.set(key, JSON.stringify(obj));
  }
}
