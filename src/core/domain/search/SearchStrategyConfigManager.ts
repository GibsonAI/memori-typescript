import {
  SearchStrategyConfig,
  ConfigurationValidationResult,
  ConfigurationManager,
  ConfigurationPersistenceManager,
  ConfigurationAuditManager,
  ConfigurationAuditEntry,
  SearchStrategy,
} from './types';
import { promises as fs } from 'fs';
import { logError, logWarn, logInfo } from '../../infrastructure/config/Logger';
import { join, dirname } from 'path';
import { createHash } from 'crypto';
import { BackupMetadata } from './types';

// ===== PERFORMANCE MONITORING INTERFACES FOR CONFIG MANAGER =====

/**
 * Configuration performance metrics
 */
interface ConfigurationPerformanceMetrics {
  totalOperations: number;
  averageOperationTime: number;
  operationsByType: Map<string, number>;
  errorCounts: Map<string, number>;
  cacheHitRate: number;
  persistenceLatency: number;
  validationLatency: number;
  lastOperationTime: number;
}

/**
 * Configuration operation performance data
 */
interface ConfigurationOperationMetrics {
  operationType: string;
  strategyName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  error?: string;
  cacheUsed: boolean;
  persistenceRequired: boolean;
}

/**
 * Default configuration templates for each search strategy
 */
const DEFAULT_STRATEGY_CONFIGS: Record<SearchStrategy, SearchStrategyConfig> = {
  [SearchStrategy.FTS5]: {
    strategyName: SearchStrategy.FTS5,
    enabled: true,
    priority: 10,
    timeout: 10000,
    maxResults: 100,
    performance: {
      enableMetrics: true,
      enableCaching: true,
      cacheSize: 1000,
      enableParallelExecution: false,
    },
    scoring: {
      baseWeight: 1.0,
      recencyWeight: 0.2,
      importanceWeight: 0.8,
      relationshipWeight: 0.3,
    },
    strategySpecific: {
      bm25Weights: {
        title: 2.0,
        content: 1.0,
        category: 1.5,
      },
      queryTimeout: 10000,
      resultBatchSize: 100,
    },
  },
  [SearchStrategy.LIKE]: {
    strategyName: SearchStrategy.LIKE,
    enabled: true,
    priority: 5,
    timeout: 5000,
    maxResults: 100,
    performance: {
      enableMetrics: true,
      enableCaching: true,
      cacheSize: 500,
      enableParallelExecution: false,
    },
    scoring: {
      baseWeight: 0.8,
      recencyWeight: 0.1,
      importanceWeight: 0.6,
      relationshipWeight: 0.2,
    },
    strategySpecific: {
      wildcardSensitivity: 'medium',
      maxWildcardTerms: 10,
      enablePhraseSearch: true,
      caseSensitive: false,
      relevanceBoost: {
        exactMatch: 1.5,
        prefixMatch: 1.2,
        suffixMatch: 1.1,
        partialMatch: 1.0,
      },
    },
  },
  [SearchStrategy.RECENT]: {
    strategyName: SearchStrategy.RECENT,
    enabled: true,
    priority: 3,
    timeout: 3000,
    maxResults: 50,
    performance: {
      enableMetrics: true,
      enableCaching: true,
      cacheSize: 200,
      enableParallelExecution: false,
    },
    scoring: {
      baseWeight: 0.9,
      recencyWeight: 1.0,
      importanceWeight: 0.4,
      relationshipWeight: 0.1,
    },
    strategySpecific: {
      timeWindows: {
        recent: 24 * 60 * 60 * 1000, // 24 hours
        today: 24 * 60 * 60 * 1000,  // 24 hours
        week: 7 * 24 * 60 * 60 * 1000, // 7 days
        month: 30 * 24 * 60 * 60 * 1000, // 30 days
      },
      maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
    },
  },
  [SearchStrategy.SEMANTIC]: {
    strategyName: SearchStrategy.SEMANTIC,
    enabled: false,
    priority: 8,
    timeout: 15000,
    maxResults: 50,
    performance: {
      enableMetrics: true,
      enableCaching: true,
      cacheSize: 200,
      enableParallelExecution: false,
    },
    scoring: {
      baseWeight: 0.7,
      recencyWeight: 0.3,
      importanceWeight: 0.5,
      relationshipWeight: 0.4,
    },
    strategySpecific: {
      similarityThreshold: 0.7,
      embeddingModel: 'all-MiniLM-L6-v2',
      maxTokens: 512,
      enableReranking: true,
    },
  },
  [SearchStrategy.CATEGORY_FILTER]: {
    strategyName: SearchStrategy.CATEGORY_FILTER,
    enabled: true,
    priority: 7,
    timeout: 5000,
    maxResults: 200,
    performance: {
      enableMetrics: true,
      enableCaching: true,
      cacheSize: 300,
      enableParallelExecution: true,
    },
    scoring: {
      baseWeight: 0.6,
      recencyWeight: 0.2,
      importanceWeight: 0.3,
      relationshipWeight: 0.1,
    },
    strategySpecific: {
      hierarchy: {
        maxDepth: 5,
        enableCaching: true,
      },
      performance: {
        enableQueryOptimization: true,
        enableResultCaching: true,
        maxExecutionTime: 10000,
        batchSize: 100,
      },
    },
  },
  [SearchStrategy.TEMPORAL_FILTER]: {
    strategyName: SearchStrategy.TEMPORAL_FILTER,
    enabled: true,
    priority: 6,
    timeout: 5000,
    maxResults: 200,
    performance: {
      enableMetrics: true,
      enableCaching: true,
      cacheSize: 300,
      enableParallelExecution: true,
    },
    scoring: {
      baseWeight: 0.6,
      recencyWeight: 0.9,
      importanceWeight: 0.3,
      relationshipWeight: 0.1,
    },
    strategySpecific: {
      naturalLanguage: {
        enableParsing: true,
        enablePatternMatching: true,
        confidenceThreshold: 0.3,
      },
      performance: {
        enableQueryOptimization: true,
        enableResultCaching: true,
        maxExecutionTime: 10000,
        batchSize: 100,
      },
    },
  },
  [SearchStrategy.METADATA_FILTER]: {
    strategyName: SearchStrategy.METADATA_FILTER,
    enabled: true,
    priority: 4,
    timeout: 5000,
    maxResults: 200,
    performance: {
      enableMetrics: true,
      enableCaching: true,
      cacheSize: 300,
      enableParallelExecution: true,
    },
    scoring: {
      baseWeight: 0.6,
      recencyWeight: 0.2,
      importanceWeight: 0.7,
      relationshipWeight: 0.2,
    },
    strategySpecific: {
      fields: {
        enableNestedAccess: true,
        maxDepth: 5,
        enableTypeValidation: true,
        enableFieldDiscovery: true,
      },
      validation: {
        strictValidation: false,
        enableCustomValidators: true,
        failOnInvalidMetadata: false,
      },
      performance: {
        enableQueryOptimization: true,
        enableResultCaching: true,
        maxExecutionTime: 10000,
        batchSize: 100,
        cacheSize: 100,
      },
    },
  },
  [SearchStrategy.RELATIONSHIP]: {
    strategyName: SearchStrategy.RELATIONSHIP,
    enabled: true,
    priority: 9,
    timeout: 8000,
    maxResults: 100,
    performance: {
      enableMetrics: true,
      enableCaching: true,
      cacheSize: 400,
      enableParallelExecution: false,
    },
    scoring: {
      baseWeight: 0.8,
      recencyWeight: 0.2,
      importanceWeight: 0.6,
      relationshipWeight: 1.0,
    },
    strategySpecific: {
      maxDepth: 3,
      minRelationshipStrength: 0.3,
      minRelationshipConfidence: 0.5,
      includeRelationshipPaths: true,
      traversalStrategy: 'strength_weighted',
    },
  },
};

