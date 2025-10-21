// tests/unit/core/MemoryAgent.test.ts
import { MemoryAgent } from '../../../src/core/domain/memory/MemoryAgent';
import { MemoryClassification, MemoryImportanceLevel } from '../../../src/core/types/schemas';
import * as Logger from '../../../src/core/infrastructure/config/Logger';

describe('MemoryAgent Static Methods', () => {
  describe('processLLMResponse', () => {
    it('should process valid JSON response correctly', () => {
      const validJsonResponse = JSON.stringify({
        content: 'Test memory content',
        summary: 'Test summary',
        classification: 'CONVERSATIONAL',
        importance: 'MEDIUM',
        topic: 'TypeScript',
        entities: ['TypeScript', 'JavaScript'],
        keywords: ['programming', 'language'],
        confidenceScore: 0.9,
        classificationReason: 'Standard conversation about programming',
        promotionEligible: false,
      });

      const result = MemoryAgent.processLLMResponse(validJsonResponse, 'test-chat-123');

      expect(result).toHaveProperty('content', 'Test memory content');
      expect(result).toHaveProperty('summary', 'Test summary');
      expect(result).toHaveProperty('classification', MemoryClassification.CONVERSATIONAL);
      expect(result).toHaveProperty('importance', MemoryImportanceLevel.MEDIUM);
      expect(result).toHaveProperty('topic', 'TypeScript');
      expect(result).toHaveProperty('entities', ['TypeScript', 'JavaScript']);
      expect(result).toHaveProperty('keywords', ['programming', 'language']);
      expect(result).toHaveProperty('confidenceScore', 0.9);
      expect(result).toHaveProperty('classificationReason', 'Standard conversation about programming');
      expect(result).toHaveProperty('promotionEligible', false);
      expect(result).toHaveProperty('conversationId', 'test-chat-123');
    });

    it('should handle invalid JSON response and throw error', () => {
      const invalidJsonResponse = '{ invalid json content }';

      // Capture logWarn to verify it's called
      const logWarnSpy = jest.spyOn(Logger, 'logWarn').mockImplementation(() => {});

      expect(() => {
        MemoryAgent.processLLMResponse(invalidJsonResponse, 'test-chat-123');
      }).toThrow('Invalid JSON response from model');

      // Verify that logWarn was called with the right message and context
      expect(logWarnSpy).toHaveBeenCalledWith(
        'Failed to parse JSON response, using fallback',
        expect.objectContaining({
          component: 'MemoryAgent',
          contentPreview: '{ invalid json content }',
          chatId: 'test-chat-123',
        }),
      );

      logWarnSpy.mockRestore();
    });

    it('should normalize uppercase enum values to lowercase', () => {
      const uppercaseJsonResponse = JSON.stringify({
        content: 'Test content',
        summary: 'Test summary',
        classification: 'ESSENTIAL', // Uppercase
        importance: 'HIGH', // Uppercase
        topic: 'Testing',
        entities: [],
        keywords: [],
        confidenceScore: 0.8,
        classificationReason: 'Important test case',
        promotionEligible: true,
      });

      const result = MemoryAgent.processLLMResponse(uppercaseJsonResponse, 'test-chat-123');

      expect(result).toHaveProperty('classification', MemoryClassification.ESSENTIAL);
      expect(result).toHaveProperty('importance', MemoryImportanceLevel.HIGH);
    });

    it('should handle JSON with missing optional fields', () => {
      const minimalJsonResponse = JSON.stringify({
        content: 'Minimal test content',
        summary: 'Minimal summary',
        classification: 'CONVERSATIONAL',
        importance: 'LOW',
        classificationReason: 'Minimal test case',
        // Missing optional fields like topic, entities, keywords
      });

      const result = MemoryAgent.processLLMResponse(minimalJsonResponse, 'test-chat-123');

      expect(result).toHaveProperty('content', 'Minimal test content');
      expect(result).toHaveProperty('summary', 'Minimal summary');
      expect(result).toHaveProperty('classification', MemoryClassification.CONVERSATIONAL);
      expect(result).toHaveProperty('importance', MemoryImportanceLevel.LOW);
      expect(result).toHaveProperty('conversationId', 'test-chat-123');
      // Should have default values for missing fields
      expect(result.entities).toEqual([]);
      expect(result.keywords).toEqual([]);
    });

    it('should handle JSON with markdown code blocks', () => {
      const markdownJsonResponse = '```json\n' + JSON.stringify({
        content: 'Content with markdown',
        summary: 'Markdown summary',
        classification: 'REFERENCE',
        importance: 'MEDIUM',
        topic: 'Documentation',
        entities: [],
        keywords: [],
        confidenceScore: 0.7,
        classificationReason: 'Technical documentation',
        promotionEligible: false,
      }) + '\n```';

      const result = MemoryAgent.processLLMResponse(markdownJsonResponse, 'test-chat-123');

      expect(result).toHaveProperty('content', 'Content with markdown');
      expect(result).toHaveProperty('summary', 'Markdown summary');
      expect(result).toHaveProperty('classification', MemoryClassification.REFERENCE);
    });
  });

  describe('createFallbackMemory', () => {
    it('should create fallback memory with provided inputs', () => {
      const userInput = 'What is unit testing?';
      const aiOutput = 'Unit testing is a software testing method';
      const chatId = 'test-chat-456';

      const result = MemoryAgent.createFallbackMemory(userInput, aiOutput, chatId);

      expect(result).toHaveProperty('content', 'What is unit testing? Unit testing is a software testing method');
      expect(result).toHaveProperty('summary', 'What is unit testing?...');
      expect(result).toHaveProperty('classification', MemoryClassification.CONVERSATIONAL);
      expect(result).toHaveProperty('importance', MemoryImportanceLevel.MEDIUM);
      expect(result).toHaveProperty('entities', []);
      expect(result).toHaveProperty('keywords', []);
      expect(result).toHaveProperty('conversationId', chatId);
      expect(result).toHaveProperty('confidenceScore', 0.5);
      expect(result).toHaveProperty('classificationReason', 'Fallback processing due to error');
      expect(result).toHaveProperty('promotionEligible', false);
    });

    it('should handle empty user input', () => {
      const result = MemoryAgent.createFallbackMemory('', 'AI response', 'test-chat-789');

      expect(result).toHaveProperty('content', ' AI response');
      expect(result).toHaveProperty('summary', '...');
    });

    it('should handle empty AI output', () => {
      const result = MemoryAgent.createFallbackMemory('User input', '', 'test-chat-789');

      expect(result).toHaveProperty('content', 'User input ');
      expect(result).toHaveProperty('summary', 'User input...');
    });

    it('should handle very long inputs', () => {
      const longUserInput = 'A'.repeat(200); // Very long input
      const longAiOutput = 'B'.repeat(200); // Very long output
      const chatId = 'test-chat-long';

      const result = MemoryAgent.createFallbackMemory(longUserInput, longAiOutput, chatId);

      expect(result).toHaveProperty('content', longUserInput + ' ' + longAiOutput);
      expect(result).toHaveProperty('summary', longUserInput.slice(0, 100) + '...');
      expect(result.summary.length).toBe(103); // 100 chars + "..."
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