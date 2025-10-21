/**
 * MemoriAI Memory Search and Retrieval Example
 *
 * This example demonstrates memory search and retrieval capabilities using the unified MemoriAI API.
 * Shows how to create conversations with chat() and then search memories.
 */

import { MemoriAI } from '../src/index';

async function memorySearchExample(): Promise<void> {
  console.log('🚀 Starting MemoriAI Memory Search Example...\n');

  const ai = new MemoriAI({
    databaseUrl: 'file:./memories-search.db',
    apiKey: process.env.OPENAI_API_KEY || 'your-api-key-here',
    namespace: 'memory-search-demo'
  });

  try {
    // Create conversations using chat() - this automatically records memories
    console.log('💬 Creating conversations to build memory base...');

    const conversations = [
      'What are the benefits of functional programming?',
      'How does machine learning work?',
      'What are the principles of good software architecture?',
      'Explain the concept of blockchain technology.',
      'What are the key concepts in cloud computing?',
      'How do you approach debugging complex systems?'
    ];

    for (const userMessage of conversations) {
      console.log(`💬 Asking: ${userMessage.substring(0, 50)}...`);
      await ai.chat({
        messages: [{ role: 'user', content: userMessage }]
      });
    }

    console.log('✅ Conversations completed - memories recorded automatically');

    // Wait a moment for memory processing
    console.log('\n⏳ Waiting for memory processing...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    console.log('\n🔍 === MEMORY SEARCH DEMONSTRATIONS ===\n');

    // Basic keyword search
    console.log('1️⃣ Basic keyword search for "programming":');
    const programmingMemories = await ai.searchMemories('programming', { limit: 3 });
    programmingMemories.forEach((memory, index) => {
      console.log(`   ${index + 1}. ${memory.content?.substring(0, 100) || 'Memory content'}...`);
    });

    // Category-specific search
    console.log('\n2️⃣ Searching for artificial intelligence content:');
    const aiMemories = await ai.searchMemories('machine learning', { limit: 2 });
    aiMemories.forEach((memory, index) => {
      console.log(`   ${index + 1}. ${memory.content?.substring(0, 100) || 'Memory content'}...`);
    });

    // Architecture and design patterns
    console.log('\n3️⃣ Searching for software architecture concepts:');
    const architectureMemories = await ai.searchMemories('SOLID', { limit: 2 });
    architectureMemories.forEach((memory, index) => {
      console.log(`   ${index + 1}. ${memory.content?.substring(0, 100) || 'Memory content'}...`);
    });

    // Technology-specific search
    console.log('\n4️⃣ Searching for distributed systems (blockchain):');
    const blockchainMemories = await ai.searchMemories('blockchain', { limit: 2 });
    blockchainMemories.forEach((memory, index) => {
      console.log(`   ${index + 1}. ${memory.content?.substring(0, 100) || 'Memory content'}...`);
    });

    // Cloud computing search
    console.log('\n5️⃣ Searching for cloud computing concepts:');
    const cloudMemories = await ai.searchMemories('cloud computing', { limit: 2 });
    cloudMemories.forEach((memory, index) => {
      console.log(`   ${index + 1}. ${memory.content?.substring(0, 100) || 'Memory content'}...`);
    });

    // Debugging and troubleshooting
    console.log('\n6️⃣ Searching for debugging techniques:');
    const debugMemories = await ai.searchMemories('debugging', { limit: 2 });
    debugMemories.forEach((memory, index) => {
      console.log(`   ${index + 1}. ${memory.content?.substring(0, 100) || 'Memory content'}...`);
    });

    // Cross-topic search - finding related concepts
    console.log('\n7️⃣ Cross-topic search for "systems":');
    const systemsMemories = await ai.searchMemories('systems', { limit: 4 });
    systemsMemories.forEach((memory, index) => {
      console.log(`   ${index + 1}. ${memory.content?.substring(0, 100) || 'Memory content'}...`);
    });

    // Concept intersection search
    console.log('\n8️⃣ Concept intersection search for "learning":');
    const learningMemories = await ai.searchMemories('learning', { limit: 3 });
    learningMemories.forEach((memory, index) => {
      console.log(`   ${index + 1}. ${memory.content?.substring(0, 100) || 'Memory content'}...`);
    });

    // Pattern-based search
    console.log('\n9️⃣ Pattern-based search for "principles":');
    const principlesMemories = await ai.searchMemories('principles', { limit: 3 });
    principlesMemories.forEach((memory, index) => {
      console.log(`   ${index + 1}. ${memory.content?.substring(0, 100) || 'Memory content'}...`);
    });

    // Comprehensive search across all memories
    console.log('\n🔍📊 COMPREHENSIVE SEARCH RESULTS 📊🔍');
    console.log('\n🔍 Searching for "technology" across all memories:');
    const allTechMemories = await ai.searchMemories('technology', { limit: 10 });

    if (allTechMemories.length > 0) {
      console.log(`✅ Found ${allTechMemories.length} technology-related memories`);
      allTechMemories.forEach((memory, index) => {
        console.log(`\n${index + 1}. ${memory.content?.substring(0, 100) || 'Memory content'}...`);
      });
    }

    console.log('\n🎉 Memory search example completed successfully!');
    console.log('💡 This demonstrates how MemoriAI can retrieve relevant information');
    console.log('   across different topics and contexts based on semantic search.');

  } catch (error) {
    console.error('❌ Error in memory search example:', error instanceof Error ? error.message : String(error));
  } finally {
    await ai.close();
  }
}

// Run the example
memorySearchExample().catch(console.error);