import { DateTimeNormalizer } from '../../../src/core/domain/search/filtering/temporal/DateTimeNormalizer';

describe('DateTimeNormalizer', () => {
  describe('normalize() - Main API', () => {
    it('should normalize Date objects', () => {
      const date = new Date('2023-12-25T10:30:00Z');
      const result = DateTimeNormalizer.normalize(date);

      expect(result).toBeDefined();
      expect(result.date).toEqual(date);
      expect(result.originalFormat).toBe('Date');
      expect(result.confidence).toBe(1.0);
      expect(result.timezone).toBe('UTC');
    });

    it('should normalize ISO date strings', () => {
      const isoString = '2023-12-25T10:30:00Z';
      const result = DateTimeNormalizer.normalize(isoString);

      expect(result).toBeDefined();
      expect(result.date).toEqual(new Date(isoString));
      expect(result.originalFormat).toBe('ISO8601');
      expect(result.confidence).toBe(1.0);
      expect(result.timezone).toBe('UTC');
    });

    it('should normalize Unix timestamps in seconds', () => {
      const timestamp = 1703500200; // 2023-12-25T10:30:00Z in seconds
      const result = DateTimeNormalizer.normalize(timestamp);

      expect(result).toBeDefined();
      expect(result.date.getTime()).toBe(timestamp * 1000);
      expect(result.originalFormat).toBe('UnixTimestamp');
      expect(result.confidence).toBe(1.0);
      expect(result.timezone).toBe('UTC');
    });

    it('should normalize natural language expressions', () => {
      const today = new Date();
      const result = DateTimeNormalizer.normalize('today');

      expect(result).toBeDefined();
      expect(result.originalFormat).toBe('NaturalLanguage');
      expect(result.confidence).toBe(0.9);

      // Should be today (or very close to today)
      const resultDate = new Date(result.date.getFullYear(), result.date.getMonth(), result.date.getDate());
      const expectedDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      expect(resultDate.getTime()).toBe(expectedDate.getTime());
    });

    it('should normalize relative time expressions', () => {
      const beforeTest = Date.now();
      const result = DateTimeNormalizer.normalize('2 hours ago');
      const afterTest = Date.now();

      expect(result).toBeDefined();
      expect(result.originalFormat).toBe('RelativeTime');
      expect(result.confidence).toBe(0.95);

      // Should be approximately 2 hours ago
      const twoHoursAgo = beforeTest - (2 * 60 * 60 * 1000);
      const twoHoursFromNow = afterTest + (2 * 60 * 60 * 1000);
      expect(result.date.getTime()).toBeGreaterThanOrEqual(twoHoursAgo);
      expect(result.date.getTime()).toBeLessThanOrEqual(twoHoursFromNow);
    });

    it('should handle invalid dates gracefully in non-strict mode', () => {
      const result = DateTimeNormalizer.normalize('invalid-date');

      expect(result).toBeDefined();
      expect(result.confidence).toBe(0.1);
      expect(result.date).toBeInstanceOf(Date);
    });

    it('should throw error for null/undefined in strict mode', () => {
      expect(() => {
        DateTimeNormalizer.normalize(null, { strict: true });
      }).toThrow('Cannot normalize null or undefined value');

      expect(() => {
        DateTimeNormalizer.normalize(undefined, { strict: true });
      }).toThrow('Cannot normalize null or undefined value');
    });
  });

  describe('ISO Date String Normalization', () => {
    it('should handle ISO strings with milliseconds', () => {
      const isoString = '2023-12-25T10:30:00.123Z';
      const result = DateTimeNormalizer.normalize(isoString);

      expect(result.originalFormat).toBe('ISO8601');
      expect(result.confidence).toBe(1.0);
      expect(result.timezone).toBe('UTC');
    });

    it('should handle ISO strings without Z suffix', () => {
      const isoString = '2023-12-25T10:30:00';
      const result = DateTimeNormalizer.normalize(isoString);

      expect(result.originalFormat).toBe('ISO8601');
      expect(result.confidence).toBe(1.0);
      expect(result.timezone).toBe('local');
    });

    it('should handle ISO strings with timezone offset', () => {
      const isoString = '2023-12-25T10:30:00+05:00';
      const result = DateTimeNormalizer.normalize(isoString);

      expect(result.originalFormat).toBe('DateString');
      expect(result.confidence).toBe(0.8);
    });
  });

  describe('Unix Timestamp Normalization', () => {
    it('should handle timestamps in seconds', () => {
      const timestamp = 1703500200; // 2023-12-25T10:30:00Z
      const result = DateTimeNormalizer.normalize(timestamp);

      expect(result.originalFormat).toBe('UnixTimestamp');
      expect(result.date.getTime()).toBe(timestamp * 1000);
    });

    it('should handle timestamps in milliseconds', () => {
      const timestamp = 1703500200123; // 2023-12-25T10:30:00.123Z
      const result = DateTimeNormalizer.normalize(timestamp);

      expect(result.originalFormat).toBe('UnixTimestampMs');
      expect(result.date.getTime()).toBe(timestamp);
    });

    it('should throw error for invalid timestamp range in strict mode', () => {
      expect(() => {
        DateTimeNormalizer.normalize(123, { strict: true });
      }).toThrow('Unable to parse timestamp: 123');
    });
  });

  describe('Natural Language Normalization', () => {
    it('should handle basic expressions', () => {
      const testCases = [
        { input: 'today', expectedConfidence: 0.9 },
        { input: 'yesterday', expectedConfidence: 0.9 },
        { input: 'tomorrow', expectedConfidence: 0.9 },
      ];

      testCases.forEach(({ input, expectedConfidence }) => {
        const result = DateTimeNormalizer.normalize(input);
        expect(result.originalFormat).toBe('NaturalLanguage');
        expect(result.confidence).toBe(expectedConfidence);
      });
    });

    it('should handle "last weekday" expressions', () => {
      const result = DateTimeNormalizer.normalize('last Monday');
      expect(result.originalFormat).toBe('NaturalLanguage');
      expect(result.confidence).toBe(0.7);
      expect(result.date).toBeInstanceOf(Date);
    });

    it('should handle "next weekday" expressions', () => {
      const result = DateTimeNormalizer.normalize('next Friday');
      expect(result.originalFormat).toBe('NaturalLanguage');
      expect(result.confidence).toBe(0.7);
      expect(result.date).toBeInstanceOf(Date);
    });

    it('should handle "this weekday" expressions', () => {
      const result = DateTimeNormalizer.normalize('this Wednesday');
      expect(result.originalFormat).toBe('NaturalLanguage');
      expect(result.confidence).toBe(0.7);
      expect(result.date).toBeInstanceOf(Date);
    });

    it('should throw error for invalid natural language in strict mode', () => {
      expect(() => {
        DateTimeNormalizer.normalize('invalid natural language', { strict: true });
      }).toThrow('Unable to parse date string: invalid natural language');
    });
  });

  describe('Relative Time Normalization', () => {
    it('should handle various time units', () => {
      const testCases = [
        '1 second ago',
        '5 minutes ago',
        '2 hours ago',
        '3 days ago',
        '1 week ago',
        '2 months ago',
        '1 year ago'
      ];

      testCases.forEach(input => {
        const result = DateTimeNormalizer.normalize(input);
        expect(result.originalFormat).toBe('RelativeTime');
        expect(result.confidence).toBe(0.95);
        expect(result.date).toBeInstanceOf(Date);
      });
    });

    it('should handle singular and plural forms', () => {
      const singularResult = DateTimeNormalizer.normalize('1 hour ago');
      const pluralResult = DateTimeNormalizer.normalize('2 hours ago');

      expect(singularResult.originalFormat).toBe('RelativeTime');
      expect(pluralResult.originalFormat).toBe('RelativeTime');
    });

    it('should handle case insensitive units', () => {
      const result = DateTimeNormalizer.normalize('2 HOURS AGO');
      expect(result.originalFormat).toBe('RelativeTime');
      expect(result.confidence).toBe(0.95);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid Date objects', () => {
      const invalidDate = new Date('invalid');
      expect(() => {
        DateTimeNormalizer.normalize(invalidDate, { strict: true });
      }).toThrow('Invalid Date object provided');
    });

    it('should handle unsupported types in strict mode', () => {
      expect(() => {
        DateTimeNormalizer.normalize({}, { strict: true });
      }).toThrow('Unsupported value type: object');
    });

    it('should return fallback result for invalid inputs in non-strict mode', () => {
      const result = DateTimeNormalizer.normalize('completely-invalid-input');
      expect(result).toBeDefined();
      expect(result.confidence).toBe(0.1);
      expect(result.date).toBeInstanceOf(Date);
    });
  });

  describe('Normalization Options', () => {
    it('should respect assumeLocalTimezone option', () => {
      const result = DateTimeNormalizer.normalize('December 25, 2023', {
        assumeLocalTimezone: true,
      });

      expect(result.timezone).toBe('local');
    });

    it('should respect defaultYear option (if applicable)', () => {
      // This would be used in internal parsing logic if needed
      const result = DateTimeNormalizer.normalize('December 25, 2023', {
        defaultYear: 2025,
      });

      expect(result).toBeDefined();
      expect(result.date).toBeInstanceOf(Date);
    });
  });

  describe('Utility Methods', () => {
    describe('canNormalize()', () => {
      it('should return true for valid inputs', () => {
        expect(DateTimeNormalizer.canNormalize('2023-12-25T10:30:00Z')).toBe(true);
        expect(DateTimeNormalizer.canNormalize(new Date())).toBe(true);
        expect(DateTimeNormalizer.canNormalize(1703500200)).toBe(true);
        expect(DateTimeNormalizer.canNormalize('today')).toBe(true);
      });

      it('should return false for invalid inputs', () => {
        expect(DateTimeNormalizer.canNormalize('invalid-date')).toBe(false);
        expect(DateTimeNormalizer.canNormalize(null)).toBe(false);
        expect(DateTimeNormalizer.canNormalize({})).toBe(false);
      });
    });

    describe('getSupportedFormats()', () => {
      it('should return array of supported format descriptions', () => {
        const formats = DateTimeNormalizer.getSupportedFormats();

        expect(Array.isArray(formats)).toBe(true);
        expect(formats.length).toBeGreaterThan(0);
        expect(formats).toContain('ISO 8601 (2023-12-25T10:30:00Z)');
        expect(formats).toContain('Unix timestamp (1703500200)');
        expect(formats).toContain('Natural language (today, yesterday, last Monday)');
        expect(formats).toContain('Relative time (2 hours ago)');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      const result = DateTimeNormalizer.normalize('');
      expect(result.confidence).toBe(0.1); // Fallback behavior
    });

    it('should handle whitespace-only strings', () => {
      const result = DateTimeNormalizer.normalize('   ');
      expect(result.confidence).toBe(0.1); // Fallback behavior
    });

    it('should handle very large timestamps', () => {
      const largeTimestamp = 2147483647000; // Large millisecond timestamp
      const result = DateTimeNormalizer.normalize(largeTimestamp);
      expect(result.originalFormat).toBe('UnixTimestampMs');
    });

    it('should handle very small timestamps', () => {
      const smallTimestamp = 1000000; // Small timestamp that doesn't fit ranges
      const result = DateTimeNormalizer.normalize(smallTimestamp);
      expect(result.confidence).toBe(0.1); // Should fallback to current time
    });
  });
});