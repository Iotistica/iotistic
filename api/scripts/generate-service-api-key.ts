/**
 * Generate Service API Key
 * Creates a long-lived API key for internal service-to-service communication
 * Usage: npx ts-node scripts/generate-service-api-key.ts <service-name>
 */

import * as crypto from 'crypto';
import { query, initializeDatabase } from '../src/db/connection';
import logger from '../src/utils/logger';

async function generateServiceApiKey(serviceName: string): Promise<void> {
  try {
    // Initialize database connection
    await initializeDatabase();

    // Generate a cryptographically secure API key (64 hex characters)
    const apiKey = crypto.randomBytes(32).toString('hex');

    // Check if key already exists for this service
    const existing = await query(
      'SELECT id, key, is_active FROM api_keys WHERE name = $1',
      [serviceName]
    );

    if (existing.rows.length > 0) {
      const existingKey = existing.rows[0];
      console.log(`\n⚠️  API key already exists for service: ${serviceName}`);
      console.log(`   Key ID: ${existingKey.id}`);
      console.log(`   Active: ${existingKey.is_active}`);
      
      if (existingKey.is_active) {
        console.log(`\n   Existing key: ${existingKey.key}`);
        console.log(`\nTo generate a new key, first revoke the existing one:`);
        console.log(`   UPDATE api_keys SET is_active = false WHERE name = '${serviceName}';`);
        process.exit(1);
      }
    }

    // Insert new API key
    const result = await query(
      `INSERT INTO api_keys (name, key, description, is_active, expires_at)
       VALUES ($1, $2, $3, true, NULL)
       RETURNING id, name, key, created_at`,
      [
        serviceName,
        apiKey,
        `Service API key for ${serviceName} - internal service-to-service authentication`
      ]
    );

    const newKey = result.rows[0];

    console.log('\n✅ Service API Key Generated Successfully\n');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`Service Name: ${newKey.name}`);
    console.log(`Key ID:       ${newKey.id}`);
    console.log(`Created:      ${newKey.created_at}`);
    console.log('───────────────────────────────────────────────────────────────');
    console.log(`API Key:      ${newKey.key}`);
    console.log('═══════════════════════════════════════════════════════════════\n');
    console.log('⚠️  IMPORTANT: Save this API key securely. It will not be shown again.\n');
    console.log('Add to your environment or docker-compose.yml:');
    console.log(`   ${serviceName.toUpperCase().replace(/-/g, '_')}_API_KEY=${newKey.key}\n`);

    logger.info('Service API key generated', {
      serviceName,
      keyId: newKey.id
    });

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error generating service API key:', error.message);
    logger.error('Failed to generate service API key', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
}

// Parse command line arguments
const serviceName = process.argv[2];

if (!serviceName) {
  console.error('\n❌ Service name required\n');
  console.log('Usage: npx ts-node scripts/generate-service-api-key.ts <service-name>');
  console.log('\nExamples:');
  console.log('  npx ts-node scripts/generate-service-api-key.ts nodered-storage');
  console.log('  npx ts-node scripts/generate-service-api-key.ts billing-service');
  console.log('  npx ts-node scripts/generate-service-api-key.ts agent-sync\n');
  process.exit(1);
}

generateServiceApiKey(serviceName);
