/**
 * RelationshipProcessor - Advanced Memory Relationship Processing Service
 *
 * This service provides comprehensive relationship extraction, analysis, and processing
 * capabilities using LLM-based analysis integrated with the existing OpenAI infrastructure.
 *
 * Key Features:
 * - LLM-powered relationship extraction using OpenAI provider
 * - Advanced relationship graph analysis and traversal
 * - Relationship strength calculation and propagation
 * - Memory consolidation based on relationship patterns
 * - Comprehensive error handling and validation
 *
 * Integration:
 * - Uses OpenAIProvider from the provider architecture
 * - Integrates with DatabaseManager relationship storage
 * - Works with RelationshipSearchStrategy for graph traversal
 * - Follows established patterns for error handling and logging
 */

import { MemoryRelationship, MemoryRelationshipType } from '../../../types/schemas';
import { DatabaseManager } from '../../../infrastructure/database/DatabaseManager';
import { RelationshipSearchStrategy } from '../strategies/RelationshipSearchStrategy';
import { OpenAIProvider } from '../../../infrastructure/providers/OpenAIProvider';
// Types defined inline for relationship processing
interface RelationshipExtractionResult {
  relationships: any[];
  extractionMethod: string;
  confidence: number;
  extractedAt: Date;
  error?: string;
  processingMetadata?: {
    llmModel?: string;
    llmTokensUsed?: number;
    analysisDepth?: number;
    relatedMemoriesAnalyzed?: number;
    processingTime?: number;
  };
}

interface RelationshipAnalysisContext {
  sessionId?: string;
  userPreferences?: string[];
  currentProjects?: string[];
  analysisDepth?: number;
  includeTemporalAnalysis?: boolean;
  includeEntityMatching?: boolean;
  namespace?: string;
}

interface RelationshipGraph {
  namespace: string;
  nodes: any[];
  edges: any[];
  statistics: any;
  builtAt: Date;
  metadata?: {
    nodeCount: number;
    edgeCount: number;
    averageDegree: number;
    density: number;
  };
}
import { logInfo, logError } from '../../../infrastructure/config/Logger';

export class RelationshipProcessor {
  private databaseManager: DatabaseManager;
  private openaiProvider: OpenAIProvider;
  private relationshipSearchStrategy: RelationshipSearchStrategy;

  // Configuration for relationship processing optimization
  private readonly config = {
    defaultAnalysisDepth: 3,
    maxAnalysisDepth: 10,
    confidenceThreshold: 0.3,
    strengthThreshold: 0.4,
    maxRelatedMemories: 50,
    enableRelationshipPropagation: true,
    enableGraphOptimization: true,
    llmAnalysisTimeout: 30000, // 30 seconds
    maxRetries: 3,
    retryDelay: 1000, // 1 second
  };

  // Cache for relationship analysis results
  private relationshipCache = new Map<string, { result: RelationshipExtractionResult; timestamp: Date }>();
  private graphCache = new Map<string, { graph: RelationshipGraph; timestamp: Date }>();

  constructor(
    databaseManager: DatabaseManager,
    openaiProvider: OpenAIProvider,
    options?: {
      defaultAnalysisDepth?: number;
      maxAnalysisDepth?: number;
      confidenceThreshold?: number;
      strengthThreshold?: number;
      maxRelatedMemories?: number;
      enableRelationshipPropagation?: boolean;
      enableGraphOptimization?: boolean;
    }
  ) {
    this.databaseManager = databaseManager;
    this.openaiProvider = openaiProvider;
    this.relationshipSearchStrategy = new RelationshipSearchStrategy(
      RelationshipSearchStrategy.createDefaultConfig(),
      databaseManager
    );

    // Apply custom configuration if provided
    if (options) {
      Object.assign(this.config, options);
    }

    logInfo('RelationshipProcessor initialized', {
      component: 'RelationshipProcessor',
      config: this.config,
    });
  }

