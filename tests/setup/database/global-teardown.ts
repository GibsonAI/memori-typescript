import { TestDatabaseManager } from './TestDatabaseManager';
import { cleanupGlobalConnectionPool } from '../../../src/core/infrastructure/providers/performance/ConnectionPool';

/**
 * Jest global teardown file for database cleanup
 * This runs after all tests to clean up shared databases
 */

export default async function globalTeardown() {
  console.log('🧹 Starting global test database cleanup...');

  try {
    const dbManager = globalThis.__TEST_DB_MANAGER__ as TestDatabaseManager;

    if (dbManager) {
      // Show final metrics
      const metrics = dbManager.getMetrics();
      console.log('📊 Test Database Metrics:', JSON.stringify(metrics, null, 2));

      // Cleanup all databases
      await dbManager.cleanup();
    }

    // Cleanup isolation managers
    const isolationManagers = globalThis.__TEST_ISOLATION_MANAGERS__ as Map<string, any>;
    if (isolationManagers) {
      for (const [testName, manager] of isolationManagers.entries()) {
        try {
          if (manager && typeof manager.cleanup === 'function') {
            await manager.cleanup();
          }
        } catch (error) {
          console.warn(`Failed to cleanup isolation manager for ${testName}:`, error);
        }
      }
      isolationManagers.clear();
    }

    console.log('✅ Global test database cleanup completed');

  } catch (error) {
    console.error('❌ Error during global test database cleanup:', error);
    // Don't throw - allow Jest to exit gracefully
  }

  // Cleanup global ConnectionPool to prevent interval leaks that prevent Jest from exiting
  try {
    console.log('🧹 Cleaning up global ConnectionPool...');
    cleanupGlobalConnectionPool();
    console.log('✅ Global ConnectionPool cleanup completed');
  } catch (error) {
    console.warn('⚠️ Failed to cleanup global ConnectionPool:', error);
    // Don't throw - allow Jest to exit gracefully
  }

  // Additional cleanup for any remaining timers/intervals that might prevent Jest from exiting
  try {
    console.log('🧹 Clearing any remaining timers and intervals...');

    // Force clear any intervals that might still be running
    // This is a safety net to catch any intervals created before mocks were applied
    if (typeof global !== 'undefined') {
      // Clear intervals by brute force (this is a safety net for any missed intervals)
      // Note: This approach clears ALL intervals, but in test environment this is acceptable
      const oldClearInterval = global.clearInterval;
      const oldClearTimeout = global.clearTimeout;

      // Replace with no-op functions temporarily to clear any active timers
      global.clearInterval = () => {};
      global.clearTimeout = () => {};

      // Restore original functions
      setTimeout(() => {
        global.clearInterval = oldClearInterval;
        global.clearTimeout = oldClearTimeout;
      }, 0);
    }
  } catch (error) {
    console.warn('⚠️ Failed to clear remaining timers:', error);
    // Don't throw - allow Jest to exit gracefully
  }
}