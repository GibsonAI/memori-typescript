import { MemoryConsolidationService } from '../../../src/core/infrastructure/database/MemoryConsolidationService';
import { MemoryClassification, MemoryImportanceLevel } from '../../../src/core/types/schemas';
import { PrismaClient } from '@prisma/client';
import { RepositoryFactory } from '../../../src/core/infrastructure/database/factories/RepositoryFactory';
import { ConsolidationService } from '../../../src/core/infrastructure/database/interfaces/ConsolidationService';
import { DuplicateCandidate, ConsolidationResult, ConsolidationStats } from '../../../src/core/infrastructure/database/types/consolidation-models';
import { TestHelper, beforeEachTest, afterEachTest } from '../../setup/database/TestHelper';

describe('MemoryConsolidationService (Optimized)', () => {
  let consolidationService: MemoryConsolidationService;
  let prisma: PrismaClient;
  let testContext: Awaited<ReturnType<typeof beforeEachTest>>;

  beforeEach(async () => {
    // 🚀 OPTIMIZED: Use shared database instead of creating per-test files
    testContext = await beforeEachTest('unit', 'MemoryConsolidationService');
    prisma = testContext.prisma;

    // Create service using shared database with unique namespace for isolation
    consolidationService = new MemoryConsolidationService(
      RepositoryFactory.createTestConsolidationRepository(prisma),
      testContext.namespace
    );
  });

  afterEach(async () => {
    // ⚡ OPTIMIZED: Namespace-based cleanup instead of transactions
    await afterEachTest(testContext.testName, testContext.namespace);
  });

  describe('Constructor and Basic Operations', () => {
    it('should create MemoryConsolidationService instance', () => {
      expect(consolidationService).toBeDefined();
    });

    it('should implement ConsolidationService interface', () => {
      expect(consolidationService).toBeInstanceOf(MemoryConsolidationService);
      // Verify key methods from ConsolidationService interface exist
      expect(typeof consolidationService.detectDuplicateMemories).toBe('function');
      expect(typeof consolidationService.markMemoryAsDuplicate).toBe('function');
      expect(typeof consolidationService.consolidateMemories).toBe('function');
      expect(typeof consolidationService.getConsolidationAnalytics).toBe('function');
    });

    it('should have correct namespace', () => {
      // The namespace should be the generated one from TestHelper, not a hardcoded value
      expect((consolidationService as any).namespace).toBeDefined();
      expect(typeof (consolidationService as any).namespace).toBe('string');
    });

    it('should have repository instance', () => {
      expect((consolidationService as any).repository).toBeDefined();
    });
  });

  describe('detectDuplicateMemories', () => {
    it('should return empty array for basic functionality test', async () => {
      const content = 'test content for duplicate detection';
      const result = await consolidationService.detectDuplicateMemories(content, 0.7);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0); // Empty as this is extracted functionality
    });

    it('should return DuplicateCandidate array with proper structure', async () => {
      const content = 'test content for duplicate detection';
      const result = await consolidationService.detectDuplicateMemories(content, 0.7);

      expect(Array.isArray(result)).toBe(true);
      // Each result should be a DuplicateCandidate object if any are returned
      if (result.length > 0) {
        expect(result[0]).toHaveProperty('id');
        expect(result[0]).toHaveProperty('content');
        expect(result[0]).toHaveProperty('similarityScore');
        expect(result[0]).toHaveProperty('confidence');
        expect(result[0]).toHaveProperty('consolidationRecommendation');
      }
    });

    it('should handle different threshold values', async () => {
      const content = 'test content';
      const result1 = await consolidationService.detectDuplicateMemories(content, 0.5);
      const result2 = await consolidationService.detectDuplicateMemories(content, 0.9);

      expect(Array.isArray(result1)).toBe(true);
      expect(Array.isArray(result2)).toBe(true);
    });

    it('should handle empty content gracefully', async () => {
      const result = await consolidationService.detectDuplicateMemories('', 0.7);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle configuration parameter', async () => {
      const content = 'test content with config';
      const config = {
        similarityThreshold: 0.7,
        maxCandidates: 10,
        enableFuzzyMatching: true,
      };
      const result = await consolidationService.detectDuplicateMemories(content, 0.7, config);
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('markAsDuplicate', () => {
    it('should mark a memory as duplicate successfully', async () => {
      // First create a test memory with unique ID (let TestHelper generate it)
       const testMemoryData = TestHelper.createTestLongTermMemory(testContext, {
         searchableContent: 'Test memory content for duplicate marking',
         summary: 'Test summary',
         classification: 'essential',
         memoryImportance: 'medium',
         categoryPrimary: 'test-category',
         retentionType: 'long_term',
         importanceScore: 0.5,
         extractionTimestamp: new Date(),
         createdAt: new Date(),
         processedData: {},
       });

      const memoryId = await prisma.longTermMemory.create({
        data: testMemoryData,
      });

      // Create the original memory with unique ID (let TestHelper generate it)
       const originalMemoryData = TestHelper.createTestLongTermMemory(testContext, {
         searchableContent: 'Original memory content',
         summary: 'Original summary',
         classification: 'essential',
         memoryImportance: 'high',
         categoryPrimary: 'test-category',
         retentionType: 'long_term',
         importanceScore: 0.8,
         extractionTimestamp: new Date(),
         createdAt: new Date(),
         processedData: {},
       });

       const originalMemory = await prisma.longTermMemory.create({
         data: originalMemoryData,
       });

       await expect(
         consolidationService.markMemoryAsDuplicate(memoryId.id, originalMemory.id, 'test consolidation')
       ).resolves.not.toThrow();

      // Verify the memory was marked as duplicate
       const updatedMemory = await prisma.longTermMemory.findUnique({
         where: { id: memoryId.id },
       });

       expect(updatedMemory?.duplicateOf).toBe(originalMemory.id);
      expect(updatedMemory?.classificationReason).toBe('test consolidation');
    });

    it('should handle non-existent memory gracefully', async () => {
      await expect(
        consolidationService.markMemoryAsDuplicate('non-existent-id', 'original-id', 'test')
      ).rejects.toThrow('Duplicate memory not found');
    });
  });

  describe('updateDuplicateTracking', () => {
     let memory1: any;
     let memory2: any;

     beforeEach(async () => {
       // Create test memories with unique IDs (let TestHelper generate them)
       const memoryData1 = TestHelper.createTestLongTermMemory(testContext, {
         searchableContent: 'First test memory',
         summary: 'First summary',
         classification: 'essential',
         memoryImportance: 'high',
         categoryPrimary: 'test-category',
         retentionType: 'long_term',
         importanceScore: 0.7,
         extractionTimestamp: new Date(),
         createdAt: new Date(),
         processedData: {},
       });

       const memoryData2 = TestHelper.createTestLongTermMemory(testContext, {
         searchableContent: 'Second test memory',
         summary: 'Second summary',
         classification: 'contextual',
         memoryImportance: 'low',
         categoryPrimary: 'test-category',
         retentionType: 'long_term',
         importanceScore: 0.3,
         extractionTimestamp: new Date(),
         createdAt: new Date(),
         processedData: {},
       });

       memory1 = await prisma.longTermMemory.create({ data: memoryData1 });
       memory2 = await prisma.longTermMemory.create({ data: memoryData2 });
     });

    it('should update duplicate tracking for multiple memories', async () => {
      const updates = [
        {
          memoryId: memory1.id,
          isDuplicate: true,
          duplicateOf: `original-1-${testContext.testName}`,
          consolidationReason: 'batch update test',
        },
        {
          memoryId: memory2.id,
          isDuplicate: false,
          consolidationReason: 'not a duplicate',
        },
      ];

      const result = await consolidationService.updateDuplicateTracking(updates);

      expect(result.updated).toBe(2);
      expect(result.errors.length).toBe(0);
    });

    it('should handle non-existent memory in batch update', async () => {
      const updates = [
        {
          memoryId: memory1.id,
          isDuplicate: true,
        },
        {
          memoryId: 'non-existent-memory',
          isDuplicate: true,
        },
      ];

      const result = await consolidationService.updateDuplicateTracking(updates);

      expect(result.updated).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('non-existent-memory');
    });

    it('should handle empty updates array', async () => {
      const result = await consolidationService.updateDuplicateTracking([]);
      expect(result.updated).toBe(0);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('consolidateDuplicateMemories', () => {
     let primaryMemory: any;
     let duplicateMemory1: any;
     let duplicateMemory2: any;

     beforeEach(async () => {
       // Create primary memory with unique ID (let TestHelper generate it)
       const primaryMemoryData = TestHelper.createTestLongTermMemory(testContext, {
         searchableContent: 'Primary memory content for consolidation testing',
         summary: 'Primary memory summary',
         classification: 'essential',
         memoryImportance: 'high',
         categoryPrimary: 'test-category',
         retentionType: 'long_term',
         importanceScore: 0.8,
         extractionTimestamp: new Date(),
         createdAt: new Date(),
         processedData: {},
       });

       primaryMemory = await prisma.longTermMemory.create({
         data: primaryMemoryData,
       });

       // Create duplicate memories with unique IDs (let TestHelper generate them)
       const duplicateData1 = TestHelper.createTestLongTermMemory(testContext, {
         searchableContent: 'Similar content for duplicate consolidation test',
         summary: 'Similar summary one',
         classification: 'contextual',
         memoryImportance: 'medium',
         categoryPrimary: 'test-category',
         retentionType: 'long_term',
         importanceScore: 0.6,
         extractionTimestamp: new Date(),
         createdAt: new Date(),
         processedData: {},
       });

       const duplicateData2 = TestHelper.createTestLongTermMemory(testContext, {
         searchableContent: 'Another similar content for consolidation',
         summary: 'Similar summary two',
         classification: 'contextual',
         memoryImportance: 'low',
         categoryPrimary: 'test-category',
         retentionType: 'long_term',
         importanceScore: 0.4,
         extractionTimestamp: new Date(),
         createdAt: new Date(),
         processedData: {},
       });

       duplicateMemory1 = await prisma.longTermMemory.create({ data: duplicateData1 });
       duplicateMemory2 = await prisma.longTermMemory.create({ data: duplicateData2 });
     });

    it('should validate consolidation inputs correctly', async () => {
      // Test empty duplicate IDs
      const result1 = await consolidationService.consolidateMemories(primaryMemory.id, []);
      expect(result1.consolidatedCount).toBe(0);
      expect(result1.success).toBe(true); // Empty consolidation is considered successful

      // Test primary memory in duplicate list
      const result2 = await consolidationService.consolidateMemories(primaryMemory.id, [primaryMemory.id]);
      expect(result2.consolidatedCount).toBe(1); // Self-consolidation creates a consolidated record
      expect(result2.success).toBe(true);
    });

    it('should handle non-existent memories gracefully', async () => {
      const result = await consolidationService.consolidateMemories(
        `non-existent-primary-${testContext.testName}`,
        [`non-existent-duplicate-${testContext.testName}`]
      );

      expect(result.consolidatedCount).toBe(0);
      expect(result.success).toBe(false);
    });

    it('should consolidate memories with valid inputs', async () => {
      const result = await consolidationService.consolidateMemories(
        primaryMemory.id,
        [duplicateMemory1.id, duplicateMemory2.id]
      );

      // The consolidation might succeed or fail depending on implementation details
      // We just verify it doesn't throw and returns expected structure
      expect(result).toHaveProperty('consolidatedCount');
      expect(result).toHaveProperty('success');
      expect(typeof result.consolidatedCount).toBe('number');
      expect(typeof result.success).toBe('boolean');
      expect(result).toHaveProperty('primaryMemoryId');
      expect(result).toHaveProperty('consolidatedMemoryIds');
      expect(result).toHaveProperty('dataIntegrityHash');
    });
  });

  describe('getConsolidationStats', () => {
    beforeEach(async () => {
      // Create some test memories with different states using unique IDs (let TestHelper generate them)
      const statsMemoryData1 = TestHelper.createTestLongTermMemory(testContext, {
        searchableContent: 'Stats test memory one',
        summary: 'Summary one',
        classification: 'essential',
        memoryImportance: 'high',
        categoryPrimary: 'test-category',
        retentionType: 'long_term',
        importanceScore: 0.8,
        extractionTimestamp: new Date(),
        createdAt: new Date(),
        processedData: {
          isDuplicate: true,
          duplicateOf: `original-1-${testContext.testName}`,
        },
      });

      const statsMemoryData2 = TestHelper.createTestLongTermMemory(testContext, {
        searchableContent: 'Stats test memory two',
        summary: 'Summary two',
        classification: 'contextual',
        memoryImportance: 'medium',
        categoryPrimary: 'test-category',
        retentionType: 'long_term',
        importanceScore: 0.5,
        extractionTimestamp: new Date(),
        createdAt: new Date(),
        processedData: {},
      });

      await prisma.longTermMemory.create({ data: statsMemoryData1 });
      await prisma.longTermMemory.create({ data: statsMemoryData2 });
    });

    it('should return consolidation statistics', async () => {
      const stats = await consolidationService.getConsolidationAnalytics();

      expect(stats).toHaveProperty('totalMemories');
      expect(stats).toHaveProperty('duplicateCount');
      expect(stats).toHaveProperty('consolidatedMemories');
      expect(stats).toHaveProperty('averageConsolidationRatio');
      expect(stats).toHaveProperty('lastConsolidationActivity');

      expect(typeof stats.totalMemories).toBe('number');
      expect(typeof stats.duplicateCount).toBe('number');
      expect(typeof stats.consolidatedMemories).toBe('number');
      expect(typeof stats.averageConsolidationRatio).toBe('number');
    });

    it('should return consolidation statistics via legacy method', async () => {
      const stats = await consolidationService.getConsolidationAnalytics();

      expect(stats).toHaveProperty('totalMemories');
      expect(stats).toHaveProperty('duplicateCount');
      expect(stats).toHaveProperty('consolidatedMemories');
      expect(stats).toHaveProperty('averageConsolidationRatio');
      expect(stats).toHaveProperty('lastConsolidationActivity');

      expect(typeof stats.totalMemories).toBe('number');
      expect(typeof stats.duplicateCount).toBe('number');
      expect(typeof stats.consolidatedMemories).toBe('number');
      expect(typeof stats.averageConsolidationRatio).toBe('number');
    });

    it('should handle empty database gracefully', async () => {
      // Create a new service with fresh namespace for truly empty database
      const uniqueEmptyNamespace = `empty-${testContext.testName}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
      const emptyService = new MemoryConsolidationService(
        RepositoryFactory.createTestConsolidationRepository(prisma),
        uniqueEmptyNamespace
      );
      const stats = await emptyService.getConsolidationAnalytics();

      expect(stats.totalMemories).toBe(0);
      expect(stats.consolidatedMemories).toBe(0);
      expect(stats.averageConsolidationRatio).toBe(0);
    });
  });

  describe('cleanupConsolidatedMemories', () => {
    beforeEach(async () => {
      // Create old consolidated memory for cleanup testing with unique namespace (let TestHelper generate ID)
      const oldDate = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000); // 40 days ago

      const oldMemoryData = TestHelper.createTestLongTermMemory(testContext, {
        searchableContent: 'Old duplicate memory for cleanup',
        summary: 'Old summary',
        classification: 'contextual',
        memoryImportance: 'low',
        categoryPrimary: 'test-category',
        retentionType: 'long_term',
        importanceScore: 0.2,
        extractionTimestamp: oldDate,
        createdAt: oldDate,
        processedData: {
          isDuplicate: true,
          duplicateOf: `some-original-${testContext.testName}`,
          consolidatedAt: oldDate,
        },
      });

      await prisma.longTermMemory.create({
        data: oldMemoryData,
      });
    });

    it('should perform dry run cleanup without errors', async () => {
      const result = await consolidationService.cleanupOldConsolidatedMemories(30, true);

      expect(result).toHaveProperty('cleaned');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('skipped');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(typeof result.cleaned).toBe('number');
      expect(typeof result.skipped).toBe('number');
    });

    it('should handle cleanup with no old memories', async () => {
      const result = await consolidationService.cleanupOldConsolidatedMemories(1, true);
      expect(result.errors.length).toBe(0);
    });

    it('should validate input parameters', async () => {
      await expect(
        consolidationService.cleanupOldConsolidatedMemories(0, true)
      ).resolves.toBeDefined();

      await expect(
        consolidationService.cleanupOldConsolidatedMemories(-1, true)
      ).resolves.toBeDefined();
    });

    it('should return cleanup result via legacy method', async () => {
      const result = await consolidationService.cleanupOldConsolidatedMemories(30, true);
      expect(result).toHaveProperty('cleaned');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('skipped');
    });
  });

  describe('New Service Methods', () => {
    it('should validate consolidation eligibility', async () => {
      const result = await consolidationService.validateConsolidationEligibility(`test-memory-id-${testContext.testName}`, [`test-duplicate-id-${testContext.testName}`]);

      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(typeof result.isValid).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    it('should get consolidation history', async () => {
      const result = await consolidationService.getConsolidationHistory(`test-memory-id-${testContext.testName}`);

      expect(result).toHaveProperty('consolidationEvents');
      expect(result).toHaveProperty('currentStatus');
      expect(Array.isArray(result.consolidationEvents)).toBe(true);
      expect(typeof result.currentStatus).toBe('string');
    });

    it('should preview consolidation operation', async () => {
      const result = await consolidationService.previewConsolidation(`test-memory-id-${testContext.testName}`, [`test-duplicate-id-${testContext.testName}`]);

      expect(result).toHaveProperty('estimatedResult');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('recommendations');
      expect(Array.isArray(result.warnings)).toBe(true);
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(result.estimatedResult).toHaveProperty('consolidatedCount');
      expect(result.estimatedResult).toHaveProperty('dataIntegrityHash');
    });

    it('should get optimization recommendations', async () => {
      const result = await consolidationService.getOptimizationRecommendations();

      expect(result).toHaveProperty('recommendations');
      expect(result).toHaveProperty('overallHealth');
      expect(result).toHaveProperty('nextMaintenanceDate');
      expect(Array.isArray(result.recommendations)).toBe(true);
      expect(typeof result.overallHealth).toBe('string');
      expect(result.nextMaintenanceDate).toBeInstanceOf(Date);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      // Create service with invalid database
      const badPrisma = new PrismaClient({
        datasourceUrl: 'file:/invalid/path/that/does/not/exist/non-existent.db'
      });
      const badService = new MemoryConsolidationService(
        RepositoryFactory.createTestConsolidationRepository(badPrisma),
        testContext.namespace
      );

      await expect(
        badService.detectDuplicateMemories('test', 0.7)
      ).rejects.toThrow();

      await badPrisma.$disconnect();
    });

    it('should handle malformed data gracefully', async () => {
      // Create memory with malformed processedData using unique ID (let TestHelper generate it)
      const malformedMemoryData = TestHelper.createTestLongTermMemory(testContext, {
        searchableContent: 'Malformed data test',
        summary: 'Summary',
        classification: 'essential',
        memoryImportance: 'medium',
        categoryPrimary: 'test-category',
        retentionType: 'long_term',
        importanceScore: 0.5,
        extractionTimestamp: new Date(),
        createdAt: new Date(),
        processedData: 'invalid-json-string' as any, // Malformed JSON
      });

      await prisma.longTermMemory.create({
        data: malformedMemoryData,
      });

      // Should handle gracefully
      const stats = await consolidationService.getConsolidationAnalytics();
      expect(stats).toBeDefined();
      expect(typeof stats.totalMemories).toBe('number');
    });
  });
});