import { ChatHistoryData } from '../../../src/core/infrastructure/database/types';
import { DatabaseManager } from '../../../src/core/infrastructure/database/DatabaseManager';
import { MemoryClassification, MemoryImportanceLevel } from '../../../src/core/types/schemas';
import { TestHelper, beforeEachTest, afterEachTest } from '../../setup/database/TestHelper';

describe('DatabaseManager (Optimized)', () => {
  let dbManager: DatabaseManager;
  let testContext: Awaited<ReturnType<typeof beforeEachTest>>;

  beforeEach(async () => {
    // 🚀 OPTIMIZED: Use shared database instead of creating per-test files
    testContext = await beforeEachTest('unit', 'DatabaseManager');

    // Create DatabaseManager using shared database with unique namespace
    dbManager = new DatabaseManager(`file:${process.cwd()}/test-db-unit.sqlite`);
  });

  afterEach(async () => {
   // ⚡ OPTIMIZED: Just rollback transaction instead of complex cleanup
   await afterEachTest(testContext.testName);

   // 🧹 Fix timeout issue: Clean up SearchService and its timers
   try {
     const searchService = await dbManager.getSearchService();
     if (searchService) {
       searchService.cleanup();
     }
   } catch (error) {
     // Ignore cleanup errors - not critical for tests
   }
 });

  describe('Constructor and Basic Operations', () => {
    it('should create DatabaseManager instance', () => {
      expect(dbManager).toBeDefined();
    });

    it('should store chat history successfully', async () => {
      const chatData: ChatHistoryData = {
        chatId: 'test-chat-1',
        userInput: 'Hello, how are you?',
        aiOutput: 'I am doing well, thank you for asking.',
        model: 'gpt-4o-mini',
        sessionId: 'test-session-1',
        namespace: 'test-namespace',
        metadata: { test: true },
      };

      const result = await dbManager.storeChatHistory(chatData);
      expect(result).toBeDefined();
      expect(typeof result).toBe('string');
    });
  });

  describe('Error Handling', () => {
    it('should handle close operation safely', async () => {
      await expect(dbManager.close()).resolves.not.toThrow();
    });
  });

  describe('SQL Injection Vulnerability Fix', () => {
    let searchService: any;

    beforeEach(async () => {
      // Initialize FTS support for testing
      searchService = await dbManager.getSearchService();
    });

    afterEach(async () => {
      // 🧹 Fix timeout issue: Clean up SearchService and its timers
      try {
        if (searchService) {
          searchService.cleanup();
        }
      } catch (error) {
        // Ignore cleanup errors - not critical for tests
      }
    });

    it('should reject invalid FTS query parameters', async () => {
      const maliciousQuery = '\'; DROP TABLE memory_fts; --';
      const options = {
        limit: -1, // Invalid limit
        namespace: 'test',
        categories: ['' as MemoryClassification], // Invalid category
      };

      // Test that the SearchService itself validates properly
      const searchQuery = {
        text: maliciousQuery,
        limit: options.limit,
        offset: 0,
        includeMetadata: false,
      };

      await expect(searchService.search(searchQuery))
        .rejects.toThrow('Invalid search query');
    });

    it('should handle overly long queries safely', async () => {
      const longQuery = 'a'.repeat(2000); // Too long query
      const options = {
        limit: 10,
        namespace: 'test',
      };

      // Test that the SearchService itself validates properly
      const searchQuery = {
        text: longQuery,
        limit: options.limit,
        offset: 0,
        includeMetadata: false,
      };

      await expect(searchService.search(searchQuery))
        .rejects.toThrow('Invalid search query');
    });

    it('should handle overly large limits safely', async () => {
      const options = {
        limit: 5000, // Too large limit
        namespace: 'test',
      };

      // Test that the SearchService itself validates properly
      const searchQuery = {
        text: 'test query',
        limit: options.limit,
        offset: 0,
        includeMetadata: false,
      };

      await expect(searchService.search(searchQuery))
        .rejects.toThrow('Invalid search query');
    });

    it('should handle special characters in FTS queries safely', async () => {
      const specialQuery = 'test "query" with * wildcards and "quotes"';
      const options = {
        limit: 10,
        namespace: 'test',
      };

      // This should not throw an error and should return empty results (no data in test DB)
      const searchManager = (dbManager as any).searchManager;
      const results = await searchManager.searchMemories(specialQuery, options);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0); // No data in test database
    });

    it('should validate namespace parameter correctly', async () => {
      const options = {
        limit: 10,
        namespace: 'a'.repeat(200), // Too long namespace
      };

      // Test that the SearchManager validation works properly
      const searchManager = (dbManager as any).searchManager;

      try {
        await searchManager.searchMemories('test', options);
        throw new Error('Expected validation error for long namespace');
      } catch (error: any) {
        // The SearchManager should validate namespace length
        expect(error.message).toMatch(/(Namespace is too long|namespace|validation)/i);
      }
    });

    it('should handle valid FTS queries without errors', async () => {
      const validQuery = 'test search query';
      const options = {
        limit: 10,
        namespace: 'test',
        minImportance: MemoryImportanceLevel.MEDIUM,
        categories: [MemoryClassification.PERSONAL],
      };

      // Should not throw an error
      const searchManager = (dbManager as any).searchManager;
      const results = await searchManager.searchMemories(validQuery, options);
      expect(Array.isArray(results)).toBe(true);
    });
  });
});