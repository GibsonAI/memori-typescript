/**
 * Memori Class Usage Example - Conscious Memory Management
 *
 * This example demonstrates how to use the Memori class for conscious memory management.
 * Use this when you want to:
 * - Call the LLM externally (not through MemoriAI)
 * - Manually control when memories are recorded
 * - Have full control over memory processing
 */

import { Memori } from '../src/index';

async function consciousMemoryExample(): Promise<void> {
  console.log('🚀 Memori Conscious Memory Management Example');

  const memori = new Memori({
    databaseUrl: 'file:./memori.db',
    apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here',
    namespace: 'conscious-demo',
    mode: 'conscious' // Enable conscious mode for manual processing and control
  });

  try {
    // Enable Memori (required for conscious mode)
    await memori.enable();
    console.log('✅ Memori enabled in conscious mode');

    // Example 1: Manual memory recording after external LLM call
    console.log('\n📝 Example 1: Manual memory recording');
    console.log('=====================================');

    // Simulate external LLM call (you would call your own LLM here)
    const externalUserInput = 'What are the benefits of TypeScript?';
    const externalAIResponse = 'TypeScript provides static typing, better IDE support, early error detection, and improved code maintainability. It compiles to JavaScript and helps catch errors at compile time rather than runtime.';

    console.log(`💬 External LLM call: ${externalUserInput}`);
    console.log(`🤖 AI response: ${externalAIResponse.substring(0, 80)}...`);

    // Manually record the conversation in Memori
    const chatId = await memori.recordConversation(externalUserInput, externalAIResponse, {
      model: 'gpt-4o-mini',
      metadata: {
        source: 'external-llm-call',
        importance: 'high',
        category: 'programming-languages'
      }
    });

    console.log(`✅ Conversation recorded with ID: ${chatId}`);

    // Example 2: Process memories consciously (manual control)
    console.log('\n🧠 Example 2: Conscious memory processing');
    console.log('========================================');

    // Trigger conscious memory processing manually
    await memori.checkForConsciousContextUpdates();
    console.log('✅ Conscious memory processing triggered');

    // Wait a moment for processing
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Search memories using the processed content
    console.log('\n🔍 Searching processed memories...');
    const memories = await memori.searchMemories('TypeScript');

    if (memories.length > 0) {
      console.log(`✅ Found ${memories.length} processed memories`);
      memories.forEach((memory, index) => {
        console.log(`${index + 1}. ${memory.content?.substring(0, 100)}...`);
      });
    }

    // Example 3: Advanced conscious features
    console.log('\n🎛️ Example 3: Advanced conscious features');
    console.log('=========================================');

    // Get available search strategies
    const strategies = await memori.getAvailableSearchStrategies();
    console.log(`📋 Available search strategies: ${strategies.join(', ')}`);

    // Use specific search strategy
    const strategyResults = await memori.searchMemoriesWithStrategy(
      'programming',
      strategies[0], // Use first available strategy
      { limit: 3 }
    );

    console.log(`✅ Strategy search found ${strategyResults.length} results`);

    console.log('\n🎉 Conscious memory example completed successfully!');
    console.log('\n💡 Key Takeaways for Conscious Memory:');
    console.log('   • Use Memori class when you want manual control');
    console.log('   • Call LLM externally, then record conversations manually');
    console.log('   • Trigger memory processing consciously when needed');
    console.log('   • Access advanced features like consolidation and optimization');
    console.log('   • Full control over when and how memories are processed');

  } catch (error) {
    console.error('❌ Error in conscious memory example:', error instanceof Error ? error.message : String(error));
  } finally {
    await memori.close();
  }
}

// Example of how you would use this in a real application
async function realWorldUsagePattern(): Promise<void> {
  console.log('\n🌍 Real-World Usage Pattern');
  console.log('============================');

  const memori = new Memori({
    databaseUrl: 'file:./memori.db',
    namespace: 'my-application',
    mode: 'conscious' // Manual control with conscious processing
  });

  try {
    await memori.enable();

    // Your existing LLM integration
    async function callExternalLLM(userMessage: string): Promise<string> {
      // This is where you would call your existing LLM provider
      // (OpenAI, Anthropic, Ollama, etc.)
      console.log(`🤖 Calling external LLM: ${userMessage}`);
      return `Response to: ${userMessage}`;
    }

    // Use pattern: LLM call → Memory recording → Processing → Search
    const userQuestion = 'How do I implement authentication in Node.js?';
    const aiResponse = await callExternalLLM(userQuestion);

    // Record the conversation consciously
    await memori.recordConversation(userQuestion, aiResponse, {
      metadata: {
        topic: 'authentication',
        complexity: 'intermediate'
      }
    });

    // Process memories when convenient (not on every call)
    if (Math.random() > 0.8) { // Only process 20% of the time
      await memori.checkForConsciousContextUpdates();
    }

    // Search relevant memories for context
    const relevantMemories = await memori.searchMemories('Node.js authentication');

    console.log(`📚 Found ${relevantMemories.length} relevant memories for context`);

  } finally {
    await memori.close();
  }
}

async function main(): Promise<void> {
  await consciousMemoryExample();
  await realWorldUsagePattern();

  console.log('\n🎊 All conscious memory examples completed!');
}

main().catch(console.error);