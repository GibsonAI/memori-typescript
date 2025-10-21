/**
 * Unified Base Configuration and Performance Types
 *
 * This file consolidates common interfaces and types used across the memori-ts
 * project to eliminate DRY principle violations and improve maintainability.
 */

import { z } from 'zod';

// ===== BASE CONFIGURATION INTERFACES =====

/**
 * Unified base configuration interface for all memori-ts system components
 *
 * This interface provides a comprehensive set of configuration options that all
 * components in the memori-ts ecosystem should support. It consolidates common
 * settings for performance, security, processing modes, and component-specific
 * options into a single, well-structured configuration object.
 *
 * The BaseConfig interface follows the principle of progressive disclosure,
 * allowing components to specify only the configuration they need while
 * maintaining type safety and discoverability.
 *
 * @example
 * ```typescript
 * const config: BaseConfig = {
 *   enabled: true,
 *   namespace: 'search-service',
 *   timeout: 30000,
 *   debugMode: false,
 *   priority: 50,
 *   autoIngest: true,
 *   performance: {
 *     enableMetrics: true,
 *     enableCaching: true,
 *     cacheSize: 1000,
 *     collectionInterval: 5000,
 *     maxResults: 100
 *   },
 *   security: {
 *     enableAuditLogging: true,
 *     dataRetentionDays: 365,
 *     encryptionEnabled: false
 *   },
 *   options: {
 *     customSetting: 'value'
 *   }
 * };
 * ```
 */
export interface BaseConfig {
  // ===== UNIVERSAL PROPERTIES =====

  /** Whether this component is enabled and active */
  enabled: boolean;

  /**
   * Optional namespace identifier for component isolation
   * Useful for multi-tenant deployments or component grouping
   */
  namespace?: string;

  /**
   * Default timeout for operations in milliseconds
   * Individual operations may override this value
   */
  timeout: number;

  /**
   * Enable debug mode for additional logging and validation
   * Should only be used in development environments
   */
  debugMode?: boolean;

  /**
   * Priority level for component execution (0-100)
   * Higher values indicate higher priority
   */
  priority?: number;

  // ===== PROCESSING MODES =====

  /**
   * Enable automatic ingestion of new data
   * When true, the component will automatically process new inputs
   */
  autoIngest?: boolean;

  /**
   * Enable conscious processing mode
   * When true, enables advanced AI-driven processing capabilities
   */
  consciousIngest?: boolean;

  /**
   * Background update interval in milliseconds
   * Controls how often the component performs background maintenance
   */
  backgroundUpdateInterval?: number;

  // ===== PERFORMANCE SETTINGS =====

  /**
   * Performance monitoring and optimization settings
   * Configures how the component handles performance-related features
   */
  performance?: {
    /** Enable collection of performance metrics */
    enableMetrics?: boolean;

    /** Enable result caching for improved performance */
    enableCaching?: boolean;

    /** Maximum number of entries to cache */
    cacheSize?: number;

    /** Interval for collecting performance data (milliseconds) */
    collectionInterval?: number;

    /** Maximum number of results to return in operations */
    maxResults?: number;
  };

  // ===== SECURITY SETTINGS =====

  /**
   * Security and audit configuration
   * Controls security-related features and compliance settings
   */
  security?: {
    /** Enable security audit logging for compliance */
    enableAuditLogging?: boolean;

    /** Data retention period in days for audit purposes */
    dataRetentionDays?: number;

    /** Enable encryption for sensitive data */
    encryptionEnabled?: boolean;
  };

  // ===== COMPONENT OPTIONS =====

  /**
   * Component-specific configuration options
   * Allows components to accept custom configuration without
   * extending the base interface
   */
  options?: Record<string, unknown>;
}

/**
 * Provider-specific configuration interface
 * Extends BaseConfig with provider-specific options
 */
export interface ProviderConfig extends BaseConfig {
  /** API key for external service authentication */
  apiKey: string;
  /** Base URL for API endpoints */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeout: number;
  /** Number of retry attempts for failed requests */
  retryAttempts: number;
  /** Model name or identifier */
  model?: string;
}

/**
 * Search strategy configuration interface
 * Extends BaseConfig with search-specific options
 */