/**
 * Configuration validation utilities
 */
class ConfigurationValidator {
  /**
   * Validate a complete strategy configuration
   */
  static validateConfiguration(config: SearchStrategyConfig): ConfigurationValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate strategy name
    if (!config.strategyName || typeof config.strategyName !== 'string') {
      errors.push('Strategy name is required and must be a string');
    }

    // Validate enabled flag
    if (typeof config.enabled !== 'boolean') {
      errors.push('Enabled flag must be a boolean');
    }

    // Validate priority
    if (typeof config.priority !== 'number' || config.priority < 0 || config.priority > 100) {
      errors.push('Priority must be a number between 0 and 100');
    }

    // Validate timeout
    if (typeof config.timeout !== 'number' || config.timeout < 1000 || config.timeout > 60000) {
      errors.push('Timeout must be a number between 1000ms and 60000ms');
    }

    // Validate maxResults
    if (typeof config.maxResults !== 'number' || config.maxResults < 1 || config.maxResults > 10000) {
      errors.push('MaxResults must be a number between 1 and 10000');
    }

    // Validate performance settings
    if (!config.performance || typeof config.performance !== 'object') {
      errors.push('Performance settings are required');
    } else {
      const perf = config.performance;
      if (typeof perf.enableCaching !== 'boolean') {
        errors.push('Performance.enableCaching must be a boolean');
      }
      if (typeof perf.cacheSize !== 'number' || perf.cacheSize < 0 || perf.cacheSize > 10000) {
        errors.push('Performance.cacheSize must be a number between 0 and 10000');
      }
      if (typeof perf.enableParallelExecution !== 'boolean') {
        errors.push('Performance.enableParallelExecution must be a boolean');
      }
    }

    // Validate scoring weights
    if (!config.scoring || typeof config.scoring !== 'object') {
      errors.push('Scoring settings are required');
    } else {
      const scoring = config.scoring;
      const weightFields = ['baseWeight', 'recencyWeight', 'importanceWeight', 'relationshipWeight'];
      for (const field of weightFields) {
        const value = (scoring as any)[field];
        if (typeof value !== 'number' || value < 0 || value > 2) {
          errors.push(`Scoring.${field} must be a number between 0 and 2`);
        }
      }
    }

    // Validate strategy-specific settings
    if (config.strategySpecific) {
      const strategySpecificValidation = this.validateStrategySpecificSettings(config.strategyName, config.strategySpecific);
      errors.push(...strategySpecificValidation.errors);
      warnings.push(...strategySpecificValidation.warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      validatedConfig: errors.length === 0 ? config : undefined,
    };
  }

  /**
   * Validate strategy-specific configuration settings
   */
  private static validateStrategySpecificSettings(strategyName: string, settings: Record<string, unknown>): ConfigurationValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    switch (strategyName) {
      case SearchStrategy.FTS5:
        this.validateFTS5Settings(settings, errors, warnings);
        break;
      case SearchStrategy.LIKE:
        this.validateLikeSettings(settings, errors, warnings);
        break;
      case SearchStrategy.RECENT:
        this.validateRecentSettings(settings, errors, warnings);
        break;
      case SearchStrategy.SEMANTIC:
        this.validateSemanticSettings(settings, errors, warnings);
        break;
      case SearchStrategy.CATEGORY_FILTER:
        this.validateCategoryFilterSettings(settings, errors, warnings);
        break;
      case SearchStrategy.TEMPORAL_FILTER:
        this.validateTemporalFilterSettings(settings, errors, warnings);
        break;
      case SearchStrategy.METADATA_FILTER:
        this.validateMetadataFilterSettings(settings, errors, warnings);
        break;
      case SearchStrategy.RELATIONSHIP:
        this.validateRelationshipSettings(settings, errors, warnings);
        break;
      default:
        warnings.push(`Unknown strategy: ${strategyName}`);
    }

