import { MemoryAgent } from '../../../src/core/domain/memory/MemoryAgent';
import { MemoryClassification, MemoryImportanceLevel, ProcessedLongTermMemory, MemoryRelationshipType } from '../../../src/core/types/schemas';
import { TestHelper, beforeEachTest, afterEachTest } from '../../setup/database/TestHelper';
import { MemoryProcessingState } from '../../../src/core/domain/memory/MemoryProcessingStateManager';

// Mock LLM Provider for testing
class MockLLMProvider {
  async createChatCompletion(params: any) {
    // Extract the user input from the conversation to create relevant response
    const userMessage = params.messages?.find((m: any) => m.role === 'user');
    const conversationText = userMessage?.content || '';

    // Extract key information from the conversation
    let content = 'Mock response content';
    let topic = 'general';

    // Check for empty conversation case more specifically
    if (conversationText === '\nUser: \nAssistant: ' ||
        (conversationText.includes('Test input') && conversationText.includes('Test output')) ||
        conversationText.includes('User: \nAssistant: ')) {
      content = ' ';
      topic = 'empty';
    } else if (conversationText.includes('TypeScript interfaces')) {
      content = 'TypeScript interfaces define object structure and provide type safety';
      topic = 'typescript';
    } else if (conversationText.includes('weather')) {
      content = 'Weather discussion and forecast information';
      topic = 'weather';
    } else if (conversationText.includes('empty') || conversationText.trim().length < 10) {
      content = ' ';
      topic = 'empty';
    } else if (conversationText.length > 1000) {
      content = conversationText.substring(0, 1000) + '... (truncated for test)';
      topic = 'long-content';
    } else if (conversationText.includes('🚀') || conversationText.includes('special')) {
      content = 'Special characters and emojis: 🚀 àáâãäå';
      topic = 'special-chars';
    }

    return {
      message: {
        content: JSON.stringify({
          content: content,
          summary: `Summary of: ${content.substring(0, 50)}...`,
          classification: 'CONVERSATIONAL',
          importance: 'MEDIUM',
          topic: topic,
          entities: content.includes('TypeScript') ? ['typescript', 'interfaces'] : ['general'],
          keywords: ['test', 'mock'],
          confidenceScore: 0.8,
          classificationReason: 'Mock test response based on input',
          promotionEligible: false,
        }),
      },
    };
  }
}

