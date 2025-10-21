/**
 * Example demonstrating the new SearchStrategy interface and base classes
 */

import {
  ISearchStrategy,
  BaseSearchStrategy,
  SearchResultBuilder,
  SearchCapability,
  SearchQuery,
  SearchResult,
  SearchStrategyMetadata,
  SearchError,
  StrategyValidator
} from '../src';

// Custom search strategy example
class CustomSearchStrategy extends BaseSearchStrategy {
  readonly name = 'custom';
  readonly description = 'Custom search strategy for demonstration';
  readonly capabilities = [SearchCapability.KEYWORD_SEARCH, SearchCapability.FILTERING];

  constructor() {
    super({
      enabled: true,
      priority: 5,
      timeout: 5000,
      maxResults: 10,
      minScore: 0.1
    }, {} as any); // DatabaseManager would be passed here
  }

  canHandle(query: SearchQuery): boolean {
    // Handle queries that contain specific keywords
    return query.text.includes('custom') || query.text.includes('example');
  }

  async search(query: SearchQuery): Promise<SearchResult[]> {
    try {
      // Simulate search operation
      const results: SearchResult[] = [];

      // Create some example results
      results.push(
        SearchResultBuilder.createSuccessful(
          '1',
          `Custom result for: ${query.text}`,
          { source: 'custom_strategy', confidence: 0.95 },
          0.95,
          this.name
        )
      );

      results.push(
        SearchResultBuilder.createSuccessful(
          '2',
          `Another custom result for: ${query.text}`,
          { source: 'custom_strategy', confidence: 0.85 },
          0.85,
          this.name
        )
      );

      this.logSearchOperation('custom_search', 100, results.length);
      return results;

    } catch (error) {
      throw this.handleSearchError(error, { query: query.text });
    }
  }

  protected validateStrategyConfiguration(): boolean {
    // Custom validation logic
    return this.config.enabled && this.config.priority > 0;
  }

  protected getConfigurationSchema(): Record<string, unknown> {
    return {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        priority: { type: 'number', minimum: 1, maximum: 100 },
        timeout: { type: 'number', minimum: 1000, maximum: 30000 },
        maxResults: { type: 'number', minimum: 1, maximum: 100 },
        minScore: { type: 'number', minimum: 0, maximum: 1 },
        customOption: { type: 'string' }
      },
      required: ['enabled']
    };
  }

  protected getPerformanceMetrics(): SearchStrategyMetadata['performanceMetrics'] {
    return {
      averageResponseTime: 75,
      throughput: 200,
      memoryUsage: 15
    };
  }
}

// Usage example
async function demonstrateSearchStrategy() {
  console.log('=== SearchStrategy Interface Demonstration ===\n');

  // Create custom strategy instance
  const customStrategy = new CustomSearchStrategy();

  // Validate the strategy
  const validationResult = await StrategyValidator.validateStrategy(customStrategy);

  console.log('Strategy validation result:');
  console.log('- Valid:', validationResult.isValid);
  console.log('- Errors:', validationResult.errors);
  console.log('- Warnings:', validationResult.warnings);

  if (validationResult.isValid) {
    console.log('\n✅ Custom strategy is valid and ready to use!');
  }

  // Get strategy metadata
  const metadata = customStrategy.getMetadata();
  console.log('\nStrategy metadata:');
  console.log('- Name:', metadata.name);
  console.log('- Description:', metadata.description);
  console.log('- Capabilities:', metadata.capabilities);
  console.log('- Version:', metadata.version);
  console.log('- Supported Memory Types:', metadata.supportedMemoryTypes);

  if (metadata.performanceMetrics) {
    console.log('- Performance Metrics:');
    console.log('  - Avg Response Time:', metadata.performanceMetrics.averageResponseTime, 'ms');
    console.log('  - Throughput:', metadata.performanceMetrics.throughput, 'queries/sec');
    console.log('  - Memory Usage:', metadata.performanceMetrics.memoryUsage, 'MB');
  }

  // Test the strategy
  const testQuery = {
    text: 'custom example search',
    limit: 5,
    includeMetadata: true
  };

  if (customStrategy.canHandle(testQuery)) {
    console.log('\n🔍 Testing custom strategy with query:', testQuery.text);

    try {
      const results = await customStrategy.search(testQuery);

      console.log(`Found ${results.length} results:`);
      results.forEach((result, index) => {
        console.log(`${index + 1}. [${result.score.toFixed(2)}] ${result.content}`);
        console.log(`   ID: ${result.id}, Strategy: ${result.strategy}`);
        if (result.metadata) {
          console.log(`   Metadata:`, result.metadata);
        }
        console.log('');
      });
    } catch (error) {
      if (error instanceof SearchError) {
        console.error('❌ Search error:', error.message);
        console.error('Strategy:', error.strategy);
        console.error('Context:', error.context);
      } else {
        console.error('❌ Unknown error:', error);
      }
    }
  } else {
    console.log('\n⚠️  Custom strategy cannot handle this query');
  }

  // Demonstrate SearchResultBuilder utilities
  console.log('\n=== SearchResultBuilder Utilities ===\n');

  const sampleResults = SearchResultBuilder.createBatch([
    { id: 'batch-1', content: 'Batch result 1', score: 0.9 },
    { id: 'batch-2', content: 'Batch result 2', metadata: { category: 'example' }, score: 0.8 },
    { id: 'batch-3', content: 'Batch result 3', score: 0.7 }
  ], 'batch_strategy');

  console.log('Created batch results:');
  sampleResults.forEach((result, index) => {
    console.log(`${index + 1}. ${result.content} (Score: ${result.score})`);
  });

  // Demonstrate error result creation
  const errorResult = SearchResultBuilder.createError(
    'Strategy execution failed',
    'example_strategy',
    { reason: 'timeout', limit: 10 }
  );

  console.log('\nError result example:');
  console.log('- Content:', errorResult.content);
  console.log('- Error:', errorResult.error);
  console.log('- Strategy:', errorResult.strategy);

  console.log('\n✅ SearchStrategy demonstration completed!');
}

// Error handling example
async function demonstrateErrorHandling() {
  console.log('\n=== Error Handling Demonstration ===\n');

  try {
    await demonstrateSearchStrategy();
  } catch (error) {
    console.error('❌ Demonstration failed:', error);
  }
}

// Export for use in other modules
export {
  CustomSearchStrategy,
  demonstrateSearchStrategy,
  demonstrateErrorHandling
};

// Run demonstration if this file is executed directly
if (typeof process !== 'undefined' && process.argv0) {
  demonstrateErrorHandling();
}