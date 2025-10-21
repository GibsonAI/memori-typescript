import { z } from 'zod';

export enum MemoryCategoryType {
    FACT = 'fact',
    PREFERENCE = 'preference',
    SKILL = 'skill',
    CONTEXT = 'context',
    RULE = 'rule'
}

export enum MemoryClassification {
    ESSENTIAL = 'essential',
    CONTEXTUAL = 'contextual',
    CONVERSATIONAL = 'conversational',
    REFERENCE = 'reference',
    PERSONAL = 'personal',
    CONSCIOUS_INFO = 'conscious-info'
}

export enum MemoryImportanceLevel {
     CRITICAL = 'critical',
     HIGH = 'high',
     MEDIUM = 'medium',
     LOW = 'low'
 }

export enum MemoryRelationshipType {
  CONTINUATION = 'continuation',
  REFERENCE = 'reference',
  RELATED = 'related',
  SUPERSEDES = 'supersedes',
  CONTRADICTION = 'contradiction'
}

// Memory Relationship schema
export const MemoryRelationshipSchema = z.object({
  type: z.nativeEnum(MemoryRelationshipType),
  targetMemoryId: z.string().optional(),
  confidence: z.number().min(0).max(1),
  strength: z.number().min(0).max(1),
  reason: z.string(),
  entities: z.array(z.string()).default([]),
  context: z.string(),
});

export type MemoryRelationship = z.infer<typeof MemoryRelationshipSchema>;

// Constrained types
export const ConfidenceScore = z.number().min(0).max(1);
export const ImportanceScore = z.number().min(0).max(1);

// Core schemas
export const ProcessedLongTermMemorySchema = z.object({
  content: z.string(),
  summary: z.string(),
  classification: z.nativeEnum(MemoryClassification),
  importance: z.nativeEnum(MemoryImportanceLevel),
  topic: z.string().optional(),
  entities: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  conversationId: z.string(),
  confidenceScore: ConfidenceScore.default(0.8),
  classificationReason: z.string(),
  promotionEligible: z.boolean().default(false),
  // Optional relationship fields for processing-time usage
  relatedMemories: z.array(MemoryRelationshipSchema).default([]).optional(),
  relationshipMetadata: z.object({
    extractionMethod: z.string(),
    confidence: z.number(),
    extractedAt: z.date(),
    processingMetadata: z.object({
      llmModel: z.string().optional(),
      llmTokensUsed: z.number().optional(),
      analysisDepth: z.number().optional(),
      relatedMemoriesAnalyzed: z.number().optional(),
      processingTime: z.number().optional(),
    }).optional(),
  }).optional(),
});

export const ConversationContextSchema = z.object({
  userId: z.string().optional(),
  sessionId: z.string(),
  conversationId: z.string(),
  modelUsed: z.string(),
  userPreferences: z.array(z.string()).default([]),
  currentProjects: z.array(z.string()).default([]),
  relevantSkills: z.array(z.string()).default([]),
});

export type ProcessedLongTermMemory = z.infer<typeof ProcessedLongTermMemorySchema>;

export type ConversationContext = z.infer<typeof ConversationContextSchema>;