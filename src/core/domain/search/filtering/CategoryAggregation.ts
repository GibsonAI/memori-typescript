import { CategoryHierarchyManager, CategoryNode } from './CategoryHierarchyManager';
import { SearchResult } from '../SearchStrategy';

/**
 * Configuration for category aggregation
 */
export interface CategoryAggregationConfig {
    maxCategories: number;
    minCategorySize: number;
    enableHierarchyGrouping: boolean;
    enableSorting: boolean;
    sortBy: 'size' | 'relevance' | 'name' | 'depth';
    sortDirection: 'asc' | 'desc';
    enableSubcategoryAggregation: boolean;
    maxDepth: number;
    enableCaching: boolean;
    maxCacheSize: number;
}

/**
 * Aggregated category information
 */
export interface CategoryAggregationInfo {
    category: string;
    categoryNode?: CategoryNode;
    count: number;
    totalRelevance: number;
    averageRelevance: number;
    subcategories: CategoryAggregationInfo[];
    depth: number;
    items: SearchResult[];
    metadata: Record<string, unknown>;
}

/**
 * Aggregation result with statistics
 */
export interface CategoryAggregationResult {
    aggregations: CategoryAggregationInfo[];
    totalItems: number;
    totalCategories: number;
    maxCategorySize: number;
    minCategorySize: number;
    averageCategorySize: number;
    hierarchyDepth: number;
    metadata: Record<string, unknown>;
}

/**
 * Category group for organizing results
 */
export interface CategoryGroup {
    name: string;
    categories: string[];
    itemCount: number;
    relevanceScore: number;
    representativeItems: SearchResult[];
}

/**
 * Aggregates search results by category for better organization and analysis.
 * Supports hierarchical grouping, statistical analysis, and multiple aggregation strategies.
 */
export class CategoryAggregationEngine {
    private config: CategoryAggregationConfig;
    private hierarchyManager: CategoryHierarchyManager;
    private aggregationCache: Map<string, CategoryAggregationResult> = new Map();

    constructor(
        hierarchyManager: CategoryHierarchyManager,
        config: Partial<CategoryAggregationConfig> = {}
    ) {
        this.hierarchyManager = hierarchyManager;
        this.config = {
            maxCategories: 20,
            minCategorySize: 1,
            enableHierarchyGrouping: true,
            enableSorting: true,
            sortBy: 'size',
            sortDirection: 'desc',
            enableSubcategoryAggregation: true,
            maxDepth: 5,
            enableCaching: true,
            maxCacheSize: 500,
            ...config,
        };
    }

    /**
     * Aggregate search results by category
     */
    aggregateResults(results: SearchResult[]): CategoryAggregationResult {
        const cacheKey = this.generateCacheKey(results);
        const cached = this.aggregationCache.get(cacheKey);

        if (cached && this.config.enableCaching) {
            return cached;
        }

        const aggregations = this.performAggregation(results);
        const result = this.buildAggregationResult(aggregations, results);

        if (this.config.enableCaching) {
            this.addToCache(cacheKey, result);
        }

        return result;
    }

    /**
     * Aggregate results with custom configuration
     */
    aggregateWithConfig(
        results: SearchResult[],
        config: Partial<CategoryAggregationConfig>
    ): CategoryAggregationResult {
        const originalConfig = this.config;
        this.config = { ...this.config, ...config };

        try {
            return this.aggregateResults(results);
        } finally {
            this.config = originalConfig;
        }
    }

    /**
     * Group results by category with hierarchical organization
     */
    groupByCategory(results: SearchResult[]): CategoryGroup[] {
        const categoryGroups = new Map<string, CategoryGroup>();

        for (const result of results) {
            const category = result.metadata.category as string || 'Uncategorized';

            if (!categoryGroups.has(category)) {
                categoryGroups.set(category, {
                    name: category,
                    categories: [category],
                    itemCount: 0,
                    relevanceScore: 0,
                    representativeItems: [],
                });
            }

            const group = categoryGroups.get(category)!;
            group.itemCount++;
            group.relevanceScore += result.score;

            // Keep top representative items
            if (group.representativeItems.length < 3) {
                group.representativeItems.push(result);
            } else {
                // Replace lowest scoring item if current is better
                const minScoreIndex = group.representativeItems.reduce(
                    (minIndex, item, index, arr) =>
                        item.score < arr[minIndex].score ? index : minIndex,
                    0
                );

                if (result.score > group.representativeItems[minScoreIndex].score) {
                    group.representativeItems[minScoreIndex] = result;
                }
            }
        }

        // Calculate average relevance for each group
        for (const group of categoryGroups.values()) {
            group.relevanceScore /= group.itemCount;
            group.representativeItems.sort((a, b) => b.score - a.score);
        }

        return Array.from(categoryGroups.values())
            .sort((a, b) => b.itemCount - a.itemCount)
            .slice(0, this.config.maxCategories);
    }

