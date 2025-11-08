/**
 * Test CategoryMetadataExtractor with minimal regex to avoid memory issues
 * This test focuses on the hierarchy integration without complex pattern matching
 */
import { CategoryHierarchyManager, CategoryMetadataExtractor, CategoryExtractionConfig, MemoryMetadata } from '../../../src/index';

describe('CategoryHierarchy Integration - Memory Safe', () => {
  let extractor: CategoryMetadataExtractor;
  let hierarchyManager: CategoryHierarchyManager;

  beforeEach(() => {
    hierarchyManager = new CategoryHierarchyManager();
    
    // Add test hierarchy
    hierarchyManager.addCategory('Technology');
    hierarchyManager.addCategory('Programming', 'Technology');
    hierarchyManager.addCategory('Databases', 'Technology');
    
    const config: Partial<CategoryExtractionConfig> = {
      enableMLExtraction: false,
      enablePatternExtraction: false, // Disable patterns to avoid regex issues
      enableMetadataExtraction: true,
      confidenceThreshold: 0.1,
      maxCategoriesPerMemory: 3,
      enableCategoryNormalization: true,
      extractionTimeout: 1000,
    };
    
    extractor = new CategoryMetadataExtractor(hierarchyManager, config);
  });

  afterEach(() => {
    hierarchyManager.clear();
    extractor.clearCache();
  });

  it('should extract categories from metadata with hierarchy paths', async () => {
    const metadata: MemoryMetadata = {
      content: 'test content',
      existingCategories: ['Programming', 'Databases']
    };
    
    const result = await extractor.extractCategories(metadata);
    
    expect(result.categories).toBeDefined();
    expect(result.categories.length).toBeGreaterThan(0);
    
    // Verify hierarchy paths are populated
    result.categories.forEach(category => {
      expect(category.hierarchyPath).toBeDefined();
      expect(typeof category.hierarchyPath).toBe('string');
    });
    
    // Check specific categories
    const progCategory = result.categories.find(cat => cat.name === 'Programming');
    if (progCategory) {
      expect(progCategory.hierarchyPath).toBe('Technology/Programming');
    }
    
    const dbCategory = result.categories.find(cat => cat.name === 'Databases');
    if (dbCategory) {
      expect(dbCategory.hierarchyPath).toBe('Technology/Databases');
    }
  });

  it('should use hierarchy manager for category resolution', () => {
    // Test hierarchy traversal
    const programmingNode = hierarchyManager.getNode('Programming');
    expect(programmingNode).toBeDefined();
    expect(programmingNode?.fullPath).toBe('Technology/Programming');
    
    // Test ancestors
    const ancestors = hierarchyManager.getAncestors('Programming');
    expect(ancestors.length).toBeGreaterThan(0);
    expect(ancestors[0].name).toBe('Technology');
    
    // Test descendants
    const descendants = hierarchyManager.getDescendants('Technology');
    expect(descendants.length).toBeGreaterThan(0);
  });

  it('should format categories for display with hierarchy', () => {
    const category = {
      name: 'Programming',
      hierarchyPath: 'Technology/Programming',
      confidence: 0.8,
      source: 'metadata' as const,
      normalizedName: 'programming',
      relevanceScore: 0.9,
    };
    
    const formatted = extractor.formatCategoryForDisplay(category);
    expect(formatted).toBe('Technology/Programming [from metadata]');
  });

  it('should handle cache operations with hierarchy', async () => {
    const metadata: MemoryMetadata = {
      content: 'test content',
      existingCategories: ['Programming']
    };
    
    // First call
    const result1 = await extractor.extractCategories(metadata);
    
    // Second call (should use cache)
    const result2 = await extractor.extractCategories(metadata);
    
    expect(result1).toEqual(result2);
    
    const cacheStats = extractor.getCacheStats();
    expect(cacheStats.enabled).toBe(true);
    expect(cacheStats.size).toBeGreaterThan(0);
  });

  it('should validate hierarchy structure', () => {
    const validation = hierarchyManager.validateHierarchy();
    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('should handle category relationships', () => {
    // Test descendant relationship
    const isDescendant = hierarchyManager.isDescendantOf('Programming', 'Technology');
    expect(isDescendant).toBe(true);
    
    // Test common ancestor
    const commonAncestor = hierarchyManager.getCommonAncestor(['Programming', 'Databases']);
    expect(commonAncestor).toBeDefined();
    expect(commonAncestor?.name).toBe('Technology');
  });
});