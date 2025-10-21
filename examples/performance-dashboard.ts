/**
 * Performance Dashboard Example
 *
 * This example demonstrates the comprehensive performance monitoring capabilities
 * of the Memori PerformanceDashboardService. It shows how to:
 * - Initialize and configure the performance dashboard
 * - Set up real-time metrics collection
 * - Create and manage dashboard widgets
 * - Handle performance alerts and notifications
 * - Generate performance reports
 * - Monitor system health and trends
 */

import { PerformanceDashboardService } from '../src/core/performance/PerformanceDashboard';
import { logInfo, logError, logWarn } from '../src/core/infrastructure/config/Logger';

async function performanceDashboardExample(): Promise<void> {
  logInfo('🚀 Starting Performance Dashboard Example', {
    component: 'performance-dashboard-example'
  });

  let dashboard: PerformanceDashboardService | undefined;

  try {
    // Initialize the Performance Dashboard Service
    dashboard = new PerformanceDashboardService();
    logInfo('✅ Performance dashboard service initialized', {
      component: 'performance-dashboard-example'
    });

    // Initialize the dashboard with default widgets
    dashboard.initializeDashboard();
    logInfo('✅ Dashboard initialized with default widgets', {
      component: 'performance-dashboard-example'
    });

    // Set up alert callback for real-time notifications
    dashboard.addAlertCallback((alert) => {
      logWarn(`🚨 Performance Alert: ${alert.title}`, {
        component: 'performance-dashboard-example',
        alertId: alert.id,
        severity: alert.severity,
        alertComponent: alert.component,
        value: alert.value,
        threshold: alert.threshold,
      });
    });
    logInfo('✅ Alert callback registered', {
      component: 'performance-dashboard-example'
    });

    // Demonstrate getting system status overview
    logInfo('📊 Getting system status overview...', {
      component: 'performance-dashboard-example'
    });
    const statusOverview = dashboard.getSystemStatusOverview();
    logInfo('System Status Overview:', {
      component: 'performance-dashboard-example',
      overallHealth: statusOverview.overallHealth,
      activeAlerts: statusOverview.activeAlerts,
      recentIncidents: statusOverview.recentIncidents,
      uptime: statusOverview.uptime,
      components: Object.keys(statusOverview.components).length,
    });

    // Log component-specific status
    Object.entries(statusOverview.components).forEach(([component, status]) => {
      logInfo(`${component} status: ${status.status}`, {
        component: 'performance-dashboard-example',
        responseTime: status.responseTime,
        errorRate: status.errorRate,
        lastCheck: status.lastCheck,
      });
    });

    // Get and display dashboard widgets
    logInfo('🎛️ Getting dashboard widgets...', {
      component: 'performance-dashboard-example'
    });
    const widgets = dashboard.getWidgets();
    logInfo(`Found ${widgets.length} dashboard widgets:`, {
      component: 'performance-dashboard-example',
      widgetCount: widgets.length,
    });

    widgets.forEach((widget) => {
      logInfo(`Widget: ${widget.title} (${widget.type})`, {
        component: 'performance-dashboard-example',
        widgetId: widget.id,
        position: widget.position,
        refreshInterval: widget.refreshInterval,
        lastUpdated: widget.lastUpdated,
      });
    });

    // Demonstrate real-time metrics collection
    logInfo('📈 Collecting real-time metrics...', {
      component: 'performance-dashboard-example'
    });

    // Get metrics for different components
    const searchMetrics = dashboard.getRealTimeMetrics('search', 'latency', 10);
    const databaseMetrics = dashboard.getRealTimeMetrics('database', 'latency', 10);
    const systemMetrics = dashboard.getRealTimeMetrics('system', 'error_rate', 10);

    logInfo(`Search latency metrics: ${searchMetrics.length} samples`, {
      component: 'performance-dashboard-example',
      samples: searchMetrics.length,
    });

    logInfo(`Database latency metrics: ${databaseMetrics.length} samples`, {
      component: 'performance-dashboard-example',
      samples: databaseMetrics.length,
    });

    logInfo(`System error rate metrics: ${systemMetrics.length} samples`, {
      component: 'performance-dashboard-example',
      samples: systemMetrics.length,
    });

    // Demonstrate updating widget data
    logInfo('🔄 Updating widget data...', {
      component: 'performance-dashboard-example'
    });

    widgets.forEach((widget) => {
      dashboard!.updateWidgetData(widget.id);
      logInfo(`Updated data for widget: ${widget.title}`, {
        component: 'performance-dashboard-example',
        widgetId: widget.id,
        lastUpdated: widget.lastUpdated,
      });
    });

    // Get active alerts
    const activeAlerts = dashboard.getActiveAlerts();
    logInfo(`Active alerts: ${activeAlerts.length}`, {
      component: 'performance-dashboard-example',
      alertCount: activeAlerts.length,
    });

    if (activeAlerts.length > 0) {
      activeAlerts.forEach((alert) => {
        logInfo(`Alert: ${alert.title}`, {
          component: 'performance-dashboard-example',
          alertId: alert.id,
          severity: alert.severity,
          alertComponent: alert.component,
          acknowledged: alert.acknowledged,
          resolved: alert.resolved,
        });
      });
    }

    // Demonstrate alert acknowledgment and resolution
    if (activeAlerts.length > 0) {
      const firstAlert = activeAlerts[0];
      logInfo(`Acknowledging alert: ${firstAlert.title}`, {
        component: 'performance-dashboard-example',
        alertId: firstAlert.id,
      });

      const acknowledged = dashboard.acknowledgeAlert(firstAlert.id, 'system-admin');
      logInfo(`Alert acknowledged: ${acknowledged}`, {
        component: 'performance-dashboard-example',
        alertId: firstAlert.id,
      });

      // Resolve the alert
      const resolved = dashboard.resolveAlert(
        firstAlert.id,
        'Issue resolved - metrics returned to normal range',
        'system-admin'
      );
      logInfo(`Alert resolved: ${resolved}`, {
        component: 'performance-dashboard-example',
        alertId: firstAlert.id,
      });
    }

    // Wait for metrics collection (simulating real-time data)
    logInfo('⏳ Waiting for metrics collection...', {
      component: 'performance-dashboard-example'
    });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Get updated metrics after waiting
    const updatedSearchMetrics = dashboard.getRealTimeMetrics('search', 'latency', 5);
    if (updatedSearchMetrics.length > 0) {
      const latestMetric = updatedSearchMetrics[0];
      logInfo('Latest search latency metric:', {
        component: 'performance-dashboard-example',
        timestamp: latestMetric.timestamp,
        value: latestMetric.value,
        metricComponent: latestMetric.component,
        metricType: latestMetric.metricType,
      });
    }

    // Demonstrate performance snapshots
    logInfo('📸 Getting performance snapshots...', {
      component: 'performance-dashboard-example'
    });
    const snapshots = dashboard.getPerformanceSnapshots(3);
    logInfo(`Retrieved ${snapshots.length} performance snapshots`, {
      component: 'performance-dashboard-example',
      snapshotCount: snapshots.length,
    });

    if (snapshots.length > 0) {
      const latestSnapshot = snapshots[0];
      logInfo('Latest snapshot metrics:', {
        component: 'performance-dashboard-example',
        timestamp: latestSnapshot.timestamp,
        searchResponseTime: latestSnapshot.searchMetrics.responseTime,
        searchQueryCount: latestSnapshot.searchMetrics.queryCount,
        searchErrorRate: latestSnapshot.searchMetrics.errorRate,
        databaseLatency: latestSnapshot.databaseMetrics.latency,
        databaseMemoryUsage: latestSnapshot.databaseMetrics.memoryUsage,
        systemMemoryUsage: latestSnapshot.systemMetrics.memoryUsage,
      });
    }

    // Demonstrate generating a performance report
    logInfo('📊 Generating performance report...', {
      component: 'performance-dashboard-example'
    });

    const reportPeriod = {
      start: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      end: new Date(),
    };

    const performanceReport = dashboard.generatePerformanceReport('daily', reportPeriod);

    logInfo('Performance Report Generated:', {
      component: 'performance-dashboard-example',
      reportId: performanceReport.id,
      title: performanceReport.title,
      type: performanceReport.type,
      period: `${reportPeriod.start.toISOString()} to ${reportPeriod.end.toISOString()}`,
      overallHealth: performanceReport.summary.overallHealth,
      keyMetricsCount: Object.keys(performanceReport.summary.keyMetrics).length,
      topIssuesCount: performanceReport.summary.topIssues.length,
      achievementsCount: performanceReport.summary.achievements.length,
      trendsCount: performanceReport.trends.length,
      recommendationsCount: performanceReport.recommendations.length,
    });

    // Log key metrics from the report
    logInfo('Key Metrics:', {
      component: 'performance-dashboard-example',
      ...performanceReport.summary.keyMetrics,
    });

    if (performanceReport.summary.topIssues.length > 0) {
      logInfo('Top Issues:', {
        component: 'performance-dashboard-example',
        issues: performanceReport.summary.topIssues,
      });
    }

    if (performanceReport.summary.achievements.length > 0) {
      logInfo('Achievements:', {
        component: 'performance-dashboard-example',
        achievements: performanceReport.summary.achievements,
      });
    }

    // Log recommendations
    performanceReport.recommendations.forEach((rec, index) => {
      logInfo(`Recommendation ${index + 1}: ${rec.title}`, {
        component: 'performance-dashboard-example',
        priority: rec.priority,
        category: rec.category,
        effort: rec.effort,
        impact: rec.impact,
        status: rec.status,
        description: rec.description,
      });
    });

    // Demonstrate trend analysis
    logInfo('📈 Analyzing performance trends...', {
      component: 'performance-dashboard-example'
    });

    // Update trend analysis widgets
    const trendWidgets = widgets.filter(w => w.type === 'trend_analysis');
    trendWidgets.forEach(widget => {
      dashboard!.updateWidgetData(widget.id);
      logInfo(`Updated trend analysis for widget: ${widget.title}`, {
        component: 'performance-dashboard-example',
        widgetId: widget.id,
      });
    });

    // Demonstrate alerts by severity
    const criticalAlerts = dashboard.getAlertsBySeverity('critical');
    const warningAlerts = dashboard.getAlertsBySeverity('warning');
    const errorAlerts = dashboard.getAlertsBySeverity('error');

    logInfo('Alert Summary by Severity:', {
      component: 'performance-dashboard-example',
      critical: criticalAlerts.length,
      error: errorAlerts.length,
      warning: warningAlerts.length,
    });

    // Demonstrate dashboard configuration export
    logInfo('💾 Exporting dashboard configuration...', {
      component: 'performance-dashboard-example'
    });
    const config = dashboard.exportDashboardConfiguration();
    logInfo('Dashboard configuration exported:', {
      component: 'performance-dashboard-example',
      widgetCount: config.widgets.length,
      refreshIntervalsCount: Object.keys(config.settings.refreshIntervals).length,
      alertThresholdsCount: Object.keys(config.settings.alertThresholds).length,
    });

    logInfo('🎉 Performance dashboard example completed successfully!', {
      component: 'performance-dashboard-example'
    });

  } catch (error) {
    logError('❌ Error in performance dashboard example', {
      component: 'performance-dashboard-example',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
  } finally {
    // Clean up alert callbacks
    if (dashboard) {
      dashboard.removeAlertCallback(() => {}); // Remove all callbacks
      logInfo('✅ Alert callbacks cleaned up', {
        component: 'performance-dashboard-example'
      });
    }
  }
}

// Error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logError('Unhandled Promise Rejection', {
    component: 'performance-dashboard-example',
    promise: String(promise),
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
  });
});

// Run the example
performanceDashboardExample().catch((error) => {
  logError('Unhandled error in performance dashboard example', {
    component: 'performance-dashboard-example',
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
});