export interface SearchStrategyConfig extends BaseConfig {
  /** Unique name identifier for the strategy */
  strategyName: string;
  /** Priority for strategy execution order (0-100, higher = more priority) */
  priority: number;
  /** Strategy-specific timeout in milliseconds */
  timeout: number;
  /** Maximum number of results to return */
  maxResults: number;
  /** Scoring weights for result ranking */
  scoring: {
    /** Base relevance weight */
    baseWeight: number;
    /** Recency boost weight */
    recencyWeight: number;
    /** Importance score weight */
    importanceWeight: number;
    /** Relationship strength weight */
    relationshipWeight: number;
  };
  /** Strategy-specific configuration options */
  strategySpecific?: Record<string, unknown>;
}

/**
 * Database configuration interface
 * Extends BaseConfig with database-specific options
 */
export interface DatabaseConfig extends BaseConfig {
  /** Database connection URL */
  url: string;
  /** Enable Full-Text Search support */
  enableFTS: boolean;
  /** Enable database performance monitoring */
  enablePerformanceMonitoring: boolean;
  /** Connection pool size */
  connectionPoolSize: number;
  /** Query timeout in milliseconds */
  queryTimeout: number;
}

// ===== PERFORMANCE METRICS INTERFACES =====

/**
 * Unified PerformanceMetrics interface for comprehensive performance tracking across memori-ts
 *
 * This interface consolidates common performance tracking properties used across all major
 * system components including DatabaseManager, SearchStrategyConfigManager, SearchService,
 * and OpenAI integration. It provides a standardized way to monitor system performance,
 * identify bottlenecks, and track operational health.
 *
 * The interface follows cognitive load optimization principles by maintaining a simple,
 * predictable structure while providing comprehensive tracking capabilities. All properties
 * are designed to be easily serializable and suitable for both real-time monitoring
 * and historical analysis.
 *
 * @example
 * ```typescript
 * // Database operation tracking
 * const dbMetrics: PerformanceMetrics = {
 *   totalOperations: 1500,
 *   successfulOperations: 1485,
 *   failedOperations: 15,
 *   averageOperationTime: 45.2,
 *   lastOperationTime: new Date(),
 *   errorRate: 1.0,
 *   memoryUsage: 256000000,
 *   operationBreakdown: new Map([
 *     ['SELECT', 1200],
 *     ['INSERT', 200],
 *     ['UPDATE', 100]
 *   ]),
 *   errorBreakdown: new Map([
 *     ['connection_timeout', 10],
 *     ['syntax_error', 5]
 *   ]),
 *   metadata: { component: 'DatabaseManager' }
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Search service tracking
 * const searchMetrics: PerformanceMetrics = {
 *   totalOperations: 3200,
 *   successfulOperations: 3180,
 *   failedOperations: 20,
 *   averageOperationTime: 125.5,
 *   lastOperationTime: new Date(),
 *   errorRate: 0.62,
 *   memoryUsage: 128000000,
 *   operationBreakdown: new Map([
 *     ['fts_search', 2000],
 *     ['like_search', 800],
 *     ['recent_search', 400]
 *   ]),
 *   errorBreakdown: new Map([
 *     ['timeout', 12],
 *     ['invalid_query', 8]
 *   ]),
 *   metadata: { component: 'SearchService', strategies: ['FTS5', 'LIKE'] }
 * };
 * ```
 *
 * @example
 * ```typescript
 * // Configuration manager tracking
 * const configMetrics: PerformanceMetrics = {
 *   totalOperations: 450,
 *   successfulOperations: 445,
 *   failedOperations: 5,
 *   averageOperationTime: 12.3,
 *   lastOperationTime: new Date(),
 *   errorRate: 1.11,
 *   memoryUsage: 32000000,
 *   operationBreakdown: new Map([
 *     ['load', 300],
 *     ['save', 100],
 *     ['validate', 50]
 *   ]),
 *   errorBreakdown: new Map([
 *     ['file_not_found', 3],
 *     ['validation_error', 2]
 *   ]),
 *   metadata: { component: 'SearchStrategyConfigManager' }
 * };
 * ```
 *
 * @example
 * ```typescript
 * // OpenAI integration tracking
 * const openaiMetrics: PerformanceMetrics = {
 *   totalOperations: 800,
 *   successfulOperations: 790,
 *   failedOperations: 10,
 *   averageOperationTime: 850.0,
 *   lastOperationTime: new Date(),
 *   errorRate: 1.25,
 *   memoryUsage: 64000000,
 *   operationBreakdown: new Map([
 *     ['chat_completion', 600],
 *     ['embedding', 200]
 *   ]),
 *   errorBreakdown: new Map([
 *     ['rate_limit', 6],
 *     ['api_error', 4]
 *   ]),
 *   metadata: { component: 'OpenAIProvider', model: 'gpt-4o-mini' }
 * };
 * ```
 *
 * @usagePatterns
 * - **Real-time Monitoring**: Use for live dashboards and alerting systems
 * - **Historical Analysis**: Track performance trends over time
 * - **Component Comparison**: Compare performance across different system components
 * - **Capacity Planning**: Identify resource usage patterns and scaling needs
 * - **Error Analysis**: Break down error types and frequencies for debugging
 * - **Performance Optimization**: Identify bottlenecks and optimization opportunities
 */
