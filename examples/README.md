# MemoriAI Library Examples

This directory contains examples demonstrating the two main usage patterns of the MemoriAI library:

1. **MemoriAI (Unified API)** - Automatic memory management with LLM calls
2. **Memori (Conscious API)** - Manual memory management with external LLM calls

## Prerequisites

1. **Node.js** (version 16 or higher)
2. **npm** or **yarn** package manager
3. **Database**: SQLite (default) or PostgreSQL/MySQL
4. **AI Backend**: OpenAI API, Anthropic API, or Ollama

## API Overview

### MemoriAI - Unified API (Automatic Memory)
Best for when you want LLM calls and memory management handled together automatically.

```typescript
import { MemoriAI } from 'memorits';

const ai = new MemoriAI({
  databaseUrl: 'file:./memories.db',
  apiKey: process.env.OPENAI_API_KEY
  // Everything else is automatic!
});

const response = await ai.chat({
  messages: [{ role: 'user', content: 'Hello!' }]
});

const memories = await ai.searchMemories('topic');
```

### Memori - Conscious API (Manual Memory)
Best for when you want to call the LLM externally and manually control memory recording.

```typescript
import { Memori } from 'memorits';

const memori = new Memori({
  databaseUrl: 'file:./memories.db',
  autoIngest: false,    // Manual control
  consciousIngest: true // Conscious processing
});

await memori.enable();

// Your external LLM call
const aiResponse = await callYourLLM(userMessage);

// Manual memory recording
await memori.recordConversation(userMessage, aiResponse);

// Manual memory processing
await memori.checkForConsciousContextUpdates();

// Memory search
const memories = await memori.searchMemories('topic');
```

## Running Examples

### Running Examples Directly

You can run examples directly with tsx:

```bash
# MemoriAI Unified API (Automatic Memory)
npx tsx examples/basic-usage.ts

# Memory Search and Retrieval
npx tsx examples/memory-search.ts

# Conscious Memory Management (External LLM calls)
npx tsx examples/conscious-memory-usage.ts
```

## Example Descriptions

### 1. MemoriAI Unified API (`basic-usage.ts`)

Demonstrates the unified MemoriAI API where LLM calls and memory management are handled together:
- Simple configuration with automatic provider detection
- Chat conversations with automatic memory recording
- Memory search and retrieval
- Clean resource management

**Key Features:**
- 25 lines vs 137 lines (82% reduction in complexity)
- Automatic memory recording during chat
- Simple configuration with smart defaults

### 2. Memory Search (`memory-search.ts`)

Demonstrates advanced memory search and retrieval:
- Creating conversations with automatic memory processing
- Various search query patterns
- Memory content analysis and categorization
- Search result processing and display

**Key Features:**
- Automatic memory processing during conversations
- Multiple search query types and patterns
- Memory content analysis and relevance scoring

### 3. Conscious Memory Management (`conscious-memory-usage.ts`)

Demonstrates the Memori class for conscious memory management:
- Manual control over when memories are recorded
- External LLM integration with manual memory recording
- Conscious memory processing with manual triggers
- Advanced features like consolidation and optimization

**Key Features:**
- External LLM call integration
- Manual memory recording and processing
- Advanced memory management features
- Full control over memory operations

**Use Cases:**
- Applications with existing LLM integrations
- Scenarios requiring manual memory control
- Advanced memory management workflows

### 2. Ollama Integration (`ollama-integration.ts`)

Shows how to configure and use Memori with Ollama:
- Ollama-specific configuration validation
- Local LLM conversation recording
- Memory processing with local models
- Error handling for common Ollama issues

**Expected Output:**
- Ollama configuration validation
- Multiple conversation recordings with metadata
- Memory searches for "local LLM", "efficient", and "programming"
- Troubleshooting suggestions if Ollama is not available

### 3. OpenAI Integration (`openai-integration.ts`)

Demonstrates OpenAI API integration:
- OpenAI API key validation
- GPT model conversation recording
- Memory processing with OpenAI models
- Rate limiting and error handling

**Expected Output:**
- OpenAI configuration validation
- API key verification
- Conversation recordings with programming concepts
- Memory searches for "JavaScript", "async", and "React"
- API usage guidance

### 4. Memory Search (`memory-search.ts`)

Advanced memory search and retrieval demonstration:
- Building a diverse memory base
- Various search query types
- Cross-topic memory relationships
- Category-based memory organization

**Expected Output:**
- Comprehensive memory database creation
- Multiple search demonstrations across different topics
- Category analysis and memory relationships
- Semantic search capabilities showcase

### 5. Dual Memory Mode (`dual-memory-mode.ts`)

