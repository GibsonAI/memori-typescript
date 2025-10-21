import { z } from 'zod';
import {
  sanitizeString,
  sanitizeApiKey,
  sanitizeNamespace,
  sanitizeEnvironmentVariable,
  SanitizationError,
  ValidationError
} from './SanitizationUtils';

export const MemoriConfigSchema = z.object({
  databaseUrl: z.string().default('file:./memori.db'),
  namespace: z.string().default('default'),
  consciousIngest: z.boolean().default(false),
  autoIngest: z.boolean().default(false),
  enableRelationshipExtraction: z.boolean().default(true),
  model: z.string().default('gpt-4o-mini'),
  apiKey: z.string(),
  baseUrl: z.string().optional(),
  userContext: z.object({
    userPreferences: z.array(z.string()).optional(),
    currentProjects: z.array(z.string()).optional(),
    relevantSkills: z.array(z.string()).optional(),
  }).optional(),
});

export type MemoriConfig = z.infer<typeof MemoriConfigSchema>;

export class ConfigManager {
  static loadConfig(): MemoriConfig {
    try {
      // Sanitize and validate all environment variables
      const databaseUrl = sanitizeEnvironmentVariable(
        'DATABASE_URL',
        process.env.DATABASE_URL || 'file:./memori.db',
        'string'
      ) as string;

      const namespace = sanitizeNamespace(
        process.env.MEMORI_NAMESPACE || 'default',
        { fieldName: 'MEMORI_NAMESPACE' }
      );

      const consciousIngest = sanitizeEnvironmentVariable(
        'MEMORI_CONSCIOUS_INGEST',
        process.env.MEMORI_CONSCIOUS_INGEST || 'false',
        'boolean'
      ) as boolean;

      const autoIngest = sanitizeEnvironmentVariable(
        'MEMORI_AUTO_INGEST',
        process.env.MEMORI_AUTO_INGEST || 'false',
        'boolean'
      ) as boolean;

      const enableRelationshipExtraction = sanitizeEnvironmentVariable(
        'MEMORI_ENABLE_RELATIONSHIP_EXTRACTION',
        process.env.MEMORI_ENABLE_RELATIONSHIP_EXTRACTION || 'true',
        'boolean'
      ) as boolean;

      const model = sanitizeString(
        process.env.MEMORI_MODEL || 'gpt-4o-mini',
        {
          fieldName: 'MEMORI_MODEL',
          maxLength: 100,
          allowNewlines: false
        }
      );

      // Handle API key with special validation
      let apiKey = process.env.OPENAI_API_KEY || '';
      if (apiKey && apiKey !== 'your-openai-api-key-here') {
        apiKey = sanitizeApiKey(apiKey, { fieldName: 'OPENAI_API_KEY' });
      }

      const baseUrl = process.env.OPENAI_BASE_URL ?
        sanitizeEnvironmentVariable(
          'OPENAI_BASE_URL',
          process.env.OPENAI_BASE_URL,
          'url'
        ) as string : undefined;

      const configData: any = {
        databaseUrl,
        namespace,
        consciousIngest,
        autoIngest,
        enableRelationshipExtraction,
        model,
        apiKey,
        baseUrl,
      };

      // Enhanced validation for API key requirements
      if (!apiKey || apiKey === 'your-openai-api-key-here') {
        // For Ollama, we don't need a real API key, but we should have a baseUrl
        if (!baseUrl) {
          throw new ValidationError(
            'Either provide a valid OPENAI_API_KEY or set OPENAI_BASE_URL for Ollama',
            'apiKey',
            apiKey,
            'api_key_validation'
          );
        }
        // Set a dummy API key for Ollama
        configData.apiKey = 'ollama-local';
      }

      // Validate the complete configuration
      return MemoriConfigSchema.parse(configData);

    } catch (error) {
      if (error instanceof SanitizationError || error instanceof ValidationError) {
        throw error;
      }

      // Wrap unexpected errors
      throw new Error(`Configuration loading failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Validate and sanitize configuration input
   */
  static sanitizeConfigInput(input: Partial<MemoriConfig>): Partial<MemoriConfig> {
    try {
      const sanitized: any = {};

      if (input.databaseUrl !== undefined) {
        sanitized.databaseUrl = sanitizeString(input.databaseUrl, {
          fieldName: 'databaseUrl',
          maxLength: 500,
          allowNewlines: false
        });
      }

      if (input.namespace !== undefined) {
        sanitized.namespace = sanitizeNamespace(input.namespace, {
          fieldName: 'namespace'
        });
      }

      if (input.model !== undefined) {
        sanitized.model = sanitizeString(input.model, {
          fieldName: 'model',
          maxLength: 100,
          allowNewlines: false
        });
      }

      if (input.apiKey !== undefined) {
        sanitized.apiKey = input.apiKey ?
          sanitizeApiKey(input.apiKey, { fieldName: 'apiKey' }) : '';
      }

      if (input.baseUrl !== undefined) {
        sanitized.baseUrl = input.baseUrl ?
          sanitizeString(input.baseUrl, {
            fieldName: 'baseUrl',
            maxLength: 500,
            allowNewlines: false
          }) : undefined;
      }

      // Handle nested userContext
      if (input.userContext !== undefined) {
        sanitized.userContext = {};

        if (input.userContext.userPreferences !== undefined) {
          sanitized.userContext.userPreferences = Array.isArray(input.userContext.userPreferences) ?
            input.userContext.userPreferences.map(pref =>
              sanitizeString(pref, {
                fieldName: 'userPreferences',
                maxLength: 200,
                allowNewlines: false
              })
            ) : undefined;
        }

        if (input.userContext.currentProjects !== undefined) {
          sanitized.userContext.currentProjects = Array.isArray(input.userContext.currentProjects) ?
            input.userContext.currentProjects.map(project =>
              sanitizeString(project, {
                fieldName: 'currentProjects',
                maxLength: 200,
                allowNewlines: false
              })
            ) : undefined;
        }

        if (input.userContext.relevantSkills !== undefined) {
          sanitized.userContext.relevantSkills = Array.isArray(input.userContext.relevantSkills) ?
            input.userContext.relevantSkills.map(skill =>
              sanitizeString(skill, {
                fieldName: 'relevantSkills',
                maxLength: 200,
                allowNewlines: false
              })
            ) : undefined;
        }
      }

      return sanitized;
    } catch (error) {
      if (error instanceof SanitizationError || error instanceof ValidationError) {
        throw error;
      }

      throw new Error(`Configuration sanitization failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}