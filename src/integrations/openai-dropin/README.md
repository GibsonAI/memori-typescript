# MemoriOpenAI Drop-in Replacement

A comprehensive drop-in replacement for the OpenAI client that transparently enables memory functionality for agents while maintaining 100% API compatibility with OpenAI SDK v5.x.

## Features

- **Zero Breaking Changes**: Existing code using OpenAI SDK continues to work unchanged
- **Transparent Memory**: Automatic recording of conversations without manual intervention
- **Full API Compatibility**: Support for chat completions and embeddings
- **Streaming Support**: Proper handling of streaming responses with complete memory capture
- **Flexible Initialization**: Multiple initialization patterns for different use cases
- **Type Safety**: Exact type matching with OpenAI SDK for compile-time safety

## Installation

```bash
npm install openai memorits
```

## Quick Start

### Basic Drop-in Replacement

```typescript
import { MemoriOpenAI } from 'memorits/integrations/openai-dropin';

// Replace your OpenAI client - no other code changes needed!
const client = new MemoriOpenAI('your-api-key', {
  enableChatMemory: true,
  autoInitialize: true,
  baseURL: 'https://api.openai.com/v1', // Direct baseURL support
});

// Use exactly like OpenAI client
const response = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello, remember this!' }]
});

// Memory automatically recorded
const memories = await client.memory.searchMemories('Hello');
```

### Environment-Based Setup

```typescript
// Configure via environment variables (recommended for production)
const client = await MemoriOpenAIFromEnv('your-api-key', {
  enableChatMemory: true,
  memoryProcessingMode: 'conscious'
});

// Environment variables:
// OPENAI_API_KEY=your-key
// MEMORI_DATABASE_URL=sqlite:./memories.db
// MEMORI_PROCESSING_MODE=conscious
```

### Advanced Configuration

```typescript
const client = await MemoriOpenAIFromConfig('your-api-key', {
  enableChatMemory: true,
  enableEmbeddingMemory: true,
  memoryProcessingMode: 'conscious',
  databaseUrl: 'postgresql://localhost/memories',
  namespace: 'production-app',
  minImportanceLevel: 'medium',
  autoIngest: false,
  consciousIngest: true,
  bufferTimeout: 30000,
  maxBufferSize: 50000
});
```

### OpenAI SDK Pattern with baseURL

```typescript
// Use the exact same pattern as OpenAI SDK
const client = new MemoriOpenAI({
  apiKey: 'your-api-key',
  baseURL: 'https://api.openai.com/v1', // Direct baseURL support
  organization: 'your-org-id',
  project: 'your-project-id',
  enableChatMemory: true,
  autoInitialize: true,
});
```

## Initialization Patterns

### Pattern 1: Direct Constructor (Most Common)

```typescript
const client = new MemoriOpenAI('your-api-key', {
  enableChatMemory: true,
  autoInitialize: true,
  databaseUrl: 'sqlite:./memories.db',
});
```

### Pattern 2: Environment Configuration

```typescript
const client = await MemoriOpenAIFromEnv('your-api-key', {
  enableChatMemory: true,
});
```

### Pattern 3: Database URL

```typescript
const client = await MemoriOpenAIFromDatabase(
  'your-api-key',
  'postgresql://localhost/memories',
  { enableChatMemory: true }
);
```

### Pattern 4: Advanced Configuration

```typescript
const client = await MemoriOpenAIFromConfig('your-api-key', {
  enableChatMemory: true,
  enableEmbeddingMemory: false,
  memoryProcessingMode: 'conscious',
  databaseUrl: 'sqlite:./advanced.db',
  namespace: 'my-session',
  minImportanceLevel: 'medium',
  autoIngest: false,
  consciousIngest: true,
});
```

## Configuration Options

```typescript
interface MemoriOpenAIConfig {
  // Core functionality
  enableChatMemory?: boolean;           // Enable chat memory recording
  enableEmbeddingMemory?: boolean;      // Enable embedding memory recording
  memoryProcessingMode?: 'auto' | 'conscious' | 'none';

  // Initialization
  autoInitialize?: boolean;             // Auto-create Memori instance
  databaseConfig?: DatabaseConfig;      // Database configuration
  namespace?: string;                   // Memory namespace

  // Memory filtering
  minImportanceLevel?: MemoryImportanceFilter;
  maxMemoryAge?: number;                // Days to keep memories
  autoIngest?: boolean;                 // Auto vs conscious ingestion

  // Performance tuning
  bufferTimeout?: number;               // Streaming buffer timeout (ms)
  maxBufferSize?: number;               // Max streaming buffer size (chars)

  // OpenAI client options
  apiKey?: string;                      // Override API key
  baseUrl?: string;                     // Override base URL
  organization?: string;                // Organization ID
  project?: string;                     // Project ID
  timeout?: number;                     // Request timeout
  maxRetries?: number;                  // Maximum retries
  defaultHeaders?: Record<string, string>;
}
```

