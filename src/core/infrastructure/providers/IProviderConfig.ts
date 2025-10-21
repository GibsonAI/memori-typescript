import { MemoryImportanceLevel } from '../../types/models';

/**
 * Unified configuration interface for LLM providers
 * Integrates performance optimizations and memory capabilities directly into the provider configuration
 */
export interface IProviderConfig {
  /** API key for the provider */
  apiKey: string;
  /** Model to use for completions */
  model?: string;
  /** Base URL for the provider API (optional, for custom endpoints) */
  baseUrl?: string;
  /** Provider-specific configuration options */
  options?: Record<string, any>;

  /** Legacy memory configuration (for backward compatibility) */
  memory?: {
    /** Whether to enable chat memory recording */
    enableChatMemory?: boolean;
    /** Whether to enable embedding memory recording */
    enableEmbeddingMemory?: boolean;
    /** Memory processing mode */
    memoryProcessingMode?: 'auto' | 'conscious' | 'none';
    /** Minimum importance level for memory storage */
    minImportanceLevel?: 'low' | 'medium' | 'high' | 'critical' | 'all';
    /** Session ID for tracking memory operations */
    sessionId?: string;
  };

  /** Unified feature configuration */
  features?: {
    /** Performance optimization features */
    performance?: {
      /** Enable connection pooling for improved resource management */
      enableConnectionPooling?: boolean;
      /** Enable request/response caching to reduce API calls */
      enableCaching?: boolean;
      /** Enable health monitoring and diagnostics */
      enableHealthMonitoring?: boolean;
      /** Cache TTL settings in milliseconds */
      cacheTTL?: {
        /** TTL for chat completion cache */
        chat?: number;
        /** TTL for embedding cache */
        embedding?: number;
      };
      /** Connection pool configuration */
      connectionPool?: {
        /** Maximum number of connections to maintain */
        maxConnections?: number;
        /** Connection idle timeout in milliseconds */
        idleTimeout?: number;
        /** Maximum wait time for a connection */
        acquireTimeout?: number;
      };
      /** Health monitor configuration */
      healthMonitor?: {
        /** Health check interval in milliseconds */
        checkInterval?: number;
        /** Failure threshold before marking provider unhealthy */
        failureThreshold?: number;
        /** Success rate threshold for health status */
        successRateThreshold?: number;
      };
    };

    /** Memory management features */
    memory?: {
      /** Whether to enable chat memory recording */
      enableChatMemory?: boolean;
      /** Whether to enable embedding memory recording */
      enableEmbeddingMemory?: boolean;
      /** Memory processing mode */
      memoryProcessingMode?: 'auto' | 'conscious' | 'none';
      /** Minimum importance level for memory storage */
      minImportanceLevel?: MemoryImportanceLevel | 'all';
      /** Session ID for tracking memory operations */
      sessionId?: string;
      /** Memory processing batch size for conscious mode */
      batchSize?: number;
      /** Background processing interval for conscious mode (ms) */
      processingInterval?: number;
      /** Memory consolidation settings */
      consolidation?: {
        /** Enable automatic duplicate detection and consolidation */
        enableAutoConsolidation?: boolean;
        /** Similarity threshold for duplicate detection */
        similarityThreshold?: number;
        /** Maximum age of memories to consolidate (days) */
        maxAge?: number;
      };
    };
  };
}

/**
 * Performance configuration extracted from IProviderConfig for internal use
 */
export interface PerformanceConfig {
  enableConnectionPooling: boolean;
  enableCaching: boolean;
  enableHealthMonitoring: boolean;
  cacheTTL: {
    chat: number;
    embedding: number;
  };
  connectionPool: {
    maxConnections: number;
    idleTimeout: number;
    acquireTimeout: number;
  };
  healthMonitor: {
    checkInterval: number;
    failureThreshold: number;
    successRateThreshold: number;
  };
}

/**
 * Memory configuration extracted from IProviderConfig for internal use
 */
export interface MemoryConfig {
  enableChatMemory: boolean;
  enableEmbeddingMemory: boolean;
  memoryProcessingMode: 'auto' | 'conscious' | 'none';
  minImportanceLevel: MemoryImportanceLevel | 'all';
  sessionId?: string;
  batchSize: number;
  processingInterval: number;
  consolidation: {
    enableAutoConsolidation: boolean;
    similarityThreshold: number;
    maxAge: number;
  };
}

/**
 * Default configurations for features
 */
export const DEFAULT_PERFORMANCE_CONFIG: PerformanceConfig = {
  enableConnectionPooling: true,
  enableCaching: true,
  enableHealthMonitoring: true,
  cacheTTL: {
    chat: 300000, // 5 minutes
    embedding: 3600000, // 1 hour
  },
  connectionPool: {
    maxConnections: 10,
    idleTimeout: 30000, // 30 seconds
    acquireTimeout: 5000, // 5 seconds
  },
  healthMonitor: {
    checkInterval: 60000, // 1 minute
    failureThreshold: 3,
    successRateThreshold: 0.95, // 95%
  },
};

export const DEFAULT_MEMORY_CONFIG: MemoryConfig = {
  enableChatMemory: true,
  enableEmbeddingMemory: false,
  memoryProcessingMode: 'auto',
  minImportanceLevel: 'all',
  sessionId: 'default-session',
  batchSize: 10,
  processingInterval: 60000, // 1 minute
  consolidation: {
    enableAutoConsolidation: true,
    similarityThreshold: 0.7, // 70% similarity
    maxAge: 7, // 7 days
  },
};

