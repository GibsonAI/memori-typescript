/**
 * SanitizationUtils - Centralized input sanitization utilities for memori-ts
 *
 * This module provides comprehensive input sanitization to prevent injection attacks
 * and ensure safe handling of user inputs throughout the system.
 */

import { createHash } from 'crypto';
import { z } from 'zod';

// ===== CONSTANTS =====

/**
 * Maximum allowed lengths for different input types
 */
export const SANITIZATION_LIMITS = {
  STRING_MAX_LENGTH: 10000,
  SEARCH_QUERY_MAX_LENGTH: 1000,
  NAMESPACE_MAX_LENGTH: 100,
  API_KEY_MAX_LENGTH: 200,
  FILE_PATH_MAX_LENGTH: 500,
  JSON_INPUT_MAX_LENGTH: 100000,
  IDENTIFIER_MAX_LENGTH: 50,
  DESCRIPTION_MAX_LENGTH: 2000,
} as const;

/**
 * Allowed characters for different input types
 */
export const ALLOWED_CHARSETS = {
  ALPHANUMERIC: /^[a-zA-Z0-9]+$/,
  ALPHANUMERIC_EXTENDED: /^[a-zA-Z0-9_-]+$/,
  NAMESPACE: /^[a-zA-Z0-9_-]+$/,
  PRINTABLE_ASCII: /^[\x20-\x7E]*$/,
  SAFE_FILENAME: /^[a-zA-Z0-9._-]+$/,
} as const;

/**
 * Dangerous patterns that should be rejected
 */
