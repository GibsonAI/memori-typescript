// examples/openai-dropin-usage.ts
// Example demonstrating OpenAI Drop-in replacement with ChatProxy
// This example shows how to use the MemoriOpenAI client as a drop-in replacement

import MemoriOpenAI, {
  MemoriOpenAIFromConfig,
  MemoriOpenAIFromEnv,
  MemoriOpenAIFromDatabase,
} from '../src/integrations/openai-dropin';
import { logInfo, logError } from '../src/core/infrastructure/config/Logger';

/**
 * Example: Basic Drop-in Replacement
 * Shows how existing OpenAI code can be easily migrated to use memory functionality
 */
async function basicDropInExample() {
  logInfo('=== Basic Drop-in Example ===', { component: 'OpenAIUsageExample', example: 'basicDropIn' });

  // Create MemoriOpenAI client (drop-in replacement for OpenAI)
  const client = new MemoriOpenAI({
    apiKey: 'your-api-key',
    memory: {
      enableChatMemory: true,
    },
    baseUrl: 'https://api.openai.com/v1',
  });

  try {
    // Example conversation - memory is automatically recorded
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant that remembers our conversations.',
        },
        {
          role: 'user',
          content: 'Hello! My name is Alice and I love TypeScript. Please remember this for our future conversations.',
        },
      ],
      temperature: 0.7,
      max_tokens: 150,
    });

    logInfo('Chat completion successful', {
      component: 'OpenAIUsageExample',
      example: 'basicDropIn',
      responseLength: response.choices[0]?.message?.content?.length || 0,
    });

    // Search for memories (this should include the conversation we just had)
    const memories = await client.memory.searchMemories('Alice TypeScript');
    logInfo('Memory search completed', {
      component: 'OpenAIUsageExample',
      example: 'basicDropIn',
      memoriesFound: memories.length,
    });

    memories.forEach((memory, index) => {
      logInfo(`Memory ${index + 1}`, {
        component: 'OpenAIUsageExample',
        example: 'basicDropIn',
        content: memory.content?.substring(0, 100) + '...',
      });
    });

    // Get memory statistics
    const stats = await client.memory.getMemoryStats();
    logInfo('Memory statistics retrieved', {
      component: 'OpenAIUsageExample',
      example: 'basicDropIn',
      stats,
    });

    await client.close();
  } catch (error) {
    logError('Error in basic example', {
      component: 'OpenAIUsageExample',
      example: 'basicDropIn',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Example: Using Different Initialization Patterns
 * Shows the various ways to initialize the MemoriOpenAI client
 */
async function initializationPatternsExample() {
  logInfo('=== Initialization Patterns Example ===', { component: 'OpenAIUsageExample', example: 'initializationPatterns' });

  // Pattern 1: Factory function with config
  const client1 = await MemoriOpenAIFromConfig({
    apiKey: 'your-api-key',
    memory: {
      enableChatMemory: true,
      memoryProcessingMode: 'auto',
    },
  });

  // Pattern 2: Factory function from environment
  const client2 = await MemoriOpenAIFromEnv('your-api-key', {
    memory: {
      enableChatMemory: true,
      memoryProcessingMode: 'conscious',
    },
  });

  // Pattern 3: Factory function with database URL
  const client3 = await MemoriOpenAIFromDatabase('your-api-key', 'sqlite:./pattern3.db', {
    memory: {
      enableChatMemory: true,
    },
  });

  logInfo('All initialization patterns work', {
    component: 'OpenAIUsageExample',
    example: 'initializationPatterns',
    client1MemoryMode: client1.config.memory?.memoryProcessingMode,
    client2MemoryMode: client2.config.memory?.memoryProcessingMode,
    client3MemoryMode: client3.config.memory?.memoryProcessingMode,
  });

  // Clean up
  await Promise.all([client1.close(), client2.close(), client3.close()]);
}

/**
 * Example: Memory Configuration Options
 * Shows different memory recording configurations
 */
async function memoryConfigurationExample() {
  logInfo('=== Memory Configuration Example ===', { component: 'OpenAIUsageExample', example: 'memoryConfiguration' });

  // Configuration with auto ingestion
  const autoClient = new MemoriOpenAI({
    apiKey: 'your-api-key',
    memory: {
      enableChatMemory: true,
      memoryProcessingMode: 'auto',
    },
  });

  // Configuration with conscious ingestion
  const consciousClient = new MemoriOpenAI({
    apiKey: 'your-api-key',
    memory: {
      enableChatMemory: true,
      memoryProcessingMode: 'conscious',
    },
  });

  // Configuration with no ingestion (just storage)
  const storageClient = new MemoriOpenAI({
    apiKey: 'your-api-key',
    memory: {
      enableChatMemory: true,
      memoryProcessingMode: 'none',
    },
  });

  logInfo('Memory configurations created', {
    component: 'OpenAIUsageExample',
    example: 'memoryConfiguration',
    autoMode: autoClient.config.memory?.memoryProcessingMode,
    consciousMode: consciousClient.config.memory?.memoryProcessingMode,
    storageMode: storageClient.config.memory?.memoryProcessingMode,
  });

  // Clean up
  await Promise.all([autoClient.close(), consciousClient.close(), storageClient.close()]);
}

/**
 * Example: Error Handling and Resilience
 * Shows how memory recording failures don't break chat functionality
 */
async function errorHandlingExample() {
  logInfo('=== Error Handling Example ===', { component: 'OpenAIUsageExample', example: 'errorHandling' });

  try {
    // Create client with invalid API key to simulate authentication error
    const client = new MemoriOpenAI({
      apiKey: 'invalid-api-key',
      memory: {
        enableChatMemory: true,
      },
    });

    // This will fail with authentication error
    await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'This will fail' }],
    });
  } catch (error) {
    logInfo('Expected error caught in error handling example', {
      component: 'OpenAIUsageExample',
      example: 'errorHandling',
      error: error instanceof Error ? error.message : String(error),
    });

    // Memory recording errors don't break the main functionality
    // The OpenAI error is preserved exactly as it would be
  }
}

