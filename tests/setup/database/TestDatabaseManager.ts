import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { existsSync, unlinkSync } from 'fs';
import { performance } from 'perf_hooks';

/**
 * TestDatabaseManager - Singleton for managing shared test databases
 *
 * Optimizes test performance by:
 * - Using shared database files per test suite type
 * - One-time schema initialization
 * - Connection reuse across tests
 * - WAL mode for concurrent access
 */
export class TestDatabaseManager {
  private static instance: TestDatabaseManager;
  private prismaClients: Map<string, PrismaClient> = new Map();
  private databasePaths: Map<string, string> = new Map();
  private initializationMetrics: Map<string, { duration: number; timestamp: number }> = new Map();
  private isInitialized: Map<string, boolean> = new Map();

  private constructor() {}

  /**
   * Get singleton instance
   */
  public static getInstance(): TestDatabaseManager {
    if (!TestDatabaseManager.instance) {
      TestDatabaseManager.instance = new TestDatabaseManager();
    }
    return TestDatabaseManager.instance;
  }

  /**
   * Get or create Prisma client for test suite type
   */
  public async getClient(suiteType: 'unit' | 'integration'): Promise<PrismaClient> {
    const dbKey = `test-${suiteType}`;

    // Return existing client if available
    if (this.prismaClients.has(dbKey)) {
      return this.prismaClients.get(dbKey)!;
    }

    // Initialize database if not already done
    await this.initializeDatabase(suiteType);

    // Create new Prisma client with optimized settings
    const databaseUrl = this.databasePaths.get(dbKey)!;
    const prisma = new PrismaClient({
      datasourceUrl: databaseUrl,
      log: process.env.TEST_DEBUG ? ['query', 'error', 'warn'] : ['error'],
    });

    // Enable WAL mode for better concurrent access
    await this.enableWALMode(prisma);

    this.prismaClients.set(dbKey, prisma);
    return prisma;
  }

  /**
   * Initialize database for test suite type (one-time operation)
   */
  private async initializeDatabase(suiteType: 'unit' | 'integration'): Promise<void> {
    const dbKey = `test-${suiteType}`;

    if (this.isInitialized.get(dbKey)) {
      return;
    }

    const startTime = performance.now();
    // Use absolute path to avoid confusion with working directory
    const dbPath = `${process.cwd()}/test-db-${suiteType}.sqlite`;

    // Ensure clean initialization by removing any existing files first
    await this.cleanupDatabaseFile(dbPath);

    // Also clean up any files in prisma/ directory that might conflict
    await this.cleanupDatabaseFile(`${process.cwd()}/prisma/test-db-${suiteType}.sqlite`);

    try {
      // Create database URL with absolute path
      const databaseUrl = `file:${dbPath}`;

      // Only log if explicitly requested (reduces noise and Jest warnings)
      if (process.env.TEST_DEBUG) {
        console.log(`Working directory: ${process.cwd()}`);
        console.log(`Initializing ${suiteType} test database...`);
        console.log(`Database path: ${dbPath}`);
        console.log(`Database URL: ${databaseUrl}`);
      }

      // Verify the file doesn't exist before pushing schema
      if (existsSync(dbPath)) {
        if (process.env.TEST_DEBUG) {
          console.log(`⚠️ Database file already exists before schema push, cleaning up...`);
        }
        await this.cleanupDatabaseFile(dbPath);
      }

      // IMPORTANT: Clear any existing DATABASE_URL from environment to prevent conflicts
      const cleanEnv = { ...process.env };
      delete cleanEnv.DATABASE_URL;

      // First try with explicit stdio to see what's happening
      try {
        execSync(`DATABASE_URL=${databaseUrl} npx prisma db push --accept-data-loss --force-reset`, {
          stdio: 'pipe',
          env: { ...cleanEnv, DATABASE_URL: databaseUrl },
        });
      } catch (error: any) {
        if (process.env.TEST_DEBUG) {
          console.error('Prisma command failed, stderr:', error.stderr?.toString());
          console.error('Prisma command failed, stdout:', error.stdout?.toString());
        }
        throw error;
      }

      // Verify the database file was created successfully
      if (!existsSync(dbPath)) {
        throw new Error(`Database file was not created: ${dbPath}`);
      }

      const stats = await import('fs').then(fs => fs.statSync(dbPath));
      if (process.env.TEST_DEBUG) {
        console.log(`✅ Database file created successfully: ${dbPath} (${stats.size} bytes)`);
      }

      // Store database path and mark as initialized
      this.databasePaths.set(dbKey, databaseUrl);
      this.isInitialized.set(dbKey, true);

      const duration = performance.now() - startTime;
      this.initializationMetrics.set(dbKey, { duration, timestamp: Date.now() });

      if (process.env.TEST_DEBUG) {
        console.log(`✅ ${suiteType} test database initialized in ${duration.toFixed(2)}ms`);
      }

    } catch (error) {
      // If initialization fails, cleanup and rethrow
      await this.cleanupDatabaseFile(dbPath);
      if (process.env.TEST_DEBUG) {
        console.error(`❌ Failed to initialize ${suiteType} test database:`, error);
      }
      throw error;
    }
  }

