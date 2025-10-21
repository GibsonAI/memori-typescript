import { ConsciousAgent } from '../../../src/core/domain/memory/ConsciousAgent';
import { DatabaseManager } from '../../../src/core/infrastructure/database/DatabaseManager';
import { logInfo, logError, logDebug } from '../../../src/core/infrastructure/config/Logger';

// Mock the Logger module
jest.mock('../../../src/core/infrastructure/config/Logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logDebug: jest.fn(),
  logWarn: jest.fn(),
}));

// Mock DatabaseManager
jest.mock('../../../src/core/infrastructure/database/DatabaseManager');

const MockDatabaseManager = DatabaseManager as jest.MockedClass<typeof DatabaseManager>;

describe('ConsciousAgent', () => {
  let consciousAgent: ConsciousAgent;
  let mockDbManager: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    jest.resetAllMocks();

    // Setup mock DatabaseManager
    mockDbManager = {
      getUnprocessedConsciousMemories: jest.fn(),
      getNewConsciousMemories: jest.fn(),
      storeConsciousMemoryInShortTerm: jest.fn(),
      getConsciousMemoriesFromShortTerm: jest.fn(),
      markConsciousMemoryAsProcessed: jest.fn(),
      getProcessedConsciousMemories: jest.fn(),
      findPotentialDuplicates: jest.fn(),
      consolidateDuplicateMemories: jest.fn(),
      transitionMemoryState: jest.fn(), // Add missing method
      getConsolidationService: jest.fn().mockReturnValue({
        detectDuplicateMemories: jest.fn()
          .mockResolvedValueOnce([
            { id: 'memory-2', confidence: 0.9, similarityScore: 0.95 } // Higher similarity for safety
          ])
          .mockResolvedValueOnce([]) // No duplicates for memory-2
          .mockResolvedValueOnce([]), // No duplicates for memory-3
        consolidateMemories: jest.fn().mockResolvedValue({
          consolidated: 1,
          errors: []
        }),
        getConsolidationAnalytics: jest.fn().mockResolvedValue({
          totalMemories: 3,
          duplicateCount: 1,
          consolidatedMemories: 0,
          averageConsolidationRatio: 0.5,
          lastConsolidationActivity: new Date(),
        }),
        getOptimizationRecommendations: jest.fn().mockResolvedValue({
          overallHealth: 'good',
          recommendations: [],
        }),
      }),
      getPrismaClient: jest.fn().mockReturnValue({
        longTermMemory: {
          findUnique: jest.fn()
            .mockResolvedValueOnce({ // memory-1 data for duplicate processing
              id: 'memory-1',
              searchableContent: 'This is a test memory about AI agents',
              summary: 'AI agents test memory',
              classification: 'conscious-info',
              memoryImportance: 'high',
              topic: 'AI',
              entitiesJson: ['AI', 'agents'],
              keywordsJson: ['test', 'memory'],
              confidenceScore: 0.8,
              classificationReason: 'Test reason',
            })
            .mockResolvedValueOnce({ // memory-2 data for duplicate processing
              id: 'memory-2',
              searchableContent: 'This is another test memory about artificial intelligence agents',
              summary: 'Artificial intelligence agents memory',
              classification: 'conscious-info',
              memoryImportance: 'high',
              topic: 'AI',
              entitiesJson: ['AI', 'agents'],
              keywordsJson: ['test', 'memory'],
              confidenceScore: 0.8,
              classificationReason: 'Test reason',
            })
            .mockResolvedValueOnce({ memoryImportance: 'high' }) // memory-1 importance check
            .mockResolvedValueOnce({ memoryImportance: 'high' }) // memory-2 importance check
            .mockResolvedValueOnce({ // memory-1 consolidation check
              processedData: null,
              searchableContent: 'This is a test memory about AI agents',
            })
            .mockResolvedValueOnce({ // memory-2 consolidation check
              processedData: null,
              searchableContent: 'This is another test memory about artificial intelligence agents',
            })
            .mockResolvedValueOnce({ namespace: 'test-namespace' }) // memory-1 namespace check
            .mockResolvedValueOnce({ namespace: 'test-namespace' }), // memory-2 namespace check
          findMany: jest.fn()
            .mockResolvedValueOnce([ // existing memories check
              { id: 'memory-1' },
              { id: 'memory-2' }
            ])
            .mockResolvedValueOnce([]) // recent consolidation failures check
            .mockResolvedValueOnce([]), // recent consolidation activity check
        },
      }),
    };

    MockDatabaseManager.mockImplementation(() => mockDbManager as any);

    // Create ConsciousAgent instance
    consciousAgent = new ConsciousAgent(mockDbManager, 'test-namespace');
  });

  describe('constructor', () => {
    it('should initialize with database manager and namespace', () => {
      expect(consciousAgent).toBeDefined();
      // Note: The DatabaseManager constructor is called internally, not directly in the test
    });
  });

  describe('run_conscious_ingest', () => {
    it('should process unprocessed conscious memories', async () => {
      const mockMemories = [
        {
          id: 'memory-1',
          content: 'Test conscious memory 1',
          summary: 'Summary 1',
          classification: 'conscious-info',
          importance: 'high',
          entities: ['entity1'],
          keywords: ['keyword1'],
          confidenceScore: 0.8,
          classificationReason: 'Test reason',
        },
        {
          id: 'memory-2',
          content: 'Test conscious memory 2',
          summary: 'Summary 2',
          classification: 'conscious-info',
          importance: 'critical',
          entities: ['entity2'],
          keywords: ['keyword2'],
          confidenceScore: 0.9,
          classificationReason: 'Test reason 2',
        },
      ];

      mockDbManager.getUnprocessedConsciousMemories.mockResolvedValue(mockMemories);

      await consciousAgent.run_conscious_ingest();

      expect(mockDbManager.getUnprocessedConsciousMemories).toHaveBeenCalled();
      expect(logInfo).toHaveBeenCalledWith(
        expect.stringContaining('Starting conscious memory ingestion...'),
        expect.objectContaining({
          component: 'ConsciousAgent',
          namespace: 'test-namespace',
        }),
      );
      expect(logInfo).toHaveBeenCalledWith(
        expect.stringContaining('Found 2 unprocessed conscious memories'),
        expect.objectContaining({
          component: 'ConsciousAgent',
          namespace: 'test-namespace',
          memoryCount: 2,
        }),
      );
      expect(logInfo).toHaveBeenCalledWith(
        expect.stringContaining('Conscious memory ingestion completed'),
        expect.objectContaining({
          component: 'ConsciousAgent',
          namespace: 'test-namespace',
        }),
      );
    });

    it('should handle empty conscious memories gracefully', async () => {
      mockDbManager.getUnprocessedConsciousMemories.mockResolvedValue([]);

      await consciousAgent.run_conscious_ingest();

      expect(logInfo).toHaveBeenCalledWith(
        expect.stringContaining('Starting conscious memory ingestion...'),
        expect.objectContaining({
          component: 'ConsciousAgent',
          namespace: 'test-namespace',
        }),
      );
      expect(logInfo).toHaveBeenCalledWith(
        expect.stringContaining('No unprocessed conscious memories found'),
        expect.objectContaining({
          component: 'ConsciousAgent',
          namespace: 'test-namespace',
        }),
      );
    });

    it('should handle errors gracefully', async () => {
      mockDbManager.getUnprocessedConsciousMemories.mockRejectedValue(new Error('Database error'));

      await expect(consciousAgent.run_conscious_ingest()).rejects.toThrow('Database error');

      expect(logError).toHaveBeenCalledWith(
        expect.stringContaining('Error during conscious memory ingestion:'),
        expect.objectContaining({
          component: 'ConsciousAgent',
          namespace: 'test-namespace',
        }),
      );
    });
  });

  describe('initialize_existing_conscious_memories', () => {
    it('should return existing conscious memories from short-term', async () => {
      const mockMemories = [
        {
          id: 'memory-1',
          content: 'Existing conscious memory',
          summary: 'Summary',
          classification: 'conscious-info',
          importance: 'high',
          entities: ['entity1'],
          keywords: ['keyword1'],
          confidenceScore: 0.8,
          classificationReason: 'Test reason',
        },
      ];

      mockDbManager.getConsciousMemoriesFromShortTerm.mockResolvedValue(mockMemories);

      const result = await consciousAgent.initialize_existing_conscious_memories();

      expect(mockDbManager.getConsciousMemoriesFromShortTerm).toHaveBeenCalledWith('test-namespace');
      expect(result).toEqual(mockMemories);
    });

    it('should handle errors gracefully', async () => {
      mockDbManager.getConsciousMemoriesFromShortTerm.mockRejectedValue(new Error('Database error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

      const result = await consciousAgent.initialize_existing_conscious_memories();

      expect(result).toEqual([]);

      consoleSpy.mockRestore();
    });
  });

  describe('check_for_context_updates', () => {
    it('should process new conscious memories', async () => {
      const mockMemories = [
        {
          id: 'memory-1',
          content: 'New conscious memory',
          summary: 'Summary',
          classification: 'conscious-info',
          importance: 'high',
          entities: ['entity1'],
          keywords: ['keyword1'],
          confidenceScore: 0.8,
          classificationReason: 'Test reason',
        },
      ];

      mockDbManager.getNewConsciousMemories.mockResolvedValue(mockMemories);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => { });

      const result = await consciousAgent.check_for_context_updates();

      expect(mockDbManager.getNewConsciousMemories).toHaveBeenCalled();
      expect(result).toEqual(mockMemories);

      consoleSpy.mockRestore();
    });

    it('should return empty array when no new memories', async () => {
      mockDbManager.getNewConsciousMemories.mockResolvedValue([]);

      const result = await consciousAgent.check_for_context_updates();

      expect(result).toEqual([]);
    });

    it('should handle errors gracefully', async () => {
      mockDbManager.getNewConsciousMemories.mockRejectedValue(new Error('Database error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => { });

      const result = await consciousAgent.check_for_context_updates();

      expect(result).toEqual([]);

      consoleSpy.mockRestore();
    });
  });

  describe('consolidateDuplicates', () => {
    it('should complete consolidation process with no memories', async () => {
      mockDbManager.getProcessedConsciousMemories = jest.fn().mockResolvedValue([]);

      const result = await consciousAgent.consolidateDuplicates();

      expect(result).toEqual({
        totalProcessed: 0,
        duplicatesFound: 0,
        consolidated: 0,
        errors: [],
        skipped: 0,
        processingTime: expect.any(Number),
        memoryUsage: expect.any(Object),
        consolidationStats: expect.any(Object),
      });
      expect(logInfo).toHaveBeenCalledWith(
        expect.stringContaining('Starting enhanced conscious memory consolidation in namespace: test-namespace'),
        expect.objectContaining({
          component: 'ConsciousAgent',
          namespace: 'test-namespace',
        }),
      );
      expect(logInfo).toHaveBeenCalledWith(
        expect.stringContaining('No conscious memories found for consolidation'),
        expect.objectContaining({
          component: 'ConsciousAgent',
          namespace: 'test-namespace',
        }),
      );
    });

    it('should detect and consolidate duplicate memories', async () => {
      const mockMemories = [
        {
          id: 'memory-1',
          content: 'This is a test memory about AI agents',
          summary: 'AI agents test memory',
          classification: 'conscious-info',
          importance: 'high',
          entities: ['AI', 'agents'],
          keywords: ['test', 'memory'],
          confidenceScore: 0.8,
          classificationReason: 'Test reason',
        },
        {
          id: 'memory-2',
          content: 'This is another test memory about artificial intelligence agents',
          summary: 'Artificial intelligence agents memory',
          classification: 'conscious-info',
          importance: 'high',
          entities: ['AI', 'agents'],
          keywords: ['test', 'memory'],
          confidenceScore: 0.8,
          classificationReason: 'Test reason',
        },
      ];

      mockDbManager.getProcessedConsciousMemories = jest.fn().mockResolvedValue(mockMemories);

      const result = await consciousAgent.consolidateDuplicates({ dryRun: true });

      // Verify the result has the expected structure
      expect(result).toHaveProperty('totalProcessed');
      expect(result).toHaveProperty('duplicatesFound');
      expect(result).toHaveProperty('consolidated');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('skipped');
      expect(result).toHaveProperty('processingTime');
      expect(result).toHaveProperty('memoryUsage');
      expect(result).toHaveProperty('consolidationStats');

      // Verify basic expectations
      expect(typeof result.totalProcessed).toBe('number');
      expect(typeof result.duplicatesFound).toBe('number');
      expect(typeof result.consolidated).toBe('number');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(typeof result.skipped).toBe('number');
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
      expect(result.memoryUsage).toBeDefined();
      expect(result.consolidationStats).toBeDefined();

      // Verify logging was called
      expect(logInfo).toHaveBeenCalledWith(
        expect.stringContaining('Starting enhanced conscious memory consolidation in namespace: test-namespace'),
        expect.objectContaining({
          component: 'ConsciousAgent',
          similarityThreshold: 0.7,
          dryRun: true,
          namespace: 'test-namespace',
        }),
      );
      expect(logInfo).toHaveBeenCalledWith(
        expect.stringContaining('Found 2 conscious memories to analyze for duplicates'),
        expect.objectContaining({
          component: 'ConsciousAgent',
          namespace: 'test-namespace',
          memoryCount: 2,
        }),
      );
    });

    it('should handle consolidation errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => { });
      const mockMemories = [
        {
          id: 'memory-1',
          content: 'Test memory',
          summary: 'Test summary',
          classification: 'conscious-info',
          importance: 'high',
          entities: [],
          keywords: [],
          confidenceScore: 0.8,
          classificationReason: 'Test',
        },
      ];

      mockDbManager.getProcessedConsciousMemories = jest.fn().mockResolvedValue(mockMemories);

      // Reset the consolidation service mock for this test
      const freshConsolidationService = {
        detectDuplicateMemories: jest.fn().mockRejectedValue(new Error('Database error')),
        consolidateMemories: jest.fn().mockResolvedValue({ consolidated: 0, errors: [] }),
        getConsolidationAnalytics: jest.fn().mockResolvedValue({
          totalMemories: 1,
          duplicateCount: 0,
          consolidatedMemories: 0,
          averageConsolidationRatio: 0,
          lastConsolidationActivity: new Date(),
        }),
        getOptimizationRecommendations: jest.fn().mockResolvedValue({
          overallHealth: 'good',
          recommendations: [],
        }),
      };

      mockDbManager.getConsolidationService.mockReturnValue(freshConsolidationService);

      const result = await consciousAgent.consolidateDuplicates();

      expect(result.totalProcessed).toBe(0);
      expect(result.duplicatesFound).toBe(0);
      expect(result.consolidated).toBe(0);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('Error processing memory memory-1');
      expect(result.errors[0]).toContain('Database error');
      expect(result.skipped).toBe(0);
      expect(result.processingTime).toBeGreaterThanOrEqual(0);
      expect(result.memoryUsage).toBeDefined();
      expect(result.consolidationStats).toBeDefined();

      consoleSpy.mockRestore();
    });

    it('should respect custom options', async () => {
      mockDbManager.getProcessedConsciousMemories = jest.fn().mockResolvedValue([]);

      await consciousAgent.consolidateDuplicates({
        namespace: 'custom-namespace',
        similarityThreshold: 0.9,
        dryRun: true,
      });

      expect(logInfo).toHaveBeenCalledWith(
        expect.stringContaining('Starting enhanced conscious memory consolidation in namespace: custom-namespace'),
        expect.objectContaining({
          component: 'ConsciousAgent',
          namespace: 'custom-namespace',
        }),
      );
      // The debug log may or may not be called depending on the implementation
      // This test mainly verifies that custom options are accepted and processed
    });
  });

  describe('memory tracking', () => {
    it('should track processed memories', async () => {
      const mockMemories = [
        {
          id: 'memory-1',
          content: 'Test memory',
          summary: 'Summary',
          classification: 'conscious-info',
          importance: 'high',
          entities: [],
          keywords: [],
          confidenceScore: 0.8,
          classificationReason: 'Test',
        },
      ];

      mockDbManager.getUnprocessedConsciousMemories.mockResolvedValue(mockMemories);

      await consciousAgent.run_conscious_ingest();

      expect(consciousAgent.getProcessedMemoryCount()).toBe(1);
    });

    it('should clear processed memory tracking', async () => {
      const mockMemories = [
        {
          id: 'memory-1',
          content: 'Test memory',
          summary: 'Summary',
          classification: 'conscious-info',
          importance: 'high',
          entities: [],
          keywords: [],
          confidenceScore: 0.8,
          classificationReason: 'Test',
        },
      ];

      mockDbManager.getUnprocessedConsciousMemories.mockResolvedValue(mockMemories);

      await consciousAgent.run_conscious_ingest();
      expect(consciousAgent.getProcessedMemoryCount()).toBe(1);

      consciousAgent.clearProcessedMemoryTracking();
      expect(consciousAgent.getProcessedMemoryCount()).toBe(0);
    });
  });
});

// Global cleanup after all tests
afterAll(async () => {
  // Clear any pending timers
  jest.clearAllTimers();
  jest.useRealTimers();

  // Restore any global mocks
  jest.restoreAllMocks();

  // Small delay to ensure any pending async operations complete
  await new Promise(resolve => setTimeout(resolve, 100));
});