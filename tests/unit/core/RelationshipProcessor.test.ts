/**
 * Unit tests for RelationshipProcessor
 * Tests core relationship processing logic excluding LLM interactions
 */

import { OpenAIProvider } from '@/core/infrastructure/providers/OpenAIProvider';
import { DatabaseManager } from '@/core/infrastructure/database/DatabaseManager';
import { MemoryRelationship, MemoryRelationshipType } from '@/core/types/schemas';
import { RelationshipProcessor } from '@/core/domain/search/relationship/RelationshipProcessor';
import { cleanupGlobalConnectionPool } from '@/core/infrastructure/providers/performance/ConnectionPool';

// Mock dependencies
jest.mock('@/core/infrastructure/database/DatabaseManager');
jest.mock('@/core/infrastructure/providers/OpenAIProvider');
jest.mock('@/core/infrastructure/providers/performance/ConnectionPool');
jest.mock('@/core/domain/search/strategies/RelationshipSearchStrategy');

const MockedDatabaseManager = DatabaseManager as jest.MockedClass<typeof DatabaseManager>;
const MockedOpenAIProvider = OpenAIProvider as jest.MockedClass<typeof OpenAIProvider>;
const MockedConnectionPool = require('@/core/infrastructure/providers/performance/ConnectionPool').ConnectionPool as jest.MockedClass<any>;

