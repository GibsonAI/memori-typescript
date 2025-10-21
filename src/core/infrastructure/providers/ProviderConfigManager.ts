import { IProviderConfig } from './IProviderConfig';
import { ProviderType } from './ProviderType';
import { logInfo, logError } from '../config/Logger';

/**
 * Provider configuration with memory settings
 */
export interface ProviderConfigWithMemory extends IProviderConfig {
  /** Memory configuration */
  memory?: {
    /** Enable chat memory recording */
    enableChatMemory?: boolean;
    /** Enable embedding memory recording */
    enableEmbeddingMemory?: boolean;
    /** Memory processing mode */
    memoryProcessingMode?: 'auto' | 'conscious' | 'none';
    /** Minimum importance level for memory storage */
    minImportanceLevel?: 'low' | 'medium' | 'high' | 'critical' | 'all';
    /** Session ID for tracking */
    sessionId?: string;
    /** Custom memory manager instance */
    memoryManager?: any;
  };
}

/**
 * Environment-based provider configuration
 */
export interface EnvironmentProviderConfig {
  /** Provider type to use */
  providerType: ProviderType;
  /** API key from environment */
  apiKey?: string;
  /** Base URL from environment */
  baseUrl?: string;
  /** Model from environment */
  model?: string;
  /** Organization from environment */
  organization?: string;
  /** Project from environment */
  project?: string;
  /** Memory configuration from environment */
  memory?: {
    enableChatMemory?: boolean;
    enableEmbeddingMemory?: boolean;
    memoryProcessingMode?: 'auto' | 'conscious' | 'none';
    minImportanceLevel?: 'low' | 'medium' | 'high' | 'critical' | 'all';
  };
}

/**
 * Configuration validation result
 */
export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Provider configuration manager
 * Handles provider configuration, environment-based selection, and validation
 */
export class ProviderConfigManager {
  private static instance: ProviderConfigManager;

  /**
   * Get singleton instance
   */
  static getInstance(): ProviderConfigManager {
    if (!ProviderConfigManager.instance) {
      ProviderConfigManager.instance = new ProviderConfigManager();
    }
    return ProviderConfigManager.instance;
  }

  /**
   * Create configuration from environment variables
   */
  createConfigFromEnvironment(): EnvironmentProviderConfig {
    const config: EnvironmentProviderConfig = {
      providerType: this.detectProviderType(),
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      organization: process.env.OPENAI_ORGANIZATION,
      project: process.env.OPENAI_PROJECT,
      memory: {
        enableChatMemory: this.parseBooleanEnv('MEMORI_ENABLE_CHAT_MEMORY', true),
        enableEmbeddingMemory: this.parseBooleanEnv('MEMORI_ENABLE_EMBEDDING_MEMORY', false),
        memoryProcessingMode: this.parseMemoryProcessingMode(process.env.MEMORI_PROCESSING_MODE || 'auto'),
        minImportanceLevel: this.parseImportanceLevel(process.env.MEMORI_MIN_IMPORTANCE || 'all'),
      },
    };

    logInfo('Provider configuration created from environment', {
      component: 'ProviderConfigManager',
      providerType: config.providerType,
      model: config.model,
      baseUrl: config.baseUrl ? '[REDACTED]' : undefined,
      memory: config.memory,
    });

    return config;
  }

  /**
   * Validate provider configuration
   */
  validateConfig(config: ProviderConfigWithMemory): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate API key
    if (!config.apiKey) {
      errors.push('API key is required');
    }

    // Validate model
    if (config.model && config.model.trim().length === 0) {
      errors.push('Model cannot be empty if provided');
    }

    // Validate base URL if provided
    if (config.baseUrl) {
      try {
        new URL(config.baseUrl);
      } catch {
        errors.push('Base URL must be a valid URL');
      }
    }

    // Validate memory configuration
    if (config.memory) {
      if (config.memory.minImportanceLevel && !['low', 'medium', 'high', 'critical', 'all'].includes(config.memory.minImportanceLevel)) {
        errors.push('Invalid minImportanceLevel value');
      }

      if (config.memory.memoryProcessingMode && !['auto', 'conscious', 'none'].includes(config.memory.memoryProcessingMode)) {
        errors.push('Invalid memoryProcessingMode value');
      }

      // Warnings for memory configuration
      if (config.memory.enableChatMemory === false && config.memory.enableEmbeddingMemory === false) {
        warnings.push('Both chat and embedding memory are disabled - no memory will be recorded');
      }
    }