/**
 * Example: Metrics and Monitoring
 * Shows how to monitor memory recording performance
 */
async function metricsExample() {
  logInfo('=== Metrics and Monitoring Example ===', { component: 'OpenAIUsageExample', example: 'metrics' });

  const client = await MemoriOpenAIFromConfig({
    apiKey: 'your-api-key',
    memory: {
      enableChatMemory: true,
    },
  });

  // Get initial metrics
  const initialMetrics = await client.getMetrics();
  logInfo('Initial metrics retrieved', {
    component: 'OpenAIUsageExample',
    example: 'metrics',
    totalRequests: initialMetrics.totalRequests,
    memoryRecordingSuccess: initialMetrics.memoryRecordingSuccess,
    averageResponseTime: initialMetrics.averageResponseTime,
  });

  // Reset metrics for a clean test
  await client.resetMetrics();

  // Clean up
  await client.close();
}

// Export examples for use in other files
export {
  basicDropInExample,
  initializationPatternsExample,
  memoryConfigurationExample,
  errorHandlingExample,
  metricsExample,
};

/**
 * Run all examples (for demonstration purposes)
 * In real usage, you would only run the examples you need
 */
export async function runAllExamples() {
  logInfo('Starting MemoriOpenAI Usage Examples...\n', { component: 'OpenAIUsageExample', example: 'runAll' });

  try {
    await basicDropInExample();
    logInfo('\n' + '='.repeat(50) + '\n', { component: 'OpenAIUsageExample', example: 'separator' });

    await initializationPatternsExample();
    logInfo('\n' + '='.repeat(50) + '\n', { component: 'OpenAIUsageExample', example: 'separator' });

    await memoryConfigurationExample();
    logInfo('\n' + '='.repeat(50) + '\n', { component: 'OpenAIUsageExample', example: 'separator' });

    await errorHandlingExample();
    logInfo('\n' + '='.repeat(50) + '\n', { component: 'OpenAIUsageExample', example: 'separator' });

    await metricsExample();
  } catch (error) {
    logError('Error running examples', {
      component: 'OpenAIUsageExample',
      example: 'runAll',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// Run examples if this file is executed directly
if (typeof process !== 'undefined' && process.argv0) {
  console.log('⚠️  These examples require a valid OpenAI API key to run.');
  console.log('💡 Set your OPENAI_API_KEY environment variable to run examples.');
  console.log('💡 Note: Examples will demonstrate error handling for invalid keys.');

  // Uncomment to run examples:
  runAllExamples().catch(console.error);
}