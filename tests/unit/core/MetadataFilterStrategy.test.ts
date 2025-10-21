import { MetadataField, MetadataFilterStrategy } from '../../../src/core/domain/search/filtering/MetadataFilterStrategy';
import type { MetadataFilterStrategyConfig } from '../../../src/core/domain/search/filtering/MetadataFilterStrategy';
import { DatabaseManager } from '../../../src/core/infrastructure/database/DatabaseManager';
import { SearchQuery } from '../../../src/index';
import { SearchStrategyConfig } from '../../../src/core/domain/search/SearchStrategy';
import { SearchStrategy } from '../../../src/core/domain/search/types';

describe('MetadataFilterStrategy', () => {
    let strategy: MetadataFilterStrategy;
    let mockDbManager: jest.Mocked<DatabaseManager>;
    let mockPrisma: any;

    const defaultConfig: SearchStrategyConfig = {
        strategyName: SearchStrategy.METADATA_FILTER,
        enabled: true,
        priority: 9,
        timeout: 5000,
        maxResults: 100,
        performance: {
            enableMetrics: true,
            enableCaching: true,
            cacheSize: 200,
            enableParallelExecution: false,
        },
        scoring: {
            baseWeight: 0.6,
            recencyWeight: 0.2,
            importanceWeight: 0.4,
            relationshipWeight: 0.1,
        },
        strategySpecific: {
            fields: {
                enableNestedAccess: true,
                maxDepth: 5,
                enableTypeValidation: true,
                enableFieldDiscovery: true,
            },
            validation: {
                strictValidation: false,
                enableCustomValidators: true,
                failOnInvalidMetadata: false,
            },
            performance: {
                enableQueryOptimization: true,
                enableResultCaching: false,
                maxExecutionTime: 10000,
                batchSize: 100,
                cacheSize: 100,
            },
        },
    };

    type MetadataStrategyOverrides = {
        fields?: Partial<MetadataFilterStrategyConfig['fields']>;
        aggregation?: Partial<MetadataFilterStrategyConfig['aggregation']>;
        validation?: Partial<MetadataFilterStrategyConfig['validation']>;
        performance?: Partial<MetadataFilterStrategyConfig['performance']>;
    };

    const buildConfig = (overrides: MetadataStrategyOverrides = {}): SearchStrategyConfig => ({
        ...defaultConfig,
        strategySpecific: {
            ...defaultConfig.strategySpecific,
            ...overrides,
            fields: {
                ...(defaultConfig.strategySpecific as MetadataFilterStrategyConfig | undefined)?.fields,
                ...overrides.fields,
            },
            aggregation: {
                ...(defaultConfig.strategySpecific as MetadataFilterStrategyConfig | undefined)?.aggregation,
                ...overrides.aggregation,
            },
            validation: {
                ...(defaultConfig.strategySpecific as MetadataFilterStrategyConfig | undefined)?.validation,
                ...overrides.validation,
            },
            performance: {
                ...(defaultConfig.strategySpecific as MetadataFilterStrategyConfig | undefined)?.performance,
                ...overrides.performance,
            },
        },
    });

    beforeEach(() => {
        mockPrisma = {
            $queryRawUnsafe: jest.fn(),
        } as any;

        mockDbManager = {
            $queryRawUnsafe: jest.fn(),
            getPrismaClient: jest.fn(() => mockPrisma),
        } as any;

        strategy = new MetadataFilterStrategy(defaultConfig, mockDbManager);
    });

    describe('canHandle()', () => {
        it('should handle queries with metadata filters', () => {
            const query = {
                text: 'test query',
                metadataFilters: {
                    fields: [
                        {
                            key: 'category',
                            value: 'work',
                            operator: 'eq',
                        },
                    ],
                },
            } as any;

            expect(strategy.canHandle(query)).toBe(true);
        });


        it('should not handle queries without metadata', () => {
            const query: SearchQuery = {
                text: 'simple search query'
            };

            expect(strategy.canHandle(query)).toBe(false);
        });
    });

    describe('Metadata Field Processing', () => {
        it('should parse metadata from text patterns', () => {
            const text = 'Show me items where metadata.category=work and metadata.priority=high';
            const fields = (strategy as any).parseMetadataFromText(text);

            expect(fields.length).toBeGreaterThan(0);
            expect(fields.some((f: MetadataField) => f.key === 'category')).toBe(true);
            expect(fields.some((f: MetadataField) => f.key === 'priority')).toBe(true);
        });

        it('should infer field types correctly', () => {
            const booleanField = (strategy as any).inferFieldType('true');
            const numberField = (strategy as any).inferFieldType('123');
            const arrayField = (strategy as any).inferFieldType('[1,2,3]');
            const objectField = (strategy as any).inferFieldType('{"key":"value"}');
            const stringField = (strategy as any).inferFieldType('hello');

            expect(booleanField).toBe('boolean');
            expect(numberField).toBe('number');
            expect(arrayField).toBe('array');
            expect(objectField).toBe('object');
            expect(stringField).toBe('string');
        });
    });

    describe('Metadata Validation', () => {
        it('should validate required fields', () => {
            const metadata = { category: 'work', priority: 'high' };
            const validation = {
                strict: true,
                requiredFields: ['category', 'priority', 'status']
            };

            const result = (strategy as any).validateMetadata(metadata, validation);

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain("Required field 'status' is missing");
        });

        it('should validate field types', () => {
            const metadata = { count: 'not_a_number' };
            const validation = {
                strict: true,
                fieldTypes: { count: 'number' }
            };

            const result = (strategy as any).validateMetadata(metadata, validation);

            expect(result.isValid).toBe(false);
            expect(result.errors.some((e: string) => e.includes('type'))).toBe(true);
        });
    });

    describe('SQL Generation', () => {
        it('should build metadata WHERE clause', () => {
            const query: SearchQuery = { text: 'test' };
            const metadataQuery = {
                fields: [
                    {
                        key: 'category',
                        value: 'work',
                        operator: 'eq' as const
                    }
                ],
                options: {}
            };

            const whereClause = (strategy as any).buildMetadataWhereClause(query, metadataQuery);

            expect(whereClause).toContain("json_extract(metadata, '$.category')");
            expect(whereClause).toContain('work');
        });

        it('should handle nested metadata access', () => {
            const query: SearchQuery = { text: 'test' };
            const metadataQuery = {
                fields: [
                    {
                        key: 'user.profile.name',
                        value: 'john',
                        operator: 'eq' as const
                    }
                ],
                options: {}
            };

            const whereClause = (strategy as any).buildMetadataWhereClause(query, metadataQuery);

            expect(whereClause).toContain("$.user.$.profile.$.name");
        });

        it('should build text search conditions', () => {
            const searchText = 'hello world';
            const condition = (strategy as any).buildTextSearchCondition(searchText);

            expect(condition).toContain('searchableContent LIKE');
            expect(condition).toContain('hello');
            expect(condition).toContain('world');
        });
    });

    describe('Metadata Relevance Calculation', () => {
        it('should calculate metadata relevance scores', () => {
            const extractedFields: MetadataField[] = [
                { key: 'category', value: 'work', operator: 'exists', type: 'string' }
            ];
            const metadataQuery = {
                fields: [
                    { key: 'category', value: 'work', operator: 'eq' as const }
                ]
            };
            const query: SearchQuery = { text: 'work related' };

            const relevance = (strategy as any).calculateMetadataRelevance(
                extractedFields,
                metadataQuery,
                query
            );

            expect(relevance).toBeGreaterThan(0);
            expect(relevance).toBeLessThanOrEqual(1);
        });

        it('should boost relevance for field matches', () => {
            const extractedFields: MetadataField[] = [
                { key: 'category', value: 'work', operator: 'exists', type: 'string' }
            ];
            const metadataQuery = {
                fields: [
                    { key: 'category', value: 'work', operator: 'eq' as const }
                ]
            };
            const query: SearchQuery = { text: '' };

            const relevance = (strategy as any).calculateMetadataRelevance(
                extractedFields,
                metadataQuery,
                query
            );

            expect(relevance).toBeGreaterThan(0.3); // Base relevance
        });
    });

    describe('Field Comparison', () => {
        it('should compare metadata values with different operators', () => {
            expect((strategy as any).compareMetadataValues('work', 'work', 'eq')).toBe(true);
            expect((strategy as any).compareMetadataValues('work', 'personal', 'ne')).toBe(true);
            expect((strategy as any).compareMetadataValues('hello world', 'world', 'contains')).toBe(true);
            expect((strategy as any).compareMetadataValues('a', ['a', 'b', 'c'], 'in')).toBe(true);
            expect((strategy as any).compareMetadataValues(null, null, 'exists')).toBe(false);
        });
    });

    describe('Metadata Aggregation', () => {
        it('should group results by metadata fields', () => {
            const mockResults = [
                {
                    id: '1',
                    content: 'Content 1',
                    metadata: { category: 'work', priority: 'high' },
                    score: 0.9,
                    timestamp: new Date()
                },
                {
                    id: '2',
                    content: 'Content 2',
                    metadata: { category: 'work', priority: 'low' },
                    score: 0.8,
                    timestamp: new Date()
                },
                {
                    id: '3',
                    content: 'Content 3',
                    metadata: { category: 'personal', priority: 'high' },
                    score: 0.7,
                    timestamp: new Date()
                }
            ];

            const grouped = (strategy as any).groupResultsByFields(mockResults, ['category']);

            expect(grouped.size).toBe(2);
            expect(grouped.get('category:work')?.length).toBe(2);
            expect(grouped.get('category:personal')?.length).toBe(1);
        });

        it('should create aggregated results', () => {
            const mockGroup = [
                {
                    id: '1',
                    content: 'Content 1',
                    metadata: { category: 'work' },
                    score: 0.9,
                    timestamp: new Date()
                },
                {
                    id: '2',
                    content: 'Content 2',
                    metadata: { category: 'work' },
                    score: 0.8,
                    timestamp: new Date()
                }
            ];

            const aggregation = {
                enabled: true,
                groupBy: ['category']
            };

            const aggregatedResult = (strategy as any).createAggregatedResult('category:work', mockGroup, aggregation);

            expect(aggregatedResult.metadata.aggregated).toBe(true);
            expect(aggregatedResult.metadata.statistics.count).toBe(2);
            expect(aggregatedResult.metadata.statistics.averageScore).toBeCloseTo(0.85, 10);
            expect(aggregatedResult.metadata.groupKey).toBe('category:work');
        });
    });

    describe('Configuration Validation', () => {
        it('should validate strategy configuration', () => {
            const result = (strategy as any).validateStrategyConfiguration();
            expect(result).toBe(true);
        });

        it('should reject invalid maxDepth', () => {
            const invalidStrategy = new MetadataFilterStrategy(
                buildConfig({
                    fields: { maxDepth: 25 },
                }),
                mockDbManager
            );

            const result = (invalidStrategy as any).validateStrategyConfiguration();
            expect(result).toBe(false);
        });
    });

    describe('Performance and Caching', () => {
        it('should generate cache keys', () => {
            const query = {
                text: 'test query',
                metadataFilters: {
                    fields: [{ key: 'category', value: 'work', operator: 'eq' }]
                },
                limit: 10,
                offset: 0
            } as any;

            const cacheKey = (strategy as any).generateCacheKey(query);
            expect(typeof cacheKey).toBe('string');
            expect(cacheKey.length).toBeGreaterThan(0);
        });

        it('should clean up expired cache entries', () => {
            const cache = new Map();
            const now = Date.now();

            // Add expired entry
            cache.set('expired', { result: [], timestamp: now - 10 * 60 * 1000 });
            // Add valid entry
            cache.set('valid', { result: [], timestamp: now });

            (strategy as any).cache = cache;

            const initialSize = cache.size;
            (strategy as any).cleanupCache();

            expect(cache.size).toBeLessThan(initialSize);
            expect(cache.has('expired')).toBe(false);
            expect(cache.has('valid')).toBe(true);
        });
    });

    describe('Error Handling', () => {
        it('should handle database query errors gracefully', async () => {
            const query = {
                text: 'test query',
                metadataFilters: {
                    fields: [{ key: 'category', value: 'work', operator: 'eq' }]
                }
            } as any;

            const prisma = mockDbManager.getPrismaClient() as any;
            prisma.$queryRawUnsafe.mockRejectedValue(new Error('Database error'));

            await expect(strategy.search(query)).rejects.toThrow('metadata_filter');
        });

        it('should handle invalid metadata gracefully', () => {
            const metadata = { invalid: 'data' };
            const validation = {
                strict: false,
                requiredFields: ['missing_field']
            };

            const result = (strategy as any).validateMetadata(metadata, validation);

            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });
    });

    describe('Metadata Field Building', () => {
        it('should build field conditions for different operators', () => {
            const fields: MetadataField[] = [
                { key: 'status', value: 'active', operator: 'eq', type: 'string' },
                { key: 'count', value: 10, operator: 'gt', type: 'number' },
                { key: 'tags', value: ['urgent', 'important'], operator: 'in', type: 'array' },
                { key: 'category', value: null, operator: 'exists', type: 'string' }
            ];

            fields.forEach(field => {
                const condition = (strategy as any).buildMetadataFieldCondition(field);
                expect(condition).toBeTruthy();
            });
        });

        it('should reject invalid field names', () => {
            const field: MetadataField = {
                key: '',
                value: 'test',
                operator: 'eq'
            };

            const condition = (strategy as any).buildMetadataFieldCondition(field);
            expect(condition).toBeNull();
        });
    });

    describe('Nested Metadata Access', () => {
        it('should extract nested metadata fields', () => {
            const metadata = {
                user: {
                    profile: {
                        name: 'John',
                        settings: {
                            theme: 'dark'
                        }
                    }
                },
                tags: ['work', 'urgent']
            };

            const extractedFields = (strategy as any).extractMetadataFields(metadata);

            expect(extractedFields.length).toBeGreaterThan(0);
            expect(extractedFields.some((f: MetadataField) => f.key === 'user.profile.name')).toBe(true);
            expect(extractedFields.some((f: MetadataField) => f.key === 'user.profile.settings.theme')).toBe(true);
        });

        it('should get nested metadata values', () => {
            const metadata = {
                user: {
                    profile: {
                        name: 'John'
                    }
                }
            };

            const value = (strategy as any).getNestedMetadataValue(metadata, 'user.profile.name');
            expect(value).toBe('John');
        });
    });
});
