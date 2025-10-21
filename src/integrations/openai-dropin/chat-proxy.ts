import type OpenAI from 'openai';
import type {
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
  ChatProxyInterface,
} from './types';
import type { MemoryManager } from './types';
import { logInfo, logError } from '../../core/infrastructure/config/Logger';
import { v4 as uuidv4 } from 'uuid';

/**
 * ChatProxy class that wraps OpenAI chat completions with memory recording
 * Provides a simplified interface for chat completions with memory functionality
 */
export class ChatProxy implements ChatProxyInterface {
  private openaiChat: OpenAI.Chat;
  private memoryManager: MemoryManager;
  private enabled: boolean;

  constructor(
    openaiChat: OpenAI.Chat,
    memoryManager: MemoryManager,
    enabled: boolean = true,
  ) {
    this.openaiChat = openaiChat;
    this.memoryManager = memoryManager;
    this.enabled = enabled;
  }

  /**
   * Create chat completion with optional memory recording
   * This is the main method that handles both streaming and non-streaming completions
   */
  async create(
    params: ChatCompletionCreateParams,
    options?: OpenAI.RequestOptions,
  ): Promise<OpenAI.ChatCompletion | AsyncIterable<OpenAI.ChatCompletionChunk>> {
    const requestId = uuidv4();
    const startTime = Date.now();

    try {
      logInfo('Chat completion request initiated', {
        component: 'ChatProxy',
        requestId,
        model: params.model,
        isStreaming: Boolean(params.stream),
        messageCount: params.messages.length,
        enabled: this.enabled,
      });

      // Call the actual OpenAI API
      const response = await this.openaiChat.completions.create(params, options);

      // Record memory if enabled - MemoryAgent now handles all sophisticated processing
      if (this.enabled) {
        try {
          const recordingResult = await this.memoryManager.recordChatCompletion(
            params,
            response,
            {
              forceRecording: false,
              isStreaming: Boolean(params.stream),
            },
          );

          logInfo('MemoryAgent processing completed', {
            component: 'ChatProxy',
            requestId,
            chatId: recordingResult.chatId,
            wasStreaming: recordingResult.wasStreaming,
            duration: recordingResult.duration,
            success: recordingResult.success,
            classification: recordingResult.classification,
            importance: recordingResult.importance,
          });
        } catch (memoryError) {
          // MemoryAgent processing failures should not break the main functionality
          logError('MemoryAgent processing failed, but chat completion succeeded', {
            component: 'ChatProxy',
            requestId,
            error: memoryError instanceof Error ? memoryError.message : String(memoryError),
            model: params.model,
            isStreaming: Boolean(params.stream),
          });
        }
      } else {
        logInfo('MemoryAgent processing skipped - ChatProxy disabled', {
          component: 'ChatProxy',
          requestId,
        });
      }

      const duration = Date.now() - startTime;
      logInfo('Chat completion request completed', {
        component: 'ChatProxy',
        requestId,
        duration,
        model: params.model,
        isStreaming: Boolean(params.stream),
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      logError('Chat completion request failed', {
        component: 'ChatProxy',
        requestId,
        duration,
        error: error instanceof Error ? error.message : String(error),
        model: params.model,
        isStreaming: Boolean(params.stream),
      });
      throw error;
    }
  }


  /**
   * Update chat proxy enabled state
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logInfo('ChatProxy enabled state updated', {
      component: 'ChatProxy',
      enabled,
    });
  }

  /**
   * Check if chat proxy is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get the underlying OpenAI chat client
   */
  getOpenAIChat(): OpenAI.Chat {
    return this.openaiChat;
  }

  /**
   * Get the memory manager instance
   */
  getMemoryManager(): MemoryManager {
    return this.memoryManager;
  }
}

export default ChatProxy;