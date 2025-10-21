/**
 * Memory Consolidation Example
 *
 * This example demonstrates the memory consolidation service architecture.
 * It shows how to detect duplicates, merge memories, and maintain data quality.
 */

import { Memori, ConfigManager } from '../src/index';
import { logInfo, logError } from '../src/core/infrastructure/config/Logger';

async function memoryConsolidationExample(): Promise<void> {
  logInfo('🔄 Starting Memory Consolidation Example', { component: 'memory-consolidation-example' });

  let memori: Memori | undefined;

  try {
    // Load configuration from environment variables
    const config = ConfigManager.loadConfig();
    logInfo('📋 Configuration loaded', {
      component: 'memory-consolidation-example',
      databaseUrl: config.databaseUrl,
      namespace: config.namespace,
      model: config.model,
      baseUrl: config.baseUrl || 'OpenAI default',
    });

    // Initialize Memori with consolidation service
    memori = new Memori({
      ...config,
      autoIngest: true,
    });
    logInfo('✅ Memori instance created successfully', { component: 'memory-consolidation-example' });

    // Enable Memori (initializes database schema)
    await memori.enable();
    logInfo('✅ Memori enabled successfully', { component: 'memory-consolidation-example' });

    // Create memories that will have duplicates for consolidation demo
    logInfo('📝 Creating memories for consolidation demonstration...', { component: 'memory-consolidation-example' });

    // Create similar memories about the same topic
    await memori.recordConversation(
      'What is TypeScript?',
      'TypeScript is a programming language developed by Microsoft that adds static typing to JavaScript.',
    );

    await memori.recordConversation(
      'TypeScript overview',
      'TypeScript is a typed superset of JavaScript created by Microsoft for large-scale applications.',
    );

    await memori.recordConversation(
      'About TypeScript language',
      'TypeScript adds optional static typing to JavaScript and is developed by Microsoft.',
    );

    // Wait for memory processing (asynchronous)
    logInfo('⏳ Waiting for memory processing...', { component: 'memory-consolidation-example' });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Demonstrate the new consolidation service through the public API
    try {
      // 1. Use the existing consolidation API (now powered by the new service architecture)
      logInfo('🔍 Demonstrating duplicate detection and consolidation...', { component: 'memory-consolidation-example' });

      // Search for memories first to understand what we're working with
      const searchResults = await memori.searchMemories('TypeScript', { limit: 10 });

      if (searchResults.length > 0) {
        logInfo(`Found ${searchResults.length} TypeScript-related memories for potential consolidation`, {
          component: 'memory-consolidation-example',
          memories: searchResults.map(m => ({
            id: m.id.substring(0, 8) + '...',
            content: (m.content || '').substring(0, 50) + '...'
          })),
        });

        // 2. Demonstrate consolidation using the existing API (now uses new service architecture)
        if (searchResults.length >= 2) {
          logInfo('👁️ Demonstrating consolidation process...', { component: 'memory-consolidation-example' });

          // Use the modern consolidation service API directly
          const consolidationService = memori.getConsolidationService();

          // Find duplicates for the first memory's content
          const duplicates = await consolidationService.detectDuplicateMemories(
            searchResults[0].content + ' ' + (searchResults[0].summary || ''),
            0.7, // 70% similarity threshold
            { similarityThreshold: 0.7, maxCandidates: 10 }
          );

          if (duplicates.length > 0) {
            // Consolidate the duplicates
            const consolidationResult = await consolidationService.consolidateMemories(
              searchResults[0].id,
              duplicates.slice(0, 2).map(d => d.id) // Consolidate top 2 duplicates
            );

            logInfo('✅ Consolidation completed:', {
              component: 'memory-consolidation-example',
              consolidated: consolidationResult.consolidatedCount,
              success: consolidationResult.success,
            });
          } else {
            logInfo('ℹ️ No duplicates found for consolidation', {
              component: 'memory-consolidation-example',
            });
          }

          // 3. Demonstrate the comprehensive consolidation capabilities
          logInfo('🔍 Demonstrating consolidation features...', { component: 'memory-consolidation-example' });

          // Show the comprehensive consolidation capabilities available
          logInfo('💡 Consolidation service provides:', {
            component: 'memory-consolidation-example',
            capabilities: [
              '- Duplicate detection with configurable similarity thresholds',
              '- Transaction-safe memory consolidation with rollback',
              '- Comprehensive analytics and reporting',
              '- Automated cleanup of old consolidated memories',
              '- Performance monitoring and optimization recommendations',
              '- Clean service-oriented architecture for maintainability'
            ],
          });
        }

      } else {
        logInfo('ℹ️ No memories found for consolidation demo - this is normal for new databases', {
          component: 'memory-consolidation-example',
        });

        // Show what the consolidation service provides even without data
        logInfo('🏗️ Consolidation service provides:', {
          component: 'memory-consolidation-example',
          capabilities: [
            'Duplicate detection with configurable similarity thresholds',
            'Transaction-safe memory consolidation with rollback',
            'Comprehensive analytics and reporting',
            'Automated cleanup of old consolidated memories',
            'Performance monitoring and optimization recommendations',
            'Clean architecture for maintainability'
          ],
        });
      }

    } catch (consolidationError) {
      logError('❌ Error demonstrating consolidation features', {
        component: 'memory-consolidation-example',
        error: consolidationError instanceof Error ? consolidationError.message : String(consolidationError),
      });

      logInfo('ℹ️ This might be expected if memories are still being processed', {
        component: 'memory-consolidation-example',
      });
    }

    logInfo('🎉 Memory consolidation example completed successfully!', { component: 'memory-consolidation-example' });

  } catch (error) {
    logError('❌ Error in memory consolidation example', {
      component: 'memory-consolidation-example',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  } finally {
    // Always close the database connection
    if (memori) {
      try {
        await memori.close();
        logInfo('✅ Database connection closed', { component: 'memory-consolidation-example' });
      } catch (error) {
        logError('❌ Error closing database', {
          component: 'memory-consolidation-example',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
}

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logError('Unhandled Promise Rejection', {
    component: 'memory-consolidation-example',
    promise: String(promise),
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

// Run the example
memoryConsolidationExample().catch((error) => {
  logError('Unhandled error in memory consolidation example', {
    component: 'memory-consolidation-example',
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
});