export interface PerformanceMetrics {
  /** Total number of operations performed across all components */
  totalOperations: number;

  /** Number of operations that completed successfully */
  successfulOperations: number;

  /** Number of operations that failed */
  failedOperations: number;

  /** Average time taken for operations in milliseconds */
  averageOperationTime: number;

  /** Timestamp when the most recent operation occurred */
  lastOperationTime: Date;

  /** Error rate expressed as a percentage (0-100) */
  errorRate: number;

  /** Current memory usage in bytes */
  memoryUsage: number;

  /** Peak memory usage in bytes */
  peakMemoryUsage: number;

  /** Detailed breakdown of operations categorized by type or component */
  operationBreakdown: Map<string, number>;

  /** Detailed breakdown of errors categorized by error type or component */
  errorBreakdown: Map<string, number>;

  /** Historical performance data for trend analysis */
  trends: PerformanceTrend[];

  /** Additional component-specific metadata for enhanced tracking and debugging */
  metadata?: Record<string, unknown>;
}

/**
 * Performance trend data structure
 * Tracks performance changes over time for analysis
 */
export interface PerformanceTrend {
  /** Timestamp when this trend data was recorded */
  timestamp: Date;
  /** Operation time at this point */
  operationTime: number;
  /** Memory usage at this point */
  memoryUsage: number;
  /** Number of operations in this period */
  operationCount: number;
  /** Number of errors in this period */
  errorCount: number;
  /** Component or module name */
  component: string;
}

/**
 * Performance monitoring configuration
 * Unified configuration for all performance monitoring features
 */
export interface PerformanceMonitoringConfig {
  /** Whether performance monitoring is enabled */
  enabled: boolean;
  /** Interval for collecting performance data (milliseconds) */
  collectionInterval: number;
  /** How long to retain performance data (milliseconds) */
  retentionPeriod: number;
  /** Threshold for identifying slow operations (milliseconds) */
  slowOperationThreshold: number;
  /** Alert thresholds for different metrics */
  alertThresholds: {
    /** Maximum acceptable response time */
    maxResponseTime: number;
    /** Maximum acceptable error rate (0-1) */
    maxErrorRate: number;
    /** Maximum acceptable memory usage */
    maxMemoryUsage: number;
  };
}

// ===== LOGGER CONFIGURATION =====

/**
 * Unified logger configuration
 * Consolidates logger configurations found across modules
 */
export interface LoggerConfig {
  /** Logging level */
  level: LogLevel;
  /** Whether to enable console output */
  enableConsole: boolean;
  /** Whether to enable file output */
  enableFile: boolean;
  /** Log file path (if file output enabled) */
  filePath?: string;
  /** Maximum log file size in bytes */
  maxFileSize?: number;
  /** Number of backup log files to keep */
  maxFiles?: number;
  /** Whether to enable JSON formatting */
  jsonFormat: boolean;
  /** Whether to include timestamps */
  includeTimestamp: boolean;
  /** Whether to include component names */
  includeComponent: boolean;
}

/**
 * Log levels enumeration
 */
export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
  TRACE = 'trace'
}

// ===== ERROR HANDLING INTERFACES =====

/**
 * Unified error context interface
 * Provides consistent error context across all modules
 */
