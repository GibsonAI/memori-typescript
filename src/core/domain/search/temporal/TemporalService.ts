/**
 * TemporalService - Unified temporal processing utilities
 *
 * Consolidates temporal aggregation and time range processing into a single service:
 * - Time-based aggregation with trend analysis
 * - Time range validation, normalization, and statistics
 * - Bucket creation utilities for both aggregation and range queries
 * - Shared period definitions to ensure consistent formatting and calculations
 */

export type TemporalGranularity = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

export interface TemporalPeriodDefinition {
  ms: number;
  format: string;
}

export interface TemporalAggregationPeriod {
  type: TemporalGranularity;
  count: number;
  startFrom?: Date;
}

export interface AggregationBucket {
  period: {
    start: Date;
    end: Date;
    label: string;
  };
  statistics: {
    count: number;
    averageScore: number;
    minScore: number;
    maxScore: number;
    totalImportance: number;
    uniqueCategories: string[];
    memoryTypes: Record<string, number>;
  };
  trend: {
    direction: 'increasing' | 'decreasing' | 'stable';
    strength: number;
    changePercent: number;
  };
  representative: {
    memoryId: string;
    content: string;
    score: number;
  } | null;
}

export interface TemporalAggregationResult {
  buckets: AggregationBucket[];
  summary: {
    totalMemories: number;
    timeSpan: {
      start: Date;
      end: Date;
      duration: number;
    };
    dominantPeriod: string;
    overallTrend: {
      direction: 'increasing' | 'decreasing' | 'stable';
      strength: number;
    };
  };
  metadata: {
    aggregationPeriod: TemporalAggregationPeriod;
    generatedAt: Date;
    processingTime: number;
  };
}

export interface TimeRange {
  start: Date;
  end: Date;
  inclusive?: boolean;
}

export interface TimeRangeQuery {
  ranges: TimeRange[];
  operation?: 'INTERSECT' | 'UNION' | 'EXCLUDE';
  granularity?: TemporalGranularity;
}

export interface ProcessedTimeRange {
  originalRange: TimeRange;
  normalizedRange: TimeRange;
  duration: number;
  isValid: boolean;
  warnings: string[];
}

export interface TimeBucket {
  start: Date;
  end: Date;
  label: string;
  count?: number;
}

export class TemporalService {
  static readonly PERIODS: Record<TemporalGranularity, TemporalPeriodDefinition> = {
    second: { ms: 1000, format: 'HH:mm:ss' },
    minute: { ms: 60 * 1000, format: 'HH:mm' },
    hour: { ms: 60 * 60 * 1000, format: 'MM/dd HH:mm' },
    day: { ms: 24 * 60 * 60 * 1000, format: 'MM/dd/yyyy' },
    week: { ms: 7 * 24 * 60 * 60 * 1000, format: 'MM/dd/yyyy' },
    month: { ms: 30 * 24 * 60 * 60 * 1000, format: 'MM/yyyy' },
    year: { ms: 365 * 24 * 60 * 60 * 1000, format: 'yyyy' },
  };

  private static readonly MIN_RANGE_MS = 1000;
  private static readonly MAX_RANGE_MS = 365 * 24 * 60 * 60 * 1000;

  /**
   * Aggregate search results by time periods
   */
  static aggregate(
    results: Array<{
      id: string;
      content: string;
      score: number;
      timestamp: Date;
      metadata: Record<string, any>;
    }>,
    period: TemporalAggregationPeriod,
    options: {
      includeTrends?: boolean;
      maxBuckets?: number;
      representativeStrategy?: 'highest_score' | 'most_recent' | 'random';
    } = {},
  ): TemporalAggregationResult {
    const startTime = Date.now();
    const {
      includeTrends = true,
      maxBuckets = 100,
      representativeStrategy = 'highest_score',
    } = options;

    const sortedResults = [...results].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    const buckets = this.buildAggregationBuckets(period, sortedResults, maxBuckets);
    const populatedBuckets = this.populateAggregationBuckets(sortedResults, buckets, representativeStrategy);

    if (includeTrends) {
      this.calculateTrends(populatedBuckets);
    }

    const summary = this.generateSummary(populatedBuckets, period);

    return {
      buckets: populatedBuckets,
      summary,
      metadata: {
        aggregationPeriod: period,
        generatedAt: new Date(),
        processingTime: Date.now() - startTime,
      },
    };
  }

