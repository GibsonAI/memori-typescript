/**
 * Performance dashboard data structures and real-time monitoring
 * Provides visualization-friendly data formats and alerting capabilities
 */

import { logError } from "../infrastructure/config/Logger";


export interface RealTimeMetric {
  timestamp: Date;
  value: number;
  component: string;
  metricType: 'latency' | 'throughput' | 'error_rate' | 'memory_usage' | 'cache_hit_rate';
  metadata?: Record<string, unknown>;
}

export interface PerformanceAlert {
  id: string;
  type: 'threshold_exceeded' | 'trend_anomaly' | 'system_degradation' | 'resource_exhaustion';
  severity: 'info' | 'warning' | 'error' | 'critical';
  component: string;
  title: string;
  description: string;
  timestamp: Date;
  value: number;
  threshold?: number;
  trend?: 'increasing' | 'decreasing' | 'stable';
  acknowledged: boolean;
  resolved: boolean;
  resolution?: string;
}

export interface DashboardWidget {
  id: string;
  type: 'metric_chart' | 'status_indicator' | 'alert_list' | 'top_issues' | 'trend_analysis';
  title: string;
  component: string;
  position: { x: number; y: number; width: number; height: number };
  data: any;
  refreshInterval: number;
  lastUpdated: Date;
}

export interface SystemStatusOverview {
  overallHealth: 'healthy' | 'degraded' | 'critical';
  components: Record<string, {
    status: 'healthy' | 'degraded' | 'critical' | 'unknown';
    responseTime: number;
    errorRate: number;
    lastCheck: Date;
  }>;
  activeAlerts: number;
  recentIncidents: number;
  uptime: number;
  lastIncident?: Date;
}

export interface PerformanceMetricsSnapshot {
  timestamp: Date;
  searchMetrics: {
    responseTime: number;
    queryCount: number;
    errorRate: number;
    strategyUsage: Record<string, number>;
  };
  databaseMetrics: {
    latency: number;
    operationCount: number;
    errorRate: number;
    slowQueryCount: number;
    memoryUsage: number;
  };
  configurationMetrics: {
    latency: number;
    operationCount: number;
    errorRate: number;
    cacheHitRate: number;
  };
  systemMetrics: {
    memoryUsage: number;
    cpuUsage?: number;
    diskUsage?: number;
    networkLatency?: number;
  };
}

export interface TrendAnalysis {
  component: string;
  metric: string;
  timeframe: '1h' | '24h' | '7d' | '30d';
  trend: 'improving' | 'stable' | 'degrading';
  confidence: number;
  prediction: {
    nextValue: number;
    timeframe: string;
    confidence: number;
  };
  analysis: string;
  recommendations: string[];
}

export interface PerformanceReport {
  id: string;
  title: string;
  type: 'daily' | 'weekly' | 'monthly' | 'incident' | 'custom';
  period: {
    start: Date;
    end: Date;
  };
  summary: {
    overallHealth: 'healthy' | 'degraded' | 'critical';
    keyMetrics: Record<string, number>;
    topIssues: string[];
    achievements: string[];
  };
  detailedAnalysis: {
    searchPerformance: any;
    databasePerformance: any;
    configurationPerformance: any;
    crossComponentAnalysis: any;
  };
  trends: TrendAnalysis[];
  recommendations: Array<{
    priority: 'low' | 'medium' | 'high' | 'critical';
    category: 'performance' | 'reliability' | 'efficiency' | 'scalability';
    title: string;
    description: string;
    effort: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
    status: 'pending' | 'in_progress' | 'completed' | 'dismissed';
  }>;
  generatedAt: Date;
  generatedBy: string;
}

/**
 * Performance dashboard service for real-time monitoring and visualization
 */
export class PerformanceDashboardService {
  private realTimeMetrics: RealTimeMetric[] = [];
  private alerts: PerformanceAlert[] = [];
  private widgets: DashboardWidget[] = [];
  private snapshots: PerformanceMetricsSnapshot[] = [];
  private maxMetricsHistory = 1000;
  private maxSnapshotsHistory = 100;
  private snapshotInterval = 60000; // 1 minute
  private alertCallbacks: Array<(alert: PerformanceAlert) => void> = [];

