/**
 * Core types for Memori library providers
 */

// Core provider identification
export type ProviderName = 'openai' | 'anthropic' | 'ollama';

// Provider wrapper configuration interfaces
export interface OpenAIWrapperConfig {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface AnthropicWrapperConfig {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface OllamaWrapperConfig {
  baseUrl?: string;
  model?: string;
  timeout?: number;
}

// Standard chat message format
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// Chat completion response
export interface ChatResponse {
  content: string;
  chatId: string;
  model: string;
  usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
  };
}

// Embedding response
export interface EmbeddingResponse {
  embeddings: number[][];
  usage: {
    prompt_tokens?: number;
    total_tokens?: number;
  };
  model: string;
}

// Error types
export class MemoriError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly suggestions?: string[],
  ) {
    super(message);
    this.name = 'MemoriError';
  }
}

// Validation result
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}