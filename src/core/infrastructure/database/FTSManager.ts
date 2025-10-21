import { PrismaClient } from '@prisma/client';
import { MemoryClassification, MemoryImportanceLevel } from '../../types/schemas';
import { MemorySearchResult, SearchOptions } from '../../types/models';
import { logInfo, logError } from '../../infrastructure/config/Logger';
import { initializeSearchSchema, verifyFTSSchema } from './init-search-schema';
import {
  sanitizeSearchQuery,
  sanitizeNamespace,
  SanitizationError,
  ValidationError,
  containsDangerousPatterns,
} from '../config/SanitizationUtils';

/**
 * FTS5 search status interface
 */
export interface FTSStatus {
  enabled: boolean;
  isValid: boolean;
  issues: string[];
  stats: { tables: number; triggers: number; indexes: number };
}

/**
 * FTS5 query options interface
 */
export interface FTSQueryOptions {
  useBM25?: boolean;
  bm25Parameters?: [number, number, number];
  maxResults?: number;
  includeMetadata?: boolean;
}

/**
 * FTS5 Manager class for handling all FTS5 (Full-Text Search) operations
 * Extracted from DatabaseManager for better separation of concerns
 */
export class FTSManager {
  private prisma: PrismaClient;
  private ftsEnabled: boolean = false;
  private initializationInProgress: boolean = false;

  constructor(prismaClient: PrismaClient) {
    this.prisma = prismaClient;
  }

  /**
   * Initialize FTS5 support with comprehensive error handling
   */
  async initializeFTSSupport(): Promise<void> {
    if (this.ftsEnabled || this.initializationInProgress) {
      return;
    }

    this.initializationInProgress = true;
    try {
      // Initialize the FTS5 schema (creates virtual table)
      const schemaInitialized = await initializeSearchSchema(this.prisma);

      if (!schemaInitialized) {
        throw new Error('Failed to initialize FTS5 schema');
      }

      // Now create the triggers after the main tables exist
      await this.createFTSTriggers();

      // Verify the FTS table and triggers were created successfully
      const verification = await verifyFTSSchema(this.prisma);
      if (!verification.isValid) {
        throw new Error(`FTS5 verification failed: ${verification.issues.join(', ')}`);
      }

      this.ftsEnabled = true;
      logInfo('FTS5 search support initialized successfully', {
        component: 'FTSManager',
        tables: verification.stats.tables,
        triggers: verification.stats.triggers,
        indexes: verification.stats.indexes,
      });
    } catch (error) {
      logError('Failed to initialize FTS5 search support, falling back to basic search', {
        component: 'FTSManager',
        error: error instanceof Error ? error.message : String(error),
      });
      this.ftsEnabled = false;
    } finally {
      this.initializationInProgress = false;
    }
  }

  /**
   * Get FTS status and verification information
   */
  async getFTSStatus(): Promise<FTSStatus> {
    try {
      // Ensure FTS support is initialized before checking status
      await this.initializeFTSSupport();
      const verification = await verifyFTSSchema(this.prisma);
      return {
        enabled: this.ftsEnabled,
        isValid: verification.isValid,
        issues: verification.issues,
        stats: verification.stats,
      };
    } catch (error) {
      return {
        enabled: false,
        isValid: false,
        issues: [`FTS verification failed: ${error instanceof Error ? error.message : String(error)}`],
        stats: { tables: 0, triggers: 0, indexes: 0 },
      };
    }
  }

  /**
   * Check if FTS5 is enabled and ready for use
   */
  isFTSEnabled(): boolean {
    return this.ftsEnabled;
  }