  /**
   * Determine optimal aggregation period for a dataset
   */
  static getOptimalPeriod(
    results: Array<{ timestamp: Date }>,
    preferredMaxBuckets: number = 50,
  ): TemporalAggregationPeriod {
    if (results.length === 0) {
      return { type: 'day', count: 1 };
    }

    const sortedResults = [...results].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    const timeSpan = sortedResults[sortedResults.length - 1].timestamp.getTime() -
      sortedResults[0].timestamp.getTime();

    if (timeSpan > this.PERIODS.year.ms) {
      const years = timeSpan / this.PERIODS.year.ms;
      if (years <= preferredMaxBuckets) {
        return { type: 'year', count: Math.ceil(years) };
      }
    }

    const periods: Array<{ type: TemporalGranularity; maxSpan: number }> = [
      { type: 'year', maxSpan: Infinity },
      { type: 'month', maxSpan: 20 * this.PERIODS.year.ms },
      { type: 'week', maxSpan: 5 * this.PERIODS.year.ms },
      { type: 'day', maxSpan: this.PERIODS.year.ms },
      { type: 'hour', maxSpan: 30 * this.PERIODS.day.ms },
      { type: 'minute', maxSpan: this.PERIODS.day.ms },
      { type: 'second', maxSpan: this.PERIODS.hour.ms },
    ];

    let optimalPeriod = periods[periods.length - 1];

    for (let i = 0; i < periods.length; i++) {
      const period = periods[i];
      const estimatedBuckets = timeSpan / this.PERIODS[period.type].ms;

      if (estimatedBuckets > preferredMaxBuckets) {
        if (i > 0) {
          optimalPeriod = periods[i - 1];
        }
        break;
      } else {
        optimalPeriod = period;
      }
    }

    const count = Math.ceil(timeSpan / this.PERIODS[optimalPeriod.type].ms);

    return {
      type: optimalPeriod.type,
      count: Math.min(count, preferredMaxBuckets),
    };
  }

  /**
   * Merge aggregation results from multiple queries
   */
  static mergeAggregationResults(results: TemporalAggregationResult[]): TemporalAggregationResult | null {
    if (results.length === 0) return null;
    if (results.length === 1) return results[0];

    const bucketMap = new Map<string, AggregationBucket[]>();

    for (const result of results) {
      for (const bucket of result.buckets) {
        const key = bucket.period.label;
        if (!bucketMap.has(key)) {
          bucketMap.set(key, []);
        }
        bucketMap.get(key)!.push(bucket);
      }
    }

    const mergedBuckets: AggregationBucket[] = [];

    for (const [label, buckets] of bucketMap.entries()) {
      const mergedBucket = this.mergeBuckets(buckets);
      mergedBucket.period.label = label;
      mergedBuckets.push(mergedBucket);
    }

    mergedBuckets.sort((a, b) => a.period.start.getTime() - b.period.start.getTime());
    this.calculateTrends(mergedBuckets);

    const summary = this.generateSummary(mergedBuckets, results[0].metadata.aggregationPeriod);

    return {
      buckets: mergedBuckets,
      summary,
      metadata: {
        aggregationPeriod: results[0].metadata.aggregationPeriod,
        generatedAt: new Date(),
        processingTime: results.reduce((sum, r) => sum + r.metadata.processingTime, 0),
      },
    };
  }

