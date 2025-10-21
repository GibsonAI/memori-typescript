/**
   * Dual Memory Mode Example
   *
   * This example demonstrates the dual memory mode functionality in Memori:
   * 1. Auto-ingestion mode: Automatically processes conversations into memories
   * 2. Conscious ingestion mode: Stores conversations for manual processing
   * 3. Background monitoring for conscious updates
   * 4. Independent relationship extraction control
   */

import { Memori, ConfigManager } from '../src/index';
import { logInfo, logError } from '../src/core/infrastructure/config/Logger';

async function autoIngestionExample(): Promise<void> {
  logInfo('🤖 Auto-Ingestion Mode Example', { component: 'dual-memory-mode-example', mode: 'auto' });
  logInfo('=====================================', { component: 'dual-memory-mode-example', mode: 'auto' });

  const config = {
    databaseUrl: 'file:./memori.db',
    apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here',
    model: 'gpt-4o-mini',
    mode: 'automatic' as const
  };

  const memori = new Memori(config);
  await memori.enable();

  logInfo('✅ Auto-ingestion mode enabled', { component: 'dual-memory-mode-example', mode: 'auto' });
  logInfo('✅ Background monitoring: Disabled (not needed for auto mode)', { component: 'dual-memory-mode-example', mode: 'auto' });

  // Record conversations - they will be automatically processed
  await memori.recordConversation(
    'What is the capital of France?',
    'The capital of France is Paris.',
  );

  await memori.recordConversation(
    'What is 15 + 27?',
    '15 + 27 equals 42.',
  );

  logInfo('✅ Conversations automatically processed into memories', { component: 'dual-memory-mode-example', mode: 'auto' });

  try {
    await memori.close();
  } catch (error) {
    // Handle specific cleanup errors gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Engine is not yet connected') ||
        errorMessage.includes('Response from the Engine was empty') ||
        errorMessage.includes('database or disk is full') ||
        errorMessage.includes('disk I/O error')) {
      logInfo('Database cleanup error (non-critical)', {
        component: 'dual-memory-mode-example',
        mode: 'auto',
        error: errorMessage,
      });
    } else {
      logError('Error closing Memori instance', {
        component: 'dual-memory-mode-example',
        mode: 'auto',
        error: errorMessage,
      });
      // Don't fail the entire example for cleanup errors
    }
  }
}

async function consciousIngestionExample(): Promise<void> {
  logInfo('\n🧠 Conscious Ingestion Mode Example', { component: 'dual-memory-mode-example', mode: 'conscious' });
  logInfo('=====================================', { component: 'dual-memory-mode-example', mode: 'conscious' });

  const config = {
    databaseUrl: 'file:./memori.db',
    apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here',
    model: 'gpt-4o-mini',
    mode: 'conscious' as const
  };

  const memori = new Memori(config);
  await memori.enable();

  logInfo('✅ Conscious ingestion mode enabled', { component: 'dual-memory-mode-example', mode: 'conscious' });
  logInfo('✅ Background monitoring: Enabled (30-second intervals)', { component: 'dual-memory-mode-example', mode: 'conscious' });

  // Record conversations - they will be stored for conscious processing
  await memori.recordConversation(
    'What are the benefits of renewable energy?',
    'Renewable energy sources like solar and wind power reduce greenhouse gas emissions, decrease dependence on fossil fuels, and provide sustainable long-term energy solutions.',
  );

  await memori.recordConversation(
    'How does machine learning work?',
    'Machine learning is a subset of artificial intelligence that enables computers to learn and improve from experience without being explicitly programmed.',
  );

  logInfo('✅ Conversations stored for conscious processing', { component: 'dual-memory-mode-example', mode: 'conscious' });

  // Manually trigger conscious processing
  logInfo('🔄 Manually triggering conscious context updates...', { component: 'dual-memory-mode-example', mode: 'conscious' });
  await memori.checkForConsciousContextUpdates();

  // Configure background monitoring interval
  memori.setBackgroundUpdateInterval(60000); // 60 seconds
  logInfo('✅ Background monitoring interval set to 60 seconds', { component: 'dual-memory-mode-example', mode: 'conscious' });

  // Check if background monitoring is active
  logInfo(`✅ Background monitoring active: ${memori.isBackgroundMonitoringActive()}`, { component: 'dual-memory-mode-example', mode: 'conscious' });

  // Check mode status
  logInfo(`✅ Conscious mode enabled: ${memori.isConsciousModeEnabled()}`, { component: 'dual-memory-mode-example', mode: 'conscious' });
  logInfo(`✅ Auto mode enabled: ${memori.isAutoModeEnabled()}`, { component: 'dual-memory-mode-example', mode: 'conscious' });

  try {
    await memori.close();
  } catch (error) {
    // Handle specific cleanup errors gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Engine is not yet connected') ||
        errorMessage.includes('Response from the Engine was empty') ||
        errorMessage.includes('database or disk is full') ||
        errorMessage.includes('disk I/O error')) {
      logInfo('Database cleanup error (non-critical)', {
        component: 'dual-memory-mode-example',
        mode: 'conscious',
        error: errorMessage,
      });
    } else {
      logError('Error closing Memori instance', {
        component: 'dual-memory-mode-example',
        mode: 'conscious',
        error: errorMessage,
      });
      // Don't fail the entire example for cleanup errors
    }
  }
}

