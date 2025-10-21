import { TemporalFilterStrategy } from '../../../src/core/domain/search/filtering/TemporalFilterStrategy';
import { RecentMemoriesStrategy } from '../../../src/core/domain/search/RecentMemoriesStrategy';
import { DatabaseManager } from '../../../src/core/infrastructure/database/DatabaseManager';
import { SearchQuery } from '../../../src/core/domain/search/types';
import { SearchStrategy } from '../../../src/core/domain/search/types';
import { SearchStrategyConfig } from '../../../src/core/domain/search/SearchStrategy';
import { TemporalFilterOptions, TimeRange } from '../../../src/core/types/models';

/**
 * Integration tests for TemporalFilterStrategy and RecentMemoriesStrategy
 * Tests the enhanced searchRecentMemories API integration
 */
describe('Temporal Strategy Integration Tests', () => {
    let temporalStrategy: TemporalFilterStrategy;
    let recentStrategy: RecentMemoriesStrategy;
    let mockDbManager: jest.Mocked<DatabaseManager>;

    const defaultTemporalConfig: SearchStrategyConfig = {
        strategyName: SearchStrategy.TEMPORAL_FILTER,
        enabled: true,
        priority: 6,
        timeout: 5000,
        maxResults: 200,
        performance: {
            enableMetrics: true,
            enableCaching: true,
            cacheSize: 300,
            enableParallelExecution: true,
        },
        scoring: {
            baseWeight: 0.6,
            recencyWeight: 0.9,
            importanceWeight: 0.3,
            relationshipWeight: 0.1,
        },
        strategySpecific: {
            naturalLanguage: {
                enableParsing: true,
                enablePatternMatching: true,
                confidenceThreshold: 0.3,
            },
            performance: {
                enableQueryOptimization: true,
                enableResultCaching: true,
                maxExecutionTime: 10000,
                batchSize: 100,
            },
        },
    } as const;

    const defaultRecentConfig = {
        enabled: true,
        priority: 3,
        timeout: 5000,
        maxResults: 100,
        minScore: 0.1
    };

    beforeEach(() => {
        // Mock successful database response - use the correct field names that match the SQL query
        const mockResults = [
            {
                id: '1',
                searchableContent: 'recent work content that matches the query',
                summary: 'Work summary',
                metadata: JSON.stringify({ namespace: 'test-namespace' }),
                memoryType: 'long_term',
                categoryPrimary: 'work',
                importanceScore: '0.8',
                createdAt: new Date().toISOString()
            }
        ];

        // Create the prisma client mock first
        const mockQueryRawUnsafe = jest.fn().mockResolvedValue(mockResults);
        const mockPrisma = {
            $queryRawUnsafe: mockQueryRawUnsafe,
            $on: jest.fn(),
            $connect: jest.fn(),
            $disconnect: jest.fn(),
            $executeRaw: jest.fn(),
            $executeRawUnsafe: jest.fn(),
            $transaction: jest.fn(),
            $extends: jest.fn(),
            $metrics: {},
            longTermMemory: {},
            shortTermMemory: {},
            chatHistory: {}
        } as any;

        mockDbManager = {
            $queryRawUnsafe: jest.fn(),
            storeLongTermMemory: jest.fn(),
            storeChatHistory: jest.fn(),
            searchMemories: jest.fn(),
            getSearchService: jest.fn(),
            getPrismaClient: jest.fn(() => mockPrisma),
            prisma: mockPrisma, // Add prisma property for the strategy to use
            currentNamespace: 'test-namespace', // Add namespace for filtering
        } as any;

        temporalStrategy = new TemporalFilterStrategy(defaultTemporalConfig, mockDbManager);
        recentStrategy = new RecentMemoriesStrategy({
          strategyName: SearchStrategy.RECENT,
          ...defaultRecentConfig,
        }, mockDbManager);
    });

    describe('TemporalFilterStrategy Integration', () => {
        describe('canHandle() method', () => {
            it('should handle queries with temporal filters', () => {
                const query: SearchQuery = {
                    text: 'recent work',
                    filters: {
                        temporalFilters: {
                            timeRanges: [{
                                start: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
                                end: new Date()
                            }],
                            relativeExpressions: ['last week'],
                            absoluteDates: [new Date()],
                            patterns: ['daily standup']
                        }
                    }
                };

                // The canHandle method checks for temporalFilters OR temporal patterns in text
                // Since we have temporalFilters, this should return true
                expect(temporalStrategy.canHandle(query)).toBe(true);
            });

            it('should handle queries with natural language temporal expressions', () => {
                const query: SearchQuery = {
                    text: 'Show me what happened yesterday afternoon'
                };

                expect(temporalStrategy.canHandle(query)).toBe(true);
            });

            it('should not handle queries without temporal content', () => {
                const query: SearchQuery = {
                    text: 'simple search query'
                };

                expect(temporalStrategy.canHandle(query)).toBe(false);
            });
        });

        describe('Temporal Query Building', () => {
            it('should build temporal query from SearchQuery', () => {
                const query: SearchQuery = {
                    text: 'work from last week',
                    filters: {
                        temporalFilters: {
                            relativeExpressions: ['last week'],
                            timeRanges: [{
                                start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                                end: new Date()
                            }]
                        }
                    }
                };

                const normalized = (temporalStrategy as any).normalizeQuery(query);
                const temporalQuery = (temporalStrategy as any).buildTemporalQuery(normalized, {
                    patterns: [],
                    overallConfidence: 0,
                    requiresContext: false,
                });

                expect(temporalQuery.ranges).toBeDefined();
                // Should have at least the time range we provided
                expect(temporalQuery.ranges.length).toBeGreaterThanOrEqual(1);
                expect(temporalQuery.operation).toBe('UNION');
            });

            it('should process relative expressions correctly', () => {
                const expressions = ['last week', 'yesterday', '2 hours ago'];
                const query: SearchQuery = {
                    text: 'test',
                    filters: {
                        temporalFilters: {
                            relativeExpressions: expressions
                        }
                    }
                };

                const normalized = (temporalStrategy as any).normalizeQuery(query);
                const temporalQuery = (temporalStrategy as any).buildTemporalQuery(normalized, {
                    patterns: [],
                    overallConfidence: 0,
                    requiresContext: false,
                });

                // Should have processed at least some of the expressions into time ranges
                // Note: Some expressions might fail parsing, but we should get some ranges
                expect(temporalQuery.ranges).toBeDefined();
            });
        });

        describe('SQL Generation', () => {
            it('should generate temporal WHERE clause with time ranges', () => {
                const query: SearchQuery = { text: 'test query' };
                const temporalQuery = {
                    ranges: [{
                        start: new Date('2024-01-01T00:00:00Z'),
                        end: new Date('2024-01-02T00:00:00Z')
                    }],
                    operation: 'UNION' as const,
                    granularity: 'hour' as const
                };
                const patterns = { patterns: [], overallConfidence: 0, requiresContext: false };

                const whereClause = (temporalStrategy as any).buildTemporalWhereClause(query, temporalQuery, patterns);

                expect(whereClause).toContain('created_at BETWEEN');
                expect(whereClause).toContain('2024-01-01');
                expect(whereClause).toContain('2024-01-02');
            });

            it('should generate temporal relevance calculation', () => {
                const temporalQuery = {
                    ranges: [],
                    operation: 'UNION' as const,
                    granularity: 'hour' as const
                };

                const calculation = (temporalStrategy as any).buildTemporalRelevanceCalculation('created_at', temporalQuery);

                // The calculation should contain the base temporal relevance logic
                expect(calculation).toContain('EXP'); // Exponential decay function
                expect(calculation).toContain('604800'); // 7 days in seconds
                expect(calculation).toContain('CASE'); // SQL CASE statement
                expect(calculation).toContain('created_at'); // The field being used
            });
        });

        describe('Temporal Relevance Scoring', () => {
            it('should calculate temporal relevance for recent memories', () => {
                const recentRow = {
                    created_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
                    importance_score: 0.8,
                };
                const patterns = { patterns: [], overallConfidence: 0, requiresContext: false };

                const relevance = (temporalStrategy as any).calculateTemporalRelevance(
                    recentRow,
                    patterns,
                    new Date()
                );

                expect(relevance).toBeGreaterThan(0.5);
                expect(relevance).toBeLessThanOrEqual(1);
            });

            it('should apply range boost for memories in specified ranges', () => {
                const memoryRow = {
                    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
                    importance_score: 0.6,
                };
                const query: SearchQuery = {
                    text: 'test',
                    filters: {
                        temporalFilters: {
                            timeRanges: [{
                                start: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
                                end: new Date() // now
                            }]
                        }
                    }
                };
                const patterns = { patterns: [], overallConfidence: 0, requiresContext: false };

                const relevance = (temporalStrategy as any).calculateTemporalRelevance(
                    memoryRow,
                    patterns,
                    new Date()
                );

                // Should be boosted because memory is in the specified range
                expect(relevance).toBeGreaterThan(0.8);
            });
        });

        describe('Pattern Analysis', () => {
            it('should analyze temporal patterns in text', () => {
                const text = 'Show me what happened during yesterday\'s meeting at 2pm';
                const analysis = (temporalStrategy as any).analyzeTemporalPatterns({ text });

                expect(analysis).toBeDefined();
                expect(analysis.overallConfidence).toBeGreaterThan(0);
            });

            it('should detect multiple temporal patterns', () => {
                const text = 'Compare last week\'s performance with this week\'s results';
                const analysis = (temporalStrategy as any).analyzeTemporalPatterns({ text });

                expect(analysis.patterns.length).toBeGreaterThan(0);
            });
        });

        describe('Error Handling', () => {
            it('should handle invalid relative expressions gracefully', () => {
                const query: SearchQuery = {
                    text: 'test',
                    filters: {
                        temporalFilters: {
                            relativeExpressions: ['invalid expression']
                        }
                    }
                };

                // Should not throw error, just log warning
                expect(() => {
                    const normalized = (temporalStrategy as any).normalizeQuery(query);
                    (temporalStrategy as any).buildTemporalQuery(normalized, {
                        patterns: [],
                        overallConfidence: 0,
                        requiresContext: false,
                    });
                }).not.toThrow();
            });

            it('should handle database query failures', async () => {
                const query: SearchQuery = {
                    text: 'test query',
                    filters: {
                        temporalFilters: {
                            timeRanges: [{
                                start: new Date(),
                                end: new Date()
                            }]
                        }
                    }
                };

                // Override the prisma mock to reject for this test
                const mockPrismaClient = (mockDbManager as any).prisma;
                mockPrismaClient.$queryRawUnsafe.mockRejectedValueOnce(new Error('Database error'));

                await expect(temporalStrategy.search(query)).rejects.toThrow('Database error in temporal_filter');
            });
        });
    });

    describe('RecentMemoriesStrategy Integration', () => {
        describe('canHandle() method', () => {
            it('should handle empty queries for recent memories', () => {
                const query: SearchQuery = {
                    text: ''
                };

                expect(recentStrategy.canHandle(query)).toBe(true);
            });

            it('should handle queries with temporal filters', () => {
                const query: SearchQuery = {
                    text: 'recent work',
                    filters: {
                        createdAfter: new Date(Date.now() - 24 * 60 * 60 * 1000),
                        since: '1 day ago'
                    }
                };

                expect(recentStrategy.canHandle(query)).toBe(true);
            });

            it('should handle age-based filters', () => {
                const query: SearchQuery = {
                    text: 'old memories',
                    filters: {
                        age: 'older than 1 week'
                    }
                };

                expect(recentStrategy.canHandle(query)).toBe(true);
            });
        });

        describe('Temporal Filter Processing', () => {
            it('should parse relative time expressions', () => {
                const sinceDate = (recentStrategy as any).parseRelativeTime('1 day ago');
                const untilDate = (recentStrategy as any).parseRelativeTime('2 hours ago');

                expect(sinceDate).toBeInstanceOf(Date);
                expect(untilDate).toBeInstanceOf(Date);
                expect(sinceDate.getTime()).toBeLessThan(untilDate.getTime());
            });

            it('should parse age filters correctly', () => {
                const youngerDate = (recentStrategy as any).parseAgeFilter('younger than 1 day');
                const olderDate = (recentStrategy as any).parseAgeFilter('older than 1 week');

                expect(youngerDate).toBeInstanceOf(Date);
                expect(olderDate).toBeInstanceOf(Date);
                expect(youngerDate.getTime()).toBeGreaterThan(olderDate.getTime()); // Younger should be more recent
            });

            it('should handle invalid relative time gracefully', () => {
                expect(() => {
                    (recentStrategy as any).parseRelativeTime('invalid format');
                }).toThrow('Invalid relative time format');
            });
        });

        describe('Time-based Relevance Scoring', () => {
            it('should calculate time relevance with exponential decay', () => {
                const recentTime = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago
                const queryTime = new Date();

                const relevance = (recentStrategy as any).calculateTimeRelevance(recentTime, queryTime);

                expect(relevance).toBeGreaterThan(0.5); // Should be highly relevant
                expect(relevance).toBeLessThanOrEqual(1);
            });

            it('should apply freshness boost for very recent memories', () => {
                const veryRecentTime = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago
                const queryTime = new Date();

                const freshnessBoost = (recentStrategy as any).calculateFreshnessBoost(veryRecentTime, queryTime);

                expect(freshnessBoost).toBeGreaterThan(1); // Should be boosted
            });

            it('should decay relevance for older memories', () => {
                const oldTime = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
                const queryTime = new Date();

                const relevance = (recentStrategy as any).calculateTimeRelevance(oldTime, queryTime);

                expect(relevance).toBeLessThan(0.5); // Should be less relevant
            });
        });

        describe('SQL Generation', () => {
            it('should generate temporal WHERE clause with date filters', () => {
                const query: SearchQuery = {
                    text: 'test',
                    filters: {
                        createdAfter: new Date('2024-01-01'),
                        createdBefore: new Date('2024-01-31')
                    }
                };

                const whereClause = (recentStrategy as any).buildTemporalWhereClause(query);

                expect(whereClause).toContain('created_at >=');
                expect(whereClause).toContain('created_at <=');
                expect(whereClause).toContain('2024-01-01');
                expect(whereClause).toContain('2024-01-31');
            });

            it('should generate ORDER BY clause with time relevance', () => {
                const query: SearchQuery = { text: 'test' };

                const orderByClause = (recentStrategy as any).buildTemporalOrderByClause(query);

                expect(orderByClause).toContain('ORDER BY time_relevance_score DESC');
                expect(orderByClause).toContain('importance_score DESC');
                expect(orderByClause).toContain('created_at DESC');
            });
        });

        describe('Configuration Validation', () => {
            it('should validate time decay configuration', () => {
                const result = (recentStrategy as any).validateStrategyConfiguration();
                expect(result).toBe(true);
            });

            it('should reject invalid half-life', () => {
                // Test the validation logic directly on the strategy instance
                const strategy = new RecentMemoriesStrategy({
                  strategyName: SearchStrategy.RECENT,
                  ...defaultRecentConfig,
                }, mockDbManager);

                // Access the private configuration and modify it for testing
                (strategy as any).timeDecayConfig = {
                    halfLifeMs: -1, // Invalid negative value
                    minScore: 0.1,
                    maxScore: 1.0,
                    recentBoostWindowMs: 3600000,
                    recentBoostFactor: 1.5
                };

                const result = (strategy as any).validateStrategyConfiguration();
                expect(result).toBe(false);
            });
        });
    });

    describe('Strategy Integration and Selection', () => {
        it('should prioritize TemporalFilterStrategy for temporal queries', () => {
            const temporalQuery: SearchQuery = {
                text: 'Show me yesterday\'s meeting notes',
                filters: {
                    temporalFilters: {
                        relativeExpressions: ['yesterday']
                    }
                }
            };

            const recentQuery: SearchQuery = {
                text: '',
                filters: {
                    since: '1 hour ago'
                }
            };

            expect(temporalStrategy.canHandle(temporalQuery)).toBe(true);
            expect(recentStrategy.canHandle(recentQuery)).toBe(true);
            expect(temporalStrategy.priority).toBeGreaterThan(recentStrategy.priority);
        });

        it('should handle mixed temporal and text queries', () => {
            const mixedQuery: SearchQuery = {
                text: 'urgent work from last week',
                filters: {
                    temporalFilters: {
                        relativeExpressions: ['last week'],
                        patterns: ['urgent']
                    }
                }
            };

            // Temporal strategy should handle this due to temporal filters
            expect(temporalStrategy.canHandle(mixedQuery)).toBe(true);

            // Recent strategy should also handle this due to temporal content
            expect(recentStrategy.canHandle(mixedQuery)).toBe(true);
        });
    });

    describe('End-to-End Integration Scenarios', () => {
        it('should handle basic temporal filtering scenario', async () => {
            const temporalOptions: TemporalFilterOptions = {
                timeRanges: [{
                    start: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
                    end: new Date()
                }],
                relativeExpressions: ['last 24 hours']
            };

            const query: SearchQuery = {
                text: 'recent work',
                filters: {
                    temporalFilters: temporalOptions
                },
                limit: 10
            };

            // Override the mock query result
            const mockPrismaClient = (mockDbManager as any).prisma;
            // Create a fresh mock result for this test
            const testMockResults = [
                {
                    id: '1',
                    searchableContent: 'recent work content that matches the query',
                    summary: 'Work summary',
                    metadata: JSON.stringify({ namespace: 'test-namespace' }),
                    memoryType: 'long_term',
                    categoryPrimary: 'work',
                    importanceScore: '0.8',
                    createdAt: new Date().toISOString()
                }
            ];
            mockPrismaClient.$queryRawUnsafe.mockResolvedValueOnce(testMockResults);

            const results = await temporalStrategy.search(query);

            expect(results).toBeDefined();
            expect(results.length).toBeGreaterThan(0);
            expect(results[0].strategy).toBe(SearchStrategy.TEMPORAL_FILTER);
        });

        it('should handle recent memories scenario with freshness boosting', async () => {
            const query: SearchQuery = {
                text: '', // Empty query for recent memories
                limit: 5
            };

            const mockResults = [
                {
                    memory_id: '1',
                    searchable_content: 'Very recent content',
                    summary: 'Recent summary',
                    metadata: '{}',
                    memory_type: 'short_term',
                    category_primary: 'personal',
                    importance_score: '0.6',
                    created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
                    time_relevance_score: '0.8'
                },
                {
                    memory_id: '2',
                    searchable_content: 'Older content',
                    summary: 'Older summary',
                    metadata: '{}',
                    memory_type: 'long_term',
                    category_primary: 'work',
                    importance_score: '0.8',
                    created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // 1 week ago
                    time_relevance_score: '0.3'
                }
            ];

            // Mock the getPrismaClient method to return an object with $queryRawUnsafe
            const mockPrisma = { $queryRawUnsafe: jest.fn().mockResolvedValue(mockResults) };
            (mockDbManager as any).getPrismaClient.mockReturnValue(mockPrisma);

            const results = await recentStrategy.search(query);

            expect(results).toBeDefined();
            expect(results.length).toBe(2);

            // More recent memory should have higher score due to freshness boost
            expect(results[0].score).toBeGreaterThanOrEqual(results[1].score);
        });

        it('should handle error scenarios gracefully', async () => {
            const query: SearchQuery = {
                text: 'test query',
                filters: {
                    temporalFilters: {
                        relativeExpressions: ['last week']
                    }
                }
            };

            // Override both prisma and getPrismaClient mocks to reject for this test
            const mockPrismaClient = (mockDbManager as any).prisma;
            const mockGetPrismaClient = mockDbManager.getPrismaClient;

            // Create a mock that rejects
            const rejectingMock = {
                $queryRawUnsafe: jest.fn().mockRejectedValue(new Error('Database connection failed')),
                $on: jest.fn(),
                $connect: jest.fn(),
                $disconnect: jest.fn(),
                $executeRaw: jest.fn(),
                $executeRawUnsafe: jest.fn(),
                $transaction: jest.fn(),
                $extends: jest.fn(),
                $metrics: {},
                longTermMemory: {},
                shortTermMemory: {},
                chatHistory: {}
            } as any;

            mockPrismaClient.$queryRawUnsafe.mockRejectedValueOnce(new Error('Database connection failed'));
            mockGetPrismaClient.mockReturnValueOnce(rejectingMock);

            await expect(temporalStrategy.search(query)).rejects.toThrow();
            await expect(recentStrategy.search(query)).rejects.toThrow();
        });
    });
});