  /**
   * Export aggregation data for visualization
   */
  static exportForVisualization(result: TemporalAggregationResult): {
    timeSeries: Array<{
      timestamp: Date;
      value: number;
      count: number;
      label: string;
    }>;
    summary: {
      totalDataPoints: number;
      timeRange: { start: string; end: string };
      averageValue: number;
    };
  } {
    const timeSeries = result.buckets.map(bucket => ({
      timestamp: bucket.period.start,
      value: bucket.statistics.averageScore,
      count: bucket.statistics.count,
      label: bucket.period.label,
    }));

    const summary = {
      totalDataPoints: result.buckets.length,
      timeRange: {
        start: result.summary.timeSpan.start.toISOString(),
        end: result.summary.timeSpan.end.toISOString(),
      },
      averageValue: result.buckets.reduce((sum, b) => sum + b.statistics.averageScore, 0) /
        Math.max(result.buckets.length, 1),
    };

    return { timeSeries, summary };
  }

  /**
   * Process and validate a time range query
   */
  static processTimeRangeQuery(query: TimeRangeQuery): ProcessedTimeRange[] {
    const processedRanges: ProcessedTimeRange[] = [];

    for (const range of query.ranges) {
      const processed = this.processTimeRange(range);
      processedRanges.push(processed);
    }

    return processedRanges;
  }