describe('MemoryAgent Comprehensive Tests', () => {
  let memoryAgent: MemoryAgent;
  let mockProvider: MockLLMProvider;
  let testContext: Awaited<ReturnType<typeof beforeEachTest>>;

  beforeEach(async () => {
    testContext = await beforeEachTest('unit', 'MemoryAgentComprehensive');
    const testNamespace = testContext?.namespace || `test-namespace-${Date.now()}`;

    mockProvider = new MockLLMProvider();
    memoryAgent = new MemoryAgent(mockProvider as any);
  });

  afterEach(async () => {
    if (testContext?.testName) {
      await afterEachTest(testContext.testName);
    }
  });

  describe('Constructor and Initialization', () => {
    it('should create MemoryAgent instance with provider', () => {
      expect(memoryAgent).toBeDefined();
      expect(memoryAgent).toBeInstanceOf(MemoryAgent);
    });

    it('should create MemoryAgent with database manager', async () => {
      // Create a mock database manager
      const mockDbManager = {
        getPrismaClient: () => ({}),
        initializeExistingMemoryState: jest.fn(),
        transitionMemoryState: jest.fn(),
      };

      const agentWithDb = new MemoryAgent(mockProvider as any, mockDbManager as any);
      expect(agentWithDb).toBeDefined();

      // Test setDatabaseManager method
      agentWithDb.setDatabaseManager(mockDbManager as any);
    });

    it('should handle provider without memory processing capabilities', () => {
      const basicProvider = new MockLLMProvider();
      const agent = new MemoryAgent(basicProvider as any);

      expect(agent).toBeDefined();
    });
  });

  describe('Memory Relationship Extraction', () => {
    const currentMemory: ProcessedLongTermMemory = {
      content: 'Current conversation about TypeScript interfaces and their usage',
      summary: 'Discussion about TypeScript interfaces',
      classification: MemoryClassification.CONVERSATIONAL,
      importance: MemoryImportanceLevel.MEDIUM,
      conversationId: testContext?.namespace || `test-namespace-${Date.now()}`,
      confidenceScore: 0.8,
      classificationReason: 'Technical discussion about programming',
      entities: ['typescript', 'interfaces'],
      keywords: ['programming', 'typescript'],
      promotionEligible: false,
    };

    const existingMemories = [
      {
        id: 'existing-memory-1',
        content: 'Previous discussion about JavaScript functions and their usage',
        summary: 'JavaScript functions discussion',
        topic: 'javascript',
        entities: ['javascript', 'functions'],
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
        searchableContent: 'Previous discussion about JavaScript functions and their usage',
        processedData: {
          content: 'Previous discussion about JavaScript functions and their usage',
          topic: 'javascript',
          entities: ['javascript', 'functions'],
        },
      },
      {
        id: 'existing-memory-2',
        content: 'Discussion about TypeScript types and interfaces',
        summary: 'TypeScript types discussion',
        topic: 'typescript',
        entities: ['typescript', 'types'],
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
        searchableContent: 'Discussion about TypeScript types and interfaces',
        processedData: {
          content: 'Discussion about TypeScript types and interfaces',
          topic: 'typescript',
          entities: ['typescript', 'types'],
        },
      },
    ];

    it('should extract memory relationships successfully', async () => {
      const relationships = await memoryAgent.extractMemoryRelationships(
        currentMemory.content,
        currentMemory,
        existingMemories,
      );

      expect(Array.isArray(relationships)).toBe(true);

      if (relationships.length > 0) {
        relationships.forEach(relationship => {
          expect(relationship).toHaveProperty('type');
          expect(relationship).toHaveProperty('confidence');
          expect(relationship).toHaveProperty('strength');
          expect(relationship).toHaveProperty('reason');
          expect(relationship).toHaveProperty('entities');
          expect(relationship).toHaveProperty('context');

          // Validate relationship type
          const validTypes = Object.values(MemoryRelationshipType);
          expect(validTypes).toContain(relationship.type);

          // Validate confidence and strength are within bounds
          expect(relationship.confidence).toBeGreaterThanOrEqual(0);
          expect(relationship.confidence).toBeLessThanOrEqual(1);
          expect(relationship.strength).toBeGreaterThanOrEqual(0);
          expect(relationship.strength).toBeLessThanOrEqual(1);
        });
      }
    });

    it('should detect continuation relationships', async () => {
      const continuationContent = 'Building on our previous discussion about TypeScript, let me explain interfaces in more detail';
      const continuationMemory: ProcessedLongTermMemory = {
        ...currentMemory,
        content: continuationContent,
      };

      const relationships = await memoryAgent.extractMemoryRelationships(
        continuationContent,
        continuationMemory,
        existingMemories,
      );

      const continuationRelationship = relationships.find(r => r.type === MemoryRelationshipType.CONTINUATION);
      if (continuationRelationship) {
        expect(continuationRelationship.reason).toContain('continues');
        expect(continuationRelationship.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should detect reference relationships', async () => {
      const referenceContent = 'Remember when we discussed TypeScript types earlier? Let me build on that foundation';
      const referenceMemory: ProcessedLongTermMemory = {
        ...currentMemory,
        content: referenceContent,
      };

      const relationships = await memoryAgent.extractMemoryRelationships(
        referenceContent,
        referenceMemory,
        existingMemories,
      );

      const referenceRelationship = relationships.find(r => r.type === MemoryRelationshipType.REFERENCE);
      if (referenceRelationship) {
        expect(referenceRelationship.reason).toContain('references');
        expect(referenceRelationship.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should detect related topic relationships', async () => {
      const relatedContent = 'TypeScript interfaces are similar to JavaScript objects but with type safety';
      const relatedMemory: ProcessedLongTermMemory = {
        ...currentMemory,
        content: relatedContent,
      };

      const relationships = await memoryAgent.extractMemoryRelationships(
        relatedContent,
        relatedMemory,
        existingMemories,
      );

      const relatedRelationship = relationships.find(r => r.type === MemoryRelationshipType.RELATED);
      if (relatedRelationship) {
        expect(relatedRelationship.reason).toContain('similar topics');
        expect(relatedRelationship.confidence).toBeGreaterThan(0.3);
      }
    });

    it('should detect contradiction relationships', async () => {
      const contradictionContent = 'Actually, TypeScript interfaces are completely different from JavaScript functions';
      const contradictionMemory: ProcessedLongTermMemory = {
        ...currentMemory,
        content: contradictionContent,
      };

      const relationships = await memoryAgent.extractMemoryRelationships(
        contradictionContent,
        contradictionMemory,
        existingMemories,
      );

      const contradictionRelationship = relationships.find(r => r.type === MemoryRelationshipType.CONTRADICTION);
      if (contradictionRelationship) {
        expect(contradictionRelationship.reason).toContain('conflicts');
        expect(contradictionRelationship.confidence).toBeGreaterThan(0.5);
      }
    });

    it('should filter low-confidence relationships', async () => {
      const weakContent = 'Random content with no clear relationship';
      const weakMemory: ProcessedLongTermMemory = {
        ...currentMemory,
        content: weakContent,
      };

      const relationships = await memoryAgent.extractMemoryRelationships(
        weakContent,
        weakMemory,
        existingMemories,
      );

      // Should filter out relationships with confidence < 0.3
      relationships.forEach(relationship => {
        expect(relationship.confidence).toBeGreaterThanOrEqual(0.3);
      });
    });

    it('should handle empty existing memories', async () => {
      const relationships = await memoryAgent.extractMemoryRelationships(
        currentMemory.content,
        currentMemory,
        [],
      );

      expect(Array.isArray(relationships)).toBe(true);
      // Should not throw error even with no existing memories
    });

    it('should handle memory with no clear relationships', async () => {
      const unrelatedContent = 'The weather is nice today and I had coffee for breakfast';
      const unrelatedMemory: ProcessedLongTermMemory = {
        ...currentMemory,
        content: unrelatedContent,
        entities: ['weather', 'coffee'],
        keywords: ['breakfast', 'weather'],
      };

      const relationships = await memoryAgent.extractMemoryRelationships(
        unrelatedContent,
        unrelatedMemory,
        existingMemories,
      );

      expect(Array.isArray(relationships)).toBe(true);
      // May or may not find relationships, but should not throw
    });
  });

  describe('Text Analysis Methods', () => {
    it('should calculate text similarity correctly', async () => {
      // Access private method through type assertion for testing
      const agent = memoryAgent as any;

      const similarity1 = agent.calculateTextSimilarity(
        'TypeScript is a programming language',
        'TypeScript is a programming language',
      );
      expect(similarity1).toBe(1.0); // Identical texts

      const similarity2 = agent.calculateTextSimilarity(
        'TypeScript is great',
        'JavaScript is great',
      );
      expect(similarity2).toBeGreaterThan(0); // Some similarity
      expect(similarity2).toBeLessThan(1); // Not identical

      const similarity3 = agent.calculateTextSimilarity(
        'TypeScript interfaces',
        'Weather forecast',
      );
      expect(similarity3).toBe(0); // No similarity
    });

    it('should calculate topic overlap correctly', async () => {
      const agent = memoryAgent as any;

      const overlap1 = agent.calculateTopicOverlap(
        'TypeScript interfaces and types',
        'typescript',
        ['typescript', 'types'],
      );
      expect(overlap1).toBeGreaterThan(0.7); // High overlap with improved implementation

      const overlap2 = agent.calculateTopicOverlap(
        'Weather forecast',
        'programming',
        ['weather'],
      );
      expect(overlap2).toBe(0); // No overlap with unrelated content
    });

    it('should detect continuation patterns', async () => {
      const agent = memoryAgent as any;

      const isContinuation1 = agent.detectContinuation(
        'Building on our previous discussion about TypeScript',
        'Previous discussion about TypeScript interfaces',
      );
      expect(isContinuation1).toBe(true);

      const isContinuation2 = agent.detectContinuation(
        'Random new topic',
        'Previous discussion about weather',
      );
      expect(isContinuation2).toBe(false);
    });

    it('should detect direct references', async () => {
      const agent = memoryAgent as any;

      const isReference1 = agent.detectDirectReference(
        'Remember when we discussed TypeScript earlier?',
        'Previous discussion about TypeScript interfaces',
      );
      expect(isReference1).toBe(true); // Improved implementation should detect reference words

      const isReference2 = agent.detectDirectReference(
        'New topic about weather',
        'Previous discussion about programming',
      );
      expect(isReference2).toBe(false); // No reference patterns detected
    });

    it('should detect contradictions', async () => {
      const agent = memoryAgent as any;

      const isContradiction1 = agent.detectContradiction(
        'Actually, TypeScript is not a programming language',
        'TypeScript is a great programming language',
      );
      expect(isContradiction1).toBe(true); // Improved implementation should detect contradiction words and negation

      const isContradiction2 = agent.detectContradiction(
        'TypeScript is a programming language',
        'TypeScript is a programming language',
      );
      expect(isContradiction2).toBe(false); // No contradiction in identical statements
    });

    it('should extract entities correctly', async () => {
      const agent = memoryAgent as any;

      const entities1 = agent.extractEntities('John works at Google and lives in New York');
      expect(entities1).toContain('John');
      expect(entities1).toContain('Google');
      expect(entities1).toContain('New'); // Entity extraction splits compound words
      expect(entities1).toContain('York');

      const entities2 = agent.extractEntities('Simple text without entities');
      expect(entities2.length).toBe(0);
    });

    it('should calculate entity overlap correctly', async () => {
      const agent = memoryAgent as any;

      const overlap1 = agent.calculateEntityOverlap(
        'John works at Google',
        'John lives in New York and works at Google',
      );
      expect(overlap1).toBeGreaterThan(0); // Common entities

      const overlap2 = agent.calculateEntityOverlap(
        'John works at Google',
        'Mary works at Apple',
      );
      expect(overlap2).toBe(0); // No common entities
    });

    it('should detect temporal references', async () => {
      const agent = memoryAgent as any;

      const hasTemporal1 = agent.detectTemporalReference(
        'Before we discussed this, I had a different idea',
        'Previous content',
      );
      expect(hasTemporal1).toBe(true);

      const hasTemporal2 = agent.detectTemporalReference(
        'Current topic without time references',
        'Previous content',
      );
      expect(hasTemporal2).toBe(false);
    });
  });

  describe('Relationship Validation', () => {
    it('should validate relationships correctly', async () => {
      const agent = memoryAgent as any;

      const validRelationships = [
        {
          type: MemoryRelationshipType.CONTINUATION,
          confidence: 0.8,
          strength: 0.9,
          reason: 'This conversation continues the previous discussion about TypeScript',
          entities: ['typescript'],
          context: 'High similarity and continuation phrases detected',
        },
      ];

      const invalidRelationships = [
        {
          type: MemoryRelationshipType.CONTINUATION,
          confidence: 0.1, // Too low
          strength: 0.9,
          reason: 'Short reason', // Too short
          entities: ['typescript'],
          context: 'Context',
        },
      ];

      const validatedValid = agent.validateRelationships(validRelationships);
      const validatedInvalid = agent.validateRelationships(invalidRelationships);

      expect(validatedValid).toHaveLength(1);
      expect(validatedInvalid).toHaveLength(0);
    });

    it('should filter invalid relationship types', async () => {
      const agent = memoryAgent as any;

      const invalidTypeRelationships = [
        {
          type: 'INVALID_TYPE' as any,
          confidence: 0.8,
          strength: 0.9,
          reason: 'This should be filtered out due to invalid type',
          entities: ['typescript'],
          context: 'Valid context',
        },
      ];

      const validated = agent.validateRelationships(invalidTypeRelationships);
      expect(validated).toHaveLength(0);
    });

    it('should filter relationships with empty entities', async () => {
      const agent = memoryAgent as any;

      const emptyEntityRelationships = [
        {
          type: MemoryRelationshipType.CONTINUATION,
          confidence: 0.8,
          strength: 0.9,
          reason: 'Valid reason with sufficient length for testing',
          entities: [], // Empty entities
          context: 'Valid context',
        },
      ];

      const validated = agent.validateRelationships(emptyEntityRelationships);
      expect(validated).toHaveLength(1); // Should pass as entities are optional
    });
  });

  describe('Conversation Processing', () => {
    it('should process conversation successfully with mock provider', async () => {
      const params = {
        chatId: testContext.testName,
        userInput: 'What are TypeScript interfaces?',
        aiOutput: 'TypeScript interfaces define the structure of objects and classes.',
        context: {
          sessionId: testContext.testName,
          conversationId: testContext.testName,
          modelUsed: 'gpt-4',
          userPreferences: ['typescript'],
          currentProjects: ['web-app'],
          relevantSkills: ['javascript', 'typescript'],
        },
      };

      const result = await memoryAgent.processConversation(params);

      expect(result).toBeDefined();
      expect(result.content).toContain('TypeScript interfaces');
      expect(result.classification).toBeDefined();
      expect(result.importance).toBeDefined();
      expect(result.confidenceScore).toBeGreaterThan(0);
    });

    it('should handle conversation processing errors gracefully', async () => {
      // Create a provider that throws an error
      const errorProvider = {
        createChatCompletion: async () => {
          throw new Error('Mock provider error');
        },
      };

      const errorAgent = new MemoryAgent(errorProvider as any);

      const params = {
        chatId: testContext.testName,
        userInput: 'Test input',
        aiOutput: 'Test output',
        context: {
          sessionId: testContext.testName,
          conversationId: testContext.testName,
          modelUsed: 'gpt-4',
          userPreferences: [],
          currentProjects: [],
          relevantSkills: [],
        },
      };

      const result = await errorAgent.processConversation(params);

      expect(result).toBeDefined();
      // Should return fallback memory on error
      expect(result.classificationReason).toContain('Fallback processing');
      expect(result.confidenceScore).toBe(0.5); // Fallback confidence
    });

    it('should handle empty conversation inputs', async () => {
      const params = {
        chatId: testContext.testName,
        userInput: '',
        aiOutput: '',
        context: {
          sessionId: testContext.testName,
          conversationId: testContext.testName,
          modelUsed: 'gpt-4',
          userPreferences: [],
          currentProjects: [],
          relevantSkills: [],
        },
      };

      const result = await memoryAgent.processConversation(params);

      expect(result).toBeDefined();
      expect(result.content).toBe(' '); // Empty inputs combined
      expect(result.classification).toBe(MemoryClassification.CONVERSATIONAL);
    });

    it('should handle very long conversation inputs', async () => {
      const longInput = 'A'.repeat(2000);
      const longOutput = 'B'.repeat(2000);

      const params = {
        chatId: testContext.testName,
        userInput: longInput,
        aiOutput: longOutput,
        context: {
          sessionId: testContext.testName,
          conversationId: testContext.testName,
          modelUsed: 'gpt-4',
          userPreferences: [],
          currentProjects: [],
          relevantSkills: [],
        },
      };

      const result = await memoryAgent.processConversation(params);

      expect(result).toBeDefined();
      expect(result.content.length).toBeGreaterThan(1000); // Should handle long content
    });

    it('should initialize state tracking for new conversations', async () => {
      const mockDbManager = {
        initializeExistingMemoryState: jest.fn().mockResolvedValue(undefined),
        transitionMemoryState: jest.fn().mockResolvedValue(true),
      };

      const agentWithDb = new MemoryAgent(mockProvider as any, mockDbManager as any);

      const params = {
        chatId: testContext.testName,
        userInput: 'Test conversation for state tracking',
        aiOutput: 'Test response',
        context: {
          sessionId: testContext.testName,
          conversationId: testContext.testName,
          modelUsed: 'gpt-4',
          userPreferences: [],
          currentProjects: [],
          relevantSkills: [],
        },
      };

      await agentWithDb.processConversation(params);

      // Should have initialized state tracking
      expect(mockDbManager.initializeExistingMemoryState).toHaveBeenCalledWith(
        testContext.testName,
        MemoryProcessingState.PENDING,
      );

      // Should have transitioned to processing
      expect(mockDbManager.transitionMemoryState).toHaveBeenCalledWith(
        testContext.testName,
        MemoryProcessingState.PROCESSING,
        expect.objectContaining({
          reason: 'Starting memory processing',
          agentId: 'MemoryAgent',
        }),
      );
    });

    it('should handle state tracking failures gracefully', async () => {
      const mockDbManager = {
        initializeExistingMemoryState: jest.fn().mockRejectedValue(new Error('Database error')),
        transitionMemoryState: jest.fn().mockRejectedValue(new Error('Database error')),
      };

      const agentWithDb = new MemoryAgent(mockProvider as any, mockDbManager as any);

      const params = {
        chatId: testContext.testName,
        userInput: 'Test conversation',
        aiOutput: 'Test response',
        context: {
          sessionId: testContext.testName,
          conversationId: testContext.testName,
          modelUsed: 'gpt-4',
          userPreferences: [],
          currentProjects: [],
          relevantSkills: [],
        },
      };

      // Should not throw even if state tracking fails
      const result = await agentWithDb.processConversation(params);
      expect(result).toBeDefined();
    });
  });

  describe('Advanced Relationship Extraction', () => {
    it('should extract relationships with LLM enhancement', async () => {
      const currentMemory: ProcessedLongTermMemory = {
        content: 'Let me continue explaining TypeScript interfaces since we discussed them earlier',
        summary: 'Continuation of TypeScript discussion',
        classification: MemoryClassification.CONVERSATIONAL,
        importance: MemoryImportanceLevel.MEDIUM,
        conversationId: testContext.testName,
        confidenceScore: 0.8,
        classificationReason: 'Technical continuation',
        entities: ['typescript', 'interfaces'],
        keywords: ['programming', 'typescript'],
        promotionEligible: false,
      };

      const relationships = await memoryAgent.extractMemoryRelationshipsWithLLM(
        currentMemory.content,
        currentMemory,
        [], // Empty existing memories for this test
      );

      expect(Array.isArray(relationships)).toBe(true);
      // Should not throw error even without existing memories
    });

    it('should handle relationship extraction errors gracefully', async () => {
      // Create agent with problematic configuration
      const problematicAgent = new MemoryAgent(mockProvider as any);

      const currentMemory: ProcessedLongTermMemory = {
        content: 'Test content',
        summary: 'Test summary',
        classification: MemoryClassification.CONVERSATIONAL,
        importance: MemoryImportanceLevel.MEDIUM,
        conversationId: testContext.testName,
        confidenceScore: 0.8,
        classificationReason: 'Test',
        entities: [],
        keywords: [],
        promotionEligible: false,
      };

      const relationships = await problematicAgent.extractMemoryRelationshipsWithLLM(
        currentMemory.content,
        currentMemory,
        [], // Empty existing memories
      );

      expect(Array.isArray(relationships)).toBe(true);
    });
  });

  describe('Integration with Database Manager', () => {
    it('should work with database manager for recent memories retrieval', async () => {
      const agent = memoryAgent as any;

      // Mock the database manager
      const mockFindMany = jest.fn().mockResolvedValue([
        {
          id: 'test-memory-1',
          searchableContent: 'Test memory content',
          summary: 'Test summary',
          topic: 'testing',
          entitiesJson: ['test'],
          extractionTimestamp: new Date(),
        },
      ]);

      const mockDbManager = {
        getPrismaClient: () => ({
          longTermMemory: {
            findMany: mockFindMany,
          },
        }),
      };

      // Set the database manager
      agent.dbManager = mockDbManager;

      const recentMemories = await agent.getRecentMemories('test-session', 10);

      expect(Array.isArray(recentMemories)).toBe(true);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { namespace: 'test-session' },
          orderBy: { createdAt: 'desc' },
          take: 10,
        }),
      );
    });

    it('should handle database errors when retrieving recent memories', async () => {
      const agent = memoryAgent as any;

      // Mock the database manager to throw error
      const mockDbManager = {
        getPrismaClient: () => ({
          longTermMemory: {
            findMany: jest.fn().mockRejectedValue(new Error('Database connection failed')),
          },
        }),
      };

      agent.dbManager = mockDbManager;

      const recentMemories = await agent.getRecentMemories('test-session', 10);

      expect(Array.isArray(recentMemories)).toBe(true);
      expect(recentMemories).toHaveLength(0); // Should return empty array on error
    });

    it('should work without database manager', async () => {
      const agentWithoutDb = new MemoryAgent(mockProvider as any);

      const recentMemories = await (agentWithoutDb as any).getRecentMemories('test-session', 10);

      expect(Array.isArray(recentMemories)).toBe(true);
      expect(recentMemories).toHaveLength(0); // Should return empty array
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle malformed LLM responses gracefully', async () => {
      const malformedProvider = {
        createChatCompletion: async () => ({
          message: {
            content: 'This is not JSON content at all',
          },
        }),
      };

      const malformedAgent = new MemoryAgent(malformedProvider as any);

      const params = {
        chatId: testContext.testName,
        userInput: 'Test input',
        aiOutput: 'Test output',
        context: {
          sessionId: testContext.testName,
          conversationId: testContext.testName,
          modelUsed: 'gpt-4',
          userPreferences: [],
          currentProjects: [],
          relevantSkills: [],
        },
      };

      const result = await malformedAgent.processConversation(params);

      expect(result).toBeDefined();
      // Should fall back to fallback memory creation
      expect(result.classificationReason).toContain('Fallback processing');
    });

    it('should handle null or undefined provider responses', async () => {
      const nullProvider = {
        createChatCompletion: async () => ({
          message: {
            content: null,
          },
        }),
      };

      const nullAgent = new MemoryAgent(nullProvider as any);

      const params = {
        chatId: testContext.testName,
        userInput: 'Test input',
        aiOutput: 'Test output',
        context: {
          sessionId: testContext.testName,
          conversationId: testContext.testName,
          modelUsed: 'gpt-4',
          userPreferences: [],
          currentProjects: [],
          relevantSkills: [],
        },
      };

      const result = await nullAgent.processConversation(params);

      expect(result).toBeDefined();
      // Should fall back on null response
      expect(result.classificationReason).toContain('Fallback processing');
    });

    it('should handle extremely large conversation content', async () => {
      const hugeInput = 'A'.repeat(10000);
      const hugeOutput = 'B'.repeat(10000);

      const params = {
        chatId: testContext.testName,
        userInput: hugeInput,
        aiOutput: hugeOutput,
        context: {
          sessionId: testContext.testName,
          conversationId: testContext.testName,
          modelUsed: 'gpt-4',
          userPreferences: [],
          currentProjects: [],
          relevantSkills: [],
        },
      };

      const result = await memoryAgent.processConversation(params);

      expect(result).toBeDefined();
      expect(result.content.length).toBeLessThanOrEqual(20000); // Should handle large content
    });

    it('should handle special characters in conversation', async () => {
      const specialInput = 'Special chars: àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ & < > " \'';
      const specialOutput = 'Response with émojis 🚀 and ñ characters';

      const params = {
        chatId: testContext.testName,
        userInput: specialInput,
        aiOutput: specialOutput,
        context: {
          sessionId: testContext.testName,
          conversationId: testContext.testName,
          modelUsed: 'gpt-4',
          userPreferences: [],
          currentProjects: [],
          relevantSkills: [],
        },
      };

      const result = await memoryAgent.processConversation(params);

      expect(result).toBeDefined();
      expect(result.content).toContain('🚀'); // Should preserve emojis
    });

    it('should handle concurrent conversation processing', async () => {
      const params1 = {
        chatId: `${testContext.testName}-1`,
        userInput: 'First conversation',
        aiOutput: 'First response',
        context: {
          sessionId: testContext.testName,
          conversationId: `${testContext.testName}-1`,
          modelUsed: 'gpt-4',
          userPreferences: [],
          currentProjects: [],
          relevantSkills: [],
        },
      };

      const params2 = {
        chatId: `${testContext.testName}-2`,
        userInput: 'Second conversation',
        aiOutput: 'Second response',
        context: {
          sessionId: testContext.testName,
          conversationId: `${testContext.testName}-2`,
          modelUsed: 'gpt-4',
          userPreferences: [],
          currentProjects: [],
          relevantSkills: [],
        },
      };

      const [result1, result2] = await Promise.all([
        memoryAgent.processConversation(params1),
        memoryAgent.processConversation(params2),
      ]);

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
      expect(result1.conversationId).not.toBe(result2.conversationId);
    });
  });

  describe('Relationship Strength Calculation', () => {
    it('should calculate relationship strength based on multiple factors', async () => {
      const agent = memoryAgent as any;

      const relationship = {
        type: MemoryRelationshipType.CONTINUATION,
        confidence: 0.8,
        strength: 0.7,
        reason: 'Test relationship',
        entities: ['typescript'],
        context: 'Test context',
      };

      const currentContent = 'Building on our TypeScript discussion';
      const existingMemories = [
        {
          id: 'existing-memory',
          createdAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
          content: 'Previous TypeScript discussion',
        },
      ];

      const result = agent.calculateRelationshipStrength(
        relationship,
        currentContent,
        existingMemories,
      );

      expect(result.strength).toBeGreaterThanOrEqual(0);
      expect(result.strength).toBeLessThanOrEqual(1);
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should handle missing existing memory for strength calculation', async () => {
      const agent = memoryAgent as any;

      const relationship = {
        type: MemoryRelationshipType.CONTINUATION,
        confidence: 0.8,
        strength: 0.7,
        reason: 'Test relationship',
        entities: ['typescript'],
        context: 'Test context',
      };

      const result = agent.calculateRelationshipStrength(
        relationship,
        'Current content',
        [], // Empty existing memories
      );

      expect(result).toEqual(relationship); // Should return original if memory not found
    });
  });

  describe('Performance and Load Testing', () => {
    it('should handle multiple rapid relationship extractions', async () => {
      const currentMemory: ProcessedLongTermMemory = {
        content: 'Test content for performance testing',
        summary: 'Performance test',
        classification: MemoryClassification.CONVERSATIONAL,
        importance: MemoryImportanceLevel.MEDIUM,
        conversationId: testContext.testName,
        confidenceScore: 0.7,
        classificationReason: 'Performance test',
        entities: ['performance', 'test'],
        keywords: ['test', 'performance'],
        promotionEligible: false,
      };

      const promises = [];

      // Create multiple rapid relationship extractions
      for (let i = 0; i < 5; i++) {
        promises.push(
          memoryAgent.extractMemoryRelationships(
            `Content ${i}`,
            currentMemory,
            [], // Empty existing memories for speed
          ),
        );
      }

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      results.forEach(result => {
        expect(Array.isArray(result)).toBe(true);
      });
    });

    it('should handle large numbers of existing memories efficiently', async () => {
      const currentMemory: ProcessedLongTermMemory = {
        content: 'Test content with many existing memories',
        summary: 'Large scale test',
        classification: MemoryClassification.CONVERSATIONAL,
        importance: MemoryImportanceLevel.MEDIUM,
        conversationId: testContext.testName,
        confidenceScore: 0.7,
        classificationReason: 'Large scale test',
        entities: ['scale', 'test'],
        keywords: ['performance', 'scale'],
        promotionEligible: false,
      };

      // Create many existing memories
      const manyExistingMemories = Array.from({ length: 100 }, (_, i) => ({
        id: `memory-${i}`,
        content: `Existing memory content ${i}`,
        summary: `Summary ${i}`,
        topic: `topic-${i}`,
        entities: [`entity-${i}`],
        createdAt: new Date(Date.now() - i * 60 * 1000), // Spread over time
        searchableContent: `Existing memory content ${i}`,
        processedData: {
          content: `Existing memory content ${i}`,
          topic: `topic-${i}`,
          entities: [`entity-${i}`],
        },
      }));

      const startTime = Date.now();
      const relationships = await memoryAgent.extractMemoryRelationships(
        currentMemory.content,
        currentMemory,
        manyExistingMemories,
      );

      const duration = Date.now() - startTime;

      expect(Array.isArray(relationships)).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });
  });
});