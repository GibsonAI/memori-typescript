/**
 * Response from embedding requests
 */
export interface EmbeddingResponse {
  /** Generated embeddings */
  data: Array<{
    index: number;
    embedding: number[];
    object: string;
  }>;
  /** Model used for generation */
  model: string;
  /** Usage statistics */
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
  /** Unique identifier for the embedding request */
  id?: string;
  /** Creation timestamp */
  created?: number;
  /** Provider-specific response data */
  metadata?: Record<string, any>;
}