  /**
   * Process and validate a single time range
   */
  static processTimeRange(range: TimeRange): ProcessedTimeRange {
    const warnings: string[] = [];
    let normalizedRange = { ...range };

    try {
      if (!(range.start instanceof Date) || !(range.end instanceof Date)) {
        throw new Error('Invalid date objects provided');
      }

      if (isNaN(range.start.getTime()) || isNaN(range.end.getTime())) {
        throw new Error('Invalid date values provided');
      }

      normalizedRange = this.normalizeTimeRange(normalizedRange);

      const duration = normalizedRange.end.getTime() - normalizedRange.start.getTime();

      if (duration < this.MIN_RANGE_MS) {
        warnings.push(`Time range is very short (${duration}ms). Consider if this is intentional.`);
      }

      if (duration > this.MAX_RANGE_MS) {
        warnings.push(`Time range is very large (${duration}ms). This may impact performance.`);
      }

      if (normalizedRange.start >= normalizedRange.end) {
        throw new Error('Start date must be before end date');
      }

      return {
        originalRange: range,
        normalizedRange,
        duration,
        isValid: true,
        warnings,
      };
    } catch (error) {
      return {
        originalRange: range,
        normalizedRange,
        duration: 0,
        isValid: false,
        warnings: [`Time range processing failed: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  }

  /**
   * Calculate intersection of multiple time ranges
   */
  static intersectRanges(ranges: TimeRange[]): TimeRange | null {
    if (ranges.length === 0) return null;
    if (ranges.length === 1) return ranges[0];

    let intersection = ranges[0];

    for (let i = 1; i < ranges.length; i++) {
      const nextIntersection = this.intersectTwoRanges(intersection, ranges[i]);
      if (!nextIntersection) {
        return null;
      }
      intersection = nextIntersection;
    }

    return intersection;
  }

  /**
   * Calculate union of multiple time ranges
   */
  static unionRanges(ranges: TimeRange[]): TimeRange[] {
    if (ranges.length === 0) return [];
    if (ranges.length === 1) return [ranges[0]];

    const sortedRanges = [...ranges].sort((a, b) => a.start.getTime() - b.start.getTime());
    const mergedRanges: TimeRange[] = [sortedRanges[0]];

    for (let i = 1; i < sortedRanges.length; i++) {
      const current = sortedRanges[i];
      const lastMerged = mergedRanges[mergedRanges.length - 1];

      if (current.start <= lastMerged.end) {
        lastMerged.end = new Date(Math.max(lastMerged.end.getTime(), current.end.getTime()));
      } else {
        mergedRanges.push(current);
      }
    }

    return mergedRanges;
  }

  /**
   * Create time buckets for a given range and granularity
   */
  static createBuckets(range: TimeRange, granularity: TemporalGranularity = 'day'): TimeBucket[] {
    const buckets: TimeBucket[] = [];
    const processedRange = this.processTimeRange(range);

    if (!processedRange.isValid) {
      return buckets;
    }

    const { start, end } = processedRange.normalizedRange;
    const bucketSize = this.PERIODS[granularity].ms;

    let current = new Date(start);
    let bucketIndex = 0;

    while (current < end) {
      const bucketStart = new Date(current);
      const bucketEnd = new Date(Math.min(current.getTime() + bucketSize, end.getTime()));

      buckets.push({
        start: bucketStart,
        end: bucketEnd,
        label: this.formatBucketLabel(bucketStart, granularity, bucketIndex),
      });

      current = new Date(current.getTime() + bucketSize);
      bucketIndex++;
    }

    return buckets;
  }

  /**
   * Expand time range by a specified amount
   */
  static expandTimeRange(range: TimeRange, expansion: { before?: number; after?: number }): TimeRange {
    const expanded = { ...range };

    if (expansion.before) {
      expanded.start = new Date(expanded.start.getTime() - expansion.before);
    }

    if (expansion.after) {
      expanded.end = new Date(expanded.end.getTime() + expansion.after);
    }

    return expanded;
  }

  /**
   * Contract time range by a specified amount
   */
  static contractTimeRange(range: TimeRange, contraction: { before?: number; after?: number }): TimeRange {
    const contracted = { ...range };

    if (contraction.before) {
      contracted.start = new Date(contracted.start.getTime() + contraction.before);
    }

    if (contraction.after) {
      contracted.end = new Date(contracted.end.getTime() - contraction.after);
    }

    if (contracted.start >= contracted.end) {
      throw new Error('Time range contraction results in invalid range');
    }

    return contracted;
  }

  /**
   * Check if a date falls within any of the provided ranges
   */
  static dateInRanges(date: Date, ranges: TimeRange[]): boolean {
    return ranges.some(range => {
      const inRange = date >= range.start && date <= range.end;
      return range.inclusive !== false ? inRange : date >= range.start && date < range.end;
    });
  }

  /**
   * Get time range statistics
   */
  static getRangeStatistics(ranges: TimeRange[]): {
    totalDuration: number;
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    rangeCount: number;
    coverage: number;
  } {
    if (ranges.length === 0) {
      return {
        totalDuration: 0,
        averageDuration: 0,
        minDuration: 0,
        maxDuration: 0,
        rangeCount: 0,
        coverage: 0,
      };
    }

    const durations = ranges.map(r => r.end.getTime() - r.start.getTime());
    const totalDuration = durations.reduce((sum, duration) => sum + duration, 0);
    const averageDuration = totalDuration / ranges.length;
    const minDuration = Math.min(...durations);
    const maxDuration = Math.max(...durations);

    const unionRanges = this.unionRanges(ranges);
    const unionDuration = unionRanges.reduce((sum, range) => {
      return sum + (range.end.getTime() - range.start.getTime());
    }, 0);

    return {
      totalDuration,
      averageDuration,
      minDuration,
      maxDuration,
      rangeCount: ranges.length,
      coverage: unionDuration / totalDuration,
    };
  }

  /**
   * INTERNAL HELPERS
   */

  private static buildAggregationBuckets(
    period: TemporalAggregationPeriod,
    results: Array<{ timestamp: Date }>,
    maxBuckets: number,
  ): Array<{ start: Date; end: Date; label: string }> {
    if (results.length === 0) {
      return [];
    }

    const periodMs = this.PERIODS[period.type].ms;
    const sortedResults = [...results].sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime(),
    );

    const earliestTime = sortedResults[0].timestamp;
    const latestTime = sortedResults[sortedResults.length - 1].timestamp;
    const buckets: Array<{ start: Date; end: Date; label: string }> = [];
    const customStart = period.startFrom || earliestTime;

    const totalTimeSpan = latestTime.getTime() - customStart.getTime();
    const totalPeriods = Math.ceil(totalTimeSpan / periodMs) + 1;
    const actualBuckets = Math.min(maxBuckets, Math.max(1, totalPeriods));

    for (let i = 0; i < actualBuckets; i++) {
      const start = new Date(customStart.getTime() + (i * periodMs));
      const end = new Date(start.getTime() + periodMs);

      buckets.push({
        start,
        end,
        label: this.formatBucketLabel(start, period.type, i),
      });
    }

    return buckets;
  }

  private static populateAggregationBuckets(
    results: Array<{
      id: string;
      content: string;
      score: number;
      timestamp: Date;
      metadata: Record<string, any>;
    }>,
    buckets: Array<{ start: Date; end: Date; label: string }>,
    representativeStrategy: 'highest_score' | 'most_recent' | 'random',
  ): AggregationBucket[] {
    const populatedBuckets: AggregationBucket[] = buckets.map(bucket => ({
      period: bucket,
      statistics: {
        count: 0,
        averageScore: 0,
        minScore: 1,
        maxScore: 0,
        totalImportance: 0,
        uniqueCategories: [],
        memoryTypes: {},
      },
      trend: {
        direction: 'stable',
        strength: 0,
        changePercent: 0,
      },
      representative: null,
    }));

    for (const result of results) {
      const bucketIndex = buckets.findIndex(
        bucket => result.timestamp >= bucket.start && result.timestamp < bucket.end,
      );

      if (bucketIndex !== -1) {
        const bucket = populatedBuckets[bucketIndex];
        const category = result.metadata.category || 'uncategorized';
        const memoryType = result.metadata.memoryType || 'unknown';

        bucket.statistics.count++;
        bucket.statistics.averageScore =
          (bucket.statistics.averageScore * (bucket.statistics.count - 1) + result.score) /
          bucket.statistics.count;
        bucket.statistics.minScore = Math.min(bucket.statistics.minScore, result.score);
        bucket.statistics.maxScore = Math.max(bucket.statistics.maxScore, result.score);
        bucket.statistics.totalImportance += result.metadata.importanceScore || 0.5;

        if (!bucket.statistics.uniqueCategories.includes(category)) {
          bucket.statistics.uniqueCategories.push(category);
        }

        bucket.statistics.memoryTypes[memoryType] =
          (bucket.statistics.memoryTypes[memoryType] || 0) + 1;

        if (
          !bucket.representative ||
          this.shouldReplaceRepresentative(bucket.representative, result, representativeStrategy)
        ) {
          bucket.representative = {
            memoryId: result.id,
            content: result.content,
            score: result.score,
          };
        }
      }
    }

    return populatedBuckets;
  }

  private static shouldReplaceRepresentative(
    current: { score: number },
    candidate: { score: number },
    strategy: 'highest_score' | 'most_recent' | 'random',
  ): boolean {
    switch (strategy) {
      case 'highest_score':
        return candidate.score > current.score;
      case 'most_recent':
        return true;
      case 'random':
        return Math.random() > 0.5;
      default:
        return false;
    }
  }

  private static calculateTrends(buckets: AggregationBucket[]): void {
    for (let i = 1; i < buckets.length; i++) {
      const current = buckets[i];
      const previous = buckets[i - 1];

      const change = current.statistics.averageScore - previous.statistics.averageScore;
      const changePercent = previous.statistics.averageScore !== 0
        ? (change / previous.statistics.averageScore) * 100
        : 0;

      let direction: 'increasing' | 'decreasing' | 'stable' = 'stable';
      let strength = 0;

      if (Math.abs(changePercent) > 5) {
        direction = changePercent > 0 ? 'increasing' : 'decreasing';
        strength = Math.min(Math.abs(changePercent) / 50, 1);
      }

      current.trend = {
        direction,
        strength,
        changePercent,
      };
    }
  }

  private static generateSummary(
    buckets: AggregationBucket[],
    period: TemporalAggregationPeriod,
  ) {
    const nonEmptyBuckets = buckets.filter(b => b.statistics.count > 0);

    if (nonEmptyBuckets.length === 0) {
      return {
        totalMemories: 0,
        timeSpan: { start: new Date(), end: new Date(), duration: 0 },
        dominantPeriod: 'none',
        overallTrend: { direction: 'stable' as const, strength: 0 },
      };
    }

    const allScores = nonEmptyBuckets.map(b => b.statistics.averageScore);
    const totalMemories = nonEmptyBuckets.reduce((sum, b) => sum + b.statistics.count, 0);
    const firstBucket = nonEmptyBuckets[0];
    const lastBucket = nonEmptyBuckets[nonEmptyBuckets.length - 1];

    const firstScore = allScores[0];
    const lastScore = allScores[allScores.length - 1];
    const overallChange = lastScore - firstScore;
    const overallChangePercent = firstScore !== 0 ? (overallChange / firstScore) * 100 : 0;

    let overallDirection: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (Math.abs(overallChangePercent) > 10) {
      overallDirection = overallChangePercent > 0 ? 'increasing' : 'decreasing';
    }

    const dominantBucket = nonEmptyBuckets.reduce((dominant, current) =>
      current.statistics.count > dominant.statistics.count ? current : dominant,
    );

    return {
      totalMemories,
      timeSpan: {
        start: firstBucket.period.start,
        end: lastBucket.period.end,
        duration: lastBucket.period.end.getTime() - firstBucket.period.start.getTime(),
      },
      dominantPeriod: dominantBucket.period.label,
      overallTrend: {
        direction: overallDirection,
        strength: Math.min(Math.abs(overallChangePercent) / 25, 1),
      },
    };
  }

  private static mergeBuckets(buckets: AggregationBucket[]): AggregationBucket {
    if (buckets.length === 1) return buckets[0];

    const merged: AggregationBucket = {
      period: {
        start: buckets[0].period.start,
        end: buckets[buckets.length - 1].period.end,
        label: 'Merged',
      },
      statistics: {
        count: buckets.reduce((sum, b) => sum + b.statistics.count, 0),
        averageScore: buckets.reduce((sum, b) => sum + (b.statistics.averageScore * b.statistics.count), 0) /
          buckets.reduce((sum, b) => sum + b.statistics.count, 0),
        minScore: Math.min(...buckets.map(b => b.statistics.minScore)),
        maxScore: Math.max(...buckets.map(b => b.statistics.maxScore)),
        totalImportance: buckets.reduce((sum, b) => sum + b.statistics.totalImportance, 0),
        uniqueCategories: [...new Set(buckets.flatMap(b => b.statistics.uniqueCategories))],
        memoryTypes: buckets.reduce((acc, b) => {
          for (const [type, count] of Object.entries(b.statistics.memoryTypes)) {
            acc[type] = (acc[type] || 0) + count;
          }
          return acc;
        }, {} as Record<string, number>),
      },
      trend: {
        direction: 'stable',
        strength: 0,
        changePercent: 0,
      },
      representative: buckets.find(b => b.representative)?.representative || null,
    };

    return merged;
  }

  private static normalizeTimeRange(range: TimeRange): TimeRange {
    const normalized = { ...range };

    if (normalized.start > normalized.end) {
      [normalized.start, normalized.end] = [normalized.end, normalized.start];
    }

    normalized.start = new Date(normalized.start);
    normalized.end = new Date(normalized.end);

    return normalized;
  }

  private static intersectTwoRanges(range1: TimeRange, range2: TimeRange): TimeRange | null {
    const start = new Date(Math.max(range1.start.getTime(), range2.start.getTime()));
    const end = new Date(Math.min(range1.end.getTime(), range2.end.getTime()));

    if (start >= end) {
      return null;
    }

    return { start, end };
  }

  private static formatBucketLabel(start: Date, granularity: TemporalGranularity, index: number): string {
    switch (granularity) {
      case 'second':
        return start.toISOString().split('T')[1].split('.')[0];
      case 'minute':
        return start.toISOString().slice(0, 16).replace('T', ' ');
      case 'hour':
        return start.toISOString().slice(0, 13).replace('T', ' ');
      case 'day':
        return start.toISOString().split('T')[0];
      case 'week': {
        const weekStart = new Date(start);
        weekStart.setDate(start.getDate() - start.getDay());
        return `Week of ${weekStart.toISOString().split('T')[0]}`;
      }
      case 'month':
        return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`;
      case 'year':
        return String(start.getFullYear());
      default:
        return `Bucket ${index}`;
    }
  }
}

