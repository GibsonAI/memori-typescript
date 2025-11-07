import { CategoryMetadataExtractor, CategoryExtractionConfig } from '../../../src/core/domain/search/filtering/CategoryMetadataExtractor';
import { CategoryHierarchyManager } from '../../../src/core/domain/search/filtering/CategoryHierarchyManager';

describe('Simple Hierarchy Test', () => {
  it('should instantiate CategoryMetadataExtractor', () => {
    console.log('Creating hierarchy manager...');
    const hierarchyManager = new CategoryHierarchyManager();
    console.log('Hierarchy manager created');
    
    console.log('Creating extractor...');
    const config: Partial<CategoryExtractionConfig> = {
      enableMLExtraction: false,
      enablePatternExtraction: true,
      enableMetadataExtraction: true,
      confidenceThreshold: 0.3,
      maxCategoriesPerMemory: 3,
      enableCategoryNormalization: true,
      extractionTimeout: 100,
    };
    
    const extractor = new CategoryMetadataExtractor(hierarchyManager, config);
    console.log('Extractor created');
    
    expect(extractor).toBeDefined();
    expect(hierarchyManager).toBeDefined();
  });

  it('should create basic hierarchy node', () => {
    console.log('Testing basic hierarchy operations...');
    const hierarchyManager = new CategoryHierarchyManager();
    hierarchyManager.addCategory('Programming');
    hierarchyManager.addCategory('Languages', 'Programming');
    
    const node = hierarchyManager.getNode('Languages');
    console.log('Node:', node);
    
    expect(node).toBeDefined();
    expect(node?.name).toBe('Languages');
    expect(node?.fullPath).toBe('Programming/Languages');
  });
});