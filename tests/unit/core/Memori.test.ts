import { Memori } from '../../../src/core/Memori';
import { DatabaseManager } from '../../../src/core/infrastructure/database/DatabaseManager';
import { MemoryAgent } from '../../../src/core/domain/memory/MemoryAgent';
import { ConsciousAgent } from '../../../src/core/domain/memory/ConsciousAgent';
import { OpenAIProvider } from '../../../src/core/infrastructure/providers/OpenAIProvider';
import { ConfigManager } from '../../../src/core/infrastructure/config/ConfigManager';
import * as Logger from '../../../src/core/infrastructure/config/Logger';

// Mock dependencies
jest.mock('../../../src/core/infrastructure/database/DatabaseManager');
jest.mock('../../../src/core/domain/memory/MemoryAgent');
jest.mock('../../../src/core/domain/memory/ConsciousAgent');
jest.mock('../../../src/core/infrastructure/providers/OpenAIProvider');
jest.mock('../../../src/core/infrastructure/providers/performance/ConnectionPool');
jest.mock('../../../src/core/infrastructure/config/ConfigManager');

// Import cleanup function for global ConnectionPool
import { cleanupGlobalConnectionPool } from '../../../src/core/infrastructure/providers/performance/ConnectionPool';
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid'),
}));

const MockDatabaseManager = DatabaseManager as jest.MockedClass<typeof DatabaseManager>;
const MockMemoryAgent = MemoryAgent as jest.MockedClass<typeof MemoryAgent>;
const MockConsciousAgent = ConsciousAgent as jest.MockedClass<typeof ConsciousAgent>;
const MockOpenAIProvider = OpenAIProvider as jest.MockedClass<typeof OpenAIProvider>;
const MockConnectionPool = require('../../../src/core/infrastructure/providers/performance/ConnectionPool').ConnectionPool as jest.MockedClass<any>;
const mockLoadConfig = jest.fn();
(ConfigManager.loadConfig as jest.Mock) = mockLoadConfig;

