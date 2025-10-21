import { TestDatabaseManager } from './TestDatabaseManager';

/**
 * Jest setup file for database optimization
 * This runs before all tests to initialize shared databases
 */

/**
 * Global test database manager instance
 */
declare global {
  var __TEST_DB_MANAGER__: TestDatabaseManager;
  var __TEST_ISOLATION_MANAGERS__: Map<string, any>;
}

export async function initializeTestDatabases() {
  if (process.env.TEST_DEBUG) {
    console.log('🚀 Initializing test databases...');
  }

  globalThis.__TEST_DB_MANAGER__ = TestDatabaseManager.getInstance();
  globalThis.__TEST_ISOLATION_MANAGERS__ = new Map();

  try {
    // Initialize databases first
    await globalThis.__TEST_DB_MANAGER__.getClient('unit');
    await globalThis.__TEST_DB_MANAGER__.getClient('integration');

    // Health check to ensure databases are ready
    const isHealthy = await globalThis.__TEST_DB_MANAGER__.healthCheck();
    if (!isHealthy) {
      throw new Error('Test database health check failed');
    }

    if (process.env.TEST_DEBUG) {
      console.log('✅ Test databases initialized successfully');
    }

  } catch (error) {
    if (process.env.TEST_DEBUG) {
      console.error('❌ Failed to initialize test databases:', error);
    }
    throw error;
  }
}

// Initialize databases when this module is loaded
initializeTestDatabases().catch((error) => {
  if (process.env.TEST_DEBUG) {
    console.error('Failed to initialize test databases during setup:', error);
  }
  process.exit(1);
});