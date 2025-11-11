
<img src="docs/memorits.jpg">

# 🎯 Memorits: Memory Engine for AI Applications

**A type-safe memory engine for AI conversations with LLM-powered processing, search capabilities, and multi-provider support.**

Memorits provides memory management for AI applications with **MemoryAgent integration** for conversation processing, relationship detection, and multi-provider LLM support.

<div align="center">
  <p>
    <strong>🚀 Ready to remember everything? Install now:</strong>
  </p>
  <code>npm install memorits</code>
</div>

---

## Table of Contents

- [Why Memorits?](#why-memorits)
- [Quick Start](#quick-start)
  - [Installation](#installation)
  - [Basic Usage](#basic-usage)
  - [OpenAI Drop-in Replacement](#openai-drop-in-replacement)
- [Core API](#core-api)
  - [Memory Management](#memory-management)
  - [Memory Consolidation](#memory-consolidation)
  - [Index Management](#index-management)
- [OpenAI Drop-in Replacement](#openai-drop-in-replacement-1)
  - [Quick Migration](#quick-migration)
  - [Initialization Patterns](#initialization-patterns)
  - [Advanced Usage](#advanced-usage)
  - [Configuration](#configuration)
  - [Environment Variables](#environment-variables)
- [Architecture Overview](#architecture-overview)
- [Key Features](#key-features)
- [Enterprise Features](#enterprise-features)
- [Real-World Example](#real-world-example)
- [Architecture Deep Dive](#architecture-deep-dive)
- [Development](#development)
- [Dual Attribution](#dual-attribution)

---

## Why Memorits?

Memorits provides structured memory management for AI applications, helping maintain conversational context and enabling learning from interactions.

### ✨ Key Features

- **🏗️ Clean Architecture**: Well-structured TypeScript implementation with domain-driven design
- **🤖 MemoryAgent Processing**: LLM-powered conversation analysis and memory extraction
- **🔍 Search Capabilities**: Multiple search strategies with filtering and relationship detection
- **🔧 Multi-Provider Support**: Compatible with OpenAI, Anthropic, and Ollama providers
- **💾 SQLite Backend**: Local database storage with Prisma ORM for reliability
- **🔗 Memory Relationships**: Automatic detection of connections between memories
- **⚡ Type Safety**: Full TypeScript coverage with runtime validation
- **🛠️ OpenAI Drop-in**: Zero-code-change replacement for existing OpenAI integrations

---

## Quick Start

### Installation

```bash
npm install memorits
```

### Basic Usage

```typescript
import { Memori, ConfigManager } from 'memorits';

// Initialize with configuration
const config = ConfigManager.loadConfig();
const memori = new Memori(config);
await memori.enable();

// Record conversations
const chatId = await memori.recordConversation(
  'What is TypeScript?',
  'TypeScript is a superset of JavaScript that adds static typing.'
);

// Search memories
const memories = await memori.searchMemories('TypeScript', {
  limit: 10,
  minImportance: 'medium'
});

console.log(`Found ${memories.length} relevant memories`);
```

### Initialize the database

Run the bundled CLI once to push the Prisma schema to your SQLite db:

```bash
npx memorits init-db --url file:./memori.db
```

### OpenAI Drop-in Replacement with Memory Processing

**Transform your OpenAI code with zero breaking changes and integrated memory processing:**

```typescript
import { MemoriOpenAI } from 'memorits';

// Replace your OpenAI client with memory-enabled version
const client = new MemoriOpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
  model: 'gpt-4o-mini',
  memory: {
    enableChatMemory: true,
    memoryProcessingMode: 'auto',
    sessionId: 'my-app'
  }
});

// Use exactly like OpenAI SDK - conversations are automatically recorded
const response = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Remember this for later...' }]
});

// Conversations are processed and stored for future reference
// Search through recorded conversation history
const memories = await client.memory.searchMemories('later');
console.log(`Found ${memories.length} recorded memories`);
```

**That's it!** Your AI now has integrated memory management with zero configuration changes.

---

## Core API

### Memory Management

```typescript
import { Memori } from 'memorits';

const memori = new Memori({
  databaseUrl: 'sqlite:./memories.db',
  namespace: 'my-app'
});

await memori.enable();

// Record conversations
const chatId = await memori.recordConversation(
  userInput,
  aiOutput,
  { model: 'gpt-4o-mini' }
);

// Search with advanced options
const memories = await memori.searchMemories('query', {
  limit: 20,
  minImportance: 'high',
  categories: ['essential', 'contextual'],
  includeMetadata: true
});

// Advanced search strategies
const results = await memori.searchMemoriesWithStrategy(
  'query',
  'FTS5', // or 'LIKE', 'SEMANTIC', 'RELATIONSHIP'
  { limit: 10 }
);

// Enhanced temporal search with time windows
const recentMemories = await memori.searchRecentMemories(10, true, {
  relativeExpressions: ['last week', 'yesterday'],
  patterns: ['daily standup', 'weekly review']
});

// Complex temporal queries with multiple criteria
const projectUpdates = await memori.searchMemories('urgent project updates', {
  temporalFilters: {
    timeRanges: [{
      start: new Date('2024-01-01'),
      end: new Date('2024-12-31')
    }]
  },
  categories: ['essential'],
  minImportance: 'high'
});
```

### Memory Consolidation

```typescript
// Find and consolidate duplicate memories using modern consolidation service
const consolidationService = memori.getConsolidationService();

// Find duplicate memories for given content
const duplicates = await consolidationService.detectDuplicateMemories(
  'content to find duplicates for',
  0.8, // 80% similarity threshold
  { similarityThreshold: 0.8, maxCandidates: 10 }
);

// Consolidate found duplicates
if (duplicates.length > 0) {
  const consolidationResult = await consolidationService.consolidateMemories(
    duplicates[0].id,
    duplicates.slice(1, 3).map(d => d.id)
  );

  console.log(`Consolidated ${consolidationResult.consolidatedCount} memories`);
}
```

### Index Management

```typescript
// Get health report
const health = await memori.getIndexHealthReport();
console.log(`Index health: ${health.health}`);

// Optimize index
const optimization = await memori.optimizeIndex('merge');
console.log(`Saved ${optimization.spaceSaved} bytes`);

  // Create backup
  const backup = await memori.createIndexBackup();
  console.log(`Backup created: ${backup.id}`);
  ```

  ### Memory Statistics & Analytics

  ```typescript
  // Get comprehensive memory statistics
  const stats = await memori.getMemoryStatistics();
  console.log(`Total conversations: ${stats.totalConversations}`);
  console.log(`Total memories: ${stats.totalMemories}`);

  // Get detailed breakdown by type, importance, and category
  const detailedStats = await memori.getDetailedMemoryStatistics();
  console.log(`Long-term memories: ${detailedStats.byType.longTerm}`);
  console.log(`High importance: ${detailedStats.byImportance.high}`);
  console.log(`Recent activity (24h): ${detailedStats.recentActivity.last24Hours}`);
  ```

  ### Memory Relationships & Analysis

  ```typescript
  import {
    Memori,
    type UpdateMemoryInput,
    type UpdateMemoryRelationshipsInput,
    type DeltaInput
  } from 'memorits';

  const memori = new Memori({
    databaseUrl: 'file:./memori.db',
    namespace: 'my-app'
  });
  await memori.enable();

  // Extract relationships from content (LLM + rule-based, implementation detail)
  const relationships = await memori.extractMemoryRelationships(
    'This is a follow-up to our previous discussion about the authentication system',
    { minConfidence: 0.7 }
  );

  for (const rel of relationships) {
    console.log(`${rel.type}: ${rel.targetMemoryId} (confidence: ${rel.confidence})`);
  }

  // Build comprehensive relationship graph for a namespace
  const graph = await memori.buildRelationshipGraph('my-app', {
    maxDepth: 3,
    includeWeakRelationships: false
  });

  console.log(`Found ${graph.nodes.length} connected memories`);
  console.log(`Found ${graph.edges.length} relationships`);
  console.log(`Identified ${graph.clusters.length} memory clusters`);
  ```

  ### Precise Memory Updates

  Use `Memori.updateMemory` when you need to correct or refine an existing memory without re-ingesting via `recordConversation`:

  ```typescript
  const ok = await memori.updateMemory('memory-id', <UpdateMemoryInput>{
    content: 'Updated, corrected content',
    tags: ['corrected', 'curated'],
    metadata: {
      curator: 'human-review',
      reason: 'typo fix'
    }
  });

  if (!ok) {
    console.warn('Memory update was not applied (not found, namespace mismatch, or concurrency conditions).');
  }
  ```

  This API:
  - Is additive and public.
  - Hides internal tables/columns.
  - Returns a boolean result for safe, auditable pipelines.

  ### Relationship Management Helpers

  Use `Memori.updateMemoryRelationships` for explicit graph updates:

  ```typescript
  const relInput: UpdateMemoryRelationshipsInput = {
    sourceId: 'primary-memory-id',
    namespace: 'my-app',
    relations: [
      {
        targetId: 'related-memory-id',
        type: 'references',
        strength: 0.9,
        metadata: { source: 'curator' }
      }
    ]
  };

  const relResult = await memori.updateMemoryRelationships(relInput);

  if (relResult.errors.length) {
    console.error('Failed to update relationships:', relResult.errors);
  }
  ```

  Helpers for duplicate and supersedence semantics:

  ```typescript
  // Mark a memory as a duplicate of another
  await memori.markAsDuplicate('duplicate-id', 'original-id', { namespace: 'my-app' });

  // Declare that one memory supersedes another
  await memori.setSupersedes('primary-id', 'superseded-id', { namespace: 'my-app' });
  ```

  These are thin, public wrappers over the internal consolidation/relationship machinery.

  ### Delta Application for Curator Pipelines

  For batch-style curator or reflector flows, use `Memori.applyDeltas` as a stable entrypoint:

  ```typescript
  const deltas: DeltaInput[] = [
    {
      type: 'note',
      content: 'New SOP: incidents must be acknowledged within 5 minutes.',
      tags: ['sop', 'incident-management'],
      metadata: { source: 'policy-doc' }
    },
    {
      type: 'correction',
      targetId: 'existing-memory-id',
      content: 'Updated on-call rotation schedule.',
      metadata: { source: 'scheduler', severity: 'high' }
    },
    {
      type: 'relationship',
      relationship: {
        sourceId: 'policy-memory-id',
        targetId: 'runbook-memory-id',
        type: 'references',
        strength: 0.8
      }
    }
  ];

  const result = await memori.applyDeltas(deltas, {
    continueOnError: true,
    defaultNamespace: 'my-app'
  });

  console.log('Applied:', result.applied);
  if (result.failed.length) {
    console.warn('Some deltas failed:', result.failed);
  }
  ```

  ### Advanced Search Operations

  ```typescript
  // Get available search strategies
  const strategies = await memori.getAvailableSearchStrategies();
  console.log('Available strategies:', strategies);

  // Use specific search strategy with temporal filtering
  const semanticResults = await memori.searchMemoriesWithStrategy(
    'project architecture decisions',
    SearchStrategy.SEMANTIC,
    {
      limit: 10,
      temporalFilters: {
        relativeExpressions: ['last month', 'this week']
      }
    }
  );

  // Complex metadata filtering
  const filteredMemories = await memori.searchMemories('urgent issues', {
    limit: 20,
    categories: ['essential', 'contextual'],
    minImportance: 'high',
    includeMetadata: true,
    metadataFilters: {
      field: 'createdAt',
      operator: 'gte',
      value: new Date('2024-01-01')
    }
  });
  ```

  ### Backup & Recovery

  ```typescript
  // Restore from backup
  const success = await memori.restoreIndexFromBackup(backup.id);
  if (success) {
    console.log('Index restored successfully');
  }
  ```

---

## OpenAI Drop-in Replacement

**Transform your existing OpenAI code into a memory-enabled powerhouse with zero breaking changes.**

### Why Use the Drop-in Replacement?

- **Zero Code Changes**: Existing OpenAI code works unchanged
- **Automatic Memory**: Conversations are recorded transparently
- **Multiple Patterns**: From simple to advanced initialization
- **Full Compatibility**: Exact OpenAI SDK v5.x API match
- **Streaming Support**: Complete memory capture for streaming responses


### Initialization Patterns

#### Simple Constructor

```typescript
import { MemoriOpenAI } from 'memorits';

const client = new MemoriOpenAI({
  apiKey: 'your-api-key',
  model: 'gpt-4o-mini',
  memory: {
    enableChatMemory: true,
    memoryProcessingMode: 'auto',
    sessionId: 'my-app'
  }
});
```

#### Factory Functions

```typescript
import { memoriOpenAIFactory } from 'memorits';

// From configuration using new IProviderConfig
const client1 = await memoriOpenAIFactory.fromConfig({
  apiKey: 'api-key',
  model: 'gpt-4o-mini',
  memory: {
    enableChatMemory: true,
    memoryProcessingMode: 'auto',
    sessionId: 'my-app'
  }
});

// From environment with new IProviderConfig
const client2 = await memoriOpenAIFactory.fromEnv({
  apiKey: 'api-key',
  model: 'gpt-4o-mini',
  memory: {
    enableChatMemory: true,
    memoryProcessingMode: 'auto'
  }
});

// From database URL with new IProviderConfig
const client3 = await memoriOpenAIFactory.fromDatabaseUrl({
  apiKey: 'api-key',
  model: 'gpt-4o-mini',
  memory: {
    enableChatMemory: true,
    memoryProcessingMode: 'auto'
  }
});
```

### Advanced Usage

#### Streaming with Memory

```typescript
const stream = await client.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Tell me a story...' }],
  stream: true
});

let fullContent = '';
for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content || '';
  fullContent += content;
  process.stdout.write(content);
}

// Memory automatically recorded when streaming completes
const memories = await client.memory.searchMemories('story');
```

#### Memory Operations

```typescript
// Search with filters
const memories = await client.memory.searchMemories('urgent', {
  limit: 10,
  minImportance: 'high',
  categories: ['essential']
});

// Get statistics
const stats = await client.memory.getMemoryStats();
console.log(`Total: ${stats.totalMemories}`);
```

### Configuration

```typescript
interface IProviderConfig {
  // API configuration
  apiKey: string;
  model?: string;
  baseUrl?: string;
  options?: Record<string, any>;

  // Memory configuration (NEW!)
  memory?: {
    enableChatMemory?: boolean;
    enableEmbeddingMemory?: boolean;
    memoryProcessingMode?: 'auto' | 'conscious' | 'none';
    minImportanceLevel?: 'low' | 'medium' | 'high' | 'critical' | 'all';
    sessionId?: string;
  };
}
```

### Environment Variables

```bash
# OpenAI Configuration
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.openai.com/v1

# Memory Configuration
MEMORI_DATABASE_URL=sqlite:./memories.db
MEMORI_NAMESPACE=default
MEMORI_SESSION_ID=my-app-session
MEMORI_PROCESSING_MODE=auto
MEMORI_MIN_IMPORTANCE_LEVEL=medium
```

---

---

## Architecture Overview

Memorits follows a clean, modular architecture with clear separation of concerns:

### 🏗️ **Architecture Structure**

```
src/
├── core/                           # Core Business Logic
│   ├── domain/                     # Business Logic Layer
│   │   ├── conversation/           # Conversation Management
│   │   ├── memory/                 # Memory Processing & State Management
│   │   └── search/                 # Search Strategies & Filtering
│   ├── infrastructure/             # External Concerns Layer
│   │   ├── config/                 # Configuration & Logging
│   │   ├── database/               # Database Access & Repositories
│   │   └── providers/              # External Service Providers
│   ├── types/                      # Shared Type Definitions
│   └── performance/                # Performance Monitoring
├── integrations/                   # External Integrations
│   └── openai-dropin/              # OpenAI Drop-in Replacement
└── index.ts                        # Main Entry Point
```

### 🏢 **Core Components**
- **Memory Processing**: Conversation analysis and structured memory extraction
- **Search System**: Multiple search strategies with filtering capabilities
- **Provider Integration**: Support for multiple LLM providers
- **Data Storage**: SQLite database with Prisma ORM for reliable storage

---

## Key Features

### 🔍 Search & Memory Processing

- **MemoryAgent Integration**: LLM-powered conversation analysis for structured memory extraction
- **Relationship Detection**: Automatic identification of memory connections and dependencies
- **Multi-Strategy Search**: Support for different search approaches with filtering capabilities
- **Memory Consolidation**: Duplicate detection and merging with transaction safety
- **State Management**: Processing state tracking for memory workflows

### 🔧 Provider Integration

- **Multi-Provider Support**: Compatible with OpenAI, Anthropic, and Ollama providers
- **OpenAI Drop-in Replacement**: Zero-code-change integration for existing OpenAI applications
- **Unified Configuration**: Single configuration interface across all supported providers
- **Type-Safe Operations**: Full TypeScript coverage with runtime validation

### 💾 Data Management

- **SQLite Backend**: Local database storage with Prisma ORM
- **Structured Storage**: Organized storage of conversations, memories, and relationships
- **Memory Lifecycle**: Processing, storage, and retrieval of conversational data


## Real-World Example

Imagine building an AI coding assistant that remembers your entire codebase context:

```typescript
// Your AI assistant now remembers every discussion about your codebase
const architectureDecisions = await memori.searchMemories('database schema decisions', {
  categories: ['essential'],
  minImportance: 'high'
});

// It knows your preferences and patterns
const stylePreferences = await memori.searchMemories('coding style preferences', {
  categories: ['personal']
});

// It maintains context across sessions
const previousDiscussions = await memori.searchMemories('authentication system', {
  limit: 20
});
```

**Result**: Your AI assistant becomes exponentially more valuable as it accumulates knowledge about your projects, preferences, and working patterns.

---

## Architecture Deep Dive

### 🏗️ **Domain-Driven Design Architecture**
- **Domain Layer** (`src/core/domain/`) - Pure business logic organized by bounded contexts:
  - **Memory Domain** - Memory processing, classification, and state management
  - **Search Domain** - Search strategies, filtering, and relationship processing
  - **Conversation Domain** - Chat history and conversation management
- **Infrastructure Layer** (`src/core/infrastructure/`) - Technical implementations:
  - **Database Layer** - Prisma ORM, SQLite backend, and repository implementations
  - **Provider Layer** - OpenAI SDK integration and external service providers
  - **Configuration Layer** - Winston logging, configuration management, and utilities
- **Integration Layer** (`src/integrations/`) - External system integrations
- **TypeScript 5.9+** - Full type safety with compile-time validation and modern JavaScript features
- **Zod** - Runtime type validation with detailed error reporting and schema evolution

### 🔌 **AI Integration Layer**
- **Multi-Provider SDK** - Native compatibility with OpenAI, Anthropic, Ollama, and custom providers
- **Provider Factory Pattern** - Unified LLMProviderFactory for creating and managing provider instances
- **Memory-Enabled Providers** - Automatic memory enhancement across all supported LLM services
- **Streaming Support** - Full memory capture for real-time AI interactions across all providers

### 📊 **Enterprise Services**
- **Performance Monitoring** - Real-time metrics collection and alerting
- **Health Checks** - Comprehensive system diagnostics and status reporting
- **Configuration Management** - Dynamic configuration with validation and audit trails

### 🛡️ **Production Features**
- **Error Handling** - Circuit breaker patterns with graceful degradation
- **Connection Pooling** - Database connection management for high-throughput applications
- **Background Processing** - Asynchronous operations with queue management
- **Resource Management** - Memory-efficient processing with configurable limits

---

## Development

### Build & Test

```bash
# Install dependencies
npm install

# Run tests
npm test

# Watch tests during development
npm run test:watch

# Lint code
npm run lint

# Database management
npm run prisma:studio
```

### Examples

Run example scripts to see Memorits in action:

```bash
# Basic usage
npm run example:basic

# OpenAI integration
npm run example:openai

# Advanced search features
npm run example:advanced-search

# Memory consolidation
npm run example:consolidation

# Performance dashboard
npm run example:performance-dashboard

# Index management
npm run index:health
npm run index:optimize
npm run index:backup
```

### Project Structure

The codebase follows Domain-Driven Design principles:

- **`src/core/domain/`** - Business logic organized by bounded contexts
- **`src/core/infrastructure/`** - Technical implementations and external concerns
- **`src/integrations/`** - External system integrations
- **`examples/`** - Usage examples and demonstrations
- **`tests/`** - Comprehensive test coverage

---

## Dual Attribution

**This project represents a dual attribution collaboration:**

### Original Library Attribution
**This project is a TypeScript port of the original [Memori Python project](https://github.com/GibsonAI/memori) created by GibsonAI.**

- **Original Authors**: Harshal More, harshalmore2468@gmail.com
- **Organization**: GibsonAI Team, noc@gibsonai.com
- **Original Repository**: [https://github.com/GibsonAI/memori](https://github.com/GibsonAI/memori)
- **License**: [Apache License 2.0](LICENSE)
- **Documentation**: [https://memori.gibsonai.com/docs](https://memori.gibsonai.com/docs)

### Port Attribution
**This specific TypeScript port was created by @mrorigo with AI assistance from Roo Code using the code-supernova model.**

- **Port Author**: mrorigo
- **AI Assistant**: Roo Code (code-supernova model)
- **Repository**: [https://github.com/mrorigo/memorits](https://github.com/mrorigo/memorits)
- **NPM Package**: [https://npmjs.com/package/memorits](https://npmjs.com/package/memorits)

This TypeScript port maintains compatibility with the original Apache License 2.0 and preserves the core functionality and architecture of the original implementation while leveraging TypeScript's type safety and modern JavaScript ecosystem.

---

## Developer Documentation

📚 **[Comprehensive Developer Guide](docs/developer/index.md)** - Complete architecture overview, implementation details, and advanced usage patterns.

### Key Developer Resources:
- **[Core Concepts](docs/developer/core-concepts/)** - Memory management, search strategies, and classification systems
- **[Architecture Deep Dive](docs/developer/architecture/)** - System design, database layer, and search engine implementation
- **[Advanced Features](docs/developer/advanced-features/)** - Temporal filtering, metadata processing, conscious memory, memory relationships, and consolidation
- **[API Reference](docs/developer/api/)** - Detailed interface documentation and usage examples
- **[Integration Guides](docs/developer/integration/)** - Multi-provider integration patterns and custom provider development
- **[Provider Documentation](docs/developer/providers/)** - Complete guides for OpenAI, Anthropic, Ollama, and custom providers
- **[Provider Documentation](docs/developer/providers/)** - Comprehensive guides for OpenAI, Anthropic, Ollama, and custom providers

---

## API Reference

📚 **[Complete API Documentation](docs/developer/api/)** - Comprehensive API reference with detailed examples.

---

<div align="center">
  <p>
    <strong>🚀 Ready to add memory to your AI applications?</strong>
  </p>
  <p>
    <a href="#quick-start">Get Started</a> •
    <a href="https://github.com/mrorigo/memorits">View on GitHub</a> •
    <a href="https://npmjs.com/package/memorits">Install from NPM</a>
  </p>
  <p>
    <strong>Type-safe • Well-architected • Production-ready</strong>
  </p>
</div>