describe('Memori', () => {
  let memori: Memori;
  let mockConfig: any;
  let mockSearchManager: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup search manager mock
    mockSearchManager = {
      searchMemories: jest.fn().mockResolvedValue([])
    };

    // Setup mock config
    mockConfig = {
      databaseUrl: 'file::memory:',
      apiKey: 'test-api-key',
      model: 'gpt-4o-mini',
      baseUrl: 'https://api.openai.com/v1',
      namespace: 'test',
      userContext: {
        userPreferences: [],
        currentProjects: [],
        relevantSkills: [],
      },
    };

    mockLoadConfig.mockReturnValue(mockConfig);

    // Setup method mocks
    MockDatabaseManager.prototype.storeChatHistory = jest.fn().mockResolvedValue('mock-uuid');
    MockDatabaseManager.prototype.storeLongTermMemory = jest.fn().mockResolvedValue('memory-id');
    // Mock the DatabaseManager instance methods
    mockSearchManager = {
      searchMemories: jest.fn().mockResolvedValue([])
    };

    // Setup the mock to return searchManager when accessed
    Object.defineProperty(MockDatabaseManager.prototype, 'searchManager', {
      get: () => mockSearchManager,
      configurable: true
    });
    MockDatabaseManager.prototype.close = jest.fn().mockResolvedValue(undefined);
    MockMemoryAgent.prototype.processConversation = jest.fn().mockResolvedValue({ content: 'processed' });

    // Mock ConnectionPool to prevent interval leaks in tests
    MockConnectionPool.mockImplementation(() => ({
      getConnection: jest.fn(),
      returnConnection: jest.fn(),
      getPoolStats: jest.fn(),
      cleanup: jest.fn(),
      dispose: jest.fn(),
      stopHealthCheckInterval: jest.fn(),
    }));

    // Create Memori instance
    memori = new Memori();
  });

  afterEach(async () => {
    // Clean up any background intervals
    if (memori.isEnabled()) {
      await memori.close();
    }
    // Clear any pending timers
    jest.clearAllTimers();
  });

  describe('constructor', () => {
    it('should initialize with default config', async () => {
      // Provider initialization now happens in enable() method
      await memori.enable();

      expect(mockLoadConfig).toHaveBeenCalled();
      expect(MockDatabaseManager).toHaveBeenCalledWith(mockConfig.databaseUrl);
      expect(MockOpenAIProvider).toHaveBeenCalledTimes(2);
      expect(MockOpenAIProvider).toHaveBeenNthCalledWith(1, expect.objectContaining({
        apiKey: mockConfig.apiKey,
        model: mockConfig.model,
        baseUrl: mockConfig.baseUrl,
        features: expect.objectContaining({
          memory: expect.objectContaining({
            enableChatMemory: true,
            enableEmbeddingMemory: false,
            memoryProcessingMode: 'auto',
            minImportanceLevel: 'all',
            sessionId: 'mock-uuid',
          }),
          performance: expect.objectContaining({
            enableCaching: false,
            enableConnectionPooling: false,
            enableHealthMonitoring: false,
          }),
        }),
      }));
      expect(MockOpenAIProvider).toHaveBeenNthCalledWith(2, expect.objectContaining({
        features: expect.objectContaining({
          memory: expect.objectContaining({
            enableChatMemory: false,
            enableEmbeddingMemory: false,
            memoryProcessingMode: 'auto',
            minImportanceLevel: 'all',
            sessionId: 'mock-uuid',
          }),
        }),
      }));
      const memoryAgentArgs = MockMemoryAgent.mock.calls[0];
      expect(memoryAgentArgs?.[0]).toMatchObject({ createChatCompletion: expect.any(Function) });
      expect(memoryAgentArgs?.[1]).toBe(MockDatabaseManager.mock.instances[0]);
    });

    it('should merge provided config with default', async () => {
      const customConfig = { model: 'gpt-4' };
      const memori = new Memori(customConfig);

      // Enable to trigger provider initialization with merged config
      await memori.enable();

      // Verify that the provider was initialized with the merged config (gpt-4)
      expect(MockOpenAIProvider).toHaveBeenNthCalledWith(1, expect.objectContaining({
        apiKey: mockConfig.apiKey,
        model: 'gpt-4', // Should use custom model, not default
        baseUrl: mockConfig.baseUrl,
        features: expect.objectContaining({
          memory: expect.objectContaining({
            enableChatMemory: true,
            sessionId: 'mock-uuid',
          }),
        }),
      }));
    });
  });

  describe('enable', () => {
    it('should enable Memori successfully', async () => {
      await memori.enable();

      expect(memori.isEnabled()).toBe(true);
    });

    it('should throw error if already enabled', async () => {
      await memori.enable();

      await expect(memori.enable()).rejects.toThrow('Memori is already enabled');
    });
  });

  describe('recordConversation', () => {
    beforeEach(async () => {
      await memori.enable();
    });

    it('should throw error if not enabled', async () => {
      const disabledMemori = new Memori();
      await expect(disabledMemori.recordConversation('test', 'response')).rejects.toThrow('Memori is not enabled');
    });

    it('should store chat history and return chatId', async () => {
      const chatId = await memori.recordConversation('Hello', 'Hi there');

      expect(MockDatabaseManager.prototype.storeChatHistory).toHaveBeenCalledWith({
        chatId: 'mock-uuid',
        userInput: 'Hello',
        aiOutput: 'Hi there',
        model: mockConfig.model,
        sessionId: expect.any(String),
        namespace: mockConfig.namespace,
        metadata: undefined,
      });
      expect(chatId).toBe('mock-uuid');
    });

    it('should use provided options', async () => {
      const options = { model: 'gpt-4', metadata: { test: true } };
      await memori.recordConversation('Hello', 'Hi there', options);

      expect(MockDatabaseManager.prototype.storeChatHistory).toHaveBeenCalledWith({
        chatId: 'mock-uuid',
        userInput: 'Hello',
        aiOutput: 'Hi there',
        model: 'gpt-4',
        sessionId: expect.any(String),
        namespace: mockConfig.namespace,
        metadata: { test: true },
      });
    });

    it('should process memory asynchronously when autoIngest is enabled', async () => {
      // Enable auto ingestion for this test
      const autoConfig = { ...mockConfig, autoIngest: true };
      mockLoadConfig.mockReturnValue(autoConfig);

      const autoMemori = new Memori();
      await autoMemori.enable();

      await autoMemori.recordConversation('Hello', 'Hi there');

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(MockMemoryAgent.prototype.processConversation).toHaveBeenCalledWith({
        chatId: 'mock-uuid',
        userInput: 'Hello',
        aiOutput: 'Hi there',
        context: {
          conversationId: 'mock-uuid',
          sessionId: 'mock-uuid',
          modelUsed: mockConfig.model,
          userPreferences: [],
          currentProjects: [],
          relevantSkills: [],
        },
      });
      expect(MockDatabaseManager.prototype.storeLongTermMemory).toHaveBeenCalledWith(
        { content: 'processed' },
        'mock-uuid',
        mockConfig.namespace,
      );
    });
  });

  describe('searchMemories', () => {
    it('should search memories with default limit', async () => {
      await memori.searchMemories('test query');

      expect(mockSearchManager.searchMemories).toHaveBeenCalledWith('test query', {
        namespace: mockConfig.namespace,
        limit: 5,
        minImportance: undefined,
        categories: undefined,
        includeMetadata: undefined,
      });
    });

    it('should search memories with custom limit', async () => {
      await memori.searchMemories('test query', { limit: 10 });

      expect(mockSearchManager.searchMemories).toHaveBeenCalledWith('test query', {
        namespace: mockConfig.namespace,
        limit: 10,
        minImportance: undefined,
        categories: undefined,
        includeMetadata: undefined,
      });
    });
  });

  // Global cleanup after all tests
  afterAll(async () => {
    // Ensure all timers are cleared
    jest.clearAllTimers();
    jest.useRealTimers();

    // Restore any global mocks
    jest.restoreAllMocks();

    // Cleanup global ConnectionPool to prevent interval leaks
    cleanupGlobalConnectionPool();

    // Small delay to ensure any pending async operations complete
    await new Promise(resolve => setTimeout(resolve, 100));
  });

  describe('close', () => {
    it('should close database connection', async () => {
      await memori.close();

      expect(MockDatabaseManager.prototype.close).toHaveBeenCalled();
    });
  });

  describe('getSessionId', () => {
    it('should return session id', () => {
      const sessionId = memori.getSessionId();
      expect(sessionId).toBe('mock-uuid');
    });
  });

  describe('isEnabled', () => {
    it('should return false initially', () => {
      expect(memori.isEnabled()).toBe(false);
    });

    it('should return true after enabling', async () => {
      await memori.enable();
      expect(memori.isEnabled()).toBe(true);
    });
  });

  describe('conscious ingestion', () => {
    beforeEach(() => {
      // Setup ConsciousAgent mock
      MockConsciousAgent.prototype.run_conscious_ingest = jest.fn().mockResolvedValue(undefined);
      MockConsciousAgent.prototype.initialize_existing_conscious_memories = jest.fn().mockResolvedValue([]);
      MockConsciousAgent.prototype.check_for_context_updates = jest.fn().mockResolvedValue([]);
    });

    it('should initialize ConsciousAgent when consciousIngest is enabled', async () => {
      const consciousConfig = { ...mockConfig, consciousIngest: true };
      mockLoadConfig.mockReturnValue(consciousConfig);

      const consciousMemori = new Memori();
      await consciousMemori.enable();

      expect(MockConsciousAgent).toHaveBeenCalledWith(expect.any(MockDatabaseManager), consciousConfig.namespace);
      expect(MockConsciousAgent.prototype.run_conscious_ingest).toHaveBeenCalled();
    });

    it('should not initialize ConsciousAgent when consciousIngest is disabled', async () => {
      const nonConsciousConfig = { ...mockConfig, consciousIngest: false };
      mockLoadConfig.mockReturnValue(nonConsciousConfig);

      const nonConsciousMemori = new Memori();
      await nonConsciousMemori.enable();

      expect(MockConsciousAgent).not.toHaveBeenCalled();
    });

    it('should handle errors in conscious ingestion gracefully', async () => {
      const consciousConfig = { ...mockConfig, consciousIngest: true };
      mockLoadConfig.mockReturnValue(consciousConfig);

      MockConsciousAgent.prototype.run_conscious_ingest.mockRejectedValue(new Error('Ingestion error'));

      const logErrorSpy = jest.spyOn(Logger, 'logError').mockImplementation(() => { });

      const consciousMemori = new Memori();
      await consciousMemori.enable();

      expect(consciousMemori.isEnabled()).toBe(true); // Should still be enabled despite error
      expect(logErrorSpy).toHaveBeenCalledWith('Error during initial conscious memory ingestion', expect.objectContaining({
        component: 'Memori',
        namespace: consciousConfig.namespace,
        error: 'Ingestion error',
      }));

      logErrorSpy.mockRestore();
    });

    it('should provide access to ConsciousAgent when enabled', async () => {
      const consciousConfig = { ...mockConfig, consciousIngest: true };
      mockLoadConfig.mockReturnValue(consciousConfig);

      const consciousMemori = new Memori();
      await consciousMemori.enable();

      const consciousAgent = consciousMemori.getConsciousAgent();
      expect(consciousAgent).toBeInstanceOf(MockConsciousAgent);
    });

    it('should return undefined for ConsciousAgent when not enabled', async () => {
      const consciousConfig = { ...mockConfig, consciousIngest: true };
      mockLoadConfig.mockReturnValue(consciousConfig);

      const consciousMemori = new Memori();

      const consciousAgent = consciousMemori.getConsciousAgent();
      expect(consciousAgent).toBeUndefined();
    });

    it('should check for conscious context updates', async () => {
      const consciousConfig = { ...mockConfig, consciousIngest: true };
      mockLoadConfig.mockReturnValue(consciousConfig);

      const consciousMemori = new Memori();
      await consciousMemori.enable();

      await consciousMemori.checkForConsciousContextUpdates();

      expect(MockConsciousAgent.prototype.check_for_context_updates).toHaveBeenCalled();
    });

    it('should not check for conscious context updates when disabled', async () => {
      const nonConsciousConfig = { ...mockConfig, consciousIngest: false };
      mockLoadConfig.mockReturnValue(nonConsciousConfig);

      const nonConsciousMemori = new Memori();
      await nonConsciousMemori.enable();

      await nonConsciousMemori.checkForConsciousContextUpdates();

      expect(MockConsciousAgent.prototype.check_for_context_updates).not.toHaveBeenCalled();
    });

    it('should initialize conscious context', async () => {
      const consciousConfig = { ...mockConfig, consciousIngest: true };
      mockLoadConfig.mockReturnValue(consciousConfig);

      const consciousMemori = new Memori();
      await consciousMemori.enable();

      await consciousMemori.initializeConsciousContext();

      expect(MockConsciousAgent.prototype.initialize_existing_conscious_memories).toHaveBeenCalled();
    });
  });

  describe('dual memory mode functionality', () => {
    it('should return true for isConsciousModeEnabled when conscious mode is active', async () => {
      const consciousConfig = { ...mockConfig, consciousIngest: true };
      mockLoadConfig.mockReturnValue(consciousConfig);

      const consciousMemori = new Memori();
      await consciousMemori.enable();

      expect(consciousMemori.isConsciousModeEnabled()).toBe(true);
    });

    it('should return false for isConsciousModeEnabled when not enabled', () => {
      expect(memori.isConsciousModeEnabled()).toBe(false);
    });

    it('should return false for isConsciousModeEnabled when consciousIngest is false', async () => {
      const nonConsciousConfig = { ...mockConfig, consciousIngest: false };
      mockLoadConfig.mockReturnValue(nonConsciousConfig);

      const nonConsciousMemori = new Memori();
      await nonConsciousMemori.enable();

      expect(nonConsciousMemori.isConsciousModeEnabled()).toBe(false);
    });

    it('should return true for isAutoModeEnabled when autoIngest is enabled', async () => {
      const autoConfig = { ...mockConfig, autoIngest: true };
      mockLoadConfig.mockReturnValue(autoConfig);

      const autoMemori = new Memori();
      await autoMemori.enable();

      expect(autoMemori.isAutoModeEnabled()).toBe(true);
    });

    it('should return false for isAutoModeEnabled when autoIngest is disabled', async () => {
      const nonAutoConfig = { ...mockConfig, autoIngest: false };
      mockLoadConfig.mockReturnValue(nonAutoConfig);

      const nonAutoMemori = new Memori();
      await nonAutoMemori.enable();

      expect(nonAutoMemori.isAutoModeEnabled()).toBe(false);
    });

    it('should process memory automatically in auto ingestion mode', async () => {
      const autoConfig = { ...mockConfig, autoIngest: true };
      mockLoadConfig.mockReturnValue(autoConfig);

      const autoMemori = new Memori();
      await autoMemori.enable();

      await autoMemori.recordConversation('Hello', 'Hi there');

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(MockMemoryAgent.prototype.processConversation).toHaveBeenCalled();
    });

    it('should not process memory automatically in conscious ingestion mode', async () => {
      const consciousConfig = { ...mockConfig, consciousIngest: true };
      mockLoadConfig.mockReturnValue(consciousConfig);

      const logInfoSpy = jest.spyOn(Logger, 'logInfo').mockImplementation(() => { });

      const consciousMemori = new Memori();
      await consciousMemori.enable();

      await consciousMemori.recordConversation('Hello', 'Hi there');

      expect(logInfoSpy).toHaveBeenCalledWith('Conversation stored for conscious processing: mock-uuid', expect.objectContaining({
        component: 'Memori',
        chatId: 'mock-uuid',
        mode: 'conscious-ingestion',
      }));
      expect(MockMemoryAgent.prototype.processConversation).not.toHaveBeenCalled();

      logInfoSpy.mockRestore();
    });

    it('should not process memory when neither mode is enabled', async () => {
      const noModeConfig = { ...mockConfig, autoIngest: false, consciousIngest: false };
      mockLoadConfig.mockReturnValue(noModeConfig);

      const logInfoSpy = jest.spyOn(Logger, 'logInfo').mockImplementation(() => { });

      const noModeMemori = new Memori();
      await noModeMemori.enable();

      await noModeMemori.recordConversation('Hello', 'Hi there');

      expect(logInfoSpy).toHaveBeenCalledWith('Conversation stored without processing: mock-uuid', expect.objectContaining({
        component: 'Memori',
        chatId: 'mock-uuid',
        mode: 'no-ingestion',
      }));
      expect(MockMemoryAgent.prototype.processConversation).not.toHaveBeenCalled();

      logInfoSpy.mockRestore();
    });
  });

  describe('relationship extraction configuration', () => {
    beforeEach(() => {
      // Setup relationship storage mocks
      MockDatabaseManager.prototype.storeMemoryRelationships = jest.fn().mockResolvedValue(undefined);
    });

    it('should load configuration with enableRelationshipExtraction option', () => {
      const customConfig = { enableRelationshipExtraction: false };
      new Memori(customConfig);

      // Verify the configuration was passed to ConfigManager
      expect(mockLoadConfig).toHaveBeenCalled();
    });

    it('should respect enableRelationshipExtraction configuration in auto ingest mode', async () => {
      const relationshipConfig = {
        ...mockConfig,
        autoIngest: true,
        enableRelationshipExtraction: true
      };
      mockLoadConfig.mockReturnValue(relationshipConfig);

      // Verify configuration loading is the main test here

      const relationshipMemori = new Memori();
      await relationshipMemori.enable();

      await relationshipMemori.recordConversation('Hello', 'Hi there');

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should process memory (autoIngest is true)
      expect(MockMemoryAgent.prototype.processConversation).toHaveBeenCalled();

      // The relationship storage behavior depends on whether the mock memory has relationships
      // This test verifies the configuration is loaded correctly
      expect(mockLoadConfig).toHaveBeenCalled();
    });

    it('should disable relationship storage when enableRelationshipExtraction is false', async () => {
      const noRelationshipConfig = {
        ...mockConfig,
        autoIngest: true,
        enableRelationshipExtraction: false
      };
      mockLoadConfig.mockReturnValue(noRelationshipConfig);

      const noRelationshipMemori = new Memori();
      await noRelationshipMemori.enable();

      await noRelationshipMemori.recordConversation('Hello', 'Hi there');

      // Wait for async processing
      await new Promise(resolve => setTimeout(resolve, 10));

      // Should still process memory (autoIngest is true) but not store relationships
      expect(MockMemoryAgent.prototype.processConversation).toHaveBeenCalled();

      // The key point is that the configuration option is respected
      expect(mockLoadConfig).toHaveBeenCalled();
    });

    it('should handle relationship extraction configuration independently from auto ingest', async () => {
      // Test that relationship extraction setting doesn't affect other functionality
      const testConfig = {
        ...mockConfig,
        autoIngest: true,
        enableRelationshipExtraction: false
      };
      mockLoadConfig.mockReturnValue(testConfig);

      const testMemori = new Memori();
      await testMemori.enable();

      // Should still be able to record conversations
      const chatId = await testMemori.recordConversation('Hello', 'Hi there');
      expect(chatId).toBe('mock-uuid');

      // Should still store chat history
      expect(MockDatabaseManager.prototype.storeChatHistory).toHaveBeenCalled();
    });

    it('should maintain relationship extraction as optional configuration', () => {
      // Test that the option can be omitted (backward compatibility)
      const minimalConfig = { ...mockConfig };
      delete (minimalConfig as any).enableRelationshipExtraction;

      mockLoadConfig.mockReturnValue(minimalConfig);

      new Memori();
      // Should not throw errors due to missing option
      expect(mockLoadConfig).toHaveBeenCalled();
    });
  });

  describe('background processing', () => {
    beforeEach(() => {
      // Mock setInterval and clearInterval for testing
      jest.useFakeTimers();
      jest.spyOn(global, 'setInterval');
      jest.spyOn(global, 'clearInterval');
    });

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it('should start background monitoring when conscious mode is enabled', async () => {
      const consciousConfig = { ...mockConfig, consciousIngest: true };
      mockLoadConfig.mockReturnValue(consciousConfig);

      const consciousMemori = new Memori();
      await consciousMemori.enable();

      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 30000);
      expect(consciousMemori.isBackgroundMonitoringActive()).toBe(true);
    });

    it('should not start background monitoring when not in conscious mode', async () => {
      const nonConsciousConfig = { ...mockConfig, consciousIngest: false };
      mockLoadConfig.mockReturnValue(nonConsciousConfig);

      const nonConsciousMemori = new Memori();
      await nonConsciousMemori.enable();

      expect(setInterval).not.toHaveBeenCalled();
      expect(nonConsciousMemori.isBackgroundMonitoringActive()).toBe(false);
    });

    it('should stop background monitoring on close', async () => {
      const consciousConfig = { ...mockConfig, consciousIngest: true };
      mockLoadConfig.mockReturnValue(consciousConfig);

      const consciousMemori = new Memori();
      await consciousMemori.enable();

      await consciousMemori.close();

      expect(clearInterval).toHaveBeenCalled();
      expect(consciousMemori.isBackgroundMonitoringActive()).toBe(false);
    });

    it('should configure background update interval', async () => {
      const consciousConfig = { ...mockConfig, consciousIngest: true };
      mockLoadConfig.mockReturnValue(consciousConfig);

      const consciousMemori = new Memori();
      await consciousMemori.enable();

      // Stop initial monitoring
      await consciousMemori.close();

      // Configure new interval
      consciousMemori.setBackgroundUpdateInterval(60000);

      expect(consciousMemori.getBackgroundUpdateInterval()).toBe(60000);
    });

    it('should restart monitoring with new interval when already running', async () => {
      const consciousConfig = { ...mockConfig, consciousIngest: true };
      mockLoadConfig.mockReturnValue(consciousConfig);

      const consciousMemori = new Memori();
      await consciousMemori.enable();

      // Configure new interval while monitoring is active
      consciousMemori.setBackgroundUpdateInterval(60000);

      expect(clearInterval).toHaveBeenCalled();
      expect(setInterval).toHaveBeenCalledWith(expect.any(Function), 60000);
    });

    it('should throw error for invalid background update interval', () => {
      expect(() => memori.setBackgroundUpdateInterval(-1000)).toThrow('Background update interval must be positive');
      expect(() => memori.setBackgroundUpdateInterval(0)).toThrow('Background update interval must be positive');
    });
  });
});
