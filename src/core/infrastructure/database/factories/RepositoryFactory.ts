// src/core/database/factories/RepositoryFactory.ts

import { PrismaClient } from '@prisma/client';
import { IConsolidationRepository } from '../interfaces/IConsolidationRepository';
import { PrismaConsolidationRepository } from '../repositories/PrismaConsolidationRepository';

/**
 * Factory for creating repository instances
 * Provides centralized repository creation for dependency injection and testing
 */
export class RepositoryFactory {
  private static consolidationRepository: IConsolidationRepository | null = null;
  private static prismaClient: PrismaClient | null = null;

  /**
   * Create or get cached consolidation repository instance
   */
  static createConsolidationRepository(prisma?: PrismaClient): IConsolidationRepository {
    if (this.consolidationRepository && !prisma) {
      return this.consolidationRepository;
    }

    const prismaClient = prisma || this.getPrismaClient();
    this.consolidationRepository = new PrismaConsolidationRepository(prismaClient);

    return this.consolidationRepository;
  }

  /**
   * Create a test consolidation repository with custom Prisma client
   */
  static createTestConsolidationRepository(prisma: PrismaClient): IConsolidationRepository {
    return new PrismaConsolidationRepository(prisma);
  }

  /**
   * Reset cached repository instances (for testing)
   */
  static reset(): void {
    this.consolidationRepository = null;
    this.prismaClient = null;
  }

  /**
   * Get or create Prisma client instance
   */
  private static getPrismaClient(): PrismaClient {
    if (!this.prismaClient) {
      this.prismaClient = new PrismaClient();
    }
    return this.prismaClient;
  }

  /**
   * Set custom Prisma client (for testing)
   */
  static setPrismaClient(prisma: PrismaClient): void {
    this.prismaClient = prisma;
  }
}