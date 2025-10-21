import { PrismaClient } from '@prisma/client';
import { DatabaseContext } from './DatabaseContext';
import { sanitizeString, sanitizeNamespace } from '../config/SanitizationUtils';
import { DatabaseOperationMetrics } from './types';

/**
 * BaseDatabaseService provides shared helpers for database managers:
 * - Centralised access to DatabaseContext + Prisma
 * - Sanitisation wrappers for common input types
 * - Namespace helpers
 * - Operation metrics recording utilities
 */
export abstract class BaseDatabaseService {
  protected readonly databaseContext: DatabaseContext;
  protected readonly prisma: PrismaClient;

  constructor(databaseContext: DatabaseContext) {
    this.databaseContext = databaseContext;
    this.prisma = databaseContext.getPrismaClient();
  }

  /**
   * Sanitize generic string input using shared configuration utilities.
   */
  protected sanitizeString(value: string, options: Parameters<typeof sanitizeString>[1]) {
    return sanitizeString(value, options);
  }

  /**
   * Sanitize namespace input.
   */
  protected sanitizeNamespace(value: string, options?: Parameters<typeof sanitizeNamespace>[1]) {
    return sanitizeNamespace(value, options);
  }

  /**
   * Record successful operation metrics.
   */
  protected recordOperationSuccess(
    operationType: string,
    startTime: number,
    recordCount?: number,
  ): void {
    this.recordOperationMetrics({
      operationType,
      startTime,
      success: true,
      recordCount,
    });
  }

  /**
   * Record failed operation metrics.
   */
  protected recordOperationFailure(
    operationType: string,
    startTime: number,
    error: unknown,
  ): void {
    this.recordOperationMetrics({
      operationType,
      startTime,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  private recordOperationMetrics(metrics: DatabaseOperationMetrics): void {
    this.databaseContext.recordOperationMetrics(metrics);
  }
}