async function dualModeComparison(): Promise<void> {
  logInfo('\n⚖️ Dual Mode Comparison', { component: 'dual-memory-mode-example', mode: 'comparison' });
  logInfo('=====================================', { component: 'dual-memory-mode-example', mode: 'comparison' });

  const config = {
    databaseUrl: 'file:./memori.db',
    apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here',
    model: 'gpt-4o-mini',
    mode: 'manual' as const
  };

  const memori = new Memori(config);
  await memori.enable();

  logInfo('✅ Neither auto nor conscious mode enabled', { component: 'dual-memory-mode-example', mode: 'comparison' });
  logInfo('✅ Background monitoring: Disabled', { component: 'dual-memory-mode-example', mode: 'comparison' });

  // Record conversation without automatic processing
  await memori.recordConversation(
    'What is the weather like today?',
    'The weather is sunny and warm with a temperature of 25°C.',
  );

  logInfo('✅ Conversation stored without automatic processing', { component: 'dual-memory-mode-example', mode: 'comparison' });
  logInfo('✅ Manual processing would be required for memory creation', { component: 'dual-memory-mode-example', mode: 'comparison' });

  // Check mode status
  logInfo(`✅ Conscious mode enabled: ${memori.isConsciousModeEnabled()}`, { component: 'dual-memory-mode-example', mode: 'comparison' });
  logInfo(`✅ Auto mode enabled: ${memori.isAutoModeEnabled()}`, { component: 'dual-memory-mode-example', mode: 'comparison' });

  try {
    await memori.close();
  } catch (error) {
    // Handle specific cleanup errors gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Engine is not yet connected') ||
        errorMessage.includes('Response from the Engine was empty') ||
        errorMessage.includes('database or disk is full') ||
        errorMessage.includes('disk I/O error')) {
      logInfo('Database cleanup error (non-critical)', {
        component: 'dual-memory-mode-example',
        mode: 'comparison',
        error: errorMessage,
      });
    } else {
      logError('Error closing Memori instance', {
        component: 'dual-memory-mode-example',
        mode: 'comparison',
        error: errorMessage,
      });
      // Don't fail the entire example for cleanup errors
    }
  }
}