  /**
   * Create FTS triggers for table synchronization after main tables exist
   */
  private async createFTSTriggers(): Promise<void> {
    try {
      logInfo('Creating FTS triggers after main tables exist...', { component: 'FTSManager' });

      // Create triggers for synchronization with long_term_memory
      try {
        await this.prisma.$executeRaw`
          CREATE TRIGGER IF NOT EXISTS memory_fts_insert_long_term
          AFTER INSERT ON long_term_memory
          BEGIN
            INSERT INTO memory_fts(rowid, content, metadata)
            VALUES (new.id, new.searchableContent, json_object(
              'memory_type', new.retentionType,
              'category_primary', new.categoryPrimary,
              'importance_score', new.importanceScore,
              'classification', new.classification,
              'created_at', new.extractionTimestamp,
              'namespace', new.namespace
            ));
          END;
        `;
      } catch (error) {
        logError('Failed to create memory_fts_insert_long_term trigger', {
          component: 'FTSManager',
          error: error instanceof Error ? error.message : String(error),
        });
        // Continue with other triggers
      }

      try {
        await this.prisma.$executeRaw`
          CREATE TRIGGER IF NOT EXISTS memory_fts_delete_long_term
          AFTER DELETE ON long_term_memory
          BEGIN
            DELETE FROM memory_fts WHERE rowid = old.id;
          END;
        `;
      } catch (error) {
        logError('Failed to create memory_fts_delete_long_term trigger', {
          component: 'FTSManager',
          error: error instanceof Error ? error.message : String(error),
        });
      }

      try {
        await this.prisma.$executeRaw`
          CREATE TRIGGER IF NOT EXISTS memory_fts_update_long_term
          AFTER UPDATE ON long_term_memory
          BEGIN
            DELETE FROM memory_fts WHERE rowid = old.id;
            INSERT INTO memory_fts(rowid, content, metadata)
            VALUES (new.id, new.searchableContent, json_object(
              'memory_type', new.retentionType,
              'category_primary', new.categoryPrimary,
              'importance_score', new.importanceScore,
              'classification', new.classification,
              'created_at', new.extractionTimestamp,
              'namespace', new.namespace
            ));
          END;
        `;
      } catch (error) {
        logError('Failed to create memory_fts_update_long_term trigger', {
          component: 'FTSManager',
          error: error instanceof Error ? error.message : String(error),
        });
      }

      // Create triggers for synchronization with short_term_memory
      try {
        await this.prisma.$executeRaw`
          CREATE TRIGGER IF NOT EXISTS memory_fts_insert_short_term
          AFTER INSERT ON short_term_memory
          BEGIN
            INSERT INTO memory_fts(rowid, content, metadata)
            VALUES (new.id, new.searchableContent, json_object(
              'memory_type', new.retentionType,
              'category_primary', new.categoryPrimary,
              'importance_score', new.importanceScore,
              'created_at', new.createdAt,
              'namespace', new.namespace
            ));
          END;
        `;
      } catch (error) {
        logError('Failed to create memory_fts_insert_short_term trigger', {
          component: 'FTSManager',
          error: error instanceof Error ? error.message : String(error),
        });
      }

      try {
        await this.prisma.$executeRaw`
          CREATE TRIGGER IF NOT EXISTS memory_fts_delete_short_term
          AFTER DELETE ON short_term_memory
          BEGIN
            DELETE FROM memory_fts WHERE rowid = old.id;
          END;
        `;
      } catch (error) {
        logError('Failed to create memory_fts_delete_short_term trigger', {
          component: 'FTSManager',
          error: error instanceof Error ? error.message : String(error),
        });
      }

      try {
        await this.prisma.$executeRaw`
          CREATE TRIGGER IF NOT EXISTS memory_fts_update_short_term
          AFTER UPDATE ON short_term_memory
          BEGIN
            DELETE FROM memory_fts WHERE rowid = old.id;
            INSERT INTO memory_fts(rowid, content, metadata)
            VALUES (new.id, new.searchableContent, json_object(
              'memory_type', new.retentionType,
              'category_primary', new.categoryPrimary,
              'importance_score', new.importanceScore,
              'created_at', new.createdAt,
              'namespace', new.namespace
            ));
          END;
        `;
      } catch (error) {
        logError('Failed to create memory_fts_update_short_term trigger', {
          component: 'FTSManager',
          error: error instanceof Error ? error.message : String(error),
        });
      }

      logInfo('FTS trigger creation completed (some may have failed due to connectivity issues)', {
        component: 'FTSManager'
      });

    } catch (error) {
      logError('FTS trigger creation process completed with errors', {
        component: 'FTSManager',
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw - allow system to continue even if trigger creation fails
    }
  }

  /**
   * Perform advanced FTS5 search with BM25 ranking and comprehensive error handling
   */
  async searchMemoriesFTS(query: string, options: SearchOptions): Promise<MemorySearchResult[]> {
    try {
      // Ensure FTS support is initialized before using it
      await this.initializeFTSSupport();

      // Check if FTS is actually enabled after initialization
      if (!this.isFTSEnabled()) {
        throw new Error('FTS5 is not available or not properly initialized');
      }

      const limit = Math.min(options.limit || 10, 1000); // Cap limit for security

      // Enhanced sanitization for query and options
      const sanitizedQuery = sanitizeSearchQuery(query, {
        fieldName: 'searchQuery',
        allowWildcards: true,
        allowBoolean: false,
      });

      const sanitizedNamespace = sanitizeNamespace(
        options.namespace || 'default',
        { fieldName: 'namespace' },
      );

      // Additional security check for dangerous patterns
      const queryDangers = containsDangerousPatterns(sanitizedQuery);
      if (queryDangers.hasSQLInjection || queryDangers.hasXSS || queryDangers.hasCommandInjection) {
        throw new SanitizationError(
          'Query contains dangerous patterns',
          'searchQuery',
          sanitizedQuery,
          'security_validation',
        );
      }

      // Validate and sanitize input using enhanced validation
      const validation = this.validateAndSanitizeFTSInput(sanitizedQuery, options);
      if (!validation.isValid) {
        throw new ValidationError(
          `Invalid FTS query: ${validation.errors.join(', ')}`,
          'searchQuery',
          sanitizedQuery,
          'enhanced_validation',
        );
      }

      // Build FTS query with proper escaping and phrase handling
      const ftsQuery = this.buildFTSQuery(sanitizedQuery);

      // Build metadata filters with parameterized values
      const metadataFilters: string[] = ['namespace = $1'];
      const queryParams: any[] = [sanitizedNamespace];
      let paramIndex = 2;

      if (options.minImportance) {
        const minScore = this.calculateImportanceScore(options.minImportance);
        metadataFilters.push(`json_extract(metadata, '$.importance_score') >= $${paramIndex}`);
        queryParams.push(minScore);
        paramIndex++;
      }

      if (options.categories && options.categories.length > 0) {
        // Validate categories
        const validCategories = options.categories.filter(cat =>
          cat && typeof cat === 'string' && cat.trim().length > 0,
        );

        if (validCategories.length > 0) {
          const placeholders = validCategories.map((_, index) => `$${paramIndex + index}`).join(',');
          metadataFilters.push(`json_extract(metadata, '$.category_primary') IN (${placeholders})`);
          queryParams.push(...validCategories);
          paramIndex += validCategories.length;
        }
      }

      // Add the FTS query parameter
      queryParams.push(ftsQuery);

      const whereClause = metadataFilters.length > 1 ? `WHERE ${metadataFilters.join(' AND ')}` : '';

      // Use parameterized query to prevent SQL injection
      const queryString = `
        SELECT
          fts.rowid as memory_id,
          fts.content as searchable_content,
          fts.metadata,
          bm25(memory_fts, 1.0, 1.0, 1.0) as search_score,
          'fts5' as search_strategy
        FROM memory_fts fts
        ${whereClause}
          AND memory_fts MATCH $${paramIndex}
        ORDER BY bm25(memory_fts, 1.0, 1.0, 1.0) DESC
        LIMIT $${paramIndex + 1}
      `;

      let rawResults;
      try {
        rawResults = await this.prisma.$queryRawUnsafe(queryString, ...queryParams, limit);
      } catch (queryError) {
        logError('FTS5 query execution failed', {
          component: 'FTSManager',
          query: queryString.substring(0, 200) + '...',
          error: queryError instanceof Error ? queryError.message : String(queryError),
        });
        throw new Error(`FTS5 search query failed: ${queryError instanceof Error ? queryError.message : String(queryError)}`);
      }

      // Transform results to MemorySearchResult format
      const results: MemorySearchResult[] = [];

      for (const row of rawResults as any[]) {
        const metadata = JSON.parse(row.metadata);

        // Get the actual memory data from the main tables
        const memoryData = await this.getMemoryDataById(row.memory_id, metadata.memory_type);
        if (memoryData) {
          results.push({
            id: row.memory_id,
            content: row.searchable_content,
            summary: memoryData.summary,
            classification: metadata.classification as MemoryClassification,
            importance: metadata.memory_importance as MemoryImportanceLevel,
            topic: memoryData.topic,
            entities: memoryData.entities,
            keywords: memoryData.keywords,
            confidenceScore: metadata.confidence_score || 0.5,
            classificationReason: memoryData.classification_reason || '',
            metadata: options.includeMetadata ? {
              searchScore: row.search_score,
              searchStrategy: row.search_strategy,
              memoryType: metadata.memory_type,
              category: metadata.category_primary,
              importanceScore: metadata.importance_score,
            } : undefined,
          });
        }
      }

      return results;

    } catch (error) {
      logError('FTS5 search failed', {
        component: 'FTSManager',
        query,
        options,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validate and sanitize FTS input parameters
   */
  private validateAndSanitizeFTSInput(query: string, options: SearchOptions): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate query
    if (query && typeof query !== 'string') {
      errors.push('Query must be a string');
    }

    if (query && query.length > 1000) {
      errors.push('Query is too long (max 1000 characters)');
    }

    // Validate limit
    const limit = options.limit || 10;
    if (limit < 1) {
      errors.push('Limit must be positive');
    }

    if (limit > 1000) {
      errors.push('Limit is too large (max 1000)');
    }

    // Validate namespace
    if (options.namespace && typeof options.namespace !== 'string') {
      errors.push('Namespace must be a string');
    }

    if (options.namespace && options.namespace.length > 100) {
      errors.push('Namespace is too long (max 100 characters)');
    }

    // Validate categories
    if (options.categories) {
      if (!Array.isArray(options.categories)) {
        errors.push('Categories must be an array');
      } else {
        const invalidCategories = options.categories.filter(cat =>
          !cat || typeof cat !== 'string' || cat.length > 50,
        );
        if (invalidCategories.length > 0) {
          errors.push('Invalid categories found');
        }
      }
    }

    // Validate min importance
    if (options.minImportance && !Object.values(MemoryImportanceLevel).includes(options.minImportance)) {
      errors.push('Invalid minimum importance level');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Build FTS5 query with proper escaping and phrase handling
   */
  private buildFTSQuery(query: string): string {
    // Clean and escape the query for FTS5
    const cleanQuery = query.replace(/"/g, '""').replace(/\*/g, '').trim();

    if (!cleanQuery) {
      return '*'; // Match all if empty query
    }

    const terms = cleanQuery.split(/\s+/);

    // Use phrase search for exact matches, OR for multiple terms
    if (terms.length === 1) {
      return `"${cleanQuery}"`;
    } else {
      return terms.map(term => `"${term}"`).join(' OR ');
    }
  }

  /**
   * Calculate importance score from importance level
   */
  private calculateImportanceScore(level: string): number {
    const scores = {
      [MemoryImportanceLevel.CRITICAL]: 0.9,
      [MemoryImportanceLevel.HIGH]: 0.7,
      [MemoryImportanceLevel.MEDIUM]: 0.5,
      [MemoryImportanceLevel.LOW]: 0.3,
    };
    return scores[level as MemoryImportanceLevel] || 0.5;
  }

  /**
   * Get memory data by ID and type
   */
  private async getMemoryDataById(memoryId: string, memoryType: string): Promise<any> {
    if (memoryType === 'long_term') {
      return await this.prisma.longTermMemory.findUnique({
        where: { id: memoryId },
        select: {
          summary: true,
          topic: true,
          entitiesJson: true,
          keywordsJson: true,
          classificationReason: true,
        },
      });
    } else if (memoryType === 'short_term') {
      return await this.prisma.shortTermMemory.findUnique({
        where: { id: memoryId },
        select: {
          summary: true,
          processedData: true,
        },
      });
    }
    return null;
  }

  /**
   * Enhanced error handling for FTS operations
   */
  private handleFTSError(operation: string, error: unknown, context?: Record<string, unknown>): Error {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const enhancedError = new Error(`FTS operation '${operation}' failed: ${errorMessage}`);

    logError('FTS operation failed', {
      component: 'FTSManager',
      operation,
      error: errorMessage,
      context: context || {},
      stack: error instanceof Error ? error.stack : undefined,
    });

    // Provide specific guidance based on error type
    if (errorMessage.includes('no such table: memory_fts')) {
      enhancedError.message += ' - FTS5 table not found. Run database migration to initialize FTS schema.';
    } else if (errorMessage.includes('no such function: bm25')) {
      enhancedError.message += ' - BM25 function not available. Ensure SQLite is compiled with FTS5 support.';
    } else if (errorMessage.includes('disk I/O error') || errorMessage.includes('database or disk is full')) {
      enhancedError.message += ' - Database storage error. Check available disk space.';
    }

    return enhancedError;
  }

  /**
   * Safely execute FTS query with comprehensive error handling
   */
  private async safeFTSQuery<T>(
    operation: string,
    queryFn: () => Promise<T>,
    context?: Record<string, unknown>,
  ): Promise<T> {
    try {
      return await queryFn();
    } catch (error) {
      throw this.handleFTSError(operation, error, context);
    }
  }
}