export const DANGEROUS_PATTERNS = {
  SQL_INJECTION: [
    /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION|SCRIPT)\b)/i,
    /(--|#|\/\*|\*\/)/,
    /(\bor\b\s+\d+\s*=\s*\d+)/i,
    /('|(\\')|(;)|(\|\|))/,
    /(\bINTO\b\s+\w+\s*\()/i,
  ],
  XSS_PATTERNS: [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /<iframe\b[^>]*>/gi,
    /<object\b[^>]*>/gi,
    /<embed\b[^>]*>/gi,
  ],
  PATH_TRAVERSAL: [
    /\.\.\//g,
    /\.\.\\\\/g,
    /%2e%2e/gi,
    /%252e/gi,
  ],
  COMMAND_INJECTION: [
    /[;&|`$]/g,  // Remove command separators and dangerous chars, but not parentheses
    /\$\{.*\}/g,  // Variable substitution patterns
    /`.*`/g,      // Command substitution
    // Context-aware patterns for parentheses (only flag if they look like command injection)
    /(\$[(\w]+|\w+\s*\([^)]*\)\s*[;&|])/g,  // $VAR( or command(args);&
    /(\||&|;)\s*\(/g,  // Command separators followed by parentheses
  ],
} as const;

// ===== ERROR TYPES =====

/**
 * Sanitization error types
 */
export class SanitizationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: string,
    public readonly rule: string
  ) {
    super(`${field}: ${message} (value: ${value.substring(0, 50)}${value.length > 50 ? '...' : ''})`);
    this.name = 'SanitizationError';
  }
}

export class ValidationError extends Error {
  constructor(
    message: string,
    public readonly field: string,
    public readonly value: unknown,
    public readonly validationRule: string
  ) {
    super(`${field}: ${message}`);
    this.name = 'ValidationError';
  }
}

// ===== CORE SANITIZATION FUNCTIONS =====

/**
 * Sanitize a general string input
 * Removes potentially harmful characters and validates length
 */
export function sanitizeString(
  input: string,
  options: {
    maxLength?: number;
    allowHtml?: boolean;
    allowNewlines?: boolean;
    fieldName?: string;
  } = {}
): string {
  const {
    maxLength = SANITIZATION_LIMITS.STRING_MAX_LENGTH,
    allowHtml = false,
    allowNewlines = true,
    fieldName = 'string',
  } = options;

  // Input validation
  if (typeof input !== 'string') {
    throw new ValidationError(
      'Input must be a string',
      fieldName,
      input,
      'type_check'
    );
  }

  // Check length
  if (input.length > maxLength) {
    throw new ValidationError(
      `Input exceeds maximum length of ${maxLength} characters`,
      fieldName,
      input,
      'length_check'
    );
  }

  let sanitized = input;

  // Remove null bytes and other control characters
  sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

  // Remove dangerous SQL patterns
  DANGEROUS_PATTERNS.SQL_INJECTION.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });

  // Additional SQL injection patterns - more targeted removal
  sanitized = sanitized.replace(/(\bor\b\s+\d+\s*=\s*\d+)/gi, '');
  sanitized = sanitized.replace(/(\bUNION\b\s+\bSELECT\b)/gi, '');
  sanitized = sanitized.replace(/(\bINTO\b\s+\w+\s*\()/gi, '');
  sanitized = sanitized.replace(/(\bVALUES\b\s*\()/gi, '');
  sanitized = sanitized.replace(/(\bTABLE\b)/gi, ''); // Remove TABLE keyword

  // Remove XSS patterns unless HTML is explicitly allowed
  if (!allowHtml) {
    // Remove dangerous script patterns
    DANGEROUS_PATTERNS.XSS_PATTERNS.forEach(pattern => {
      sanitized = sanitized.replace(pattern, '');
    });

    // Additional XSS patterns - remove dangerous elements
    sanitized = sanitized.replace(/javascript\s*:/gi, '');
    sanitized = sanitized.replace(/on\w+\s*=/gi, '');
    sanitized = sanitized.replace(/<iframe[^>]*>/gi, '');
    sanitized = sanitized.replace(/<object[^>]*>/gi, '');
    sanitized = sanitized.replace(/<embed[^>]*>/gi, '');
    sanitized = sanitized.replace(/<form[^>]*>/gi, '');

    // Escape remaining HTML entities for safety
    sanitized = sanitized.replace(/</g, '<').replace(/>/g, '>');
  }

  // Handle newlines
  if (!allowNewlines) {
    sanitized = sanitized.replace(/[\r\n]+/g, ' ');
  }

  // Trim whitespace
  sanitized = sanitized.trim();

  // Final validation
  if (sanitized.length === 0 && input.length > 0) {
    throw new SanitizationError(
      'Input became empty after sanitization',
      fieldName,
      input,
      'content_validation'
    );
  }

  return sanitized;
}

/**
 * Sanitize API key format
 * Validates and cleans API key format
 */
export function sanitizeApiKey(
  input: string,
  options: { fieldName?: string } = {}
): string {
  const { fieldName = 'apiKey' } = options;

  // Basic format validation for common API key patterns
  const apiKeyPatterns = [
    /^[A-Za-z0-9_.<>-]{8,}$/, // More flexible pattern for various key formats
    /^sk-[A-Za-z0-9_-]{8,}$/, // OpenAI-style keys
    /^xai-[A-Za-z0-9_-]{8,}$/, // xAI keys
    /^ollama-[A-Za-z0-9_-]{3,}$/, // Ollama keys
    /^[A-Za-z0-9]{20,}$/, // Simple alphanumeric keys
  ];

  const isValidFormat = apiKeyPatterns.some(pattern => pattern.test(input));

  if (!isValidFormat) {
    throw new ValidationError(
      'Invalid API key format',
      fieldName,
      input,
      'format_validation'
    );
  }

  // Remove any potentially harmful characters (allow more characters for compatibility)
  const sanitized = input.replace(/[^\w.<>-]/g, '');

  if (sanitized.length < 10) {
    throw new ValidationError(
      'API key too short after sanitization',
      fieldName,
      input,
      'length_validation'
    );
  }

  return sanitized;
}

/**
 * Sanitize namespace identifiers
 * Cleans namespace identifiers to prevent injection
 */
export function sanitizeNamespace(
  input: string,
  options: { fieldName?: string } = {}
): string {
  const { fieldName = 'namespace' } = options;

  // Validate basic format
  if (!ALLOWED_CHARSETS.ALPHANUMERIC_EXTENDED.test(input)) {
    throw new ValidationError(
      'Namespace must contain only alphanumeric characters, underscores, and hyphens',
      fieldName,
      input,
      'format_validation'
    );
  }

  // Check length
  if (input.length > SANITIZATION_LIMITS.NAMESPACE_MAX_LENGTH) {
    throw new ValidationError(
      `Namespace exceeds maximum length of ${SANITIZATION_LIMITS.NAMESPACE_MAX_LENGTH} characters`,
      fieldName,
      input,
      'length_validation'
    );
  }

  // Check for reserved names
  const reservedNamespaces = ['system', 'internal', 'admin', 'root', 'null', 'undefined'];
  if (typeof input === 'string') {
    if (reservedNamespaces.includes(input.toLowerCase())) {
      throw new ValidationError(
        'Namespace name is reserved',
        fieldName,
        input,
        'reserved_name'
      );
    }
    return input.toLowerCase().trim();
  }

  throw new ValidationError(
    'Namespace must be a string',
    fieldName,
    input,
    'type_check'
  );
}

/**
 * Sanitize search queries for safe database use
 */
export function sanitizeSearchQuery(
  input: string,
  options: {
    fieldName?: string;
    allowWildcards?: boolean;
    allowBoolean?: boolean;
  } = {}
): string {
  const {
    fieldName = 'searchQuery',
    allowWildcards = true,
    allowBoolean = false,
  } = options;

  // Basic sanitization
  let sanitized = sanitizeString(input, {
    maxLength: SANITIZATION_LIMITS.SEARCH_QUERY_MAX_LENGTH,
    fieldName,
    allowNewlines: false,
  });

  // Remove dangerous SQL patterns specifically for search
  const searchSpecificPatterns = [
    /(\bUNION\b|\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b)/gi,
    /(--|#)/g,
    /(\bor\b\s+\d+\s*=\s*\d+)/gi,
    /('|(\\')|(;))/g,
  ];

  searchSpecificPatterns.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });

  // Handle wildcards
  if (!allowWildcards) {
    sanitized = sanitized.replace(/[*%_]/g, '');
  } else {
    // For search queries, we want to keep wildcards but escape them for SQL
    // This is handled by the calling functions
    sanitized = sanitized.replace(/(%|_)/g, '\\$1');
  }

  // Handle boolean operators
  if (!allowBoolean) {
    sanitized = sanitized.replace(/\b(AND|OR|NOT)\b/gi, '');
  }

  // Remove extra whitespace
  sanitized = sanitized.replace(/\s+/g, ' ').trim();

  return sanitized;
}

/**
 * Safely parse and validate JSON inputs
 */
export function sanitizeJsonInput(
  input: string,
  options: {
    fieldName?: string;
    maxSize?: number;
    schema?: z.ZodSchema;
  } = {}
): any {
  const {
    fieldName = 'jsonInput',
    maxSize = SANITIZATION_LIMITS.JSON_INPUT_MAX_LENGTH,
    schema,
  } = options;

  // Basic input validation
  if (typeof input !== 'string') {
    throw new ValidationError(
      'JSON input must be a string',
      fieldName,
      input,
      'type_check'
    );
  }

  // Size check
  if (input.length > maxSize) {
    throw new ValidationError(
      `JSON input exceeds maximum size of ${maxSize} characters`,
      fieldName,
      input,
      'size_check'
    );
  }

  try {
    // Parse JSON
    const parsed = JSON.parse(input);

    // Validate with schema if provided
    if (schema) {
      const validationResult = schema.safeParse(parsed);
      if (!validationResult.success) {
        throw new ValidationError(
          `JSON validation failed: ${validationResult.error.message}`,
          fieldName,
          input,
          'schema_validation'
        );
      }
      return validationResult.data;
    }

    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ValidationError(
        'Invalid JSON format',
        fieldName,
        input,
        'json_parse'
      );
    }
    throw error;
  }
}

/**
 * Clean file paths to prevent directory traversal
 */
export function sanitizeFilePath(
  input: string,
  options: {
    fieldName?: string;
    allowAbsolute?: boolean;
    allowedExtensions?: string[];
  } = {}
): string {
  const {
    fieldName = 'filePath',
    allowAbsolute = false,
    allowedExtensions = [],
  } = options;

  // Basic input validation
  if (typeof input !== 'string') {
    throw new ValidationError(
      'File path must be a string',
      fieldName,
      input,
      'type_check'
    );
  }

  // Check length
  if (input.length > SANITIZATION_LIMITS.FILE_PATH_MAX_LENGTH) {
    throw new ValidationError(
      `File path exceeds maximum length of ${SANITIZATION_LIMITS.FILE_PATH_MAX_LENGTH} characters`,
      fieldName,
      input,
      'length_check'
    );
  }

  let sanitized = input;

  // Remove dangerous path traversal patterns
  DANGEROUS_PATTERNS.PATH_TRAVERSAL.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });

  // Additional path traversal protection
  sanitized = sanitized.replace(/\.\.[\/\\]/g, '');
  sanitized = sanitized.replace(/[\/\\]\.\.[\/\\]/g, '');

  // Remove command injection patterns
  DANGEROUS_PATTERNS.COMMAND_INJECTION.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '');
  });

  // Handle absolute paths
  if (!allowAbsolute && (sanitized.startsWith('/') || sanitized.includes(':'))) {
    throw new ValidationError(
      'Absolute paths are not allowed',
      fieldName,
      input,
      'absolute_path'
    );
  }

  // Validate file extension if restrictions provided
  if (allowedExtensions.length > 0) {
    const extension = sanitized.split('.').pop()?.toLowerCase();
    if (!extension || !allowedExtensions.includes(extension)) {
      throw new ValidationError(
        `File extension not allowed. Allowed: ${allowedExtensions.join(', ')}`,
        fieldName,
        input,
        'extension_validation'
      );
    }
  }

  // Normalize path separators
  sanitized = sanitized.replace(/[/\\]+/g, '/');

  // Remove redundant path components
  const parts = sanitized.split('/').filter(Boolean);
  const normalizedParts: string[] = [];

  for (const part of parts) {
    if (part === '.' || part === '') {
      continue;
    }
    if (part === '..' && normalizedParts.length > 0) {
      normalizedParts.pop();
    } else {
      normalizedParts.push(part);
    }
  }

  return normalizedParts.join('/');
}

// ===== BATCH SANITIZATION FUNCTIONS =====

/**
 * Sanitize multiple strings with the same options
 */
export function sanitizeStrings(
  inputs: string[],
  options: Parameters<typeof sanitizeString>[1] = {}
): string[] {
  return inputs.map(input => sanitizeString(input, options));
}

/**
 * Sanitize object properties recursively
 */
export function sanitizeObject<T extends Record<string, any>>(
  obj: T,
  sanitizationRules: {
    [K in keyof T]?: {
      type: 'string' | 'namespace' | 'searchQuery' | 'apiKey' | 'filePath' | 'json';
      options?: any;
    };
  }
): T {
  const sanitized = { ...obj } as Record<string, any>;

  for (const [key, value] of Object.entries(sanitized)) {
    const rule = sanitizationRules[key as keyof T];
    if (!rule || value == null) continue;

    try {
      switch (rule.type) {
        case 'string':
          sanitized[key] = sanitizeString(value, { fieldName: key, ...rule.options });
          break;
        case 'namespace':
          sanitized[key] = sanitizeNamespace(value, { fieldName: key, ...rule.options });
          break;
        case 'searchQuery':
          sanitized[key] = sanitizeSearchQuery(value, { fieldName: key, ...rule.options });
          break;
        case 'apiKey':
          sanitized[key] = sanitizeApiKey(value, { fieldName: key, ...rule.options });
          break;
        case 'filePath':
          sanitized[key] = sanitizeFilePath(value, { fieldName: key, ...rule.options });
          break;
        case 'json':
          sanitized[key] = sanitizeJsonInput(value, { fieldName: key, ...rule.options });
          break;
      }
    } catch (error) {
      if (error instanceof SanitizationError || error instanceof ValidationError) {
        throw error;
      }
      throw new SanitizationError(
        `Failed to sanitize field ${key}: ${error instanceof Error ? error.message : String(error)}`,
        key,
        String(value),
        'object_sanitization'
      );
    }
  }

  return sanitized as T;
}

// ===== VALIDATION HELPERS =====

/**
 * Check if input contains dangerous patterns
 */
export function containsDangerousPatterns(input: string): {
  hasSQLInjection: boolean;
  hasXSS: boolean;
  hasPathTraversal: boolean;
  hasCommandInjection: boolean;
  details?: {
    sqlMatches?: string[];
    xssMatches?: string[];
    pathTraversalMatches?: string[];
    commandInjectionMatches?: string[];
  };
} {
  const details = {
    sqlMatches: [] as string[],
    xssMatches: [] as string[],
    pathTraversalMatches: [] as string[],
    commandInjectionMatches: [] as string[],
  };

  const hasSQLInjection = DANGEROUS_PATTERNS.SQL_INJECTION.some(pattern => {
    const matches = pattern.test(input);
    if (matches) {
      details.sqlMatches.push(`Pattern: ${pattern.source}`);
    }
    return matches;
  });

  const hasXSS = DANGEROUS_PATTERNS.XSS_PATTERNS.some(pattern => {
    const matches = pattern.test(input);
    if (matches) {
      details.xssMatches.push(`Pattern: ${pattern.source}`);
    }
    return matches;
  });

  const hasPathTraversal = DANGEROUS_PATTERNS.PATH_TRAVERSAL.some(pattern => {
    const matches = pattern.test(input);
    if (matches) {
      details.pathTraversalMatches.push(`Pattern: ${pattern.source}`);
    }
    return matches;
  });

  const hasCommandInjection = DANGEROUS_PATTERNS.COMMAND_INJECTION.some(pattern => {
    const matches = pattern.test(input);
    if (matches) {
      details.commandInjectionMatches.push(`Pattern: ${pattern.source}`);
    }
    return matches;
  });

  return {
    hasSQLInjection,
    hasXSS,
    hasPathTraversal,
    hasCommandInjection,
    details: hasSQLInjection || hasXSS || hasPathTraversal || hasCommandInjection ? details : undefined,
  };
}

/**
 * Validate input against multiple security criteria
 */
export function validateSecurity(input: string, fieldName: string = 'input'): void {
  const dangers = containsDangerousPatterns(input);

  if (dangers.hasSQLInjection) {
    throw new SanitizationError(
      'SQL injection patterns detected',
      fieldName,
      input,
      'sql_injection_check'
    );
  }

  if (dangers.hasXSS) {
    throw new SanitizationError(
      'XSS patterns detected',
      fieldName,
      input,
      'xss_check'
    );
  }

  if (dangers.hasPathTraversal) {
    throw new SanitizationError(
      'Path traversal patterns detected',
      fieldName,
      input,
      'path_traversal_check'
    );
  }

  if (dangers.hasCommandInjection) {
    throw new SanitizationError(
      'Command injection patterns detected',
      fieldName,
      input,
      'command_injection_check'
    );
  }
}

/**
 * Generate security hash for input tracking
 */
export function generateSecurityHash(input: string): string {
  return createHash('sha256')
    .update(input)
    .digest('hex')
    .substring(0, 16);
}

// ===== CONFIGURATION SANITIZATION =====

/**
 * Sanitize environment variable inputs
 */
export function sanitizeEnvironmentVariable(
  key: string,
  value: string,
  type: 'string' | 'number' | 'boolean' | 'url' | 'path' = 'string'
): string | number | boolean {
  // First sanitize the key
  const sanitizedKey = sanitizeString(key, {
    fieldName: 'envKey',
    maxLength: 100,
    allowNewlines: false,
  });

  // Then sanitize the value based on type
  switch (type) {
    case 'string':
      return sanitizeString(value, {
        fieldName: `env:${sanitizedKey}`,
        maxLength: SANITIZATION_LIMITS.STRING_MAX_LENGTH,
      });

    case 'number':
      const numValue = Number(value);
      if (isNaN(numValue)) {
        throw new ValidationError(
          'Environment variable must be a valid number',
          `env:${sanitizedKey}`,
          value,
          'number_validation'
        );
      }
      return numValue;

    case 'boolean':
      if (!['true', 'false', '1', '0', ''].includes(value.toLowerCase())) {
        throw new ValidationError(
          'Environment variable must be a valid boolean',
          `env:${sanitizedKey}`,
          value,
          'boolean_validation'
        );
      }
      return value.toLowerCase() === 'true' || value === '1';

    case 'url':
      try {
        new URL(value);
        return value;
      } catch {
        throw new ValidationError(
          'Environment variable must be a valid URL',
          `env:${sanitizedKey}`,
          value,
          'url_validation'
        );
      }

    case 'path':
      return sanitizeFilePath(value, {
        fieldName: `env:${sanitizedKey}`,
        allowAbsolute: true,
      });

    default:
      throw new ValidationError(
        'Invalid environment variable type',
        `env:${sanitizedKey}`,
        type,
        'type_validation'
      );
  }
}

// ===== EXPORT UTILITIES =====

/**
 * Create a sanitization middleware for common use cases
 */
export function createSanitizationMiddleware<T extends Record<string, any>>(
  sanitizationRules: {
    [K in keyof T]?: {
      type: 'string' | 'namespace' | 'searchQuery' | 'apiKey' | 'filePath' | 'json';
      options?: any;
    };
  }
) {
  return (data: T): T => {
    try {
      return sanitizeObject(data, sanitizationRules);
    } catch (error) {
      if (error instanceof SanitizationError || error instanceof ValidationError) {
        throw error;
      }
      throw new SanitizationError(
        'Sanitization middleware failed',
        'middleware',
        JSON.stringify(data),
        'middleware_error'
      );
    }
  };
}

// ===== TYPE GUARDS =====

/**
 * Type guard for sanitized strings
 */
export function isSanitizedString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Type guard for sanitized namespaces
 */
export function isValidNamespace(value: unknown): value is string {
  return typeof value === 'string' &&
         ALLOWED_CHARSETS.NAMESPACE.test(value) &&
         value.length <= SANITIZATION_LIMITS.NAMESPACE_MAX_LENGTH;
}