Comprehensive demonstration of Memori's dual memory processing modes:
- **Auto-ingestion mode**: Automatic conversation processing into memories
- **Conscious ingestion mode**: Manual processing with background monitoring
- **Mode status checking**: Query current processing state
- **Background processing**: Configurable monitoring intervals
- **Relationship extraction control**: Independent control of relationship processing

**Expected Output:**
- Auto-ingestion mode demonstration with automatic memory processing
- Conscious ingestion mode with manual processing triggers
- Background monitoring configuration and status
- Mode status verification and comparison
- Relationship extraction control examples (enabled/disabled scenarios)

### 6. Performance Dashboard (`performance-dashboard.ts`)

Comprehensive demonstration of Memori's performance monitoring and alerting capabilities:
- **Dashboard initialization**: Setting up default widgets and real-time collection
- **System status monitoring**: Overall health and component-specific metrics
- **Real-time metrics**: Collection and analysis of performance data
- **Alert management**: Threshold-based alerting and acknowledgment system
- **Performance reporting**: Detailed analysis and trend identification
- **Widget management**: Dynamic dashboard configuration and updates

**Expected Output:**
- Dashboard service initialization with default widgets
- Real-time system status overview with component health
- Live metrics collection and alert generation
- Performance report generation with trends and recommendations
- Alert acknowledgment and resolution workflow
- Dashboard configuration export and management

### 7. Memory Consolidation (`memory-consolidation.ts`)

Demonstrates the memory consolidation service:
- **Duplicate detection**: Using similarity algorithms to find duplicate memories
- **Memory consolidation**: Safe merging with rollback capabilities
- **Architecture overview**: Clean service-oriented design for maintainability
- **Performance characteristics**: Fast duplicate detection and processing
- **Service integration**: How consolidation works with existing Memori features

**Expected Output:**
- Memory creation for consolidation demonstration
- Duplicate detection results with similarity analysis
- Consolidation process with rollback safety
- Architecture capabilities demonstration
- Performance metrics and system capabilities
- Service design and integration showcase

### 8. Multi-Provider Usage (`multi-provider-usage.ts`) **[NEW]**

Comprehensive demonstration of Memori's multi-provider architecture:
- **Provider capabilities**: Show available provider types and configurations
- **Multi-provider memory**: Use multiple providers simultaneously with separate namespaces
- **Provider switching**: Demonstrate seamless switching between different providers
- **Factory pattern usage**: Show how to use the provider factory for dynamic provider creation
- **Cross-provider memory search**: Search memories across different provider namespaces

**Key Features Demonstrated:**
- **Provider Factory**: Automatic provider registration and creation
- **Multi-Provider Setup**: Running multiple Memori instances with different providers
- **Namespace Isolation**: Separate memory spaces for different providers
- **Provider Detection**: Automatic provider type detection from configuration
- **Memory Continuity**: Maintaining memory access across provider switches

**Expected Output:**
- Provider capabilities overview and registration status
- Multi-provider initialization with separate namespaces
- Cross-provider conversation recording and memory processing
- Memory search across different provider namespaces
- Provider switching demonstration with maintained memory access
- Best practices for multi-provider applications

**Use Cases:**
- Applications requiring multiple AI providers for different tasks
- Development environments with both local (Ollama) and cloud (OpenAI) models
- A/B testing different providers for performance comparison
- Failover scenarios with provider backup strategies

## Expected Output Examples

### Basic Usage Example Output
```
🚀 Starting Basic Memori Usage Example...

📋 Configuration loaded: {
  databaseUrl: 'file:./memori.db',
  namespace: 'development',
  model: 'gpt-4o-mini',
  baseUrl: 'http://localhost:11434/v1'
}

✅ Memori instance created
✅ Memori enabled successfully

💬 Recording conversation...
✅ Conversation recorded with ID: abc-123-def

🔍 Searching memories for "TypeScript"...
✅ Found 3 relevant memories:
1. TypeScript is a superset of JavaScript...
2. Variables can be declared with type annotations...
3. Interfaces define object structures...

🎉 Basic usage example completed successfully!
```

### Ollama Integration Example Output
```
🚀 Starting Ollama Integration Example...

📋 Ollama Configuration: {
  databaseUrl: 'file:./memori.db',
  namespace: 'development',
  model: 'llama2',
  baseUrl: 'http://localhost:11434/v1'
}

✅ Memori instance created with Ollama backend
✅ Memori enabled successfully

💬 Recording conversations with Ollama context...
✅ Conversation 1 recorded: def-456-ghi
✅ Conversation 2 recorded: ghi-789-jkl

🔍 Searching memories for "local LLM"...
✅ Found 2 memories about local LLMs:
1. Local LLMs provide privacy and control...
2. You can run models efficiently on local hardware...

🎉 Ollama integration example completed successfully!
```

