/**
 * Index Health Check Script
 *
 * Checks the health status of the search index and provides recommendations.
 * Run with: npm run index:health
 */

import { Memori, ConfigManager } from '../../src/index';
import { logInfo, logError } from '../../src/core/infrastructure/config/Logger';

async function checkIndexHealth(): Promise<void> {
  logInfo('🔍 Checking search index health...', { component: 'index-health' });

  let memori: Memori | undefined;

  try {
    // Load configuration
    const config = ConfigManager.loadConfig();

    // Initialize Memori
    memori = new Memori(config);
    await memori.enable();

    // Get health report
    const report = await memori.getIndexHealthReport();

    console.log('\n📊 Index Health Report');
    console.log('====================');
    console.log(`Health Status: ${report.health}`);
    console.log(`Total Documents: ${report.statistics.totalDocuments}`);
    console.log(`Index Size: ${(report.statistics.totalSize / (1024 * 1024)).toFixed(2)} MB`);
    console.log(`Fragmentation: ${(report.statistics.fragmentationLevel * 100).toFixed(1)}%`);
    console.log(`Corruption Detected: ${report.statistics.corruptionDetected ? 'YES' : 'No'}`);
    console.log(`Health Score: ${(report.statistics.healthScore * 100).toFixed(1)}%`);
    console.log(`Estimated Optimization Time: ${report.estimatedOptimizationTime}ms`);

    if (report.issues.length > 0) {
      console.log('\n⚠️ Issues Found:');
      report.issues.forEach((issue, index) => {
        console.log(`  ${index + 1}. ${issue}`);
      });
    } else {
      console.log('\n✅ No issues detected');
    }

    if (report.recommendations.length > 0) {
      console.log('\n💡 Recommendations:');
      report.recommendations.forEach((rec, index) => {
        console.log(`  ${index + 1}. ${rec}`);
      });
    }

  } catch (error) {
    logError('❌ Failed to check index health', {
      component: 'index-health',
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
checkIndexHealth().catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});