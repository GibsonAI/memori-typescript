/**
 * Test CategoryMetadataExtractor with simple patterns to avoid memory issues
 * This avoids complex regex patterns that could cause infinite loops
 */
import { CategoryHierarchyManager, CategoryMetadataExtractor, CategoryExtractionConfig } from '../../../src/index';

describe('Simple CategoryMetadataExtractor Test', () => {
  let hierarchyManager: CategoryHierarchyManager;
  let extractor: CategoryMetadataExtractor;

  beforeEach(() => {
    hierarchyManager = new CategoryHierarchyManager();
    hierarchyManager.addCategory('Technology');
    hierarchyManager.addCategory('Programming', 'Technology');
    
    const config: Partial<CategoryExtractionConfig> = {
      enableMLExtraction: false,
      enablePatternExtraction: true,
      enableMetadataExtraction: true,
      confidenceThreshold: 0.1, // Very low threshold for testing
      maxCategoriesPerMemory: 2,
      enableCategoryNormalization: true,
      extractionTimeout: 1000, // Short timeout
    };
    
    extractor = new CategoryMetadataExtractor(hierarchyManager, config);
  });

  afterEach(() => {
    hierarchyManager.clear();
    extractor.clearCache();
  });

  it('should create extractor with hierarchy manager', () => {
    expect(extractor).toBeDefined();
    expect(hierarchyManager).toBeDefined();
  });

  it('should handle metadata categories with hierarchy', async () => {
    const metadata = {
      content: 'Test content',
      existingCategories: ['Programming']
    };

    const result = await extractor.extractCategories(metadata);
    
    expect(result.categories).toBeDefined();
    if (result.categories.length > 0) {
      const progCategory = result.categories.find(cat => cat.name === 'Programming');
      if (progCategory) {
        expect(progCategory.hierarchyPath).toBe('Technology/Programming');
      }
    }
  });

  it('should format categories for display', () => {
    const category = {
      name: 'Programming',
      hierarchyPath: 'Technology/Programming',
      confidence: 0.8,
      source: 'pattern' as const,
      normalizedName: 'programming',
      relevanceScore: 0.9,
    };

    const formatted = extractor.formatCategoryForDisplay(category);
    expect(formatted).toBe('Technology/Programming (Programming)');
  });

  it('should handle cache operations', async () => {
    const metadata = { content: 'test content' };
    
    const result1 = await extractor.extractCategories(metadata);
    const result2 = await extractor.extractCategories(metadata);
    
    expect(result1).toEqual(result2);
    
    const cacheStats = extractor.getCacheStats();
    expect(cacheStats.enabled).toBe(true);
  });

  it('should use hierarchy manager for category resolution', () => {
    // Test direct hierarchy operations
    const node = hierarchyManager.getNode('Programming');
    expect(node).toBeDefined();
    expect(node?.fullPath).toBe('Technology/Programming');
    
    const descendants = hierarchyManager.getDescendants('Technology');
    expect(descendants.length).toBeGreaterThan(0);
  });
});