    return { isValid: errors.length === 0, errors, warnings };
  }

  private static validateFTS5Settings(settings: Record<string, unknown>, errors: string[], _warnings: string[]): void {
    const bm25Weights = settings.bm25Weights as any;
    if (bm25Weights) {
      if (typeof bm25Weights.title !== 'number' || bm25Weights.title < 0 || bm25Weights.title > 10) {
        errors.push('FTS5 bm25Weights.title must be a number between 0 and 10');
      }
      if (typeof bm25Weights.content !== 'number' || bm25Weights.content < 0 || bm25Weights.content > 10) {
        errors.push('FTS5 bm25Weights.content must be a number between 0 and 10');
      }
      if (typeof bm25Weights.category !== 'number' || bm25Weights.category < 0 || bm25Weights.category > 10) {
        errors.push('FTS5 bm25Weights.category must be a number between 0 and 10');
      }
    }

    if (settings.queryTimeout && (typeof settings.queryTimeout !== 'number' || settings.queryTimeout < 1000 || settings.queryTimeout > 30000)) {
      errors.push('FTS5 queryTimeout must be a number between 1000 and 30000');
    }
  }

  private static validateLikeSettings(settings: Record<string, unknown>, errors: string[], _warnings: string[]): void {
    if (settings.wildcardSensitivity && !['low', 'medium', 'high'].includes(settings.wildcardSensitivity as string)) {
      errors.push('LIKE wildcardSensitivity must be one of: low, medium, high');
    }

    if (settings.maxWildcardTerms && (typeof settings.maxWildcardTerms !== 'number' || settings.maxWildcardTerms < 1 || settings.maxWildcardTerms > 50)) {
      errors.push('LIKE maxWildcardTerms must be a number between 1 and 50');
    }

    if (settings.relevanceBoost) {
      // @eslint-disable-next-line @typescript-eslint/no-explicit-any
      const boost = settings.relevanceBoost as any;
      const boostFields = ['exactMatch', 'prefixMatch', 'suffixMatch', 'partialMatch'];
      for (const field of boostFields) {
        if (boost[field] !== undefined && (typeof boost[field] !== 'number' || boost[field] < 0.1 || boost[field] > 5)) {
          errors.push(`LIKE relevanceBoost.${field} must be a number between 0.1 and 5`);
        }
      }
    }
  }

  private static validateRecentSettings(settings: Record<string, unknown>, errors: string[], _warnings: string[]): void {
    if (settings.maxAge && (typeof settings.maxAge !== 'number' || settings.maxAge < 60000)) {
      errors.push('Recent maxAge must be a number greater than 60000ms (1 minute)');
    }

    if (settings.timeWindows) {
      const windows = settings.timeWindows as any;
      if (windows.recent && (typeof windows.recent !== 'number' || windows.recent < 1000)) {
        errors.push('Recent timeWindows.recent must be a number greater than 1000ms');
      }
    }
  }

  private static validateSemanticSettings(settings: Record<string, unknown>, errors: string[], _warnings: string[]): void {
    if (settings.similarityThreshold && (typeof settings.similarityThreshold !== 'number' || settings.similarityThreshold < 0 || settings.similarityThreshold > 1)) {
      errors.push('Semantic similarityThreshold must be a number between 0 and 1');
    }

    if (settings.maxTokens && (typeof settings.maxTokens !== 'number' || settings.maxTokens < 64 || settings.maxTokens > 2048)) {
      errors.push('Semantic maxTokens must be a number between 64 and 2048');
    }
  }

  private static validateCategoryFilterSettings(settings: Record<string, unknown>, errors: string[], _warnings: string[]): void {
    const hierarchy = settings.hierarchy as any;
    if (hierarchy?.maxDepth && (typeof hierarchy.maxDepth !== 'number' || hierarchy.maxDepth < 1 || hierarchy.maxDepth > 10)) {
      errors.push('CategoryFilter hierarchy.maxDepth must be a number between 1 and 10');
    }
  }

  private static validateTemporalFilterSettings(settings: Record<string, unknown>, errors: string[], _warnings: string[]): void {
    const naturalLanguage = settings.naturalLanguage as any;
    if (naturalLanguage?.confidenceThreshold && (typeof naturalLanguage.confidenceThreshold !== 'number' || naturalLanguage.confidenceThreshold < 0 || naturalLanguage.confidenceThreshold > 1)) {
      errors.push('TemporalFilter naturalLanguage.confidenceThreshold must be a number between 0 and 1');
    }
  }

  private static validateMetadataFilterSettings(settings: Record<string, unknown>, errors: string[], _warnings: string[]): void {
    const fields = settings.fields as any;
    if (fields?.maxDepth && (typeof fields.maxDepth !== 'number' || fields.maxDepth < 1 || fields.maxDepth > 20)) {
      errors.push('MetadataFilter fields.maxDepth must be a number between 1 and 20');
    }
  }

  private static validateRelationshipSettings(settings: Record<string, unknown>, errors: string[], _warnings: string[]): void {
    if (settings.maxDepth && (typeof settings.maxDepth !== 'number' || settings.maxDepth < 1 || settings.maxDepth > 10)) {
      errors.push('Relationship maxDepth must be a number between 1 and 10');
    }

    if (settings.minRelationshipStrength && (typeof settings.minRelationshipStrength !== 'number' || settings.minRelationshipStrength < 0 || settings.minRelationshipStrength > 1)) {
      errors.push('Relationship minRelationshipStrength must be a number between 0 and 1');
    }
  }
}

/**
 * File-based configuration persistence manager
 */
class FileConfigurationPersistenceManager implements ConfigurationPersistenceManager {
  private readonly configDir: string;
  private readonly backupDir: string;

  constructor(configDir: string = './config/search') {
    this.configDir = configDir;
    this.backupDir = join(configDir, 'backups');
    this.initializeConfigDirectory();
  }

