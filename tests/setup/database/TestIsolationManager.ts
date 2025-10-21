import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

/**
 * TestIsolationManager - Handles test isolation through transactions and namespaces
 *
 * Provides:
 * - Transaction-based test isolation with automatic rollback
 * - Unique namespace generation for test data separation
 * - Unique ID generation for test entities
 * - Cleanup strategies for different scenarios
 */
export class TestIsolationManager {
  private prisma: PrismaClient;
  private currentTransaction: any = null;
  private testNamespace: string;
  private testStartTime: number;
  private operationMetrics: Array<{ operation: string; duration: number; timestamp: number }> = [];

  constructor(prisma: PrismaClient, testName?: string) {
    this.prisma = prisma;
    this.testNamespace = this.generateNamespace(testName);
    this.testStartTime = Date.now();
  }

  /**
   * Generate unique namespace for test isolation
   */
  private generateNamespace(testName?: string): string {
    const timestamp = Date.now();
    const randomSuffix = uuidv4().substring(0, 8);
    const testSuffix = testName ? `-${testName.replace(/[^a-zA-Z0-9]/g, '-')}` : '';
    return `test-${timestamp}-${randomSuffix}${testSuffix}`;
  }

  /**
   * Start a transaction for test isolation
   */
  public async startTransaction(): Promise<void> {
    if (this.currentTransaction) {
      throw new Error('Transaction already in progress. Call commitTransaction() or rollbackTransaction() first.');
    }

    const startTime = performance.now();

    try {
      this.currentTransaction = await this.prisma.$transaction(async (tx) => {
        // Store transaction reference for cleanup
        (tx as any)._testIsolationTx = true;
        return tx;
      });

      const duration = performance.now() - startTime;
      this.recordMetric('startTransaction', duration);

    } catch (error) {
      this.currentTransaction = null;
      console.error('Failed to start test transaction:', error);
      throw error;
    }
  }

  /**
   * Commit the current transaction
   */
  public async commitTransaction(): Promise<void> {
    if (!this.currentTransaction) {
      throw new Error('No transaction in progress');
    }

    const startTime = performance.now();

    try {
      // Transaction will auto-commit when callback completes
      this.currentTransaction = null;

      const duration = performance.now() - startTime;
      this.recordMetric('commitTransaction', duration);

    } catch (error) {
      console.error('Failed to commit test transaction:', error);
      throw error;
    }
  }

  /**
   * Rollback the current transaction (primary cleanup strategy)
   */
  public async rollbackTransaction(): Promise<void> {
    if (!this.currentTransaction) {
      console.warn('No transaction in progress to rollback');
      return;
    }

    const startTime = performance.now();

    try {
      // Force rollback by throwing in transaction
      await this.prisma.$transaction(async () => {
        throw new Error('TEST_ROLLBACK');
      }, {
        timeout: 5000,
      });

    } catch (error: any) {
      if (error.message !== 'TEST_ROLLBACK') {
        console.error('Unexpected error during transaction rollback:', error);
        throw error;
      }
      // Expected rollback error
    } finally {
      this.currentTransaction = null;

      const duration = performance.now() - startTime;
      this.recordMetric('rollbackTransaction', duration);
    }
  }

  /**
   * Get the transaction client for database operations
   */
  public getTransactionClient(): PrismaClient {
    if (!this.currentTransaction) {
      return this.prisma; // Return main client if no transaction
    }
    return this.currentTransaction;
  }

  /**
   * Generate unique ID for test entities
   */
  public generateUniqueId(prefix: string = 'test'): string {
    const timestamp = Date.now();
    const randomSuffix = uuidv4().substring(0, 8);
    return `${prefix}-${timestamp}-${randomSuffix}`;
  }

  /**
   * Get unique namespace for this test
   */
  public getNamespace(): string {
    return this.testNamespace;
  }