export interface ErrorContext {
  /** Component or module where error occurred */
  component: string;
  /** Operation being performed when error occurred */
  operation: string;
  /** Error severity level */
  severity: 'low' | 'medium' | 'high' | 'critical';
  /** Timestamp when error occurred */
  timestamp: Date;
  /** Additional context information */
  context?: Record<string, unknown>;
  /** Error code for programmatic handling */
  code?: string;
  /** Whether this error is recoverable */
  recoverable: boolean;
}

/**
 * Base error class for all memori-ts errors
 * Provides consistent error structure and context
 */
export abstract class MemoriError extends Error {
  public readonly context: ErrorContext;
  public readonly originalError?: Error;

  constructor(message: string, context: ErrorContext, originalError?: Error) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
    this.originalError = originalError;
  }

  /**
   * Get a structured error representation for logging
   */
  public toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      message: this.message,
      context: this.context,
      originalError: this.originalError?.message,
      stack: this.stack,
    };
  }
}

/**
 * Configuration validation error
 */
export class ConfigurationError extends MemoriError {
  constructor(message: string, context: ErrorContext, originalError?: Error) {
    super(message, { ...context, severity: 'high', recoverable: false }, originalError);
  }
}

/**
 * Security-related error
 */
export class SecurityError extends MemoriError {
  constructor(message: string, context: ErrorContext, originalError?: Error) {
    super(message, { ...context, severity: 'critical', recoverable: false }, originalError);
  }
}

// ===== VALIDATION SCHEMAS =====

/**
 * Zod schema for BaseConfig validation
 * Provides comprehensive validation for the unified BaseConfig interface
 */
export const BaseConfigSchema = z.object({
  // ===== UNIVERSAL PROPERTIES =====
  enabled: z.boolean().default(true),
  namespace: z.string().optional(),
  timeout: z.number().min(1000).max(300000).default(30000),
  debugMode: z.boolean().default(false),
  priority: z.number().min(0).max(100).default(50),

  // ===== PROCESSING MODES =====
  autoIngest: z.boolean().default(true),
  consciousIngest: z.boolean().default(false),
  backgroundUpdateInterval: z.number().min(1000).max(3600000).default(300000),

  // ===== PERFORMANCE SETTINGS =====
  performance: z.object({
    enableMetrics: z.boolean().default(true),
    enableCaching: z.boolean().default(true),
    cacheSize: z.number().min(0).max(10000).default(1000),
    collectionInterval: z.number().min(1000).max(60000).default(5000),
    maxResults: z.number().min(1).max(10000).default(100),
  }).optional(),

  // ===== SECURITY SETTINGS =====
  security: z.object({
    enableAuditLogging: z.boolean().default(true),
    dataRetentionDays: z.number().min(1).max(3650).default(365),
    encryptionEnabled: z.boolean().default(false),
  }).optional(),

  // ===== COMPONENT OPTIONS =====
  options: z.record(z.unknown()).optional(),
});

/**
 * Zod schema for ProviderConfig validation
 */
export const ProviderConfigSchema = BaseConfigSchema.extend({
  apiKey: z.string().min(1, 'API key is required'),
  baseUrl: z.string().url().optional(),
  timeout: z.number().min(1000).max(300000).default(30000),
  retryAttempts: z.number().min(0).max(10).default(3),
  model: z.string().optional(),
});

/**
 * Zod schema for SearchStrategyConfig validation
 */
export const SearchStrategyConfigSchema = BaseConfigSchema.extend({
  strategyName: z.string().min(1, 'Strategy name is required'),
  priority: z.number().min(0).max(100).default(50),
  timeout: z.number().min(1000).max(60000).default(10000),
  maxResults: z.number().min(1).max(10000).default(100),
  scoring: z.object({
    baseWeight: z.number().min(0).max(2).default(1.0),
    recencyWeight: z.number().min(0).max(2).default(0.2),
    importanceWeight: z.number().min(0).max(2).default(0.8),
    relationshipWeight: z.number().min(0).max(2).default(0.3),
  }),
  strategySpecific: z.record(z.unknown()).optional(),
});

/**
 * Zod schema for DatabaseConfig validation
 */
