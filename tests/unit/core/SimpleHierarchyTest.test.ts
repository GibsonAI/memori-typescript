/**
 * Minimal test for Category Hierarchy without full test infrastructure
 * This test can be run with increased heap if needed
 * 
 * Run with: node --max-old-space-size=4096 node_modules/.bin/jest tests/unit/core/SimpleHierarchyTest.test.ts
 */
import { CategoryHierarchyManager } from '../../../src/index';

// Simple synchronous test to avoid memory overhead
describe('Simple Category Hierarchy Test', () => {
  it('should create and manage hierarchy without memory issues', () => {
    const manager = new CategoryHierarchyManager();
    
    // Add basic categories
    manager.addCategory('Technology');
    manager.addCategory('Programming', 'Technology');
    manager.addCategory('Databases', 'Technology');
    
    // Test basic operations
    const programmingNode = manager.getNode('Programming');
    expect(programmingNode).toBeDefined();
    expect(programmingNode?.fullPath).toBe('Technology/Programming');
    
    // Test traversal
    const descendants = manager.getDescendants('Technology');
    expect(descendants.length).toBeGreaterThan(0);
    
    // Test validation
    const validation = manager.validateHierarchy();
    expect(validation.isValid).toBe(true);
  });

  it('should handle category relationships', () => {
    const manager = new CategoryHierarchyManager();
    
    manager.addCategory('Work');
    manager.addCategory('Projects', 'Work');
    manager.addCategory('Meetings', 'Work');
    
    const isDescendant = manager.isDescendantOf('Projects', 'Work');
    expect(isDescendant).toBe(true);
    
    const commonAncestor = manager.getCommonAncestor(['Projects', 'Meetings']);
    expect(commonAncestor).toBeDefined();
    expect(commonAncestor?.name).toBe('Work');
  });

  it('should export and import hierarchy', () => {
    const manager = new CategoryHierarchyManager();
    
    manager.addCategory('Personal');
    manager.addCategory('Learning', 'Personal');
    
    const exported = manager.exportHierarchy();
    expect(exported.length).toBeGreaterThan(0);
    
    // Import into new manager
    const newManager = new CategoryHierarchyManager();
    newManager.importHierarchy(exported);
    
    const learningNode = newManager.getNode('Learning');
    expect(learningNode?.fullPath).toBe('Personal/Learning');
  });
});