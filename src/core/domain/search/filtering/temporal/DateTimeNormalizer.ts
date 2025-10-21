/**
 * DateTimeNormalizer - Standardizes various date/time formats and expressions
 *
 * Handles normalization of:
 * - ISO date strings (2023-12-25T10:30:00Z)
 * - Unix timestamps (1703500200)
 * - Relative time expressions ("2 hours ago", "yesterday")
 * - Natural language dates ("last Monday", "next week")
 * - Date objects and other formats
 */

export interface NormalizedDateTime {
  date: Date;
  originalFormat: string;
  confidence: number; // 0-1 confidence score for the parsing
  timezone?: string;
}

export interface NormalizationOptions {
  assumeLocalTimezone?: boolean;
  defaultYear?: number;
  strict?: boolean; // If true, throw errors on ambiguous dates
}

export class DateTimeNormalizer {
  private static readonly ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/;
  private static readonly TIMESTAMP_REGEX = /^\d{10}(\.\d+)?$/;
  private static readonly RELATIVE_TIME_REGEX = /^(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago$/i;
  private static readonly NATURAL_LANGUAGE_REGEX = /^(today|yesterday|tomorrow|last\s+\w+|next\s+\w+|this\s+\w+)$/i;

  /**
   * Normalize a date/time value to a standard Date object
   */
  static normalize(value: unknown, options: NormalizationOptions = {}): NormalizedDateTime {
    const startTime = Date.now();

    try {
      // Handle null/undefined
      if (value == null) {
        throw new Error('DateTimeNormalizer: Cannot normalize null or undefined value');
      }

      // Handle Date objects
      if (value instanceof Date) {
        if (isNaN(value.getTime())) {
          throw new Error('DateTimeNormalizer: Invalid Date object provided');
        }
        return {
          date: value,
          originalFormat: 'Date',
          confidence: 1.0,
          timezone: value.getTime() !== new Date(value.toISOString()).getTime() ? 'local' : 'UTC'
        };
      }

      // Handle string values
      if (typeof value === 'string') {
        return this.normalizeString(value, options);
      }

      // Handle numeric values (timestamps)
      if (typeof value === 'number') {
        return this.normalizeNumber(value, options);
      }

      throw new Error(`DateTimeNormalizer: Unsupported value type: ${typeof value}`);

    } catch (error) {
      if (options.strict) {
        throw error;
      }

      // Return current time with low confidence for non-strict mode
      return {
        date: new Date(),
        originalFormat: String(value),
        confidence: 0.1
      };
    }
  }

  /**
   * Normalize string date/time expressions
   */
  private static normalizeString(value: string, options: NormalizationOptions): NormalizedDateTime {
    const trimmedValue = value.trim();

    // Try ISO format first (most reliable)
    if (this.ISO_DATE_REGEX.test(trimmedValue)) {
      const date = new Date(trimmedValue);
      if (!isNaN(date.getTime())) {
        return {
          date,
          originalFormat: 'ISO8601',
          confidence: 1.0,
          timezone: trimmedValue.endsWith('Z') ? 'UTC' : 'local'
        };
      }
    }

    // Try natural language patterns
    if (this.NATURAL_LANGUAGE_REGEX.test(trimmedValue)) {
      return this.normalizeNaturalLanguage(trimmedValue, options);
    }

    // Try relative time expressions
    const relativeMatch = trimmedValue.match(this.RELATIVE_TIME_REGEX);
    if (relativeMatch) {
      return this.normalizeRelativeTime(relativeMatch, options);
    }

    // Try parsing as a regular date string
    try {
      const date = new Date(trimmedValue);
      if (!isNaN(date.getTime())) {
        return {
          date,
          originalFormat: 'DateString',
          confidence: 0.8,
          timezone: options.assumeLocalTimezone ? 'local' : 'UTC'
        };
      }
    } catch {
      // Continue to fallback methods
    }

    throw new Error(`DateTimeNormalizer: Unable to parse date string: ${trimmedValue}`);
  }

  /**
   * Normalize numeric timestamps
   */
  private static normalizeNumber(value: number, options: NormalizationOptions): NormalizedDateTime {
    // Handle seconds (Unix timestamp)
    if (value > 1e9 && value < 2e10) {
      const date = new Date(value * 1000);
      if (!isNaN(date.getTime())) {
        return {
          date,
          originalFormat: 'UnixTimestamp',
          confidence: 1.0,
          timezone: 'UTC'
        };
      }
    }

    // Handle milliseconds
    if (value > 1e12 && value < 2e13) {
      const date = new Date(value);
      if (!isNaN(date.getTime())) {
        return {
          date,
          originalFormat: 'UnixTimestampMs',
          confidence: 1.0,
          timezone: 'UTC'
        };
      }
    }

    throw new Error(`DateTimeNormalizer: Unable to parse timestamp: ${value}`);
  }

  /**
   * Normalize natural language date expressions
   */
  private static normalizeNaturalLanguage(value: string, options: NormalizationOptions): NormalizedDateTime {
    const now = new Date();
    let targetDate: Date;
    let confidence = 0.9;

    switch (value.toLowerCase()) {
      case 'today':
        targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'yesterday':
        targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        break;
      case 'tomorrow':
        targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        break;
      default:
        return this.normalizeComplexNaturalLanguage(value, options);
    }

    return {
      date: targetDate,
      originalFormat: 'NaturalLanguage',
      confidence
    };
  }

  /**
   * Normalize complex natural language expressions like "last Monday", "next week"
   */
  private static normalizeComplexNaturalLanguage(value: string, options: NormalizationOptions): NormalizedDateTime {
    const now = new Date();
    let targetDate = new Date(now);
    let confidence = 0.7;

    // Handle "last Monday" pattern
    const lastDayMatch = value.match(/^last\s+(\w+)$/i);
    if (lastDayMatch) {
      const dayName = lastDayMatch[1].toLowerCase();
      const dayIndex = this.getDayIndex(dayName);
      if (dayIndex !== -1) {
        const daysToSubtract = (now.getDay() - dayIndex + 7) % 7 || 7;
        targetDate = new Date(now.getTime() - (daysToSubtract * 24 * 60 * 60 * 1000));
        return {
          date: targetDate,
          originalFormat: 'NaturalLanguage',
          confidence
        };
      }
    }

    // Handle "next Monday" pattern
    const nextDayMatch = value.match(/^next\s+(\w+)$/i);
    if (nextDayMatch) {
      const dayName = nextDayMatch[1].toLowerCase();
      const dayIndex = this.getDayIndex(dayName);
      if (dayIndex !== -1) {
        const daysToAdd = (dayIndex - now.getDay() + 7) % 7 || 7;
        targetDate = new Date(now.getTime() + (daysToAdd * 24 * 60 * 60 * 1000));
        return {
          date: targetDate,
          originalFormat: 'NaturalLanguage',
          confidence
        };
      }
    }

    // Handle "this Monday" pattern
    const thisDayMatch = value.match(/^this\s+(\w+)$/i);
    if (thisDayMatch) {
      const dayName = thisDayMatch[1].toLowerCase();
      const dayIndex = this.getDayIndex(dayName);
      if (dayIndex !== -1) {
        const currentDayIndex = now.getDay();
        let daysToAdd = dayIndex - currentDayIndex;
        if (daysToAdd <= 0) {
          daysToAdd += 7; // Next week
        }
        targetDate = new Date(now.getTime() + (daysToAdd * 24 * 60 * 60 * 1000));
        return {
          date: targetDate,
          originalFormat: 'NaturalLanguage',
          confidence
        };
      }
    }

    throw new Error(`DateTimeNormalizer: Unable to parse natural language date: ${value}`);
  }

  /**
   * Normalize relative time expressions like "2 hours ago"
   */
  private static normalizeRelativeTime(match: RegExpMatchArray, options: NormalizationOptions): NormalizedDateTime {
    const amount = parseInt(match[1]);
    const unit = match[2].toLowerCase() as 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

    const multipliers = {
      second: 1000,
      minute: 1000 * 60,
      hour: 1000 * 60 * 60,
      day: 1000 * 60 * 60 * 24,
      week: 1000 * 60 * 60 * 24 * 7,
      month: 1000 * 60 * 60 * 24 * 30, // Approximate
      year: 1000 * 60 * 60 * 24 * 365 // Approximate
    };

    const msAgo = amount * multipliers[unit];
    const targetDate = new Date(Date.now() - msAgo);

    return {
      date: targetDate,
      originalFormat: 'RelativeTime',
      confidence: 0.95
    };
  }

  /**
   * Get day index from day name
   */
  private static getDayIndex(dayName: string): number {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days.indexOf(dayName);
  }

  /**
   * Check if a value can be normalized
   */
  static canNormalize(value: unknown): boolean {
    try {
      this.normalize(value, { strict: true });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get supported formats description
   */
  static getSupportedFormats(): string[] {
    return [
      'ISO 8601 (2023-12-25T10:30:00Z)',
      'Unix timestamp (1703500200)',
      'Date objects',
      'Natural language (today, yesterday, last Monday)',
      'Relative time (2 hours ago)',
      'Standard date strings (December 25, 2023)'
    ];
  }
}