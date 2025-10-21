import OpenAI from 'openai';
import { v4 as uuidv4 } from 'uuid';
import { MemoryCapableProvider, LLMProviderFactory, IProviderConfig } from '../../core/infrastructure/providers/';
import type {
  MemoriOpenAI,
  MemoryManager,
  ChatCompletionCreateParams,
  EmbeddingCreateParams,
} from './types';

/**
 * Simplified MemoriOpenAIClient implementation
 * Provides OpenAI SDK compatibility with transparent memory functionality
 */
export class MemoriOpenAIClient implements MemoriOpenAI {
  private provider?: MemoryCapableProvider;
  public config: IProviderConfig;

  constructor(config: IProviderConfig) {
    this.config = {
      ...config,
      memory: {
        enableChatMemory: true,
        enableEmbeddingMemory: false,
        memoryProcessingMode: 'auto',
        minImportanceLevel: 'all',
        sessionId: uuidv4(),
        ...config.memory,
      },
    };
  }

  private async initializeProvider(): Promise<void> {
    if (this.provider) return;

    const baseProvider = await LLMProviderFactory.createProviderFromConfig(this.config);
    this.provider = baseProvider as MemoryCapableProvider;
  }

  // Simple OpenAI SDK adapter methods
  get chat(): OpenAI.Chat {
    return this.createChatInterface();
  }

  get embeddings(): OpenAI.Embeddings {
    return this.createEmbeddingsInterface();
  }

  get memory(): MemoryManager {
    if (!this.provider) {
      throw new Error('MemoriOpenAIClient not initialized. Call enable() first.');
    }
    return this.provider;
  }

  private createChatInterface(): OpenAI.Chat {
    return {
      completions: {
        create: async (params: ChatCompletionCreateParams, options?: OpenAI.RequestOptions) => {
          if (!this.provider) {
            await this.initializeProvider();
          }

          if (!this.provider) {
            throw new Error('Failed to initialize MemoriOpenAIClient');
          }

          const response = await this.provider.createChatCompletion({
            model: params.model || this.provider.getModel(),
            messages: params.messages as any,
            temperature: params.temperature ?? undefined,
            max_tokens: params.max_tokens ?? undefined,
            top_p: params.top_p ?? undefined,
            frequency_penalty: params.frequency_penalty ?? undefined,
            presence_penalty: params.presence_penalty ?? undefined,
            stop: params.stop ?? undefined,
            stream: params.stream ?? false,
            options: params as any,
          });

          // Convert response back to OpenAI format for compatibility
          if (params.stream && response.message) {
            return {
              id: response.id || 'memori-generated-id',
              object: 'chat.completion',
              created: response.created || Date.now(),
              model: response.model || params.model || this.provider.getModel(),
              choices: [{
                index: 0,
                message: {
                  role: response.message.role,
                  content: response.message.content || '',
                },
                finish_reason: response.finish_reason || 'stop',
              }],
              usage: response.usage ? {
                prompt_tokens: response.usage.prompt_tokens || 0,
                completion_tokens: response.usage.completion_tokens || 0,
                total_tokens: response.usage.total_tokens || 0,
              } : undefined,
            } as OpenAI.ChatCompletion;
          }

          return {
            id: response.id || 'memori-generated-id',
            object: 'chat.completion',
            created: response.created || Date.now(),
            model: response.model || params.model || this.provider.getModel(),
            choices: [{
              index: 0,
              message: {
                role: response.message?.role || 'assistant',
                content: response.message?.content || '',
              },
              finish_reason: response.finish_reason || 'stop',
            }],
            usage: response.usage ? {
              prompt_tokens: response.usage.prompt_tokens || 0,
              completion_tokens: response.usage.completion_tokens || 0,
              total_tokens: response.usage.total_tokens || 0,
            } : undefined,
          } as OpenAI.ChatCompletion;
        },
      },
    } as OpenAI.Chat;
  }

  private createEmbeddingsInterface(): OpenAI.Embeddings {
    return {
      create: async (params: EmbeddingCreateParams, options?: OpenAI.RequestOptions) => {
        if (!this.provider) {
          await this.initializeProvider();
        }

        if (!this.provider) {
          throw new Error('Failed to initialize MemoriOpenAIClient');
        }

        const input = Array.isArray(params.input)
          ? params.input.map(item => String(item))
          : String(params.input);

        const response = await this.provider.createEmbedding({
          model: params.model || 'text-embedding-3-small',
          input: input,
          encoding_format: params.encoding_format,
          dimensions: params.dimensions,
          user: params.user,
          options: params as any,
        });

        return {
          object: 'list',
          data: response.data.map((item, index) => ({
            object: item.object || 'embedding',
            embedding: item.embedding,
            index: item.index ?? index,
          })) as OpenAI.Embedding[],
          model: response.model || params.model || 'text-embedding-3-small',
          usage: response.usage ? {
            prompt_tokens: response.usage.prompt_tokens || 0,
            total_tokens: response.usage.total_tokens || 0,
          } : undefined,
        } as OpenAI.CreateEmbeddingResponse;
      },
    } as OpenAI.Embeddings;
  }

  async enable(): Promise<void> {
    if (!this.provider) {
      await this.initializeProvider();
    }
  }

  async disable(): Promise<void> {
    if (this.provider) {
      await this.provider.dispose();
      this.provider = undefined;
    }
  }

  async close(): Promise<void> {
    await this.disable();
  }

  async getMetrics(): Promise<any> {
    if (!this.provider) {
      return {
        totalRequests: 0,
        memoryRecordingSuccess: 0,
        memoryRecordingFailures: 0,
        averageResponseTime: 0,
        averageMemoryProcessingTime: 0,
      };
    }
    return this.provider.getMemoryMetrics();
  }

  async resetMetrics(): Promise<void> {
    // Metrics are managed internally by MemoryCapableProvider (currently read-only)
  }

  async updateConfig(config: any): Promise<void> {
    this.config = { ...this.config, ...config };
    if (this.provider) {
      this.provider.updateMemoryConfig(config.memory || {});
    }
  }

  get isEnabled(): boolean {
    return this.provider !== undefined;
  }

  get sessionId(): string {
    return this.config.memory?.sessionId || '';
  }

  getConfig(): IProviderConfig {
    return { ...this.config };
  }
}

// Export types for external usage
export type { MemoriOpenAI };
export default MemoriOpenAIClient;
