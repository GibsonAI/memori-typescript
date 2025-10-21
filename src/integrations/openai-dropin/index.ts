
// Main client implementation
export { default as MemoriOpenAIClient } from './client';

// Factory functions and patterns
export { default as MemoriOpenAIFactory, memoriOpenAIFactory } from './factory';
export {
  MemoriOpenAIFromConfig,
  MemoriOpenAIFromEnv,
  MemoriOpenAIFromDatabase,
} from './factory';

// Type definitions
export type {
  MemoriOpenAI,
  MemoryManager,
  MemoryRecordingResult,
  OpenAIMemoryMetadata,
  StreamingMetadata,
  BufferedStream,
  MemoryError,
  MemoryErrorType,
  RecoveryStrategy,
  ErrorRecoveryConfig,
  OpenAIMetrics,
  PerformanceMonitorConfig,
  DatabaseConfig,
  DatabaseType,
  MemoryProcessingMode,
  MemoryImportanceFilter,
  RecordChatCompletionOptions,
  RecordEmbeddingOptions,
  StreamingBufferConfig,
  ConversationRecorder,
  StreamingBuffer,
  DeepPartial,
  OptionalConfigKeys,
  RequiredConfigKeys,
} from './types';

// Re-export OpenAI types for compatibility
export type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  ChatCompletionRole,
  Embedding,
  EmbeddingCreateParams,
  CreateEmbeddingResponse,
  Chat,
  Embeddings,
} from './types';

// Default export for convenience (re-export the client as MemoriOpenAI)
import MemoriOpenAIClient from './client';
const MemoriOpenAI = MemoriOpenAIClient;
export default MemoriOpenAI;