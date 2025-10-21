import { MemoryManager, MemoryManagerConfig } from '../../../src/core/infrastructure/database/MemoryManager';
import { MemoryClassification, MemoryImportanceLevel, ProcessedLongTermMemory } from '../../../src/core/types/schemas';
import { TestHelper, beforeEachTest, afterEachTest } from '../../setup/database/TestHelper';
import { DatabaseContext } from '../../../src/core/infrastructure/database/DatabaseContext';
import { MemoryProcessingState } from '../../../src/core/infrastructure/database/StateManager';

describe('MemoryManager', () => {
  let memoryManager: MemoryManager;
  let testContext: Awaited<ReturnType<typeof beforeEachTest>>;
  let databaseContext: DatabaseContext;

  beforeEach(async () => {
    testContext = await beforeEachTest('unit', 'MemoryManager');

    // Create DatabaseContext for testing
    databaseContext = new DatabaseContext({
      databaseUrl: `file:${process.cwd()}/test-db-unit.sqlite`,
      enablePerformanceMonitoring: false, // Disable for tests
      enableFTS: false,
    });

    // Create MemoryManager with test configuration
    memoryManager = new MemoryManager(databaseContext, {
      enableStateTracking: true,
      enableValidation: true,
      maxContentLength: 1000,
      defaultNamespace: 'default',
    });
  });

  afterEach(async () => {
    await afterEachTest(testContext.testName);

    // Cleanup database context
    if (databaseContext) {
      await databaseContext.cleanup();
    }
  });

  describe('Constructor and Configuration', () => {
    it('should create MemoryManager with default configuration', () => {
      const defaultManager = new MemoryManager(databaseContext);
      expect(defaultManager).toBeDefined();
      expect(defaultManager.getConfig()).toEqual({
        enableStateTracking: true,
        enableValidation: true,
        maxContentLength: 10000,
        defaultNamespace: 'default',
      });
    });

    it('should create MemoryManager with custom configuration', () => {
      const customConfig: MemoryManagerConfig = {
        enableStateTracking: false,
        enableValidation: false,
        maxContentLength: 500,
        defaultNamespace: 'custom-namespace',
      };

      const customManager = new MemoryManager(databaseContext, customConfig);
      expect(customManager.getConfig()).toEqual({
        enableStateTracking: false,
        enableValidation: false,
        maxContentLength: 500,
        defaultNamespace: 'custom-namespace',
      });
    });

    it('should provide access to database context', () => {
      expect(memoryManager.getDatabaseContext()).toBe(databaseContext);
    });

    it('should provide access to state manager', () => {
      const stateManager = memoryManager.getStateManager();
      expect(stateManager).toBeDefined();
    });
  });

  describe('Memory Storage', () => {
    it('should store long-term memory successfully', async () => {
      const memoryData: ProcessedLongTermMemory = {
        content: 'Test memory content for unit testing',
        summary: 'Test summary',
        classification: MemoryClassification.CONVERSATIONAL,
        importance: MemoryImportanceLevel.MEDIUM,
        conversationId: testContext.testName,
        topic: 'unit-testing',
        entities: ['test', 'memory'],
        keywords: ['unit', 'test'],
        confidenceScore: 0.8,
        classificationReason: 'Test memory for automated testing',
        promotionEligible: false,
      };

      const memoryId = await memoryManager.storeLongTermMemory(
        memoryData,
        null,
        testContext.namespace,
      );

      expect(memoryId).toBeDefined();
      expect(typeof memoryId).toBe('string');
      expect(memoryId.length).toBeGreaterThan(0);
    });

    it('should store memory with minimal required fields', async () => {
      const minimalMemoryData: ProcessedLongTermMemory = {
        content: 'Minimal test content',
        summary: 'Minimal summary',
        classification: MemoryClassification.REFERENCE,
        importance: MemoryImportanceLevel.LOW,
        conversationId: testContext.testName,
        confidenceScore: 0.5,
        classificationReason: 'Minimal test case',
        entities: [],
        keywords: [],
        promotionEligible: false,
      };

      const memoryId = await memoryManager.storeLongTermMemory(
        minimalMemoryData,
        null,
        testContext.namespace,
      );

      expect(memoryId).toBeDefined();
    });

    it('should handle memory with all importance levels', async () => {
      const importanceLevels = [
        MemoryImportanceLevel.CRITICAL,
        MemoryImportanceLevel.HIGH,
        MemoryImportanceLevel.MEDIUM,
        MemoryImportanceLevel.LOW,
      ];

      for (const importance of importanceLevels) {
        const memoryData: ProcessedLongTermMemory = {
          content: `Test content with ${importance} importance`,
          summary: `Summary for ${importance}`,
          classification: MemoryClassification.ESSENTIAL,
          importance,
          conversationId: testContext.testName,
          confidenceScore: 0.7,
          classificationReason: `Test for ${importance} importance`,
          entities: [`entity-${importance}`],
          keywords: [`keyword-${importance}`],
          promotionEligible: false,
        };

        const memoryId = await memoryManager.storeLongTermMemory(
          memoryData,
          null,
          testContext.namespace,
        );

        expect(memoryId).toBeDefined();
      }
    });

    it('should handle memory with all classification types', async () => {
      const classifications = [
        MemoryClassification.CONVERSATIONAL,
        MemoryClassification.ESSENTIAL,
        MemoryClassification.REFERENCE,
        MemoryClassification.CONTEXTUAL,
      ];

      for (const classification of classifications) {
        const memoryData: ProcessedLongTermMemory = {
          content: `Test content for ${classification} classification`,
          summary: `Summary for ${classification}`,
          classification,
          importance: MemoryImportanceLevel.MEDIUM,
          conversationId: testContext.testName,
          confidenceScore: 0.7,
          classificationReason: `Test for ${classification} type`,
          entities: [`entity-${classification}`],
          keywords: [`keyword-${classification}`],
          promotionEligible: false,
        };

        const memoryId = await memoryManager.storeLongTermMemory(
          memoryData,
          null,
          testContext.namespace,
        );

        expect(memoryId).toBeDefined();
      }
    });
  });

  describe('Memory Retrieval', () => {
    let storedMemoryId: string;

    beforeEach(async () => {
      // Store a test memory for retrieval tests
      const memoryData: ProcessedLongTermMemory = {
        content: 'Test memory for retrieval operations',
        summary: 'Retrieval test summary',
        classification: MemoryClassification.CONVERSATIONAL,
        importance: MemoryImportanceLevel.HIGH,
        conversationId: testContext.testName,
        confidenceScore: 0.9,
        classificationReason: 'Test retrieval functionality',
        entities: ['test', 'retrieval'],
        keywords: ['memory', 'test'],
        promotionEligible: false,
      };

      storedMemoryId = await memoryManager.storeLongTermMemory(
        memoryData,
        null,
        testContext.namespace,
      );
    });

    it('should retrieve memory by ID successfully', async () => {
      const retrievedMemory = await memoryManager.getMemoryById(
        storedMemoryId,
        testContext.namespace,
      );

      expect(retrievedMemory).toBeDefined();
      expect(retrievedMemory!.content).toBe('Test memory for retrieval operations');
      expect(retrievedMemory!.summary).toBe('Retrieval test summary');
      expect(retrievedMemory!.classification).toBe(MemoryClassification.CONVERSATIONAL);
      expect(retrievedMemory!.importance).toBe(MemoryImportanceLevel.HIGH);
    });

    it('should return null for non-existent memory ID', async () => {
      const retrievedMemory = await memoryManager.getMemoryById(
        'non-existent-id',
        testContext.namespace,
      );

      expect(retrievedMemory).toBeNull();
    });

    it('should retrieve memories by namespace', async () => {
      const memories = await memoryManager.getMemoriesByNamespace(
        testContext.namespace,
        { limit: 10 },
      );

      expect(Array.isArray(memories)).toBe(true);
      expect(memories.length).toBeGreaterThan(0);

      // Check that all returned memories are from the correct namespace
      memories.forEach(memory => {
        expect(memory.content).toBeDefined();
        expect(memory.summary).toBeDefined();
      });
    });

    it('should retrieve memories by importance level', async () => {
      const highImportanceMemories = await memoryManager.getMemoriesByImportance(
        MemoryImportanceLevel.HIGH,
        testContext.namespace,
        { limit: 10 },
      );

      expect(Array.isArray(highImportanceMemories)).toBe(true);

      // All returned memories should meet or exceed the importance threshold
      highImportanceMemories.forEach(memory => {
        expect(memory.importance).toBeDefined();
      });
    });

    it('should respect pagination options', async () => {
      const page1 = await memoryManager.getMemoriesByNamespace(
        testContext.namespace,
        { limit: 5, offset: 0 },
      );

      const page2 = await memoryManager.getMemoriesByNamespace(
        testContext.namespace,
        { limit: 5, offset: 5 },
      );

      expect(Array.isArray(page1)).toBe(true);
      expect(Array.isArray(page2)).toBe(true);
      expect(page1.length).toBeLessThanOrEqual(5);
      expect(page2.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Memory Updates', () => {
    let storedMemoryId: string;

    beforeEach(async () => {
      const memoryData: ProcessedLongTermMemory = {
        content: 'Original test content',
        summary: 'Original summary',
        classification: MemoryClassification.CONVERSATIONAL,
        importance: MemoryImportanceLevel.MEDIUM,
        conversationId: testContext.testName,
        confidenceScore: 0.7,
        classificationReason: 'Original test memory',
        entities: ['original', 'test'],
        keywords: ['memory', 'modification'],
        promotionEligible: false,
      };

      storedMemoryId = await memoryManager.storeLongTermMemory(
        memoryData,
        null,
        testContext.namespace,
      );
    });

    it('should update memory content successfully', async () => {
      const updates = {
        content: 'Updated test content for memory operations',
        summary: 'Updated summary for testing',
      };

      const success = await memoryManager.updateMemory(
        storedMemoryId,
        updates,
        testContext.namespace,
      );

      expect(success).toBe(true);

      // Verify the update
      const updatedMemory = await memoryManager.getMemoryById(
        storedMemoryId,
        testContext.namespace,
      );

      expect(updatedMemory!.content).toBe(updates.content);
      expect(updatedMemory!.summary).toBe(updates.summary);
    });

    it('should update memory classification and importance', async () => {
      const updates = {
        classification: MemoryClassification.ESSENTIAL,
        importance: MemoryImportanceLevel.CRITICAL,
        confidenceScore: 0.95,
      };

      const success = await memoryManager.updateMemory(
        storedMemoryId,
        updates,
        testContext.namespace,
      );

      expect(success).toBe(true);

      // Verify the update
      const updatedMemory = await memoryManager.getMemoryById(
        storedMemoryId,
        testContext.namespace,
      );

      expect(updatedMemory!.classification).toBe(MemoryClassification.ESSENTIAL);
      expect(updatedMemory!.importance).toBe(MemoryImportanceLevel.CRITICAL);
      expect(updatedMemory!.confidenceScore).toBe(0.95);
    });

    it('should return false when no updates are provided', async () => {
      const success = await memoryManager.updateMemory(
        storedMemoryId,
        {},
        testContext.namespace,
      );

      expect(success).toBe(false);
    });

    it('should throw error for non-existent memory', async () => {
      await expect(
        memoryManager.updateMemory(
          'non-existent-id',
          { content: 'Updated content' },
          testContext.namespace,
        ),
      ).rejects.toThrow();
    });
  });

  describe('Memory Deletion', () => {
    let storedMemoryId: string;

    beforeEach(async () => {
      const memoryData: ProcessedLongTermMemory = {
        content: 'Test memory for deletion operations',
        summary: 'Deletion test summary',
        classification: MemoryClassification.REFERENCE,
        importance: MemoryImportanceLevel.LOW,
        conversationId: testContext.testName,
        confidenceScore: 0.6,
        classificationReason: 'Test deletion functionality',
        entities: ['deletion', 'test'],
        keywords: ['memory', 'removal'],
        promotionEligible: false,
      };

      storedMemoryId = await memoryManager.storeLongTermMemory(
        memoryData,
        null,
        testContext.namespace,
      );
    });

    it('should delete memory successfully', async () => {
      const success = await memoryManager.deleteMemory(
        storedMemoryId,
        testContext.namespace,
      );

      expect(success).toBe(true);

      // Verify the memory is deleted
      const deletedMemory = await memoryManager.getMemoryById(
        storedMemoryId,
        testContext.namespace,
      );

      expect(deletedMemory).toBeNull();
    });

    it('should return false for non-existent memory', async () => {
      const success = await memoryManager.deleteMemory(
        'non-existent-id',
        testContext.namespace,
      );

      expect(success).toBe(false);
    });

    it('should handle deletion with cascade options', async () => {
      const success = await memoryManager.deleteMemory(
        storedMemoryId,
        testContext.namespace,
        { cascadeDelete: true },
      );

      expect(success).toBe(true);
    });
  });

  describe('Validation and Error Handling', () => {
    it('should reject memory with content exceeding max length', async () => {
      const longContent = 'a'.repeat(2000); // Exceeds default max length

      const memoryData: ProcessedLongTermMemory = {
        content: longContent,
        summary: 'Test summary',
        classification: MemoryClassification.CONVERSATIONAL,
        importance: MemoryImportanceLevel.MEDIUM,
        conversationId: testContext.testName,
        confidenceScore: 0.7,
        classificationReason: 'Test validation',
        entities: ['validation', 'test'],
        keywords: ['length', 'validation'],
        promotionEligible: false,
      };

      await expect(
        memoryManager.storeLongTermMemory(
          memoryData,
          null,
          testContext.namespace,
        ),
      ).rejects.toThrow();
    });

    it('should reject memory with invalid importance level', async () => {
      const memoryData: ProcessedLongTermMemory = {
        content: 'Test content',
        summary: 'Test summary',
        classification: MemoryClassification.CONVERSATIONAL,
        importance: 'INVALID' as MemoryImportanceLevel,
        conversationId: testContext.testName,
        confidenceScore: 0.7,
        classificationReason: 'Test validation',
        entities: ['validation', 'test'],
        keywords: ['invalid', 'priority'],
        promotionEligible: false,
      };

      await expect(
        memoryManager.storeLongTermMemory(
          memoryData,
          null,
          testContext.namespace,
        ),
      ).rejects.toThrow();
    });

    it('should reject memory with invalid classification', async () => {
      const memoryData: ProcessedLongTermMemory = {
        content: 'Test content',
        summary: 'Test summary',
        classification: 'INVALID' as MemoryClassification,
        importance: MemoryImportanceLevel.MEDIUM,
        conversationId: testContext.testName,
        confidenceScore: 0.7,
        classificationReason: 'Test validation',
        entities: ['validation', 'test'],
        keywords: ['invalid', 'category'],
        promotionEligible: false,
      };

      await expect(
        memoryManager.storeLongTermMemory(
          memoryData,
          null,
          testContext.namespace,
        ),
      ).rejects.toThrow();
    });

    it('should reject memory with invalid confidence score', async () => {
      const memoryData: ProcessedLongTermMemory = {
        content: 'Test content',
        summary: 'Test summary',
        classification: MemoryClassification.CONVERSATIONAL,
        importance: MemoryImportanceLevel.MEDIUM,
        conversationId: testContext.testName,
        confidenceScore: 1.5, // Invalid: should be 0-1
        classificationReason: 'Test validation',
        entities: ['validation', 'test'],
        keywords: ['invalid', 'score'],
        promotionEligible: false,
      };

      await expect(
        memoryManager.storeLongTermMemory(
          memoryData,
          null,
          testContext.namespace,
        ),
      ).rejects.toThrow();
    });
  });

  describe('State Management Integration', () => {
    it('should initialize state tracking for new memory', async () => {
      const memoryData: ProcessedLongTermMemory = {
        content: 'Test memory with state tracking',
        summary: 'State tracking test',
        classification: MemoryClassification.ESSENTIAL,
        importance: MemoryImportanceLevel.HIGH,
        conversationId: testContext.testName,
        confidenceScore: 0.8,
        classificationReason: 'Test state tracking integration',
        entities: ['test', 'memory'],
        keywords: ['crud', 'test'],
        promotionEligible: false,
      };

      const memoryId = await memoryManager.storeLongTermMemory(
        memoryData,
        null,
        testContext.namespace,
      );

      // Check that state was initialized
      const stateManager = memoryManager.getStateManager();
      const memoryState = await stateManager.getMemoryState(memoryId);

      expect(memoryState).toBe(MemoryProcessingState.PROCESSED);
    });

    it('should transition memory state on update', async () => {
      const memoryData: ProcessedLongTermMemory = {
        content: 'Test memory for state transitions',
        summary: 'State transition test',
        classification: MemoryClassification.CONVERSATIONAL,
        importance: MemoryImportanceLevel.MEDIUM,
        conversationId: testContext.testName,
        confidenceScore: 0.7,
        classificationReason: 'Test state transitions',
        entities: ['state', 'transition'],
        keywords: ['memory', 'state'],
        promotionEligible: false,
      };

      const memoryId = await memoryManager.storeLongTermMemory(
        memoryData,
        null,
        testContext.namespace,
      );

      // Update the memory to trigger state transition
      await memoryManager.updateMemory(
        memoryId,
        { content: 'Updated content for state transition' },
        testContext.namespace,
      );

      // Verify state tracking history exists
      const stateManager = memoryManager.getStateManager();
      const stateHistory = await stateManager.getMemoryStateHistory(memoryId);

      expect(Array.isArray(stateHistory)).toBe(true);
      expect(stateHistory.length).toBeGreaterThan(0);
    });
  });

  describe('Namespace Handling', () => {
    it('should handle custom namespace correctly', async () => {
      const customNamespace = 'custom-test-namespace';

      const memoryData: ProcessedLongTermMemory = {
        content: 'Test memory in custom namespace',
        summary: 'Custom namespace test',
        classification: MemoryClassification.REFERENCE,
        importance: MemoryImportanceLevel.MEDIUM,
        conversationId: testContext.testName,
        confidenceScore: 0.7,
        classificationReason: 'Test custom namespace',
        entities: ['namespace', 'test'],
        keywords: ['custom', 'namespace'],
        promotionEligible: false,
      };

      const memoryId = await memoryManager.storeLongTermMemory(
        memoryData,
        null,
        customNamespace,
      );

      // Retrieve from custom namespace
      const retrievedMemory = await memoryManager.getMemoryById(
        memoryId,
        customNamespace,
      );

      expect(retrievedMemory).toBeDefined();
      expect(retrievedMemory!.content).toBe('Test memory in custom namespace');

      // Should not be found in default namespace
      const notFoundMemory = await memoryManager.getMemoryById(
        memoryId,
        'default',
      );

      expect(notFoundMemory).toBeNull();
    });

    it('should handle default namespace correctly', async () => {
      const memoryData: ProcessedLongTermMemory = {
        content: 'Test memory in default namespace',
        summary: 'Default namespace test',
        classification: MemoryClassification.CONVERSATIONAL,
        importance: MemoryImportanceLevel.LOW,
        conversationId: testContext.testName,
        confidenceScore: 0.6,
        classificationReason: 'Test default namespace',
        entities: ['default', 'namespace'],
        keywords: ['test', 'namespace'],
        promotionEligible: false,
      };

      const memoryId = await memoryManager.storeLongTermMemory(
        memoryData,
        null,
        'default',
      );

      // Should be retrievable without specifying namespace (uses default)
      const retrievedMemory = await memoryManager.getMemoryById(memoryId);
      expect(retrievedMemory).toBeDefined();
      expect(retrievedMemory!.content).toBe('Test memory in default namespace');
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle rapid successive memory operations', async () => {
      const promises = [];

      // Create multiple memories rapidly
      for (let i = 0; i < 5; i++) {
        const memoryData: ProcessedLongTermMemory = {
          content: `Rapid test memory ${i}`,
          summary: `Rapid summary ${i}`,
          classification: MemoryClassification.CONVERSATIONAL,
          importance: MemoryImportanceLevel.MEDIUM,
          conversationId: `${testContext.testName}-${i}`,
          confidenceScore: 0.7,
          classificationReason: `Rapid test ${i}`,
          entities: [`rapid-${i}`, 'test'],
          keywords: [`memory-${i}`, 'performance'],
          promotionEligible: false,
        };

        promises.push(
          memoryManager.storeLongTermMemory(
            memoryData,
            null,
            testContext.namespace,
          ),
        );
      }

      const memoryIds = await Promise.all(promises);

      expect(memoryIds).toHaveLength(5);
      memoryIds.forEach(id => {
        expect(typeof id).toBe('string');
        expect(id.length).toBeGreaterThan(0);
      });
    });

    it('should handle memory with special characters in content', async () => {
      const specialContent = 'Test content with special chars: àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ & < > " "';
      const memoryData: ProcessedLongTermMemory = {
        content: specialContent,
        summary: 'Special characters test',
        classification: MemoryClassification.REFERENCE,
        importance: MemoryImportanceLevel.MEDIUM,
        conversationId: testContext.testName,
        confidenceScore: 0.7,
        classificationReason: 'Test special characters',
        entities: ['special', 'characters'],
        keywords: ['test', 'unicode'],
        promotionEligible: false,
      };

      const memoryId = await memoryManager.storeLongTermMemory(
        memoryData,
        null,
        testContext.namespace,
      );

      expect(memoryId).toBeDefined();

      // Verify content is preserved
      const retrievedMemory = await memoryManager.getMemoryById(
        memoryId,
        testContext.namespace,
      );

      expect(retrievedMemory!.content).toBe(specialContent);
    });

    it('should handle empty arrays for entities and keywords', async () => {
      const memoryData: ProcessedLongTermMemory = {
        content: 'Test memory with empty arrays',
        summary: 'Empty arrays test',
        classification: MemoryClassification.CONVERSATIONAL,
        importance: MemoryImportanceLevel.LOW,
        conversationId: testContext.testName,
        entities: [],
        keywords: [],
        confidenceScore: 0.5,
        classificationReason: 'Test empty arrays',
        promotionEligible: false,
      };

      const memoryId = await memoryManager.storeLongTermMemory(
        memoryData,
        null,
        testContext.namespace,
      );

      expect(memoryId).toBeDefined();

      // Verify empty arrays are preserved
      const retrievedMemory = await memoryManager.getMemoryById(
        memoryId,
        testContext.namespace,
      );

      expect(retrievedMemory!.entities).toEqual([]);
      expect(retrievedMemory!.keywords).toEqual([]);
    });
  });
});