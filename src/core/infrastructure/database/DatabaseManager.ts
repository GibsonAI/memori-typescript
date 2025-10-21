import { MemoryImportanceLevel, MemoryClassification, ProcessedLongTermMemory } from '../../../core/types/schemas';
import { MemorySearchResult, SearchOptions, DatabaseStats } from '../../../core/types/models';
import { MemoryStateTransition } from '../../domain/memory/MemoryProcessingStateManager';
import { SearchIndexManager } from '../../domain/search/SearchIndexManager';
import { PerformanceMetrics } from '../../types/base';
import { MemoryRelationship, MemoryRelationshipType } from '../../types/schemas';
import { logInfo, logError } from '../config/Logger';
import { DatabaseContext } from './DatabaseContext';

import { MemoryManager } from './MemoryManager';
import { SearchManager } from './SearchManager';
import { RelationshipManager } from './RelationshipManager';
import { RelationshipService } from './RelationshipService';
import { PerformanceService } from './PerformanceService';
import { DuplicateManager } from './DuplicateManager';
import { StatisticsManager } from './StatisticsManager';
import { ConsciousMemoryManager } from './ConsciousMemoryManager';
import { FTSManager } from './FTSManager';
import { MemoryProcessingState, StateManager } from './StateManager';
import { TransactionCoordinator } from './TransactionCoordinator';
import { ChatHistoryData, ConsciousMemoryData, ShortTermMemoryData, RelationshipQuery, DatabaseOperationMetrics, DatabasePerformanceConfig } from './types';
import { verifyFTSSchema, initializeSearchSchema } from './init-search-schema';
import { PrismaClient } from '@prisma/client';
import { MemoryConsolidationService } from './MemoryConsolidationService';
import { RepositoryFactory } from './factories/RepositoryFactory';
import { ConsolidationService } from './interfaces/ConsolidationService';
import { ChatHistoryManager } from '@/core/domain/conversation/ChatHistoryManager';
import { SearchService } from '@/core/domain/search/SearchService';

// Type definitions for database records and operations
type LongTermMemoryRecord = {
 id: string;
 namespace: string;
 searchableContent: string;
 summary: string;
 classification: string;
 memoryImportance: string;
 topic?: string;
 entitiesJson?: unknown;
 keywordsJson?: unknown;
 confidenceScore: number;
 classificationReason?: string;
 extractionTimestamp: Date;
 createdAt: Date;
 updatedAt: Date;
 relatedMemoriesJson?: MemoryRelationship[];
 supersedesJson?: MemoryRelationship[];
 processedData?: unknown;
 consciousProcessed?: boolean;
 categoryPrimary: string;
 retentionType: string;
 importanceScore: number;
 isPermanentContext: boolean;
};

type ShortTermMemoryRecord = {
 id: string;
 namespace: string;
 searchableContent: string;
 summary: string;
 processedData: unknown;
 importanceScore: number;
 categoryPrimary: string;
 retentionType: string;
 createdAt: Date;
 updatedAt: Date;
 chatId: string;
 isPermanentContext: boolean;
};

type ChatHistoryRecord = {
 id: string;
 chatId: string;
 userInput: string;
 aiOutput: string;
 model: string;
 sessionId: string;
 namespace: string;
 createdAt: Date;
 metadata?: unknown;
};

type DatabaseRecord = LongTermMemoryRecord | ShortTermMemoryRecord | ChatHistoryRecord;

// Type for processedData field in database records
type ProcessedDataRecord = {
  isDuplicate?: boolean;
  duplicateOf?: string;
  consolidationReason?: string;
  markedAsDuplicateAt?: Date;
  consolidatedAt?: Date;
  consolidatedFrom?: string[];
  consolidationHistory?: Array<{
    timestamp: Date;
    consolidatedFrom: string[];
    consolidationReason: string;
    originalImportance: string;
    originalClassification: string;
    duplicateCount: number;
    dataIntegrityHash: string;
  }>;
  originalImportance?: string;
  originalClassification?: string;
  duplicateCount?: number;
  lastConsolidationActivity?: Date;
  conflictResolutionCount?: number;
  lastConflictResolution?: Date;
  relationshipCleanupCount?: number;
  lastRelationshipCleanup?: Date;
  cleanedUp?: boolean;
  cleanedUpAt?: Date;
  cleanupReason?: string;
  rollbackTimestamp?: Date;
  rollbackReason?: string;
  isConsolidated?: boolean;
  consolidatedInto?: string;
  originalDataHash?: string;
  consolidationMetadata?: {
    consolidationMethod: string;
    primaryMemoryClassification: string;
    primaryMemoryImportance: string;
    dataMerged: boolean;
  };
  [key: string]: unknown;
};