    /**
     * Get category distribution statistics
     */
    getCategoryDistribution(results: SearchResult[]): Array<{
        category: string;
        count: number;
        percentage: number;
        relevance: number;
    }> {
        const totalResults = results.length;
        const categoryStats = new Map<string, {
            count: number;
            totalRelevance: number;
        }>();

        // Collect statistics
        for (const result of results) {
            const category = result.metadata.category as string || 'Uncategorized';

            if (!categoryStats.has(category)) {
                categoryStats.set(category, { count: 0, totalRelevance: 0 });
            }

            const stats = categoryStats.get(category)!;
            stats.count++;
            stats.totalRelevance += result.score;
        }

        // Convert to array and calculate percentages
        return Array.from(categoryStats.entries()).map(([category, stats]) => ({
            category,
            count: stats.count,
            percentage: (stats.count / totalResults) * 100,
            relevance: stats.totalRelevance / stats.count,
        })).sort((a, b) => b.count - a.count);
    }

    /**
     * Find the most relevant categories
     */
    findTopCategories(
        results: SearchResult[],
        limit: number = 10
    ): Array<{
        category: string;
        relevance: number;
        itemCount: number;
    }> {
        const categoryRelevance = new Map<string, {
            totalRelevance: number;
            itemCount: number;
        }>();

        for (const result of results) {
            const category = result.metadata.category as string || 'Uncategorized';

            if (!categoryRelevance.has(category)) {
                categoryRelevance.set(category, { totalRelevance: 0, itemCount: 0 });
            }

            const stats = categoryRelevance.get(category)!;
            stats.totalRelevance += result.score;
            stats.itemCount++;
        }

        return Array.from(categoryRelevance.entries())
            .map(([category, stats]) => ({
                category,
                relevance: stats.totalRelevance / stats.itemCount,
                itemCount: stats.itemCount,
            }))
            .sort((a, b) => b.relevance - a.relevance)
            .slice(0, limit);
    }

    /**
     * Update aggregation configuration
     */
    updateConfig(newConfig: Partial<CategoryAggregationConfig>): void {
        this.config = { ...this.config, ...newConfig };
        this.clearCache();
    }

    /**
     * Clear the aggregation cache
     */
    clearCache(): void {
        this.aggregationCache.clear();
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): { size: number; enabled: boolean } {
        return {
            size: this.aggregationCache.size,
            enabled: this.config.enableCaching,
        };
    }

    /**
     * Perform the actual aggregation
     */
    private performAggregation(results: SearchResult[]): CategoryAggregationInfo[] {
        const categoryMap = new Map<string, {
            items: SearchResult[];
            totalRelevance: number;
        }>();

        // Group results by category
        for (const result of results) {
            const category = result.metadata.category as string || 'Uncategorized';

            if (!categoryMap.has(category)) {
                categoryMap.set(category, { items: [], totalRelevance: 0 });
            }

            const categoryData = categoryMap.get(category)!;
            categoryData.items.push(result);
            categoryData.totalRelevance += result.score;
        }

        // Convert to CategoryAggregationInfo objects
        const aggregations: CategoryAggregationInfo[] = [];

        for (const [category, data] of categoryMap.entries()) {
            const node = this.hierarchyManager.getNode(category);
            const averageRelevance = data.totalRelevance / data.items.length;

            const aggregation: CategoryAggregationInfo = {
                category,
                categoryNode: node || undefined,
                count: data.items.length,
                totalRelevance: data.totalRelevance,
                averageRelevance,
                subcategories: [],
                depth: node ? node.depth : 0,
                items: data.items,
                metadata: {
                    categoryId: node ? node.id : category,
                    fullPath: node ? node.fullPath : category,
                    hierarchyLevel: node ? node.depth : 0,
                },
            };

            aggregations.push(aggregation);
        }

        // Add subcategory aggregations if enabled
        if (this.config.enableSubcategoryAggregation) {
            this.addSubcategoryAggregations(aggregations);
        }

        // Apply sorting
        if (this.config.enableSorting) {
            this.sortAggregations(aggregations);
        }

        // Apply size filtering
        return aggregations.filter(agg => agg.count >= this.config.minCategorySize);
    }

