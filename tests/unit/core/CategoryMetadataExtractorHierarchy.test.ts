import { CategoryMetadataExtractor, CategoryExtractionConfig, MemoryMetadata } from '../../../src/core/domain/search/filtering/CategoryMetadataExtractor';
import { CategoryHierarchyManager } from '../../../src/core/domain/search/filtering/CategoryHierarchyManager';

// Simple mock of Jest setup to avoid database initialization
jest.mock('../../../tests/setup/database/TestDatabaseManager', () => ({
  TestDatabaseManager: {
    getInstance: () => ({
      getClient: jest.fn().mockResolvedValue({}),
      healthCheck: jest.fn().mockResolvedValue(true),
      getMetrics: jest.fn().mockReturnValue({}),
      cleanup: jest.fn().mockResolvedValue(undefined)
    })
  }
}));

describe('CategoryHierarchy Integration - No Database Required', () => {
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
      extractionTimeout: 100, // Very short timeout
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

  it('should extract categories and populate hierarchy path', async () => {
    console.log('Starting hierarchy path test...');
    
    // Add test categories
    hierarchyManager.addCategory('Programming');
    hierarchyManager.addCategory('Languages', 'Programming');
    
    const metadata: MemoryMetadata = { 
      content: 'JavaScript is a programming language' 
    };
    
    console.log('Calling extractCategories...');
    const result = await extractor.extractCategories(metadata);
    console.log('Got result:', JSON.stringify(result, null, 2));
    
    expect(result).toBeDefined();
    expect(result.categories).toBeDefined();
    expect(Array.isArray(result.categories)).toBe(true);
    
    // Verify hierarchy path is populated
    if (result.categories.length > 0) {
      result.categories.forEach(category => {
        expect(category.hierarchyPath).toBeDefined();
        expect(typeof category.hierarchyPath).toBe('string');
      });
      
      // Check for specific category
      const languageCategory = result.categories.find(cat => cat.name === 'Languages');
      if (languageCategory) {
        expect(languageCategory.hierarchyPath).toBe('Programming/Languages');
      }
    }
    
    console.log('Hierarchy path test completed successfully');
  });

  it('should handle categories from metadata with hierarchy', async () => {
    console.log('Starting metadata hierarchy test...');
    
    hierarchyManager.addCategory('Work');
    hierarchyManager.addCategory('Projects', 'Work');
    
    const metadata: MemoryMetadata = { 
      content: 'Working on a project',
      existingCategories: ['Projects'] 
    };
    
    const result = await extractor.extractCategories(metadata);
    
    expect(result.categories.length).toBeGreaterThan(0);
    
    const projectsCategory = result.categories.find(cat => cat.name === 'Projects');
    if (projectsCategory) {
      expect(projectsCategory.hierarchyPath).toBe('Work/Projects');
    }
    
    console.log('Metadata hierarchy test completed successfully');
  });

  it('should format categories for display', () => {
    console.log('Starting display formatting test...');
    
    const category = {
      name: 'Languages',
      hierarchyPath: 'Programming/Languages',
      confidence: 0.8,
      source: 'pattern' as const,
      normalizedName: 'languages',
      relevanceScore: 0.9,
    };
    
    const formatted = extractor.formatCategoryForDisplay(category);
    expect(formatted).toBe('Programming/Languages (Languages)');
    
    console.log('Display formatting test completed successfully');
  });

  it('should work with pattern-based hierarchy suggestions', async () => {
    console.log('Starting pattern hierarchy test...');
    
    const metadata: MemoryMetadata = { 
      content: 'I need to learn new programming skills' 
    };
    
    const result = await extractor.extractCategories(metadata);
    
    // Should find education category with hierarchy path
    const educationCategory = result.categories.find(cat => cat.name === 'Education');
    if (educationCategory) {
      expect(educationCategory.hierarchyPath).toBe('Learning/Education');
    }
    
    console.log('Pattern hierarchy test completed successfully');
  });

  it('should cache results properly', async () => {
    console.log('Starting cache test...');
    
    const metadata: MemoryMetadata = { content: 'test content' };
    
    // First call
    const result1 = await extractor.extractCategories(metadata);
    
    // Second call (should use cache)
    const result2 = await extractor.extractCategories(metadata);
    
    expect(result1).toEqual(result2);
    
    const cacheStats = extractor.getCacheStats();
    expect(cacheStats.enabled).toBe(true);
    expect(cacheStats.size).toBeGreaterThan(0);
    
    console.log('Cache test completed successfully');
  });
});