  /**
   * Initialize dashboard with default widgets
   */
  public initializeDashboard(): void {
    this.createDefaultWidgets();
    this.startRealTimeCollection();
    this.startSnapshotCollection();
  }

  /**
   * Create default dashboard widgets
   */
  private createDefaultWidgets(): void {
    this.widgets = [
      {
        id: 'system_overview',
        type: 'status_indicator',
        title: 'System Overview',
        component: 'system',
        position: { x: 0, y: 0, width: 12, height: 4 },
        data: {},
        refreshInterval: 5000,
        lastUpdated: new Date(),
      },
      {
        id: 'search_performance',
        type: 'metric_chart',
        title: 'Search Performance',
        component: 'search',
        position: { x: 0, y: 4, width: 8, height: 6 },
        data: { chartType: 'line', metrics: ['responseTime', 'queryCount'] },
        refreshInterval: 10000,
        lastUpdated: new Date(),
      },
      {
        id: 'database_metrics',
        type: 'metric_chart',
        title: 'Database Metrics',
        component: 'database',
        position: { x: 8, y: 4, width: 4, height: 6 },
        data: { chartType: 'line', metrics: ['latency', 'errorRate'] },
        refreshInterval: 10000,
        lastUpdated: new Date(),
      },
      {
        id: 'active_alerts',
        type: 'alert_list',
        title: 'Active Alerts',
        component: 'system',
        position: { x: 0, y: 10, width: 6, height: 4 },
        data: { maxAlerts: 10 },
        refreshInterval: 5000,
        lastUpdated: new Date(),
      },
      {
        id: 'performance_trends',
        type: 'trend_analysis',
        title: 'Performance Trends',
        component: 'system',
        position: { x: 6, y: 10, width: 6, height: 4 },
        data: { timeframe: '24h' },
        refreshInterval: 30000,
        lastUpdated: new Date(),
      },
    ];
  }

  /**
   * Start real-time metric collection
   */
  private startRealTimeCollection(): void {
    setInterval(() => {
      this.collectRealTimeMetrics();
    }, 5000); // Every 5 seconds
  }

  /**
   * Start periodic snapshot collection
   */
  private startSnapshotCollection(): void {
    setInterval(() => {
      this.createPerformanceSnapshot();
    }, this.snapshotInterval);
  }

  /**
   * Collect real-time metrics from all components
   */
  private collectRealTimeMetrics(): void {
    // This would integrate with the actual services to collect real-time data
    // For now, we'll create placeholder metrics
    const timestamp = new Date();

    // Simulate real-time metrics collection
    const metrics: RealTimeMetric[] = [
      {
        timestamp,
        value: Math.random() * 1000 + 500, // Simulated response time
        component: 'search',
        metricType: 'latency',
        metadata: { strategy: 'FTS5' },
      },
      {
        timestamp,
        value: Math.random() * 100 + 50, // Simulated database latency
        component: 'database',
        metricType: 'latency',
        metadata: { operation: 'select' },
      },
      {
        timestamp,
        value: Math.random() * 0.1, // Simulated error rate
        component: 'system',
        metricType: 'error_rate',
      },
    ];

    this.realTimeMetrics.unshift(...metrics);

    // Maintain history limit
    if (this.realTimeMetrics.length > this.maxMetricsHistory) {
      this.realTimeMetrics = this.realTimeMetrics.slice(0, this.maxMetricsHistory);
    }

    // Check for alert conditions
    this.checkAlertConditions(metrics);
  }