  /**
   * Create test data with unique identifiers
   */
  public createUniqueTestData<T extends Record<string, any>>(baseData: T): T {
    const enhancedData = { ...baseData };

    // Add unique namespace to all records
    if (!enhancedData.namespace) {
      (enhancedData as any).namespace = this.testNamespace;
    }

    // Generate unique IDs for key entities
    if (enhancedData.id) {
      (enhancedData as any).id = this.generateUniqueId(enhancedData.id as string);
    }

    // Generate unique session IDs
    if (enhancedData.sessionId) {
      (enhancedData as any).sessionId = this.generateUniqueId('session');
    }

    return enhancedData;
  }

  /**
   * Fast cleanup using namespace-based deletion (fallback strategy)
   */
  public async cleanupByNamespace(): Promise<void> {
    const startTime = performance.now();
    const tx = this.getTransactionClient();

    try {
      // Delete all data for this test namespace
      await tx.longTermMemory.deleteMany({
        where: { namespace: this.testNamespace }
      });

      await tx.shortTermMemory.deleteMany({
        where: { namespace: this.testNamespace }
      });

      await tx.chatHistory.deleteMany({
        where: { namespace: this.testNamespace }
      });

      const duration = performance.now() - startTime;
      this.recordMetric('cleanupByNamespace', duration);

    } catch (error) {
      console.error('Failed to cleanup by namespace:', error);
      throw error;
    }
  }

  /**
   * Emergency cleanup - truncate all tables (nuclear option)
   */
  public async emergencyCleanup(): Promise<void> {
    const startTime = performance.now();
    const tx = this.getTransactionClient();

    try {
      await tx.$executeRaw`PRAGMA foreign_keys = OFF`;

      try {
        // Truncate all tables
        await tx.$executeRaw`DELETE FROM LongTermMemory`;
        await tx.$executeRaw`DELETE FROM ShortTermMemory`;
        await tx.$executeRaw`DELETE FROM ChatHistory`;
        await tx.$executeRaw`DELETE FROM sqlite_sequence`;

      } finally {
        await tx.$executeRaw`PRAGMA foreign_keys = ON`;
      }

      const duration = performance.now() - startTime;
      this.recordMetric('emergencyCleanup', duration);

    } catch (error) {
      console.error('Failed emergency cleanup:', error);
      throw error;
    }
  }

  /**
   * Get performance metrics for this test
   */
  public getMetrics() {
    const totalDuration = Date.now() - this.testStartTime;

    return {
      namespace: this.testNamespace,
      totalDuration,
      operationMetrics: this.operationMetrics,
      hasActiveTransaction: !!this.currentTransaction,
      operationCount: this.operationMetrics.length,
    };
  }

  /**
   * Record operation metrics
   */
  private recordMetric(operation: string, duration: number): void {
    this.operationMetrics.push({
      operation,
      duration,
      timestamp: Date.now(),
    });

    // Keep only last 100 operations to prevent memory leaks
    if (this.operationMetrics.length > 100) {
      this.operationMetrics = this.operationMetrics.slice(-100);
    }
  }

  /**
   * Cleanup and disconnect
   */
  public async cleanup(): Promise<void> {
    try {
      // Rollback any active transaction
      if (this.currentTransaction) {
        await this.rollbackTransaction();
      }

      // Record final metrics
      this.recordMetric('totalTestDuration', Date.now() - this.testStartTime);

    } catch (error) {
      console.error('Error during TestIsolationManager cleanup:', error);
      // Don't throw - cleanup should be best effort
    }
  }
}

/**
 * Factory function to create TestIsolationManager with automatic database manager integration
 */
export async function createTestIsolationManager(
  suiteType: 'unit' | 'integration',
  testName?: string
): Promise<TestIsolationManager> {
  const { TestDatabaseManager } = await import('./TestDatabaseManager');
  const dbManager = TestDatabaseManager.getInstance();
  const prisma = await dbManager.getClient(suiteType);

  return new TestIsolationManager(prisma, testName);
}