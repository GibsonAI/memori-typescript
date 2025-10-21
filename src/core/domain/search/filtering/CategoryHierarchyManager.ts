
/**
 * Represents a node in the category hierarchy tree
 */
export interface CategoryNode {
  id: string;
  name: string;
  parentId?: string;
  children: CategoryNode[];
  depth: number;
  fullPath: string;
  metadata?: Record<string, unknown>;
}

/**
 * Category hierarchy configuration
 */
export interface CategoryHierarchyConfig {
  maxDepth: number;
  enableCaching: boolean;
  cacheSize: number;
  caseSensitive: boolean;
}

/**
 * Category relationship mapping for aliases and synonyms
 */
export interface CategoryRelationship {
  parent: string;
  child: string;
  relationship: 'parent_child' | 'alias' | 'synonym';
  weight: number;
}

/**
 * Manager for hierarchical category structures with support for parent-child relationships,
 * category inheritance, and efficient traversal operations
 */
export class CategoryHierarchyManager {
  private categoryTree: Map<string, CategoryNode> = new Map();
  private rootNodes: CategoryNode[] = [];
  private categoryCache: Map<string, CategoryNode[]> = new Map();
  private config: CategoryHierarchyConfig;

  constructor(config: Partial<CategoryHierarchyConfig> = {}) {
    this.config = {
      maxDepth: 5,
      enableCaching: true,
      cacheSize: 100,
      caseSensitive: false,
      ...config,
    };
  }

  /**
   * Build hierarchical category structure from flat category list
   */
  buildHierarchy(categories: string[]): CategoryNode {
    this.clear();

    // Create nodes for all categories
    const nodes = new Map<string, CategoryNode>();
    categories.forEach(category => {
      const normalizedCategory = this.normalizeCategory(category);
      nodes.set(normalizedCategory, {
        id: normalizedCategory,
        name: category,
        children: [],
        depth: 0,
        fullPath: category,
      });
    });

    // Build parent-child relationships
    this.buildParentChildRelationships(nodes);

    // Build the tree structure
    this.buildTreeStructure(nodes);

    // Cache root nodes
    this.rootNodes = Array.from(nodes.values()).filter(node => !node.parentId);

    return this.getRootNode();
  }

  /**
   * Add a single category with optional parent relationship
   */
  addCategory(category: string, parentCategory?: string): CategoryNode {
    const normalizedCategory = this.normalizeCategory(category);
    const normalizedParent = parentCategory ? this.normalizeCategory(parentCategory) : undefined;

    const node: CategoryNode = {
      id: normalizedCategory,
      name: category,
      parentId: normalizedParent,
      children: [],
      depth: 0,
      fullPath: category,
    };

    this.categoryTree.set(normalizedCategory, node);

    if (normalizedParent) {
      const parentNode = this.categoryTree.get(normalizedParent);
      if (parentNode) {
        parentNode.children.push(node);
        node.depth = parentNode.depth + 1;
        node.fullPath = `${parentNode.fullPath}/${category}`;
      }
    } else {
      this.rootNodes.push(node);
    }

    this.clearCache();
    return node;
  }

  /**
   * Get all descendants of a category (children, grandchildren, etc.)
   */
  getDescendants(category: string): CategoryNode[] {
    const normalizedCategory = this.normalizeCategory(category);
    return this.getDescendantsRecursive(normalizedCategory);
  }

  /**
   * Get all ancestors of a category (parent, grandparent, etc.)
   */
  getAncestors(category: string): CategoryNode[] {
    const normalizedCategory = this.normalizeCategory(category);
    const ancestors: CategoryNode[] = [];
    let current = this.categoryTree.get(normalizedCategory);

    while (current && current.parentId) {
      const parent = this.categoryTree.get(current.parentId);
      if (parent) {
        ancestors.push(parent);
        current = parent;
      } else {
        break;
      }
    }

    return ancestors;
  }

  /**
   * Check if one category is a descendant of another
   */
  isDescendantOf(child: string, parent: string): boolean {
    const normalizedChild = this.normalizeCategory(child);
    const normalizedParent = this.normalizeCategory(parent);

    const descendants = this.getDescendants(normalizedParent);
    return descendants.some(node => node.id === normalizedChild);
  }

  /**
   * Get the common ancestor of multiple categories
   */
  getCommonAncestor(categories: string[]): CategoryNode | null {
    if (categories.length === 0) return null;
    if (categories.length === 1) return this.getNode(categories[0]);

    const firstCategoryAncestors = new Set(this.getAncestors(categories[0]).map(node => node.id));

    for (let i = 1; i < categories.length; i++) {
      const currentAncestors = this.getAncestors(categories[i]);
      const intersection = currentAncestors.filter(node => firstCategoryAncestors.has(node.id));

      if (intersection.length === 0) return null;
      firstCategoryAncestors.clear();
      intersection.forEach(node => firstCategoryAncestors.add(node.id));
    }

    const commonAncestorIds = Array.from(firstCategoryAncestors);
    return commonAncestorIds.length > 0 ? this.categoryTree.get(commonAncestorIds[0]) || null : null;
  }