### Performance Dashboard Example Output
```
🚀 Starting Performance Dashboard Example

✅ Performance dashboard service initialized
✅ Dashboard initialized with default widgets
✅ Alert callback registered

📊 Getting system status overview...
System Status Overview: healthy, 0 active alerts, 0 recent incidents

🎛️ Getting dashboard widgets...
Found 5 dashboard widgets:
Widget: System Overview (status_indicator)
Widget: Search Performance (metric_chart)
Widget: Database Metrics (metric_chart)
Widget: Active Alerts (alert_list)
Widget: Performance Trends (trend_analysis)

📈 Collecting real-time metrics...
Search latency metrics: 10 samples
Database latency metrics: 10 samples
System error rate metrics: 10 samples

📸 Getting performance snapshots...
Retrieved 3 performance snapshots

📊 Generating performance report...
Performance Report Generated: daily report with healthy status

📈 Analyzing performance trends...
Updated trend analysis for widgets

Alert Summary by Severity: 0 critical, 0 error, 0 warning

💾 Exporting dashboard configuration...
Dashboard configuration exported: 5 widgets configured

🎉 Performance dashboard example completed successfully!
```

## Troubleshooting

### Common Issues

#### 1. Database Connection Errors
- Ensure `DATABASE_URL` is properly set in `.env`
- For SQLite: use `file:./memori.db` (default)
- For PostgreSQL: use `postgresql://user:password@localhost:5432/memori`

#### 2. OpenAI API Errors
- Verify `OPENAI_API_KEY` is set and valid
- Check your OpenAI account has sufficient credits
- Ensure you're not hitting rate limits

#### 3. Ollama Connection Errors
- Make sure Ollama is installed and running
- Check if the service is on port 11434
- Verify the model is downloaded: `ollama pull llama2`

#### 4. Memory Processing Issues
- Ensure memory processing is enabled in configuration
- Check that conversations are being recorded properly
- Wait for asynchronous memory processing to complete

### Debug Mode

To enable verbose logging, set the following in your `.env`:
```env
DEBUG=memori:*
```

### Getting Help

If you encounter issues:

1. Check the error messages in the console output
2. Verify your environment configuration
3. Ensure all prerequisites are installed
4. Try running the basic example first to isolate issues
5. Check the [Memori documentation](../README.md) for more details

## Provider Architecture

### Current Architecture Overview

The Memori library now supports a modern provider architecture that enables:

1. **Multiple Provider Support**: OpenAI, Ollama, and Anthropic providers
2. **Factory Pattern**: Centralized provider creation and management
3. **Automatic Provider Detection**: Configuration-based provider selection
4. **Backward Compatibility**: Existing code continues to work unchanged

### Provider Configuration

#### OpenAI Provider
```env
OPENAI_API_KEY="sk-your-openai-key"
MEMORI_MODEL="gpt-4o-mini"
# OPENAI_BASE_URL not needed for OpenAI
```

#### Ollama Provider
```env
OPENAI_API_KEY="ollama-local"
OPENAI_BASE_URL="http://localhost:11434/v1"
MEMORI_MODEL="llama2"
```

#### Anthropic Provider
```env
OPENAI_API_KEY="sk-ant-api03-your-anthropic-key"
OPENAI_BASE_URL="https://api.anthropic.com"
MEMORI_MODEL="claude-3-sonnet-20240229"
```

### Best Practices

1. **Provider Registration**: The Memori class automatically registers all available providers
2. **Configuration Validation**: Always validate your provider configuration before use
3. **Error Handling**: Implement proper error handling for provider-specific issues
4. **Resource Cleanup**: Always call `await memori.close()` to clean up resources
5. **Namespace Management**: Use different namespaces for different providers or use cases

### Migration from Legacy Code

If you're updating from older versions:

1. **No API changes required**: Existing `Memori` class usage continues to work
2. **Automatic provider detection**: The library detects the provider from your configuration
3. **Enhanced error messages**: Better error reporting for provider issues
4. **Improved performance**: Optimized provider loading and caching

## Advanced Configuration

For production use, consider these additional settings:

```env
# Production database
DATABASE_URL="postgresql://user:password@prod-host:5432/memori"

# Production namespace
MEMORI_NAMESPACE="production"

# Enable memory features
MEMORI_CONSCIOUS_INGEST="true"
MEMORI_AUTO_INGEST="true"

# User context for better memory processing
MEMORI_USER_CONTEXT='{
  "userPreferences": ["TypeScript", "React", "Node.js"],
  "currentProjects": ["web-app", "api-service"],
  "relevantSkills": ["fullstack", "devops", "ai"]
}'
```

## Next Steps

After running these examples:

1. **Experiment** with different conversation topics
2. **Customize** the memory search queries
3. **Integrate** Memori into your own applications
4. **Explore** advanced configuration options
5. **Contribute** your own examples to the project

For more information, see the main [README](../README.md) and explore the source code in the `src/` directory.