  /**
   * Create performance snapshot
   */
  private createPerformanceSnapshot(): void {
    const snapshot: PerformanceMetricsSnapshot = {
      timestamp: new Date(),
      searchMetrics: {
        responseTime: Math.random() * 1000 + 500,
        queryCount: Math.floor(Math.random() * 100) + 50,
        errorRate: Math.random() * 0.05,
        strategyUsage: {
          FTS5: Math.random() * 60 + 30,
          LIKE: Math.random() * 30 + 10,
          RECENT: Math.random() * 20 + 5,
        },
      },
      databaseMetrics: {
        latency: Math.random() * 200 + 100,
        operationCount: Math.floor(Math.random() * 500) + 200,
        errorRate: Math.random() * 0.02,
        slowQueryCount: Math.floor(Math.random() * 5),
        memoryUsage: Math.random() * 100 * 1024 * 1024 + 50 * 1024 * 1024,
      },
      configurationMetrics: {
        latency: Math.random() * 50 + 10,
        operationCount: Math.floor(Math.random() * 20) + 5,
        errorRate: Math.random() * 0.01,
        cacheHitRate: Math.random() * 0.3 + 0.7,
      },
      systemMetrics: {
        memoryUsage: Math.random() * 200 * 1024 * 1024 + 100 * 1024 * 1024,
      },
    };

    this.snapshots.unshift(snapshot);

    // Maintain snapshot history limit
    if (this.snapshots.length > this.maxSnapshotsHistory) {
      this.snapshots = this.snapshots.slice(0, this.maxSnapshotsHistory);
    }
  }

  /**
   * Check for alert conditions
   */
  private checkAlertConditions(metrics: RealTimeMetric[]): void {
    for (const metric of metrics) {
      let alertTriggered = false;
      let alertType: PerformanceAlert['type'] = 'threshold_exceeded';
      let severity: PerformanceAlert['severity'] = 'warning';

      // Define alert thresholds
      switch (metric.metricType) {
        case 'latency':
          if (metric.value > 2000) {
            alertTriggered = true;
            severity = 'critical';
          } else if (metric.value > 1000) {
            alertTriggered = true;
            severity = 'error';
          } else if (metric.value > 500) {
            alertTriggered = true;
          }
          break;
        case 'error_rate':
          if (metric.value > 0.1) {
            alertTriggered = true;
            severity = 'critical';
          } else if (metric.value > 0.05) {
            alertTriggered = true;
            severity = 'error';
          } else if (metric.value > 0.02) {
            alertTriggered = true;
          }
          break;
        case 'memory_usage':
          if (metric.value > 500 * 1024 * 1024) {
            alertTriggered = true;
            severity = 'error';
          } else if (metric.value > 300 * 1024 * 1024) {
            alertTriggered = true;
          }
          break;
      }

      if (alertTriggered) {
        const alert: PerformanceAlert = {
          id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          type: alertType,
          severity,
          component: metric.component,
          title: `${metric.component} ${metric.metricType} threshold exceeded`,
          description: `${metric.metricType} is ${metric.value.toFixed(2)}, exceeding normal range`,
          timestamp: new Date(),
          value: metric.value,
          threshold: this.getThresholdForMetric(metric),
          acknowledged: false,
          resolved: false,
        };

        this.alerts.unshift(alert);
        this.triggerAlertCallbacks(alert);
      }
    }
  }

  /**
   * Get threshold for specific metric
   */
  private getThresholdForMetric(metric: RealTimeMetric): number {
    switch (metric.metricType) {
      case 'latency':
        return metric.component === 'search' ? 1000 : 500;
      case 'error_rate':
        return 0.05;
      case 'memory_usage':
        return 300 * 1024 * 1024;
      default:
        return 100;
    }
  }

  /**
   * Trigger alert callbacks
   */
  private triggerAlertCallbacks(alert: PerformanceAlert): void {
    this.alertCallbacks.forEach(callback => {
      try {
        callback(alert);
      } catch (error) {
        logError('Alert callback failed', {
          component: 'PerformanceDashboard',
          error: error instanceof Error ? error.message : String(error),
          alertId: alert.id,
        });
      }
    });
  }

