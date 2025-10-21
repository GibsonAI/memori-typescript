/**
 * MemoriAI Usage Example - Unified API (Automatic Memory)
 *
 * This example demonstrates the unified MemoriAI API where LLM calls and memory
 * management are handled together automatically.
 */

import { MemoriAI } from '../src/index';

async function basicUsageExample(): Promise<void> {
  console.log('🚀 Starting Basic MemoriAI Usage Example');

  const ai = new MemoriAI({
    databaseUrl: 'file:./memori.db',
    apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here',
    baseUrl: 'http://localhost:11434/v1',
    model: 'gpt-oss:20b',
    provider: 'ollama',
    mode: 'automatic'
  });

  try {
    // Chat with automatic memory recording
    console.log('\n💬 Starting conversation...');
    const response = await ai.chat({
      messages: [
        { role: 'user', content: 'What is TypeScript and why should I use it?' }
      ]
    });

    console.log('\n✅ Response:', response.message.content);
    console.log(`Waiting 10 seconds to ensure memory is saved...`);
    await Promise.resolve(new Promise(res => setTimeout(res, 10000)));

    // Search memories
    console.log('🔍 Searching memories...');
    const memories = await ai.searchMemories('TypeScript');

    if (memories.length > 0) {
      console.log(`✅ Found ${memories.length} memories`);
      memories.forEach((memory, index) => {
        console.log(`${index + 1}. ${memory.content.substring(0, 100)}...`);
      });
    }

    console.log('\n🎉 Basic usage example completed!');
  } catch (error) {
    console.error('\n❌ Error during example:', error);
  } finally {
    await ai.close();
  }
}

// Run the example
basicUsageExample().catch(console.error);