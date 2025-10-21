import { MemoryClassification, MemoryImportanceLevel, MemoryRelationshipType } from '../../types/schemas';

/**
 * Database operation performance data
 * Extends the unified performance metrics structure with database-specific fields
 */
export interface DatabaseOperationMetrics {
    operationType: string;
    tableName?: string;
    recordCount?: number;
    startTime: number;
    endTime?: number;
    duration?: number;
    success: boolean;
    error?: string;
    querySize?: number;
    indexUsed?: boolean;
}

/**
 * Database performance monitoring configuration
 */
export interface DatabasePerformanceConfig {
    enabled: boolean;
    slowQueryThreshold: number; // milliseconds
    trackSlowQueries: boolean;
    maxSlowQueryHistory: number;
    enableQueryAnalysis: boolean;
    collectionInterval: number; // milliseconds
}

// Type definitions for database operations
export interface ChatHistoryData {
    chatId: string;
    userInput: string;
    aiOutput: string;
    model: string;
    sessionId: string;
    namespace: string;
    metadata?: unknown;
}


export interface ConsciousMemoryData {
    id: string;
    chatId?: string;
    content: string;
    summary: string;
    classification: MemoryClassification;
    importance: MemoryImportanceLevel;
    topic?: string;
    entities: string[];
    keywords: string[];
    confidenceScore: number;
    classificationReason: string;
    processedAt?: Date;
    isConsciousContext?: boolean;
}

export interface ShortTermMemoryData {
    chatId: string;
    processedData: unknown;
    importanceScore: number;
    categoryPrimary: string;
    retentionType: string;
    namespace: string;
    searchableContent: string;
    summary: string;
    isPermanentContext: boolean;
}

export interface DatabaseWhereClause {
    namespace: string;
    OR?: Array<{
        searchableContent?: { contains: string };
        summary?: { contains: string };
        topic?: { contains: string };
    }>;
    importanceScore?: { gte: number };
    classification?: { in: MemoryClassification[] };
    categoryPrimary?: string;
    consciousProcessed?: boolean;
    createdAt?: { gte: Date };
    isPermanentContext?: boolean;
}

// Relationship Query Interface
export interface RelationshipQuery {
    sourceMemoryId?: string;
    targetMemoryId?: string;
    relationshipType?: MemoryRelationshipType;
    minConfidence?: number;
    minStrength?: number;
    namespace?: string;
    limit?: number;
}

// Relationship Statistics Interface
export interface RelationshipStatistics {
    totalRelationships: number;
    relationshipsByType: Record<MemoryRelationshipType, number>;
    averageConfidence: number;
    averageStrength: number;
    topEntities: Array<{ entity: string; count: number }>;
    recentRelationships: number; // Last 30 days
}