  /**
   * Get system status overview
   */
  public getSystemStatusOverview(): SystemStatusOverview {
    const recentMetrics = this.realTimeMetrics.slice(0, 100);

    const componentMetrics = {
      search: { responseTime: 0, errorRate: 0, count: 0 },
      database: { responseTime: 0, errorRate: 0, count: 0 },
      configuration: { responseTime: 0, errorRate: 0, count: 0 },
    };

    // Aggregate metrics by component
    recentMetrics.forEach(metric => {
      if (componentMetrics[metric.component as keyof typeof componentMetrics]) {
        const comp = componentMetrics[metric.component as keyof typeof componentMetrics];
        if (metric.metricType === 'latency') {
          comp.responseTime += metric.value;
        } else if (metric.metricType === 'error_rate') {
          comp.errorRate += metric.value;
        }
        comp.count++;
      }
    });

    // Calculate averages
    Object.keys(componentMetrics).forEach(comp => {
      const metrics = componentMetrics[comp as keyof typeof componentMetrics];
      if (metrics.count > 0) {
        metrics.responseTime /= metrics.count;
        metrics.errorRate /= metrics.count;
      }
    });

    // Determine component health
    const components = {
      search: {
        status: this.calculateComponentStatus(componentMetrics.search.responseTime, componentMetrics.search.errorRate),
        responseTime: componentMetrics.search.responseTime,
        errorRate: componentMetrics.search.errorRate,
        lastCheck: new Date(),
      },
      database: {
        status: this.calculateComponentStatus(componentMetrics.database.responseTime, componentMetrics.database.errorRate),
        responseTime: componentMetrics.database.responseTime,
        errorRate: componentMetrics.database.errorRate,
        lastCheck: new Date(),
      },
      configuration: {
        status: this.calculateComponentStatus(componentMetrics.configuration.responseTime, componentMetrics.configuration.errorRate),
        responseTime: componentMetrics.configuration.responseTime,
        errorRate: componentMetrics.configuration.errorRate,
        lastCheck: new Date(),
      },
    };

    const overallHealth = this.calculateOverallHealth(components);
    const activeAlerts = this.alerts.filter(a => !a.resolved).length;
    const recentIncidents = this.alerts.filter(a => a.severity === 'critical' && a.timestamp > new Date(Date.now() - 24 * 60 * 60 * 1000)).length;

    return {
      overallHealth,
      components,
      activeAlerts,
      recentIncidents,
      uptime: 99.9, // Placeholder
      lastIncident: this.alerts.find(a => a.severity === 'critical')?.timestamp,
    };
  }

  /**
   * Calculate component status based on metrics
   */
  private calculateComponentStatus(responseTime: number, errorRate: number): 'healthy' | 'degraded' | 'critical' | 'unknown' {
    if (responseTime > 2000 || errorRate > 0.1) return 'critical';
    if (responseTime > 1000 || errorRate > 0.05) return 'degraded';
    if (responseTime > 0 || errorRate >= 0) return 'healthy';
    return 'unknown';
  }

  /**
   * Calculate overall system health
   */
  private calculateOverallHealth(components: Record<string, any>): 'healthy' | 'degraded' | 'critical' {
    const statuses = Object.values(components).map((comp: any) => comp.status);
    if (statuses.includes('critical')) return 'critical';
    if (statuses.includes('degraded')) return 'degraded';
    return 'healthy';
  }

  /**
   * Get dashboard widgets
   */
  public getWidgets(): DashboardWidget[] {
    return [...this.widgets];
  }

  /**
   * Update widget data
   */
  public updateWidgetData(widgetId: string): void {
    const widget = this.widgets.find(w => w.id === widgetId);
    if (!widget) return;

    // Update widget data based on type
    switch (widget.type) {
      case 'status_indicator':
        widget.data = this.getSystemStatusOverview();
        break;
      case 'metric_chart':
        widget.data = this.getMetricsForWidget(widget);
        break;
      case 'alert_list':
        widget.data = {
          alerts: this.alerts.filter(a => !a.resolved).slice(0, (widget.data as any)?.maxAlerts || 10),
        };
        break;
      case 'trend_analysis':
        widget.data = this.getTrendAnalysis(widget);
        break;
    }

    widget.lastUpdated = new Date();
  }

