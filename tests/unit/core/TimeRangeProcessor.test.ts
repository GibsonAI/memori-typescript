import { TemporalService, TimeRange, TimeRangeQuery } from "@/core/domain/search/temporal/TemporalService";

describe('TemporalService time range utilities', () => {
  describe('processTimeRange()', () => {
    it('should process valid time range correctly', () => {
      const start = new Date('2023-12-25T10:00:00Z');
      const end = new Date('2023-12-25T14:00:00Z');
      const range: TimeRange = { start, end };

      const result = TemporalService.processTimeRange(range);

      expect(result.isValid).toBe(true);
      expect(result.originalRange).toEqual(range);
      expect(result.normalizedRange.start).toEqual(start);
      expect(result.normalizedRange.end).toEqual(end);
      expect(result.duration).toBe(4 * 60 * 60 * 1000); // 4 hours
      expect(result.warnings).toHaveLength(0);
    });

    it('should handle swapped start/end dates', () => {
      const start = new Date('2023-12-25T14:00:00Z');
      const end = new Date('2023-12-25T10:00:00Z');
      const range: TimeRange = { start, end };

      const result = TemporalService.processTimeRange(range);

      expect(result.isValid).toBe(true);
      expect(result.normalizedRange.start.getTime()).toBe(end.getTime());
      expect(result.normalizedRange.end.getTime()).toBe(start.getTime());
    });

    it('should detect very short time ranges', () => {
      const start = new Date('2023-12-25T10:00:00Z');
      const end = new Date('2023-12-25T10:00:00.999Z'); // 999ms - less than 1 second
      const range: TimeRange = { start, end };

      const result = TemporalService.processTimeRange(range);

      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Time range is very short (999ms). Consider if this is intentional.');
    });

    it('should detect very large time ranges', () => {
      const start = new Date('2020-01-01T00:00:00Z');
      const end = new Date('2025-01-01T00:00:00Z'); // 5 years
      const range: TimeRange = { start, end };

      const result = TemporalService.processTimeRange(range);

      expect(result.isValid).toBe(true);
      expect(result.warnings.some((w: string) => w.includes('very large'))).toBe(true);
    });

    it('should handle invalid date objects', () => {
      const range: TimeRange = {
        start: new Date('invalid'),
        end: new Date('2023-12-25T14:00:00Z')
      };

      const result = TemporalService.processTimeRange(range);

      expect(result.isValid).toBe(false);
      expect(result.warnings[0]).toContain('Invalid date values provided');
    });

    it('should handle start date after end date', () => {
      const start = new Date('2023-12-25T14:00:00Z');
      const end = new Date('2023-12-25T10:00:00Z');
      const range: TimeRange = { start, end };

      const result = TemporalService.processTimeRange(range);

      expect(result.isValid).toBe(true);
      // Should be normalized with start before end
      expect(result.normalizedRange.start.getTime()).toBeLessThan(result.normalizedRange.end.getTime());
    });
  });

  describe('intersectRanges()', () => {
    it('should return null for empty ranges array', () => {
      const result = TemporalService.intersectRanges([]);
      expect(result).toBeNull();
    });

    it('should return the range for single range', () => {
      const range: TimeRange = {
        start: new Date('2023-12-25T10:00:00Z'),
        end: new Date('2023-12-25T14:00:00Z')
      };

      const result = TemporalService.intersectRanges([range]);
      expect(result).toEqual(range);
    });

    it('should calculate intersection of overlapping ranges', () => {
      const range1: TimeRange = {
        start: new Date('2023-12-25T10:00:00Z'),
        end: new Date('2023-12-25T14:00:00Z')
      };
      const range2: TimeRange = {
        start: new Date('2023-12-25T12:00:00Z'),
        end: new Date('2023-12-25T16:00:00Z')
      };

      const result = TemporalService.intersectRanges([range1, range2]);

      expect(result).toBeDefined();
      expect(result!.start.getTime()).toBe(range2.start.getTime());
      expect(result!.end.getTime()).toBe(range1.end.getTime());
    });

    it('should return null for non-overlapping ranges', () => {
      const range1: TimeRange = {
        start: new Date('2023-12-25T10:00:00Z'),
        end: new Date('2023-12-25T12:00:00Z')
      };
      const range2: TimeRange = {
        start: new Date('2023-12-25T14:00:00Z'),
        end: new Date('2023-12-25T16:00:00Z')
      };

      const result = TemporalService.intersectRanges([range1, range2]);
      expect(result).toBeNull();
    });
  });

  describe('unionRanges()', () => {
    it('should return empty array for empty input', () => {
      const result = TemporalService.unionRanges([]);
      expect(result).toEqual([]);
    });

    it('should return single range as-is', () => {
      const range: TimeRange = {
        start: new Date('2023-12-25T10:00:00Z'),
        end: new Date('2023-12-25T14:00:00Z')
      };

      const result = TemporalService.unionRanges([range]);
      expect(result).toEqual([range]);
    });

    it('should merge overlapping ranges', () => {
      const range1: TimeRange = {
        start: new Date('2023-12-25T10:00:00Z'),
        end: new Date('2023-12-25T14:00:00Z')
      };
      const range2: TimeRange = {
        start: new Date('2023-12-25T12:00:00Z'),
        end: new Date('2023-12-25T16:00:00Z')
      };

      const result = TemporalService.unionRanges([range1, range2]);

      expect(result).toHaveLength(1);
      expect(result[0].start.getTime()).toBe(range1.start.getTime());
      expect(result[0].end.getTime()).toBe(range2.end.getTime());
    });

    it('should not merge non-overlapping ranges', () => {
      const range1: TimeRange = {
        start: new Date('2023-12-25T10:00:00Z'),
        end: new Date('2023-12-25T12:00:00Z')
      };
      const range2: TimeRange = {
        start: new Date('2023-12-25T14:00:00Z'),
        end: new Date('2023-12-25T16:00:00Z')
      };

      const result = TemporalService.unionRanges([range1, range2]);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(range1);
      expect(result[1]).toEqual(range2);
    });
  });

  describe('createBuckets()', () => {
    it('should create correct buckets for day granularity', () => {
      const range: TimeRange = {
        start: new Date('2023-12-25T00:00:00Z'),
        end: new Date('2023-12-28T00:00:00Z') // 3 days
      };

      const buckets = TemporalService.createBuckets(range, 'day');

      expect(buckets).toHaveLength(3);
      expect(buckets[0].start.getTime()).toBe(new Date('2023-12-25T00:00:00Z').getTime());
      expect(buckets[0].end.getTime()).toBe(new Date('2023-12-26T00:00:00Z').getTime());
      expect(buckets[0].label).toBe('2023-12-25');
    });

    it('should create correct buckets for hour granularity', () => {
      const range: TimeRange = {
        start: new Date('2023-12-25T10:00:00Z'),
        end: new Date('2023-12-25T14:00:00Z') // 4 hours
      };

      const buckets = TemporalService.createBuckets(range, 'hour');

      expect(buckets).toHaveLength(4);
      expect(buckets[0].label).toBe('2023-12-25 10');
      expect(buckets[1].label).toBe('2023-12-25 11');
    });

    it('should return empty array for invalid range', () => {
      const range: TimeRange = {
        start: new Date('invalid'),
        end: new Date('2023-12-25T14:00:00Z')
      };

      const buckets = TemporalService.createBuckets(range, 'day');
      expect(buckets).toEqual([]);
    });
  });

  describe('expandTimeRange()', () => {
    it('should expand range before start', () => {
      const range: TimeRange = {
        start: new Date('2023-12-25T12:00:00Z'),
        end: new Date('2023-12-25T14:00:00Z')
      };

      const expanded = TemporalService.expandTimeRange(range, {
        before: 2 * 60 * 60 * 1000 // 2 hours
      });

      expect(expanded.start.getTime()).toBe(range.start.getTime() - 2 * 60 * 60 * 1000);
      expect(expanded.end.getTime()).toBe(range.end.getTime());
    });

    it('should expand range after end', () => {
      const range: TimeRange = {
        start: new Date('2023-12-25T12:00:00Z'),
        end: new Date('2023-12-25T14:00:00Z')
      };

      const expanded = TemporalService.expandTimeRange(range, {
        after: 60 * 60 * 1000 // 1 hour
      });

      expect(expanded.start.getTime()).toBe(range.start.getTime());
      expect(expanded.end.getTime()).toBe(range.end.getTime() + 60 * 60 * 1000);
    });

    it('should expand both directions', () => {
      const range: TimeRange = {
        start: new Date('2023-12-25T12:00:00Z'),
        end: new Date('2023-12-25T14:00:00Z')
      };

      const expanded = TemporalService.expandTimeRange(range, {
        before: 60 * 60 * 1000, // 1 hour
        after: 60 * 60 * 1000   // 1 hour
      });

      expect(expanded.start.getTime()).toBe(range.start.getTime() - 60 * 60 * 1000);
      expect(expanded.end.getTime()).toBe(range.end.getTime() + 60 * 60 * 1000);
    });
  });

  describe('contractTimeRange()', () => {
    it('should contract range from start', () => {
      const range: TimeRange = {
        start: new Date('2023-12-25T10:00:00Z'),
        end: new Date('2023-12-25T14:00:00Z')
      };

      const contracted = TemporalService.contractTimeRange(range, {
        before: 60 * 60 * 1000 // 1 hour
      });

      expect(contracted.start.getTime()).toBe(range.start.getTime() + 60 * 60 * 1000);
      expect(contracted.end.getTime()).toBe(range.end.getTime());
    });

    it('should contract range from end', () => {
      const range: TimeRange = {
        start: new Date('2023-12-25T10:00:00Z'),
        end: new Date('2023-12-25T14:00:00Z')
      };

      const contracted = TemporalService.contractTimeRange(range, {
        after: 60 * 60 * 1000 // 1 hour
      });

      expect(contracted.start.getTime()).toBe(range.start.getTime());
      expect(contracted.end.getTime()).toBe(range.end.getTime() - 60 * 60 * 1000);
    });

    it('should throw error when contraction creates invalid range', () => {
      const range: TimeRange = {
        start: new Date('2023-12-25T10:00:00Z'),
        end: new Date('2023-12-25T11:00:00Z') // 1 hour range
      };

      expect(() => {
        TemporalService.contractTimeRange(range, {
          before: 30 * 60 * 1000, // 30 minutes
          after: 30 * 60 * 1000   // 30 minutes
        });
      }).toThrow('Time range contraction results in invalid range');
    });
  });

  describe('dateInRanges()', () => {
    const ranges: TimeRange[] = [
      {
        start: new Date('2023-12-25T10:00:00Z'),
        end: new Date('2023-12-25T12:00:00Z')
      },
      {
        start: new Date('2023-12-25T14:00:00Z'),
        end: new Date('2023-12-25T16:00:00Z')
      }
    ];

    it('should return true for date in first range', () => {
      const date = new Date('2023-12-25T11:00:00Z');
      expect(TemporalService.dateInRanges(date, ranges)).toBe(true);
    });

    it('should return true for date in second range', () => {
      const date = new Date('2023-12-25T15:00:00Z');
      expect(TemporalService.dateInRanges(date, ranges)).toBe(true);
    });

    it('should return false for date not in any range', () => {
      const date = new Date('2023-12-25T13:00:00Z');
      expect(TemporalService.dateInRanges(date, ranges)).toBe(false);
    });

    it('should handle exclusive end dates correctly', () => {
      const exclusiveRanges: TimeRange[] = [
        {
          start: new Date('2023-12-25T10:00:00Z'),
          end: new Date('2023-12-25T12:00:00Z'),
          inclusive: false
        }
      ];

      const date = new Date('2023-12-25T12:00:00Z');
      expect(TemporalService.dateInRanges(date, exclusiveRanges)).toBe(false);
    });
  });

  describe('getRangeStatistics()', () => {
    it('should calculate statistics for multiple ranges', () => {
      const ranges: TimeRange[] = [
        {
          start: new Date('2023-12-25T10:00:00Z'),
          end: new Date('2023-12-25T12:00:00Z') // 2 hours
        },
        {
          start: new Date('2023-12-25T14:00:00Z'),
          end: new Date('2023-12-25T18:00:00Z') // 4 hours
        }
      ];

      const stats = TemporalService.getRangeStatistics(ranges);

      expect(stats.rangeCount).toBe(2);
      expect(stats.totalDuration).toBe(6 * 60 * 60 * 1000); // 6 hours
      expect(stats.averageDuration).toBe(3 * 60 * 60 * 1000); // 3 hours
      expect(stats.minDuration).toBe(2 * 60 * 60 * 1000); // 2 hours
      expect(stats.maxDuration).toBe(4 * 60 * 60 * 1000); // 4 hours
      expect(stats.coverage).toBe(1); // Non-overlapping ranges give 100% coverage
    });

    it('should handle empty ranges array', () => {
      const stats = TemporalService.getRangeStatistics([]);

      expect(stats.rangeCount).toBe(0);
      expect(stats.totalDuration).toBe(0);
      expect(stats.averageDuration).toBe(0);
      expect(stats.minDuration).toBe(0);
      expect(stats.maxDuration).toBe(0);
      expect(stats.coverage).toBe(0);
    });

    it('should handle overlapping ranges in coverage calculation', () => {
      const ranges: TimeRange[] = [
        {
          start: new Date('2023-12-25T10:00:00Z'),
          end: new Date('2023-12-25T15:00:00Z') // 5 hours
        },
        {
          start: new Date('2023-12-25T12:00:00Z'),
          end: new Date('2023-12-25T16:00:00Z') // 4 hours, 3 hours overlap
        }
      ];

      const stats = TemporalService.getRangeStatistics(ranges);

      expect(stats.totalDuration).toBe(9 * 60 * 60 * 1000); // 9 hours total (5+4)
      expect(stats.coverage).toBeLessThan(1); // Union should be 6 hours, so coverage = 6/9 = 0.67
    });
  });

  describe('processTimeRangeQuery()', () => {
    it('should process multiple ranges in query', () => {
      const query: TimeRangeQuery = {
        ranges: [
          {
            start: new Date('2023-12-25T10:00:00Z'),
            end: new Date('2023-12-25T12:00:00Z')
          },
          {
            start: new Date('2023-12-25T14:00:00Z'),
            end: new Date('2023-12-25T16:00:00Z')
          }
        ],
        operation: 'UNION',
        granularity: 'hour'
      };

      const results = TemporalService.processTimeRangeQuery(query);

      expect(results).toHaveLength(2);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(true);
    });

    it('should handle query with no ranges', () => {
      const query: TimeRangeQuery = {
        ranges: [],
        operation: 'UNION',
        granularity: 'day'
      };

      const results = TemporalService.processTimeRangeQuery(query);
      expect(results).toEqual([]);
    });
  });
});