  /**
   * Safely cleanup database file
   */
  private async cleanupDatabaseFile(dbPath: string): Promise<void> {
    try {
      if (existsSync(dbPath)) {
        // Try multiple times in case of file locks
        let retries = 3;
        while (retries > 0) {
          try {
            unlinkSync(dbPath);
            if (process.env.TEST_DEBUG) {
              console.log(`🗑️ Cleaned up existing database file: ${dbPath}`);
            }
            break;
          } catch (error) {
            retries--;
            if (retries > 0) {
              if (process.env.TEST_DEBUG) {
                console.warn(`Retrying database file cleanup (${retries} attempts left)...`);
              }
              await new Promise(resolve => setTimeout(resolve, 100));
            } else {
              if (process.env.TEST_DEBUG) {
                console.warn(`Failed to remove existing test database ${dbPath}:`, error);
              }
            }
          }
        }
      }
    } catch (error) {
      if (process.env.TEST_DEBUG) {
        console.warn(`Error during database file cleanup for ${dbPath}:`, error);
      }
    }
  }

  /**
    * Enable SQLite WAL mode for better concurrent access
    */
   private async enableWALMode(prisma: PrismaClient): Promise<void> {
     try {
       // Only attempt WAL mode in non-test environments or when explicitly requested
       // This prevents "Cannot log after tests are done" warnings from Prisma errors
       if (process.env.NODE_ENV === 'test' && !process.env.TEST_DEBUG) {
         return; // Skip WAL mode setup in tests unless debug logging is enabled
       }

       // Use $queryRaw for PRAGMA statements that return values, then ignore the result
       await prisma.$queryRaw`PRAGMA journal_mode = WAL`;
       await prisma.$queryRaw`PRAGMA synchronous = NORMAL`;
       await prisma.$queryRaw`PRAGMA cache_size = 10000`;
       await prisma.$queryRaw`PRAGMA temp_store = memory`;

       // Verify WAL mode is active
       const journalMode = await prisma.$queryRaw`PRAGMA journal_mode` as Array<{ journal_mode: string }>;
       if (journalMode[0]?.journal_mode === 'wal') {
         if (process.env.TEST_DEBUG) {
           console.log('✅ SQLite WAL mode enabled successfully');
         }
       } else {
         if (process.env.TEST_DEBUG) {
           console.warn('⚠️ SQLite WAL mode may not be active');
         }
       }
     } catch (error) {
       // Suppress WAL mode errors in test environment to prevent "Cannot log after tests are done" warnings
       if (process.env.NODE_ENV === 'test' && !process.env.TEST_DEBUG) {
         return; // Silently ignore WAL mode failures in tests
       }

       if (process.env.TEST_DEBUG) {
         console.warn('Failed to optimize SQLite settings:', error);
       }
       // Don't throw - these are optimizations, not requirements
     }
   }

  /**
   * Reset database for test suite (fast cleanup)
   */
  public async resetDatabase(suiteType: 'unit' | 'integration'): Promise<void> {
    const dbKey = `test-${suiteType}`;
    const prisma = this.prismaClients.get(dbKey);

    if (!prisma) {
      if (process.env.TEST_DEBUG) {
        console.warn(`No database client found for ${suiteType} tests`);
      }
      return;
    }

    const startTime = performance.now();

    try {
      // Use transactions for atomic cleanup
      await prisma.$transaction(async (tx) => {
        // Disable foreign key checks temporarily for faster truncation
        await tx.$executeRaw`PRAGMA foreign_keys = OFF`;

        try {
          // Truncate all tables in dependency order
          const tables = ['LongTermMemory', 'ShortTermMemory', 'ChatHistory'];

          for (const table of tables) {
            try {
              await tx.$executeRaw`DELETE FROM ${table}`;
            } catch (error) {
              if (process.env.TEST_DEBUG) {
                console.warn(`Failed to truncate ${table}:`, error);
              }
            }
          }

          // Reset sequences/auto-increment
          await tx.$executeRaw`DELETE FROM sqlite_sequence`;

        } finally {
          // Re-enable foreign key checks
          await tx.$executeRaw`PRAGMA foreign_keys = ON`;
        }
      });

      const duration = performance.now() - startTime;
      if (process.env.TEST_DEBUG) {
        console.log(`✅ Database reset for ${suiteType} tests in ${duration.toFixed(2)}ms`);
      }

    } catch (error) {
      if (process.env.TEST_DEBUG) {
        console.error(`❌ Failed to reset ${suiteType} test database:`, error);
      }
      throw error;
    }
  }

