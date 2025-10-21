// src/integrations/openai-dropin/example.ts
// Example usage of MemoriOpenAI as a drop-in replacement for OpenAI SDK
// Demonstrates all initialization patterns and basic usage

import {
  MemoriOpenAIFromConfig,
  MemoriOpenAIFromEnv,
  MemoriOpenAIFromDatabase,
} from './index';
import MemoriOpenAI from './index';
import { logInfo, logError } from '../../core/infrastructure/config/Logger';

/**
 * Example 1: Simple drop-in replacement (most common use case)
 * Replace OpenAI import with MemoriOpenAI - no other code changes needed!
 */
async function basicDropInExample() {
  logInfo('=== Basic Drop-in Example ===', { component: 'OpenAIExample', example: 'basicDropIn' });

  // Pattern 1: Traditional configuration object (current pattern)
   const client = new MemoriOpenAI({
     apiKey: 'your-api-key',
     memory: {
       enableChatMemory: true,
     },
     baseUrl: 'https://api.openai.com/v1', // Supports baseURL option
   });

  try {
    // Use exactly like OpenAI client - memory recording happens automatically
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: 'Hello! Remember this conversation for later.' },
      ],
    });

    logInfo('Response received', {
      component: 'OpenAIExample',
      example: 'basicDropIn',
      responseLength: response.choices[0]?.message?.content?.length || 0,
    });

    // Memory was automatically recorded - you can search it
    const memories = await client.memory.searchMemories('Hello');
    logInfo('Memory search completed', {
      component: 'OpenAIExample',
      example: 'basicDropIn',
      memoriesFound: memories.length,
    });

    await client.close();
  } catch (error) {
    logError('Error in basic example', {
      component: 'OpenAIExample',
      example: 'basicDropIn',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Example 2: Environment-based configuration
 * Configure everything through environment variables
 */
async function environmentExample() {
  logInfo('=== Environment Configuration Example ===', { component: 'OpenAIExample', example: 'environment' });

  // Set environment variables (in real usage, these would be set in your environment)
  process.env.OPENAI_API_KEY = 'your-api-key';
  process.env.MEMORI_DATABASE_URL = 'sqlite:./memori-env.db';
  process.env.MEMORI_NAMESPACE = 'env-session';
  process.env.MEMORI_AUTO_INGEST = 'true';
  process.env.MEMORI_PROCESSING_MODE = 'auto';

  try {
    const client = await MemoriOpenAIFromEnv('your-api-key', {
      memory: {
        enableChatMemory: true,
      },
    });

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: 'This is configured via environment variables!' },
      ],
    });

    logInfo('Environment example response received', {
      component: 'OpenAIExample',
      example: 'environment',
      responseLength: response.choices[0]?.message?.content?.length || 0,
    });
    await client.close();
  } catch (error) {
    logError('Error in environment example', {
      component: 'OpenAIExample',
      example: 'environment',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Example 3: Database URL configuration
 * Specify a custom database location
 */
async function databaseExample() {
  logInfo('=== Database URL Configuration Example ===', { component: 'OpenAIExample', example: 'database' });

  try {
    const client = await MemoriOpenAIFromDatabase(
      'your-api-key',
      'sqlite:./custom-memori.db',
      {
        memory: {
          enableChatMemory: true,
          memoryProcessingMode: 'conscious',
        },
      },
    );

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: 'This conversation is stored in a custom database!' },
      ],
    });

    logInfo('Database example response received', {
      component: 'OpenAIExample',
      example: 'database',
      responseLength: response.choices[0]?.message?.content?.length || 0,
    });
    await client.close();
  } catch (error) {
    logError('Error in database example', {
      component: 'OpenAIExample',
      example: 'database',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Example 4: Advanced configuration
 * Full control over all memory settings
 */
async function advancedExample() {
  logInfo('=== Advanced Configuration Example ===', { component: 'OpenAIExample', example: 'advanced' });

  try {
    const client = await MemoriOpenAIFromConfig({
      apiKey: 'your-api-key',
      memory: {
        enableChatMemory: true,
        enableEmbeddingMemory: false,
        memoryProcessingMode: 'auto',
        minImportanceLevel: 'medium' as any,
      },
      model: 'gpt-4o-mini',
    });

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: 'This is an advanced configuration example!' },
      ],
    });

    logInfo('Advanced example response received', {
      component: 'OpenAIExample',
      example: 'advanced',
      responseLength: response.choices[0]?.message?.content?.length || 0,
    });

    // Check memory statistics
    const stats = await client.memory.getMemoryStats();
    logInfo('Memory statistics retrieved', {
      component: 'OpenAIExample',
      example: 'advanced',
      stats,
    });

    await client.close();
  } catch (error) {
    logError('Error in advanced example', {
      component: 'OpenAIExample',
      example: 'advanced',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Example 5: Migration from existing OpenAI code
 * How to migrate existing code with minimal changes
 */
async function migrationExample() {
  logInfo('=== Migration Example ===', { component: 'OpenAIExample', example: 'migration' });

  // BEFORE (existing OpenAI code):
  /*
  import OpenAI from 'openai';
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: 'Hello!' }]
  });
  */

  // AFTER (just change the import and constructor):
  const client = new MemoriOpenAI({
    apiKey: process.env.OPENAI_API_KEY!,
    memory: {
      enableChatMemory: true,
    },
  });

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Hello! This is migrated code!' }],
    });

    logInfo('Migration example response received', {
      component: 'OpenAIExample',
      example: 'migration',
      responseLength: response.choices[0]?.message?.content?.length || 0,
    });
    await client.close();
  } catch (error) {
    logError('Error in migration example', {
      component: 'OpenAIExample',
      example: 'migration',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Example 6: Error handling and recovery
 * Demonstrates graceful error handling
 */
async function errorHandlingExample() {
  logInfo('=== Error Handling Example ===', { component: 'OpenAIExample', example: 'errorHandling' });

  try {
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
      component: 'OpenAIExample',
      example: 'errorHandling',
      error: error instanceof Error ? error.message : String(error),
    });

    // Memory recording errors don't break the main functionality
    // The OpenAI error is preserved exactly as it would be
  }
}

/**
 * Example 7: OpenAI SDK pattern with baseURL
 * Use the exact same pattern as OpenAI SDK
 */
async function openaiSDKPatternExample() {
  logInfo('=== OpenAI SDK Pattern Example ===', { component: 'OpenAIExample', example: 'openaiSDKPattern' });

  try {
    // Pattern 2: OpenAI SDK style constructor with baseURL support
    const client = new MemoriOpenAI({
      apiKey: 'your-api-key',
      baseUrl: 'https://api.openai.com/v1', // Direct baseURL support
      options: {
        organization: 'your-org-id',
        project: 'your-project-id',
      },
      memory: {
        enableChatMemory: true,
      },
    });

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: 'This uses the OpenAI SDK pattern with baseURL!' },
      ],
    });

    logInfo('OpenAI SDK pattern response received', {
      component: 'OpenAIExample',
      example: 'openaiSDKPattern',
      responseLength: response.choices[0]?.message?.content?.length || 0,
    });
    await client.close();
  } catch (error) {
    logError('Error in OpenAI SDK pattern example', {
      component: 'OpenAIExample',
      example: 'openaiSDKPattern',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Example 8: Memory search and retrieval
 * How to search and use stored memories
 */
async function memorySearchExample() {
  logInfo('=== Memory Search Example ===', { component: 'OpenAIExample', example: 'memorySearch' });

  try {
    const client = new MemoriOpenAI({
      apiKey: 'your-api-key',
      memory: {
        enableChatMemory: true,
      },
    });

    // Have a conversation to create memories
    await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: 'My name is Alice and I love TypeScript programming.' },
      ],
    });

    await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'user', content: 'I work on AI projects and enjoy reading sci-fi books.' },
      ],
    });

    // Search for memories
    const memories = await client.memory.searchMemories('Alice', {
      limit: 5,
      minImportance: 'medium' as any,
    });

    logInfo('Alice memories search completed', {
      component: 'OpenAIExample',
      example: 'memorySearch',
      memoriesFound: memories.length,
      memoryPreviews: memories.map((m, i) => `${i + 1}. ${m.content.substring(0, 100)}...`),
    });

    // Search for programming-related memories
    const programmingMemories = await client.memory.searchMemories('programming');
    logInfo('Programming memories search completed', {
      component: 'OpenAIExample',
      example: 'memorySearch',
      programmingMemoriesFound: programmingMemories.length,
    });

    await client.close();
  } catch (error) {
    logError('Error in memory search example', {
      component: 'OpenAIExample',
      example: 'memorySearch',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Run all examples (for demonstration purposes)
 * In real usage, you would only run the examples you need
 */
export async function runAllExamples() {
  logInfo('Starting MemoriOpenAI Examples...\n', { component: 'OpenAIExample', example: 'runAll' });

  try {
    await basicDropInExample();
    logInfo('\n' + '='.repeat(50) + '\n', { component: 'OpenAIExample', example: 'separator' });

    await openaiSDKPatternExample();
    logInfo('\n' + '='.repeat(50) + '\n', { component: 'OpenAIExample', example: 'separator' });

    await environmentExample();
    logInfo('\n' + '='.repeat(50) + '\n', { component: 'OpenAIExample', example: 'separator' });

    await databaseExample();
    logInfo('\n' + '='.repeat(50) + '\n', { component: 'OpenAIExample', example: 'separator' });

    await advancedExample();
    logInfo('\n' + '='.repeat(50) + '\n', { component: 'OpenAIExample', example: 'separator' });

    await migrationExample();
    logInfo('\n' + '='.repeat(50) + '\n', { component: 'OpenAIExample', example: 'separator' });

    await memorySearchExample();
    logInfo('\n' + '='.repeat(50) + '\n', { component: 'OpenAIExample', example: 'separator' });

    await errorHandlingExample();
  } catch (error) {
    logError('Error running examples', {
      component: 'OpenAIExample',
      example: 'runAll',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

// Export individual examples for selective usage
export {
  basicDropInExample,
  openaiSDKPatternExample,
  environmentExample,
  databaseExample,
  advancedExample,
  migrationExample,
  errorHandlingExample,
  memorySearchExample,
};

// If this file is run directly, execute all examples
if (typeof process !== 'undefined' && process.argv0) {
  runAllExamples().catch((error) => {
    logError('Unhandled error in OpenAI examples', {
      component: 'OpenAIExample',
      example: 'main',
      error: error instanceof Error ? error.message : String(error),
    });
  });
}