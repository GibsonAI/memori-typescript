# Consolidation Monitoring & Metrics

The consolidation subsystem surfaces rich analytics so you can track duplicate trends, operation health, and optimisation opportunities. These capabilities are exposed through the `ConsolidationService` interface returned by `Memori.getConsolidationService()`.

## Gathering Analytics

```typescript
const service = memori.getConsolidationService();

const analytics = await service.getConsolidationAnalytics();

console.log({
  totalMemories: analytics.totalMemories,
  duplicatesPending: analytics.duplicateCount,
  consolidatedToDate: analytics.consolidatedMemories,
  averageRatio: analytics.averageConsolidationRatio,
  lastRun: analytics.lastConsolidationActivity?.toISOString()
});

analytics.consolidationTrends.forEach(trend => {
  console.log(`${trend.period}: ${trend.consolidationCount} consolidations, avg similarity ${trend.averageSimilarityScore}`);
});
```

Use these numbers to monitor backlog size and efficiency over time. Trends are returned per period (for example weekly or monthly buckets).

## Optimisation Recommendations

```typescript
const recommendations = await service.getOptimizationRecommendations();

console.log(`Overall health: ${recommendations.overallHealth}`);

recommendations.recommendations.forEach(rec => {
  console.log(`[${rec.priority.toUpperCase()}] ${rec.type}: ${rec.description}`);
  console.log(`  Benefit: ${rec.estimatedBenefit}`);
  console.log(`  Actions: ${rec.actionRequired.join(', ')}`);
});
```

The service combines duplicate counts, consolidation freshness, and performance metrics to suggest next steps (cleanup, archival, etc.).

## Scheduling Metrics

When you enable automated consolidation via `startConsolidationScheduling`, the `DatabaseManager` logs each run. You can inspect the current schedule:

```typescript
const scheduleStatus = memori['dbManager'].getConsolidationSchedulingStatus();

console.log({
  enabled: scheduleStatus.enabled,
  intervalMinutes: scheduleStatus.intervalMinutes,
  nextRun: scheduleStatus.nextRunMinutes
});
```

The scheduling API is currently exposed on the underlying manager. Wrap it in your own service if you need a stable abstraction.

## Custom Dashboards

Build a simple dashboard by combining analytics and recommendations:

```typescript
async function buildConsolidationReport(service: ReturnType<Memori['getConsolidationService']>) {
  const [analytics, recommendations] = await Promise.all([
    service.getConsolidationAnalytics(),
    service.getOptimizationRecommendations()
  ]);

  return {
    generatedAt: new Date(),
    summary: {
      totalMemories: analytics.totalMemories,
      duplicates: analytics.duplicateCount,
      consolidated: analytics.consolidatedMemories,
      health: recommendations.overallHealth,
    },
    trends: analytics.consolidationTrends,
    recommendations: recommendations.recommendations,
  };
}
```

Use this pattern to feed dashboards, send daily reports, or trigger alerts when health drops below your threshold.

## Operational Tips

- Track the ratio of `duplicateCount` to `totalMemories`; spikes indicate ingestion issues or repeated conversations.
- Monitor `averageConsolidationRatio` to ensure consolidation remains effective. A falling ratio can signal overly aggressive similarity thresholds.
- Log recommendation output alongside alerts from `PerformanceDashboardService` to correlate consolidation health with overall system health.
- When running in dry-run mode, store analytics snapshots so you can compare planned vs actual improvements.

These metrics give you visibility into how well the consolidation pipeline keeps your memory base tidy, enabling proactive maintenance before duplicates accumulate.
