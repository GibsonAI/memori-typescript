/**
 * TemporalPatternMatcher - Identifies and processes temporal patterns in queries
 *
 * Handles pattern recognition for:
 * - Relative time expressions ("last week", "2 hours ago")
 * - Temporal ranges ("between last Monday and today")
 * - Recurring patterns ("every Monday", "daily at 3pm")
 * - Seasonal patterns ("summer 2023", "holiday season")
 * - Contextual time references ("during the meeting", "before lunch")
 */

export interface TemporalPattern {
    type: 'relative' | 'absolute' | 'range' | 'recurring' | 'seasonal' | 'contextual';
    confidence: number; // 0-1 confidence score
    expressions: string[]; // Original expressions found
    normalized: {
        start?: Date;
        end?: Date;
        period?: string;
        frequency?: string;
    };
    metadata: {
        isAmbiguous: boolean;
        requiresContext: boolean;
        seasonal?: boolean;
        recurring?: boolean;
    };
}

export interface PatternMatchResult {
    patterns: TemporalPattern[];
    overallConfidence: number;
    requiresContext: boolean;
    suggestions?: string[];
}

export class TemporalPatternMatcher {
    // Pattern definitions for different temporal expressions
    private static readonly RELATIVE_PATTERNS = [
        {
            regex: /(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago\b/gi,
            type: 'relative' as const,
            confidence: 0.95
        },
        {
            regex: /last\s+(second|minute|hour|day|week|month|year)\b/gi,
            type: 'relative' as const,
            confidence: 0.9
        },
        {
            regex: /previous\s+(second|minute|hour|day|week|month|year)\b/gi,
            type: 'relative' as const,
            confidence: 0.85
        },
        {
            regex: /\b(yesterday|today|tomorrow)\b/gi,
            type: 'relative' as const,
            confidence: 0.95
        }
    ];

    private static readonly RANGE_PATTERNS = [
        {
            regex: /between\s+(.+?)\s+and\s+(.+?)\b/gi,
            type: 'range' as const,
            confidence: 0.9
        },
        {
            regex: /from\s+(.+?)\s+to\s+(.+?)\b/gi,
            type: 'range' as const,
            confidence: 0.9
        },
        {
            regex: /since\s+(.+?)\s+until\s+(.+?)\b/gi,
            type: 'range' as const,
            confidence: 0.85
        }
    ];

    private static readonly RECURRING_PATTERNS = [
        {
            regex: /every\s+(second|minute|hour|day|week|month|year)\b/gi,
            type: 'recurring' as const,
            confidence: 0.9
        },
        {
            regex: /daily|weekly|monthly|yearly|annually\b/gi,
            type: 'recurring' as const,
            confidence: 0.95
        },
        {
            regex: /each\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi,
            type: 'recurring' as const,
            confidence: 0.9
        }
    ];

    private static readonly SEASONAL_PATTERNS = [
        {
            regex: /(spring|summer|fall|autumn|winter)\s+(\d{4})\b/gi,
            type: 'seasonal' as const,
            confidence: 0.9
        },
        {
            regex: /holiday\s+season|christmas|thanksgiving|easter\b/gi,
            type: 'seasonal' as const,
            confidence: 0.85
        }
    ];

    private static readonly CONTEXTUAL_PATTERNS = [
        {
            regex: /during\s+(the\s+)?(\w+)\b/gi,
            type: 'contextual' as const,
            confidence: 0.7
        },
        {
            regex: /before\s+(the\s+)?(\w+)\b/gi,
            type: 'contextual' as const,
            confidence: 0.7
        },
        {
            regex: /after\s+(the\s+)?(\w+)\b/gi,
            type: 'contextual' as const,
            confidence: 0.7
        }
    ];

    /**
     * Analyze text for temporal patterns
     */
    static analyzeText(text: string): PatternMatchResult {
        const patterns: TemporalPattern[] = [];
        const allExpressions: string[] = [];

        // Find all temporal patterns
        const relativePatterns = this.findPatterns(text, this.RELATIVE_PATTERNS);
        const rangePatterns = this.findPatterns(text, this.RANGE_PATTERNS);
        const recurringPatterns = this.findPatterns(text, this.RECURRING_PATTERNS);
        const seasonalPatterns = this.findPatterns(text, this.SEASONAL_PATTERNS);
        const contextualPatterns = this.findPatterns(text, this.CONTEXTUAL_PATTERNS);

        // Combine all patterns
        patterns.push(...relativePatterns, ...rangePatterns, ...recurringPatterns, ...seasonalPatterns, ...contextualPatterns);

        // Extract all unique expressions
        patterns.forEach(pattern => {
            allExpressions.push(...pattern.expressions);
        });

        // Calculate overall confidence
        const overallConfidence = patterns.length > 0
            ? patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length
            : 0;

        // Check if context is required
        const requiresContext = contextualPatterns.some(p => p.metadata.requiresContext);

        // Generate suggestions for ambiguous patterns
        const suggestions = this.generateSuggestions(patterns, text);

        return {
            patterns,
            overallConfidence,
            requiresContext,
            suggestions
        };
    }

    /**
     * Find patterns in text using regex definitions
     */
    private static findPatterns(text: string, patternDefs: any[]): TemporalPattern[] {
        const patterns: TemporalPattern[] = [];

        for (const patternDef of patternDefs) {
            const regex = new RegExp(patternDef.regex.source, patternDef.regex.flags);
            let match;

            while ((match = regex.exec(text)) !== null) {
                const expressions = match.slice(1).filter(expr => expr && expr.trim());

                if (expressions.length > 0) {
                    patterns.push({
                        type: patternDef.type,
                        confidence: patternDef.confidence,
                        expressions,
                        normalized: {},
                        metadata: {
                            isAmbiguous: this.isAmbiguousPattern(match[0]),
                            requiresContext: patternDef.type === 'contextual',
                            seasonal: patternDef.type === 'seasonal',
                            recurring: patternDef.type === 'recurring'
                        }
                    });
                }
            }
        }

        return patterns;
    }

    /**
     * Check if a pattern is ambiguous
     */
    private static isAmbiguousPattern(expression: string): boolean {
        const ambiguousTerms = [
            'recently', 'lately', 'soon', 'earlier', 'later',
            'nowadays', 'back then', 'these days', 'around then'
        ];

        return ambiguousTerms.some(term =>
            expression.toLowerCase().includes(term)
        );
    }

    /**
     * Generate suggestions for improving temporal queries
     */
    private static generateSuggestions(patterns: TemporalPattern[], originalText: string): string[] {
        const suggestions: string[] = [];

        // Check for ambiguous patterns
        const ambiguousPatterns = patterns.filter(p => p.metadata.isAmbiguous);
        if (ambiguousPatterns.length > 0) {
            suggestions.push(
                'Consider using more specific time expressions (e.g., "last week" instead of "recently")'
            );
        }

        // Check for contextual patterns that need more context
        const contextualPatterns = patterns.filter(p => p.metadata.requiresContext);
        if (contextualPatterns.length > 0) {
            suggestions.push(
                'Add more context to help identify the specific time period you\'re referring to'
            );
        }

        // Check for very low confidence patterns
        const lowConfidencePatterns = patterns.filter(p => p.confidence < 0.5);
        if (lowConfidencePatterns.length > 0) {
            suggestions.push(
                'Consider using standard date formats (e.g., "2023-12-25" or "2 hours ago") for better accuracy'
            );
        }

        // Suggest combining multiple patterns
        if (patterns.length > 1) {
            suggestions.push(
                'Multiple time references found. Consider combining them with "and" or "between" for clarity'
            );
        }

        return suggestions;
    }

    /**
     * Extract temporal context from a conversation or document
     */
    static extractContextualTimeReferences(text: string): {
        references: Array<{
            text: string;
            position: number;
            potentialMeaning: string;
            confidence: number;
        }>;
        requiresAdditionalContext: boolean;
    } {
        const references: Array<{
            text: string;
            position: number;
            potentialMeaning: string;
            confidence: number;
        }> = [];

        // Look for contextual time references
        const contextualRegexes = [
            {
                pattern: /during\s+(the\s+)?(\w+)/gi,
                meaning: 'Time period associated with "{2}"'
            },
            {
                pattern: /before\s+(the\s+)?(\w+)/gi,
                meaning: 'Time before "{2}"'
            },
            {
                pattern: /after\s+(the\s+)?(\w+)/gi,
                meaning: 'Time after "{2}"'
            },
            {
                pattern: /when\s+(the\s+)?(\w+)/gi,
                meaning: 'Time when "{2}" occurred'
            }
        ];

        for (const { pattern, meaning } of contextualRegexes) {
            let match;
            const regex = new RegExp(pattern.source, pattern.flags);

            while ((match = regex.exec(text)) !== null) {
                const contextWord = match[2];
                const potentialMeaning = meaning.replace('{2}', contextWord);

                references.push({
                    text: match[0],
                    position: match.index,
                    potentialMeaning,
                    confidence: 0.6 // Lower confidence for contextual references
                });
            }
        }

        return {
            references,
            requiresAdditionalContext: references.some(ref => ref.confidence < 0.7)
        };
    }

    /**
     * Suggest time range completions based on partial input
     */
    static suggestCompletions(partialQuery: string): Array<{
        completion: string;
        description: string;
        confidence: number;
    }> {
        const suggestions: Array<{
            completion: string;
            description: string;
            confidence: number;
        }> = [];

        const partial = partialQuery.toLowerCase();

        // Common temporal completions
        const commonCompletions = [
            {
                trigger: 'last',
                completions: [
                    { text: 'last week', description: 'The previous week' },
                    { text: 'last month', description: 'The previous month' },
                    { text: 'last year', description: 'The previous year' },
                    { text: 'last Monday', description: 'The most recent Monday' }
                ]
            },
            {
                trigger: 'this',
                completions: [
                    { text: 'this week', description: 'The current week' },
                    { text: 'this month', description: 'The current month' },
                    { text: 'this year', description: 'The current year' }
                ]
            },
            {
                trigger: 'between',
                completions: [
                    { text: 'between last week and this week', description: 'Time range between two periods' },
                    { text: 'between 9am and 5pm', description: 'Time range within a day' }
                ]
            }
        ];

        for (const { trigger, completions } of commonCompletions) {
            if (partial.includes(trigger)) {
                for (const completion of completions) {
                    suggestions.push({
                        completion: completion.text,
                        description: completion.description,
                        confidence: 0.8
                    });
                }
            }
        }

        return suggestions.sort((a, b) => b.confidence - a.confidence);
    }

    /**
     * Validate temporal pattern consistency
     */
    static validatePatternConsistency(patterns: TemporalPattern[]): {
        isConsistent: boolean;
        conflicts: Array<{
            pattern1: TemporalPattern;
            pattern2: TemporalPattern;
            conflict: string;
        }>;
        recommendations: string[];
    } {
        const conflicts: Array<{
            pattern1: TemporalPattern;
            pattern2: TemporalPattern;
            conflict: string;
        }> = [];

        const recommendations: string[] = [];

        // Check for conflicting time ranges
        const rangePatterns = patterns.filter(p => p.type === 'range');
        if (rangePatterns.length > 1) {
            for (let i = 0; i < rangePatterns.length; i++) {
                for (let j = i + 1; j < rangePatterns.length; j++) {
                    const p1 = rangePatterns[i];
                    const p2 = rangePatterns[j];

                    if (this.hasConflictingRanges(p1, p2)) {
                        conflicts.push({
                            pattern1: p1,
                            pattern2: p2,
                            conflict: 'Overlapping or conflicting time ranges detected'
                        });
                    }
                }
            }
        }

        // Check for ambiguous contextual references
        const contextualPatterns = patterns.filter(p => p.metadata.requiresContext);
        if (contextualPatterns.length > 0) {
            recommendations.push(
                'Contextual time references detected. Consider providing more specific time information.'
            );
        }

        // Generate recommendations based on pattern types
        const relativeCount = patterns.filter(p => p.type === 'relative').length;
        const absoluteCount = patterns.filter(p => p.type === 'absolute').length;

        if (relativeCount > 2) {
            recommendations.push(
                'Multiple relative time references. Consider using absolute dates for precision.'
            );
        }

        return {
            isConsistent: conflicts.length === 0,
            conflicts,
            recommendations
        };
    }

    /**
     * Check if two range patterns conflict
     */
    private static hasConflictingRanges(pattern1: TemporalPattern, pattern2: TemporalPattern): boolean {
        // Simple conflict detection - can be enhanced
        const expr1 = pattern1.expressions.join(' ').toLowerCase();
        const expr2 = pattern2.expressions.join(' ').toLowerCase();

        // Check for obviously conflicting expressions
        const conflictingPairs = [
            ['last week', 'next week'],
            ['yesterday', 'tomorrow'],
            ['morning', 'evening']
        ];

        return conflictingPairs.some(([term1, term2]) =>
            (expr1.includes(term1) && expr2.includes(term2)) ||
            (expr1.includes(term2) && expr2.includes(term1))
        );
    }

    /**
     * Get pattern statistics for analysis
     */
    static getPatternStatistics(patterns: TemporalPattern[]): {
        totalPatterns: number;
        patternsByType: Record<string, number>;
        averageConfidence: number;
        mostCommonType: string;
        requiresContext: boolean;
        isAmbiguous: boolean;
    } {
        if (patterns.length === 0) {
            return {
                totalPatterns: 0,
                patternsByType: {},
                averageConfidence: 0,
                mostCommonType: 'none',
                requiresContext: false,
                isAmbiguous: false
            };
        }

        const patternsByType: Record<string, number> = {};
        let totalConfidence = 0;

        for (const pattern of patterns) {
            patternsByType[pattern.type] = (patternsByType[pattern.type] || 0) + 1;
            totalConfidence += pattern.confidence;
        }

        const mostCommonType = Object.entries(patternsByType)
            .sort(([, a], [, b]) => b - a)[0]?.[0] || 'none';

        return {
            totalPatterns: patterns.length,
            patternsByType,
            averageConfidence: totalConfidence / patterns.length,
            mostCommonType,
            requiresContext: patterns.some(p => p.metadata.requiresContext),
            isAmbiguous: patterns.some(p => p.metadata.isAmbiguous)
        };
    }
}