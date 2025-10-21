import MemoriOpenAIClient from './client';
import type { Memori } from '../../core/Memori';
import { logInfo, logError } from '../../core/infrastructure/config/Logger';
import type { IProviderConfig } from '../../core/infrastructure/providers/IProviderConfig';
import type {
  MemoriOpenAI,
} from './types';

/**
 * Factory class for creating MemoriOpenAI instances
 * Implements multiple initialization patterns as specified in the design document
 */
export class MemoriOpenAIFactory implements MemoriOpenAIFactory {
  /**
   * Create MemoriOpenAI instance using IProviderConfig (Recommended)
   * Modern factory method using the consolidated configuration interface
   */
  async createWithProviderConfig(
    providerConfig: IProviderConfig,
  ): Promise<MemoriOpenAI> {
    try {
      logInfo('Creating MemoriOpenAI with IProviderConfig', {
        component: 'MemoriOpenAIFactory',
        apiKey: providerConfig.apiKey ? '[REDACTED]' : undefined,
        model: providerConfig.model,
        baseUrl: providerConfig.baseUrl,
        memoryConfig: providerConfig.memory,
      });

      const client = new MemoriOpenAIClient(providerConfig);
      return client;
    } catch (error) {
      logError('Failed to create MemoriOpenAI with IProviderConfig', {
        component: 'MemoriOpenAIFactory',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create MemoriOpenAI instance with explicit Memori instance and IProviderConfig
   * Pattern 1: Explicit Memori Instance (Updated)
   */
  async createWithMemori(
    memori: Memori,
    providerConfig: IProviderConfig,
  ): Promise<MemoriOpenAI> {
    try {
      logInfo('Creating MemoriOpenAI with explicit Memori instance', {
        component: 'MemoriOpenAIFactory',
        apiKey: providerConfig.apiKey ? '[REDACTED]' : undefined,
        model: providerConfig.model,
      });

      // For now, create a new client - in a future version we could reuse the Memori instance
      const client = new MemoriOpenAIClient(providerConfig);
      return client;
    } catch (error) {
      logError('Failed to create MemoriOpenAI with explicit Memori instance', {
        component: 'MemoriOpenAIFactory',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create MemoriOpenAI instance from IProviderConfig
   * Pattern 2: Automatic Initialization
   */
  async fromConfig(
    providerConfig: IProviderConfig,
  ): Promise<MemoriOpenAI> {
    try {
      logInfo('Creating MemoriOpenAI from IProviderConfig', {
        component: 'MemoriOpenAIFactory',
        apiKey: providerConfig.apiKey ? '[REDACTED]' : undefined,
        model: providerConfig.model,
        enableChatMemory: providerConfig.memory?.enableChatMemory,
        enableEmbeddingMemory: providerConfig.memory?.enableEmbeddingMemory,
        memoryProcessingMode: providerConfig.memory?.memoryProcessingMode,
      });

      const client = new MemoriOpenAIClient(providerConfig);
      return client;
    } catch (error) {
      logError('Failed to create MemoriOpenAI from IProviderConfig', {
        component: 'MemoriOpenAIFactory',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create MemoriOpenAI instance from environment variables
   * Pattern 3: Environment-Based Setup
   */
  async fromEnv(
    apiKey?: string,
    config: Partial<IProviderConfig> = {},
  ): Promise<MemoriOpenAI> {
    try {
      // Create provider config from environment and merge with provided config
      const baseConfig: IProviderConfig = {
        apiKey: apiKey || process.env.OPENAI_API_KEY || '',
        model: 'gpt-3.5-turbo',
        baseUrl: process.env.OPENAI_BASE_URL,
        options: {
          organization: process.env.OPENAI_ORGANIZATION,
          project: process.env.OPENAI_PROJECT,
        },
        memory: {
          enableChatMemory: true,
          enableEmbeddingMemory: false,
          memoryProcessingMode: 'auto',
          minImportanceLevel: 'all',
          sessionId: config.memory?.sessionId,
          ...config.memory,
        },
        ...config,
      };

      logInfo('Creating MemoriOpenAI from environment', {
        component: 'MemoriOpenAIFactory',
        apiKey: baseConfig.apiKey ? '[REDACTED]' : undefined,
        model: baseConfig.model,
        baseUrl: baseConfig.baseUrl,
        memoryProcessingMode: baseConfig.memory?.memoryProcessingMode,
      });

      const client = new MemoriOpenAIClient(baseConfig);
      return client;
    } catch (error) {
      logError('Failed to create MemoriOpenAI from environment', {
        component: 'MemoriOpenAIFactory',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create MemoriOpenAI instance with database URL
   * Pattern 4: Direct Constructor Replacement
   */
  async fromDatabaseUrl(
    apiKey: string,
    databaseUrl: string,
    options: Partial<IProviderConfig> = {},
  ): Promise<MemoriOpenAI> {
    try {
      const config: IProviderConfig = {
        apiKey,
        model: 'gpt-3.5-turbo',
        memory: {
          enableChatMemory: true,
          enableEmbeddingMemory: false,
          memoryProcessingMode: 'auto',
          minImportanceLevel: 'all',
          sessionId: options.memory?.sessionId,
          ...options.memory,
        },
        ...options,
      };

      logInfo('Creating MemoriOpenAI with database URL', {
        component: 'MemoriOpenAIFactory',
        apiKey: apiKey ? '[REDACTED]' : undefined,
        databaseUrl,
        model: config.model,
        memoryProcessingMode: config.memory?.memoryProcessingMode,
      });

      const client = new MemoriOpenAIClient(config);
      return client;
    } catch (error) {
      logError('Failed to create MemoriOpenAI with database URL', {
        component: 'MemoriOpenAIFactory',
        error: error instanceof Error ? error.message : String(error),
        databaseUrl,
      });
      throw error;
    }
  }
}

// Create default factory instance
export const memoriOpenAIFactory = new MemoriOpenAIFactory();

/**
 * Convenience factory function for creating MemoriOpenAI instances using IProviderConfig
 * Modern factory function using the consolidated configuration interface
 */
export async function createMemoriOpenAIWithProviderConfig(
  providerConfig: IProviderConfig,
): Promise<MemoriOpenAI> {
  return memoriOpenAIFactory.createWithProviderConfig(providerConfig);
}

/**
 * Create MemoriOpenAI instance from IProviderConfig (convenience function)
 * Pattern 2: Automatic Initialization
 */
export async function MemoriOpenAIFromConfig(
  providerConfig: IProviderConfig,
): Promise<MemoriOpenAI> {
  return memoriOpenAIFactory.fromConfig(providerConfig);
}

/**
 * Create MemoriOpenAI instance from environment (convenience function)
 * Pattern 3: Environment-Based Setup
 */
export async function MemoriOpenAIFromEnv(
  apiKey?: string,
  config?: Partial<IProviderConfig>,
): Promise<MemoriOpenAI> {
  return memoriOpenAIFactory.fromEnv(apiKey, config);
}

/**
 * Create MemoriOpenAI instance with database URL (convenience function)
 * Pattern 4: Direct Constructor Replacement
 */
export async function MemoriOpenAIFromDatabase(
  apiKey: string,
  databaseUrl: string,
  options?: Partial<IProviderConfig>,
): Promise<MemoriOpenAI> {
  return memoriOpenAIFactory.fromDatabaseUrl(apiKey, databaseUrl, options);
}

// Export types for external usage
export type { MemoriOpenAI } from './types';
export default MemoriOpenAIFactory;