  /**
   * Get metrics for chart widget
   */
  private getMetricsForWidget(widget: DashboardWidget): any {
    const metrics = (widget.data as any)?.metrics || [];
    const timeframe = 60; // 60 data points

    return {
      labels: this.realTimeMetrics.slice(0, timeframe).map(m => m.timestamp.toLocaleTimeString()),
      datasets: metrics.map((metricName: string) => ({
        label: metricName,
        data: this.realTimeMetrics
          .slice(0, timeframe)
          .map(m => m.metricType === metricName ? m.value : 0)
          .reverse(),
      })),
    };
  }

  /**
   * Get trend analysis data
   */
  private getTrendAnalysis(widget: DashboardWidget): any {
    const timeframe = (widget.data as any)?.timeframe || '24h';
    const hours = timeframe === '1h' ? 1 : timeframe === '24h' ? 24 : timeframe === '7d' ? 168 : 720;

    return {
      timeframe,
      trends: this.calculateTrendsForTimeframe(hours),
      predictions: this.generatePredictions(hours),
    };
  }

  /**
   * Calculate trends for specific timeframe
   */
  private calculateTrendsForTimeframe(hours: number): TrendAnalysis[] {
    const cutoff = Date.now() - (hours * 60 * 60 * 1000);
    const relevantMetrics = this.realTimeMetrics.filter(m => m.timestamp.getTime() > cutoff);

    // Group by component and metric type
    const trends: TrendAnalysis[] = [];
    const componentMetrics = new Map<string, Map<string, number[]>>();

    relevantMetrics.forEach(metric => {
      if (!componentMetrics.has(metric.component)) {
        componentMetrics.set(metric.component, new Map());
      }
      const compMetrics = componentMetrics.get(metric.component)!;
      if (!compMetrics.has(metric.metricType)) {
        compMetrics.set(metric.metricType, []);
      }
      compMetrics.get(metric.metricType)!.push(metric.value);
    });

    for (const [component, metrics] of componentMetrics) {
      for (const [metricType, values] of metrics) {
        const trend = this.calculateTrendDirection(values);
        trends.push({
          component,
          metric: metricType,
          timeframe: (hours < 24 ? '1h' : hours < 168 ? '24h' : '7d') as any,
          trend,
          confidence: 0.8,
          prediction: {
            nextValue: values[values.length - 1] * (trend === 'degrading' ? 1.1 : trend === 'improving' ? 0.9 : 1),
            timeframe: '1h',
            confidence: 0.6,
          },
          analysis: `${component} ${metricType} is ${trend}`,
          recommendations: this.generateTrendRecommendations(component, metricType, trend),
        });
      }
    }

    return trends;
  }

  /**
   * Generate predictions for metrics
   */
  private generatePredictions(hours: number): Array<{ metric: string; prediction: string; confidence: number }> {
    return [
      { metric: 'search_response_time', prediction: 'stable', confidence: 0.8 },
      { metric: 'database_latency', prediction: 'improving', confidence: 0.6 },
      { metric: 'error_rate', prediction: 'stable', confidence: 0.9 },
    ];
  }

