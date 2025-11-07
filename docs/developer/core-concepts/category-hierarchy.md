# Category Hierarchy System

The Category Hierarchy system provides sophisticated category management with hierarchical context, intelligent extraction, and advanced relationship handling. This document covers the complete implementation and usage.

## Overview

The system consists of two main components working together:

- **`CategoryHierarchyManager`** - Manages hierarchical category structures and relationships
- **`CategoryMetadataExtractor`** - Extracts categories from content and resolves hierarchy paths

## Architecture

### CategoryHierarchyManager

Located in `src/core/domain/search/filtering/CategoryHierarchyManager.ts`, this component handles:

#### Core Operations

```typescript
import { CategoryHierarchyManager } from 'memorits';

const manager = new CategoryHierarchyManager();

// Add single category
manager.addCategory('Programming/Languages');
manager.addCategory('Programming/Frameworks', 'Programming');
manager.addCategory('Technology/Databases', 'Technology');

// Build hierarchy from array
const categories = ['Programming/Languages', 'Programming/Frameworks', 'Technology/Cloud'];
const root = manager.buildHierarchy(categories);
```

#### Hierarchy Traversal

```typescript
// Get all descendants
const descendants = manager.getDescendants('Programming');
// Returns: [{ name: 'Languages', fullPath: 'Programming/Languages', ... }, ...]

// Get all ancestors
const ancestors = manager.getAncestors('Languages');
// Returns: [{ name: 'Programming', fullPath: 'Programming', ... }]

// Check relationships
const isDescendant = manager.isDescendantOf('Languages', 'Programming');
// Returns: true

// Find common ancestor
const common = manager.getCommonAncestor(['Languages', 'Frameworks']);
// Returns: { name: 'Programming', fullPath: 'Programming', ... }
```

#### Search and Validation

```typescript
// Search categories
const matches = manager.searchCategories('frame', 5);
// Returns: [{ name: 'Frameworks', fullPath: 'Programming/Frameworks', ... }]

// Validate hierarchy
const validation = manager.validateHierarchy();
// Returns: { isValid: boolean, errors: string[] }

// Export/Import hierarchy
const exported = manager.exportHierarchy();
manager.importHierarchy(exported);
```

### CategoryMetadataExtractor

Located in `src/core/domain/search/filtering/CategoryMetadataExtractor.ts`, this component handles:

#### Basic Usage

```typescript
import { CategoryMetadataExtractor, CategoryHierarchyManager } from 'memorits';

const hierarchyManager = new CategoryHierarchyManager();
hierarchyManager.addCategory('Programming/Languages');
hierarchyManager.addCategory('Programming/Frameworks');
hierarchyManager.addCategory('Technology/Databases');

const extractor = new CategoryMetadataExtractor(hierarchyManager);

// Extract from metadata
const result = await extractor.extractCategories({
  content: 'I love working with Python and React for web development',
  summary: 'Programming projects and frameworks',
  tags: ['python', 'react', 'javascript'],
  existingCategories: ['Technology']
});

console.log(result.categories);
```

#### Enhanced Category Patterns

The system includes predefined patterns with hierarchy suggestions:

```typescript
{
  name: 'programming_languages',
  pattern: /\b(javascript|typescript|python|java|c\+\+|c#|go|rust|php|ruby|swift|kotlin)\b/i,
  category: 'Languages',
  hierarchySuggestion: 'Programming/Languages',  // Automatic hierarchy path
  hierarchical: true,                           // Enable hierarchy expansion
  confidence: 0.8,
  priority: 10,
  enabled: true,
}
```

#### Hierarchy Resolution

Categories are resolved through multiple mechanisms:

1. **Exact Match** - Uses existing hierarchy node
2. **Pattern Suggestion** - Creates virtual node with suggested path
3. **Virtual Hierarchy** - Creates simple hierarchy for unknown categories

```typescript
// Result structure includes full hierarchy context
{
  name: 'Languages',
  hierarchyPath: 'Programming/Languages',  // Full hierarchical path
  confidence: 0.8,
  source: 'pattern',
  normalizedName: 'languages',
  relevanceScore: 0.9
}
```

## Advanced Features

### Batch Processing

```typescript
// Efficient batch processing
const metadatas = [
  { content: 'Python tutorial' },
  { content: 'React components' },
  { content: 'Database optimization' }
];

const results = await extractor.processBatchWithHierarchy(metadatas);
// Returns: CategoryExtractionResult[] with hierarchy information
```

### Related Category Suggestions

```typescript
// Get related categories based on hierarchy
const related = extractor.suggestRelatedCategories(extractedCategory);
// Returns: ExtractedCategory[] with sibling and parent categories
```

### Hierarchy Validation

```typescript
// Validate category hierarchy consistency
const validation = extractor.validateCategoryHierarchy(category);
// Returns: { isValid: boolean, errors: string[], warnings: string[] }
```

### User-Friendly Display

```typescript
// Format categories for user display
const displayName = extractor.formatCategoryForDisplay(category);
// Returns: "Programming/Languages (Languages)" or "Languages [suggested]"
```

## Configuration

### CategoryMetadataExtractor Configuration

```typescript
const config: CategoryExtractionConfig = {
  enableMLExtraction: false,           // Enable ML-based extraction
  enablePatternExtraction: true,       // Use pattern matching
  enableMetadataExtraction: true,      // Extract from existing metadata
  confidenceThreshold: 0.5,            // Minimum confidence for inclusion
  maxCategoriesPerMemory: 3,           // Maximum categories per memory
  enableCategoryNormalization: true,   // Normalize category names
  customExtractionRules: [],           // Additional custom rules
  extractionTimeout: 5000              // Timeout in milliseconds
};

const extractor = new CategoryMetadataExtractor(hierarchyManager, config);
```

