import type OpenAI from 'openai';
import type {
  EmbeddingCreateParams,
  CreateEmbeddingResponse,
} from './types';
import type { MemoryManager } from './types';
import { logInfo, logError } from '../../core/infrastructure/config/Logger';
import { v4 as uuidv4 } from 'uuid';
import { MemoryImportanceLevel } from '../../core/types/schemas';

/**
 * EmbeddingProxy class that wraps OpenAI embeddings API with optional memory recording
 * Provides Embeddings Phase 3 functionality as specified in the design document
 */
export class EmbeddingProxy {
  private openaiEmbeddings: OpenAI.Embeddings;
  private memoryManager: MemoryManager;
  private enabled: boolean;
  private memoryEnabled: boolean;

  constructor(
    openaiEmbeddings: OpenAI.Embeddings,
    memoryManager: MemoryManager,
    enabled: boolean = true,
    memoryEnabled: boolean = false,
  ) {
    this.openaiEmbeddings = openaiEmbeddings;
    this.memoryManager = memoryManager;
    this.enabled = enabled;
    this.memoryEnabled = memoryEnabled;
  }

  /**
   * Create embeddings with optional memory recording
   * This is the main method that handles embedding creation and memory recording
   */
  async create(
    params: EmbeddingCreateParams,
    options?: OpenAI.RequestOptions,
  ): Promise<CreateEmbeddingResponse> {
    const requestId = uuidv4();
    const startTime = Date.now();

    try {
      logInfo('Embedding creation request initiated', {
        component: 'EmbeddingProxy',
        requestId,
        model: params.model,
        inputType: Array.isArray(params.input) ? 'array' : 'string',
        inputLength: Array.isArray(params.input) ? params.input.length : 1,
        enabled: this.enabled,
        memoryEnabled: this.memoryEnabled,
      });

      // Call the actual OpenAI API
      const response = await this.openaiEmbeddings.create(params, options);

      // Record memory if enabled and memory recording is configured
      if (this.enabled && this.memoryEnabled && this.shouldRecordMemory(params)) {
        try {
          const recordingResult = await this.memoryManager.recordEmbedding(
            params,
            response,
            {
              enableMemory: true,
              input: params.input,
              metadata: {
                model: params.model || 'text-embedding-3-small',
                modelType: 'openai',
                endpoint: 'embeddings',
                isStreaming: false,
                requestParams: params as unknown as Record<string, unknown>,
                temperature: undefined,
                maxTokens: undefined,
                tokensUsed: response.usage?.total_tokens || 0,
                conversationId: uuidv4(),
              },
              importance: MemoryImportanceLevel.LOW, // Embeddings typically have lower importance
            },
          );

          logInfo('Embedding memory recording completed', {
            component: 'EmbeddingProxy',
            requestId,
            memoryId: recordingResult.memoryId,
            duration: recordingResult.duration,
            success: recordingResult.success,
          });
        } catch (memoryError) {
          // Memory recording failures should not break the main functionality
          logError('Embedding memory recording failed, but embedding creation succeeded', {
            component: 'EmbeddingProxy',
            requestId,
            error: memoryError instanceof Error ? memoryError.message : String(memoryError),
            model: params.model,
            inputType: Array.isArray(params.input) ? 'array' : 'string',
          });
        }
      } else {
        logInfo('Embedding memory recording skipped', {
          component: 'EmbeddingProxy',
          requestId,
          reason: this.enabled && this.memoryEnabled ? 'Memory recording disabled for this request' : 'EmbeddingProxy or memory disabled',
        });
      }

      const duration = Date.now() - startTime;
      logInfo('Embedding creation request completed', {
        component: 'EmbeddingProxy',
        requestId,
        duration,
        model: params.model,
        inputType: Array.isArray(params.input) ? 'array' : 'string',
        embeddingCount: response.data.length,
        totalTokens: response.usage?.total_tokens || 0,
        promptTokens: response.usage?.prompt_tokens || 0,
      });

      return response;
    } catch (error) {
      const duration = Date.now() - startTime;
      logError('Embedding creation request failed', {
        component: 'EmbeddingProxy',
        requestId,
        duration,
        error: error instanceof Error ? error.message : String(error),
        model: params.model,
        inputType: Array.isArray(params.input) ? 'array' : 'string',
      });
      throw error;
    }
  }

  /**
   * Determine if memory should be recorded for this embedding request
   */
  private shouldRecordMemory(params: EmbeddingCreateParams): boolean {
    // Don't record memory for requests with empty input
    if (!params.input) {
      return false;
    }

    // Calculate input length for validation
    const inputLength = this.getInputLength(params.input);

    // Don't record memory for very short inputs (likely test/debug inputs)
    if (inputLength < 5) {
      return false;
    }

    // Don't record memory for extremely long inputs that might be problematic
    const maxLength = this.getMaxInputLength(params.input);
    if (maxLength > 100000) { // 100KB limit for individual inputs
      return false;
    }

    // Don't record memory for encoding_format if it's not standard text
    if (params.encoding_format && params.encoding_format !== 'float' && params.encoding_format !== 'base64') {
      return false;
    }

    return true;
  }

  /**
   * Calculate total input length for validation
   */
  private getInputLength(input: string | string[] | number[] | number[][]): number {
    if (Array.isArray(input)) {
      let total = 0;
      for (const item of input) {
        total += this.getItemLength(item);
      }
      return total;
    }
    return this.getItemLength(input);
  }

  /**
   * Calculate max input length for validation
   */
  private getMaxInputLength(input: string | string[] | number[] | number[][]): number {
    if (Array.isArray(input)) {
      return Math.max(...input.map(item => this.getItemLength(item)));
    }
    return this.getItemLength(input);
  }

  /**
   * Get length of individual item
   */
  private getItemLength(item: string | number | number[]): number {
    if (typeof item === 'string') {
      return item.length;
    }
    if (typeof item === 'number') {
      return String(item).length;
    }
    if (Array.isArray(item)) {
      return item.length; // For nested arrays, just count the array length
    }
    return String(item).length;
  }

  /**
   * Update embedding proxy enabled state
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logInfo('EmbeddingProxy enabled state updated', {
      component: 'EmbeddingProxy',
      enabled,
    });
  }

  /**
   * Check if embedding proxy is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Enable or disable memory recording for embeddings
   */
  setMemoryEnabled(enabled: boolean): void {
    this.memoryEnabled = enabled;
    logInfo('EmbeddingProxy memory recording state updated', {
      component: 'EmbeddingProxy',
      memoryEnabled: enabled,
    });
  }

  /**
   * Check if memory recording is enabled
   */
  isMemoryEnabled(): boolean {
    return this.memoryEnabled;
  }

  /**
   * Get the underlying OpenAI embeddings client
   */
  getOpenAIEmbeddings(): OpenAI.Embeddings {
    return this.openaiEmbeddings;
  }

  /**
   * Get the memory manager instance
   */
  getMemoryManager(): MemoryManager {
    return this.memoryManager;
  }

  /**
   * Extract a human-readable summary from embedding input
   */
  private extractInputSummary(input: string | string[] | number[] | number[][]): string {
    if (!input) {
      return '';
    }

    if (typeof input === 'string') {
      return input;
    }

    if (Array.isArray(input)) {
      if (input.length === 0) {
        return '';
      }

      if (input.length === 1) {
        return String(input[0]);
      }

      // For multiple items, create a summary format
      const firstItem = String(input[0]);
      const remainingCount = input.length - 1;
      return `${firstItem}... (+${remainingCount} more items)`;
    }

    return String(input);
  }
}

export default EmbeddingProxy;