  /**
   * Initialize configuration and backup directories
   */
  private async initializeConfigDirectory(): Promise<void> {
    try {
      // Create config directory recursively
      await fs.mkdir(this.configDir, { recursive: true });
      // Create backup directory recursively
      await fs.mkdir(this.backupDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to initialize configuration directories: ${error}`);
    }
  }

  /**
   * Read file content as string
   */
  private async readFile(path: string): Promise<string> {
    try {
      return await fs.readFile(path, 'utf-8');
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        throw new Error(`File not found: ${path}`);
      }
      throw new Error(`Failed to read file ${path}: ${error}`);
    }
  }

  /**
   * Write content to file
   */
  private async writeFile(path: string, data: string): Promise<void> {
    try {
      // Ensure directory exists before writing
      await fs.mkdir(dirname(path), { recursive: true });
      await fs.writeFile(path, data, 'utf-8');
    } catch (error) {
      throw new Error(`Failed to write file ${path}: ${error}`);
    }
  }

  /**
   * Check if file exists
   */
  private async exists(path: string): Promise<boolean> {
    try {
      await fs.access(path);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * List files in directory
   */
  private async listDir(path: string): Promise<string[]> {
    try {
      return await fs.readdir(path);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return [];
      }
      throw new Error(`Failed to list directory ${path}: ${error}`);
    }
  }

  async save(config: SearchStrategyConfig): Promise<void> {
    const filename = `${config.strategyName}.json`;
    const filepath = join(this.configDir, filename);
    const data = JSON.stringify(config, null, 2);

    try {
      await this.writeFile(filepath, data);
    } catch (error) {
      throw new Error(`Failed to save configuration for ${config.strategyName}: ${error}`);
    }
  }

  async load(strategyName: string): Promise<SearchStrategyConfig | null> {
    const filename = `${strategyName}.json`;
    const filepath = join(this.configDir, filename);

    try {
      const exists = await this.exists(filepath);
      if (!exists) {
        return null;
      }

      const data = await this.readFile(filepath);
      return JSON.parse(data);
    } catch (error) {
      throw new Error(`Failed to load configuration for ${strategyName}: ${error}`);
    }
  }

  async delete(strategyName: string): Promise<void> {
    const filename = `${strategyName}.json`;
    const filepath = join(this.configDir, filename);

    try {
      const exists = await this.exists(filepath);
      if (!exists) {
        return;
      }

      await fs.unlink(filepath);
    } catch (error) {
      throw new Error(`Failed to delete configuration for ${strategyName}: ${error}`);
    }
  }

  async list(): Promise<string[]> {
    try {
      const files = await this.listDir(this.configDir);
      return files
        .filter((file: string) => file.endsWith('.json'))
        .map((file: string) => file.replace('.json', ''));
    } catch (error) {
      throw new Error(`Failed to list configurations: ${error}`);
    }
  }

  async backup(name: string): Promise<BackupMetadata> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `${name}-${timestamp}`;

    try {
      const config = await this.load(name);
      if (!config) {
        throw new Error(`Configuration ${name} not found`);
      }

      const backupFilename = `${backupId}.json`;
      const backupFilepath = join(this.backupDir, backupFilename);
      const data = JSON.stringify(config, null, 2);
      const fileSize = Buffer.byteLength(data, 'utf8');

      // Calculate checksum for integrity verification
      const checksum = this.calculateChecksum(data);

      // Get current backup count for this strategy
      const existingBackups = await this.listStrategyBackups(name);
      const strategyCount = existingBackups.length + 1;

      // Check if we need to cleanup old backups before creating new one
      const maxBackups = 10; // Configurable limit
      if (strategyCount > maxBackups) {
        await this.cleanupOldBackups(name, maxBackups - 1);
      }

      // Create backup file
      await this.writeFile(backupFilepath, data);

      // Create metadata
      const metadata: BackupMetadata = {
        id: backupId,
        strategyName: name,
        createdAt: new Date(),
        fileSize,
        strategyCount,
        checksum,
      };

      // Save metadata file alongside backup
      const metadataFilename = `${backupId}.metadata.json`;
      const metadataFilepath = join(this.backupDir, metadataFilename);
      await this.writeFile(metadataFilepath, JSON.stringify(metadata, null, 2));

      return metadata;
    } catch (error) {
      throw new Error(`Failed to backup configuration ${name}: ${error}`);
    }
  }

  async restore(name: string, backupId: string): Promise<SearchStrategyConfig> {
    const backupFilename = `${backupId}.json`;
    const backupFilepath = join(this.backupDir, backupFilename);

    try {
      // Check if backup file exists
      const exists = await this.exists(backupFilepath);
      if (!exists) {
        throw new Error(`Backup file not found: ${backupFilename}`);
      }

      const data = await this.readFile(backupFilepath);
      const config = JSON.parse(data);

      // Validate the restored configuration
      const validation = ConfigurationValidator.validateConfiguration(config);
      if (!validation.isValid) {
        throw new Error(`Invalid backup configuration: ${validation.errors.join(', ')}`);
      }

      // Additional validation: ensure the backup is for the correct strategy
      if (config.strategyName !== name) {
        throw new Error(`Backup strategy name mismatch: expected ${name}, got ${config.strategyName}`);
      }

      return config;
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Failed to restore configuration ${name} from backup ${backupId}: Invalid JSON format`);
      }
      throw new Error(`Failed to restore configuration ${name} from backup ${backupId}: ${error}`);
    }
  }

  async export(): Promise<Record<string, SearchStrategyConfig>> {
    try {
      const strategyNames = await this.list();
      const configs: Record<string, SearchStrategyConfig> = {};

      for (const name of strategyNames) {
        const config = await this.load(name);
        if (config) {
          configs[name] = config;
        }
      }

      return configs;
    } catch (error) {
      throw new Error(`Failed to export configurations: ${error}`);
    }
  }

  async import(configs: Record<string, SearchStrategyConfig>): Promise<void> {
    try {
      for (const [name, config] of Object.entries(configs)) {
        const validation = ConfigurationValidator.validateConfiguration(config);
        if (!validation.isValid) {
          throw new Error(`Invalid configuration for ${name}: ${validation.errors.join(', ')}`);
        }

        await this.save(config);
      }
    } catch (error) {
      throw new Error(`Failed to import configurations: ${error}`);
    }
  }

  /**
   * Enhanced restore with integrity validation
   */
  async restoreWithValidation(name: string, backupId: string): Promise<SearchStrategyConfig> {
    try {
      // First validate backup integrity
      const isValid = await this.validateBackupIntegrity(backupId);
      if (!isValid) {
        throw new Error(`Backup integrity validation failed for ${backupId}`);
      }

      // Proceed with normal restore
      return await this.restore(name, backupId);
    } catch (error) {
      throw new Error(`Failed to restore configuration ${name} from backup ${backupId}: ${error}`);
    }
  }

  /**
   * List all backups for a specific strategy
   */
  async listStrategyBackups(strategyName: string): Promise<BackupMetadata[]> {
    try {
      const files = await this.listDir(this.backupDir);
      const metadataFiles = files.filter(file =>
        file.endsWith('.metadata.json') && file.startsWith(`${strategyName}-`),
      );

      const backups: BackupMetadata[] = [];
      for (const metadataFile of metadataFiles) {
        try {
          const metadataPath = join(this.backupDir, metadataFile);
          const metadataContent = await this.readFile(metadataPath);
          const metadata: BackupMetadata = JSON.parse(metadataContent);
          backups.push(metadata);
        } catch (error) {
          // Skip corrupted metadata files
          logWarn(`Skipping corrupted metadata file: ${metadataFile}`, {
            component: 'FileConfigurationPersistenceManager',
            operation: 'listStrategyBackups',
            metadataFile,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // Sort by creation date, newest first
      return backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      throw new Error(`Failed to list backups for strategy ${strategyName}: ${error}`);
    }
  }

  /**
   * Clean up old backups, keeping only the specified maximum
   */
  async cleanupOldBackups(strategyName: string, maxBackups: number): Promise<void> {
    try {
      const backups = await this.listStrategyBackups(strategyName);

      if (backups.length <= maxBackups) {
        return; // No cleanup needed
      }

      // Get backups to delete (oldest ones beyond the limit)
      const backupsToDelete = backups.slice(maxBackups);

      for (const backup of backupsToDelete) {
        try {
          // Delete backup file
          const backupFilename = `${backup.id}.json`;
          const backupFilepath = join(this.backupDir, backupFilename);
          if (await this.exists(backupFilepath)) {
            await fs.unlink(backupFilepath);
          }

          // Delete metadata file
          const metadataFilename = `${backup.id}.metadata.json`;
          const metadataFilepath = join(this.backupDir, metadataFilename);
          if (await this.exists(metadataFilepath)) {
            await fs.unlink(metadataFilepath);
          }
        } catch (error) {
          logWarn(`Failed to delete old backup ${backup.id}`, {
            component: 'FileConfigurationPersistenceManager',
            operation: 'cleanupOldBackups',
            backupId: backup.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } catch (error) {
      throw new Error(`Failed to cleanup old backups for strategy ${strategyName}: ${error}`);
    }
  }

  /**
   * Validate backup integrity using checksum and file size
   */
  async validateBackupIntegrity(backupId: string): Promise<boolean> {
    try {
      // Read metadata to get expected checksum and file size
      const metadataFilename = `${backupId}.metadata.json`;
      const metadataFilepath = join(this.backupDir, metadataFilename);

      if (!(await this.exists(metadataFilepath))) {
        return false;
      }

      const metadataContent = await this.readFile(metadataFilepath);
      const metadata: BackupMetadata = JSON.parse(metadataContent);

      // Read backup file
      const backupFilename = `${backupId}.json`;
      const backupFilepath = join(this.backupDir, backupFilename);

      if (!(await this.exists(backupFilepath))) {
        return false;
      }

      const backupContent = await this.readFile(backupFilepath);
      const actualSize = Buffer.byteLength(backupContent, 'utf8');

      // Check file size
      if (actualSize !== metadata.fileSize) {
        return false;
      }

      // Check checksum if available
      if (metadata.checksum) {
        const actualChecksum = this.calculateChecksum(backupContent);
        return actualChecksum === metadata.checksum;
      }

      return true;
    } catch (error) {
      logError(`Backup integrity validation failed for ${backupId}`, {
        component: 'FileConfigurationPersistenceManager',
        operation: 'validateBackupIntegrity',
        backupId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Calculate SHA-256 checksum for data integrity
   */
  private calculateChecksum(data: string): string {
    return createHash('sha256').update(data, 'utf8').digest('hex');
  }
}

/**
 * In-memory configuration audit manager
 */
class MemoryConfigurationAuditManager implements ConfigurationAuditManager {
  private auditLog: ConfigurationAuditEntry[] = [];
  private readonly maxLogSize = 10000;

  async log(entry: ConfigurationAuditEntry): Promise<void> {
    this.auditLog.unshift(entry);

    // Maintain log size limit
    if (this.auditLog.length > this.maxLogSize) {
      this.auditLog = this.auditLog.slice(0, this.maxLogSize);
    }
  }

  async getHistory(strategyName?: string, limit?: number): Promise<ConfigurationAuditEntry[]> {
    let filteredLog = strategyName
      ? this.auditLog.filter(entry => entry.strategyName === strategyName)
      : this.auditLog;

    if (limit) {
      filteredLog = filteredLog.slice(0, limit);
    }

    return filteredLog;
  }

  async getChanges(strategyName: string, fromTimestamp: Date, toTimestamp: Date): Promise<ConfigurationAuditEntry[]> {
    return this.auditLog.filter(entry =>
      entry.strategyName === strategyName &&
      entry.timestamp >= fromTimestamp &&
      entry.timestamp <= toTimestamp &&
      entry.changes,
    );
  }
}

/**
 * Main configuration manager implementation
 */
export class SearchStrategyConfigManager implements ConfigurationManager {
  private persistenceManager: ConfigurationPersistenceManager;
  private auditManager: ConfigurationAuditManager;
  private configurations: Map<string, SearchStrategyConfig> = new Map();

  // Performance monitoring
  private performanceMetrics: ConfigurationPerformanceMetrics = {
    totalOperations: 0,
    averageOperationTime: 0,
    operationsByType: new Map<string, number>(),
    errorCounts: new Map<string, number>(),
    cacheHitRate: 0,
    persistenceLatency: 0,
    validationLatency: 0,
    lastOperationTime: 0,
  };

  private operationMetrics: ConfigurationOperationMetrics[] = [];
  private maxOperationHistory = 1000;

  constructor(
    persistenceManager?: ConfigurationPersistenceManager,
    auditManager?: ConfigurationAuditManager,
  ) {
    this.persistenceManager = persistenceManager || new FileConfigurationPersistenceManager('./config/search');
    this.auditManager = auditManager || new MemoryConfigurationAuditManager();
  }

  async loadConfiguration(name: string): Promise<SearchStrategyConfig | null> {
    const startTime = Date.now();
    const cacheUsed = this.configurations.has(name);

    const metrics: ConfigurationOperationMetrics = {
      operationType: 'load',
      strategyName: name,
      startTime,
      success: false,
      cacheUsed,
      persistenceRequired: !cacheUsed,
    };

    try {
      // Check memory cache first
      if (this.configurations.has(name)) {
        await this.auditManager.log({
          timestamp: new Date(),
          action: 'load',
          strategyName: name,
          success: true,
          metadata: { source: 'memory' },
        });
        metrics.success = true;
        this.recordOperationMetrics(metrics);
        return this.configurations.get(name)!;
      }

      // Load from persistence
      const config = await this.persistenceManager.load(name);

      if (config) {
        // Cache the loaded configuration
        this.configurations.set(name, config);

        await this.auditManager.log({
          timestamp: new Date(),
          action: 'load',
          strategyName: name,
          success: true,
          metadata: { source: 'disk' },
        });
        metrics.success = true;
      } else {
        await this.auditManager.log({
          timestamp: new Date(),
          action: 'load',
          strategyName: name,
          success: false,
          error: 'Configuration not found',
        });
      }

      this.recordOperationMetrics(metrics);
      return config;
    } catch (error) {
      metrics.success = false;
      metrics.error = error instanceof Error ? error.message : String(error);

      await this.auditManager.log({
        timestamp: new Date(),
        action: 'load',
        strategyName: name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      logError(`Failed to load configuration for ${name}`, {
        component: 'SearchStrategyConfigManager',
        operation: 'loadConfiguration',
        strategyName: name,
        error: error instanceof Error ? error.message : String(error)
      });
      this.recordOperationMetrics(metrics);
      return null;
    }
  }

  async saveConfiguration(name: string, config: SearchStrategyConfig): Promise<void> {
    try {
      // Validate configuration
      const validation = ConfigurationValidator.validateConfiguration(config);
      if (!validation.isValid) {
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }

      // Get existing configuration for change tracking
      const existingConfig = await this.loadConfiguration(name);

      // Save to persistence
      await this.persistenceManager.save(config);

      // Update memory cache
      this.configurations.set(name, config);

      // Log the action
      const changes = existingConfig
        ? this.calculateChanges(existingConfig, config)
        : undefined;

      await this.auditManager.log({
        timestamp: new Date(),
        action: existingConfig ? 'update' : 'create',
        strategyName: name,
        success: true,
        changes,
      });

      logInfo(`Configuration saved for ${name}`, {
        component: 'SearchStrategyConfigManager',
        operation: 'saveConfiguration',
        strategyName: name
      });
    } catch (error) {
      await this.auditManager.log({
        timestamp: new Date(),
        action: 'save',
        strategyName: name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      logError(`Failed to save configuration for ${name}`, {
        component: 'SearchStrategyConfigManager',
        operation: 'saveConfiguration',
        strategyName: name,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async getConfigurationNames(): Promise<string[]> {
    try {
      return await this.persistenceManager.list();
    } catch (error) {
      logError('Failed to get configuration names', {
        component: 'SearchStrategyConfigManager',
        operation: 'getConfigurationNames',
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  async deleteConfiguration(name: string): Promise<void> {
    try {
      await this.persistenceManager.delete(name);
      this.configurations.delete(name);

      await this.auditManager.log({
        timestamp: new Date(),
        action: 'delete',
        strategyName: name,
        success: true,
      });

      logInfo(`Configuration deleted for ${name}`, {
        component: 'SearchStrategyConfigManager',
        operation: 'deleteConfiguration',
        strategyName: name
      });
    } catch (error) {
      await this.auditManager.log({
        timestamp: new Date(),
        action: 'delete',
        strategyName: name,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      logError(`Failed to delete configuration for ${name}`, {
        component: 'SearchStrategyConfigManager',
        operation: 'deleteConfiguration',
        strategyName: name,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  async validateConfiguration(config: SearchStrategyConfig): Promise<ConfigurationValidationResult> {
    try {
      const result = ConfigurationValidator.validateConfiguration(config);

      await this.auditManager.log({
        timestamp: new Date(),
        action: 'validate',
        strategyName: config.strategyName,
        success: result.isValid,
        error: result.isValid ? undefined : result.errors.join(', '),
        metadata: {
          errorCount: result.errors.length,
          warningCount: result.warnings.length,
        },
      });

      return result;
    } catch (error) {
      await this.auditManager.log({
        timestamp: new Date(),
        action: 'validate',
        strategyName: config.strategyName,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        isValid: false,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: [],
      };
    }
  }

  getDefaultConfiguration(strategyName: string): SearchStrategyConfig {
    const defaultConfig = DEFAULT_STRATEGY_CONFIGS[strategyName as SearchStrategy];
    if (!defaultConfig) {
      throw new Error(`No default configuration available for strategy: ${strategyName}`);
    }

    return JSON.parse(JSON.stringify(defaultConfig)); // Deep clone
  }

  mergeConfigurations(base: SearchStrategyConfig, override: Partial<SearchStrategyConfig>): SearchStrategyConfig {
    const merged = { ...base };

    if (override.enabled !== undefined) merged.enabled = override.enabled;
    if (override.priority !== undefined) merged.priority = override.priority;
    if (override.timeout !== undefined) merged.timeout = override.timeout;
    if (override.maxResults !== undefined) merged.maxResults = override.maxResults;

    if (override.performance) {
      merged.performance = { ...merged.performance, ...override.performance };
    }

    if (override.scoring) {
      merged.scoring = { ...merged.scoring, ...override.scoring };
    }

    if (override.strategySpecific) {
      merged.strategySpecific = { ...merged.strategySpecific, ...override.strategySpecific };
    }

    return merged;
  }

  /**
   * Get all current cached configurations
   */
  getCachedConfigurations(): Map<string, SearchStrategyConfig> {
    return new Map(this.configurations);
  }

  /**
   * Clear configuration cache
   */
  clearCache(): void {
    this.configurations.clear();
  }

  /**
   * Calculate changes between two configurations
   */
  private calculateChanges(oldConfig: SearchStrategyConfig, newConfig: SearchStrategyConfig): Record<string, { from: unknown; to: unknown }> {
    const changes: Record<string, { from: unknown; to: unknown }> = {};

    // Check top-level properties
    const fields = ['enabled', 'priority', 'timeout', 'maxResults'];
    for (const field of fields) {
      const oldValue = (oldConfig as any)[field];
      const newValue = (newConfig as any)[field];
      if (oldValue !== newValue) {
        changes[field] = { from: oldValue, to: newValue };
      }
    }

    // Check performance settings
    if (oldConfig.performance && newConfig.performance) {
      const perfFields = ['enableCaching', 'cacheSize', 'enableParallelExecution'];
      for (const field of perfFields) {
        const oldValue = oldConfig.performance[field as keyof typeof oldConfig.performance];
        const newValue = newConfig.performance[field as keyof typeof newConfig.performance];
        if (oldValue !== newValue) {
          changes[`performance.${field}`] = { from: oldValue, to: newValue };
        }
      }
    }

    // Check scoring settings
    if (oldConfig.scoring && newConfig.scoring) {
      const scoringFields = ['baseWeight', 'recencyWeight', 'importanceWeight', 'relationshipWeight'];
      for (const field of scoringFields) {
        const oldValue = oldConfig.scoring[field as keyof typeof oldConfig.scoring];
        const newValue = newConfig.scoring[field as keyof typeof newConfig.scoring];
        if (oldValue !== newValue) {
          changes[`scoring.${field}`] = { from: oldValue, to: newValue };
        }
      }
    }

    return changes;
  }

  /**
   * Export all configurations for backup or migration
   */
  async exportConfigurations(): Promise<Record<string, SearchStrategyConfig>> {
    try {
      return await this.persistenceManager.export();
    } catch (error) {
      logError('Failed to export configurations', {
        component: 'SearchStrategyConfigManager',
        operation: 'exportConfigurations',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Import configurations from backup or migration
   */
  async importConfigurations(configs: Record<string, SearchStrategyConfig>): Promise<void> {
    try {
      await this.persistenceManager.import(configs);

      // Update cache
      for (const [name, config] of Object.entries(configs)) {
        this.configurations.set(name, config);
      }

      await this.auditManager.log({
        timestamp: new Date(),
        action: 'import',
        strategyName: 'system',
        success: true,
        metadata: {
          importedCount: Object.keys(configs).length,
        },
      });

      logInfo(`Imported ${Object.keys(configs).length} configurations`, {
        component: 'SearchStrategyConfigManager',
        operation: 'importConfigurations',
        importedCount: Object.keys(configs).length
      });
    } catch (error) {
      await this.auditManager.log({
        timestamp: new Date(),
        action: 'import',
        strategyName: 'system',
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      logError('Failed to import configurations', {
        component: 'SearchStrategyConfigManager',
        operation: 'importConfigurations',
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get configuration audit history
   */
  async getAuditHistory(strategyName?: string, limit?: number): Promise<ConfigurationAuditEntry[]> {
    try {
      return await this.auditManager.getHistory(strategyName, limit);
    } catch (error) {
      logError('Failed to get audit history', {
        component: 'SearchStrategyConfigManager',
        operation: 'getAuditHistory',
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * Get backup metadata for a specific strategy
   */
  async getStrategyBackups(strategyName: string): Promise<BackupMetadata[]> {
    try {
      return await this.persistenceManager.listStrategyBackups(strategyName);
    } catch (error) {
      logError(`Failed to get backups for strategy ${strategyName}`, {
        component: 'SearchStrategyConfigManager',
        operation: 'getStrategyBackups',
        strategyName,
        error: error instanceof Error ? error.message : String(error)
      });
      return [];
    }
  }

  /**
   * Validate backup integrity for a specific backup
   */
  async validateBackup(backupId: string): Promise<boolean> {
    try {
      return await this.persistenceManager.validateBackupIntegrity(backupId);
    } catch (error) {
      logError(`Failed to validate backup ${backupId}`, {
        component: 'SearchStrategyConfigManager',
        operation: 'validateBackup',
        backupId,
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Clean up old backups for a strategy
   */
  async cleanupBackups(strategyName: string, maxBackups: number = 10): Promise<void> {
    try {
      await this.persistenceManager.cleanupOldBackups(strategyName, maxBackups);
      logInfo(`Cleaned up old backups for strategy ${strategyName}, keeping last ${maxBackups}`, {
        component: 'SearchStrategyConfigManager',
        operation: 'cleanupBackups',
        strategyName,
        maxBackups
      });
    } catch (error) {
      logError(`Failed to cleanup backups for strategy ${strategyName}`, {
        component: 'SearchStrategyConfigManager',
        operation: 'cleanupBackups',
        strategyName,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Enhanced backup with automatic cleanup
   */
  async backupWithCleanup(name: string, maxBackups: number = 10): Promise<BackupMetadata> {
    try {
      const metadata = await this.persistenceManager.backup(name);
      await this.persistenceManager.cleanupOldBackups(name, maxBackups);
      logInfo(`Backup created for ${name} with automatic cleanup (keeping last ${maxBackups})`, {
        component: 'SearchStrategyConfigManager',
        operation: 'backupWithCleanup',
        strategyName: name,
        maxBackups
      });
      return metadata;
    } catch (error) {
      logError(`Failed to create backup with cleanup for ${name}`, {
        component: 'SearchStrategyConfigManager',
        operation: 'backupWithCleanup',
        strategyName: name,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  // ===== PERFORMANCE MONITORING METHODS =====

  /**
   * Record operation performance metrics
   */
  private recordOperationMetrics(metrics: ConfigurationOperationMetrics): void {
    const endTime = Date.now();
    metrics.endTime = endTime;
    metrics.duration = endTime - metrics.startTime;

    // Update aggregate metrics
    this.performanceMetrics.totalOperations++;
    this.performanceMetrics.lastOperationTime = endTime;

    // Update operation type counts
    const currentCount = this.performanceMetrics.operationsByType.get(metrics.operationType) || 0;
    this.performanceMetrics.operationsByType.set(metrics.operationType, currentCount + 1);

    // Update average operation time
    this.performanceMetrics.averageOperationTime =
      (this.performanceMetrics.averageOperationTime * (this.performanceMetrics.totalOperations - 1) + metrics.duration!) /
      this.performanceMetrics.totalOperations;

    // Update cache hit rate
    if (metrics.cacheUsed) {
      this.updateCacheHitRate(true);
    }

    // Update latency metrics based on operation type
    if (metrics.persistenceRequired) {
      this.performanceMetrics.persistenceLatency =
        (this.performanceMetrics.persistenceLatency * 0.9) + (metrics.duration! * 0.1);
    }

    if (metrics.operationType === 'validate') {
      this.performanceMetrics.validationLatency =
        (this.performanceMetrics.validationLatency * 0.9) + (metrics.duration! * 0.1);
    }

    // Track errors
    if (!metrics.success && metrics.error) {
      const currentErrorCount = this.performanceMetrics.errorCounts.get(metrics.error) || 0;
      this.performanceMetrics.errorCounts.set(metrics.error, currentErrorCount + 1);
    }

    // Store operation history
    this.operationMetrics.unshift(metrics);
    if (this.operationMetrics.length > this.maxOperationHistory) {
      this.operationMetrics = this.operationMetrics.slice(0, this.maxOperationHistory);
    }
  }

  /**
   * Update cache hit rate calculation
   */
  private updateCacheHitRate(hit: boolean): void {
    // Simple moving average for cache hit rate
    const currentRate = this.performanceMetrics.cacheHitRate;
    const alpha = 0.1; // Learning rate
    this.performanceMetrics.cacheHitRate = currentRate * (1 - alpha) + (hit ? 1 : 0) * alpha;
  }

  /**
   * Get configuration performance metrics
   */
  public getPerformanceMetrics(): ConfigurationPerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  /**
   * Get recent operation metrics
   */
  public getRecentOperationMetrics(limit: number = 100): ConfigurationOperationMetrics[] {
    return this.operationMetrics.slice(0, limit);
  }

  /**
   * Get performance analytics for configuration operations
   */
  public getPerformanceAnalytics(): {
    averageLatency: number;
    errorRate: number;
    cacheEfficiency: number;
    operationBreakdown: Record<string, number>;
    topErrors: Array<{ error: string; count: number }>;
    performanceTrends: Array<{ timestamp: number; latency: number; operations: number }>;
  } {
    const totalOps = this.performanceMetrics.totalOperations;
    const errorRate = totalOps > 0 ?
      Array.from(this.performanceMetrics.errorCounts.values()).reduce((sum, count) => sum + count, 0) / totalOps : 0;

    // Generate operation breakdown
    const operationBreakdown: Record<string, number> = {};
    for (const [opType, count] of this.performanceMetrics.operationsByType) {
      operationBreakdown[opType] = (count / totalOps) * 100;
    }

    // Get top errors
    const topErrors = Array.from(this.performanceMetrics.errorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([error, count]) => ({ error, count }));

    // Generate performance trends from recent operations
    const recentOps = this.operationMetrics.slice(0, 50);
    const trendsByMinute: Map<number, { latency: number; operations: number; count: number }> = new Map();

    for (const op of recentOps) {
      const minute = Math.floor(op.startTime / 60000) * 60000; // Round to minute
      const current = trendsByMinute.get(minute) || { latency: 0, operations: 0, count: 0 };
      current.latency += op.duration || 0;
      current.count++;
      current.operations += 1;
      trendsByMinute.set(minute, current);
    }

    const performanceTrends = Array.from(trendsByMinute.entries())
      .sort((a, b) => b[0] - a[0])
      .slice(0, 60) // Last 60 minutes
      .map(([timestamp, data]) => ({
        timestamp,
        latency: data.latency / data.count,
        operations: data.operations,
      }));

    return {
      averageLatency: this.performanceMetrics.averageOperationTime,
      errorRate,
      cacheEfficiency: this.performanceMetrics.cacheHitRate,
      operationBreakdown,
      topErrors,
      performanceTrends,
    };
  }

  /**
   * Get configuration performance report
   */
  public getConfigurationPerformanceReport(): {
    summary: {
      totalOperations: number;
      averageLatency: number;
      errorRate: number;
      cacheHitRate: number;
    };
    performanceByOperation: Record<string, { count: number; averageLatency: number; errorRate: number }>;
    recommendations: string[];
    timestamp: Date;
  } {
    const analytics = this.getPerformanceAnalytics();
    const performanceByOperation: Record<string, { count: number; averageLatency: number; errorRate: number }> = {};

    // Calculate performance by operation type
    for (const [opType, count] of this.performanceMetrics.operationsByType) {
      const opMetrics = this.operationMetrics.filter(m => m.operationType === opType);
      const errorCount = opMetrics.filter(m => !m.success).length;
      const avgLatency = opMetrics.length > 0 ?
        opMetrics.reduce((sum, m) => sum + (m.duration || 0), 0) / opMetrics.length : 0;

      performanceByOperation[opType] = {
        count,
        averageLatency: avgLatency,
        errorRate: count > 0 ? errorCount / count : 0,
      };
    }

    // Generate recommendations
    const recommendations = this.generatePerformanceRecommendations(analytics);

    return {
      summary: {
        totalOperations: this.performanceMetrics.totalOperations,
        averageLatency: analytics.averageLatency,
        errorRate: analytics.errorRate,
        cacheHitRate: analytics.cacheEfficiency,
      },
      performanceByOperation,
      recommendations,
      timestamp: new Date(),
    };
  }

  /**
   * Generate performance recommendations
   */
  private generatePerformanceRecommendations(analytics: ReturnType<typeof this.getPerformanceAnalytics>): string[] {
    const recommendations: string[] = [];

    // High latency recommendations
    if (analytics.averageLatency > 100) {
      recommendations.push('Configuration operations are slow - consider optimizing persistence layer');
      recommendations.push('Check disk I/O performance for configuration files');
    }

    // High error rate recommendations
    if (analytics.errorRate > 0.05) {
      recommendations.push('High error rate detected - review configuration validation logic');
      const topError = analytics.topErrors[0];
      if (topError) {
        recommendations.push(`Most common error: ${topError.error} - investigate root cause`);
      }
    }

    // Low cache efficiency recommendations
    if (analytics.cacheEfficiency < 0.5) {
      recommendations.push('Low cache hit rate - consider increasing cache size or improving cache strategy');
    }

    // Operation-specific recommendations
    const performanceByOperation: Record<string, { count: number; averageLatency: number; errorRate: number }> = {};
    for (const [opType, count] of this.performanceMetrics.operationsByType) {
      const opMetrics = this.operationMetrics.filter(m => m.operationType === opType);
      const errorCount = opMetrics.filter(m => !m.success).length;
      const avgLatency = opMetrics.length > 0 ?
        opMetrics.reduce((sum, m) => sum + (m.duration || 0), 0) / opMetrics.length : 0;

      performanceByOperation[opType] = {
        count,
        averageLatency: avgLatency,
        errorRate: count > 0 ? errorCount / count : 0,
      };
    }

    for (const [opType, perf] of Object.entries(analytics.operationBreakdown)) {
      if (perf > 30 && performanceByOperation[opType]?.averageLatency > 200) {
        recommendations.push(`${opType} operations are frequent and slow - consider optimization`);
      }
    }

    return recommendations;
  }


  /**
   * Clear performance metrics and history
   */
  public clearPerformanceMetrics(): void {
    this.performanceMetrics = {
      totalOperations: 0,
      averageOperationTime: 0,
      operationsByType: new Map<string, number>(),
      errorCounts: new Map<string, number>(),
      cacheHitRate: 0,
      persistenceLatency: 0,
      validationLatency: 0,
      lastOperationTime: 0,
    };
    this.operationMetrics = [];
  }

  /**
   * Get performance monitoring status
   */
  public getPerformanceMonitoringStatus(): {
    enabled: boolean;
    totalOperations: number;
    averageLatency: number;
    errorRate: number;
    lastOperationTime: number;
  } {
    return {
      enabled: true, // Performance monitoring is always enabled
      totalOperations: this.performanceMetrics.totalOperations,
      averageLatency: this.performanceMetrics.averageOperationTime,
      errorRate: this.performanceMetrics.totalOperations > 0 ?
        Array.from(this.performanceMetrics.errorCounts.values()).reduce((sum, count) => sum + count, 0) / this.performanceMetrics.totalOperations : 0,
      lastOperationTime: this.performanceMetrics.lastOperationTime,
    };
  }
}