  /**
   * Get categories at a specific depth level
   */
  getCategoriesAtDepth(depth: number): CategoryNode[] {
    return Array.from(this.categoryTree.values()).filter(node => node.depth === depth);
  }

  /**
   * Get the root category node
   */
  getRootNode(): CategoryNode {
    if (this.rootNodes.length === 0) {
      throw new Error('No categories have been added to the hierarchy');
    }
    if (this.rootNodes.length === 1) {
      return this.rootNodes[0];
    }

    // If multiple roots, create a virtual root
    const virtualRoot: CategoryNode = {
      id: 'root',
      name: 'Root',
      children: this.rootNodes,
      depth: -1,
      fullPath: '',
    };

    this.rootNodes.forEach(child => {
      child.parentId = 'root';
      child.depth += 1;
    });

    return virtualRoot;
  }

  /**
   * Get a specific category node by name
   */
  getNode(category: string): CategoryNode | null {
    const normalizedCategory = this.normalizeCategory(category);
    return this.categoryTree.get(normalizedCategory) || null;
  }

  /**
   * Get all category nodes as a flat array
   */
  getAllNodes(): CategoryNode[] {
    return Array.from(this.categoryTree.values());
  }

  /**
   * Calculate the depth of a category in the hierarchy
   */
  getDepth(category: string): number {
    const node = this.getNode(category);
    return node ? node.depth : -1;
  }

  /**
   * Get all leaf categories (categories with no children)
   */
  getLeafCategories(): CategoryNode[] {
    return Array.from(this.categoryTree.values()).filter(node => node.children.length === 0);
  }

  /**
   * Get all categories that have children
   */
  getParentCategories(): CategoryNode[] {
    return Array.from(this.categoryTree.values()).filter(node => node.children.length > 0);
  }

  /**
   * Search for categories using fuzzy matching
   */
  searchCategories(query: string, maxResults: number = 10): CategoryNode[] {
    const normalizedQuery = this.normalizeCategory(query);
    const results: CategoryNode[] = [];

    for (const node of this.categoryTree.values()) {
      if (node.name.toLowerCase().includes(normalizedQuery) ||
          node.id.includes(normalizedQuery)) {
        results.push(node);
        if (results.length >= maxResults) break;
      }
    }

    return results;
  }

  /**
   * Validate category hierarchy for consistency
   */
  validateHierarchy(): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check for circular references
    for (const node of this.categoryTree.values()) {
      if (this.hasCircularReference(node, new Set())) {
        errors.push(`Circular reference detected for category: ${node.name}`);
      }
    }

    // Check depth constraints
    for (const node of this.categoryTree.values()) {
      if (node.depth > this.config.maxDepth) {
        errors.push(`Category ${node.name} exceeds maximum depth of ${this.config.maxDepth}`);
      }
    }