## Memory Operations

### Searching Memories

```typescript
const memories = await client.memory.searchMemories('search query', {
  limit: 10,
  minImportance: 'medium',
  namespace: 'my-session',
});
```

### Memory Statistics

```typescript
const stats = await client.memory.getMemoryStats();
// Example output: Total memories: 42
console.log(`Total memories: ${stats.totalMemories}`);
```

### Memory Recording Result

```typescript
const result = await client.memory.recordChatCompletion(params, response);
if (result.success) {
  // Example output: Memory recorded: chat_123
  console.log(`Memory recorded: ${result.chatId}`);
} else {
  // Example output: Recording failed: Database connection error
  console.error(`Recording failed: ${result.error}`);
}
```

## Environment Variables

```bash
# OpenAI Configuration
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_ORGANIZATION=your-org-id
OPENAI_PROJECT=your-project-id

# Memory Configuration
MEMORI_DATABASE_URL=sqlite:./memories.db
MEMORI_NAMESPACE=default
MEMORI_PROCESSING_MODE=auto
MEMORI_AUTO_INGEST=true
MEMORI_CONSCIOUS_INGEST=false
MEMORI_MIN_IMPORTANCE=low
MEMORI_MAX_AGE=30

# Performance Configuration
MEMORI_BUFFER_TIMEOUT=30000
MEMORI_MAX_BUFFER_SIZE=50000
MEMORI_BACKGROUND_INTERVAL=30000
```

## Migration Guide

### From Standard OpenAI

**Before:**
```typescript
import OpenAI from 'openai';
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
```

**After:**
```typescript
import { MemoriOpenAI } from 'memorits';
const client = new MemoriOpenAI(process.env.OPENAI_API_KEY!, {
  enableChatMemory: true,
  autoInitialize: true,
});
```

No other code changes are needed! The API is identical.

## Error Handling

Memory errors are handled gracefully and don't break the main OpenAI functionality:

```typescript
try {
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Hello!' }],
  });
} catch (error) {
  // OpenAI errors are preserved exactly as they would be
  // Memory recording errors are logged but don't affect the response
  console.error('OpenAI error:', error);
}
```

## Architecture

The implementation follows a modular architecture:

- **MemoriOpenAIClient**: Main proxy that implements the OpenAI interface
- **MemoryManager**: Handles memory recording and retrieval
- **ConversationRecorder**: Records and processes chat interactions
- **StreamingBuffer**: Buffers streaming responses for complete memory capture
- **Factory Functions**: Multiple initialization patterns

## Performance

- Minimal overhead for memory recording
- Configurable streaming buffer settings
- Background processing for conscious mode
- Efficient memory indexing and search

## Performance

### Memory Recording Overhead

- **Minimal latency impact**: Memory recording adds <10ms to non-streaming requests
- **Streaming optimization**: Memory buffered during streaming, recorded after completion
- **Configurable buffering**: Adjust buffer size and timeout for your use case
- **Background processing**: Conscious mode processing happens asynchronously

### Performance Tuning

```typescript
// Optimize for high-throughput applications
const client = new MemoriOpenAI('api-key', {
  enableChatMemory: true,
  autoInitialize: true,
  bufferTimeout: 5000,      // Faster streaming timeout
  maxBufferSize: 10000,     // Smaller buffer for memory efficiency
  backgroundUpdateInterval: 60000, // Less frequent background updates
  memoryProcessingMode: 'auto'     // Faster than conscious mode
});

// Optimize for memory quality over speed
const client = new MemoriOpenAI('api-key', {
  enableChatMemory: true,
  enableEmbeddingMemory: true,
  memoryProcessingMode: 'conscious',
  minImportanceLevel: 'medium',    // Only record important memories
  maxMemoryAge: 30,                // Automatic cleanup after 30 days
  autoIngest: true,
  consciousIngest: true
});
```

### Memory Efficiency

- **Smart filtering**: Only records memories above importance threshold
- **Automatic cleanup**: Configurable retention policies
- **Deduplication**: Prevents duplicate memory entries
- **Indexing optimization**: Fast search across large memory databases

## Troubleshooting

### Common Issues and Solutions

#### 1. Memory Not Being Recorded

**Problem:** Conversations aren't appearing in memory search.

**Solutions:**
```typescript
// Verify configuration
const client = new MemoriOpenAI('api-key', {
  enableChatMemory: true,    // Must be true
  autoInitialize: true,      // Must be true for automatic setup
  databaseUrl: 'sqlite:./memories.db' // Must specify database
});

// Check if memory was actually recorded
const result = await client.memory.searchMemories('test');
// Example output: Found memories: 3
console.log('Found memories:', result.length);
```

