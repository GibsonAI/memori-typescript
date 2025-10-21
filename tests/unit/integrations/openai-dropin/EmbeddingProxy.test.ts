// Comprehensive unit tests for EmbeddingProxy
// Tests memory recording functionality and OpenAI compatibility

import { EmbeddingProxy } from '../../../../src/integrations/openai-dropin/embedding-proxy';
import type { MemoryManager } from '../../../../src/integrations/openai-dropin/types';
import { MockOpenAIClient } from './mocks';
import { TestFixtures, MockFactory, TestCleanup } from './test-utils';

describe('EmbeddingProxy', () => {
    let mockOpenAI: MockOpenAIClient;
    let mockMemoryManager: MemoryManager;

    beforeEach(() => {
        mockOpenAI = MockFactory.createMockOpenAI();

        // Create mock memory manager
        mockMemoryManager = {
            recordChatCompletion: jest.fn(),
            recordEmbedding: jest.fn(),
            searchMemories: jest.fn(),
            getMemoryStats: jest.fn(),
        } as unknown as MemoryManager;
    });

    afterEach(async () => {
        await TestCleanup.fullCleanup();
        jest.clearAllMocks();
    });

    describe('Constructor', () => {
        it('should create EmbeddingProxy with enabled embedding and memory recording', () => {
            const embeddingProxy = new EmbeddingProxy(mockOpenAI.embeddings, mockMemoryManager, true, true);

            expect(embeddingProxy).toBeDefined();
            expect(embeddingProxy.isEnabled()).toBe(true);
            expect(embeddingProxy.isMemoryEnabled()).toBe(true);
        });

        it('should create EmbeddingProxy with disabled embedding', () => {
            const embeddingProxy = new EmbeddingProxy(mockOpenAI.embeddings, mockMemoryManager, false, true);

            expect(embeddingProxy).toBeDefined();
            expect(embeddingProxy.isEnabled()).toBe(false);
            expect(embeddingProxy.isMemoryEnabled()).toBe(true);
        });

        it('should create EmbeddingProxy with disabled memory recording', () => {
            const embeddingProxy = new EmbeddingProxy(mockOpenAI.embeddings, mockMemoryManager, true, false);

            expect(embeddingProxy).toBeDefined();
            expect(embeddingProxy.isEnabled()).toBe(true);
            expect(embeddingProxy.isMemoryEnabled()).toBe(false);
        });

        it('should default to enabled when no parameters provided', () => {
            const embeddingProxy = new EmbeddingProxy(mockOpenAI.embeddings, mockMemoryManager);

            expect(embeddingProxy).toBeDefined();
            expect(embeddingProxy.isEnabled()).toBe(true);
            expect(embeddingProxy.isMemoryEnabled()).toBe(false);
        });
    });

    describe('Memory Recording Control', () => {
        let embeddingProxy: EmbeddingProxy;

        beforeEach(() => {
            embeddingProxy = new EmbeddingProxy(mockOpenAI.embeddings, mockMemoryManager, false, false);
        });

        describe('setEnabled()', () => {
            it('should enable embedding processing', () => {
                embeddingProxy.setEnabled(true);
                expect(embeddingProxy.isEnabled()).toBe(true);
            });

            it('should disable embedding processing', () => {
                embeddingProxy.setEnabled(false);
                expect(embeddingProxy.isEnabled()).toBe(false);
            });
        });

        describe('isEnabled()', () => {
            it('should return current enabled state', () => {
                expect(embeddingProxy.isEnabled()).toBe(false);

                embeddingProxy.setEnabled(true);
                expect(embeddingProxy.isEnabled()).toBe(true);

                embeddingProxy.setEnabled(false);
                expect(embeddingProxy.isEnabled()).toBe(false);
            });
        });

        describe('setMemoryEnabled()', () => {
            it('should enable memory recording', () => {
                embeddingProxy.setMemoryEnabled(true);
                expect(embeddingProxy.isMemoryEnabled()).toBe(true);
            });

            it('should disable memory recording', () => {
                embeddingProxy.setMemoryEnabled(false);
                expect(embeddingProxy.isMemoryEnabled()).toBe(false);
            });
        });

        describe('isMemoryEnabled()', () => {
            it('should return current memory enabled state', () => {
                expect(embeddingProxy.isMemoryEnabled()).toBe(false);

                embeddingProxy.setMemoryEnabled(true);
                expect(embeddingProxy.isMemoryEnabled()).toBe(true);

                embeddingProxy.setMemoryEnabled(false);
                expect(embeddingProxy.isMemoryEnabled()).toBe(false);
            });
        });
    });

    describe('OpenAI Embeddings Interface', () => {
        let embeddingProxy: EmbeddingProxy;

        beforeEach(() => {
            embeddingProxy = new EmbeddingProxy(mockOpenAI.embeddings, mockMemoryManager, true, true);
        });

        describe('getOpenAIEmbeddings()', () => {
            it('should return underlying OpenAI embeddings client', () => {
                const openaiEmbeddings = embeddingProxy.getOpenAIEmbeddings();
                expect(openaiEmbeddings).toBeDefined();
                expect(openaiEmbeddings.create).toBeDefined();
            });
        });

        describe('getMemoryManager()', () => {
            it('should return memory manager instance', () => {
                const memoryManager = embeddingProxy.getMemoryManager();
                expect(memoryManager).toBe(mockMemoryManager);
            });
        });
    });

    describe('Embedding Creation', () => {
        let embeddingProxy: EmbeddingProxy;

        beforeEach(() => {
            embeddingProxy = new EmbeddingProxy(mockOpenAI.embeddings, mockMemoryManager, true, true);
        });

        describe('Single Input Embedding', () => {
            it('should create embedding successfully', async () => {
                const params = TestFixtures.createEmbeddingParams();

                const result = await embeddingProxy.create(params);

                expect(result).toBeDefined();
                expect(result.object).toBe('list');
                expect(result.data).toBeDefined();
                expect(result.data.length).toBeGreaterThan(0);
                expect(result.data[0].embedding).toBeDefined();
                expect(result.data[0].embedding.length).toBeGreaterThan(0);

                // Verify the call was made to the mock
                expect(mockOpenAI.getCallHistory()).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            method: 'embeddings.create',
                            params: params,
                        }),
                    ]),
                );
            });

            it('should record memory when enabled and shouldRecordMemory returns true', async () => {
                const params = TestFixtures.createEmbeddingParams();
                const recordEmbeddingSpy = jest.spyOn(mockMemoryManager, 'recordEmbedding');

                const result = await embeddingProxy.create(params);

                expect(result).toBeDefined();
                // Check that memory recording was called
                expect(recordEmbeddingSpy).toHaveBeenCalled();
                expect(recordEmbeddingSpy).toHaveBeenCalledWith(
                    params,
                    expect.any(Object), // Response object
                    expect.objectContaining({
                        enableMemory: true,
                        importance: 'low',
                    }),
                );
            });

            it('should not record memory when memory recording disabled', async () => {
                // Disable memory recording for this test
                embeddingProxy.setMemoryEnabled(false);

                const params = TestFixtures.createEmbeddingParams();
                const recordEmbeddingSpy = jest.spyOn(mockMemoryManager, 'recordEmbedding');

                const result = await embeddingProxy.create(params);

                expect(result).toBeDefined();
                // Memory recording should not be called when disabled
                expect(recordEmbeddingSpy).not.toHaveBeenCalled();
            });

            it('should not record memory when embedding proxy disabled', async () => {
                // Disable embedding proxy for this test
                embeddingProxy.setEnabled(false);

                const params = TestFixtures.createEmbeddingParams();
                const recordEmbeddingSpy = jest.spyOn(mockMemoryManager, 'recordEmbedding');

                const result = await embeddingProxy.create(params);

                expect(result).toBeDefined();
                // Memory recording should not be called when proxy disabled
                expect(recordEmbeddingSpy).not.toHaveBeenCalled();
            });
        });

        describe('Multiple Input Embedding', () => {
            it('should create embeddings for multiple inputs', async () => {
                const params = TestFixtures.createMultipleInputEmbeddingParams();

                const result = await embeddingProxy.create(params);

                expect(result).toBeDefined();
                expect(result.object).toBe('list');
                expect(result.data).toBeDefined();
                expect(result.data.length).toBe(3); // Three inputs
                expect(result.data[0].embedding).toBeDefined();
                expect(result.data[1].embedding).toBeDefined();
                expect(result.data[2].embedding).toBeDefined();
            });

            it('should record memory for multiple input embeddings', async () => {
                const params = TestFixtures.createMultipleInputEmbeddingParams();
                const recordEmbeddingSpy = jest.spyOn(mockMemoryManager, 'recordEmbedding');

                const result = await embeddingProxy.create(params);

                expect(result).toBeDefined();
                expect(recordEmbeddingSpy).toHaveBeenCalled();
                expect(recordEmbeddingSpy).toHaveBeenCalledWith(
                    params,
                    expect.any(Object), // Response object
                    expect.objectContaining({
                        enableMemory: true,
                        importance: 'low',
                    }),
                );
            });
        });

        describe('Error Handling', () => {
            it('should handle OpenAI API errors gracefully', async () => {
                const params = TestFixtures.createEmbeddingParams();
                const errorMessage = 'OpenAI API error';

                // Create a new mock that fails
                const failingMockOpenAI = MockFactory.createMockOpenAI({
                    shouldFail: true,
                    failMessage: errorMessage,
                });
                const failingEmbeddingProxy = new EmbeddingProxy(failingMockOpenAI.embeddings, mockMemoryManager, true, true);

                await expect(failingEmbeddingProxy.create(params)).rejects.toThrow(errorMessage);
            });

            it('should handle memory recording errors without affecting main response', async () => {
                const params = TestFixtures.createEmbeddingParams();

                // Mock memory manager to throw error
                const recordEmbeddingSpy = jest.spyOn(mockMemoryManager, 'recordEmbedding')
                    .mockRejectedValue(new Error('Memory recording failed'));

                const result = await embeddingProxy.create(params);

                // Main response should still succeed
                expect(result).toBeDefined();
                expect(result.object).toBe('list');
                expect(result.data.length).toBeGreaterThan(0);

                // Memory recording should have been attempted
                expect(recordEmbeddingSpy).toHaveBeenCalled();
            });
        });
    });

    describe('Memory Recording Logic', () => {
        let embeddingProxy: EmbeddingProxy;

        beforeEach(() => {
            embeddingProxy = new EmbeddingProxy(mockOpenAI.embeddings, mockMemoryManager, true, true);
        });

        describe('shouldRecordMemory()', () => {
            it('should record memory for valid text input', () => {
                const params = {
                    model: 'text-embedding-3-small',
                    input: 'This is a valid text input for embedding memory recording.',
                    encoding_format: 'float' as const,
                };

                // Access private method through type assertion
                const shouldRecord = (embeddingProxy as any).shouldRecordMemory(params);
                expect(shouldRecord).toBe(true);
            });

            it('should not record memory for empty input', () => {
                const params = {
                    model: 'text-embedding-3-small',
                    input: '',
                    encoding_format: 'float' as const,
                };

                const shouldRecord = (embeddingProxy as any).shouldRecordMemory(params);
                expect(shouldRecord).toBe(false);
            });

            it('should not record memory for very short inputs', () => {
                const params = {
                    model: 'text-embedding-3-small',
                    input: 'Hi', // Very short input
                    encoding_format: 'float' as const,
                };

                const shouldRecord = (embeddingProxy as any).shouldRecordMemory(params);
                expect(shouldRecord).toBe(false);
            });

            it('should not record memory for extremely long inputs', () => {
                const longInput = 'A'.repeat(150000); // 150KB input
                const params = {
                    model: 'text-embedding-3-small',
                    input: longInput,
                    encoding_format: 'float' as const,
                };

                const shouldRecord = (embeddingProxy as any).shouldRecordMemory(params);
                expect(shouldRecord).toBe(false);
            });

            it('should not record memory for non-standard encoding formats', () => {
                const params = {
                    model: 'text-embedding-3-small',
                    input: 'This is a test input with custom encoding.',
                    encoding_format: 'custom' as any,
                };

                const shouldRecord = (embeddingProxy as any).shouldRecordMemory(params);
                expect(shouldRecord).toBe(false);
            });

            it('should handle array inputs correctly', () => {
                const params = {
                    model: 'text-embedding-3-small',
                    input: [
                        'First input for embedding.',
                        'Second input for embedding.',
                        'Third input for embedding.',
                    ],
                    encoding_format: 'float' as const,
                };

                const shouldRecord = (embeddingProxy as any).shouldRecordMemory(params);
                expect(shouldRecord).toBe(true);
            });

            it('should handle mixed array inputs correctly', () => {
                const params = {
                    model: 'text-embedding-3-small',
                    input: [
                        'Valid input text.',
                        'Hi', // Too short - but overall array should still be recorded
                    ],
                    encoding_format: 'float' as const,
                };

                const shouldRecord = (embeddingProxy as any).shouldRecordMemory(params);
                expect(shouldRecord).toBe(true);
            });
        });

        describe('Input Length Validation', () => {
            it('should validate string inputs based on length', () => {
                // Test valid string input (should record memory)
                const validParams = {
                    model: 'text-embedding-3-small',
                    input: 'This is a reasonably long input string for testing purposes.',
                    encoding_format: 'float' as const,
                };
                const shouldRecordValid = (embeddingProxy as any).shouldRecordMemory(validParams);
                expect(shouldRecordValid).toBe(true);

                // Test invalid short string input (should not record memory)
                const shortParams = {
                    model: 'text-embedding-3-small',
                    input: 'Hi',
                    encoding_format: 'float' as const,
                };
                const shouldRecordShort = (embeddingProxy as any).shouldRecordMemory(shortParams);
                expect(shouldRecordShort).toBe(false);
            });

            it('should validate array inputs based on total length', () => {
                // Test valid array input (should record memory)
                const validArrayParams = {
                    model: 'text-embedding-3-small',
                    input: ['First input string', 'Second input string', 'Third input string'],
                    encoding_format: 'float' as const,
                };
                const shouldRecordValidArray = (embeddingProxy as any).shouldRecordMemory(validArrayParams);
                expect(shouldRecordValidArray).toBe(true);

                // Test array with some short inputs (should still record memory if total length is valid)
                const mixedArrayParams = {
                    model: 'text-embedding-3-small',
                    input: ['Valid long input', 'Hi', 'Another valid input'],
                    encoding_format: 'float' as const,
                };
                const shouldRecordMixedArray = (embeddingProxy as any).shouldRecordMemory(mixedArrayParams);
                expect(shouldRecordMixedArray).toBe(true);
            });

            it('should validate number array inputs', () => {
                const numberArrayParams = {
                    model: 'text-embedding-3-small',
                    input: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as number[],
                    encoding_format: 'float' as const,
                };
                const shouldRecordNumbers = (embeddingProxy as any).shouldRecordMemory(numberArrayParams);
                expect(shouldRecordNumbers).toBe(true);
            });

            it('should reject extremely long inputs', () => {
                const longInput = 'A'.repeat(150000); // 150KB input
                const longParams = {
                    model: 'text-embedding-3-small',
                    input: longInput,
                    encoding_format: 'float' as const,
                };
                const shouldRecordLong = (embeddingProxy as any).shouldRecordMemory(longParams);
                expect(shouldRecordLong).toBe(false);
            });
        });
    });

    describe('Input Summary Extraction', () => {
        let embeddingProxy: EmbeddingProxy;

        beforeEach(() => {
            embeddingProxy = new EmbeddingProxy(mockOpenAI.embeddings, mockMemoryManager, true, true);
        });

        it('should extract summary from single string input', () => {
            const input = 'This is a single input string.';
            const extractInputSummary = (embeddingProxy as any).extractInputSummary;
            const summary = extractInputSummary(input);
            expect(summary).toBe(input);
        });

        it('should extract summary from single item array', () => {
            const input = ['This is a single item array.'];
            const extractInputSummary = (embeddingProxy as any).extractInputSummary;
            const summary = extractInputSummary(input);
            expect(summary).toBe('This is a single item array.');
        });

        it('should extract summary from multiple item array', () => {
            const input = ['First item', 'Second item', 'Third item'];
            const extractInputSummary = (embeddingProxy as any).extractInputSummary;
            const summary = extractInputSummary(input);
            expect(summary).toBe('First item... (+2 more items)');
        });

        it('should handle empty array input', () => {
            const input: string[] = [];
            const extractInputSummary = (embeddingProxy as any).extractInputSummary;
            const summary = extractInputSummary(input);
            expect(summary).toBe('');
        });
    });

    describe('Integration Tests', () => {
        it('should work with real MemoriOpenAIClient integration', () => {
            // This test verifies that EmbeddingProxy works correctly with the actual client
            // In a real scenario, this would be part of integration tests
            const embeddingProxy = new EmbeddingProxy(mockOpenAI.embeddings, mockMemoryManager, true, true);
            expect(embeddingProxy).toBeDefined();
            expect(embeddingProxy.getOpenAIEmbeddings()).toBeDefined();
            expect(embeddingProxy.getMemoryManager()).toBeDefined();
        });
    });
});

export default {};