    // Check for orphaned nodes
    const allNodeIds = new Set(this.categoryTree.keys());
    for (const node of this.categoryTree.values()) {
      if (node.parentId && !allNodeIds.has(node.parentId)) {
        errors.push(`Category ${node.name} references non-existent parent: ${node.parentId}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Export hierarchy as a flat structure for serialization
   */
  exportHierarchy(): Array<{
    id: string;
    name: string;
    parentId?: string;
    depth: number;
    fullPath: string;
  }> {
    return Array.from(this.categoryTree.values()).map(node => ({
      id: node.id,
      name: node.name,
      parentId: node.parentId,
      depth: node.depth,
      fullPath: node.fullPath,
    }));
  }

  /**
   * Import hierarchy from flat structure
   */
  importHierarchy(data: Array<{
    id: string;
    name: string;
    parentId?: string;
    depth: number;
    fullPath: string;
  }>): void {
    this.clear();

    const nodes = new Map<string, CategoryNode>();
    data.forEach(item => {
      nodes.set(item.id, {
        id: item.id,
        name: item.name,
        parentId: item.parentId,
        children: [],
        depth: item.depth,
        fullPath: item.fullPath,
      });
    });

    this.buildTreeStructure(nodes);
    this.categoryTree = nodes;
    this.rootNodes = Array.from(nodes.values()).filter(node => !node.parentId);
  }

  /**
   * Clear all categories and cached data
   */
  clear(): void {
    this.categoryTree.clear();
    this.rootNodes = [];
    this.clearCache();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; enabled: boolean } {
    return {
      size: this.categoryCache.size,
      enabled: this.config.enableCaching,
    };
  }

  /**
   * Normalize category name for consistent comparison
   */
  private normalizeCategory(category: string): string {
    return this.config.caseSensitive ? category : category.toLowerCase();
  }

  /**
   * Build parent-child relationships from category names
   */
  private buildParentChildRelationships(nodes: Map<string, CategoryNode>): void {
    for (const [, node] of nodes) {
      // Try to infer parent from category name structure
      const parts = node.name.split('/');
      if (parts.length > 1) {
        const parentName = parts.slice(0, -1).join('/');
        const parentId = this.normalizeCategory(parentName);
        const parentNode = nodes.get(parentId);

        if (parentNode) {
          node.parentId = parentId;
          node.depth = parentNode.depth + 1;
          node.fullPath = node.name;
        }
      }
    }
  }

  /**
   * Build tree structure from nodes
   */
  private buildTreeStructure(nodes: Map<string, CategoryNode>): void {
    for (const node of nodes.values()) {
      if (node.parentId) {
        const parent = nodes.get(node.parentId);
        if (parent) {
          parent.children.push(node);
        }
      }
    }
  }

  /**
   * Get descendants recursively
   */
  private getDescendantsRecursive(categoryId: string): CategoryNode[] {
    const descendants: CategoryNode[] = [];
    const node = this.categoryTree.get(categoryId);

    if (!node) return descendants;

    const stack = [...node.children];
    while (stack.length > 0) {
      const current = stack.pop()!;
      descendants.push(current);
      stack.push(...current.children);
    }

    return descendants;
  }

  /**
   * Check for circular references in hierarchy
   */
  private hasCircularReference(node: CategoryNode, visited: Set<string>): boolean {
    if (visited.has(node.id)) return true;
    if (!node.parentId) return false;

    visited.add(node.id);
    const parent = this.categoryTree.get(node.parentId);
    if (parent) {
      return this.hasCircularReference(parent, visited);
    }
    return false;
  }

  /**
   * Clear the category cache
   */
  private clearCache(): void {
    if (this.config.enableCaching) {
      this.categoryCache.clear();
    }
  }
}

/**
 * Utility class for category hierarchy operations
 */
export class CategoryHierarchyUtils {
  /**
   * Calculate the similarity between two category paths
   */
  static calculatePathSimilarity(path1: string, path2: string): number {
    const parts1 = path1.split('/');
    const parts2 = path2.split('/');

    const minLength = Math.min(parts1.length, parts2.length);
    let matches = 0;

    for (let i = 0; i < minLength; i++) {
      if (parts1[i] === parts2[i]) {
        matches++;
      }
    }

    return matches / Math.max(parts1.length, parts2.length);
  }

  /**
   * Get the shortest path between two categories
   */
  static getShortestPath(
    category1: string,
    category2: string,
    hierarchy: CategoryHierarchyManager,
  ): CategoryNode[] {
    const node1 = hierarchy.getNode(category1);
    const node2 = hierarchy.getNode(category2);

    if (!node1 || !node2) return [];

    // If same category, return empty path
    if (node1.id === node2.id) return [];

    // Check if one is descendant of the other
    if (hierarchy.isDescendantOf(category2, category1)) {
      return hierarchy.getAncestors(category2)
        .filter(ancestor => ancestor.id !== category1)
        .reverse();
    }

    if (hierarchy.isDescendantOf(category1, category2)) {
      return hierarchy.getAncestors(category1)
        .filter(ancestor => ancestor.id !== category2)
        .reverse();
    }

    // Find common ancestor and build path
    const ancestors1 = hierarchy.getAncestors(category1);
    const ancestors2 = hierarchy.getAncestors(category2);
    const commonAncestor = hierarchy.getCommonAncestor([category1, category2]);

    if (!commonAncestor) return [];

    const path1 = ancestors1.slice(ancestors1.findIndex(a => a.id === commonAncestor.id));
    const path2 = ancestors2.slice(ancestors2.findIndex(a => a.id === commonAncestor.id));

    return [...path1.reverse(), commonAncestor, ...path2];
  }

  /**
   * Flatten a category hierarchy to a specific depth
   */
  static flattenHierarchy(
    root: CategoryNode,
    maxDepth: number = -1,
  ): CategoryNode[] {
    const result: CategoryNode[] = [];

    if (maxDepth === -1 || root.depth < maxDepth) {
      result.push(root);

      for (const child of root.children) {
        result.push(...this.flattenHierarchy(child, maxDepth));
      }
    }

    return result;
  }

  /**
   * Create a category hierarchy from a list of paths
   */
  static createFromPaths(paths: string[]): CategoryHierarchyManager {
    const manager = new CategoryHierarchyManager();
    const uniquePaths = [...new Set(paths)];

    uniquePaths.forEach(path => {
      const parts = path.split('/');
      let currentPath = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const parentPath = i > 0 ? parts.slice(0, i).join('/') : undefined;

        if (i === 0) {
          currentPath = part;
        } else {
          currentPath = `${currentPath}/${part}`;
        }

        const existingNode = manager.getNode(currentPath);
        if (!existingNode) {
          manager.addCategory(currentPath, parentPath);
        }
      }
    });

    return manager;
  }
}