    // Provider-specific validations
    if (config.apiKey === 'ollama-local') {
      warnings.push('Using dummy API key for Ollama - ensure Ollama is running locally');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Merge configuration with defaults
   */
  mergeWithDefaults(config: Partial<ProviderConfigWithMemory>): ProviderConfigWithMemory {
    const defaultConfig: ProviderConfigWithMemory = {
      apiKey: '',
      model: 'gpt-4o-mini',
      memory: {
        enableChatMemory: true,
        enableEmbeddingMemory: false,
        memoryProcessingMode: 'auto',
        minImportanceLevel: 'all',
      },
    };

    const merged = { ...defaultConfig, ...config };

    // Deep merge memory configuration
    if (config.memory || defaultConfig.memory) {
      merged.memory = { ...defaultConfig.memory, ...config.memory };
    }

    return merged;
  }

  /**
   * Detect provider type from configuration
   */
  detectProviderType(config?: Partial<IProviderConfig>): ProviderType {
    if (!config) {
      return ProviderType.OPENAI;
    }

    // Check for Ollama indicators
    if (config.apiKey === 'ollama-local' ||
        config.baseUrl?.includes('ollama') ||
        config.baseUrl?.includes('11434')) {
      return ProviderType.OLLAMA;
    }

    // Default to OpenAI
    return ProviderType.OPENAI;
  }

  /**
   * Create configuration for specific provider type
   */
  createConfigForProvider(
    providerType: ProviderType,
    baseConfig: Partial<IProviderConfig> = {}
  ): ProviderConfigWithMemory {
    const config = this.mergeWithDefaults(baseConfig);

    // Provider-specific defaults
    switch (providerType) {
      case ProviderType.OPENAI:
        config.model = config.model || 'gpt-4o-mini';
        config.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
        break;

      case ProviderType.OLLAMA:
        config.model = config.model || 'llama2';
        config.apiKey = config.apiKey || 'ollama-local';
        config.baseUrl = config.baseUrl || 'http://localhost:11434/v1';
        break;

      case ProviderType.ANTHROPIC:
        config.model = config.model || 'claude-3-sonnet-20240229';
        config.baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
        break;

      default:
        throw new Error(`Unsupported provider type: ${providerType}`);
    }

    // Validate the configuration
    const validation = this.validateConfig(config);
    if (!validation.isValid) {
      throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
    }

    if (validation.warnings.length > 0) {
      logInfo('Configuration warnings', {
        component: 'ProviderConfigManager',
        providerType,
        warnings: validation.warnings,
      });
    }

    return config;
  }

  /**
   * Parse boolean environment variable
   */
  private parseBooleanEnv(envVar: string, defaultValue: boolean): boolean {
    const value = process.env[envVar];
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true' || value === '1';
  }

  /**
   * Parse memory processing mode from environment
   */
  private parseMemoryProcessingMode(value: string): 'auto' | 'conscious' | 'none' {
    switch (value.toLowerCase()) {
      case 'auto':
        return 'auto';
      case 'conscious':
        return 'conscious';
      case 'none':
        return 'none';
      default:
        logInfo('Invalid memory processing mode, using default', {
          component: 'ProviderConfigManager',
          provided: value,
          default: 'auto',
        });
        return 'auto';
    }
  }

  /**
   * Parse importance level from environment
   */
  private parseImportanceLevel(value: string): 'low' | 'medium' | 'high' | 'critical' | 'all' {
    switch (value.toLowerCase()) {
      case 'low':
      case 'medium':
      case 'high':
      case 'critical':
      case 'all':
        return value.toLowerCase() as any;
      default:
        logInfo('Invalid importance level, using default', {
          component: 'ProviderConfigManager',
          provided: value,
          default: 'all',
        });
        return 'all';
    }
  }
}

// Export singleton instance
export const providerConfigManager = ProviderConfigManager.getInstance();