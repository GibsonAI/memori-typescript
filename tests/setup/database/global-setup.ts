import { TestDatabaseManager } from './TestDatabaseManager';

/**
 * Jest global setup file for database initialization
 * This runs once before all tests start
 */

export default async function globalSetup() {
  console.log('🏗️ Global test setup starting...');

  try {
    const dbManager = TestDatabaseManager.getInstance();

    // Initialize databases for both unit and integration tests
    console.log('📊 Initializing unit test database...');
    await dbManager.getClient('unit');

    console.log('📊 Initializing integration test database...');
    await dbManager.getClient('integration');

    // Verify databases are healthy
    const isHealthy = await dbManager.healthCheck();
    if (!isHealthy) {
      throw new Error('Database health check failed during global setup');
    }

    console.log('✅ Global test setup completed successfully');

  } catch (error) {
    console.error('❌ Global test setup failed:', error);
    throw error;
  }
}