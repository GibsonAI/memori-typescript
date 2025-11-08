import { CategoryMetadataExtractor, CategoryExtractionConfig, MemoryMetadata } from '../../../src/core/domain/search/filtering/CategoryMetadataExtractor';
import { CategoryHierarchyManager } from '../../../src/core/domain/search/filtering/CategoryHierarchyManager';

describe('Extract Categories Test', () => {
  let extractor: CategoryMetadataExtractor;
  let hierarchyManager: CategoryHierarchyManager;

  beforeEach(() => {
    hierarchyManager = new CategoryHierarchyManager();
    const config: Partial<CategoryExtractionConfig> = {
      enableMLExtraction: false,
      enablePatternExtraction: true,
      enableMetadataExtraction: true,
      confidenceThreshold: 0.3,
      maxCategoriesPerMemory: 3,
      enableCategoryNormalization: true,
      extractionTimeout: 100,
    };
    extractor = new CategoryMetadataExtractor(hierarchyManager, config);
  });

  it('should call extractCategories without hanging', async () => {
    console.log('Starting extractCategories test...');
    
    const metadata: MemoryMetadata = { 
      content: 'JavaScript is a programming language' 
    };
    
    console.log('About to call extractCategories...');
    const result = await extractor.extractCategories(metadata);
    console.log('extractCategories completed:', JSON.stringify(result, null, 2));
    
    expect(result).toBeDefined();
    expect(result.categories).toBeDefined();
    expect(Array.isArray(result.categories)).toBe(true);
    
    console.log('extractCategories test completed successfully');
  });

  it('should test pattern extraction separately', async () => {
    console.log('Testing pattern extraction...');
    
    const metadata: MemoryMetadata = {
      content: 'JavaScript is a programming language'
    };
    
    // Test through the main API instead of calling private method
    const result = await extractor.extractCategories(metadata);
    console.log('Pattern extraction test result:', result);
    
    expect(result).toBeDefined();
    expect(result.categories).toBeDefined();
    expect(Array.isArray(result.categories)).toBe(true);
    
    console.log('Pattern extraction test completed');
  });
});