// Type for Prisma transaction context




/**
 * DatabaseManager Facade - Coordinates all database operations
 *
 * This facade maintains backward compatibility while delegating operations
 * to specialized managers for better separation of concerns and maintainability.
 */
export class DatabaseManager {
  private databaseContext: DatabaseContext;
  private chatHistoryManager: ChatHistoryManager;
  private memoryManager: MemoryManager;
  private searchManager: SearchManager;
  private relationshipManager: RelationshipManager;
  private relationshipService?: RelationshipService;
  private performanceService?: PerformanceService;
  private duplicateManager: DuplicateManager;
  private statisticsManager: StatisticsManager;
  private consciousMemoryManager: ConsciousMemoryManager;
  private ftsManager: FTSManager;
  private stateManager?: StateManager;

  // Additional properties for SearchService, SearchIndexManager, and FTS support
  private searchService?: SearchService;
  private searchIndexManager?: SearchIndexManager;
  private ftsEnabled: boolean = false;
  private initializationInProgress: boolean = false;

  // Consolidation service for memory consolidation operations
  private consolidationService: ConsolidationService;

  // Prisma client reference
  private prisma: PrismaClient;

  // Consolidation scheduling configuration
  private consolidationScheduleConfig = {
    enabled: true,
    intervalMinutes: 60, // Run every hour
    maxConsolidationsPerRun: 50,
    similarityThreshold: 0.7,
    dryRun: false,
  };

  // Consolidation scheduling timer
  private consolidationTimer?: NodeJS.Timeout;


  constructor(
    databaseUrl: string,
    consolidationService?: ConsolidationService
  ) {
    // Initialize DatabaseContext with shared database infrastructure
    this.databaseContext = new DatabaseContext({
      databaseUrl,
      enablePerformanceMonitoring: true,
      enableFTS: true,
      performanceConfig: {
        enabled: true,
        slowQueryThreshold: 1000,
        trackSlowQueries: true,
        maxSlowQueryHistory: 100,
        enableQueryAnalysis: true,
        collectionInterval: 60000,
      },
      stateManagerConfig: {
        enableHistoryTracking: true,
        enableMetrics: true,
        maxHistoryEntries: 100,
      },
    });

    // Initialize all specialized managers with proper dependency injection
    this.chatHistoryManager = new ChatHistoryManager(this.databaseContext);

    // MemoryManager needs StateManager, so create it first
    this.stateManager = new StateManager(this.databaseContext, {
      enableHistoryTracking: true,
      enableMetrics: true,
      maxHistoryEntries: 100,
    });

    this.memoryManager = new MemoryManager(this.databaseContext, {
      enableStateTracking: true,
      enableValidation: true,
      maxContentLength: 10000,
      defaultNamespace: 'default',
    });

    // Initialize Prisma client first
    this.prisma = this.databaseContext.getPrismaClient();

    // Initialize FTSManager - schema will be initialized lazily when needed
    this.ftsManager = new FTSManager(this.prisma);

    this.searchManager = new SearchManager(this.databaseContext, this.ftsManager);

    // Initialize managers with complex dependencies
    const transactionCoordinator = new TransactionCoordinator(this.databaseContext);

    this.duplicateManager = new DuplicateManager(
      this.databaseContext,
      this.memoryManager,
      transactionCoordinator,
      this.searchManager,
      this.stateManager,
    );

    this.relationshipManager = new RelationshipManager(this.databaseContext);
    this.relationshipService = new RelationshipService(this.databaseContext, this.relationshipManager);
    this.performanceService = new PerformanceService(this.databaseContext.getPerformanceMonitoringConfig());
    this.statisticsManager = new StatisticsManager(this.databaseContext);
    this.consciousMemoryManager = new ConsciousMemoryManager(
      this.databaseContext,
      this.memoryManager,
    );

    // Initialize consolidation service with DuplicateManager for unified similarity calculations
    this.consolidationService = consolidationService || (() => {
      const service = new MemoryConsolidationService(
        RepositoryFactory.createConsolidationRepository(this.prisma)
      );
      // Inject DuplicateManager for sophisticated similarity calculations
      service.setDuplicateManager(this.duplicateManager);
      return service;
    })();
  }

