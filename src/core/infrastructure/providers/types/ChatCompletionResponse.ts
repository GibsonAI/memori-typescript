import { ChatMessage } from './ChatCompletionParams';

/**
 * Response from chat completion requests
 */
export interface ChatCompletionResponse {
  /** Generated message */
  message: ChatMessage;
  /** Finish reason */
  finish_reason: 'stop' | 'length' | 'function_call' | 'content_filter' | 'tool_calls' | 'null';
  /** Usage statistics */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  /** Unique identifier for the completion */
  id: string;
  /** Model used for generation */
  model: string;
  /** Creation timestamp */
  created: number;
  /** Provider-specific response data */
  metadata?: Record<string, any>;
}