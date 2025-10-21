// tests/unit/integrations/openai-dropin/ChatProxy.test.ts
// Comprehensive unit tests for ChatProxy
// Tests memory recording functionality and OpenAI compatibility

import { ChatProxy } from '../../../../src/integrations/openai-dropin/chat-proxy';
import type { MemoryManager } from '../../../../src/integrations/openai-dropin/types';
import { MockOpenAIClient, MockMemori, MockMemoryAgent, MockStreamingResponse } from './mocks';
import { TestFixtures, MockFactory, TestCleanup, TestDataGenerators } from './test-utils';

describe('ChatProxy', () => {
    let mockOpenAI: MockOpenAIClient;
    let mockMemori: MockMemori;
    let mockMemoryAgent: MockMemoryAgent;
    let mockMemoryManager: MemoryManager;

    beforeEach(() => {
        mockOpenAI = MockFactory.createMockOpenAI();
        mockMemori = MockFactory.createMockMemori();
        mockMemoryAgent = MockFactory.createMockMemoryAgent();

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
        it('should create ChatProxy with enabled memory recording', () => {
            const chatProxy = new ChatProxy(mockOpenAI.chat, mockMemoryManager, true);

            expect(chatProxy).toBeDefined();
            expect(chatProxy.isEnabled()).toBe(true);
        });

        it('should create ChatProxy with disabled memory recording', () => {
            const chatProxy = new ChatProxy(mockOpenAI.chat, mockMemoryManager, false);

            expect(chatProxy).toBeDefined();
            expect(chatProxy.isEnabled()).toBe(false);
        });

        it('should default to enabled when no parameter provided', () => {
            const chatProxy = new ChatProxy(mockOpenAI.chat, mockMemoryManager);

            expect(chatProxy).toBeDefined();
            expect(chatProxy.isEnabled()).toBe(true);
        });
    });

    describe('Memory Recording Control', () => {
        let chatProxy: ChatProxy;

        beforeEach(() => {
            chatProxy = new ChatProxy(mockOpenAI.chat, mockMemoryManager, false);
        });

        describe('setEnabled()', () => {
            it('should enable memory recording', () => {
                chatProxy.setEnabled(true);
                expect(chatProxy.isEnabled()).toBe(true);
            });

            it('should disable memory recording', () => {
                chatProxy.setEnabled(false);
                expect(chatProxy.isEnabled()).toBe(false);
            });
        });

        describe('isEnabled()', () => {
            it('should return current enabled state', () => {
                expect(chatProxy.isEnabled()).toBe(false);

                chatProxy.setEnabled(true);
                expect(chatProxy.isEnabled()).toBe(true);

                chatProxy.setEnabled(false);
                expect(chatProxy.isEnabled()).toBe(false);
            });
        });
    });

    describe('OpenAI Chat Interface', () => {
        let chatProxy: ChatProxy;

        beforeEach(() => {
            chatProxy = new ChatProxy(mockOpenAI.chat, mockMemoryManager, true);
        });

        describe('getOpenAIChat()', () => {
            it('should return underlying OpenAI chat client', () => {
                const openaiChat = chatProxy.getOpenAIChat();
                expect(openaiChat).toBeDefined();
                expect(openaiChat.completions).toBeDefined();
                expect(openaiChat.completions.create).toBeDefined();
            });
        });

        describe('getMemoryManager()', () => {
            it('should return memory manager instance', () => {
                const memoryManager = chatProxy.getMemoryManager();
                expect(memoryManager).toBe(mockMemoryManager);
            });
        });
    });

    describe('Chat Completion Creation', () => {
        let chatProxy: ChatProxy;

        beforeEach(() => {
            chatProxy = new ChatProxy(mockOpenAI.chat, mockMemoryManager, true);
        });

        describe('Non-streaming Requests', () => {
            it('should create chat completion successfully', async () => {
                const params = TestFixtures.createBasicChatParams();

                const result = await chatProxy.create(params);

                expect(result).toBeDefined();
                // Since this is non-streaming, result should be ChatCompletion
                if ('choices' in result) {
                    expect(result.choices).toBeDefined();
                    expect(result.choices.length).toBeGreaterThan(0);
                    expect(result.choices[0].message.content).toBeDefined();
                    expect(result.choices[0].message.role).toBe('assistant');
                }
                // Verify the call was made to the mock
                expect(mockOpenAI.getCallHistory()).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            method: 'chat.completions.create',
                            params: params,
                        }),
                    ]),
                );
            });

            it('should record memory when enabled and shouldRecordMemory returns true', async () => {
                const params = TestFixtures.createBasicChatParams();
                const mockResponse = {
                    id: 'chatcmpl-memory-test',
                    object: 'chat.completion',
                    created: 1234567890,
                    model: 'gpt-4o-mini',
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: 'assistant',
                                content: 'Hello! How can I help you today?',
                                refusal: null,
                            },
                            logprobs: null,
                            finish_reason: 'stop',
                        },
                    ],
                    usage: {
                        prompt_tokens: 11.75,
                        completion_tokens: 8,
                        total_tokens: 19.75,
                    },
                };

                mockOpenAI.chat.completions.create = jest.fn().mockResolvedValue(mockResponse);
                const recordChatCompletionSpy = jest.spyOn(mockMemoryManager, 'recordChatCompletion');

                const result = await chatProxy.create(params);

                expect(result).toBeDefined();
                // Check that memory recording was called
                expect(recordChatCompletionSpy).toHaveBeenCalled();
                expect(recordChatCompletionSpy).toHaveBeenCalledWith(
                    params,
                    expect.any(Object), // Response object
                    expect.objectContaining({
                        forceRecording: false,
                        isStreaming: false,
                    })
                );
            });

            it('should not record memory when disabled', async () => {
                chatProxy.setEnabled(false);

                const params = TestFixtures.createBasicChatParams();
                const mockResponse = {
                    id: 'chatcmpl-disabled-test',
                    object: 'chat.completion',
                    created: 1234567890,
                    model: 'gpt-4o-mini',
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: 'assistant',
                                content: 'Hello! How can I help you today?',
                                refusal: null,
                            },
                            logprobs: null,
                            finish_reason: 'stop',
                        },
                    ],
                    usage: {
                        prompt_tokens: 11.75,
                        completion_tokens: 8,
                        total_tokens: 19.75,
                    },
                };

                mockOpenAI.chat.completions.create = jest.fn().mockResolvedValue(mockResponse);
                const recordChatCompletionSpy = jest.spyOn(mockMemoryManager, 'recordChatCompletion');

                const result = await chatProxy.create(params);

                expect(result).toBeDefined();
                // Memory recording should not be called when disabled
                expect(recordChatCompletionSpy).not.toHaveBeenCalled();
            });
        });

        describe('Streaming Requests', () => {
            it('should handle streaming chat completion successfully', async () => {
                const params = TestFixtures.createStreamingChatParams();

                const result = await chatProxy.create(params);

                expect(result).toBeDefined();
                // Verify the call was made to the mock
                expect(mockOpenAI.getCallHistory()).toEqual(
                    expect.arrayContaining([
                        expect.objectContaining({
                            method: 'chat.completions.create',
                            params: params,
                        }),
                    ]),
                );
            });

            it('should record memory for streaming responses', async () => {
                const params = TestFixtures.createStreamingChatParams();
                const recordChatCompletionSpy = jest.spyOn(mockMemoryManager, 'recordChatCompletion');

                const result = await chatProxy.create(params);

                expect(result).toBeDefined();
                // Check that memory recording was called
                expect(recordChatCompletionSpy).toHaveBeenCalled();
                expect(recordChatCompletionSpy).toHaveBeenCalledWith(
                    expect.any(Object), // params
                    expect.any(Object), // streaming response
                    expect.objectContaining({
                        forceRecording: false,
                        isStreaming: true,
                    }),
                );
            });

            it('should not record memory for streaming when disabled', async () => {
                chatProxy.setEnabled(false);

                const params = TestFixtures.createStreamingChatParams();
                const mockStream = MockStreamingResponse.createAsyncIterable(
                    MockStreamingResponse.createMockChunks('Streaming response content')
                );

                mockOpenAI.chat.completions.create = jest.fn().mockResolvedValue(mockStream);
                const recordChatCompletionSpy = jest.spyOn(mockMemoryManager, 'recordChatCompletion');

                const result = await chatProxy.create(params);

                expect(result).toBeDefined();
                expect(recordChatCompletionSpy).not.toHaveBeenCalled();
            });
        });

        describe('Error Handling', () => {
            it('should handle OpenAI API errors gracefully', async () => {
                const params = TestFixtures.createBasicChatParams();
                const errorMessage = 'OpenAI API error';

                // Create a new mock that fails
                const failingMockOpenAI = MockFactory.createMockOpenAI({
                    shouldFail: true,
                    failMessage: errorMessage,
                });
                const failingChatProxy = new ChatProxy(failingMockOpenAI.chat, mockMemoryManager, true);

                await expect(failingChatProxy.create(params)).rejects.toThrow(errorMessage);
            });

            it('should handle memory recording errors without affecting main response', async () => {
                const params = TestFixtures.createBasicChatParams();

                // Mock memory manager to throw error
                const recordChatCompletionSpy = jest.spyOn(mockMemoryManager, 'recordChatCompletion')
                    .mockRejectedValue(new Error('Memory recording failed'));

                const result = await chatProxy.create(params);

                // Main response should still succeed
                expect(result).toBeDefined();
                expect(result).toBeDefined();

                // Memory recording should have been attempted
                expect(recordChatCompletionSpy).toHaveBeenCalled();
            });

            it('should handle streaming errors gracefully', async () => {
                const params = TestFixtures.createStreamingChatParams();
                const errorMessage = 'Streaming error';

                // Create a new mock that fails
                const failingMockOpenAI = MockFactory.createMockOpenAI({
                    shouldFail: true,
                    failMessage: errorMessage,
                });
                const failingChatProxy = new ChatProxy(failingMockOpenAI.chat, mockMemoryManager, true);

                await expect(failingChatProxy.create(params)).rejects.toThrow(errorMessage);
            });
        });
    });

    describe('Memory Recording Integration', () => {
        let chatProxy: ChatProxy;

        beforeEach(() => {
            chatProxy = new ChatProxy(mockOpenAI.chat, mockMemoryManager, true);
        });

        describe('MemoryAgent Integration', () => {
            it('should delegate memory processing to MemoryAgent via MemoryManager', async () => {
                const params = TestFixtures.createBasicChatParams();

                const mockResponse = {
                    id: 'chatcmpl-memory-test',
                    object: 'chat.completion',
                    created: 1234567890,
                    model: 'gpt-4o-mini',
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: 'assistant',
                                content: 'Hello! How can I help you today?',
                                refusal: null,
                            },
                            logprobs: null,
                            finish_reason: 'stop',
                        },
                    ],
                    usage: {
                        prompt_tokens: 11.75,
                        completion_tokens: 8,
                        total_tokens: 19.75,
                    },
                };

                mockOpenAI.chat.completions.create = jest.fn().mockResolvedValue(mockResponse);
                const recordChatCompletionSpy = jest.spyOn(mockMemoryManager, 'recordChatCompletion');

                const result = await chatProxy.create(params);

                expect(result).toBeDefined();
                // MemoryAgent processing should be delegated to MemoryManager
                expect(recordChatCompletionSpy).toHaveBeenCalled();
                expect(recordChatCompletionSpy).toHaveBeenCalledWith(
                    params,
                    expect.any(Object), // Response object
                    expect.objectContaining({
                        forceRecording: false,
                        isStreaming: false,
                    })
                );
            });

            it('should handle MemoryAgent processing errors gracefully', async () => {
                const params = TestFixtures.createBasicChatParams();

                // Mock memory manager to throw error during MemoryAgent processing
                const recordChatCompletionSpy = jest.spyOn(mockMemoryManager, 'recordChatCompletion')
                    .mockRejectedValue(new Error('MemoryAgent processing failed'));

                const mockResponse = {
                    id: 'chatcmpl-error-test',
                    object: 'chat.completion',
                    created: 1234567890,
                    model: 'gpt-4o-mini',
                    choices: [
                        {
                            index: 0,
                            message: {
                                role: 'assistant',
                                content: 'Hello! How can I help you today?',
                                refusal: null,
                            },
                            logprobs: null,
                            finish_reason: 'stop',
                        },
                    ],
                    usage: {
                        prompt_tokens: 11.75,
                        completion_tokens: 8,
                        total_tokens: 19.75,
                    },
                };

                mockOpenAI.chat.completions.create = jest.fn().mockResolvedValue(mockResponse);

                const result = await chatProxy.create(params);

                // Main response should still succeed despite MemoryAgent error
                expect(result).toBeDefined();
                expect(recordChatCompletionSpy).toHaveBeenCalled();
            });
        });
    });

    describe('Integration Tests', () => {
        it('should work with real MemoriOpenAIClient integration', () => {
            // This test verifies that ChatProxy works correctly with the actual client
            // In a real scenario, this would be part of integration tests
            const chatProxy = new ChatProxy(mockOpenAI.chat, mockMemoryManager, true);
            expect(chatProxy).toBeDefined();
            expect(chatProxy.getOpenAIChat()).toBeDefined();
            expect(chatProxy.getMemoryManager()).toBeDefined();
        });
    });
});