    /**
     * Add subcategory aggregations for hierarchical organization
     */
    private addSubcategoryAggregations(aggregations: CategoryAggregationInfo[]): void {
        for (const aggregation of aggregations) {
            const categoryNode = aggregation.categoryNode;
            if (!categoryNode) continue;

            // Get all descendants and create subcategory aggregations
            const descendants = this.hierarchyManager.getDescendants(categoryNode.id);

            for (const descendant of descendants) {
                const descendantResults = aggregation.items.filter(item =>
                    item.metadata.category === descendant.name
                );

                if (descendantResults.length > 0) {
                    const subcategoryAggregation: CategoryAggregationInfo = {
                        category: descendant.name,
                        categoryNode: descendant,
                        count: descendantResults.length,
                        totalRelevance: descendantResults.reduce((sum, item) => sum + item.score, 0),
                        averageRelevance: descendantResults.reduce((sum, item) => sum + item.score, 0) / descendantResults.length,
                        subcategories: [],
                        depth: descendant.depth,
                        items: descendantResults,
                        metadata: {
                            parentCategory: aggregation.category,
                            hierarchyLevel: descendant.depth,
                        },
                    };

                    aggregation.subcategories.push(subcategoryAggregation);
                }
            }

            // Sort subcategories
            aggregation.subcategories.sort((a, b) => b.count - a.count);
        }
    }

    /**
     * Sort aggregations based on configuration
     */
    private sortAggregations(aggregations: CategoryAggregationInfo[]): void {
        aggregations.sort((a, b) => {
            let comparison = 0;

            switch (this.config.sortBy) {
                case 'size':
                    comparison = a.count - b.count;
                    break;
                case 'relevance':
                    comparison = a.averageRelevance - b.averageRelevance;
                    break;
                case 'name':
                    comparison = a.category.localeCompare(b.category);
                    break;
                case 'depth':
                    comparison = a.depth - b.depth;
                    break;
            }

            return this.config.sortDirection === 'desc' ? -comparison : comparison;
        });
    }

    /**
     * Build the final aggregation result
     */
    private buildAggregationResult(
        aggregations: CategoryAggregationInfo[],
        originalResults: SearchResult[]
      ): CategoryAggregationResult {
        const filteredAggregations = aggregations.slice(0, this.config.maxCategories);

        const totalItems = originalResults.length;
        const totalCategories = filteredAggregations.length;
        const maxCategorySize = Math.max(...filteredAggregations.map(agg => agg.count));
        const minCategorySize = Math.min(...filteredAggregations.map(agg => agg.count));
        const averageCategorySize = totalItems / totalCategories || 0;
        const hierarchyDepth = Math.max(...filteredAggregations.map(agg => agg.depth));

        return {
            aggregations: filteredAggregations,
            totalItems,
            totalCategories,
            maxCategorySize,
            minCategorySize,
            averageCategorySize,
            hierarchyDepth,
            metadata: {
                aggregationTimestamp: new Date().toISOString(),
                config: this.config,
                filteredCategories: aggregations.length - filteredAggregations.length,
            },
        };
    }

    /**
     * Generate cache key for results
     */
    private generateCacheKey(results: SearchResult[]): string {
        const keyData = {
            resultCount: results.length,
            categories: results
                .map(r => r.metadata.category)
                .filter(Boolean)
                .sort()
                .join(','),
            totalRelevance: results.reduce((sum, r) => sum + r.score, 0),
        };

        return Buffer.from(JSON.stringify(keyData)).toString('base64').substring(0, 64);
    }

    /**
     * Add result to cache with size management
     */
    private addToCache(key: string, result: CategoryAggregationResult): void {
        if (this.aggregationCache.size >= this.config.maxCacheSize) {
            // Remove oldest entry
            const firstKey = this.aggregationCache.keys().next().value;
            if (firstKey) {
                this.aggregationCache.delete(firstKey);
            }
        }

        this.aggregationCache.set(key, result);
    }
}

/**
 * Utility functions for category aggregation
 */
export class CategoryAggregationUtils {
    /**
     * Create default aggregation configuration
     */
    static createDefaultConfig(): CategoryAggregationConfig {
        return {
            maxCategories: 20,
            minCategorySize: 1,
            enableHierarchyGrouping: true,
            enableSorting: true,
            sortBy: 'size',
            sortDirection: 'desc',
            enableSubcategoryAggregation: true,
            maxDepth: 5,
            enableCaching: true,
            maxCacheSize: 500,
        };
    }

    /**
     * Create configuration optimized for performance
     */
    static createPerformanceConfig(): CategoryAggregationConfig {
        return {
            maxCategories: 10,
            minCategorySize: 2,
            enableHierarchyGrouping: false,
            enableSorting: true,
            sortBy: 'size',
            sortDirection: 'desc',
            enableSubcategoryAggregation: false,
            maxDepth: 3,
            enableCaching: true,
            maxCacheSize: 200,
        };
    }