async function relationshipExtractionControlExample(): Promise<void> {
  logInfo('\n🔗 Relationship Extraction Control Example', { component: 'dual-memory-mode-example', mode: 'relationship-control' });
  logInfo('=============================================', { component: 'dual-memory-mode-example', mode: 'relationship-control' });

  // Example 1: Auto-ingestion with relationship extraction enabled (default)
  logInfo('\n📝 Example 1: Auto-ingestion WITH relationship extraction', { component: 'dual-memory-mode-example', mode: 'relationship-control' });

  const configWithRelationships = {
    databaseUrl: 'file:./memori.db',
    apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here',
    model: 'gpt-4o-mini',
    mode: 'automatic' as const,
    enableRelationshipExtraction: true
  };

  const memoriWithRelationships = new Memori(configWithRelationships);
  await memoriWithRelationships.enable();

  logInfo('✅ Auto-ingestion mode enabled', { component: 'dual-memory-mode-example', mode: 'relationship-control' });
  logInfo('✅ Relationship extraction: ENABLED', { component: 'dual-memory-mode-example', mode: 'relationship-control' });

  await memoriWithRelationships.recordConversation(
    'TypeScript provides excellent developer experience with static typing.',
    'Yes, static typing helps catch errors at compile time and improves code quality.',
  );

  logInfo('✅ Conversation processed with relationship extraction', { component: 'dual-memory-mode-example', mode: 'relationship-control' });
  try {
    await memoriWithRelationships.close();
  } catch (error) {
    // Handle specific cleanup errors gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Engine is not yet connected') ||
        errorMessage.includes('Response from the Engine was empty') ||
        errorMessage.includes('database or disk is full') ||
        errorMessage.includes('disk I/O error')) {
      logInfo('Database cleanup error (non-critical)', {
        component: 'dual-memory-mode-example',
        mode: 'relationship-control',
        error: errorMessage,
      });
    } else {
      logError('Error closing Memori instance', {
        component: 'dual-memory-mode-example',
        mode: 'relationship-control',
        error: errorMessage,
      });
      // Don't fail the entire example for cleanup errors
    }
  }

  // Example 2: Auto-ingestion with relationship extraction disabled
  logInfo('\n📝 Example 2: Auto-ingestion WITHOUT relationship extraction', { component: 'dual-memory-mode-example', mode: 'relationship-control' });

  const configWithoutRelationships = {
    databaseUrl: 'file:./memori.db',
    apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here',
    model: 'gpt-4o-mini',
    mode: 'automatic' as const,
    enableRelationshipExtraction: false
  };

  const memoriWithoutRelationships = new Memori(configWithoutRelationships);
  await memoriWithoutRelationships.enable();

  logInfo('✅ Auto-ingestion mode enabled', { component: 'dual-memory-mode-example', mode: 'relationship-control' });
  logInfo('✅ Relationship extraction: DISABLED', { component: 'dual-memory-mode-example', mode: 'relationship-control' });

  await memoriWithoutRelationships.recordConversation(
    'JavaScript is dynamically typed and very flexible.',
    'Dynamic typing allows for rapid prototyping but can lead to runtime errors.',
  );

  logInfo('✅ Conversation processed WITHOUT relationship extraction', { component: 'dual-memory-mode-example', mode: 'relationship-control' });
  try {
    await memoriWithoutRelationships.close();
  } catch (error) {
    // Handle specific cleanup errors gracefully
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('Engine is not yet connected') ||
        errorMessage.includes('Response from the Engine was empty') ||
        errorMessage.includes('database or disk is full') ||
        errorMessage.includes('disk I/O error')) {
      logInfo('Database cleanup error (non-critical)', {
        component: 'dual-memory-mode-example',
        mode: 'relationship-control',
        error: errorMessage,
      });
    } else {
      logError('Error closing Memori instance', {
        component: 'dual-memory-mode-example',
        mode: 'relationship-control',
        error: errorMessage,
      });
      // Don't fail the entire example for cleanup errors
    }
  }

  logInfo('💡 Relationship extraction can be controlled independently of ingestion mode', { component: 'dual-memory-mode-example', mode: 'relationship-control' });
}

async function main(): Promise<void> {
  logInfo('🚀 Memori Dual Memory Mode Examples', { component: 'dual-memory-mode-example' });
  logInfo('=====================================\n', { component: 'dual-memory-mode-example' });

  try {
    await autoIngestionExample();
    await consciousIngestionExample();
    await dualModeComparison();
    await relationshipExtractionControlExample();

    logInfo('\n🎉 All dual memory mode examples completed successfully!', { component: 'dual-memory-mode-example' });
  } catch (error) {
    logError('❌ Error in dual memory mode examples:', {
      component: 'dual-memory-mode-example',
      error: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof Error) {
      logError('Error message:', {
        component: 'dual-memory-mode-example',
        error: error.message,
      });
    }
  }
}

// Run the examples
main().catch((error) => {
  logError('Unhandled error in dual memory mode example', {
    component: 'dual-memory-mode-example',
    error: error instanceof Error ? error.message : String(error),
  });
});