  /**
   * Extract relationships using LLM analysis with OpenAI provider
   */
  async extractRelationships(
    content: string,
    context: RelationshipAnalysisContext,
    existingMemories: any[] = []
  ): Promise<RelationshipExtractionResult> {
    const cacheKey = this.generateCacheKey(content, context);

    // Check cache first
    const cached = this.relationshipCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp.getTime()) < 300000) { // 5 minute cache
      logInfo('Using cached relationship extraction result', {
        component: 'RelationshipProcessor',
        cacheKey,
        cachedAt: cached.timestamp,
      });
      return cached.result;
    }

    try {
      logInfo('Starting LLM-based relationship extraction', {
        component: 'RelationshipProcessor',
        contentLength: content.length,
        existingMemoriesCount: existingMemories.length,
        contextSessionId: context.sessionId,
      });

      // Use OpenAI provider for relationship analysis
      const systemPrompt = this.buildRelationshipAnalysisPrompt();
      const userPrompt = this.buildRelationshipAnalysisUserPrompt(content, context, existingMemories);

      // Get OpenAI provider for relationship analysis
      const openaiClient = this.openaiProvider.getClient();

      const response = await openaiClient.chat.completions.create({
        model: this.openaiProvider.getModel(),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1, // Low temperature for consistent analysis
        max_tokens: 1500,
      });

      const llmResponse = response.choices[0]?.message?.content;
      if (!llmResponse) {
        throw new Error('No response from OpenAI for relationship analysis');
      }

      // Parse and validate LLM response
      const extractedRelationships = this.parseLLMRelationshipResponse(llmResponse);
      const validatedRelationships = await this.validateAndScoreRelationships(
        extractedRelationships,
        content,
        existingMemories
      );

      const result: RelationshipExtractionResult = {
        relationships: validatedRelationships,
        extractionMethod: 'llm_analysis',
        confidence: this.calculateOverallConfidence(validatedRelationships),
        extractedAt: new Date(),
        processingMetadata: {
          llmModel: this.openaiProvider.getModel(),
          llmTokensUsed: response.usage?.total_tokens || 0,
          analysisDepth: context.analysisDepth || this.config.defaultAnalysisDepth,
          relatedMemoriesAnalyzed: existingMemories.length,
          processingTime: Date.now() - (this.operationStartTime || Date.now()),
        },
      };

      // Cache the result
      this.relationshipCache.set(cacheKey, { result, timestamp: new Date() });

      logInfo('LLM relationship extraction completed successfully', {
        component: 'RelationshipProcessor',
        relationshipsFound: validatedRelationships.length,
        overallConfidence: result.confidence,
        cacheKey,
      });

      return result;

    } catch (error) {
      logError('LLM relationship extraction failed', {
        component: 'RelationshipProcessor',
        error: error instanceof Error ? error.message : String(error),
        contentLength: content.length,
        existingMemoriesCount: existingMemories.length,
      });

      // Return empty result with error information
      return {
        relationships: [],
        extractionMethod: 'llm_analysis_failed',
        confidence: 0,
        extractedAt: new Date(),
        error: error instanceof Error ? error.message : String(error),
        processingMetadata: {
          analysisDepth: context.analysisDepth || this.config.defaultAnalysisDepth,
          relatedMemoriesAnalyzed: existingMemories.length,
          processingTime: Date.now() - (this.operationStartTime || Date.now()),
        },
      };
    }
  }

  /**
   * Build relationship analysis graph for comprehensive relationship mapping
   */
  async buildRelationshipGraph(namespace: string = 'default'): Promise<RelationshipGraph> {
    const cacheKey = `graph_${namespace}`;

    // Check cache first
    const cached = this.graphCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp.getTime()) < 600000) { // 10 minute cache
      logInfo('Using cached relationship graph', {
        component: 'RelationshipProcessor',
        namespace,
        cachedAt: cached.timestamp,
      });
      return cached.graph;
    }

    try {
      logInfo('Building relationship graph', {
        component: 'RelationshipProcessor',
        namespace,
      });

      // Get all memories with relationships
      const memoriesWithRelationships = await this.getMemoriesWithRelationships(namespace);

      // Build graph structure
      const nodes = new Map<string, any>();
      const edges: Array<{
        source: string;
        target: string;
        relationship: MemoryRelationship;
        weight: number;
      }> = [];

      // Process each memory and its relationships
      for (const memory of memoriesWithRelationships) {
        nodes.set(memory.id, {
          id: memory.id,
          content: memory.searchableContent,
          summary: memory.summary,
          classification: memory.classification,
          importance: memory.importanceScore,
          createdAt: memory.createdAt,
          entities: memory.entitiesJson || [],
          keywords: memory.keywordsJson || [],
        });

        // Add outgoing relationships as edges
        await this.addMemoryRelationshipsToGraph(memory, edges);
      }

      // Calculate graph statistics
      const graphStats = this.calculateGraphStatistics(nodes, edges);

      const graph: RelationshipGraph = {
        namespace,
        nodes: Array.from(nodes.values()),
        edges,
        statistics: graphStats,
        builtAt: new Date(),
        metadata: {
          nodeCount: nodes.size,
          edgeCount: edges.length,
          averageDegree: nodes.size > 0 ? edges.length / nodes.size : 0,
          density: this.calculateGraphDensity(nodes.size, edges.length),
        },
      };

      // Cache the graph
      this.graphCache.set(cacheKey, { graph, timestamp: new Date() });

      logInfo('Relationship graph built successfully', {
        component: 'RelationshipProcessor',
        namespace,
        nodeCount: nodes.size,
        edgeCount: edges.length,
        graphStats,
      });

      return graph;

    } catch (error) {
      logError('Failed to build relationship graph', {
        component: 'RelationshipProcessor',
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new Error(`Failed to build relationship graph: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Calculate relationship strength and propagation across the graph
   */
  async calculateRelationshipStrengths(
    memoryId: string,
    namespace: string = 'default'
  ): Promise<Map<string, number>> {
    try {
      logInfo('Calculating relationship strengths', {
        component: 'RelationshipProcessor',
        memoryId,
        namespace,
      });

      // Build or get cached relationship graph
      const graph = await this.buildRelationshipGraph(namespace);

      // Find the source node
      const sourceNode = graph.nodes.find((node: any) => node.id === memoryId);
      if (!sourceNode) {
        throw new Error(`Memory ${memoryId} not found in relationship graph`);
      }

      // Calculate propagated strengths using relationship-aware algorithm
      const strengthMap = new Map<string, number>();
      strengthMap.set(memoryId, 1.0); // Source has full strength

      // Use breadth-first traversal to propagate strengths
      const visited = new Set<string>();
      const queue: Array<{ id: string; strength: number; depth: number }> = [
        { id: memoryId, strength: 1.0, depth: 0 }
      ];

      while (queue.length > 0 && visited.size < 1000) { // Limit to prevent infinite loops
        const current = queue.shift()!;
        const currentNodeId = current.id;

        if (visited.has(currentNodeId)) continue;
        visited.add(currentNodeId);

        // Find edges from current node
        const outgoingEdges = graph.edges.filter(edge => edge.source === currentNodeId);

        for (const edge of outgoingEdges) {
          if (visited.has(edge.target)) continue;

          // Calculate propagated strength based on relationship properties
          const propagatedStrength = this.calculatePropagatedStrength(
            current.strength,
            edge.relationship,
            current.depth
          );

          // Update strength if this path provides higher strength
          const existingStrength = strengthMap.get(edge.target) || 0;
          if (propagatedStrength > existingStrength) {
            strengthMap.set(edge.target, propagatedStrength);

            // Add to queue for further propagation
            if (current.depth < this.config.maxAnalysisDepth) {
              queue.push({
                id: edge.target,
                strength: propagatedStrength,
                depth: current.depth + 1,
              });
            }
          }
        }
      }

      logInfo('Relationship strength calculation completed', {
        component: 'RelationshipProcessor',
        memoryId,
        namespace,
        calculatedStrengths: strengthMap.size,
        maxStrength: Math.max(...Array.from(strengthMap.values())),
      });

      return strengthMap;

    } catch (error) {
      logError('Failed to calculate relationship strengths', {
        component: 'RelationshipProcessor',
        memoryId,
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new Error(`Failed to calculate relationship strengths: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Identify relationship clusters and communities in the graph
   */
  async identifyRelationshipClusters(
    namespace: string = 'default',
    minClusterSize: number = 3
  ): Promise<Array<{
    id: string;
    memoryIds: string[];
    centerMemoryId: string;
    relationshipTypes: MemoryRelationshipType[];
    strength: number;
    cohesion: number;
  }>> {
    try {
      logInfo('Identifying relationship clusters', {
        component: 'RelationshipProcessor',
        namespace,
        minClusterSize,
      });

      const graph = await this.buildRelationshipGraph(namespace);

      // Use simple clustering based on relationship connectivity
      const clusters = this.performGraphClustering(graph, minClusterSize);

      // Enhance clusters with relationship analysis
      const enhancedClusters = await this.enhanceClustersWithRelationshipAnalysis(clusters, graph);

      logInfo('Relationship cluster identification completed', {
        component: 'RelationshipProcessor',
        namespace,
        clustersFound: enhancedClusters.length,
        largestCluster: enhancedClusters.length > 0 ?
          Math.max(...enhancedClusters.map(c => c.memoryIds.length)) : 0,
      });

      return enhancedClusters;

    } catch (error) {
      logError('Failed to identify relationship clusters', {
        component: 'RelationshipProcessor',
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });

      throw new Error(`Failed to identify relationship clusters: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update the operation start time for performance tracking
   */
  private operationStartTime = 0;
  private startOperation(): void {
    this.operationStartTime = Date.now();
  }

  /**
   * Build the system prompt for relationship analysis
   */
  private buildRelationshipAnalysisPrompt(): string {
    return `You are an advanced memory relationship analysis system. Your task is to analyze conversations and extract meaningful relationships between memories.

ANALYSIS GUIDELINES:
- Identify how current content relates to existing memories
- Extract specific relationship types: continuation, reference, related, supersedes, contradiction
- Calculate confidence scores based on semantic similarity and contextual evidence
- Focus on entities, topics, and temporal relationships
- Provide detailed reasoning for each relationship identified

RELATIONSHIP TYPES:
- CONTINUATION: Content continues or builds upon previous discussion
- REFERENCE: Content explicitly references or mentions previous information
- RELATED: Content discusses similar topics or entities without direct reference
- SUPERSEDES: Content replaces or updates previous information
- CONTRADICTION: Content conflicts with or contradicts previous information

CONFIDENCE SCORING:
- 0.8-1.0: Strong evidence, direct references, clear continuation
- 0.6-0.8: Good evidence, topic overlap, entity matches
- 0.4-0.6: Moderate evidence, some semantic similarity
- 0.2-0.4: Weak evidence, tangential connections
- 0.0-0.2: Very weak or no clear relationship

Return your analysis in valid JSON format with this exact structure:
{
  "relationships": [
    {
      "type": "continuation|reference|related|supersedes|contradiction",
      "targetMemoryId": "memory_id_or_null_if_no_specific_target",
      "confidence": 0.0-1.0,
      "strength": 0.0-1.0,
      "reason": "detailed explanation of relationship",
      "entities": ["entity1", "entity2"],
      "context": "specific context supporting this relationship",
      "evidence": ["specific evidence point 1", "specific evidence point 2"]
    }
  ],
  "analysisMetadata": {
    "totalRelationshipsAnalyzed": number,
    "primaryEntities": ["entity1", "entity2"],
    "primaryTopics": ["topic1", "topic2"],
    "temporalIndicators": ["recent", "previous", "before"],
    "confidenceDistribution": {
      "high": number,
      "medium": number,
      "low": number
    }
  }
}`;
  }

  /**
   * Build the user prompt for relationship analysis
   */
  private buildRelationshipAnalysisUserPrompt(
    content: string,
    context: RelationshipAnalysisContext,
    existingMemories: any[]
  ): string {
    const memoryContext = existingMemories.slice(0, 10).map(memory => ({
      id: memory.id,
      content: memory.searchableContent?.substring(0, 200) || '',
      summary: memory.summary || '',
      topic: memory.topic || '',
      entities: memory.entitiesJson || [],
      createdAt: memory.createdAt || memory.extractionTimestamp,
    }));

    return `Analyze the following conversation for memory relationships:

CURRENT CONVERSATION:
${content}

CONTEXT:
- Session ID: ${context.sessionId || 'unknown'}
- User Preferences: ${context.userPreferences?.join(', ') || 'None specified'}
- Current Projects: ${context.currentProjects?.join(', ') || 'None specified'}
- Analysis Depth: ${context.analysisDepth || this.config.defaultAnalysisDepth}

EXISTING MEMORIES FOR ANALYSIS (${memoryContext.length} memories):
${memoryContext.map(memory =>
  `[${memory.id}] ${memory.summary}
   Content: ${memory.content}
   Topic: ${memory.topic}
   Entities: ${memory.entities.join(', ')}
   Created: ${memory.createdAt}`
).join('\n\n')}

ANALYSIS INSTRUCTIONS:
1. Identify specific relationships between the current conversation and existing memories
2. Focus on entities, topics, and temporal connections
3. Calculate confidence and strength scores based on evidence strength
4. Provide detailed reasoning for each identified relationship
5. Consider conversation flow and context when determining relationship types

Return the analysis in the specified JSON format.`;
  }

  /**
   * Parse LLM response for relationship extraction
   */
  private parseLLMRelationshipResponse(llmResponse: string): MemoryRelationship[] {
    try {
      // Clean up the response
      let cleanResponse = llmResponse.trim();
      if (cleanResponse.startsWith('```json')) {
        cleanResponse = cleanResponse.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (cleanResponse.startsWith('```')) {
        cleanResponse = cleanResponse.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const parsed = JSON.parse(cleanResponse);

      if (!parsed.relationships || !Array.isArray(parsed.relationships)) {
        throw new Error('Invalid response structure: missing relationships array');
      }

      // Convert to MemoryRelationship format
      const relationships: MemoryRelationship[] = parsed.relationships.map((rel: any) => ({
        type: rel.type as MemoryRelationshipType,
        targetMemoryId: rel.targetMemoryId || null,
        confidence: Math.max(0, Math.min(1, rel.confidence || 0)),
        strength: Math.max(0, Math.min(1, rel.strength || 0)),
        reason: rel.reason || 'No reason provided',
        entities: Array.isArray(rel.entities) ? rel.entities : [],
        context: rel.context || '',
      }));

      logInfo('Parsed LLM relationship response', {
        component: 'RelationshipProcessor',
        relationshipsCount: relationships.length,
        responseLength: llmResponse.length,
      });

      return relationships;

    } catch (error) {
      logError('Failed to parse LLM relationship response', {
        component: 'RelationshipProcessor',
        error: error instanceof Error ? error.message : String(error),
        responseLength: llmResponse.length,
      });

      throw new Error(`Failed to parse LLM response: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate and score extracted relationships
   */
  private async validateAndScoreRelationships(
    relationships: MemoryRelationship[],
    content: string,
    existingMemories: any[]
  ): Promise<MemoryRelationship[]> {
    const validatedRelationships: MemoryRelationship[] = [];

    for (const relationship of relationships) {
      try {
        // Basic validation
        if (!this.isValidRelationship(relationship)) {
          logInfo('Skipping invalid relationship', {
            component: 'RelationshipProcessor',
            relationshipType: relationship.type,
            confidence: relationship.confidence,
            reason: 'Invalid relationship structure',
          });
          continue;
        }

        // Enhanced scoring based on content analysis
        const enhancedRelationship = await this.enhanceRelationshipScoring(
          relationship,
          content,
          existingMemories
        );

        // Filter by confidence threshold
        if (enhancedRelationship.confidence >= this.config.confidenceThreshold) {
          validatedRelationships.push(enhancedRelationship);
        }

      } catch (error) {
        logError('Error validating relationship', {
          component: 'RelationshipProcessor',
          error: error instanceof Error ? error.message : String(error),
          relationshipType: relationship.type,
        });
      }
    }

    logInfo('Relationship validation and scoring completed', {
      component: 'RelationshipProcessor',
      inputCount: relationships.length,
      validatedCount: validatedRelationships.length,
      averageConfidence: validatedRelationships.length > 0 ?
        validatedRelationships.reduce((sum, r) => sum + r.confidence, 0) / validatedRelationships.length : 0,
    });

    return validatedRelationships;
  }

  /**
   * Enhance relationship scoring with content analysis
   */
  private async enhanceRelationshipScoring(
    relationship: MemoryRelationship,
    content: string,
    existingMemories: any[]
  ): Promise<MemoryRelationship> {
    let enhancedConfidence = relationship.confidence;
    let enhancedStrength = relationship.strength;

    // Find target memory if specified
    const targetMemory = relationship.targetMemoryId ?
      existingMemories.find(m => m.id === relationship.targetMemoryId) : null;

    if (targetMemory) {
      // Calculate semantic similarity
      const semanticSimilarity = this.calculateSemanticSimilarity(
        content,
        targetMemory.searchableContent || targetMemory.content || ''
      );

      // Calculate entity overlap
      const entityOverlap = this.calculateEntityOverlap(
        content,
        targetMemory.entitiesJson || targetMemory.entities || []
      );

      // Calculate temporal proximity
      const temporalFactor = this.calculateTemporalFactor(
        new Date(),
        new Date(targetMemory.createdAt || targetMemory.extractionTimestamp)
      );

      // Combine factors for enhanced scoring
      enhancedConfidence = (relationship.confidence * 0.4) +
                          (semanticSimilarity * 0.3) +
                          (entityOverlap * 0.2) +
                          (temporalFactor * 0.1);

      enhancedStrength = (relationship.strength * 0.5) +
                        (semanticSimilarity * 0.3) +
                        (entityOverlap * 0.2);
    }

    return {
      ...relationship,
      confidence: Math.max(0, Math.min(1, enhancedConfidence)),
      strength: Math.max(0, Math.min(1, enhancedStrength)),
    };
  }

  /**
   * Calculate semantic similarity between two pieces of content
   */
  private calculateSemanticSimilarity(content1: string, content2: string): number {
    const words1 = new Set(content1.toLowerCase().split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(content2.toLowerCase().split(/\s+/).filter(w => w.length > 2));

    const intersection = new Set([...Array.from(words1)].filter(w => words2.has(w)));
    const union = new Set([...Array.from(words1), ...Array.from(words2)]);

    return union.size > 0 ? intersection.size / union.size : 0;
  }

  /**
   * Calculate entity overlap between content and memory entities
   */
  private calculateEntityOverlap(content: string, entities: string[]): number {
    if (entities.length === 0) return 0;

    const contentWords = new Set(content.toLowerCase().split(/\s+/));
    const entityMatches = entities.filter(entity =>
      contentWords.has(entity.toLowerCase())
    );

    return entityMatches.length / entities.length;
  }

  /**
   * Calculate temporal proximity factor
   */
  private calculateTemporalFactor(currentDate: Date, memoryDate: Date): number {
    const timeDiff = Math.abs(currentDate.getTime() - memoryDate.getTime());
    const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

    // Recent memories (within 7 days) get higher temporal factor
    if (daysDiff <= 7) return 1.0;
    if (daysDiff <= 30) return 0.7;
    if (daysDiff <= 90) return 0.4;
    return 0.1;
  }

  /**
   * Validate relationship structure and content
   */
  private isValidRelationship(relationship: MemoryRelationship): boolean {
    // Check required fields
    if (!relationship.type) return false;
    if (!relationship.reason || relationship.reason.trim().length < 10) return false;
    if (relationship.confidence < 0 || relationship.confidence > 1) return false;
    if (relationship.strength < 0 || relationship.strength > 1) return false;

    // Validate relationship type
    const validTypes = Object.values(MemoryRelationshipType);
    if (!validTypes.includes(relationship.type)) return false;

    return true;
  }

  /**
   * Calculate overall confidence from multiple relationships
   */
  private calculateOverallConfidence(relationships: MemoryRelationship[]): number {
    if (relationships.length === 0) return 0;

    const avgConfidence = relationships.reduce((sum, r) => sum + r.confidence, 0) / relationships.length;
    const maxConfidence = Math.max(...relationships.map(r => r.confidence));

    // Weighted combination favoring both average and maximum
    return (avgConfidence * 0.7) + (maxConfidence * 0.3);
  }

  /**
   * Generate cache key for relationship analysis
   */
  private generateCacheKey(content: string, context: RelationshipAnalysisContext): string {
    const contentHash = this.simpleHash(content.substring(0, 100));
    const contextHash = this.simpleHash(JSON.stringify({
      sessionId: context.sessionId,
      userPreferences: context.userPreferences,
      currentProjects: context.currentProjects,
      analysisDepth: context.analysisDepth,
    }));

    return `rel_${contentHash}_${contextHash}`;
  }

  /**
   * Simple hash function for cache keys
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get memories that have relationships
   */
  private async getMemoriesWithRelationships(namespace: string): Promise<any[]> {
    // Get recent memories that might have relationships
    const searchManager = (this.databaseManager as any).searchManager;
    const recentMemories = await searchManager.searchMemories('', {
      namespace,
      limit: this.config.maxRelatedMemories,
    });

    // Filter to memories that have relationship data
    const memoriesWithRelationships = [];

    for (const memory of recentMemories) {
      try {
        // Check if memory has relationships by looking up in database
        const fullMemory = await this.databaseManager.getPrismaClient().longTermMemory.findUnique({
          where: { id: memory.id },
          select: {
            id: true,
            relatedMemoriesJson: true,
            supersedesJson: true,
            searchableContent: true,
            summary: true,
            categoryPrimary: true,
            importanceScore: true,
            retentionType: true,
            createdAt: true,
            extractionTimestamp: true,
            entitiesJson: true,
            keywordsJson: true,
          },
        });

        if (fullMemory && (fullMemory.relatedMemoriesJson || fullMemory.supersedesJson)) {
          memoriesWithRelationships.push(fullMemory);
        }
      } catch (error) {
        logError('Error checking memory for relationships', {
          component: 'RelationshipProcessor',
          memoryId: memory.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return memoriesWithRelationships;
  }

  /**
   * Add memory relationships to graph edges
   */
  private async addMemoryRelationshipsToGraph(
    memory: any,
    edges: Array<{
      source: string;
      target: string;
      relationship: MemoryRelationship;
      weight: number;
    }>
  ): Promise<void> {
    // Add general relationships
    if (memory.relatedMemoriesJson) {
      const relationships = memory.relatedMemoriesJson as MemoryRelationship[];
      for (const relationship of relationships) {
        if (relationship.targetMemoryId) {
          edges.push({
            source: memory.id,
            target: relationship.targetMemoryId,
            relationship,
            weight: relationship.strength,
          });
        }
      }
    }

    // Add superseding relationships
    if (memory.supersedesJson) {
      const superseding = memory.supersedesJson as MemoryRelationship[];
      for (const relationship of superseding) {
        if (relationship.targetMemoryId) {
          edges.push({
            source: memory.id,
            target: relationship.targetMemoryId,
            relationship,
            weight: relationship.strength,
          });
        }
      }
    }
  }

  /**
   * Calculate graph statistics
   */
  private calculateGraphStatistics(
    nodes: Map<string, any>,
    edges: Array<{
      source: string;
      target: string;
      relationship: MemoryRelationship;
      weight: number;
    }>
  ): RelationshipGraph['statistics'] {
    const nodeCount = nodes.size;
    const edgeCount = edges.length;

    // Calculate degree distribution
    const degrees = new Map<string, number>();
    for (const edge of edges) {
      degrees.set(edge.source, (degrees.get(edge.source) || 0) + 1);
      degrees.set(edge.target, (degrees.get(edge.target) || 0) + 1);
    }

    const averageDegree = nodeCount > 0 ? edgeCount / nodeCount : 0;

    // Calculate relationship type distribution
    const relationshipTypes = new Map<MemoryRelationshipType, number>();
    for (const edge of edges) {
      const type = edge.relationship.type;
      relationshipTypes.set(type, (relationshipTypes.get(type) || 0) + 1);
    }

    // Calculate strength distribution
    const strengths = edges.map(e => e.weight);
    const averageStrength = strengths.length > 0 ?
      strengths.reduce((sum, s) => sum + s, 0) / strengths.length : 0;

    return {
      nodeCount,
      edgeCount,
      averageDegree,
      relationshipTypeDistribution: Object.fromEntries(relationshipTypes),
      averageStrength,
      maxStrength: strengths.length > 0 ? Math.max(...strengths) : 0,
      minStrength: strengths.length > 0 ? Math.min(...strengths) : 0,
    };
  }

  /**
   * Calculate graph density
   */
  private calculateGraphDensity(nodeCount: number, edgeCount: number): number {
    if (nodeCount <= 1) return 0;
    const maxPossibleEdges = (nodeCount * (nodeCount - 1)) / 2;
    return maxPossibleEdges > 0 ? edgeCount / maxPossibleEdges : 0;
  }

  /**
   * Calculate propagated strength through relationship chains
   */
  private calculatePropagatedStrength(
    currentStrength: number,
    relationship: MemoryRelationship,
    depth: number
  ): number {
    // Base propagation factor from relationship strength and confidence
    const baseFactor = (relationship.strength * 0.7) + (relationship.confidence * 0.3);

    // Apply depth penalty (exponential decay)
    const depthPenalty = Math.pow(0.8, depth);

    // Apply relationship type specific factors
    const typeFactor = this.getRelationshipTypeFactor(relationship.type);

    return currentStrength * baseFactor * depthPenalty * typeFactor;
  }

  /**
   * Get relationship type specific factor for strength propagation
   */
  private getRelationshipTypeFactor(type: MemoryRelationshipType): number {
    const factors = {
      [MemoryRelationshipType.CONTINUATION]: 0.9,
      [MemoryRelationshipType.REFERENCE]: 0.8,
      [MemoryRelationshipType.RELATED]: 0.6,
      [MemoryRelationshipType.SUPERSEDES]: 0.7,
      [MemoryRelationshipType.CONTRADICTION]: 0.5,
    };

    return factors[type] || 0.6;
  }

  /**
   * Perform simple graph clustering based on connectivity
   */
  private performGraphClustering(
    graph: RelationshipGraph,
    minClusterSize: number
  ): Array<{ memoryIds: string[]; centerMemoryId: string }> {
    const clusters: Array<{ memoryIds: string[]; centerMemoryId: string }> = [];
    const visited = new Set<string>();

    // Convert edges to adjacency list
    const adjacencyList = new Map<string, Set<string>>();
    for (const edge of graph.edges) {
      if (!adjacencyList.has(edge.source)) {
        adjacencyList.set(edge.source, new Set());
      }
      if (!adjacencyList.has(edge.target)) {
        adjacencyList.set(edge.target, new Set());
      }
      adjacencyList.get(edge.source)!.add(edge.target);
      adjacencyList.get(edge.target)!.add(edge.source);
    }

    // Find connected components
    for (const node of graph.nodes) {
      if (visited.has(node.id)) continue;

      // Start BFS from this node to find connected component
      const component = new Set<string>();
      const queue = [node.id];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (visited.has(currentId)) continue;

        visited.add(currentId);
        component.add(currentId);

        // Add connected nodes to queue
        const neighbors = adjacencyList.get(currentId) || new Set();
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            queue.push(neighbor);
          }
        }
      }

      // Only create cluster if it meets minimum size
      if (component.size >= minClusterSize) {
        // Find center (node with highest degree in this component)
        let centerMemoryId = node.id;
        let maxDegree = 0;

        for (const memoryId of component) {
          const degree = (adjacencyList.get(memoryId) || new Set()).size;
          if (degree > maxDegree) {
            maxDegree = degree;
            centerMemoryId = memoryId;
          }
        }

        clusters.push({
          memoryIds: Array.from(component),
          centerMemoryId,
        });
      }
    }

    return clusters;
  }

  /**
   * Enhance clusters with relationship analysis
   */
  private async enhanceClustersWithRelationshipAnalysis(
    clusters: Array<{ memoryIds: string[]; centerMemoryId: string }>,
    graph: RelationshipGraph
  ): Promise<Array<{
    id: string;
    memoryIds: string[];
    centerMemoryId: string;
    relationshipTypes: MemoryRelationshipType[];
    strength: number;
    cohesion: number;
  }>> {
    const enhancedClusters = [];

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      const clusterEdges = graph.edges.filter(edge =>
        cluster.memoryIds.includes(edge.source) && cluster.memoryIds.includes(edge.target)
      );

      // Calculate cluster properties
      const relationshipTypes = [...new Set(clusterEdges.map(e => e.relationship.type))];
      const averageStrength = clusterEdges.length > 0 ?
        clusterEdges.reduce((sum, e) => sum + e.weight, 0) / clusterEdges.length : 0;

      // Calculate cohesion (how well-connected the cluster is)
      const maxPossibleEdges = (cluster.memoryIds.length * (cluster.memoryIds.length - 1)) / 2;
      const cohesion = maxPossibleEdges > 0 ? clusterEdges.length / maxPossibleEdges : 0;

      enhancedClusters.push({
        id: `cluster_${i}`,
        memoryIds: cluster.memoryIds,
        centerMemoryId: cluster.centerMemoryId,
        relationshipTypes,
        strength: averageStrength,
        cohesion,
      });
    }

    return enhancedClusters;
  }

  /**
   * Clear all caches
   */
  clearCaches(): void {
    this.relationshipCache.clear();
    this.graphCache.clear();
    logInfo('RelationshipProcessor caches cleared', {
      component: 'RelationshipProcessor',
    });
  }

  /**
   * Get cache statistics
   */
  getCacheStatistics(): {
    relationshipCacheSize: number;
    graphCacheSize: number;
    totalCacheSize: number;
  } {
    return {
      relationshipCacheSize: this.relationshipCache.size,
      graphCacheSize: this.graphCache.size,
      totalCacheSize: this.relationshipCache.size + this.graphCache.size,
    };
  }
}