    /**
     * Create configuration optimized for detailed analysis
     */
    static createDetailedConfig(): CategoryAggregationConfig {
        return {
            maxCategories: 50,
            minCategorySize: 1,
            enableHierarchyGrouping: true,
            enableSorting: true,
            sortBy: 'relevance',
            sortDirection: 'desc',
            enableSubcategoryAggregation: true,
            maxDepth: 10,
            enableCaching: true,
            maxCacheSize: 1000,
        };
    }

    /**
     * Flatten hierarchical aggregations to a single level
     */
    static flattenAggregations(
        aggregations: CategoryAggregationInfo[],
        maxDepth: number = -1
    ): CategoryAggregationInfo[] {
        const flattened: CategoryAggregationInfo[] = [];
    
        const processAggregation = (aggregation: CategoryAggregationInfo, currentDepth: number) => {
            if (maxDepth === -1 || currentDepth <= maxDepth) {
                flattened.push(aggregation);

                for (const subcategory of aggregation.subcategories) {
                    processAggregation(subcategory, currentDepth + 1);
                }
            }
        };

        for (const aggregation of aggregations) {
            processAggregation(aggregation, 0);
        }

        return flattened;
    }

    /**
     * Merge multiple aggregation results
     */
    static mergeResults(results: CategoryAggregationResult[]): CategoryAggregationResult {
        if (results.length === 0) {
            return {
                aggregations: [],
                totalItems: 0,
                totalCategories: 0,
                maxCategorySize: 0,
                minCategorySize: 0,
                averageCategorySize: 0,
                hierarchyDepth: 0,
                metadata: {},
            };
        }

        if (results.length === 1) {
            return results[0];
        }

        const allAggregations = results.flatMap(result => result.aggregations);
        const categoryMap = new Map<string, CategoryAggregationInfo>();

        // Merge aggregations by category
        for (const aggregation of allAggregations) {
            const existing = categoryMap.get(aggregation.category);

            if (!existing) {
                categoryMap.set(aggregation.category, { ...aggregation });
            } else {
                // Merge items and recalculate statistics
                existing.items.push(...aggregation.items);
                existing.count += aggregation.count;
                existing.totalRelevance += aggregation.totalRelevance;
                existing.averageRelevance = existing.totalRelevance / existing.count;

                // Merge subcategories recursively
                const subcategoryMap = new Map<string, CategoryAggregationInfo>();
                for (const subcat of existing.subcategories) {
                    subcategoryMap.set(subcat.category, subcat);
                }
                for (const subcat of aggregation.subcategories) {
                    const existingSubcat = subcategoryMap.get(subcat.category);
                    if (existingSubcat) {
                        existingSubcat.items.push(...subcat.items);
                        existingSubcat.count += subcat.count;
                        existingSubcat.totalRelevance += subcat.totalRelevance;
                        existingSubcat.averageRelevance = existingSubcat.totalRelevance / existingSubcat.count;
                    } else {
                        subcategoryMap.set(subcat.category, { ...subcat });
                    }
                }
                existing.subcategories = Array.from(subcategoryMap.values());
            }
        }

        const mergedAggregations = Array.from(categoryMap.values());
        const totalItems = results.reduce((sum, result) => sum + result.totalItems, 0);
        const totalCategories = mergedAggregations.length;
        const maxCategorySize = Math.max(...mergedAggregations.map(agg => agg.count));
        const minCategorySize = Math.min(...mergedAggregations.map(agg => agg.count));
        const averageCategorySize = totalItems / totalCategories || 0;
        const hierarchyDepth = Math.max(...mergedAggregations.map(agg => agg.depth));

        return {
            aggregations: mergedAggregations,
            totalItems,
            totalCategories,
            maxCategorySize,
            minCategorySize,
            averageCategorySize,
            hierarchyDepth,
            metadata: {
                mergedFrom: results.length,
                mergeTimestamp: new Date().toISOString(),
            },
        };
    }

    /**
     * Calculate category diversity score (0-1, higher = more diverse)
     */
    static calculateDiversityScore(result: CategoryAggregationResult): number {
        if (result.totalCategories <= 1) return 0;

        const evenness = result.aggregations.reduce((sum, agg) => {
            const proportion = agg.count / result.totalItems;
            return sum - (proportion * Math.log(proportion + 1e-10)); // Shannon diversity
        }, 0);

        const maxPossibleEvenness = -Math.log(1 / result.totalCategories);
        return maxPossibleEvenness > 0 ? evenness / maxPossibleEvenness : 0;
    }

    /**
     * Get category concentration ratio (higher = more concentrated in few categories)
     */
    static calculateConcentrationRatio(result: CategoryAggregationResult, topN: number = 3): number {
        const topCategories = result.aggregations
            .sort((a, b) => b.count - a.count)
            .slice(0, topN);

        const topCount = topCategories.reduce((sum, agg) => sum + agg.count, 0);
        return result.totalItems > 0 ? topCount / result.totalItems : 0;
    }
}