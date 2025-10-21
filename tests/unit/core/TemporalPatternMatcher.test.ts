import { TemporalPatternMatcher } from "@/core/domain/search/filtering";
import { TemporalPattern } from "@/core/domain/search/filtering/temporal/TemporalPatternMatcher";

describe('TemporalPatternMatcher', () => {
  describe('analyzeText()', () => {
    it('should detect relative time patterns', () => {
      const text = 'Show me memories from 2 hours ago';
      const result = TemporalPatternMatcher.analyzeText(text);

      expect(result.patterns.length).toBeGreaterThan(0);
      const relativePattern = result.patterns.find(p => p.type === 'relative');
      expect(relativePattern).toBeDefined();
      expect(relativePattern!.expressions).toEqual(expect.arrayContaining(['2', 'hour']));
    });

    it('should detect range patterns', () => {
      const text = 'Find memories between last week and yesterday';
      const result = TemporalPatternMatcher.analyzeText(text);

      expect(result.patterns.length).toBeGreaterThan(0);
      const rangePattern = result.patterns.find(p => p.type === 'range');
      expect(rangePattern).toBeDefined();
      expect(rangePattern!.expressions).toContain('last week');
      expect(rangePattern!.expressions).toContain('yesterday');
    });


    it('should detect seasonal patterns', () => {
      const text = 'What happened during summer 2023';
      const result = TemporalPatternMatcher.analyzeText(text);

      expect(result.patterns.length).toBeGreaterThan(0);
      const seasonalPattern = result.patterns.find(p => p.type === 'seasonal');
      expect(seasonalPattern).toBeDefined();
      expect(seasonalPattern!.expressions).toEqual(expect.arrayContaining(['summer', '2023']));
    });

    it('should detect contextual patterns', () => {
      const text = 'Tell me what happened during the meeting';
      const result = TemporalPatternMatcher.analyzeText(text);

      expect(result.patterns.length).toBeGreaterThan(0);
      const contextualPattern = result.patterns.find(p => p.type === 'contextual');
      expect(contextualPattern).toBeDefined();
      expect(contextualPattern!.metadata.requiresContext).toBe(true);
    });

    it('should return empty result for text without patterns', () => {
      const text = 'Show me some memories about cats';
      const result = TemporalPatternMatcher.analyzeText(text);

      expect(result.patterns.length).toBe(0);
      expect(result.overallConfidence).toBe(0);
      expect(result.requiresContext).toBe(false);
    });

    it('should handle multiple patterns in same text', () => {
      const text = 'Show me what happened last week between Monday and Wednesday';
      const result = TemporalPatternMatcher.analyzeText(text);

      expect(result.patterns.length).toBeGreaterThan(1);
      expect(result.overallConfidence).toBeGreaterThan(0);

      const hasRelative = result.patterns.some(p => p.type === 'relative');
      const hasRange = result.patterns.some(p => p.type === 'range');
      expect(hasRelative && hasRange).toBe(true);
    });

  });

  describe('extractContextualTimeReferences()', () => {
    it('should extract contextual references', () => {
      const text = 'What happened during the conference call before the meeting';
      const result = TemporalPatternMatcher.extractContextualTimeReferences(text);

      expect(result.references.length).toBeGreaterThan(0);
      expect(result.references.some(r => r.text.includes('during the conference'))).toBe(true);
      expect(result.references.some(r => r.text.includes('before the meeting'))).toBe(true);
    });

    it('should mark references that require additional context', () => {
      const text = 'Show me what happened during the event';
      const result = TemporalPatternMatcher.extractContextualTimeReferences(text);

      expect(result.requiresAdditionalContext).toBe(true);
    });

    it('should return empty for text without contextual references', () => {
      const text = 'Show me memories from last week';
      const result = TemporalPatternMatcher.extractContextualTimeReferences(text);

      expect(result.references.length).toBe(0);
      expect(result.requiresAdditionalContext).toBe(false);
    });
  });

  describe('suggestCompletions()', () => {
    it('should suggest completions for "last"', () => {
      const partial = 'Show me memories from last';
      const suggestions = TemporalPatternMatcher.suggestCompletions(partial);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.completion === 'last week')).toBe(true);
      expect(suggestions.some(s => s.completion === 'last month')).toBe(true);
    });

    it('should suggest completions for "this"', () => {
      const partial = 'What happened this';
      const suggestions = TemporalPatternMatcher.suggestCompletions(partial);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.completion === 'this week')).toBe(true);
      expect(suggestions.some(s => s.completion === 'this month')).toBe(true);
    });

    it('should suggest completions for "between"', () => {
      const partial = 'Memories between';
      const suggestions = TemporalPatternMatcher.suggestCompletions(partial);

      expect(suggestions.length).toBeGreaterThan(0);
      expect(suggestions.some(s => s.completion === 'between last week and this week')).toBe(true);
    });

    it('should return empty array for unrecognized partial queries', () => {
      const partial = 'xyzabc';
      const suggestions = TemporalPatternMatcher.suggestCompletions(partial);

      expect(suggestions.length).toBe(0);
    });
  });

  describe('validatePatternConsistency()', () => {
    it('should validate consistent patterns', () => {
      const patterns: TemporalPattern[] = [
        {
          type: 'relative',
          confidence: 0.9,
          expressions: ['last week'],
          normalized: {},
          metadata: { isAmbiguous: false, requiresContext: false }
        },
        {
          type: 'relative',
          confidence: 0.8,
          expressions: ['2 days ago'],
          normalized: {},
          metadata: { isAmbiguous: false, requiresContext: false }
        }
      ];

      const result = TemporalPatternMatcher.validatePatternConsistency(patterns);

      expect(result.isConsistent).toBe(true);
      expect(result.conflicts.length).toBe(0);
    });

    it('should detect conflicting range patterns', () => {
      const patterns: TemporalPattern[] = [
        {
          type: 'range',
          confidence: 0.9,
          expressions: ['last week'],
          normalized: {},
          metadata: { isAmbiguous: false, requiresContext: false }
        },
        {
          type: 'range',
          confidence: 0.8,
          expressions: ['next week'],
          normalized: {},
          metadata: { isAmbiguous: false, requiresContext: false }
        }
      ];

      const result = TemporalPatternMatcher.validatePatternConsistency(patterns);

      expect(result.isConsistent).toBe(false);
      expect(result.conflicts.length).toBeGreaterThan(0);
      expect(result.conflicts[0].conflict).toContain('conflicting');
    });

    it('should recommend improvements for contextual patterns', () => {
      const patterns: TemporalPattern[] = [
        {
          type: 'contextual',
          confidence: 0.7,
          expressions: ['during the meeting'],
          normalized: {},
          metadata: { isAmbiguous: false, requiresContext: true }
        }
      ];

      const result = TemporalPatternMatcher.validatePatternConsistency(patterns);

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations[0]).toContain('Contextual time references');
    });

    it('should recommend specificity for multiple relative patterns', () => {
      const patterns: TemporalPattern[] = [
        {
          type: 'relative',
          confidence: 0.9,
          expressions: ['recently'],
          normalized: {},
          metadata: { isAmbiguous: false, requiresContext: false }
        },
        {
          type: 'relative',
          confidence: 0.8,
          expressions: ['lately'],
          normalized: {},
          metadata: { isAmbiguous: false, requiresContext: false }
        },
        {
          type: 'relative',
          confidence: 0.7,
          expressions: ['before'],
          normalized: {},
          metadata: { isAmbiguous: false, requiresContext: false }
        }
      ];

      const result = TemporalPatternMatcher.validatePatternConsistency(patterns);

      expect(result.recommendations.length).toBeGreaterThan(0);
      expect(result.recommendations[0]).toContain('Multiple relative time references');
    });
  });

  describe('getPatternStatistics()', () => {
    it('should calculate statistics for empty patterns', () => {
      const stats = TemporalPatternMatcher.getPatternStatistics([]);

      expect(stats.totalPatterns).toBe(0);
      expect(stats.patternsByType).toEqual({});
      expect(stats.averageConfidence).toBe(0);
      expect(stats.mostCommonType).toBe('none');
      expect(stats.requiresContext).toBe(false);
      expect(stats.isAmbiguous).toBe(false);
    });

    it('should calculate statistics for mixed patterns', () => {
      const patterns: TemporalPattern[] = [
        {
          type: 'relative',
          confidence: 0.9,
          expressions: ['last week'],
          normalized: {},
          metadata: { isAmbiguous: false, requiresContext: false }
        },
        {
          type: 'relative',
          confidence: 0.8,
          expressions: ['2 days ago'],
          normalized: {},
          metadata: { isAmbiguous: false, requiresContext: false }
        },
        {
          type: 'contextual',
          confidence: 0.7,
          expressions: ['during the meeting'],
          normalized: {},
          metadata: { isAmbiguous: false, requiresContext: true }
        }
      ];

      const stats = TemporalPatternMatcher.getPatternStatistics(patterns);

      expect(stats.totalPatterns).toBe(3);
      expect(stats.patternsByType.relative).toBe(2);
      expect(stats.patternsByType.contextual).toBe(1);
      expect(stats.averageConfidence).toBeCloseTo(0.8, 1);
      expect(stats.mostCommonType).toBe('relative');
      expect(stats.requiresContext).toBe(true);
      expect(stats.isAmbiguous).toBe(false);
    });

    it('should detect ambiguous patterns', () => {
      const patterns: TemporalPattern[] = [
        {
          type: 'relative',
          confidence: 0.8,
          expressions: ['recently'],
          normalized: {},
          metadata: { isAmbiguous: true, requiresContext: false }
        }
      ];

      const stats = TemporalPatternMatcher.getPatternStatistics(patterns);

      expect(stats.isAmbiguous).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty text', () => {
      const result = TemporalPatternMatcher.analyzeText('');
      expect(result.patterns.length).toBe(0);
      expect(result.overallConfidence).toBe(0);
    });

    it('should handle whitespace-only text', () => {
      const result = TemporalPatternMatcher.analyzeText('   \n\t   ');
      expect(result.patterns.length).toBe(0);
      expect(result.overallConfidence).toBe(0);
    });

    it('should handle very long text with multiple patterns', () => {
      const text = 'I want to see what happened last week and also during the summer of 2023 but not recently because I already know about that period';
      const result = TemporalPatternMatcher.analyzeText(text);

      expect(result.patterns.length).toBeGreaterThan(0);
      expect(result.overallConfidence).toBeGreaterThan(0);
    });

    it('should handle case-insensitive pattern matching', () => {
      const text = 'SHOW ME MEMORIES FROM LAST WEEK';
      const result = TemporalPatternMatcher.analyzeText(text);

      expect(result.patterns.length).toBeGreaterThan(0);
      expect(result.patterns[0].type).toBe('relative');
    });
  });
});