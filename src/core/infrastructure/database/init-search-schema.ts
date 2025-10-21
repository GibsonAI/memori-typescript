import { PrismaClient } from '@prisma/client';
import { logInfo, logError, logWarn } from '../../infrastructure/config/Logger';

/**
 * Check if FTS5 is available in the SQLite build using PRAGMA compile_options
 */
async function detectFTS5Support(prisma: PrismaClient): Promise<boolean> {
  try {
    // Query SQLite compile options to check for FTS5 support
    const compileOptions = await prisma.$queryRaw`PRAGMA compile_options;`;

    if (Array.isArray(compileOptions)) {
      // Look for FTS5-related compile options
      const hasFTS5 = compileOptions.some((option: any) => {
        // Handle both object format {name: 'OPTION'} and string format 'OPTION'
        const optionName = (typeof option === 'object' && option.name) ? option.name : option;
        const optionStr = String(optionName).toUpperCase();
        return optionStr === 'ENABLE_FTS5' ||
               optionStr === 'HAS_FTS5' ||
               optionStr.includes('FTS5');
      });

      logInfo('FTS5 support detection completed', {
        component: 'DatabaseInit',
        fts5Available: hasFTS5,
        compileOptions: compileOptions.length,
      });

      return hasFTS5;
    }

    return false;
  } catch (error) {
    logWarn('Failed to check FTS5 compile options', {
      component: 'DatabaseInit',
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/**
 * Initialize the FTS5 search schema with triggers and BM25 support
 */
export async function initializeSearchSchema(prisma: PrismaClient): Promise<boolean> {
  try {
    logInfo('Initializing FTS5 search schema...', { component: 'DatabaseInit' });

    // First check if FTS5 is available in this SQLite build
    const fts5Available = await detectFTS5Support(prisma);

    if (!fts5Available) {
      logWarn('FTS5 not available in SQLite build - skipping FTS initialization', {
        component: 'DatabaseInit',
      });
      return false;
    }

    logInfo('FTS5 support confirmed - proceeding with initialization', {
      component: 'DatabaseInit',
    });

    // Now create FTS table since we know FTS5 is supported
    await prisma.$executeRaw`
      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts
      USING fts5(
        content,        -- Full text content
        metadata,       -- JSON metadata for filtering
        tokenize = 'porter ascii'  -- Tokenization with stemming
      );
    `;

    if (process.env.TEST_DEBUG) {
      logInfo('Created FTS5 virtual table', { component: 'DatabaseInit' });
    }

    // Test that FTS5 functionality works
    try {
      // Use a unique rowid that doesn't conflict with existing data
      const testRowId = Date.now(); // Use timestamp as unique rowid

      await prisma.$executeRaw`
        INSERT INTO memory_fts(rowid, content, metadata) VALUES (${testRowId}, 'test content', '{}');
      `;
      await prisma.$executeRaw`DELETE FROM memory_fts WHERE rowid = ${testRowId};`;

      if (process.env.TEST_DEBUG) {
        logInfo('FTS5 table created and tested successfully', { component: 'DatabaseInit' });
      }
    } catch (testError) {
      if (process.env.TEST_DEBUG) {
        logError('FTS5 table created but functionality test failed', {
          component: 'DatabaseInit',
          error: testError instanceof Error ? testError.message : String(testError),
        });
      }
      // Don't fail completely, but log the issue
    }

     // Create indexes for performance optimization (FTS5 virtual tables cannot be indexed)
     // We create indexes on the main tables for better query performance
     try {
       // Verify main tables exist before creating indexes
       const longTermTableCheck = await prisma.$queryRaw`
         SELECT name FROM sqlite_master WHERE type='table' AND name='long_term_memory';
       `;
 
       const shortTermTableCheck = await prisma.$queryRaw`
         SELECT name FROM sqlite_master WHERE type='table' AND name='short_term_memory';
       `;
 
       if (longTermTableCheck && Array.isArray(longTermTableCheck) && longTermTableCheck.length > 0) {
         await prisma.$executeRaw`
           CREATE INDEX IF NOT EXISTS idx_long_term_memory_namespace
           ON long_term_memory(namespace);
         `;
 
         await prisma.$executeRaw`
           CREATE INDEX IF NOT EXISTS idx_long_term_memory_importance
           ON long_term_memory(importanceScore DESC);
         `;
       }
 
       if (shortTermTableCheck && Array.isArray(shortTermTableCheck) && shortTermTableCheck.length > 0) {
         await prisma.$executeRaw`
           CREATE INDEX IF NOT EXISTS idx_short_term_memory_namespace
           ON short_term_memory(namespace);
         `;
 
         await prisma.$executeRaw`
           CREATE INDEX IF NOT EXISTS idx_short_term_memory_importance
           ON short_term_memory(importanceScore DESC);
         `;
       }
 
       if (process.env.TEST_DEBUG) {
         logInfo('Created performance indexes on main tables', { component: 'DatabaseInit' });
       }
     } catch (error) {
       if (process.env.TEST_DEBUG) {
         logError('Failed to create performance indexes', {
           component: 'DatabaseInit',
           error: error instanceof Error ? error.message : String(error),
         });
       }
       // Don't fail initialization for index creation issues
     }
 
     if (process.env.TEST_DEBUG) {
       logInfo('FTS5 search schema initialized successfully', { component: 'DatabaseInit' });
     }
     return true;

  } catch (error) {
    if (process.env.TEST_DEBUG) {
      logError('Failed to initialize FTS5 search schema', {
        component: 'DatabaseInit',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    return false;
  }
}

/**
 * Populate FTS table with existing data for backward compatibility
 */
async function populateFTSTableWithExistingData(prisma: PrismaClient): Promise<void> {
  try {
    logInfo('Populating FTS table with existing data...', { component: 'DatabaseInit' });

    // Insert existing long-term memories
    await prisma.$executeRaw`
      INSERT OR IGNORE INTO memory_fts(rowid, content, metadata)
      SELECT
        id,
        searchableContent,
        json_object(
          'memory_type', retentionType,
          'category_primary', categoryPrimary,
          'importance_score', importanceScore,
          'classification', classification,
          'created_at', extractionTimestamp,
          'namespace', namespace
        )
      FROM long_term_memory;
    `;

    // Insert existing short-term memories
    await prisma.$executeRaw`
      INSERT OR IGNORE INTO memory_fts(rowid, content, metadata)
      SELECT
        id,
        searchableContent,
        json_object(
          'memory_type', retentionType,
          'category_primary', categoryPrimary,
          'importance_score', importanceScore,
          'created_at', createdAt,
          'namespace', namespace
        )
      FROM short_term_memory;
    `;

    if (process.env.TEST_DEBUG) {
      logInfo('Populated FTS table with existing data', { component: 'DatabaseInit' });
    }

  } catch (error) {
    if (process.env.TEST_DEBUG) {
      logError('Failed to populate FTS table with existing data', {
        component: 'DatabaseInit',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    // Don't throw here - this is for backward compatibility, so it shouldn't fail initialization
  }
}

/**
 * Verify FTS table structure and functionality
 */
export async function verifyFTSSchema(prisma: PrismaClient): Promise<{
  isValid: boolean;
  issues: string[];
  stats: { tables: number; triggers: number; indexes: number };
}> {
  const issues: string[] = [];
  const stats = { tables: 0, triggers: 0, indexes: 0 };

  try {
    // First check if FTS5 is available
    const fts5Available = await detectFTS5Support(prisma);

    if (!fts5Available) {
      return {
        isValid: false,
        issues: ['FTS5 not available in SQLite build'],
        stats,
      };
    }

    // Check if FTS table exists
    const ftsTableResult = await prisma.$queryRaw`
      SELECT name FROM sqlite_master WHERE type='table' AND name='memory_fts';
    `;

    if (!ftsTableResult || (Array.isArray(ftsTableResult) && ftsTableResult.length === 0)) {
      issues.push('FTS5 virtual table memory_fts does not exist');
    } else {
      stats.tables = 1;
    }

    // Check indexes
    const indexes = [
      'idx_long_term_memory_namespace',
      'idx_short_term_memory_namespace',
      'idx_long_term_memory_importance',
      'idx_short_term_memory_importance',
    ];

    for (const index of indexes) {
      const indexResult = await prisma.$queryRaw`
        SELECT name FROM sqlite_master WHERE type='index' AND name=${index};
      `;

      if (!indexResult || (Array.isArray(indexResult) && indexResult.length === 0)) {
        issues.push(`Index ${index} does not exist`);
      } else {
        stats.indexes++;
      }
    }

    // Basic FTS functionality test
    if (stats.tables > 0) {
      try {
        const testResult = await prisma.$queryRaw`
          SELECT COUNT(*) as count FROM memory_fts LIMIT 1;
        ` as any[];

        if (testResult && testResult.length > 0) {
          if (process.env.TEST_DEBUG) {
            logInfo('FTS5 functionality verified successfully', { component: 'DatabaseInit' });
          }
        }
      } catch (error) {
        if (process.env.TEST_DEBUG) {
          logError('FTS5 functionality test failed', {
            component: 'DatabaseInit',
            error: error instanceof Error ? error.message : String(error),
          });
        }
        issues.push(`FTS5 functionality test failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
      stats,
    };

  } catch (error) {
    return {
      isValid: false,
      issues: [`Schema verification failed: ${error instanceof Error ? error.message : String(error)}`],
      stats,
    };
  }
}

/**
 * Clean up FTS schema (for testing or migration rollback)
 */
export async function cleanupFTSSchema(prisma: PrismaClient): Promise<void> {
  try {
    if (process.env.TEST_DEBUG) {
      logInfo('Cleaning up FTS schema...', { component: 'DatabaseInit' });
    }

    // Drop triggers
    const triggers = [
      'memory_fts_insert_long_term',
      'memory_fts_delete_long_term',
      'memory_fts_update_long_term',
      'memory_fts_insert_short_term',
      'memory_fts_delete_short_term',
      'memory_fts_update_short_term',
    ];

    for (const trigger of triggers) {
      await prisma.$executeRaw`DROP TRIGGER IF EXISTS ${trigger}`;
    }

    // Drop indexes
    const indexes = [
      'idx_memory_fts_namespace',
      'idx_long_term_memory_namespace',
      'idx_short_term_memory_namespace',
      'idx_long_term_memory_importance',
      'idx_short_term_memory_importance',
    ];

    for (const index of indexes) {
      await prisma.$executeRaw`DROP INDEX IF EXISTS ${index}`;
    }

    // Drop FTS table
    await prisma.$executeRaw`DROP TABLE IF EXISTS memory_fts`;

    if (process.env.TEST_DEBUG) {
      logInfo('FTS schema cleaned up successfully', { component: 'DatabaseInit' });
    }

  } catch (error) {
    if (process.env.TEST_DEBUG) {
      logError('Failed to cleanup FTS schema', {
        component: 'DatabaseInit',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    }
    throw error;
  }
}