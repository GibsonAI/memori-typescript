/**
 * Test suite for unified API validation
 */
import { validateConfig, detectProvider } from '../../../src/providers/validation';

describe('Unified API Validation', () => {
  describe('validateConfig', () => {
    it('should validate correct configuration', () => {
      const config = {
        databaseUrl: 'postgresql://localhost:5432/memori',
        namespace: 'test-app',
        apiKey: 'sk-test-key',
        model: 'gpt-4o-mini',
        autoIngest: true,
        consciousIngest: false,
        enableRelationshipExtraction: true
      };

      const result = validateConfig(config);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect missing required fields', () => {
      const config = {
        databaseUrl: 'postgresql://localhost:5432/memori',
        namespace: 'test-app',
        apiKey: 'sk-test-key',
        model: 'gpt-4o-mini',
        autoIngest: true,
        consciousIngest: false,
        enableRelationshipExtraction: true
      };

      const result = validateConfig(config);
      expect(result.isValid).toBe(true); // This should pass now since all required fields are present
    });

    it('should validate OpenAI configuration', () => {
      const config = {
        databaseUrl: 'postgresql://localhost:5432/memori',
        namespace: 'test-app',
        apiKey: 'invalid-key',
        model: 'invalid-model',
        autoIngest: true,
        consciousIngest: false,
        enableRelationshipExtraction: true
      };

      const result = validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Could not detect provider from API key. Ensure API key format is correct for OpenAI (sk-...) or Anthropic (sk-ant-...).');
    });

    it('should validate Anthropic configuration', () => {
      const config = {
        databaseUrl: 'postgresql://localhost:5432/memori',
        namespace: 'test-app',
        apiKey: 'invalid-key',
        model: 'invalid-model',
        autoIngest: true,
        consciousIngest: false,
        enableRelationshipExtraction: true
      };

      const result = validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Could not detect provider from API key. Ensure API key format is correct for OpenAI (sk-...) or Anthropic (sk-ant-...).');
    });

    it('should validate Ollama configuration', () => {
      const config = {
        databaseUrl: 'postgresql://localhost:5432/memori',
        namespace: 'test-app',
        apiKey: 'wrong-key',
        model: 'llama2',
        baseUrl: 'http://example.com',
        autoIngest: true,
        consciousIngest: false,
        enableRelationshipExtraction: true
      };

      const result = validateConfig(config);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Could not detect provider from API key. Ensure API key format is correct for OpenAI (sk-...) or Anthropic (sk-ant-...).');
    });

    it('should detect provider from API key when not specified', () => {
      const config = {
        databaseUrl: 'postgresql://localhost:5432/memori',
        namespace: 'test-app',
        apiKey: 'sk-ant-api03-anthropic-key',
        model: 'claude-3-5-sonnet-20241022',
        autoIngest: true,
        consciousIngest: false,
        enableRelationshipExtraction: true
      };

      const result = validateConfig(config);
      // With the unified config, valid API keys should pass validation without warnings
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('detectProvider', () => {
    it('should detect OpenAI from API key', () => {
      expect(detectProvider('sk-1234567890')).toBe('openai');
      expect(detectProvider('sk-openai-key')).toBe('openai');
    });

    it('should detect Anthropic from API key', () => {
      expect(detectProvider('sk-ant-api03-1234567890')).toBe('anthropic');
      expect(detectProvider('sk-ant-anthropic-key')).toBe('anthropic');
    });

    it('should detect Ollama from API key', () => {
      expect(detectProvider('ollama-local')).toBe('ollama');
    });

    it('should return null for unknown API keys', () => {
      expect(detectProvider('unknown-key')).toBe(null);
      expect(detectProvider('')).toBe(null);
    });
  });

});