#### 2. Database Connection Errors

**Problem:** Database connection fails or permissions issues.

**Solutions:**
```typescript
// For development - use absolute path
const client = new MemoriOpenAI('api-key', {
  databaseUrl: '/absolute/path/to/memories.db'
});

// For production - check connection string
const client = new MemoriOpenAI('api-key', {
  databaseUrl: 'postgresql://user:password@localhost:5432/memories'
});

// Test database connection
const stats = await client.memory.getMemoryStats();
// Example output: Database connected successfully: { totalMemories: 0, ... }
console.log('Database connected successfully:', stats);
```

#### 3. Memory Injection Not Working

**Problem:** AI not receiving context from previous conversations.

**Solutions:**
```typescript
// Enable memory injection modes
const client = new MemoriOpenAI('api-key', {
  memoryProcessingMode: 'auto',    // Enable automatic memory injection
  autoIngest: true,                // Enable auto ingestion
  consciousIngest: true            // Enable conscious processing
});

// Verify memory injection is working
const response = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    { role: 'user', content: 'Remember our previous conversation about AI?' }
  ]
});
```

#### 4. Streaming Response Issues

**Problem:** Streaming responses not being recorded properly.

**Solutions:**
```typescript
// Adjust streaming buffer settings
const client = new MemoriOpenAI('api-key', {
  bufferTimeout: 30000,     // Default 30 seconds
  maxBufferSize: 50000,     // Default 50KB
  enableChatMemory: true
});

// For very long streaming responses
const client = new MemoriOpenAI('api-key', {
  bufferTimeout: 120000,    // 2 minutes
  maxBufferSize: 200000,    // 200KB
  enableChatMemory: true
});
```

#### 5. TypeScript Compilation Errors

**Problem:** Type errors when using MemoriOpenAI.

**Solutions:**
```typescript
// Use correct import path
import { MemoriOpenAI } from 'memorits';

// Not this (will cause type errors)
import MemoriOpenAI from 'memorits';

// TypeScript configuration
{
  "compilerOptions": {
    "moduleResolution": "node",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true
  }
}
```

### Error Handling Best Practices

```typescript
try {
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Hello!' }]
  });

  // Success - response is guaranteed to be valid
  // Example output: Response: Hello! How can I help you today?
  console.log('Response:', response.choices[0]?.message?.content);
} catch (error) {
 if (error instanceof Error) {
   // Handle OpenAI API errors (rate limits, invalid requests, etc.)
   if (error.message.includes('rate limit')) {
     // Example output: Rate limited - implement retry logic
     console.log('Rate limited - implement retry logic');
   } else if (error.message.includes('invalid model')) {
     // Example output: Invalid model - check model name
     console.log('Invalid model - check model name');
   } else {
     // Example output: OpenAI error: Authentication failed
     console.log('OpenAI error:', error.message);
   }
 } else {
   // Handle memory-specific errors
   // Example output: Memory error (non-critical): Database connection timeout
   console.log('Memory error (non-critical):', error);
 }
}
```

### Debugging Memory Issues

```typescript
// Enable debug mode for detailed logging
const client = new MemoriOpenAI('api-key', {
  debugMode: true,           // Enable detailed logging
  enableMetrics: true       // Enable performance metrics
});

// Check memory system status
const stats = await client.memory.getMemoryStats();
// Example output: Memory system status: { totalMemories: 15, ... }
console.log('Memory system status:', stats);

// Search for specific memories
const memories = await client.memory.searchMemories('debug test');
// Example output: Found memories: [Memory objects...]
console.log('Found memories:', memories);

// Check system health
const health = await client.memory.getSystemHealth();
// Example output: System health: { status: 'healthy', ... }
console.log('System health:', health);
```

### Performance Monitoring

```typescript
// Enable performance monitoring
const client = new MemoriOpenAI('api-key', {
  enableMetrics: true,
  debugMode: process.env.NODE_ENV === 'development'
});

// Get performance metrics
const metrics = await client.memory.getPerformanceMetrics();
// Example output: Performance metrics: { averageResponseTime: 150, ... }
console.log('Performance metrics:', {
  averageResponseTime: metrics.averageResponseTime,
  memoryOperationsPerSecond: metrics.memoryOperationsPerSecond,
  cacheHitRate: metrics.cacheHitRate,
  databaseConnections: metrics.activeConnections
});
```

## Type Safety

Full TypeScript support with exact OpenAI SDK compatibility:

```typescript
import type { ChatCompletion, ChatCompletionCreateParams } from 'memorits';

const params: ChatCompletionCreateParams = {
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Hello!' }],
};

const response: ChatCompletion = await client.chat.completions.create(params);
```

## License

This implementation is part of the Memori project and follows the same licensing terms.