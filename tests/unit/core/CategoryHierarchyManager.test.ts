import { CategoryHierarchyManager, CategoryNode, CategoryHierarchyConfig, CategoryHierarchyUtils } from '@/core/domain/search/filtering/CategoryHierarchyManager';

describe('CategoryHierarchyManager', () => {
  let manager: CategoryHierarchyManager;

  beforeEach(() => {
    manager = new CategoryHierarchyManager();
  });

  describe('basic functionality', () => {
    it('should initialize correctly', () => {
      expect(manager).toBeInstanceOf(CategoryHierarchyManager);
      expect(manager.getCacheStats().enabled).toBe(true);
    });

    it('should add categories correctly', () => {
      const rootNode = manager.addCategory('root');
      expect(rootNode.name).toBe('root');
      expect(rootNode.depth).toBe(0);
      expect(rootNode.parentId).toBeUndefined();

      const childNode = manager.addCategory('root/child', 'root');
      expect(childNode.name).toBe('root/child');
      expect(childNode.parentId).toBe('root');
      expect(childNode.depth).toBe(1);
    });

    it('should build hierarchy from category paths', () => {
      const categories = ['electronics', 'electronics/computers', 'electronics/phones'];

      const rootNode = manager.buildHierarchy(categories);

      expect(rootNode.name).toBe('electronics');
      expect(rootNode.children.length).toBe(2);
      expect(rootNode.children.map(c => c.name)).toContain('electronics/computers');
      expect(rootNode.children.map(c => c.name)).toContain('electronics/phones');
    });

    it('should get nodes correctly', () => {
      manager.addCategory('test');

      const node = manager.getNode('test');
      expect(node).toBeDefined();
      expect(node?.name).toBe('test');

      const nonexistent = manager.getNode('nonexistent');
      expect(nonexistent).toBeNull();
    });

  });

  describe('hierarchy traversal', () => {
    beforeEach(() => {
      // Use addCategory method to properly build hierarchy
      manager.addCategory('root');
      manager.addCategory('root/a', 'root');
      manager.addCategory('root/a/aa', 'root/a');
      manager.addCategory('root/a/ab', 'root/a');
      manager.addCategory('root/b', 'root');
      manager.addCategory('root/b/ba', 'root/b');
    });

    it('should get descendants correctly', () => {
      const descendants = manager.getDescendants('root/a');

      expect(descendants.length).toBe(2);
      expect(descendants.map(d => d.name)).toContain('root/a/aa');
      expect(descendants.map(d => d.name)).toContain('root/a/ab');
    });

    it('should get ancestors correctly', () => {
      const ancestors = manager.getAncestors('root/a/aa');

      expect(ancestors.length).toBe(2);
      expect(ancestors.map(a => a.name)).toContain('root');
      expect(ancestors.map(a => a.name)).toContain('root/a');
    });

    it('should check descendant relationships', () => {
      expect(manager.isDescendantOf('root/a/aa', 'root')).toBe(true);
      expect(manager.isDescendantOf('root/a/aa', 'root/a')).toBe(true);
      expect(manager.isDescendantOf('root/b', 'root/a')).toBe(false);
    });

    it('should find common ancestors', () => {
      const common = manager.getCommonAncestor(['root/a/aa', 'root/a/ab']);
      expect(common?.name).toBe('root/a');
    });

    it('should handle categories with no ancestors', () => {
      const ancestors = manager.getAncestors('root');
      expect(ancestors.length).toBe(0);
    });

    it('should handle categories with no descendants', () => {
      const descendants = manager.getDescendants('root/a/aa');
      expect(descendants.length).toBe(0);
    });
  });

  describe('search functionality', () => {
    beforeEach(() => {
      manager.addCategory('technology');
      manager.addCategory('technology/computers');
      manager.addCategory('books');
    });

    it('should search categories', () => {
      const results = manager.searchCategories('tech');
      expect(results.length).toBeGreaterThan(0);
      expect(results.some(r => r.name.includes('technology'))).toBe(true);
    });

    it('should limit search results', () => {
      const results = manager.searchCategories('o', 1); // Search for categories containing 'o'
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should handle case insensitive search', () => {
      const results = manager.searchCategories('TECHNOLOGY');
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return empty array for no matches', () => {
      const results = manager.searchCategories('nonexistent');
      expect(results).toHaveLength(0);
    });
  });

  describe('validation', () => {
    it('should validate correct hierarchies', () => {
      manager.addCategory('root');
      manager.addCategory('root/child');

      const validation = manager.validateHierarchy();
      expect(validation.isValid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

  });

  describe('utility functions', () => {
    it('should calculate path similarity', () => {
      const similarity = CategoryHierarchyUtils.calculatePathSimilarity(
        'electronics/computers',
        'electronics/phones'
      );
      expect(similarity).toBe(0.5); // One level matches out of two
    });

    it('should handle same category in path calculation', () => {
      const pathManager = new CategoryHierarchyManager();
      pathManager.addCategory('root');

      const path = CategoryHierarchyUtils.getShortestPath('root', 'root', pathManager);
      expect(path).toHaveLength(0);
    });

    it('should return empty path for non-existent categories', () => {
      const path = CategoryHierarchyUtils.getShortestPath('nonexistent1', 'nonexistent2', manager);
      expect(path).toHaveLength(0);
    });

    it('should flatten hierarchies', () => {
      const flattenManager = new CategoryHierarchyManager();
      flattenManager.addCategory('root');
      flattenManager.addCategory('root/a');
      flattenManager.addCategory('root/a/aa');

      const rootNode = flattenManager.getNode('root');
      expect(rootNode).toBeDefined();

      const flattened = CategoryHierarchyUtils.flattenHierarchy(rootNode!, 1);

      expect(flattened.length).toBeGreaterThan(0);
      expect(flattened.some(n => n.name === 'root')).toBe(true);
    });
  });

  describe('case sensitivity', () => {
    it('should handle case insensitive matching', () => {
      const caseInsensitiveManager = new CategoryHierarchyManager({ caseSensitive: false });
      caseInsensitiveManager.buildHierarchy(['Root']);

      expect(caseInsensitiveManager.getNode('root')).toBeDefined();
      expect(caseInsensitiveManager.getNode('Root')).toBeNull(); // Normalized
    });

    it('should handle case sensitive matching', () => {
      const caseSensitiveManager = new CategoryHierarchyManager({ caseSensitive: true });
      caseSensitiveManager.buildHierarchy(['Root']);

      expect(caseSensitiveManager.getNode('Root')).toBeDefined();
      expect(caseSensitiveManager.getNode('root')).toBeNull();
    });
  });

  describe('import/export', () => {
    it('should export hierarchy', () => {
      manager.addCategory('root');
      manager.addCategory('root/child');

      const exported = manager.exportHierarchy();
      expect(exported.length).toBe(2);
      expect(exported.some(e => e.name === 'root')).toBe(true);
      expect(exported.some(e => e.name === 'root/child')).toBe(true);
    });

    it('should import hierarchy', () => {
      const data = [
        { id: 'root', name: 'root', depth: 0, fullPath: 'root' },
        { id: 'root/child', name: 'root/child', parentId: 'root', depth: 1, fullPath: 'root/child' }
      ];

      manager.importHierarchy(data);
      expect(manager.getNode('root')).toBeDefined();
      expect(manager.getNode('root/child')).toBeDefined();
    });

    it('should handle empty import data', () => {
      expect(() => {
        manager.importHierarchy([]);
      }).not.toThrow();
    });
  });
});