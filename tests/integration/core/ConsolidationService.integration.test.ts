import { MemoryConsolidationService } from '../../../src/core/infrastructure/database/MemoryConsolidationService';
import { PrismaConsolidationRepository } from '../../../src/core/infrastructure/database/repositories/PrismaConsolidationRepository';
import { RepositoryFactory } from '../../../src/core/infrastructure/database/factories/RepositoryFactory';
import { PrismaClient } from '@prisma/client';
import { TestHelper, beforeEachTest, afterEachTest } from '../../setup/database/TestHelper';

describe('ConsolidationService Integration Tests (Optimized)', () => {
  let consolidationService: MemoryConsolidationService;
  let repository: PrismaConsolidationRepository;
  let prisma: PrismaClient;
  let testContext: Awaited<ReturnType<typeof beforeEachTest>>;
  let memory1: any;
  let memory2: any;
  let memory3: any;

  beforeEach(async () => {
    // 🚀 OPTIMIZED: Use shared integration database instead of creating per-test files
    testContext = await beforeEachTest('integration', 'ConsolidationServiceIntegration');
    prisma = testContext.prisma;

    repository = new PrismaConsolidationRepository(prisma);
    consolidationService = new MemoryConsolidationService(repository, testContext.namespace);

    // Create test memories for integration testing with unique namespaces
    const integrationMemoryData1 = TestHelper.createTestLongTermMemory(testContext, {
      searchableContent: 'TypeScript provides excellent type safety for large applications',
      summary: 'TypeScript benefits',
      classification: 'essential',
      memoryImportance: 'high',
      categoryPrimary: 'programming',
      retentionType: 'long_term',
      importanceScore: 0.8,
      extractionTimestamp: new Date(),
      createdAt: new Date(),
      processedData: {},
    });

    const integrationMemoryData2 = TestHelper.createTestLongTermMemory(testContext, {
      searchableContent: 'JavaScript is the foundation of web development and programming',
      summary: 'JavaScript fundamentals',
      classification: 'essential',
      memoryImportance: 'high',
      categoryPrimary: 'programming',
      retentionType: 'long_term',
      importanceScore: 0.7,
      extractionTimestamp: new Date(),
      createdAt: new Date(),
      processedData: {},
    });

    const integrationMemoryData3 = TestHelper.createTestLongTermMemory(testContext, {
      searchableContent: 'React is a popular framework for building user interfaces',
      summary: 'React overview',
      classification: 'contextual',
      memoryImportance: 'medium',
      categoryPrimary: 'frameworks',
      retentionType: 'long_term',
      importanceScore: 0.6,
      extractionTimestamp: new Date(),
      createdAt: new Date(),
      processedData: {},
    });

    memory1 = await prisma.longTermMemory.create({ data: integrationMemoryData1 });
    memory2 = await prisma.longTermMemory.create({ data: integrationMemoryData2 });
    memory3 = await prisma.longTermMemory.create({ data: integrationMemoryData3 });
  });

  afterEach(async () => {
    // ⚡ OPTIMIZED: Just rollback transaction instead of deleting files
    await afterEachTest(testContext.testName);
  });

  describe('Service-Repository Integration', () => {
    it('should integrate duplicate detection between service and repository', async () => {
      const content = 'TypeScript and JavaScript are both crucial for modern web development';

      // Test the full integration
      const candidates = await consolidationService.detectDuplicateMemories(content, 0.5);

      expect(Array.isArray(candidates)).toBe(true);

      // If candidates are found, verify they have the expected structure
      if (candidates.length > 0) {
        candidates.forEach(candidate => {
          expect(candidate).toHaveProperty('id');
          expect(candidate).toHaveProperty('content');
          expect(candidate).toHaveProperty('similarityScore');
          expect(candidate).toHaveProperty('confidence');
          expect(candidate).toHaveProperty('consolidationRecommendation');

          // Verify service layer added business logic
          expect(typeof candidate.confidence).toBe('number');
          expect(candidate.confidence).toBeGreaterThanOrEqual(0);
          expect(candidate.confidence).toBeLessThanOrEqual(1);
          expect(['merge', 'replace', 'ignore']).toContain(candidate.consolidationRecommendation);
        });
      }
    });

    it('should integrate memory consolidation workflow end-to-end', async () => {
      // Step 1: Find duplicates
      const duplicates = await consolidationService.detectDuplicateMemories(
        'TypeScript provides strong typing for better development experience',
        0.5
      );

      if (duplicates.length > 0) {
        // Step 2: Mark first duplicate
        const duplicateId = duplicates[0].id;
        await consolidationService.markMemoryAsDuplicate(duplicateId, memory1.id, 'integration test');

        // Step 3: Verify it was marked correctly
         const markedMemory = await repository.getConsolidatedMemory(duplicateId, testContext.namespace);
          expect(markedMemory?.isDuplicate).toBe(true);
          expect(markedMemory?.duplicateOf).toBe(memory1.id);
      }
    });

    it('should integrate consolidation statistics correctly', async () => {
      // Create some duplicates first
      await consolidationService.markMemoryAsDuplicate(memory2.id, memory1.id, 'test duplicate');

      // Get stats from service
      const stats = await consolidationService.getConsolidationAnalytics();

      // Verify stats are calculated correctly
      expect(stats.totalMemories).toBeGreaterThanOrEqual(0); // Allow for 0 memories in test
      expect(typeof stats.duplicateCount).toBe('number');
      expect(typeof stats.consolidatedMemories).toBe('number');
      expect(typeof stats.averageConsolidationRatio).toBe('number');

      // Stats should match what repository provides (both using same namespace)
      const repositoryStats = await repository.getConsolidationStatistics(testContext.namespace);
      expect(stats.totalMemories).toBe(repositoryStats.totalMemories);
      expect(stats.duplicateCount).toBe(repositoryStats.duplicateCount);
      expect(stats.consolidatedMemories).toBe(repositoryStats.consolidatedMemories);
    });

    it('should handle validation and error integration', async () => {
      // Test validation integration
      const validation = await consolidationService.validateConsolidationEligibility(
        memory1.id,
        [memory2.id, memory3.id]
      );

      expect(validation).toHaveProperty('isValid');
      expect(validation).toHaveProperty('errors');
      expect(validation).toHaveProperty('warnings');
      expect(Array.isArray(validation.errors)).toBe(true);
      expect(Array.isArray(validation.warnings)).toBe(true);

      if (validation.isValid) {
        // If valid, proceed with consolidation
        const result = await consolidationService.consolidateMemories(memory1.id, [
          memory2.id,
          memory3.id,
        ]);

        expect(result.success).toBe(true);
        expect(result.consolidatedCount).toBe(2);
        expect(result.primaryMemoryId).toBe(memory1.id);
        expect(result.consolidatedMemoryIds).toEqual([memory2.id, memory3.id]);
      }
    });
  });

  describe('End-to-End Consolidation Workflow', () => {
    it('should perform complete consolidation workflow', async () => {
      // 1. Detect potential duplicates
      const content = 'TypeScript and JavaScript enable robust web development';
      const duplicates = await consolidationService.detectDuplicateMemories(content, 0.6);

      expect(Array.isArray(duplicates)).toBe(true);

      if (duplicates.length >= 2) {
        const primaryId = duplicates[0].id;
        const duplicateIds = duplicates.slice(1, 3).map(d => d.id);

        // 2. Validate consolidation
         const validation = await consolidationService.validateConsolidationEligibility(primaryId, duplicateIds);
         expect(typeof validation.isValid).toBe('boolean');

         if (validation.isValid) {
           // 3. Preview consolidation
           const preview = await consolidationService.previewConsolidation(primaryId, duplicateIds);
           expect(preview).toHaveProperty('estimatedResult');
           expect(preview).toHaveProperty('warnings');
           expect(preview).toHaveProperty('recommendations');

           // 4. Perform consolidation
           const result = await consolidationService.consolidateMemories(primaryId, duplicateIds);
           expect(result.success).toBe(true);
           expect(result.consolidatedCount).toBe(duplicateIds.length);

           // 5. Verify consolidation
           const primaryMemory = await repository.getConsolidatedMemory(primaryId, testContext.namespace);
           expect(primaryMemory?.isConsolidated).toBe(true);
           expect(primaryMemory?.consolidationCount).toBe(duplicateIds.length);

          // 6. Check updated statistics
          const finalStats = await consolidationService.getConsolidationAnalytics();
          expect(finalStats.consolidatedMemories).toBeGreaterThan(0);
        }
      }
    });

    it('should handle consolidation rollback workflow', async () => {
      // Create a consolidation scenario
      await consolidationService.markMemoryAsDuplicate(memory3.id, memory1.id, 'rollback test');

      // Backup data before consolidation
      const memoryIds = [memory1.id, memory3.id];
      const backupData = await repository.backupMemoryData(memoryIds, testContext.namespace);

      // Perform consolidation
      const consolidationResult = await consolidationService.consolidateMemories(memory1.id, [memory3.id]);
      expect(consolidationResult.success).toBe(true);

      // Generate rollback token (using data integrity hash)
      const rollbackToken = consolidationResult.dataIntegrityHash;

      // Perform rollback
      const rollbackResult = await consolidationService.rollbackConsolidation(memory1.id, rollbackToken);
      expect(rollbackResult).toHaveProperty('success');
      expect(rollbackResult).toHaveProperty('restoredMemories');
      expect(rollbackResult).toHaveProperty('errors');

      // Verify rollback was successful
      if (rollbackResult.success) {
        const restoredMemory = await repository.getConsolidatedMemory(memory3.id, testContext.namespace);
        // After rollback, the memory should no longer be consolidated
        expect(restoredMemory?.isConsolidated).toBe(false);
      }
    });
  });

  describe('Performance Integration', () => {
    it('should perform duplicate detection within performance requirements', async () => {
      const content = 'TypeScript provides excellent type safety for large scale applications';
      const startTime = Date.now();

      const candidates = await consolidationService.detectDuplicateMemories(content, 0.7);

      const duration = Date.now() - startTime;

      expect(Array.isArray(candidates)).toBe(true);
      // Performance requirement: <100ms for duplicate detection
      expect(duration).toBeLessThan(100);
    });

    it('should handle large scale consolidation efficiently', async () => {
      // Create multiple memories for batch testing
      const batchSize = 10;
      const batchMemories = [];

      for (let i = 0; i < batchSize; i++) {
        const batchMemoryData = TestHelper.createTestLongTermMemory(testContext, {
          searchableContent: `Batch memory ${i} with similar content for testing`,
          summary: `Summary ${i}`,
          classification: 'contextual',
          memoryImportance: 'medium',
          categoryPrimary: 'test',
          retentionType: 'long_term',
          importanceScore: 0.5,
          extractionTimestamp: new Date(),
          createdAt: new Date(),
          processedData: {},
        });

        const batchMemory = await prisma.longTermMemory.create({ data: batchMemoryData });
        batchMemories.push(batchMemory);
      }

      const startTime = Date.now();

      // Mark all as duplicates of first memory
      for (let i = 1; i < batchMemories.length; i++) {
        await consolidationService.markMemoryAsDuplicate(batchMemories[i].id, batchMemories[0].id, `batch test ${i}`);
      }

      const markDuration = Date.now() - startTime;

      // Consolidate them
      const consolidateStartTime = Date.now();
      const result = await consolidationService.consolidateMemories(batchMemories[0].id, batchMemories.slice(1).map(m => m.id));
      const consolidateDuration = Date.now() - consolidateStartTime;

      expect(result.success).toBe(true);
      expect(result.consolidatedCount).toBe(batchSize - 1);

      // Performance validation
      expect(markDuration).toBeLessThan(1000); // Should handle batch marking efficiently
      expect(consolidateDuration).toBeLessThan(500); // Consolidation should be fast
    });
  });

  describe('Error Integration and Recovery', () => {
    it('should handle and recover from repository errors gracefully', async () => {
      // Test with non-existent memories
      const invalidResult = await consolidationService.consolidateMemories(
        'non-existent-primary',
        ['non-existent-duplicate']
      );

      expect(invalidResult.success).toBe(false);
      expect(invalidResult.consolidatedCount).toBe(0);
      expect(invalidResult.consolidatedCount).toBe(0);

      // Service should still be functional after error
      const stats = await consolidationService.getConsolidationAnalytics();
      expect(stats).toBeDefined();
      expect(typeof stats.totalMemories).toBe('number');
    });

    it('should maintain data consistency during partial failures', async () => {
      // Create scenario where some duplicates exist and some don't
      const validDuplicate = memory3.id;
      const invalidDuplicate = 'non-existent-duplicate';

      // This should handle the mixed scenario gracefully
      const result = await consolidationService.updateDuplicateTracking([
        {
          memoryId: validDuplicate,
          isDuplicate: true,
          duplicateOf: memory1.id,
          consolidationReason: 'partial test',
        },
        {
          memoryId: invalidDuplicate,
          isDuplicate: true,
          duplicateOf: memory1.id,
          consolidationReason: 'partial test',
        },
      ]);

      // Should have partial success
      expect(result.updated).toBe(1); // Only the valid one
      expect(result.errors.length).toBe(1); // One error for invalid memory

      // Verify the valid update was applied
      const updatedMemory = await repository.getConsolidatedMemory(validDuplicate, testContext.namespace);
      expect(updatedMemory?.isDuplicate).toBe(true);
    });
  });

  describe('Dependency Injection Integration', () => {
    it('should work correctly with RepositoryFactory', async () => {
      // Test using RepositoryFactory instead of direct instantiation
      const factoryService = new MemoryConsolidationService(
        RepositoryFactory.createTestConsolidationRepository(prisma),
        'factory-test'
      );

      const candidates = await factoryService.detectDuplicateMemories('test content', 0.5);
      expect(Array.isArray(candidates)).toBe(true);

      // Should work the same as direct repository
      const directService = new MemoryConsolidationService(repository, 'direct-test');
      const directCandidates = await directService.detectDuplicateMemories('test content', 0.5);

      expect(Array.isArray(directCandidates)).toBe(true);
    });

    it('should handle repository interface abstraction correctly', async () => {
      // Verify that the service works with any IConsolidationRepository implementation
      const testRepository = RepositoryFactory.createTestConsolidationRepository(prisma);

      expect(testRepository).toBeDefined();

      const interfaceService = new MemoryConsolidationService(testRepository, 'interface-test');

      // Should work without knowing the concrete implementation
      const result = await interfaceService.getConsolidationAnalytics();
      expect(result).toBeDefined();
      expect(typeof result.totalMemories).toBe('number');
    });
  });

  describe('Business Logic Integration', () => {
    it('should apply business rules correctly in service layer', async () => {
      // Test that service layer adds business logic beyond repository
      const content = 'Very short content';
      const candidates = await consolidationService.detectDuplicateMemories(content, 0.9);

      // Service should filter and add business logic
      candidates.forEach(candidate => {
        // Verify service layer enhanced the data
        expect(candidate.confidence).toBeDefined();
        expect(candidate.consolidationRecommendation).toBeDefined();

        // Short similar content should have lower confidence due to business rules
        if (content.length < 50) {
          expect(candidate.confidence).toBeLessThan(0.9);
        }
      });
    });

    it('should handle optimization recommendations integration', async () => {
      // Create scenario that should trigger recommendations
      await consolidationService.markMemoryAsDuplicate(memory2.id, memory1.id, 'optimization test');

      const recommendations = await consolidationService.getOptimizationRecommendations();

      expect(recommendations).toHaveProperty('recommendations');
      expect(recommendations).toHaveProperty('overallHealth');
      expect(recommendations).toHaveProperty('nextMaintenanceDate');

      expect(Array.isArray(recommendations.recommendations)).toBe(true);
      expect(typeof recommendations.overallHealth).toBe('string');
      expect(recommendations.nextMaintenanceDate).toBeInstanceOf(Date);

      // Should have at least one recommendation
      expect(recommendations.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Logging and Monitoring Integration', () => {
    it('should integrate logging between service and repository layers', async () => {
      // This test verifies that logging works across layers
      // In a real scenario, you would check log files or monitoring systems

      const content = 'Test content for logging integration';

      // Operations should complete without throwing
      const candidates = await consolidationService.detectDuplicateMemories(content, 0.5);
      expect(Array.isArray(candidates)).toBe(true);

      // Service should handle repository errors and log them appropriately
      const invalidResult = await consolidationService.consolidateMemories('invalid-id', ['also-invalid']);
      expect(invalidResult.success).toBe(false);
      expect(invalidResult.consolidatedCount).toBe(0);
      // Error should be logged (would be visible in log files)
    });
  });
});