/**
 * Extract and merge performance configuration from IProviderConfig
 */
export function extractPerformanceConfig(config: IProviderConfig): PerformanceConfig {
  const features = config.features?.performance || {};

  return {
    enableConnectionPooling: features.enableConnectionPooling ?? DEFAULT_PERFORMANCE_CONFIG.enableConnectionPooling,
    enableCaching: features.enableCaching ?? DEFAULT_PERFORMANCE_CONFIG.enableCaching,
    enableHealthMonitoring: features.enableHealthMonitoring ?? DEFAULT_PERFORMANCE_CONFIG.enableHealthMonitoring,
    cacheTTL: {
      chat: features.cacheTTL?.chat ?? DEFAULT_PERFORMANCE_CONFIG.cacheTTL.chat,
      embedding: features.cacheTTL?.embedding ?? DEFAULT_PERFORMANCE_CONFIG.cacheTTL.embedding,
    },
    connectionPool: {
      maxConnections: features.connectionPool?.maxConnections ?? DEFAULT_PERFORMANCE_CONFIG.connectionPool.maxConnections,
      idleTimeout: features.connectionPool?.idleTimeout ?? DEFAULT_PERFORMANCE_CONFIG.connectionPool.idleTimeout,
      acquireTimeout: features.connectionPool?.acquireTimeout ?? DEFAULT_PERFORMANCE_CONFIG.connectionPool.acquireTimeout,
    },
    healthMonitor: {
      checkInterval: features.healthMonitor?.checkInterval ?? DEFAULT_PERFORMANCE_CONFIG.healthMonitor.checkInterval,
      failureThreshold: features.healthMonitor?.failureThreshold ?? DEFAULT_PERFORMANCE_CONFIG.healthMonitor.failureThreshold,
      successRateThreshold: features.healthMonitor?.successRateThreshold ?? DEFAULT_PERFORMANCE_CONFIG.healthMonitor.successRateThreshold,
    },
  };
}

/**
 * Extract and merge memory configuration from IProviderConfig
 */
export function extractMemoryConfig(config: IProviderConfig): MemoryConfig {
  const features = config.features?.memory || {};

  return {
    enableChatMemory: features.enableChatMemory ?? DEFAULT_MEMORY_CONFIG.enableChatMemory,
    enableEmbeddingMemory: features.enableEmbeddingMemory ?? DEFAULT_MEMORY_CONFIG.enableEmbeddingMemory,
    memoryProcessingMode: features.memoryProcessingMode ?? DEFAULT_MEMORY_CONFIG.memoryProcessingMode,
    minImportanceLevel: features.minImportanceLevel ?? DEFAULT_MEMORY_CONFIG.minImportanceLevel,
    sessionId: features.sessionId ?? DEFAULT_MEMORY_CONFIG.sessionId,
    batchSize: features.batchSize ?? DEFAULT_MEMORY_CONFIG.batchSize,
    processingInterval: features.processingInterval ?? DEFAULT_MEMORY_CONFIG.processingInterval,
    consolidation: {
      enableAutoConsolidation: features.consolidation?.enableAutoConsolidation ?? DEFAULT_MEMORY_CONFIG.consolidation.enableAutoConsolidation,
      similarityThreshold: features.consolidation?.similarityThreshold ?? DEFAULT_MEMORY_CONFIG.consolidation.similarityThreshold,
      maxAge: features.consolidation?.maxAge ?? DEFAULT_MEMORY_CONFIG.consolidation.maxAge,
    },
  };
}

/**
 * Extract legacy memory configuration for backward compatibility
 */
export function extractLegacyMemoryConfig(config: IProviderConfig): MemoryConfig {
  const legacy = config.memory || {};

  // Map legacy string importance levels to enum values
  const mapLegacyImportanceLevel = (level?: string): MemoryImportanceLevel | 'all' => {
    if (level === 'all') return 'all';
    switch (level) {
      case 'critical': return MemoryImportanceLevel.CRITICAL;
      case 'high': return MemoryImportanceLevel.HIGH;
      case 'medium': return MemoryImportanceLevel.MEDIUM;
      case 'low': return MemoryImportanceLevel.LOW;
      default: return DEFAULT_MEMORY_CONFIG.minImportanceLevel;
    }
  };

  return {
    enableChatMemory: legacy.enableChatMemory ?? DEFAULT_MEMORY_CONFIG.enableChatMemory,
    enableEmbeddingMemory: legacy.enableEmbeddingMemory ?? DEFAULT_MEMORY_CONFIG.enableEmbeddingMemory,
    memoryProcessingMode: legacy.memoryProcessingMode ?? DEFAULT_MEMORY_CONFIG.memoryProcessingMode,
    minImportanceLevel: mapLegacyImportanceLevel(legacy.minImportanceLevel),
    sessionId: legacy.sessionId ?? DEFAULT_MEMORY_CONFIG.sessionId,
    batchSize: DEFAULT_MEMORY_CONFIG.batchSize,
    processingInterval: DEFAULT_MEMORY_CONFIG.processingInterval,
    consolidation: DEFAULT_MEMORY_CONFIG.consolidation,
  };
}