  /**
   * Get PrismaClient instance for direct database access
   */
  getPrismaClient() {
    return this.databaseContext.getPrismaClient();
  }

  /**
   * Get ConsolidationService instance for consolidation operations
   */
  getConsolidationService(): ConsolidationService {
    return this.consolidationService;
  }

  /**
   * Get consolidation performance metrics integrated with main performance monitoring
   */
  async getConsolidationPerformanceMetrics(): Promise<{
    consolidationOperations: number;
    averageConsolidationTime: number;
    consolidationSuccessRate: number;
    consolidationErrors: number;
    rollbackOperations: number;
    averageRollbackTime: number;
    consolidationThroughput: number; // operations per minute
    memoryReductionRatio: number; // average memory reduction per consolidation
    lastConsolidationActivity?: Date;
    consolidationQueueSize: number;
  }> {
    try {
      // Get consolidation analytics from service
      const consolidationAnalytics = await this.consolidationService.getConsolidationAnalytics();

      // Get performance metrics from performance service
      const performanceMetrics = this.getPerformanceMetrics();
      const recentOperations = this.getRecentOperationMetrics(100);

      // Filter consolidation-related operations
      const consolidationOperations = recentOperations.filter(op =>
        op.operationType?.includes('consolidation') || op.operationType?.includes('duplicate')
      );

      // Calculate consolidation-specific metrics
      const consolidationTimes = consolidationOperations
        .filter(op => op.duration !== undefined)
        .map(op => op.duration!);

      const averageConsolidationTime = consolidationTimes.length > 0
        ? consolidationTimes.reduce((a, b) => a + b, 0) / consolidationTimes.length
        : 0;

      const consolidationErrors = consolidationOperations.filter(op => op.error).length;
      const consolidationSuccessRate = consolidationOperations.length > 0
        ? ((consolidationOperations.length - consolidationErrors) / consolidationOperations.length) * 100
        : 100;

      // Calculate throughput (operations per minute over last hour)
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      const recentConsolidationOps = consolidationOperations.filter(op => op.startTime > oneHourAgo);
      const consolidationThroughput = recentConsolidationOps.length;

      // Calculate memory reduction ratio (estimated)
      const memoryReductionRatio = consolidationAnalytics.averageConsolidationRatio * 0.7; // Assume 70% efficiency

      // Get rollback operations count
      const rollbackOperations = recentOperations.filter(op =>
        op.operationType?.includes('rollback')
      ).length;

      const averageRollbackTime = 0; // Would need additional tracking

      return {
        consolidationOperations: consolidationOperations.length,
        averageConsolidationTime: Math.round(averageConsolidationTime),
        consolidationSuccessRate: Math.round(consolidationSuccessRate * 100) / 100,
        consolidationErrors,
        rollbackOperations,
        averageRollbackTime,
        consolidationThroughput,
        memoryReductionRatio: Math.round(memoryReductionRatio * 100) / 100,
        lastConsolidationActivity: consolidationAnalytics.lastConsolidationActivity,
        consolidationQueueSize: 0, // Would need queue tracking implementation
      };
    } catch (error) {
      logError('Error getting consolidation performance metrics', {
        component: 'DatabaseManager',
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        consolidationOperations: 0,
        averageConsolidationTime: 0,
        consolidationSuccessRate: 0,
        consolidationErrors: 0,
        rollbackOperations: 0,
        averageRollbackTime: 0,
        consolidationThroughput: 0,
        memoryReductionRatio: 0,
        consolidationQueueSize: 0,
      };
    }
  }

  /**
     * Initialize or get the SearchService instance
     */
  public async getSearchService(): Promise<SearchService> {
    if (!this.searchService) {
      this.searchService = new SearchService(this);
      // Ensure async initialization is completed
      await this.searchService.initializeAsync();
    }
    return this.searchService;
  }

  /**
   * Initialize or get the SearchIndexManager instance
   */
  public getSearchIndexManager(): SearchIndexManager {
    if (!this.searchIndexManager) {
      // Ensure FTS is ready before creating SearchIndexManager
      if (!this.ftsEnabled) {
        this.initializeFTSSchema();
      }
      this.searchIndexManager = new SearchIndexManager(this);
    }
    return this.searchIndexManager;
  }



  async storeChatHistory(data: ChatHistoryData): Promise<string> {
    return this.chatHistoryManager.storeChatHistory(data);
  }

  async storeLongTermMemory(
    memoryData: ProcessedLongTermMemory,
    chatId: string,
    namespace: string,
  ): Promise<string> {
    return this.memoryManager.storeLongTermMemory(memoryData, chatId, namespace);
  }






  async close(): Promise<void> {
    // Stop consolidation scheduling to clear intervals
    this.stopConsolidationScheduling();

    // Cleanup search index manager
    if (this.searchIndexManager) {
      this.searchIndexManager.cleanup();
    }

    // Cleanup database context to stop health monitoring and other resources
    if (this.databaseContext) {
      await this.databaseContext.cleanup();
    }

    await this.prisma.$disconnect();
  }

  // Memory Relationship Operations

  /**
   * Store memory relationships for a given memory
   * Updates the relatedMemoriesJson and supersedesJson fields with extracted relationships
   */
  async storeMemoryRelationships(
    memoryId: string,
    relationships: MemoryRelationship[],
    namespace: string = 'default',
  ): Promise<{ stored: number; errors: string[] }> {
    return this.relationshipService!.storeMemoryRelationships(memoryId, relationships, namespace);
  }

  /**
   * Query memories by relationship type
   * Returns memories that have relationships of the specified type
   */
  async getMemoriesByRelationship(
    query: RelationshipQuery,
  ): Promise<Array<{
    memory: DatabaseRecord;
    relationships: MemoryRelationship[];
    matchReason: string;
  }>> {
    return this.relationshipService!.getMemoriesByRelationship(query);
  }

  /**
   * Get memories related to a specific memory through relationships
   */
  async getRelatedMemories(
    memoryId: string,
    options: {
      relationshipType?: MemoryRelationshipType;
      minConfidence?: number;
      minStrength?: number;
      namespace?: string;
      limit?: number;
    } = {},
  ): Promise<Array<{
    memory: DatabaseRecord;
    relationship: MemoryRelationship;
    direction: 'incoming' | 'outgoing';
  }>> {
    return this.relationshipService!.getRelatedMemories(memoryId, options);
  }




  /**
   * Detect and resolve relationship conflicts
   */
  async resolveRelationshipConflicts(
    memoryId: string,
    namespace: string = 'default',
  ): Promise<{ resolved: number, conflicts: Array<{ type: string, description: string }> }> {
    return this.relationshipService!.resolveRelationshipConflicts(memoryId, namespace);
  }




  // Memory State Management Operations


  /**
   * Get memories by processing state
   */
  async getMemoriesByState(
    state: MemoryProcessingState,
    namespace: string = 'default',
    limit?: number,
  ): Promise<string[]> {
    return this.stateManager!.getMemoriesByState(state, namespace, limit);
  }

  /**
   * Get memory processing state
   */
  async getMemoryState(memoryId: string): Promise<MemoryProcessingState | undefined> {
    return this.stateManager!.getMemoryState(memoryId);
  }

  /**
   * Get memory state history
   */
  async getMemoryStateHistory(memoryId: string): Promise<MemoryStateTransition[]> {
    return this.stateManager!.getMemoryStateHistory(memoryId);
  }

  /**
   * Transition memory to new state
   */
  async transitionMemoryState(
    memoryId: string,
    toState: MemoryProcessingState,
    options?: {
      reason?: string;
      metadata?: Record<string, unknown>;
      userId?: string;
      agentId?: string;
      errorMessage?: string;
      force?: boolean;
    },
  ): Promise<boolean> {
    return this.stateManager!.transitionMemoryState(memoryId, toState, options);
  }

  /**
   * Get processing state statistics
   */
  async getProcessingStateStats(namespace?: string): Promise<Record<MemoryProcessingState, number>> {
    return this.stateManager!.getProcessingStateStats(namespace);
  }

  /**
   * Initialize memory state (for existing memories without state tracking)
   */
  async initializeExistingMemoryState(
    memoryId: string,
    initialState: MemoryProcessingState = MemoryProcessingState.PENDING,
  ): Promise<void> {
    await this.stateManager!.initializeExistingMemoryState(memoryId, initialState);
  }

  /**
   * Get all memory states
   */
  async getAllMemoryStates(): Promise<Record<string, MemoryProcessingState>> {
    return this.stateManager!.getAllMemoryStates();
  }

  /**
   * Check if memory can transition to specific state
   */
  async canMemoryTransitionTo(memoryId: string, toState: MemoryProcessingState): Promise<boolean> {
    return this.stateManager!.canMemoryTransitionTo(memoryId, toState);
  }

  /**
   * Retry failed memory state transition
   */
  async retryMemoryStateTransition(
    memoryId: string,
    targetState: MemoryProcessingState,
    options?: { maxRetries?: number; delayMs?: number },
  ): Promise<boolean> {
    return this.stateManager!.retryMemoryStateTransition(memoryId, targetState, options);
  }

  /**
   * Get processing metrics
   */
  async getProcessingMetrics(): Promise<Record<string, number>> {
    return this.stateManager!.getProcessingMetrics();
  }

  /**
   * Check if FTS5 search is enabled
   */
  isFTSEnabled(): boolean {
    return this.ftsEnabled;
  }

  /**
   * Initialize FTS schema during DatabaseManager construction
   */
  private async initializeFTSSchema(): Promise<void> {
    try {
      logInfo('Initializing FTS schema during DatabaseManager startup...', {
        component: 'DatabaseManager',
      });

      // First try to initialize the schema
      const initialized = await initializeSearchSchema(this.prisma);

      if (initialized) {
        logInfo('FTS schema initialized successfully', {
          component: 'DatabaseManager',
        });
        this.ftsEnabled = true;
      } else {
        logError('FTS schema initialization returned false - may need manual intervention', {
          component: 'DatabaseManager',
        });
        this.ftsEnabled = false;
      }

    } catch (error) {
      logError('Failed to initialize FTS schema during startup', {
        component: 'DatabaseManager',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      this.ftsEnabled = false;
      // Don't throw here - let the system continue even if FTS fails
    }
  }

  /**
   * Ensure FTS support is properly initialized (only when needed)
   */
  private async ensureFTSSupport(): Promise<void> {
    if (this.ftsEnabled) return;

    try {
      // Only verify if we haven't already initialized successfully
      if (!this.ftsEnabled) {
        const verification = await verifyFTSSchema(this.prisma);
        this.ftsEnabled = verification.isValid;

        if (!this.ftsEnabled) {
          logError('FTS support verification failed', {
            component: 'DatabaseManager',
            issues: verification.issues,
          });
        } else {
          logInfo('FTS support verified and enabled', {
            component: 'DatabaseManager',
            stats: verification.stats,
          });
        }
      }
    } catch (error) {
      logError('Failed to verify FTS support', {
        component: 'DatabaseManager',
        error: error instanceof Error ? error.message : String(error),
      });
      this.ftsEnabled = false;
    }
  }

  /**
    * Get FTS schema verification status
    */
  async getFTSStatus(): Promise<{
    enabled: boolean;
    isValid: boolean;
    issues: string[];
    stats: { tables: number; triggers: number; indexes: number };
  }> {
    try {
      // Ensure FTS support is initialized before checking status
      await this.ensureFTSSupport();
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
    * Enhanced error handling for FTS operations
    */
  private handleFTSError(operation: string, error: unknown, context?: Record<string, unknown>): Error {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const enhancedError = new Error(`FTS operation '${operation}' failed: ${errorMessage}`);

    logError('FTS operation failed', {
      component: 'DatabaseManager',
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

  // Conscious Memory Operations

  async getUnprocessedConsciousMemories(namespace: string = 'default'): Promise<ConsciousMemoryData[]> {
    return this.consciousMemoryManager.getUnprocessedConsciousMemories(namespace);
  }

  async getNewConsciousMemories(since: Date = new Date(Date.now() - 24 * 60 * 60 * 1000), namespace: string = 'default'): Promise<ConsciousMemoryData[]> {
    return this.consciousMemoryManager.getNewConsciousMemories(since, namespace);
  }

  async storeConsciousMemoryInShortTerm(memoryData: ShortTermMemoryData, namespace: string): Promise<string> {
    return this.consciousMemoryManager.storeConsciousMemoryInShortTerm(memoryData, namespace);
  }

  async getConsciousMemoriesFromShortTerm(namespace: string): Promise<ConsciousMemoryData[]> {
    return this.consciousMemoryManager.getConsciousMemoriesFromShortTerm(namespace);
  }


  async markConsciousMemoryAsProcessed(memoryId: string): Promise<void> {
    return this.consciousMemoryManager.markConsciousMemoryAsProcessed(memoryId);
  }

  async markMultipleMemoriesAsProcessed(memoryIds: string[]): Promise<void> {
    await this.prisma.longTermMemory.updateMany({
      where: { id: { in: memoryIds } },
      data: { consciousProcessed: true },
    });
  }

  async getProcessedConsciousMemories(namespace: string = 'default'): Promise<ConsciousMemoryData[]> {
    const memories = await this.prisma.longTermMemory.findMany({
      where: {
        namespace,
        categoryPrimary: 'conscious-info',
        consciousProcessed: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return memories.map((memory) => ({
      id: memory.id,
      content: memory.searchableContent,
      summary: memory.summary,
      classification: memory.classification as unknown as MemoryClassification,
      importance: memory.memoryImportance as unknown as MemoryImportanceLevel,
      topic: memory.topic ?? undefined,
      entities: (memory.entitiesJson as unknown[]) as string[] || [],
      keywords: (memory.keywordsJson as unknown[]) as string[] || [],
      confidenceScore: memory.confidenceScore,
      classificationReason: memory.classificationReason ?? '',
      processedAt: memory.extractionTimestamp,
    }));
  }

  async getConsciousProcessingStats(namespace: string = 'default'): Promise<{
    total: number;
    processed: number;
    unprocessed: number;
  }> {
    const [total, processed, unprocessed] = await Promise.all([
      this.prisma.longTermMemory.count({
        where: { namespace, categoryPrimary: 'conscious-info' },
      }),
      this.prisma.longTermMemory.count({
        where: { namespace, categoryPrimary: 'conscious-info', consciousProcessed: true },
      }),
      this.prisma.longTermMemory.count({
        where: { namespace, categoryPrimary: 'conscious-info', consciousProcessed: false },
      }),
    ]);

    return { total, processed, unprocessed };
  }


  // Duplicate Consolidation Operations

















  // Database Statistics Operations

  /**
   * Get comprehensive database statistics
   */
  async getDatabaseStats(namespace: string = 'default'): Promise<DatabaseStats> {
    return this.statisticsManager.getDatabaseStats(namespace);
  }

  // ===== DATABASE PERFORMANCE MONITORING METHODS =====

   /**
    * Record database operation performance metrics
    */
   private recordOperationMetrics(metrics: DatabaseOperationMetrics): void {
     if (this.performanceService) {
       this.performanceService.recordOperationMetrics(metrics);
     }
   }

  /**
   * Get database performance metrics
   */
  public getPerformanceMetrics(): PerformanceMetrics {
    return this.performanceService!.getPerformanceMetrics();
  }

  /**
   * Get recent database operation metrics
   */
  public getRecentOperationMetrics(limit: number = 100): DatabaseOperationMetrics[] {
    return this.performanceService!.getRecentOperationMetrics(limit);
  }

  /**
   * Get database performance analytics
   */
  public getPerformanceAnalytics(): {
    averageLatency: number;
    errorRate: number;
    slowQueryCount: number;
    operationBreakdown: Record<string, number>;
    topErrors: Array<{ error: string; count: number }>;
    slowQueries: Array<{ query: string; duration: number; timestamp: number }>;
    memoryUsage: number;
    connectionStatus: string;
    } {
    return this.performanceService!.getPerformanceAnalytics();
  }

  /**
   * Get database performance report
   */
  public getDatabasePerformanceReport(): {
    summary: {
      totalOperations: number;
      averageLatency: number;
      errorRate: number;
      memoryUsage: number;
      connectionCount: number;
    };
    performanceByOperation: Record<string, { count: number; averageLatency: number; errorRate: number }>;
    slowQueries: Array<{ query: string; duration: number; timestamp: number }>;
    recommendations: string[];
    timestamp: Date;
    } {
    return this.performanceService!.getDatabasePerformanceReport();
  }


  /**
   * Get database performance monitoring status
   */
  public getPerformanceMonitoringStatus(): {
    enabled: boolean;
    totalOperations: number;
    averageLatency: number;
    errorRate: number;
    slowQueryCount: number;
    memoryUsage: number;
    lastOperationTime: number;
    } {
    return this.performanceService!.getPerformanceMonitoringStatus();
  }

  /**
   * Update database performance monitoring configuration
   */
  public updatePerformanceMonitoringConfig(config: Partial<DatabasePerformanceConfig>): void {
    this.performanceService!.updatePerformanceMonitoringConfig(config);
  }

  /**
   * Get database performance monitoring configuration
   */
  public getPerformanceMonitoringConfig(): DatabasePerformanceConfig {
    return this.performanceService!.getPerformanceMonitoringConfig();
  }

  /**
   * Clear database performance metrics
   */
  public clearPerformanceMetrics(): void {
    this.performanceService!.clearPerformanceMetrics();
  }

  // ===== CONSOLIDATION SCHEDULING METHODS =====

  /**
   * Start automated consolidation scheduling
   */
  public startConsolidationScheduling(config?: Partial<typeof this.consolidationScheduleConfig>): void {
    if (!this.consolidationScheduleConfig.enabled) {
      logInfo('Consolidation scheduling is disabled', {
        component: 'DatabaseManager',
      });
      return;
    }

    if (config) {
      this.consolidationScheduleConfig = { ...this.consolidationScheduleConfig, ...config };
    }

    // Clear existing timer if any
    if (this.consolidationTimer) {
      clearInterval(this.consolidationTimer);
    }

    const intervalMs = this.consolidationScheduleConfig.intervalMinutes * 60 * 1000;

    this.consolidationTimer = setInterval(async () => {
      try {
        await this.runScheduledConsolidation();
      } catch (error) {
        logError('Scheduled consolidation failed', {
          component: 'DatabaseManager',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, intervalMs);

    logInfo(`Started consolidation scheduling`, {
      component: 'DatabaseManager',
      intervalMinutes: this.consolidationScheduleConfig.intervalMinutes,
      maxConsolidationsPerRun: this.consolidationScheduleConfig.maxConsolidationsPerRun,
      similarityThreshold: this.consolidationScheduleConfig.similarityThreshold,
    });
  }

  /**
   * Stop automated consolidation scheduling
   */
  public stopConsolidationScheduling(): void {
    if (this.consolidationTimer) {
      clearInterval(this.consolidationTimer);
      this.consolidationTimer = undefined;

      logInfo('Stopped consolidation scheduling', {
        component: 'DatabaseManager',
      });
    }
  }

  /**
   * Run consolidation on schedule
   */
  private async runScheduledConsolidation(): Promise<void> {
    try {
      logInfo('Running scheduled consolidation', {
        component: 'DatabaseManager',
        maxConsolidations: this.consolidationScheduleConfig.maxConsolidationsPerRun,
        similarityThreshold: this.consolidationScheduleConfig.similarityThreshold,
      });

      // Get optimization recommendations to determine what needs consolidation
      const recommendations = await this.consolidationService.getOptimizationRecommendations();

      if (recommendations.overallHealth === 'poor') {
        logInfo('Skipping scheduled consolidation - system health is poor', {
          component: 'DatabaseManager',
          recommendations: recommendations.recommendations.length,
        });
        return;
      }

      // Get consolidation analytics to check current state
      const analytics = await this.consolidationService.getConsolidationAnalytics();

      if (analytics.duplicateCount === 0) {
        logInfo('No duplicates found for consolidation', {
          component: 'DatabaseManager',
          totalMemories: analytics.totalMemories,
        });
        return;
      }

      // Limit consolidation to avoid overwhelming the system
      const consolidationLimit = Math.min(
        this.consolidationScheduleConfig.maxConsolidationsPerRun,
        Math.floor(analytics.duplicateCount * 0.1) // Only consolidate 10% at a time
      );

      if (consolidationLimit === 0) {
        return;
      }

      // Get recent memories for consolidation analysis
      const recentMemories = await this.prisma.longTermMemory.findMany({
        where: {
          namespace: 'default',
          duplicateOf: null, // Only primary memories
        },
        orderBy: { createdAt: 'desc' },
        take: consolidationLimit * 2, // Get more to account for filtering
        select: {
          id: true,
          searchableContent: true,
          summary: true,
        },
      });

      let consolidatedCount = 0;
      const errors: string[] = [];

      // Process memories in batches for consolidation
      for (let i = 0; i < recentMemories.length && consolidatedCount < consolidationLimit; i++) {
        try {
          const memory = recentMemories[i];

          // Find duplicates for this memory
          const duplicates = await this.consolidationService.detectDuplicateMemories(
            memory.searchableContent + ' ' + memory.summary,
            this.consolidationScheduleConfig.similarityThreshold,
          );

          if (duplicates.length > 0) {
            // Filter to only high-confidence duplicates
            const highConfidenceDuplicates = duplicates.filter(d => d.confidence >= 0.8);

            if (highConfidenceDuplicates.length > 0) {
              // Consolidate the duplicates
              const result = await this.consolidationService.consolidateMemories(
                memory.id,
                highConfidenceDuplicates.map(d => d.id),
              );

              if (result.success) {
                consolidatedCount += result.consolidatedCount;
              }
            }
          }
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }

      logInfo('Scheduled consolidation completed', {
        component: 'DatabaseManager',
        processedMemories: recentMemories.length,
        consolidatedCount,
        errors: errors.length,
        nextRunMinutes: this.consolidationScheduleConfig.intervalMinutes,
      });

    } catch (error) {
      logError('Scheduled consolidation error', {
        component: 'DatabaseManager',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get consolidation scheduling status
   */
  public getConsolidationSchedulingStatus(): {
    enabled: boolean;
    running: boolean;
    nextRunMinutes?: number;
    config: {
      enabled: boolean;
      intervalMinutes: number;
      maxConsolidationsPerRun: number;
      similarityThreshold: number;
      dryRun: boolean;
    };
  } {
    return {
      enabled: this.consolidationScheduleConfig.enabled,
      running: !!this.consolidationTimer,
      nextRunMinutes: this.consolidationTimer
        ? this.consolidationScheduleConfig.intervalMinutes
        : undefined,
      config: this.consolidationScheduleConfig,
    };
  }

  /**
   * Update consolidation scheduling configuration
   */
  public updateConsolidationSchedulingConfig(config: Partial<typeof this.consolidationScheduleConfig>): void {
    this.consolidationScheduleConfig = { ...this.consolidationScheduleConfig, ...config };

    logInfo('Updated consolidation scheduling configuration', {
      component: 'DatabaseManager',
      config: this.consolidationScheduleConfig,
    });

    // Restart scheduling if currently running
    if (this.consolidationTimer) {
      this.stopConsolidationScheduling();
      this.startConsolidationScheduling();
    }
  }
}