export const DatabaseConfigSchema = BaseConfigSchema.extend({
  url: z.string().min(1, 'Database URL is required'),
  enableFTS: z.boolean().default(true),
  enablePerformanceMonitoring: z.boolean().default(true),
  connectionPoolSize: z.number().min(1).max(100).default(10),
  queryTimeout: z.number().min(1000).max(300000).default(30000),
});

/**
 * Zod schema for PerformanceMetrics validation
 */
export const PerformanceMetricsSchema = z.object({
  totalOperations: z.number().min(0).default(0),
  successfulOperations: z.number().min(0).default(0),
  failedOperations: z.number().min(0).default(0),
  averageOperationTime: z.number().min(0).default(0),
  lastOperationTime: z.date().default(() => new Date()),
  errorRate: z.number().min(0).max(100).default(0),
  memoryUsage: z.number().min(0).default(0),
  peakMemoryUsage: z.number().min(0).default(0),
  operationBreakdown: z.map(z.string(), z.number()).default(new Map()),
  errorBreakdown: z.map(z.string(), z.number()).default(new Map()),
  trends: z.array(z.object({
    timestamp: z.date(),
    operationTime: z.number(),
    memoryUsage: z.number(),
    operationCount: z.number(),
    errorCount: z.number(),
    component: z.string(),
  })).default([]),
  metadata: z.record(z.unknown()).optional(),
});

/**
 * Zod schema for LoggerConfig validation
 */
export const LoggerConfigSchema = z.object({
  level: z.nativeEnum(LogLevel).default(LogLevel.INFO),
  enableConsole: z.boolean().default(true),
  enableFile: z.boolean().default(false),
  filePath: z.string().optional(),
  maxFileSize: z.number().min(1024).max(1024 * 1024 * 100).default(1024 * 1024 * 10), // 10MB default
  maxFiles: z.number().min(1).max(100).default(5),
  jsonFormat: z.boolean().default(false),
  includeTimestamp: z.boolean().default(true),
  includeComponent: z.boolean().default(true),
});

// ===== UTILITY FUNCTIONS =====

/**
 * Type guard to check if a configuration object extends BaseConfig
 */
export function isBaseConfig(config: unknown): config is BaseConfig {
  return typeof config === 'object' &&
         config !== null &&
         'enabled' in config &&
         'timeout' in config &&
         typeof (config as any).enabled === 'boolean' &&
         typeof (config as any).timeout === 'number';
}

/**
 * Type guard to check if a configuration object is a valid ProviderConfig
 */
export function isProviderConfig(config: unknown): config is ProviderConfig {
  return isBaseConfig(config) &&
         'apiKey' in config &&
         'timeout' in config &&
         'retryAttempts' in config;
}

/**
 * Type guard to check if a configuration object is a valid SearchStrategyConfig
 */
export function isSearchStrategyConfig(config: unknown): config is SearchStrategyConfig {
  return isBaseConfig(config) &&
         'strategyName' in config &&
         'priority' in config &&
         'maxResults' in config &&
         'scoring' in config;
}

/**
 * Type guard to check if metrics object is valid PerformanceMetrics
 */
export function isPerformanceMetrics(metrics: unknown): metrics is PerformanceMetrics {
  return typeof metrics === 'object' &&
         metrics !== null &&
         'totalOperations' in metrics &&
         'successfulOperations' in metrics &&
         'averageOperationTime' in metrics;
}

/**
 * Deep merge two configuration objects
 */
export function mergeConfigs<T extends BaseConfig>(base: T, override: Partial<T>): T {
  const merged = { ...base };

  for (const [key, value] of Object.entries(override)) {
    if (value !== undefined) {
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        // Recursively merge nested objects
        (merged as any)[key] = mergeConfigs((merged as any)[key] || {}, value as any);
      } else {
        (merged as any)[key] = value;
      }
    }
  }

  return merged;
}

/**
 * Validate configuration against schema and return detailed results
 */
export function validateConfig<T>(
  config: unknown,
  schema: z.ZodSchema<T>
): { isValid: boolean; errors: string[]; warnings: string[]; validatedConfig?: T } {
  try {
    const validatedConfig = schema.parse(config);
    return {
      isValid: true,
      errors: [],
      warnings: [],
      validatedConfig,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        isValid: false,
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`),
        warnings: [],
      };
    }

    return {
      isValid: false,
      errors: [error instanceof Error ? error.message : String(error)],
      warnings: [],
    };
  }
}