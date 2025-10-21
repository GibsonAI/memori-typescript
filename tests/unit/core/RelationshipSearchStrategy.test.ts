// Mock logger
const mockLogger = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

// Mock the Logger module (duplicate mock removed)

import { RelationshipSearchStrategy } from '@/core/domain/search/strategies/RelationshipSearchStrategy';
import { SearchStrategy } from '@/core/domain/search/types';
import { MemoryRelationshipType } from '@/core/types/schemas';

// Mock DatabaseManager for testing
class MockDatabaseManager {
  private mockMemories: Map<string, any> = new Map();
  private mockRelationships: Map<string, any[]> = new Map();

  constructor() {
    this.initializeMockData();
  }

  private initializeMockData() {
    // Create mock memories
    this.mockMemories.set('memory-1', {
      id: 'memory-1',
      searchableContent: 'First memory about programming',
      summary: 'Introduction to programming',
      categoryPrimary: 'programming',
      importanceScore: 0.8,
      retentionType: 'long_term',
      createdAt: new Date('2024-01-01'),
      processedData: {
        entities: ['programming', 'coding'],
        keywords: ['programming', 'development'],
      },
    });

    this.mockMemories.set('memory-2', {
      id: 'memory-2',
      searchableContent: 'Advanced programming concepts',
      summary: 'Deep dive into advanced programming',
      categoryPrimary: 'programming',
      importanceScore: 0.9,
      retentionType: 'long_term',
      createdAt: new Date('2024-01-02'),
      processedData: {
        entities: ['programming', 'advanced'],
        keywords: ['advanced', 'programming'],
      },
    });

    this.mockMemories.set('memory-3', {
      id: 'memory-3',
      searchableContent: 'Database design principles',
      summary: 'Database design fundamentals',
      categoryPrimary: 'database',
      importanceScore: 0.7,
      retentionType: 'long_term',
      createdAt: new Date('2024-01-03'),
      processedData: {
        entities: ['database', 'design'],
        keywords: ['database', 'design'],
      },
    });

    // Create mock relationships
    this.mockRelationships.set('memory-1', [
      {
        type: MemoryRelationshipType.CONTINUATION,
        targetMemoryId: 'memory-2',
        confidence: 0.8,
        strength: 0.7,
        reason: 'Memory 2 continues the programming discussion',
        entities: ['programming'],
        context: 'Sequential learning path',
      },
    ]);

    this.mockRelationships.set('memory-2', [
      {
        type: MemoryRelationshipType.REFERENCE,
        targetMemoryId: 'memory-3',
        confidence: 0.9,
        strength: 0.6,
        reason: 'Programming concepts reference database design',
        entities: ['programming', 'database'],
        context: 'Cross-domain connection',
      },
    ]);
  }

  async getRelatedMemories(
    memoryId: string,
    options: {
      relationshipType?: MemoryRelationshipType;
      minConfidence?: number;
      minStrength?: number;
      namespace?: string;
      limit?: number;
    } = {},
  ): Promise<Array<{
    memory: any;
    relationship: any;
  }>> {
    const relationships = this.mockRelationships.get(memoryId) || [];
    const filteredRelationships = relationships.filter(rel => {
      if (options.relationshipType && rel.type !== options.relationshipType) return false;
      if (options.minConfidence && rel.confidence < options.minConfidence) return false;
      if (options.minStrength && rel.strength < options.minStrength) return false;
      return true;
    }).slice(0, options.limit || 10);

    return filteredRelationships.map(rel => ({
      memory: this.mockMemories.get(rel.targetMemoryId),
      relationship: rel,
    })).filter(item => item.memory !== undefined);
  }

  // Add the missing method that RelationshipSearchStrategy expects
  async findMemory(memoryId: string): Promise<any> {
    return this.mockMemories.get(memoryId) || null;
  }

  getPrismaClient() {
    return {
      longTermMemory: {
        findUnique: async ({ where }: { where: { id: string } }) => {
          return this.mockMemories.get(where.id) || null;
        },
      },
      shortTermMemory: {
        findUnique: async () => null, // No short-term memories in mock
      },
    };
  }
}


// Mock the Logger module
jest.mock('../../../src/core/infrastructure/config/Logger', () => ({
  logInfo: mockLogger.info,
  logError: mockLogger.error,
  logWarn: mockLogger.warn,
  logDebug: mockLogger.debug,
}));

