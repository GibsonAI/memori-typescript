/**
 * Index Backup Script
 *
 * Creates a backup of the search index with integrity verification.
 * Run with: npm run index:backup
 */

import { Memori, ConfigManager } from '../../src/index';
import { logInfo, logError } from '../../src/core/infrastructure/config/Logger';

async function createIndexBackup(): Promise<void> {
  logInfo('💾 Creating search index backup...', { component: 'index-backup' });

  let memori: Memori | undefined;

  try {
    // Load configuration
    const config = ConfigManager.loadConfig();

    // Initialize Memori
    memori = new Memori(config);
    await memori.enable();

    // Create backup
    const backup = await memori.createIndexBackup();

    console.log('\n✅ Index Backup Created');
    console.log('======================');
    console.log(`Timestamp: ${backup.timestamp}`);
    console.log(`Version: ${backup.version}`);
    console.log(`Index Size: ${(backup.indexSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Document Count: ${backup.documentCount}`);
    console.log(`Optimization Level: ${backup.optimizationLevel}`);
    console.log(`Checksum: ${backup.checksum.substring(0, 16)}...`);

    console.log('\n📋 Backup Information:');
    console.log('- Backup is stored in the search_index_backups table');
    console.log('- Use restoreFromBackup() method to restore if needed');
    console.log('- Checksum ensures backup integrity');

  } catch (error) {
    logError('❌ Failed to create index backup', {
      component: 'index-backup',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    if (memori) {
      await memori.close();
    }
  }
}

// Run the script
createIndexBackup().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});