  /**
   * Get database metrics for monitoring
   */
  public getMetrics(suiteType?: 'unit' | 'integration') {
    if (suiteType) {
      const dbKey = `test-${suiteType}`;
      return {
        isInitialized: this.isInitialized.get(dbKey) || false,
        initializationMetrics: this.initializationMetrics.get(dbKey),
        hasClient: this.prismaClients.has(dbKey),
      };
    }

    // Return all metrics
    const allMetrics: Record<string, any> = {};
    for (const suite of ['unit', 'integration']) {
      const dbKey = `test-${suite}`;
      allMetrics[suite] = {
        isInitialized: this.isInitialized.get(dbKey) || false,
        initializationMetrics: this.initializationMetrics.get(dbKey),
        hasClient: this.prismaClients.has(dbKey),
      };
    }

    return allMetrics;
  }

  /**
    * Clean up all databases and connections
    */
   public async cleanup(): Promise<void> {
     if (process.env.TEST_DEBUG) {
       console.log('🧹 Cleaning up test databases...');
     }

     // Close all Prisma clients
     for (const [dbKey, prisma] of this.prismaClients.entries()) {
       try {
         await prisma.$disconnect();
         if (process.env.TEST_DEBUG) {
           console.log(`✅ Closed database connection for ${dbKey}`);
         }
       } catch (error) {
         if (process.env.TEST_DEBUG) {
           console.warn(`⚠️ Error closing database connection for ${dbKey}:`, error);
         }
       }
     }

     this.prismaClients.clear();

     // Clean up database files (both in root and prisma directory)
     const potentialPaths = ['unit', 'integration'];
     for (const suiteType of potentialPaths) {
       const dbKey = `test-${suiteType}`;
       const rootPath = `${process.cwd()}/test-db-${suiteType}.sqlite`;
       const prismaPath = `${process.cwd()}/prisma/test-db-${suiteType}.sqlite`;

       // Clean up root location
       if (existsSync(rootPath)) {
         try {
           unlinkSync(rootPath);
           if (process.env.TEST_DEBUG) {
             console.log(`✅ Removed database file: ${rootPath}`);
           }
         } catch (error) {
           if (process.env.TEST_DEBUG) {
             console.warn(`⚠️ Error removing database file ${rootPath}:`, error);
           }
         }
       }

       // Clean up prisma directory location
       if (existsSync(prismaPath)) {
         try {
           unlinkSync(prismaPath);
           if (process.env.TEST_DEBUG) {
             console.log(`✅ Removed database file: ${prismaPath}`);
           }
         } catch (error) {
           if (process.env.TEST_DEBUG) {
             console.warn(`⚠️ Error removing database file ${prismaPath}:`, error);
           }
         }
       }

       // Clean up from our tracking maps
       this.databasePaths.delete(dbKey);
       this.isInitialized.delete(dbKey);
       this.initializationMetrics.delete(dbKey);
     }

     if (process.env.TEST_DEBUG) {
       console.log('✅ Test database cleanup completed');
     }
   }

  /**
   * Health check for database connections
   */
  public async healthCheck(suiteType?: 'unit' | 'integration'): Promise<boolean> {
    const suites = suiteType ? [suiteType] : ['unit', 'integration'];

    for (const suite of suites) {
      const dbKey = `test-${suite}`;
      const prisma = this.prismaClients.get(dbKey);

      if (!prisma) {
        if (process.env.TEST_DEBUG) {
          console.warn(`❌ No database client for ${suite} tests`);
        }
        return false;
      }

      try {
        await prisma.$queryRaw`SELECT 1`;
      } catch (error) {
        if (process.env.TEST_DEBUG) {
          console.error(`❌ Health check failed for ${suite} tests:`, error);
        }
        return false;
      }
    }

    return true;
  }
}