describe('RelationshipSearchStrategy', () => {
  let strategy: RelationshipSearchStrategy;
  let mockDbManager: MockDatabaseManager;

  beforeEach(() => {
    mockDbManager = new MockDatabaseManager();
    strategy = new RelationshipSearchStrategy(
      RelationshipSearchStrategy.createDefaultConfig(),
      mockDbManager as any
    );
    jest.clearAllMocks();
  });

  describe('canHandle', () => {
    it('should handle queries with relationship parameters', () => {
      const query = {
        text: 'test',
        filters: {
          startMemoryId: 'memory-1',
          maxDepth: 2,
        },
      };

      expect(strategy.canHandle(query)).toBe(true);
    });

    it('should handle queries with relationship keywords', () => {
      const query = {
        text: 'find related memories about programming',
        filters: {},
      };

      expect(strategy.canHandle(query)).toBe(true);
    });

    it('should not handle regular text queries without relationship context', () => {
      const query = {
        text: 'some random search',
        filters: {},
      };

      expect(strategy.canHandle(query)).toBe(false);
    });
  });

  describe('search', () => {
    it('should perform relationship-based search from start memory', async () => {
      const query = {
        text: 'related programming concepts',
        limit: 10,
        filters: {
          startMemoryId: 'memory-1',
          maxDepth: 2,
          includeRelationshipPaths: true,
        },
      };

      const results = await strategy.search(query);

      expect(results).toHaveLength(2); // memory-2 and memory-3
      expect(results[0].id).toBe('memory-2');
      expect(results[1].id).toBe('memory-3');
      expect(results[0].score).toBeGreaterThan(0);
      expect(results[0].strategy).toBe(SearchStrategy.RELATIONSHIP);
    });

    it('should respect max depth limit', async () => {
      const query = {
        text: 'related concepts',
        limit: 10,
        filters: {
          startMemoryId: 'memory-1',
          maxDepth: 1, // Only direct relationships
        },
      };

      const results = await strategy.search(query);

      expect(results).toHaveLength(1); // Only memory-2
      expect(results[0].id).toBe('memory-2');
    });

    it('should handle invalid memory IDs gracefully', async () => {
      const query = {
        text: 'related concepts',
        limit: 10,
        filters: {
          startMemoryId: 'non-existent-memory',
          maxDepth: 2,
        },
      };

      const results = await strategy.search(query);

      expect(results).toHaveLength(0);
    });

    it('should apply relationship strength filtering', async () => {
      // Add a weak relationship to test filtering
      mockDbManager['mockRelationships'].get('memory-1')?.push({
        type: MemoryRelationshipType.RELATED,
        targetMemoryId: 'memory-3',
        confidence: 0.5,
        strength: 0.2, // Below default minimum of 0.3
        reason: 'Weak relationship',
        entities: [],
        context: 'Weak connection',
      });

      const query = {
        text: 'related concepts',
        limit: 10,
        filters: {
          startMemoryId: 'memory-1',
          maxDepth: 2,
          minRelationshipStrength: 0.5, // Only strong relationships
        },
      };

      const results = await strategy.search(query);

      // Should include both memory-2 (directly connected with strength 0.7 >= 0.5)
      // and memory-3 (connected to memory-2 with strength 0.6 >= 0.5)
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('memory-2');
      expect(results[1].id).toBe('memory-3');
    });
  });

  describe('relationship traversal algorithms', () => {
    it('should support breadth-first traversal', async () => {
      const query = {
        text: 'related concepts',
        limit: 10,
        filters: {
          startMemoryId: 'memory-1',
          maxDepth: 2,
          traversalStrategy: 'breadth_first' as const,
        },
      };

      const results = await strategy.search(query);

      expect(results.length).toBeGreaterThan(0);
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Relationship search completed'),
        expect.any(Object),
      );
    });

    it('should support strength-weighted traversal', async () => {
      const query = {
        text: 'related concepts',
        limit: 10,
        filters: {
          startMemoryId: 'memory-1',
          maxDepth: 2,
          traversalStrategy: 'strength_weighted' as const,
        },
      };

      const results = await strategy.search(query);

      expect(results.length).toBeGreaterThan(0);
    });
  });

  describe('cycle detection', () => {
    it('should detect and prevent cycles in relationship paths', async () => {
      // Create a circular relationship for testing
      mockDbManager['mockRelationships'].get('memory-3')?.push({
        type: MemoryRelationshipType.REFERENCE,
        targetMemoryId: 'memory-1', // Creates cycle: 1->2->3->1
        confidence: 0.8,
        strength: 0.7,
        reason: 'Circular reference',
        entities: ['programming'],
        context: 'Test cycle',
      });

      const query = {
        text: 'related concepts',
        limit: 10,
        filters: {
          startMemoryId: 'memory-1',
          maxDepth: 5, // Deep enough to potentially create cycles
        },
      };

      const results = await strategy.search(query);

      // Should not include cycles - should have exactly 2 results without infinite loops
      expect(results.length).toBe(2);
      expect(results.map(r => r.id)).not.toContain('memory-1'); // Should not loop back to start
    });
  });

  describe('error handling', () => {
    it('should throw validation error for invalid depth', async () => {
      const query = {
        text: 'test',
        filters: {
          startMemoryId: 'memory-1',
          maxDepth: -1, // Invalid depth
        },
      };

      await expect(strategy.search(query)).rejects.toThrow('Max depth must be between 1');
    });

    it('should throw validation error when no start or target memory provided', async () => {
      const query = {
        text: 'test',
        filters: {
          maxDepth: 2,
          // Missing startMemoryId and targetMemoryId
        },
      };

      await expect(strategy.search(query)).rejects.toThrow('Either startMemoryId or targetMemoryId must be provided');
    });
  });

  describe('configuration validation', () => {
    it('should validate configuration correctly', async () => {
      const isValid = await strategy.validateConfiguration();
      expect(isValid).toBe(true);
    });

    it('should return correct metadata', () => {
      const metadata = strategy.getMetadata();
      expect(metadata.name).toBe(SearchStrategy.RELATIONSHIP);
      expect(metadata.capabilities).toContain('filtering');
      expect(metadata.capabilities).toContain('relevance_scoring');
    });
  });
});