### CategoryHierarchyManager Configuration

```typescript
const config: CategoryHierarchyConfig = {
  maxDepth: 5,              // Maximum hierarchy depth
  enableCaching: true,      // Enable internal caching
  cacheSize: 100,           // Cache size limit
  caseSensitive: false      // Case-sensitive matching
};

const manager = new CategoryHierarchyManager(config);
```

## Custom Rules

### Adding Custom Extraction Rules

```typescript
const customRule: CategoryExtractionRule = {
  name: 'financial_terms',
  pattern: /\b(roi|profit|loss|revenue|budget|investment)\b/i,
  category: 'Financial',
  hierarchySuggestion: 'Business/Financial',  // Suggested hierarchy
  hierarchical: true,                         // Enable hierarchy
  confidence: 0.7,
  priority: 8,
  enabled: true
};

extractor.addExtractionRule(customRule);
```

### Removing Rules

```typescript
// Remove by name
const removed = extractor.removeExtractionRule('financial_terms');
// Returns: true if removed, false if not found
```

## Integration with Search

### Category-Based Search

```typescript
import { SearchStrategy } from 'memorits';

const results = await memori.searchMemories('JavaScript tutorial', {
  strategy: SearchStrategy.CATEGORY_FILTER,
  includeMetadata: true
});

// Results include hierarchical category information
results.forEach(result => {
  if (result.metadata.categories) {
    result.metadata.categories.forEach(category => {
      console.log(`${category.name} (${category.hierarchyPath})`);
      // "Languages (Programming/Languages)"
    });
  }
});
```

### Metadata Filtering with Hierarchy

```typescript
const filtered = await memori.searchMemories('', {
  filterExpression: 'category LIKE "%Programming%"',
  includeMetadata: true
});
```

## Performance Considerations

### Caching

- **Hierarchy Cache** - Caches hierarchy operations for performance
- **Extraction Cache** - Caches category extraction results
- **Batch Operations** - Optimized for processing multiple items

```typescript
// Monitor cache performance
const extractorStats = extractor.getCacheStats();
const managerStats = manager.getCacheStats();

console.log(`Extractor cache: ${extractorStats.size} entries`);
console.log(`Manager cache: ${managerStats.size} entries`);
```

### Memory Management

- **Efficient Traversal** - Uses iterative algorithms to avoid stack overflow
- **Lazy Loading** - Hierarchy nodes loaded on demand
- **Virtual Nodes** - Create temporary nodes without storing all in memory

## Best Practices

### Hierarchy Design

1. **Keep Depth Reasonable** - Limit hierarchy depth to 3-5 levels
2. **Use Consistent Naming** - Follow naming conventions across categories
3. **Validate Regularly** - Check hierarchy consistency with `validateHierarchy()`

### Category Extraction

1. **Set Appropriate Thresholds** - Use `confidenceThreshold` to filter noise
2. **Limit Categories** - Set `maxCategoriesPerMemory` to prevent over-categorization
3. **Monitor Performance** - Use `getCacheStats()` to track performance

### Search Integration

1. **Use Metadata** - Enable `includeMetadata` to get category information
2. **Filter Hierarchically** - Use hierarchy paths in filter expressions
3. **Leverage Relationships** - Use related categories for better results

## Error Handling

### Graceful Degradation

The system is designed to handle various error conditions:

- **Missing Categories** - Creates virtual hierarchy nodes
- **Invalid Patterns** - Falls back to basic category extraction
- **Hierarchy Errors** - Validates and reports issues without failing

### Validation

```typescript
// Always validate hierarchies after modifications
const validation = manager.validateHierarchy();
if (!validation.isValid) {
  console.error('Hierarchy validation failed:', validation.errors);
  // Fix issues before proceeding
}
```

## Examples

### Complete Integration Example

```typescript
import { 
  CategoryHierarchyManager, 
  CategoryMetadataExtractor,
  SearchStrategy,
  Memori 
} from 'memorits';

async function setupCategorySystem() {
  // 1. Setup hierarchy
  const hierarchyManager = new CategoryHierarchyManager();
  
  // Add your category structure
  const categories = [
    'Technology/Programming/Languages',
    'Technology/Programming/Frameworks', 
    'Technology/Databases',
    'Business/Financial',
    'Personal/Learning'
  ];
  
  categories.forEach(category => {
    const parts = category.split('/');
    if (parts.length > 1) {
      hierarchyManager.addCategory(parts[parts.length - 1], parts.slice(0, -1).join('/'));
    } else {
      hierarchyManager.addCategory(category);
    }
  });
  
  // 2. Setup extractor
  const extractor = new CategoryMetadataExtractor(hierarchyManager);
  
  // 3. Use with Memori
  const memori = new Memori({ databaseUrl: 'file:./memori.db' });
  await memori.enable();
  
  // 4. Extract categories from content
  const result = await extractor.extractCategories({
    content: 'I am learning Python for data analysis and machine learning projects',
    summary: 'Educational content about programming',
    tags: ['python', 'machine-learning', 'data-analysis']
  });
  
  console.log('Extracted categories:', result.categories);
  // Shows categories with full hierarchy paths
  
  // 5. Search with categories
  const searchResults = await memori.searchMemories('Python tutorial', {
    strategy: SearchStrategy.CATEGORY_FILTER,
    includeMetadata: true
  });
  
  return { hierarchyManager, extractor, memori };
}
```

This comprehensive category hierarchy system provides rich context for memory organization, improved search capabilities, and enhanced user experience through meaningful category relationships.