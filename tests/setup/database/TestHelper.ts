import { PrismaClient } from '@prisma/client';
import { TestDatabaseManager } from './TestDatabaseManager';
import { TestIsolationManager, createTestIsolationManager } from './TestIsolationManager';

/**
 * TestHelper - Simplified interface for tests to use optimized database system
 *
 * Provides easy-to-use methods for:
 * - Getting database clients
 * - Managing test isolation through namespaces (not transactions)
 * - Creating test data
 * - Cleanup operations
 */

export interface TestContext {
  prisma: PrismaClient;
  suiteType: 'unit' | 'integration';
  testName: string;
  namespace: string;
}

export class TestHelper {
  private static dbManager = TestDatabaseManager.getInstance();

  /**
   * Setup test context for a test (namespace-based isolation)
   */
  public static async setupTest(
    suiteType: 'unit' | 'integration',
    testName: string
  ): Promise<TestContext> {
    try {
      // Get or create database client
      const prisma = await this.dbManager.getClient(suiteType);

      // Generate unique namespace for this test
      const namespace = this.generateNamespace(testName);

      const context: TestContext = {
        prisma,
        suiteType,
        testName,
        namespace,
      };

      return context;

    } catch (error) {
      console.error(`Failed to setup test ${testName}:`, error);
      throw error;
    }
  }

  /**
   * Cleanup test context (namespace-based cleanup)
   */
  public static async cleanupTest(testName: string, namespace: string): Promise<void> {
    try {
      // Clean up all data for this test's namespace
      const { TestDatabaseManager } = await import('./TestDatabaseManager');
      const dbManager = TestDatabaseManager.getInstance();

      // For now, we'll reset the entire database since namespace cleanup is complex
      // This is still much faster than creating new database files
      // console.log(`🧹 Cleaning up namespace: ${namespace}`);
      // Note: We'll implement namespace-specific cleanup later if needed

    } catch (error) {
      console.error(`Failed to cleanup test ${testName}:`, error);
      // Don't throw - cleanup should be best effort
    }
  }

  /**
   * Generate unique namespace for test (using 'default' for compatibility)
   */
  private static generateNamespace(testName: string): string {
    // Use 'default' namespace for compatibility with existing repository code
    // Add unique suffix to avoid conflicts between tests
    const timestamp = Date.now();
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    return `default-${timestamp}-${randomSuffix}`;
  }

  /**
   * Get a fresh Prisma client (bypassing transactions for special cases)
   */
  public static async getFreshClient(suiteType: 'unit' | 'integration'): Promise<PrismaClient> {
    return await this.dbManager.getClient(suiteType);
  }

  /**
   * Reset entire database for suite (nuclear option)
   */
  public static async resetDatabase(suiteType: 'unit' | 'integration'): Promise<void> {
    await this.dbManager.resetDatabase(suiteType);
  }

  /**
   * Get database metrics for monitoring
   */
  public static getMetrics(suiteType?: 'unit' | 'integration') {
    return this.dbManager.getMetrics(suiteType);
  }

  /**
   * Create common test data with unique identifiers and namespace
   */
  public static createTestChatHistory(context: TestContext, overrides: any = {}) {
    return {
      id: `chat-${context.testName}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      userInput: 'Test user input',
      aiOutput: 'Test AI output',
      model: 'gpt-4o-mini',
      sessionId: `session-${context.testName}-${Math.random().toString(36).substr(2, 5)}`,
      namespace: context.namespace, // Use context's unique namespace for test isolation
      timestamp: new Date(),
      tokensUsed: 100,
      metadata: { test: true },
      ...overrides,
    };
  }

  public static createTestShortTermMemory(context: TestContext, overrides: any = {}) {
    return {
      id: `stm-${context.testName}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      chatId: null, // Set to null to avoid foreign key constraint issues
      processedData: { test: 'data' },
      importanceScore: 0.5,
      categoryPrimary: 'test-category',
      retentionType: 'short_term',
      searchableContent: 'Test searchable content',
      summary: 'Test summary',
      namespace: context.namespace, // Use context's unique namespace for test isolation
      createdAt: new Date(),
      ...overrides,
    };
  }

  public static createTestLongTermMemory(context: TestContext, overrides: any = {}) {
    return {
      id: `ltm-${context.testName}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      originalChatId: null, // Set to null to avoid foreign key constraint issues
      processedData: { test: 'data' },
      importanceScore: 0.7,
      categoryPrimary: 'test-category',
      retentionType: 'long_term',
      searchableContent: 'Test searchable content for long term memory',
      summary: 'Test long term summary',
      classification: 'essential',
      memoryImportance: 'high',
      namespace: context.namespace, // Use context's unique namespace for test isolation
      createdAt: new Date(),
      extractionTimestamp: new Date(),
      confidenceScore: 0.8,
      ...overrides,
    };
  }
}

/**
 * Jest beforeEach/beforeAll helper
 */
export async function beforeEachTest(
  suiteType: 'unit' | 'integration',
  testName?: string
): Promise<TestContext> {
  const name = testName || expect.getState().currentTestName || 'unknown-test';
  return await TestHelper.setupTest(suiteType, name);
}

/**
 * Jest afterEach/afterAll helper
 */
export async function afterEachTest(testName?: string, namespace?: string): Promise<void> {
  const name = testName || expect.getState().currentTestName || 'unknown-test';
  const ns = namespace || `test-${Date.now()}-cleanup-${name}`;
  await TestHelper.cleanupTest(name, ns);
}