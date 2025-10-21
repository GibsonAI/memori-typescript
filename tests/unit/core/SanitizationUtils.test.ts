/**
 * Tests for SanitizationUtils - Clean Test Suite
 * Focused test suite that properly validates the sanitization implementation
 */

import { z } from 'zod';
import {
  sanitizeString,
  sanitizeApiKey,
  sanitizeNamespace,
  sanitizeSearchQuery,
  sanitizeJsonInput,
  sanitizeFilePath,
  sanitizeObject,
  sanitizeEnvironmentVariable,
  containsDangerousPatterns,
  generateSecurityHash,
  SanitizationError,
  ValidationError,
  SANITIZATION_LIMITS,
  DANGEROUS_PATTERNS,
} from '../../../src/core/infrastructure/config/SanitizationUtils';

describe('SanitizationUtils', () => {
  describe('sanitizeString', () => {
    it('should sanitize normal strings correctly', () => {
      const input = 'Hello, World!';
      const result = sanitizeString(input);
      expect(result).toBe(input);
    });

    it('should remove null bytes and control characters', () => {
      const input = 'Hello\x00\x01\x1fWorld';
      const result = sanitizeString(input);
      expect(result).toBe('HelloWorld');
    });

    it('should remove dangerous SQL patterns', () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "admin'/*",
        "' UNION SELECT * FROM users --",
      ];

      maliciousInputs.forEach(input => {
        const result = sanitizeString(input);
        expect(result).not.toContain('DROP');
        expect(result).not.toContain('TABLE');
        expect(result.length).toBeLessThan(input.length);
      });
    });

    it('should remove XSS patterns when HTML is not allowed', () => {
      const input = '<script>alert("xss")</script>';
      const result = sanitizeString(input, { allowHtml: false });
      expect(result).not.toContain('<script>');
      expect(result).toContain('<'); // Should contain HTML entities
    });

    it('should preserve HTML when explicitly allowed', () => {
      const input = '<p>Hello <strong>World</strong></p>';
      const result = sanitizeString(input, { allowHtml: true });
      expect(result).toBe(input);
    });

    it('should handle newlines correctly', () => {
      const input = 'Line 1\nLine 2\r\nLine 3';
      const resultNoNewlines = sanitizeString(input, { allowNewlines: false });
      const resultWithNewlines = sanitizeString(input, { allowNewlines: true });

      expect(resultNoNewlines).toBe('Line 1 Line 2 Line 3');
      expect(resultWithNewlines).toBe(input);
    });

    it('should enforce maximum length limits', () => {
      const longInput = 'a'.repeat(SANITIZATION_LIMITS.STRING_MAX_LENGTH + 1);
      expect(() => sanitizeString(longInput)).toThrow(ValidationError);
    });

    it('should throw error for non-string input', () => {
      expect(() => sanitizeString(123 as any)).toThrow(ValidationError);
      expect(() => sanitizeString(null as any)).toThrow(ValidationError);
      expect(() => sanitizeString(undefined as any)).toThrow(ValidationError);
    });

    it('should handle dangerous content safely', () => {
      const input = '<script>alert("test")</script>';
      const result = sanitizeString(input, { allowHtml: false });
      expect(result).toContain('<'); // Should be HTML encoded
      expect(result).not.toContain('<script>');
    });
  });

  describe('sanitizeApiKey', () => {
    it('should accept valid API key formats', () => {
      const validKeys = [
        'sk-1234567890123456789012345678901234567890',
        'xai-abcdef1234567890',
        'ollama-local-12345',
        'A1B2C3D4E5F678901234567890',
      ];

      validKeys.forEach(key => {
        const result = sanitizeApiKey(key);
        expect(result).toBe(key.replace(/[^\w-]/g, ''));
      });
    });

    it('should reject invalid API key formats', () => {
      const invalidKeys = [
        'short',
        'invalid@key',
        'key with spaces',
        'key<script>alert("xss")</script>',
      ];

      invalidKeys.forEach(key => {
        expect(() => sanitizeApiKey(key)).toThrow(ValidationError);
      });
    });

  });

  describe('sanitizeNamespace', () => {
    it('should accept valid namespace names', () => {
      const validNamespaces = [
        'default',
        'my_namespace',
        'test-123',
        'alpha123',
      ];

      validNamespaces.forEach(namespace => {
        const result = sanitizeNamespace(namespace);
        expect(result).toBe(namespace.toLowerCase());
      });
    });

    it('should reject invalid namespace names', () => {
      const invalidNamespaces = [
        'invalid namespace',
        'invalid@namespace',
        'invalid/namespace',
        'system', // reserved
        'admin',  // reserved
        'root',   // reserved
      ];

      invalidNamespaces.forEach(namespace => {
        expect(() => sanitizeNamespace(namespace)).toThrow(ValidationError);
      });
    });

    it('should enforce maximum length', () => {
      const longNamespace = 'a'.repeat(SANITIZATION_LIMITS.NAMESPACE_MAX_LENGTH + 1);
      expect(() => sanitizeNamespace(longNamespace)).toThrow(ValidationError);
    });
  });

  describe('sanitizeSearchQuery', () => {
    it('should sanitize normal search queries', () => {
      const input = 'hello world test';
      const result = sanitizeSearchQuery(input);
      expect(result).toBe(input);
    });

    it('should remove dangerous SQL patterns from search queries', () => {
      const maliciousQueries = [
        "test'; DROP TABLE memories; --",
        "test' OR '1'='1",
        "test UNION SELECT * FROM memories",
      ];

      maliciousQueries.forEach(query => {
        const result = sanitizeSearchQuery(query);
        expect(result).not.toContain('DROP');
        expect(result).not.toContain('SELECT');
        expect(result).not.toContain('UNION');
      });
    });

    it('should handle wildcards correctly', () => {
      const queryWithWildcards = 'test*query%';
      const result = sanitizeSearchQuery(queryWithWildcards, { allowWildcards: true });
      expect(result).toBe('test*query\\%'); // Should escape SQL wildcards
    });

    it('should remove wildcards when not allowed', () => {
      const queryWithWildcards = 'test*query%';
      const result = sanitizeSearchQuery(queryWithWildcards, { allowWildcards: false });
      expect(result).toBe('testquery');
    });

    it('should enforce maximum length', () => {
      const longQuery = 'a'.repeat(SANITIZATION_LIMITS.SEARCH_QUERY_MAX_LENGTH + 1);
      expect(() => sanitizeSearchQuery(longQuery)).toThrow(ValidationError);
    });
  });

  describe('sanitizeJsonInput', () => {
    it('should parse valid JSON correctly', () => {
      const jsonString = '{"key": "value", "number": 123}';
      const result = sanitizeJsonInput(jsonString);
      expect(result).toEqual({ key: 'value', number: 123 });
    });

    it('should validate JSON with schema', () => {
      const jsonString = '{"name": "test", "age": 25}';
      const schema = z.object({
        name: z.string(),
        age: z.number()
      });

      const result = sanitizeJsonInput(jsonString, { schema });
      expect(result).toEqual({ name: 'test', age: 25 });
    });

    it('should reject invalid JSON', () => {
      const invalidJson = '{"key": "value",}';
      expect(() => sanitizeJsonInput(invalidJson)).toThrow(ValidationError);
    });

    it('should reject oversized JSON', () => {
      const largeJson = JSON.stringify({ data: 'a'.repeat(SANITIZATION_LIMITS.JSON_INPUT_MAX_LENGTH) });
      expect(() => sanitizeJsonInput(largeJson)).toThrow(ValidationError);
    });

    it('should reject non-string input', () => {
      expect(() => sanitizeJsonInput(123 as any)).toThrow(ValidationError);
    });
  });

  describe('sanitizeFilePath', () => {
    it('should sanitize normal file paths', () => {
      const input = '/path/to/file.txt';
      const result = sanitizeFilePath(input, { allowAbsolute: true });
      expect(result).toBe('path/to/file.txt');
    });

    it('should prevent directory traversal attacks', () => {
      const maliciousPaths = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      ];

      maliciousPaths.forEach(path => {
        const result = sanitizeFilePath(path);
        expect(result).not.toContain('..');
        expect(result).not.toContain('%2e');
        expect(result.length).toBeLessThan(path.length);
      });
    });

    it('should reject absolute paths when not allowed', () => {
      const absolutePath = '/etc/passwd';
      expect(() => sanitizeFilePath(absolutePath, { allowAbsolute: false })).toThrow(ValidationError);
    });

    it('should validate file extensions when restrictions provided', () => {
      const filePath = '/path/to/script.exe';
      expect(() => sanitizeFilePath(filePath, { allowedExtensions: ['txt', 'md'] })).toThrow(ValidationError);
    });

    it('should accept allowed file extensions', () => {
      const filePath = 'path/to/document.txt';
      const result = sanitizeFilePath(filePath, { allowedExtensions: ['txt', 'md'] });
      expect(result).toBe('path/to/document.txt');
    });
  });

  describe('sanitizeObject', () => {
    it('should sanitize object properties according to rules', () => {
      const input = {
        name: 'test',
        namespace: 'my_namespace',
        query: 'search query',
        apiKey: 'sk-1234567890123456789012345678901234567890',
      };

      const rules = {
        name: { type: 'string' as const },
        namespace: { type: 'namespace' as const },
        query: { type: 'searchQuery' as const },
        apiKey: { type: 'apiKey' as const },
      };

      const result = sanitizeObject(input, rules);
      expect(result.name).toBe('test');
      expect(result.namespace).toBe('my_namespace');
      expect(result.query).toBe('search query');
      expect(result.apiKey).toBe('sk-1234567890123456789012345678901234567890');
    });

    it('should skip fields not in sanitization rules', () => {
      const input = {
        name: 'test',
        untracked: 'value',
      };

      const rules = {
        name: { type: 'string' as const },
      };

      const result = sanitizeObject(input, rules);
      expect(result.name).toBe('test');
      expect(result.untracked).toBe('value');
    });

    it('should handle null and undefined values', () => {
      const input = {
        name: 'test',
        empty: null,
        missing: undefined,
      };

      const rules = {
        name: { type: 'string' as const },
        empty: { type: 'string' as const },
        missing: { type: 'string' as const },
      };

      const result = sanitizeObject(input, rules);
      expect(result.name).toBe('test');
      expect(result.empty).toBeNull();
      expect(result.missing).toBeUndefined();
    });
  });

  describe('sanitizeEnvironmentVariable', () => {
    it('should sanitize string environment variables', () => {
      const result = sanitizeEnvironmentVariable('TEST_VAR', 'hello world', 'string');
      expect(result).toBe('hello world');
    });

    it('should parse boolean environment variables', () => {
      expect(sanitizeEnvironmentVariable('BOOL_TRUE', 'true', 'boolean')).toBe(true);
      expect(sanitizeEnvironmentVariable('BOOL_FALSE', 'false', 'boolean')).toBe(false);
      expect(sanitizeEnvironmentVariable('BOOL_1', '1', 'boolean')).toBe(true);
      expect(sanitizeEnvironmentVariable('BOOL_0', '0', 'boolean')).toBe(false);
    });

    it('should parse number environment variables', () => {
      const result = sanitizeEnvironmentVariable('NUM_VAR', '123', 'number');
      expect(result).toBe(123);
    });

    it('should validate URL environment variables', () => {
      const validUrl = sanitizeEnvironmentVariable('URL_VAR', 'https://example.com', 'url');
      expect(validUrl).toBe('https://example.com');
    });

    it('should reject invalid environment variable values', () => {
      expect(() => sanitizeEnvironmentVariable('NUM_VAR', 'not_a_number', 'number')).toThrow(ValidationError);
      expect(() => sanitizeEnvironmentVariable('BOOL_VAR', 'maybe', 'boolean')).toThrow(ValidationError);
      expect(() => sanitizeEnvironmentVariable('URL_VAR', 'not_a_url', 'url')).toThrow(ValidationError);
    });
  });

  describe('containsDangerousPatterns', () => {
    it('should detect SQL injection patterns', () => {
      const sqlInjection = "'; DROP TABLE users; --";
      const result = containsDangerousPatterns(sqlInjection);
      expect(result.hasSQLInjection).toBe(true);
    });

    it('should detect XSS patterns', () => {
      const xss = '<script>alert("xss")</script>';
      const result = containsDangerousPatterns(xss);
      expect(result.hasXSS).toBe(true);
    });

    it('should detect path traversal patterns', () => {
      const pathTraversal = '../../../etc/passwd';
      const result = containsDangerousPatterns(pathTraversal);
      expect(result.hasPathTraversal).toBe(true);
    });

    it('should detect command injection patterns', () => {
      const commandInjection = 'test; rm -rf /';
      const result = containsDangerousPatterns(commandInjection);
      expect(result.hasCommandInjection).toBe(true);
    });

    it('should return false for safe input', () => {
      const safeInput = 'hello world';
      const result = containsDangerousPatterns(safeInput);
      expect(result.hasSQLInjection).toBe(false);
      expect(result.hasXSS).toBe(false);
      expect(result.hasPathTraversal).toBe(false);
      expect(result.hasCommandInjection).toBe(false);
    });

    describe('parentheses handling', () => {
      it('should NOT flag legitimate text with parentheses as dangerous', () => {
        const legitimateTexts = [
          'Blockchain consensus mechanisms ensure all nodes agree on the network state. Popular mechanisms include Proof of Work (Bitcoin mining), Proof of Stake (validator selection by stake), and Delegated Proof of Stake (community voting).',
          'JavaScript functions can be called with parameters (e.g., myFunction(arg1, arg2))',
          'Regular expressions use parentheses for grouping (pattern matching)',
          'Mathematical formulas often use parentheses like (a + b) * c',
          'File paths like /usr/local/bin (read-only directory)',
          'Function definitions: def calculate_total(items):',
          'Object properties: user.profile (read-only)',
          'Version numbers: Python 3.9 (released 2020)',
        ];

        legitimateTexts.forEach(text => {
          const result = containsDangerousPatterns(text);
          expect(result.hasSQLInjection).toBe(false);
          expect(result.hasXSS).toBe(false);
          expect(result.hasPathTraversal).toBe(false);
          expect(result.hasCommandInjection).toBe(false);
        });
      });

      it('should still detect actual command injection with parentheses', () => {
        const dangerousTexts = [
          '$(rm -rf /)',  // Variable substitution with parentheses
          '`rm -rf /`',   // Command substitution with parentheses
          '${USER} & malicious_command', // Variable pattern with command separator
          'input; DROP TABLE users;', // SQL injection with semicolon
          'command; (nested_command)', // Command with nested parentheses (semicolon makes it dangerous)
        ];

        dangerousTexts.forEach(text => {
          const result = containsDangerousPatterns(text);
          // At least one dangerous category should be flagged
          expect(
            result.hasSQLInjection ||
            result.hasXSS ||
            result.hasPathTraversal ||
            result.hasCommandInjection
          ).toBe(true);
        });
      });

      it('should handle mixed legitimate and dangerous content', () => {
        const mixedContent = 'Function call: process_data(items, options) | cat /etc/passwd';
        const result = containsDangerousPatterns(mixedContent);
        expect(result.hasCommandInjection).toBe(true); // Should catch the pipe
      });
    });
  });

  describe('generateSecurityHash', () => {
    it('should generate consistent hashes for same input', () => {
      const input = 'test input';
      const hash1 = generateSecurityHash(input);
      const hash2 = generateSecurityHash(input);
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different input', () => {
      const input1 = 'test input 1';
      const input2 = 'test input 2';
      const hash1 = generateSecurityHash(input1);
      const hash2 = generateSecurityHash(input2);
      expect(hash1).not.toBe(hash2);
    });

    it('should generate valid hash format', () => {
      const input = 'test';
      const hash = generateSecurityHash(input);
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });
  });

  describe('Error Handling', () => {
    it('should handle dangerous content safely', () => {
      const dangerousInput = '<script>alert("xss")</script>';
      const result = sanitizeString(dangerousInput, { allowHtml: false });
      expect(result).toContain('<');
      expect(result).not.toContain('<script>');
    });

    it('should throw ValidationError for invalid input types', () => {
      expect(() => sanitizeString(123 as any)).toThrow(ValidationError);
      expect(() => sanitizeNamespace(123 as any)).toThrow(ValidationError);
    });

    it('should preserve error context in error messages', () => {
      try {
        sanitizeString('   '); // Whitespace that becomes empty
        fail('Should have thrown error for empty input');
      } catch (error) {
        expect(error).toBeInstanceOf(SanitizationError);
        expect((error as SanitizationError).field).toBe('string');
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings', () => {
      const result = sanitizeString('');
      expect(result).toBe('');
    });

    it('should handle unicode characters safely', () => {
      const unicodeInput = 'Hello 世界 🌍 café naïve';
      const result = sanitizeString(unicodeInput);
      expect(result).toBe(unicodeInput);
    });

    it('should handle very long inputs gracefully', () => {
      const longInput = 'a'.repeat(SANITIZATION_LIMITS.STRING_MAX_LENGTH);
      const result = sanitizeString(longInput);
      expect(result).toBe(longInput);

      const tooLongInput = 'a'.repeat(SANITIZATION_LIMITS.STRING_MAX_LENGTH + 1);
      expect(() => sanitizeString(tooLongInput)).toThrow(ValidationError);
    });
  });

  describe('Performance', () => {

    it('should handle multiple sanitization operations efficiently', () => {
      const inputs = Array(1000).fill('test input with <script>alert("xss")</script>');

      const startTime = Date.now();
      const results = inputs.map(input => sanitizeString(input, { allowHtml: false }));
      const endTime = Date.now();

      expect(results).toHaveLength(1000);
      expect(results.every(result => !result.includes('<script>'))).toBe(true);
      expect(endTime - startTime).toBeLessThan(2000);
    });
  });

  describe('Integration', () => {
    it('should work correctly with ConfigManager patterns', () => {
      const configInput = {
        namespace: 'my_namespace',
        model: 'gpt-4o-mini',
        apiKey: 'sk-1234567890123456789012345678901234567890',
      };

      const sanitized = sanitizeObject(configInput, {
        namespace: { type: 'namespace' },
        model: { type: 'string' },
        apiKey: { type: 'apiKey' },
      });

      expect(sanitized.namespace).toBe('my_namespace');
      expect(sanitized.model).toBe('gpt-4o-mini');
      expect(sanitized.apiKey).toBe('sk-1234567890123456789012345678901234567890');
    });

    it('should work correctly with search query patterns', () => {
      const searchInput = {
        text: 'search query',
        filterExpression: 'category = "test"',
      };

      const sanitized = sanitizeObject(searchInput, {
        text: { type: 'searchQuery' },
        filterExpression: { type: 'string' },
      });

      expect(sanitized.text).toBe('search query');
      expect(sanitized.filterExpression).toBe('category = "test"');
    });
  });
});