/**
 * Parameters for embedding requests
 */
export interface EmbeddingParams {
  /** Input text to embed */
  input: string | string[];
  /** Model to use (optional, falls back to provider default) */
  model?: string;
  /** Encoding format for the embeddings */
  encoding_format?: 'float' | 'base64';
  /** Number of dimensions for the embeddings (if supported by provider) */
  dimensions?: number;
  /** User identifier (for usage tracking) */
  user?: string;
  /** Additional provider-specific options */
  options?: Record<string, any>;
}