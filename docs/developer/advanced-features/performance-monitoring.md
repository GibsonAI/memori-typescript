# Performance Monitoring

Memorits ships with in-process monitoring utilities that help you track search latency, provider health, and configuration changes. The main entry points are `PerformanceDashboardService` and `PerformanceAnalyticsService` in `src/core/performance`.

## Performance Dashboard

```typescript
import { PerformanceDashboardService } from 'memorits/core/performance/PerformanceDashboard';

const dashboard = new PerformanceDashboardService();
dashboard.initializeDashboard();

const status = dashboard.getSystemStatusOverview();
console.log(`Overall health: ${status.overallHealth}, active alerts: ${status.activeAlerts}`);
```

### Real-Time Metrics

`getRealTimeMetrics(component?, metricType?, limit?)` returns recent samples collected by the dashboard.

```typescript
const searchLatency = dashboard.getRealTimeMetrics('search', 'latency', 50);
const databaseErrors = dashboard.getRealTimeMetrics('database', 'error_rate');
```

Feed these snapshots into your own dashboards or logs. Metrics are stored in memory; call this method frequently to avoid unbounded growth.

### Alerts

```typescript
dashboard.addAlertCallback(alert => {
  console.log(`[${alert.severity.toUpperCase()}] ${alert.title}: ${alert.description}`);
});

const critical = dashboard.getAlertsBySeverity('critical');
critical.forEach(alert => dashboard.acknowledgeAlert(alert.id, 'on-call'));
```

Alerts are acknowledged/resolved manually; use callbacks to trigger notifications in your infrastructure.

### Widgets & Configuration

```typescript
const widgets = dashboard.getWidgets();

dashboard.updateWidgetData('search_performance');

const exported = dashboard.exportDashboardConfiguration();
dashboard.importDashboardConfiguration(exported);
```

Widgets describe the built-in dashboard layout. You can export/import configurations to persist custom layouts between restarts.

### Snapshots & Reports

```typescript
const snapshots = dashboard.getPerformanceSnapshots(10);
snapshots.forEach(snapshot => {
  console.log(`Search latency: ${snapshot.searchMetrics.responseTime}ms`);
});

const report = dashboard.generatePerformanceReport('daily', {
  start: new Date(Date.now() - 24 * 60 * 60 * 1000),
  end: new Date()
});

console.log(`Report health: ${report.summary.overallHealth}`);
```

Reports consolidate metrics into human-readable summaries for daily/weekly/incident reviews.

## Performance Analytics

`PerformanceAnalyticsService` complements the dashboard with deeper analysis: trend detection, predictive insights, and recommendation engines.

```typescript
import { PerformanceAnalyticsService } from 'memorits/core/performance/PerformanceAnalyticsService';

const analytics = new PerformanceAnalyticsService();
analytics.recordSearchPerformance({
  strategy: 'fts5',
  latency: 120,
  success: true,
  timestamp: new Date()
});

const insights = analytics.generateSearchPerformanceInsights('fts5');
console.log(insights.recommendations);
```

Check the class file for available methods—each one mirrors a specific analytics use case (search, database, configuration). All inputs expect typed payloads; invalid data throws to keep reports trustworthy.

## Wiring It Up

- Call `initializeDashboard()` during application start-up.
- Register alert callbacks that forward notifications to your PagerDuty/Slack integrations.
- Periodically serialize widget configurations (`exportDashboardConfiguration`) if you allow operators to customise layouts.
- Feed production metrics into `PerformanceAnalyticsService` to build historical baselines.

These services are optional, but they leverage the instrumentation already present in the database and search layers (`SearchManager`, `SearchIndexManager`, etc.). Use them to understand how Memorits behaves under load and to spot emerging issues before they affect users.
