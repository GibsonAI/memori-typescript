/**
 * Index Optimization Script
 *
 * Optimizes the search index for better performance.
 * Run with: npm run index:optimize
 */

import { Memori, ConfigManager } from '../../src/index';
import { logInfo, logError } from '../../src/core/infrastructure/config/Logger';
import { OptimizationType } from '../../src/core/domain/search/SearchIndexManager';

async function optimizeIndex(): Promise<void> {
    logInfo('⚡ Starting index optimization...', { component: 'index-optimize' });

    let memori: Memori | undefined;

    try {
        // Load configuration
        const config = ConfigManager.loadConfig();

        // Initialize Memori
        memori = new Memori(config);
        await memori.enable();

        // Perform optimization
        const startTime = Date.now();
        const result = await memori.optimizeIndex(OptimizationType.REBUILD);
        const duration = Date.now() - startTime;

        console.log('\n✅ Index Optimization Complete');
        console.log('============================');
        console.log(`Success: ${result.success}`);
        console.log(`Optimization Type: ${result.optimizationType}`);
        console.log(`Duration: ${duration}ms`);
        console.log(`Documents Processed: ${result.documentsProcessed}`);

        if (result.spaceSaved > 0) {
            console.log(`Space Saved: ${(result.spaceSaved / (1024 * 1024)).toFixed(2)} MB`);
        }

        if (result.performanceImprovement > 0) {
            console.log(`Performance Improvement: ${(result.performanceImprovement * 100).toFixed(1)}%`);
        }

        if (result.error) {
            console.log(`Error: ${result.error}`);
        }

    } catch (error) {
        logError('❌ Failed to optimize index', {
            component: 'index-optimize',
            error: error instanceof Error ? error.message : String(error),
        });
        throw error;
    } finally {
        if (memori) {
            await memori.close();
        }
    }
}

// Run the script
optimizeIndex().catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
});