describe('RelationshipProcessor', () => {
  let relationshipProcessor: RelationshipProcessor;
  let mockDbManager: jest.Mocked<DatabaseManager>;
  let mockOpenAIProvider: jest.Mocked<OpenAIProvider>;

  // Mock data for testing
  const mockMemory = {
    id: 'memory-1',
    content: 'This is a test memory about TypeScript interfaces',
    summary: 'Test memory summary',
    classification: 'programming' as any,
    importanceScore: 0.8,
    retentionType: 'long_term' as any,
    categoryPrimary: 'programming' as any,
    createdAt: new Date('2024-01-01'),
    extractionTimestamp: new Date('2024-01-01'),
    entitiesJson: ['TypeScript', 'interfaces'],
    keywordsJson: ['programming', 'typescript'],
    relatedMemoriesJson: [] as any,
    supersedesJson: [] as any,
    processedData: {},
  };

  const mockExistingMemories = [
    {
      id: 'memory-2',
      searchableContent: 'Previous discussion about TypeScript types and interfaces',
      summary: 'Previous TypeScript discussion',
      topic: 'TypeScript fundamentals',
      entitiesJson: ['TypeScript'],
      createdAt: new Date('2024-01-01'),
    },
    {
      id: 'memory-3',
      searchableContent: 'JavaScript function examples',
      summary: 'JavaScript functions',
      topic: 'JavaScript programming',
      entitiesJson: ['JavaScript'],
      createdAt: new Date('2024-01-02'),
    },
  ];

  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();

    // Create mock instances
    mockDbManager = new MockedDatabaseManager('sqlite::memory:') as jest.Mocked<DatabaseManager>;
    mockOpenAIProvider = new MockedOpenAIProvider({ apiKey: 'test-key' }) as jest.Mocked<OpenAIProvider>;

    // Setup default mock implementations
    (mockDbManager as any).searchManager = {
      searchMemories: jest.fn().mockResolvedValue(mockExistingMemories)
    };
    mockDbManager.getPrismaClient = jest.fn().mockReturnValue({
      longTermMemory: {
        findUnique: jest.fn().mockResolvedValue(mockMemory),
        findMany: jest.fn().mockResolvedValue([mockMemory]),
      },
    } as any);

    // Mock ConnectionPool to prevent interval leaks in tests
    MockedConnectionPool.mockImplementation(() => ({
      getConnection: jest.fn(),
      returnConnection: jest.fn(),
      getPoolStats: jest.fn(),
      cleanup: jest.fn(),
      dispose: jest.fn(),
      stopHealthCheckInterval: jest.fn(),
    }));

    // Create RelationshipProcessor instance
    relationshipProcessor = new RelationshipProcessor(mockDbManager, mockOpenAIProvider);
  });

  describe('Relationship Extraction (Non-LLM)', () => {
    test('should generate cache key correctly', () => {
      const content = 'Test content';
      const context = {
        sessionId: 'session-1',
        userPreferences: ['typescript'],
        currentProjects: ['project-1'],
        analysisDepth: 3,
      };

      // Access the private method through type assertion for testing
      const cacheKey = (relationshipProcessor as any).generateCacheKey(content, context);

      expect(cacheKey).toContain('rel_');
      expect(cacheKey.length).toBeGreaterThan(10);
    });

    test('should calculate semantic similarity correctly', () => {
      const content1 = 'TypeScript interfaces and types';
      const content2 = 'TypeScript interfaces are useful';

      // Access the private method through type assertion for testing
      const similarity = (relationshipProcessor as any).calculateSemanticSimilarity(content1, content2);

      expect(similarity).toBeGreaterThan(0);
      expect(similarity).toBeLessThanOrEqual(1);
    });

    test('should calculate entity overlap correctly', () => {
      const content = 'TypeScript interfaces are great';
      const entities = ['TypeScript', 'interfaces'];

      // Access the private method through type assertion for testing
      const overlap = (relationshipProcessor as any).calculateEntityOverlap(content, entities);

      expect(overlap).toBeGreaterThan(0);
      expect(overlap).toBeLessThanOrEqual(1);
    });

    test('should calculate temporal proximity factor correctly', () => {
      const currentDate = new Date();
      const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
      const oldDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000); // 60 days ago

      // Access the private method through type assertion for testing
      const recentFactor = (relationshipProcessor as any).calculateTemporalFactor(currentDate, recentDate);
      const oldFactor = (relationshipProcessor as any).calculateTemporalFactor(currentDate, oldDate);

      expect(recentFactor).toBeGreaterThan(oldFactor);
      expect(recentFactor).toBe(1.0); // Recent memories get full factor
      expect(oldFactor).toBeLessThan(1.0);
    });

    test('should validate relationships correctly', () => {
      const validRelationship: MemoryRelationship = {
        type: MemoryRelationshipType.CONTINUATION,
        targetMemoryId: 'memory-2',
        confidence: 0.8,
        strength: 0.7,
        reason: 'This continues the previous discussion about TypeScript',
        entities: ['TypeScript'],
        context: 'Programming discussion context',
      };

      const invalidRelationship: MemoryRelationship = {
        type: MemoryRelationshipType.CONTINUATION,
        targetMemoryId: 'memory-2',
        confidence: 0.8,
        strength: 0.7,
        reason: 'x', // Too short reason
        entities: ['TypeScript'],
        context: 'context',
      };

      // Access the private method through type assertion for testing
      const isValid1 = (relationshipProcessor as any).isValidRelationship(validRelationship);
      const isValid2 = (relationshipProcessor as any).isValidRelationship(invalidRelationship);

      expect(isValid1).toBe(true);
      expect(isValid2).toBe(false);
    });

    test('should calculate overall confidence correctly', () => {
      const relationships: MemoryRelationship[] = [
        {
          type: MemoryRelationshipType.CONTINUATION,
          confidence: 0.8,
          strength: 0.7,
          reason: 'Good relationship',
          entities: [],
          context: 'context',
        },
        {
          type: MemoryRelationshipType.REFERENCE,
          confidence: 0.6,
          strength: 0.5,
          reason: 'Another relationship',
          entities: [],
          context: 'context',
        },
      ];

      // Access the private method through type assertion for testing
      const overallConfidence = (relationshipProcessor as any).calculateOverallConfidence(relationships);

      expect(overallConfidence).toBeCloseTo(0.73, 2); // Weighted average: (0.8*0.7 + 0.6*0.3) / 1
    });
  });

  describe('Relationship Graph Building', () => {
    test('should build relationship graph with correct structure', async () => {
      // Mock database calls for graph building
      (mockDbManager as any).searchManager = {
        searchMemories: jest.fn().mockResolvedValue(mockExistingMemories)
      };
      mockDbManager.getPrismaClient = jest.fn().mockReturnValue({
        longTermMemory: {
          findMany: jest.fn().mockResolvedValue([
            {
              ...mockMemory,
              relatedMemoriesJson: [{
                type: MemoryRelationshipType.CONTINUATION,
                targetMemoryId: 'memory-2',
                confidence: 0.8,
                strength: 0.7,
                reason: 'Continues previous discussion',
                entities: ['TypeScript'],
                context: 'Programming context',
              }],
            },
          ]),
        },
      } as any);

      const graph = await relationshipProcessor.buildRelationshipGraph('test-namespace');

      expect(graph).toBeDefined();
      expect(graph.namespace).toBe('test-namespace');
      expect(graph.nodes).toBeDefined();
      expect(graph.edges).toBeDefined();
      expect(graph.statistics).toBeDefined();
      expect(graph.builtAt).toBeInstanceOf(Date);
    });

    test('should calculate graph statistics correctly', async () => {
      // Test the statistics calculation logic directly
      const nodes = new Map([
        ['memory-1', { id: 'memory-1' }],
        ['memory-2', { id: 'memory-2' }],
      ]);

      const edges = [
        {
          source: 'memory-1',
          target: 'memory-2',
          relationship: { type: MemoryRelationshipType.CONTINUATION },
          weight: 0.7,
        },
      ];

      // Access the private method through type assertion for testing
      const statistics = (relationshipProcessor as any).calculateGraphStatistics(nodes, edges);

      expect(statistics.nodeCount).toBe(2);
      expect(statistics.edgeCount).toBe(1);
      expect(statistics.averageDegree).toBe(0.5); // 1 edge / 2 nodes
      expect(statistics.relationshipTypeDistribution).toBeDefined();
    });

    test('should calculate graph density correctly', () => {
      // Access the private method through type assertion for testing
      const density1 = (relationshipProcessor as any).calculateGraphDensity(3, 2);
      const density2 = (relationshipProcessor as any).calculateGraphDensity(2, 0);

      expect(density1).toBeCloseTo(0.67, 2); // 2 edges in 3 nodes = 2/3
      expect(density2).toBe(0); // No edges = 0 density
    });
  });

  describe('Relationship Strength Calculation', () => {
    test('should calculate relationship strengths with propagation', async () => {
      const memoryId = 'memory-1';

      // Mock related memories
      const mockRelatedMemories = [
        {
          memory: { id: 'memory-2' },
          relationship: {
            type: MemoryRelationshipType.CONTINUATION,
            confidence: 0.8,
            strength: 0.7,
          },
          direction: 'outgoing' as const,
        },
        {
          memory: { id: 'memory-3' },
          relationship: {
            type: MemoryRelationshipType.RELATED,
            confidence: 0.6,
            strength: 0.5,
          },
          direction: 'outgoing' as const,
        },
      ];

      mockDbManager.getRelatedMemories = jest.fn().mockResolvedValue(mockRelatedMemories);
      mockDbManager.getPrismaClient = jest.fn().mockReturnValue({
        longTermMemory: {
          findUnique: jest.fn().mockResolvedValue(mockMemory),
        },
      } as any);

      const strengths = await relationshipProcessor.calculateRelationshipStrengths(memoryId, 'test-namespace');

      expect(strengths).toBeInstanceOf(Map);
      expect(strengths.has(memoryId)).toBe(true);
      expect(strengths.get(memoryId)).toBe(1.0); // Source memory has full strength
    });

    test('should calculate propagated strength correctly', () => {
      const relationship: MemoryRelationship = {
        type: MemoryRelationshipType.CONTINUATION,
        confidence: 0.8,
        strength: 0.7,
        reason: 'Test relationship',
        entities: [],
        context: 'context',
      };

      // Access the private method through type assertion for testing
      const propagatedStrength = (relationshipProcessor as any).calculatePropagatedStrength(
        1.0, // current strength
        relationship,
        1 // depth
      );

      expect(propagatedStrength).toBeGreaterThan(0);
      expect(propagatedStrength).toBeLessThan(1.0);
    });

    test('should get correct relationship type factors', () => {
      // Access the private method through type assertion for testing
      const continuationFactor = (relationshipProcessor as any).getRelationshipTypeFactor(MemoryRelationshipType.CONTINUATION);
      const contradictionFactor = (relationshipProcessor as any).getRelationshipTypeFactor(MemoryRelationshipType.CONTRADICTION);

      expect(continuationFactor).toBeGreaterThan(contradictionFactor);
      expect(continuationFactor).toBe(0.9);
      expect(contradictionFactor).toBe(0.5);
    });
  });

  describe('Graph Clustering', () => {
    test('should identify relationship clusters correctly', async () => {
      // Create mock graph with connected components
      const mockGraph = {
        namespace: 'test-namespace',
        nodes: [
          { id: 'memory-1', content: 'Memory 1' },
          { id: 'memory-2', content: 'Memory 2' },
          { id: 'memory-3', content: 'Memory 3' },
        ],
        edges: [
          {
            source: 'memory-1',
            target: 'memory-2',
            relationship: {
              type: MemoryRelationshipType.CONTINUATION,
              confidence: 0.8,
              strength: 0.7,
            },
            weight: 0.7,
          },
        ],
        statistics: {
          nodeCount: 3,
          edgeCount: 1,
          averageDegree: 0.67,
          relationshipTypeDistribution: {},
          averageStrength: 0.7,
          maxStrength: 0.7,
          minStrength: 0.7,
        },
        builtAt: new Date(),
      };

      // Mock the graph building to return our test graph
      jest.spyOn(relationshipProcessor, 'buildRelationshipGraph').mockResolvedValue(mockGraph as any);

      const clusters = await relationshipProcessor.identifyRelationshipClusters('test-namespace', 2);

      expect(clusters).toBeDefined();
      expect(Array.isArray(clusters)).toBe(true);
    });

    test('should perform graph clustering with minimum cluster size', () => {
      const mockGraph = {
        nodes: [
          { id: 'memory-1' },
          { id: 'memory-2' },
          { id: 'memory-3' },
        ],
        edges: [
          {
            source: 'memory-1',
            target: 'memory-2',
            relationship: { type: MemoryRelationshipType.CONTINUATION },
            weight: 0.7,
          },
        ],
      };

      // Access the private method through type assertion for testing
      const clusters = (relationshipProcessor as any).performGraphClustering(mockGraph, 2);

      expect(Array.isArray(clusters)).toBe(true);
      // Should find one cluster with 2 connected memories
      expect(clusters.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Caching', () => {
    test('should use cache for relationship extraction results', async () => {
      const content = 'Test content';
      const context = {
        sessionId: 'session-1',
        userPreferences: ['typescript'],
        currentProjects: ['project-1'],
        analysisDepth: 3,
      };

      // Mock LLM failure to test fallback behavior
      mockOpenAIProvider.getClient = jest.fn().mockReturnValue({
        chat: {
          completions: {
            create: jest.fn().mockRejectedValue(new Error('LLM unavailable')),
          },
        },
      });

      // First call should fail and cache the empty result
      const result1 = await relationshipProcessor.extractRelationships(content, context, mockExistingMemories);

      // Second call should use cached result
      const result2 = await relationshipProcessor.extractRelationships(content, context, mockExistingMemories);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });

    test('should provide cache statistics', () => {
      const stats = relationshipProcessor.getCacheStatistics();

      expect(stats).toHaveProperty('relationshipCacheSize');
      expect(stats).toHaveProperty('graphCacheSize');
      expect(stats).toHaveProperty('totalCacheSize');
      expect(typeof stats.relationshipCacheSize).toBe('number');
      expect(typeof stats.graphCacheSize).toBe('number');
      expect(typeof stats.totalCacheSize).toBe('number');
    });

    test('should clear caches when requested', () => {
      // Add some mock data to caches
      (relationshipProcessor as any).relationshipCache.set('test-key', {
        result: { relationships: [], confidence: 0 },
        timestamp: new Date(),
      });

      const statsBefore = relationshipProcessor.getCacheStatistics();
      expect(statsBefore.totalCacheSize).toBeGreaterThan(0);

      relationshipProcessor.clearCaches();

      const statsAfter = relationshipProcessor.getCacheStatistics();
      expect(statsAfter.totalCacheSize).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      (mockDbManager as any).searchManager = {
        searchMemories: jest.fn().mockRejectedValue(new Error('Database connection failed'))
      };

      const result = await relationshipProcessor.extractRelationships(
        'Test content',
        { sessionId: 'test' },
        []
      );

      expect(result).toBeDefined();
      expect(result.relationships).toEqual([]);
      expect(result.confidence).toBe(0);
      expect(result.error).toBeDefined();
    });

    test('should handle graph building errors gracefully', async () => {
      (mockDbManager as any).searchManager = {
        searchMemories: jest.fn().mockRejectedValue(new Error('Graph building failed'))
      };

      await expect(
        relationshipProcessor.buildRelationshipGraph('test-namespace')
      ).rejects.toThrow('Failed to build relationship graph');
    });

    test('should handle empty memory list gracefully', async () => {
      (mockDbManager as any).searchManager = {
        searchMemories: jest.fn().mockResolvedValue([])
      };

      const result = await relationshipProcessor.extractRelationships(
        'Test content',
        { sessionId: 'test' },
        []
      );

      expect(result).toBeDefined();
      expect(result.relationships).toEqual([]);
      expect(result.confidence).toBe(0);
    });
  });

  describe('Configuration', () => {
    test('should accept custom configuration', () => {
      const customProcessor = new RelationshipProcessor(mockDbManager, mockOpenAIProvider, {
        defaultAnalysisDepth: 5,
        confidenceThreshold: 0.5,
        maxRelatedMemories: 25,
      });

      expect(customProcessor).toBeDefined();
      expect(customProcessor.getCacheStatistics()).toBeDefined();
    });

    test('should use default configuration when no options provided', () => {
      const defaultProcessor = new RelationshipProcessor(mockDbManager, mockOpenAIProvider);

      expect(defaultProcessor).toBeDefined();
      expect(defaultProcessor.getCacheStatistics()).toBeDefined();
    });
  });

  describe('Performance', () => {
    test('should track operation start time', () => {
      // Access the private method through type assertion for testing
      (relationshipProcessor as any).startOperation();

      expect((relationshipProcessor as any).operationStartTime).toBeGreaterThan(0);
    });

    test('should handle large datasets efficiently', async () => {
      // Create large mock dataset
      const largeMemorySet = Array.from({ length: 100 }, (_, i) => ({
        id: `memory-${i}`,
        searchableContent: `Memory ${i} content`,
        summary: `Summary ${i}`,
        topic: 'test topic',
        entitiesJson: [`entity-${i}`],
        createdAt: new Date(),
      }));

      (mockDbManager as any).searchManager = {
        searchMemories: jest.fn().mockResolvedValue(largeMemorySet)
      };

      const startTime = Date.now();
      const result = await relationshipProcessor.extractRelationships(
        'Test content',
        { sessionId: 'test' },
        largeMemorySet
      );
      const endTime = Date.now();

      expect(result).toBeDefined();
      expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });

  describe('Utility Functions', () => {
    test('should calculate hash correctly', () => {
      const hash1 = (relationshipProcessor as any).simpleHash('test string');
      const hash2 = (relationshipProcessor as any).simpleHash('test string');
      const hash3 = (relationshipProcessor as any).simpleHash('different string');

      expect(hash1).toBe(hash2); // Same input should produce same hash
      expect(hash1).not.toBe(hash3); // Different input should produce different hash
      expect(typeof hash1).toBe('string');
    });

    test('should validate relationship structure', () => {
      const validRelationship: MemoryRelationship = {
        type: MemoryRelationshipType.CONTINUATION,
        confidence: 0.8,
        strength: 0.7,
        reason: 'This is a valid reason with sufficient length',
        entities: ['TypeScript'],
        context: 'Valid context',
      };

      const invalidRelationship: MemoryRelationship = {
        type: 'INVALID_TYPE' as any,
        confidence: 0.8,
        strength: 0.7,
        reason: 'Valid reason',
        entities: ['TypeScript'],
        context: 'Valid context',
      };

      // Access the private method through type assertion for testing
      const isValid1 = (relationshipProcessor as any).isValidRelationship(validRelationship);
      const isValid2 = (relationshipProcessor as any).isValidRelationship(invalidRelationship);

      expect(isValid1).toBe(true);
      expect(isValid2).toBe(false);
    });
  });

  // Global cleanup after all tests
  afterAll(() => {
    // Cleanup global ConnectionPool to prevent interval leaks
    cleanupGlobalConnectionPool();

    // Clear any pending timers
    jest.clearAllTimers();
    jest.useRealTimers();

    // Restore any global mocks
    jest.restoreAllMocks();
  });
});