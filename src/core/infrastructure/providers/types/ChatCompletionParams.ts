/**
 * Parameters for chat completion requests
 */
export interface ChatCompletionParams {
  /** Messages to process */
  messages: ChatMessage[];
  /** Model to use (optional, falls back to provider default) */
  model?: string;
  /** Sampling temperature (0.0 to 2.0) */
  temperature?: number;
  /** Maximum tokens to generate */
  max_tokens?: number;
  /** Top-p sampling parameter */
  top_p?: number;
  /** Frequency penalty */
  frequency_penalty?: number;
  /** Presence penalty */
  presence_penalty?: number;
  /** Stop sequences */
  stop?: string | string[];
  /** Whether to stream the response */
  stream?: boolean;
  /** Additional provider-specific options */
  options?: Record<string, any>;
}

/**
 * Chat message interface
 */
export interface ChatMessage {
  /** Role of the message author */
  role: 'system' | 'user' | 'assistant' | 'function';
  /** Content of the message */
  content: string;
  /** Function call information (for function messages) */
  function_call?: {
    name: string;
    arguments: string;
  };
  /** Tool calls (for tool-enabled models) */
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  /** Tool call ID (for tool result messages) */
  tool_call_id?: string;
}