import { DatabaseManager } from '../../../src/core/infrastructure/database/DatabaseManager';
import { MemoryClassification, MemoryImportanceLevel, ProcessedLongTermMemory, MemoryRelationshipType } from '../../../src/core/types/schemas';
import { TestHelper, beforeEachTest, afterEachTest } from '../../setup/database/TestHelper';
import { MemoryProcessingState } from '../../../src/core/infrastructure/database/StateManager';

describe('DatabaseManager Enhanced Tests', () => {
  let dbManager: DatabaseManager;
  let testContext: Awaited<ReturnType<typeof beforeEachTest>>;

  // Helper function to generate unique chat IDs for each test
  const generateUniqueChatId = (baseName: string = 'test') => {
    return `${baseName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  beforeEach(async () => {
    testContext = await beforeEachTest('unit', 'DatabaseManagerEnhanced');

    // Create DatabaseManager using shared database with unique namespace
    dbManager = new DatabaseManager(`file:${process.cwd()}/test-db-unit.sqlite`);
  });

  afterEach(async () => {
    await afterEachTest(testContext.testName);

    // Stop consolidation scheduling to clear intervals
    try {
      dbManager.stopConsolidationScheduling();
    } catch (error) {
      // Ignore cleanup errors - not critical for tests
    }

    // Clean up SearchService and its timers
    try {
      const searchService = await dbManager.getSearchService();
      if (searchService) {
        searchService.cleanup();
      }
    } catch (error) {
      // Ignore cleanup errors - not critical for tests
    }

    // Close database manager to ensure all resources are cleaned up
    try {
      await dbManager.close();
    } catch (error) {
      // Ignore cleanup errors - not critical for tests
    }
  });

  describe('Memory Relationship Operations', () => {
    it('should store memory relationships successfully', async () => {
      // First create chat history to avoid foreign key constraint
      const uniqueChatId = generateUniqueChatId('relationships');
      await dbManager.storeChatHistory({
        chatId: uniqueChatId,
        userInput: 'Test user input',
        aiOutput: 'Test AI output',
        model: 'gpt-4',
        sessionId: 'test-session',
        namespace: testContext.namespace,
      });

      // First store a memory to create relationships for
      const memoryData: ProcessedLongTermMemory = {
        content: 'Test memory for relationships',
        summary: 'Relationship test memory',
        classification: MemoryClassification.CONVERSATIONAL,
        importance: MemoryImportanceLevel.MEDIUM,
        conversationId: uniqueChatId,
        confidenceScore: 0.8,
        classificationReason: 'Test relationships',
        entities: ['test', 'relationship'],
        keywords: ['memory', 'test'],
        promotionEligible: false,
      };

      const memoryId = await dbManager.storeLongTermMemory(
        memoryData,
        uniqueChatId,
        testContext.namespace,
      );

      // Store relationships for the memory
      const relationships = [
        {
          type: MemoryRelationshipType.REFERENCE,
          targetMemoryId: 'target-memory-id',
          confidence: 0.8,
          strength: 0.7,
          reason: 'Test relationship',
          entities: ['test'],
          context: 'Test context',
        },
      ];

      const result = await dbManager.storeMemoryRelationships(
        memoryId,
        relationships,
        testContext.namespace,
      );

      expect(result).toBeDefined();
      expect(result.stored).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should get related memories successfully', async () => {
      // Create test memory first
      const uniqueChatId = generateUniqueChatId('related-memories');
      await dbManager.storeChatHistory({
        chatId: uniqueChatId,
        userInput: 'Test user input',
        aiOutput: 'Test AI output',
        model: 'gpt-4',
        sessionId: 'test-session',
        namespace: testContext.namespace,
      });

      const memoryData: ProcessedLongTermMemory = {
        content: 'Test memory for related memories',
        summary: 'Related memory test',
        classification: MemoryClassification.CONVERSATIONAL,
        importance: MemoryImportanceLevel.MEDIUM,
        conversationId: uniqueChatId,
        confidenceScore: 0.8,
        classificationReason: 'Test related memories',
        entities: ['test', 'memory'],
        keywords: ['related', 'test'],
        promotionEligible: false,
      };

      const memoryId = await dbManager.storeLongTermMemory(
        memoryData,
        uniqueChatId,
        testContext.namespace,
      );

      const relatedMemories = await dbManager.getRelatedMemories(memoryId, {
        relationshipType: MemoryRelationshipType.REFERENCE,
        minConfidence: 0.5,
        namespace: testContext.namespace,
        limit: 10,
      });

      expect(Array.isArray(relatedMemories)).toBe(true);

      if (relatedMemories.length > 0) {
        relatedMemories.forEach(related => {
          expect(related.memory).toBeDefined();
          expect(related.relationship).toBeDefined();
          expect(related.direction).toMatch(/^(incoming|outgoing)$/);
        });
      }
    });

    it('should resolve relationship conflicts', async () => {
      // Create test memory first
      const uniqueChatId = `test-memory-id-${Date.now()}`;
      await dbManager.storeChatHistory({
        chatId: uniqueChatId,
        userInput: 'Test user input',
        aiOutput: 'Test AI output',
        model: 'gpt-4',
        sessionId: 'test-session',
        namespace: testContext.namespace,
      });

      const memoryData: ProcessedLongTermMemory = {
        content: 'Test memory for relationship conflicts',
        summary: 'Relationship conflicts test',
        classification: MemoryClassification.CONVERSATIONAL,
        importance: MemoryImportanceLevel.MEDIUM,
        conversationId: uniqueChatId,
        confidenceScore: 0.8,
        classificationReason: 'Test relationship conflicts',
        entities: ['test', 'conflicts'],
        keywords: ['memory', 'test'],
        promotionEligible: false,
      };

      const memoryId = await dbManager.storeLongTermMemory(
        memoryData,
        uniqueChatId,
        testContext.namespace,
      );

      const result = await dbManager.resolveRelationshipConflicts(
        memoryId,
        testContext.namespace,
      );

      expect(result).toBeDefined();
      expect(typeof result.resolved).toBe('number');
      expect(Array.isArray(result.conflicts)).toBe(true);
    });
  });

  describe('Memory State Management', () => {
    it('should get memories by processing state', async () => {
      const memoryIds = await dbManager.getMemoriesByState(
        MemoryProcessingState.PROCESSED,
        testContext.namespace,
        10,
      );

      expect(Array.isArray(memoryIds)).toBe(true);
    });

    it('should transition memory state successfully', async () => {
      // First create a memory to transition
      const uniqueChatId = generateUniqueChatId('state-transition');
      await dbManager.storeChatHistory({
        chatId: uniqueChatId,
        userInput: 'Test user input',
        aiOutput: 'Test AI output',
        model: 'gpt-4',
        sessionId: 'test-session',
        namespace: testContext.namespace,
      });

      const memoryData: ProcessedLongTermMemory = {
        content: 'Test memory for state transition',
        summary: 'State transition test',
        classification: MemoryClassification.CONVERSATIONAL,
        importance: MemoryImportanceLevel.MEDIUM,
        conversationId: uniqueChatId,
        confidenceScore: 0.8,
        classificationReason: 'Test state management',
        entities: ['test', 'state'],
        keywords: ['memory', 'test'],
        promotionEligible: false,
      };

      const memoryId = await dbManager.storeLongTermMemory(
        memoryData,
        uniqueChatId,
        testContext.namespace,
      );

      // Initialize state first if needed
      let currentState = await dbManager.getMemoryState(memoryId);
      if (!currentState) {
        await dbManager.initializeExistingMemoryState(memoryId, MemoryProcessingState.PROCESSED);
        currentState = MemoryProcessingState.PROCESSED;
      }

      // Only try to transition if we're not already in the target state
      if (currentState !== MemoryProcessingState.CLEANED) {
        // Use valid state transition path: PROCESSED -> FAILED -> CLEANUP_PENDING -> CLEANUP_PROCESSING -> CLEANED
        let success = await dbManager.transitionMemoryState(
          memoryId,
          MemoryProcessingState.FAILED,
          {
            reason: 'Test state transition to FAILED',
            agentId: 'TestAgent',
            metadata: { test: true },
          },
        );
  
        expect(typeof success).toBe('boolean');
  
        if (success) {
          success = await dbManager.transitionMemoryState(
            memoryId,
            MemoryProcessingState.CLEANUP_PENDING,
            {
              reason: 'Test state transition to CLEANUP_PENDING',
              agentId: 'TestAgent',
              metadata: { test: true },
            },
          );
        }
  
        if (success) {
          success = await dbManager.transitionMemoryState(
            memoryId,
            MemoryProcessingState.CLEANUP_PROCESSING,
            {
              reason: 'Test state transition to CLEANUP_PROCESSING',
              agentId: 'TestAgent',
              metadata: { test: true },
            },
          );
        }
  
        if (success) {
          success = await dbManager.transitionMemoryState(
            memoryId,
            MemoryProcessingState.CLEANED,
            {
              reason: 'Test state transition to CLEANED',
              agentId: 'TestAgent',
              metadata: { test: true },
            },
          );
        }
  
        expect(success).toBe(true);
      } else {
        // Already in target state
        expect(currentState).toBe(MemoryProcessingState.CLEANED);
      }
    });

    it('should get memory state history', async () => {
      // First create a memory to get history for
      const uniqueChatId = generateUniqueChatId('state-history');
      await dbManager.storeChatHistory({
        chatId: uniqueChatId,
        userInput: 'Test user input',
        aiOutput: 'Test AI output',
        model: 'gpt-4',
        sessionId: 'test-session',
        namespace: testContext.namespace,
      });

      const memoryData: ProcessedLongTermMemory = {
        content: 'Test memory for state history',
        summary: 'State history test',
        classification: MemoryClassification.CONVERSATIONAL,
        importance: MemoryImportanceLevel.MEDIUM,
        conversationId: uniqueChatId,
        confidenceScore: 0.8,
        classificationReason: 'Test state history',
        entities: ['test', 'history'],
        keywords: ['memory', 'test'],
        promotionEligible: false,
      };

      const memoryId = await dbManager.storeLongTermMemory(
        memoryData,
        uniqueChatId,
        testContext.namespace,
      );

      const stateHistory = await dbManager.getMemoryStateHistory(memoryId);

      expect(Array.isArray(stateHistory)).toBe(true);

      if (stateHistory.length > 0) {
        stateHistory.forEach(transition => {
          expect(transition).toHaveProperty('fromState');
          expect(transition).toHaveProperty('toState');
          expect(transition).toHaveProperty('timestamp');
          expect(transition).toHaveProperty('reason');
        });
      }
    });

    it('should get processing state statistics', async () => {
      const stats = await dbManager.getProcessingStateStats(testContext.namespace);

      expect(typeof stats).toBe('object');
      expect(stats).toHaveProperty(MemoryProcessingState.PENDING);
      expect(stats).toHaveProperty(MemoryProcessingState.PROCESSED);
      expect(stats).toHaveProperty(MemoryProcessingState.CLEANED);
    });

    it('should check if memory can transition to specific state', async () => {
      const memoryId = 'test-memory-id';

      const canTransition = await dbManager.canMemoryTransitionTo(
        memoryId,
        MemoryProcessingState.CLEANED,
      );

      expect(typeof canTransition).toBe('boolean');
    });

    it('should retry failed memory state transition', async () => {
      const memoryId = 'test-memory-id';

      const success = await dbManager.retryMemoryStateTransition(
        memoryId,
        MemoryProcessingState.PROCESSED,
        { maxRetries: 3, delayMs: 100 },
      );

      expect(typeof success).toBe('boolean');
    });

    it('should get processing metrics', async () => {
      const metrics = await dbManager.getProcessingMetrics();

      expect(typeof metrics).toBe('object');
    });

    it('should initialize existing memory state', async () => {
      const memoryId = 'test-memory-id';

      await expect(
        dbManager.initializeExistingMemoryState(
          memoryId,
          MemoryProcessingState.PENDING,
        ),
      ).resolves.not.toThrow();
    });

    it('should get all memory states', async () => {
      const allStates = await dbManager.getAllMemoryStates();

      expect(typeof allStates).toBe('object');
    });
  });

  describe('Conscious Memory Operations', () => {
    it('should get unprocessed conscious memories', async () => {
      const unprocessed = await dbManager.getUnprocessedConsciousMemories(
        testContext.namespace,
      );

      expect(Array.isArray(unprocessed)).toBe(true);

      if (unprocessed.length > 0) {
        unprocessed.forEach(memory => {
          expect(memory).toHaveProperty('id');
          expect(memory).toHaveProperty('content');
          expect(memory).toHaveProperty('classification');
        });
      }
    });

    it('should get new conscious memories since date', async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24 hours ago

      const newMemories = await dbManager.getNewConsciousMemories(
        since,
        testContext.namespace,
      );

      expect(Array.isArray(newMemories)).toBe(true);
    });

    it('should store conscious memory in short term', async () => {
      // First create chat history to avoid foreign key constraint
      const uniqueChatId = generateUniqueChatId('conscious-memory');
      await dbManager.storeChatHistory({
        chatId: uniqueChatId,
        userInput: 'Test conscious memory input',
        aiOutput: 'Test conscious memory output',
        model: 'gpt-4',
        sessionId: 'test-session',
        namespace: testContext.namespace,
      });

      const memoryData = {
        chatId: uniqueChatId,
        processedData: { content: 'Test conscious memory content' },
        importanceScore: 0.9,
        categoryPrimary: 'conscious-info',
        retentionType: 'short_term',
        searchableContent: 'Test conscious memory content',
        summary: 'Conscious memory summary',
        namespace: testContext.namespace,
        isPermanentContext: false,
      };

      const memoryId = await dbManager.storeConsciousMemoryInShortTerm(
        memoryData,
        testContext.namespace,
      );

      expect(memoryId).toBeDefined();
      expect(typeof memoryId).toBe('string');
    });

    it('should get conscious memories from short term', async () => {
      const shortTermMemories = await dbManager.getConsciousMemoriesFromShortTerm(
        testContext.namespace,
      );

      expect(Array.isArray(shortTermMemories)).toBe(true);
    });

    it('should mark conscious memory as processed', async () => {
       // First create a conscious memory to mark as processed
       const uniqueChatId = generateUniqueChatId('mark-processed');
       await dbManager.storeChatHistory({
         chatId: uniqueChatId,
         userInput: 'Test conscious memory input',
         aiOutput: 'Test conscious memory output',
         model: 'gpt-4',
         sessionId: 'test-session',
         namespace: testContext.namespace,
       });

       // Create long-term memory first (following the ConsciousAgent pattern)
       const longTermMemoryData = {
         content: 'Test conscious memory content',
         summary: 'Conscious memory summary',
         classification: MemoryClassification.CONVERSATIONAL,
         importance: MemoryImportanceLevel.HIGH,
         conversationId: uniqueChatId,
         confidenceScore: 0.9,
         classificationReason: 'Test conscious memory processing',
         entities: ['test', 'conscious'],
         keywords: ['memory', 'test'],
         promotionEligible: false,
       };

       const memoryId = await dbManager.storeLongTermMemory(
         longTermMemoryData,
         uniqueChatId,
         testContext.namespace,
       );

       // Create short-term data for the conscious memory
       const shortTermData = {
         chatId: uniqueChatId,
         processedData: { content: 'Test conscious memory content' },
         importanceScore: 0.9,
         categoryPrimary: 'conscious-info',
         retentionType: 'short_term',
         searchableContent: 'Test conscious memory content',
         summary: 'Conscious memory summary',
         namespace: testContext.namespace,
         isPermanentContext: true,
       };

       // Store in short-term storage
       await dbManager.storeConsciousMemoryInShortTerm(
         shortTermData,
         testContext.namespace,
       );

       // Now test marking it as processed (this looks in long-term memory table)
       await expect(
         dbManager.markConsciousMemoryAsProcessed(memoryId),
       ).resolves.not.toThrow();

       // Verify it was marked as processed in long-term memory
       const processedMemory = await testContext.prisma.longTermMemory.findUnique({
         where: { id: memoryId },
         select: { consciousProcessed: true },
       });

       expect(processedMemory?.consciousProcessed).toBe(true);
     });

    it('should mark multiple memories as processed', async () => {
      const memoryIds = ['memory-1', 'memory-2', 'memory-3'];

      await expect(
        dbManager.markMultipleMemoriesAsProcessed(memoryIds),
      ).resolves.not.toThrow();
    });

    it('should get processed conscious memories', async () => {
      const processedMemories = await dbManager.getProcessedConsciousMemories(
        testContext.namespace,
      );

      expect(Array.isArray(processedMemories)).toBe(true);
    });

    it('should get conscious processing statistics', async () => {
      const stats = await dbManager.getConsciousProcessingStats(
        testContext.namespace,
      );

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('processed');
      expect(stats).toHaveProperty('unprocessed');
      expect(typeof stats.total).toBe('number');
      expect(typeof stats.processed).toBe('number');
      expect(typeof stats.unprocessed).toBe('number');
    });
  });

  describe('Database Statistics', () => {
    it('should get comprehensive database statistics', async () => {
      const stats = await dbManager.getDatabaseStats(testContext.namespace);

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('totalConversations');
      expect(stats).toHaveProperty('totalMemories');
      expect(stats).toHaveProperty('shortTermMemories');
      expect(stats).toHaveProperty('longTermMemories');
      expect(stats).toHaveProperty('consciousMemories');
      expect(stats).toHaveProperty('lastActivity');
    });
  });

  describe('Performance Monitoring', () => {
    it('should get performance metrics', () => {
      const metrics = dbManager.getPerformanceMetrics();

      expect(metrics).toBeDefined();
      expect(typeof metrics).toBe('object');
    });

    it('should get recent operation metrics', () => {
      const recentOps = dbManager.getRecentOperationMetrics(50);

      expect(Array.isArray(recentOps)).toBe(true);
    });

    it('should get performance analytics', () => {
      const analytics = dbManager.getPerformanceAnalytics();

      expect(analytics).toBeDefined();
      expect(analytics).toHaveProperty('averageLatency');
      expect(analytics).toHaveProperty('errorRate');
      expect(analytics).toHaveProperty('slowQueryCount');
      expect(analytics).toHaveProperty('operationBreakdown');
      expect(analytics).toHaveProperty('topErrors');
      expect(analytics).toHaveProperty('slowQueries');
    });

    it('should get database performance report', () => {
      const report = dbManager.getDatabasePerformanceReport();

      expect(report).toBeDefined();
      expect(report).toHaveProperty('summary');
      expect(report).toHaveProperty('performanceByOperation');
      expect(report).toHaveProperty('slowQueries');
      expect(report).toHaveProperty('recommendations');
      expect(report).toHaveProperty('timestamp');
    });

    it('should get performance monitoring status', () => {
      const status = dbManager.getPerformanceMonitoringStatus();

      expect(status).toBeDefined();
      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('totalOperations');
      expect(status).toHaveProperty('averageLatency');
      expect(status).toHaveProperty('errorRate');
      expect(status).toHaveProperty('slowQueryCount');
      expect(status).toHaveProperty('memoryUsage');
      expect(status).toHaveProperty('lastOperationTime');
    });

    it('should allow performance monitoring configuration updates', () => {
      expect(() => {
        dbManager.updatePerformanceMonitoringConfig({
          enabled: true,
          slowQueryThreshold: 1500,
          trackSlowQueries: false,
        });
      }).not.toThrow();
    });

    it('should get performance monitoring configuration', () => {
      const config = dbManager.getPerformanceMonitoringConfig();

      expect(config).toBeDefined();
      expect(typeof config).toBe('object');
      expect(config).toHaveProperty('enabled');
      expect(config).toHaveProperty('slowQueryThreshold');
    });

    it('should allow clearing performance metrics', () => {
      expect(() => {
        dbManager.clearPerformanceMetrics();
      }).not.toThrow();
    });
  });

  describe('Consolidation Operations', () => {
    it('should get consolidation service', () => {
      const consolidationService = dbManager.getConsolidationService();

      expect(consolidationService).toBeDefined();
    });

    it('should get consolidation performance metrics', async () => {
      const metrics = await dbManager.getConsolidationPerformanceMetrics();

      expect(metrics).toBeDefined();
      expect(metrics).toHaveProperty('consolidationOperations');
      expect(metrics).toHaveProperty('averageConsolidationTime');
      expect(metrics).toHaveProperty('consolidationSuccessRate');
      expect(metrics).toHaveProperty('consolidationErrors');
      expect(metrics).toHaveProperty('rollbackOperations');
      expect(metrics).toHaveProperty('consolidationThroughput');
      expect(metrics).toHaveProperty('memoryReductionRatio');
    });

    it('should start consolidation scheduling', () => {
      expect(() => {
        dbManager.startConsolidationScheduling({
          enabled: true,
          intervalMinutes: 30,
          maxConsolidationsPerRun: 25,
        });
      }).not.toThrow();
    });

    it('should stop consolidation scheduling', () => {
      expect(() => {
        dbManager.stopConsolidationScheduling();
      }).not.toThrow();
    });

    it('should get consolidation scheduling status', () => {
      const status = dbManager.getConsolidationSchedulingStatus();

      expect(status).toBeDefined();
      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('running');
      expect(status).toHaveProperty('config');
      expect(status.config).toHaveProperty('enabled');
      expect(status.config).toHaveProperty('intervalMinutes');
    });

    it('should update consolidation scheduling configuration', () => {
      expect(() => {
        dbManager.updateConsolidationSchedulingConfig({
          intervalMinutes: 45,
          maxConsolidationsPerRun: 30,
          similarityThreshold: 0.8,
        });
      }).not.toThrow();
    });
  });

  describe('FTS Operations', () => {
    it('should check FTS status', async () => {
      const ftsStatus = await dbManager.getFTSStatus();

      expect(ftsStatus).toBeDefined();
      expect(ftsStatus).toHaveProperty('enabled');
      expect(ftsStatus).toHaveProperty('isValid');
      expect(ftsStatus).toHaveProperty('issues');
      expect(ftsStatus).toHaveProperty('stats');
      expect(Array.isArray(ftsStatus.issues)).toBe(true);
      expect(ftsStatus.stats).toHaveProperty('tables');
      expect(ftsStatus.stats).toHaveProperty('triggers');
      expect(ftsStatus.stats).toHaveProperty('indexes');
    });

    it('should check if FTS is enabled', () => {
      const isEnabled = dbManager.isFTSEnabled();

      expect(typeof isEnabled).toBe('boolean');
    });

    it('should handle FTS schema verification gracefully', async () => {
      const ftsStatus = await dbManager.getFTSStatus();

      // Should not throw even if FTS is not available
      expect(ftsStatus).toBeDefined();
      expect(typeof ftsStatus.enabled).toBe('boolean');
    });
  });

  describe('Advanced Search Operations', () => {
    it('should get search service', async () => {
      const searchService = await dbManager.getSearchService();

      expect(searchService).toBeDefined();
    });

    it('should handle search operations through SearchService', async () => {
      const searchService = await dbManager.getSearchService();

      const results = await searchService.search({
        text: 'test query',
        limit: 10,
      });

      expect(Array.isArray(results)).toBe(true);
    });

    it('should handle complex search with filters', async () => {
      const searchService = await dbManager.getSearchService();

      const results = await searchService.search({
        text: 'test query',
        limit: 10,
        filters: {
          categories: ['conversational'],
          minImportance: 'medium',
        },
      });

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle invalid memory IDs gracefully', async () => {
      const invalidId = '';

      const memoryManager = await testContext.prisma.longTermMemory.findUnique({
        where: { id: invalidId },
      });
      const memory = memoryManager ? { id: memoryManager.id } : null;
      expect(memory).toBeNull();

      const state = await dbManager.getMemoryState(invalidId);
      expect(state).toBeUndefined();
    });

    it('should handle database close operation safely', async () => {
      await expect(dbManager.close()).resolves.not.toThrow();
    });

    it('should handle performance monitoring when disabled', () => {
      // This should not throw even if performance monitoring is disabled
      const metrics = dbManager.getPerformanceMetrics();
      expect(metrics).toBeDefined();

      const analytics = dbManager.getPerformanceAnalytics();
      expect(analytics).toBeDefined();
    });

    it('should handle consolidation operations when no duplicates exist', async () => {
      const metrics = await dbManager.getConsolidationPerformanceMetrics();

      expect(metrics).toBeDefined();
      expect(typeof metrics.consolidationOperations).toBe('number');
    });

    it('should handle state operations for non-existent memories', async () => {
      const nonExistentId = 'non-existent-memory-id';

      const canTransition = await dbManager.canMemoryTransitionTo(
        nonExistentId,
        MemoryProcessingState.PROCESSED,
      );

      // Should return false for non-existent memory
      expect(canTransition).toBe(false);
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete memory lifecycle', async () => {
      // First create chat history to avoid foreign key constraint
      const uniqueChatId = generateUniqueChatId('lifecycle');
      await dbManager.storeChatHistory({
        chatId: uniqueChatId,
        userInput: 'Complete lifecycle test input',
        aiOutput: 'Complete lifecycle test output',
        model: 'gpt-4',
        sessionId: 'test-session',
        namespace: testContext.namespace,
      });

      // 1. Store memory
      const memoryData: ProcessedLongTermMemory = {
        content: 'Complete lifecycle test memory',
        summary: 'Lifecycle test summary',
        classification: MemoryClassification.ESSENTIAL,
        importance: MemoryImportanceLevel.HIGH,
        conversationId: uniqueChatId,
        confidenceScore: 0.9,
        classificationReason: 'Test complete lifecycle',
        entities: ['lifecycle', 'test'],
        keywords: ['memory', 'test'],
        promotionEligible: false,
      };

      const memoryId = await dbManager.storeLongTermMemory(
        memoryData,
        uniqueChatId,
        testContext.namespace,
      );

      expect(memoryId).toBeDefined();

      // 2. Check initial state (or initialize if needed)
      let initialState = await dbManager.getMemoryState(memoryId);
      if (!initialState) {
        // Initialize state if not already set
        await dbManager.initializeExistingMemoryState(memoryId, MemoryProcessingState.PROCESSED);
        initialState = await dbManager.getMemoryState(memoryId);
      }
      expect(initialState).toBe(MemoryProcessingState.PROCESSED);

      // 3. Transition state using valid path: PROCESSED -> FAILED -> CLEANUP_PENDING -> CLEANUP_PROCESSING -> CLEANED
      let transitionSuccess = await dbManager.transitionMemoryState(
        memoryId,
        MemoryProcessingState.FAILED,
        { reason: 'Lifecycle test - transition to FAILED' },
      );

      if (transitionSuccess) {
        transitionSuccess = await dbManager.transitionMemoryState(
          memoryId,
          MemoryProcessingState.CLEANUP_PENDING,
          { reason: 'Lifecycle test - transition to CLEANUP_PENDING' },
        );
      }

      if (transitionSuccess) {
        transitionSuccess = await dbManager.transitionMemoryState(
          memoryId,
          MemoryProcessingState.CLEANUP_PROCESSING,
          { reason: 'Lifecycle test - transition to CLEANUP_PROCESSING' },
        );
      }

      if (transitionSuccess) {
        transitionSuccess = await dbManager.transitionMemoryState(
          memoryId,
          MemoryProcessingState.CLEANED,
          { reason: 'Lifecycle test completion' },
        );
      }

      expect(transitionSuccess).toBe(true);

      // 4. Verify final state
      const finalState = await dbManager.getMemoryState(memoryId);
      expect(finalState).toBe(MemoryProcessingState.CLEANED);

      // 5. Check state history
      const stateHistory = await dbManager.getMemoryStateHistory(memoryId);
      expect(stateHistory.length).toBeGreaterThan(0);
    });

    it('should handle concurrent operations safely', async () => {
      const operations = [];

      // Create multiple concurrent operations
      for (let i = 0; i < 5; i++) {
        operations.push(
          dbManager.getProcessingStateStats(testContext.namespace),
        );
      }

      const results = await Promise.all(operations);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(typeof result).toBe('object');
      });
    });

    it('should handle memory operations across different namespaces', async () => {
      const namespace1 = 'namespace-1';
      const namespace2 = 'namespace-2';
      const uniqueChatId1 = generateUniqueChatId('namespace1');
      const uniqueChatId2 = generateUniqueChatId('namespace2');

      // Create chat history for both namespaces
      await dbManager.storeChatHistory({
        chatId: uniqueChatId1,
        userInput: 'Namespace test input',
        aiOutput: 'Namespace test output',
        model: 'gpt-4',
        sessionId: 'test-session',
        namespace: namespace1,
      });

      await dbManager.storeChatHistory({
        chatId: uniqueChatId2,
        userInput: 'Namespace test input',
        aiOutput: 'Namespace test output',
        model: 'gpt-4',
        sessionId: 'test-session',
        namespace: namespace2,
      });

      // Store memory in namespace 1
      const memoryData1: ProcessedLongTermMemory = {
        content: 'Memory in namespace 1',
        summary: 'Namespace 1 test',
        classification: MemoryClassification.CONVERSATIONAL,
        importance: MemoryImportanceLevel.MEDIUM,
        conversationId: uniqueChatId1,
        confidenceScore: 0.7,
        classificationReason: 'Namespace test 1',
        entities: ['namespace', 'test'],
        keywords: ['memory', 'test'],
        promotionEligible: false,
      };

      const memoryId1 = await dbManager.storeLongTermMemory(
        memoryData1,
        uniqueChatId1,
        namespace1,
      );

      // Store memory in namespace 2
      const memoryData2: ProcessedLongTermMemory = {
        content: 'Memory in namespace 2',
        summary: 'Namespace 2 test',
        classification: MemoryClassification.REFERENCE,
        importance: MemoryImportanceLevel.HIGH,
        conversationId: uniqueChatId2,
        confidenceScore: 0.8,
        classificationReason: 'Namespace test 2',
        entities: ['namespace', 'test'],
        keywords: ['memory', 'test'],
        promotionEligible: false,
      };

      const memoryId2 = await dbManager.storeLongTermMemory(
        memoryData2,
        uniqueChatId2,
        namespace2,
      );

      // Verify namespace isolation by querying with explicit namespace
      const mem1FromNS1 = await testContext.prisma.longTermMemory.findFirst({
        where: {
          id: memoryId1,
          namespace: namespace1,
        },
      });
      const mem1FromNS2 = await testContext.prisma.longTermMemory.findFirst({
        where: {
          id: memoryId1,
          namespace: namespace2,
        },
      });
      const mem2FromNS1 = await testContext.prisma.longTermMemory.findFirst({
        where: {
          id: memoryId2,
          namespace: namespace1,
        },
      });
      const mem2FromNS2 = await testContext.prisma.longTermMemory.findFirst({
        where: {
          id: memoryId2,
          namespace: namespace2,
        },
      });

      expect(mem1FromNS1).toBeDefined();
      expect(mem1FromNS2).toBeNull();
      expect(mem2FromNS1).toBeNull();
      expect(mem2FromNS2).toBeDefined();
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle multiple rapid state transitions', async () => {
      // First create a memory to transition
      const uniqueChatId = generateUniqueChatId('rapid-transition');
      await dbManager.storeChatHistory({
        chatId: uniqueChatId,
        userInput: 'Rapid transition test input',
        aiOutput: 'Rapid transition test output',
        model: 'gpt-4',
        sessionId: 'test-session',
        namespace: testContext.namespace,
      });

      const memoryData: ProcessedLongTermMemory = {
        content: 'Rapid transition test memory',
        summary: 'Rapid transition test',
        classification: MemoryClassification.CONVERSATIONAL,
        importance: MemoryImportanceLevel.MEDIUM,
        conversationId: uniqueChatId,
        confidenceScore: 0.8,
        classificationReason: 'Test rapid transitions',
        entities: ['rapid', 'test'],
        keywords: ['memory', 'test'],
        promotionEligible: false,
      };

      const memoryId = await dbManager.storeLongTermMemory(
        memoryData,
        uniqueChatId,
        testContext.namespace,
      );

      const transitions = [
        MemoryProcessingState.FAILED,
        MemoryProcessingState.CLEANUP_PENDING,
        MemoryProcessingState.CLEANUP_PROCESSING,
        MemoryProcessingState.CLEANED,
      ];

      // Initialize state first
      let currentState = await dbManager.getMemoryState(memoryId);
      if (!currentState) {
        await dbManager.initializeExistingMemoryState(memoryId, MemoryProcessingState.PROCESSED);
        currentState = MemoryProcessingState.PROCESSED;
      }

      for (const state of transitions) {
        // Only transition if we're not already in the target state
        if (currentState !== state) {
          const success = await dbManager.transitionMemoryState(
            memoryId,
            state,
            { reason: `Rapid transition to ${state}` },
          );

          expect(typeof success).toBe('boolean');

          if (success) {
            currentState = state;
          }
        }
      }

      // Verify final state
      const finalState = await dbManager.getMemoryState(memoryId);
      expect(finalState).toBe(MemoryProcessingState.CLEANED);
    });

    it('should handle bulk state statistics requests', async () => {
      const statsPromises = [];

      // Make multiple concurrent stats requests
      for (let i = 0; i < 10; i++) {
        statsPromises.push(
          dbManager.getProcessingStateStats(testContext.namespace),
        );
      }

      const allStats = await Promise.all(statsPromises);

      expect(allStats).toHaveLength(10);
      allStats.forEach(stats => {
        expect(typeof stats).toBe('object');
      });
    });

    it('should handle memory relationship queries efficiently', async () => {
      // First create a memory to query relationships for
      const uniqueChatId = generateUniqueChatId('relationship-query');
      await dbManager.storeChatHistory({
        chatId: uniqueChatId,
        userInput: 'Relationship query test input',
        aiOutput: 'Relationship query test output',
        model: 'gpt-4',
        sessionId: 'test-session',
        namespace: testContext.namespace,
      });

      const memoryData: ProcessedLongTermMemory = {
        content: 'Relationship query test memory',
        summary: 'Relationship query test',
        classification: MemoryClassification.CONVERSATIONAL,
        importance: MemoryImportanceLevel.MEDIUM,
        conversationId: uniqueChatId,
        confidenceScore: 0.8,
        classificationReason: 'Test relationship queries',
        entities: ['relationship', 'test'],
        keywords: ['memory', 'test'],
        promotionEligible: false,
      };

      const memoryId = await dbManager.storeLongTermMemory(
        memoryData,
        uniqueChatId,
        testContext.namespace,
      );

      // Make multiple concurrent relationship queries
      const queryPromises = [];

      // Only test if memory exists first
      const memoryExists = await testContext.prisma.longTermMemory.findUnique({
        where: { id: memoryId },
      });

      if (memoryExists) {
        for (let i = 0; i < 5; i++) {
          queryPromises.push(
            dbManager.getRelatedMemories(memoryId, {
              relationshipType: MemoryRelationshipType.REFERENCE,
              minConfidence: 0.5,
              namespace: testContext.namespace,
            }),
          );
        }

        const results = await Promise.all(queryPromises);

        expect(results).toHaveLength(5);
        results.forEach(result => {
          expect(Array.isArray(result)).toBe(true);
        });
      } else {
        console.warn('Memory not found, skipping relationship queries test');
      }
    });
  });

  describe('Resource Management', () => {
    it('should cleanup resources properly on close', async () => {
      // Start consolidation scheduling
      dbManager.startConsolidationScheduling();

      // Verify it's running
      const status = dbManager.getConsolidationSchedulingStatus();
      expect(status.running).toBe(true);

      // Close database manager
      await dbManager.close();

      // Should not throw errors after close
      expect(() => {
        dbManager.getPerformanceMetrics();
      }).not.toThrow();
    });

    it('should handle multiple close operations safely', async () => {
      await dbManager.close();

      // Second close should not throw
      await expect(dbManager.close()).resolves.not.toThrow();

      // Third close should also not throw
      await expect(dbManager.close()).resolves.not.toThrow();
    });
  });
});