  /**
   * Calculate trend direction for values
   */
  private calculateTrendDirection(values: number[]): 'improving' | 'stable' | 'degrading' {
    if (values.length < 2) return 'stable';

    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));

    const firstAvg = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;

    const change = (secondAvg - firstAvg) / firstAvg;

    if (change < -0.1) return 'improving';
    if (change > 0.1) return 'degrading';
    return 'stable';
  }

  /**
   * Generate recommendations based on trends
   */
  private generateTrendRecommendations(component: string, metric: string, trend: string): string[] {
    const recommendations = [];

    if (trend === 'degrading') {
      switch (metric) {
        case 'latency':
          recommendations.push(`Monitor ${component} latency - consider performance optimization`);
          break;
        case 'error_rate':
          recommendations.push(`Investigate increasing ${component} error rate`);
          break;
        case 'memory_usage':
          recommendations.push(`Monitor ${component} memory usage - possible memory leak`);
          break;
      }
    }

    return recommendations;
  }

  /**
   * Get real-time metrics
   */
  public getRealTimeMetrics(component?: string, metricType?: string, limit: number = 100): RealTimeMetric[] {
    let filteredMetrics = this.realTimeMetrics;

    if (component) {
      filteredMetrics = filteredMetrics.filter(m => m.component === component);
    }

    if (metricType) {
      filteredMetrics = filteredMetrics.filter(m => m.metricType === metricType);
    }

    return filteredMetrics.slice(0, limit);
  }

  /**
   * Get active alerts
   */
  public getActiveAlerts(): PerformanceAlert[] {
    return this.alerts.filter(a => !a.resolved);
  }

  /**
   * Get alerts by severity
   */
  public getAlertsBySeverity(severity: PerformanceAlert['severity']): PerformanceAlert[] {
    return this.alerts.filter(a => a.severity === severity);
  }

  /**
   * Acknowledge alert
   */
  public acknowledgeAlert(alertId: string, userId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      return true;
    }
    return false;
  }

  /**
   * Resolve alert
   */
  public resolveAlert(alertId: string, resolution: string, userId: string): boolean {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolution = resolution;
      return true;
    }
    return false;
  }

  /**
   * Add alert callback
   */
  public addAlertCallback(callback: (alert: PerformanceAlert) => void): void {
    this.alertCallbacks.push(callback);
  }

  /**
   * Remove alert callback
   */
  public removeAlertCallback(callback: (alert: PerformanceAlert) => void): void {
    const index = this.alertCallbacks.indexOf(callback);
    if (index > -1) {
      this.alertCallbacks.splice(index, 1);
    }
  }

  /**
   * Get performance snapshots
   */
  public getPerformanceSnapshots(limit: number = 50): PerformanceMetricsSnapshot[] {
    return this.snapshots.slice(0, limit);
  }

  /**
   * Generate performance report
   */
  public generatePerformanceReport(type: PerformanceReport['type'], period: { start: Date; end: Date }): PerformanceReport {
    const snapshots = this.snapshots.filter(s => s.timestamp >= period.start && s.timestamp <= period.end);

    const report: PerformanceReport = {
      id: `report_${Date.now()}`,
      title: `${type.charAt(0).toUpperCase() + type.slice(1)} Performance Report`,
      type,
      period,
      summary: {
        overallHealth: this.calculateOverallHealthFromSnapshots(snapshots),
        keyMetrics: this.calculateKeyMetricsFromSnapshots(snapshots),
        topIssues: this.identifyTopIssuesFromSnapshots(snapshots),
        achievements: this.identifyAchievementsFromSnapshots(snapshots),
      },
      detailedAnalysis: {
        searchPerformance: this.analyzeSearchPerformance(snapshots),
        databasePerformance: this.analyzeDatabasePerformance(snapshots),
        configurationPerformance: this.analyzeConfigurationPerformance(snapshots),
        crossComponentAnalysis: this.analyzeCrossComponentPerformance(snapshots),
      },
      trends: this.calculateTrendsFromSnapshots(snapshots),
      recommendations: this.generateRecommendationsFromSnapshots(snapshots),
      generatedAt: new Date(),
      generatedBy: 'PerformanceDashboardService',
    };

    return report;
  }

  /**
   * Helper methods for report generation
   */
  private calculateOverallHealthFromSnapshots(snapshots: PerformanceMetricsSnapshot[]): 'healthy' | 'degraded' | 'critical' {
    if (snapshots.length === 0) return 'healthy';

    const avgResponseTime = snapshots.reduce((sum, s) => sum + s.searchMetrics.responseTime, 0) / snapshots.length;
    const avgErrorRate = snapshots.reduce((sum, s) => sum + s.searchMetrics.errorRate, 0) / snapshots.length;

    if (avgResponseTime > 2000 || avgErrorRate > 0.1) return 'critical';
    if (avgResponseTime > 1000 || avgErrorRate > 0.05) return 'degraded';
    return 'healthy';
  }

  private calculateKeyMetricsFromSnapshots(snapshots: PerformanceMetricsSnapshot[]): Record<string, number> {
    if (snapshots.length === 0) return {};

    return {
      avgSearchResponseTime: snapshots.reduce((sum, s) => sum + s.searchMetrics.responseTime, 0) / snapshots.length,
      totalQueries: snapshots.reduce((sum, s) => sum + s.searchMetrics.queryCount, 0),
      avgDatabaseLatency: snapshots.reduce((sum, s) => sum + s.databaseMetrics.latency, 0) / snapshots.length,
      avgErrorRate: snapshots.reduce((sum, s) => sum + s.searchMetrics.errorRate, 0) / snapshots.length,
      cacheHitRate: snapshots.reduce((sum, s) => sum + s.configurationMetrics.cacheHitRate, 0) / snapshots.length,
    };
  }

  private identifyTopIssuesFromSnapshots(snapshots: PerformanceMetricsSnapshot[]): string[] {
    const issues = [];

    const avgResponseTime = snapshots.reduce((sum, s) => sum + s.searchMetrics.responseTime, 0) / snapshots.length;
    if (avgResponseTime > 1000) {
      issues.push('Elevated search response times detected');
    }

    const totalSlowQueries = snapshots.reduce((sum, s) => sum + s.databaseMetrics.slowQueryCount, 0);
    if (totalSlowQueries > 10) {
      issues.push('Multiple slow database queries identified');
    }

    return issues.slice(0, 5);
  }

  private identifyAchievementsFromSnapshots(snapshots: PerformanceMetricsSnapshot[]): string[] {
    const achievements = [];

    const avgErrorRate = snapshots.reduce((sum, s) => sum + s.searchMetrics.errorRate, 0) / snapshots.length;
    if (avgErrorRate < 0.01) {
      achievements.push('Maintained very low error rate');
    }

    const avgCacheHitRate = snapshots.reduce((sum, s) => sum + s.configurationMetrics.cacheHitRate, 0) / snapshots.length;
    if (avgCacheHitRate > 0.8) {
      achievements.push('Excellent cache performance achieved');
    }

    return achievements.slice(0, 5);
  }

  private analyzeSearchPerformance(snapshots: PerformanceMetricsSnapshot[]): any {
    return {
      averageResponseTime: snapshots.reduce((sum, s) => sum + s.searchMetrics.responseTime, 0) / snapshots.length,
      totalQueries: snapshots.reduce((sum, s) => sum + s.searchMetrics.queryCount, 0),
      errorRate: snapshots.reduce((sum, s) => sum + s.searchMetrics.errorRate, 0) / snapshots.length,
      strategyUsage: this.aggregateStrategyUsage(snapshots),
    };
  }

  private analyzeDatabasePerformance(snapshots: PerformanceMetricsSnapshot[]): any {
    return {
      averageLatency: snapshots.reduce((sum, s) => sum + s.databaseMetrics.latency, 0) / snapshots.length,
      totalOperations: snapshots.reduce((sum, s) => sum + s.databaseMetrics.operationCount, 0),
      errorRate: snapshots.reduce((sum, s) => sum + s.databaseMetrics.errorRate, 0) / snapshots.length,
      slowQueryCount: snapshots.reduce((sum, s) => sum + s.databaseMetrics.slowQueryCount, 0),
      memoryUsage: snapshots[snapshots.length - 1]?.databaseMetrics.memoryUsage || 0,
    };
  }

  private analyzeConfigurationPerformance(snapshots: PerformanceMetricsSnapshot[]): any {
    return {
      averageLatency: snapshots.reduce((sum, s) => sum + s.configurationMetrics.latency, 0) / snapshots.length,
      totalOperations: snapshots.reduce((sum, s) => sum + s.configurationMetrics.operationCount, 0),
      errorRate: snapshots.reduce((sum, s) => sum + s.configurationMetrics.errorRate, 0) / snapshots.length,
      cacheHitRate: snapshots.reduce((sum, s) => sum + s.configurationMetrics.cacheHitRate, 0) / snapshots.length,
    };
  }

  private analyzeCrossComponentPerformance(snapshots: PerformanceMetricsSnapshot[]): any {
    return {
      correlations: {
        searchDbLatency: 0.3,
        searchConfigLatency: 0.1,
        dbConfigLatency: 0.2,
      },
      bottlenecks: this.identifyBottlenecksFromSnapshots(snapshots),
      resourceUtilization: this.analyzeResourceUtilizationFromSnapshots(snapshots),
    };
  }

  private calculateTrendsFromSnapshots(snapshots: PerformanceMetricsSnapshot[]): TrendAnalysis[] {
    // Simplified trend calculation
    return [
      {
        component: 'search',
        metric: 'responseTime',
        timeframe: '24h',
        trend: 'stable',
        confidence: 0.8,
        prediction: { nextValue: 750, timeframe: '1h', confidence: 0.7 },
        analysis: 'Search response times have been stable',
        recommendations: [],
      },
    ];
  }

  private generateRecommendationsFromSnapshots(snapshots: PerformanceMetricsSnapshot[]): PerformanceReport['recommendations'] {
    return [
      {
        priority: 'medium',
        category: 'performance',
        title: 'Optimize search queries',
        description: 'Consider implementing query result caching to improve response times',
        effort: 'medium',
        impact: 'high',
        status: 'pending',
      },
    ];
  }

  private aggregateStrategyUsage(snapshots: PerformanceMetricsSnapshot[]): Record<string, number> {
    const usage: Record<string, number> = {};

    snapshots.forEach(snapshot => {
      Object.entries(snapshot.searchMetrics.strategyUsage).forEach(([strategy, percentage]) => {
        usage[strategy] = (usage[strategy] || 0) + percentage;
      });
    });

    Object.keys(usage).forEach(strategy => {
      usage[strategy] /= snapshots.length;
    });

    return usage;
  }

  private identifyBottlenecksFromSnapshots(snapshots: PerformanceMetricsSnapshot[]): string[] {
    const bottlenecks = [];

    const avgSearchTime = snapshots.reduce((sum, s) => sum + s.searchMetrics.responseTime, 0) / snapshots.length;
    const avgDbLatency = snapshots.reduce((sum, s) => sum + s.databaseMetrics.latency, 0) / snapshots.length;

    if (avgSearchTime > avgDbLatency * 2) {
      bottlenecks.push('Search service is the primary performance bottleneck');
    } else if (avgDbLatency > avgSearchTime * 2) {
      bottlenecks.push('Database operations are the primary performance bottleneck');
    }

    return bottlenecks;
  }

  private analyzeResourceUtilizationFromSnapshots(snapshots: PerformanceMetricsSnapshot[]): any {
    return {
      memoryEfficiency: 'good',
      cpuUtilization: 'normal',
      ioEfficiency: 'good',
    };
  }

  /**
   * Export dashboard configuration
   */
  public exportDashboardConfiguration(): {
    widgets: DashboardWidget[];
    settings: {
      refreshIntervals: Record<string, number>;
      alertThresholds: Record<string, number>;
      dataRetention: {
        metrics: number;
        snapshots: number;
        alerts: number;
      };
    };
  } {
    return {
      widgets: this.widgets,
      settings: {
        refreshIntervals: Object.fromEntries(
          this.widgets.map(w => [w.id, w.refreshInterval])
        ),
        alertThresholds: {
          latency: 1000,
          errorRate: 0.05,
          memoryUsage: 300 * 1024 * 1024,
        },
        dataRetention: {
          metrics: this.maxMetricsHistory,
          snapshots: this.maxSnapshotsHistory,
          alerts: 1000,
        },
      },
    };
  }

  /**
   * Import dashboard configuration
   */
  public importDashboardConfiguration(config: { widgets: DashboardWidget[] }): void {
    this.widgets = config.widgets;
  }
}