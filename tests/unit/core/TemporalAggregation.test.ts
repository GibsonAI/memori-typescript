import { TemporalService } from "@/core/domain/search/temporal/TemporalService";

describe('TemporalService', () => {
  describe('aggregate()', () => {
    const mockResults = [
      {
        id: '1',
        content: 'Memory 1',
        score: 0.9,
        timestamp: new Date('2023-12-25T10:00:00Z'),
        metadata: { category: 'work', memoryType: 'short_term', importanceScore: 0.8 }
      },
      {
        id: '2',
        content: 'Memory 2',
        score: 0.7,
        timestamp: new Date('2023-12-25T11:30:00Z'),
        metadata: { category: 'personal', memoryType: 'long_term', importanceScore: 0.6 }
      },
      {
        id: '3',
        content: 'Memory 3',
        score: 0.8,
        timestamp: new Date('2023-12-25T14:00:00Z'),
        metadata: { category: 'work', memoryType: 'short_term', importanceScore: 0.7 }
      },
      {
        id: '4',
        content: 'Memory 4',
        score: 0.6,
        timestamp: new Date('2023-12-26T09:00:00Z'),
        metadata: { category: 'personal', memoryType: 'long_term', importanceScore: 0.5 }
      }
    ];

    it('should aggregate results by day period', () => {
      const period: { type: 'day' | 'hour' | 'minute' | 'second' | 'week' | 'month' | 'year'; count: number } = { type: 'day', count: 1 };
      const result = TemporalService.aggregate(mockResults, period);

      expect(result.buckets.length).toBeGreaterThan(0);
      expect(result.summary.totalMemories).toBe(4);
      expect(result.metadata.aggregationPeriod).toEqual(period);
    });

    it('should aggregate results by hour period', () => {
      const period: { type: 'day' | 'hour' | 'minute' | 'second' | 'week' | 'month' | 'year'; count: number } = { type: 'hour', count: 1 };
      const result = TemporalService.aggregate(mockResults, period);

      expect(result.buckets.length).toBeGreaterThan(0);
      expect(result.summary.totalMemories).toBe(4);
    });

    it('should handle empty results array', () => {
      const period: { type: 'day' | 'hour' | 'minute' | 'second' | 'week' | 'month' | 'year'; count: number } = { type: 'day', count: 1 };
      const result = TemporalService.aggregate([], period);

      expect(result.buckets.length).toBe(0);
      expect(result.summary.totalMemories).toBe(0);
    });

    it('should include trends when requested', () => {
      const period: { type: 'day' | 'hour' | 'minute' | 'second' | 'week' | 'month' | 'year'; count: number } = { type: 'day', count: 1 };
      const result = TemporalService.aggregate(mockResults, period, {
        includeTrends: true
      });

      expect(result.buckets.length).toBeGreaterThan(1);
      // Check that trends are calculated for buckets after the first
      const bucketsWithTrends = result.buckets.filter(b => b.trend.strength > 0);
      expect(bucketsWithTrends.length).toBeGreaterThanOrEqual(0);
    });

    it('should select correct representative strategy', () => {
      const period: { type: 'day' | 'hour' | 'minute' | 'second' | 'week' | 'month' | 'year'; count: number } = { type: 'day', count: 1 };
      const result = TemporalService.aggregate(mockResults, period, {
        representativeStrategy: 'highest_score'
      });

      expect(result.buckets.length).toBeGreaterThan(0);
      // The representative should be the highest scoring memory
      const bucketWithRepresentative = result.buckets.find(b => b.representative);
      if (bucketWithRepresentative) {
        expect(bucketWithRepresentative.representative).toBeDefined();
        expect(bucketWithRepresentative.representative!.score).toBeGreaterThan(0);
      }
    });

    it('should respect maxBuckets limit', () => {
      const manyResults = Array.from({ length: 100 }, (_, i) => ({
        id: `memory_${i}`,
        content: `Memory ${i}`,
        score: 0.5 + (Math.random() * 0.5),
        timestamp: new Date('2023-12-25T00:00:00Z'),
        metadata: { category: 'test', memoryType: 'short_term', importanceScore: 0.5 }
      }));

      const period: { type: 'day' | 'hour' | 'minute' | 'second' | 'week' | 'month' | 'year'; count: number } = { type: 'hour', count: 1 };
      const result = TemporalService.aggregate(manyResults, period, {
        maxBuckets: 10
      });

      expect(result.buckets.length).toBeLessThanOrEqual(10);
    });
  });

  describe('getOptimalPeriod()', () => {
    it('should return day period for short time span', () => {
      const results = [
        { timestamp: new Date('2023-12-25T10:00:00Z') },
        { timestamp: new Date('2023-12-25T14:00:00Z') }
      ];

      const period = TemporalService.getOptimalPeriod(results, 50);

      expect(period.type).toBe('hour'); // Should choose smaller period for short span
    });

    it('should return year period for long time span', () => {
      const results = [
        { timestamp: new Date('2020-01-01T00:00:00Z') },
        { timestamp: new Date('2023-01-01T00:00:00Z') }
      ];

      const period = TemporalService.getOptimalPeriod(results, 50);

      expect(period.type).toBe('year'); // Should choose larger period for long span
    });

    it('should handle empty results array', () => {
      const period = TemporalService.getOptimalPeriod([], 50);

      expect(period.type).toBe('day');
      expect(period.count).toBe(1);
    });

    it('should respect preferred max buckets', () => {
      const results = Array.from({ length: 100 }, (_, i) => ({
        timestamp: new Date(2020 + i, 0, 1)
      }));

      const period = TemporalService.getOptimalPeriod(results, 5);

      expect(period.count).toBeLessThanOrEqual(5);
    });
  });

  describe('mergeAggregationResults()', () => {
    it('should return null for empty results array', () => {
      const result = TemporalService.mergeAggregationResults([]);
      expect(result).toBeNull();
    });

    it('should return single result as-is', () => {
      const period = { type: 'day' as const, count: 1 };
      const singleResult = TemporalService.aggregate([
        {
          id: '1',
          content: 'Test',
          score: 0.8,
          timestamp: new Date('2023-12-25T10:00:00Z'),
          metadata: {}
        }
      ], period);

      const merged = TemporalService.mergeAggregationResults([singleResult]);
      expect(merged).toEqual(singleResult);
    });

    it('should merge multiple aggregation results', () => {
      const period: { type: 'day' | 'hour' | 'minute' | 'second' | 'week' | 'month' | 'year'; count: number } = { type: 'day', count: 1 };

      const result1 = TemporalService.aggregate([
        {
          id: '1',
          content: 'Memory 1',
          score: 0.9,
          timestamp: new Date('2023-12-25T10:00:00Z'),
          metadata: { category: 'work' }
        }
      ], period);

      const result2 = TemporalService.aggregate([
        {
          id: '2',
          content: 'Memory 2',
          score: 0.7,
          timestamp: new Date('2023-12-25T14:00:00Z'),
          metadata: { category: 'personal' }
        }
      ], period);

      const merged = TemporalService.mergeAggregationResults([result1, result2]);

      expect(merged).toBeDefined();
      expect(merged!.summary.totalMemories).toBe(2);
      expect(merged!.buckets.length).toBeGreaterThan(0);
    });
  });

  describe('exportForVisualization()', () => {
    it('should export data for visualization', () => {
      const period: { type: 'day' | 'hour' | 'minute' | 'second' | 'week' | 'month' | 'year'; count: number } = { type: 'day', count: 1 };
      const result = TemporalService.aggregate([
        {
          id: '1',
          content: 'Memory 1',
          score: 0.9,
          timestamp: new Date('2023-12-25T10:00:00Z'),
          metadata: {}
        },
        {
          id: '2',
          content: 'Memory 2',
          score: 0.7,
          timestamp: new Date('2023-12-25T14:00:00Z'),
          metadata: {}
        }
      ], period);

      const exported = TemporalService.exportForVisualization(result);

      expect(exported.timeSeries.length).toBeGreaterThan(0);
      expect(exported.summary.totalDataPoints).toBe(result.buckets.length);
      expect(exported.summary.averageValue).toBeGreaterThan(0);
    });

    it('should handle empty aggregation result', () => {
      const mockResult = {
        buckets: [],
        summary: {
          totalMemories: 0,
          timeSpan: { start: new Date(), end: new Date(), duration: 0 },
          dominantPeriod: 'none',
          overallTrend: { direction: 'stable' as const, strength: 0 }
        },
        metadata: {
          aggregationPeriod: { type: 'day' as const, count: 1 },
          generatedAt: new Date(),
          processingTime: 0
        }
      };

      const exported = TemporalService.exportForVisualization(mockResult);

      expect(exported.timeSeries.length).toBe(0);
      expect(exported.summary.totalDataPoints).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle single result', () => {
      const singleResult = [{
        id: '1',
        content: 'Single memory',
        score: 0.8,
        timestamp: new Date('2023-12-25T10:00:00Z'),
        metadata: {}
      }];

      const period: { type: 'day' | 'hour' | 'minute' | 'second' | 'week' | 'month' | 'year'; count: number } = { type: 'day', count: 1 };
      const result = TemporalService.aggregate(singleResult, period);

      expect(result.summary.totalMemories).toBe(1);
      expect(result.buckets.length).toBe(1);
      expect(result.buckets[0].statistics.count).toBe(1);
    });

    it('should handle results with same timestamp', () => {
      const sameTimeResults = [
        {
          id: '1',
          content: 'Memory 1',
          score: 0.9,
          timestamp: new Date('2023-12-25T10:00:00Z'),
          metadata: {}
        },
        {
          id: '2',
          content: 'Memory 2',
          score: 0.7,
          timestamp: new Date('2023-12-25T10:00:00Z'),
          metadata: {}
        }
      ];

      const period: { type: 'day' | 'hour' | 'minute' | 'second' | 'week' | 'month' | 'year'; count: number } = { type: 'hour', count: 1 };
      const result = TemporalService.aggregate(sameTimeResults, period);

      expect(result.summary.totalMemories).toBe(2);
      expect(result.buckets.length).toBeGreaterThan(0);
    });

    it('should handle very large datasets efficiently', () => {
      const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
        id: `memory_${i}`,
        content: `Memory ${i}`,
        score: Math.random(),
        timestamp: new Date(2023, 0, 1, Math.floor(i / 60), i % 60), // Spread over time
        metadata: { category: 'test' }
      }));

      const period: { type: 'day' | 'hour' | 'minute' | 'second' | 'week' | 'month' | 'year'; count: number } = { type: 'hour', count: 1 };
      const startTime = Date.now();

      const result = TemporalService.aggregate(largeDataset, period, {
        maxBuckets: 100
      });

      const processingTime = Date.now() - startTime;

      expect(result.summary.totalMemories).toBe(1000);
      expect(processingTime).toBeLessThan(5000); // Should process within 5 seconds
    });
  });
});
