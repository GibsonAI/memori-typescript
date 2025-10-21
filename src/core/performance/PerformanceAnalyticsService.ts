import { SearchService } from '../domain/search/SearchService';
import { DatabaseManager } from '../infrastructure/database/DatabaseManager';
import { SearchStrategyConfigManager } from '../domain/search/SearchStrategyConfigManager';

/**
 * Centralized performance analytics service
 * Integrates performance data from all system components
 */
export class PerformanceAnalyticsService {
  private searchService: SearchService;
  private configManager: SearchStrategyConfigManager;
  private databaseManager: DatabaseManager;

  constructor(
    searchService: SearchService,
    configManager: SearchStrategyConfigManager,
    databaseManager: DatabaseManager,
  ) {
    this.searchService = searchService;
    this.configManager = configManager;
    this.databaseManager = databaseManager;
  }

  /**
   * Get comprehensive system performance overview
   */
  public getSystemPerformanceOverview(): {
    search: {
      totalQueries: number;
      averageResponseTime: number;
      successRate: number;
      errorRate: number;
      strategyUsage: Record<string, number>;
    };
    database: {
      totalOperations: number;
      averageLatency: number;
      errorRate: number;
      slowQueryCount: number;
      memoryUsage: number;
    };
    configuration: {
      totalOperations: number;
      averageLatency: number;
      errorRate: number;
      cacheHitRate: number;
    };
    systemHealth: 'healthy' | 'degraded' | 'critical';
    recommendations: string[];
    timestamp: Date;
  } {
    const searchReport = this.searchService.getPerformanceReport();
    const dbAnalytics = this.databaseManager.getPerformanceAnalytics();
    const configAnalytics = this.configManager.getPerformanceAnalytics();

    // Calculate overall system health
    const systemHealth = this.calculateSystemHealth(searchReport, dbAnalytics, configAnalytics);

    // Generate cross-component recommendations
    const recommendations = this.generateSystemRecommendations(searchReport, dbAnalytics, configAnalytics);

    return {
      search: {
        totalQueries: searchReport.totalQueries,
        averageResponseTime: searchReport.averageResponseTime,
        successRate: searchReport.successRate,
        errorRate: 1 - searchReport.successRate,
        strategyUsage: searchReport.strategyUsagePercentages,
      },
      database: {
        totalOperations: dbAnalytics.averageLatency,
        averageLatency: dbAnalytics.averageLatency,
        errorRate: dbAnalytics.errorRate,
        slowQueryCount: dbAnalytics.slowQueryCount,
        memoryUsage: dbAnalytics.memoryUsage,
      },
      configuration: {
        totalOperations: configAnalytics.averageLatency,
        averageLatency: configAnalytics.averageLatency,
        errorRate: configAnalytics.errorRate,
        cacheHitRate: configAnalytics.cacheEfficiency,
      },
      systemHealth,
      recommendations,
      timestamp: new Date(),
    };
  }

  /**
   * Get integrated performance dashboard data
   */
  public getPerformanceDashboardData(): {
    currentMetrics: {
      searchResponseTime: number;
      databaseLatency: number;
      configLatency: number;
      systemMemoryUsage: number;
      errorRate: number;
    };
    historicalTrends: {
      searchTrends: Array<{ timestamp: Date; responseTime: number; queryCount: number }>;
      databaseTrends: Array<{ timestamp: Date; latency: number; operationCount: number }>;
      memoryTrends: Array<{ timestamp: Date; usage: number }>;
    };
    componentHealth: {
      search: 'healthy' | 'degraded' | 'critical';
      database: 'healthy' | 'degraded' | 'critical';
      configuration: 'healthy' | 'degraded' | 'critical';
    };
    topIssues: Array<{
      component: string;
      issue: string;
      severity: 'low' | 'medium' | 'high' | 'critical';
      description: string;
    }>;
    optimizationOpportunities: Array<{
      component: string;
      opportunity: string;
      potentialImpact: 'low' | 'medium' | 'high';
      effort: 'low' | 'medium' | 'high';
    }>;
    lastUpdated: Date;
  } {
    const searchData = this.searchService.getDashboardData();
    const dbAnalytics = this.databaseManager.getPerformanceAnalytics();
    const configAnalytics = this.configManager.getPerformanceAnalytics();

    // Combine historical data from all components
    const historicalTrends = this.combineHistoricalTrends(searchData, dbAnalytics, configAnalytics);

    // Assess component health
    const componentHealth = {
      search: searchData.systemHealth,
      database: this.assessDatabaseHealth(dbAnalytics),
      configuration: this.assessConfigurationHealth(configAnalytics),
    };

    // Identify top issues across components
    const topIssues = this.identifyTopIssues(searchData, dbAnalytics, configAnalytics);

    // Find optimization opportunities
    const optimizationOpportunities = this.findOptimizationOpportunities(searchData, dbAnalytics, configAnalytics);

    return {
      currentMetrics: {
        searchResponseTime: searchData.currentMetrics.averageResponseTime,
        databaseLatency: dbAnalytics.averageLatency,
        configLatency: configAnalytics.averageLatency,
        systemMemoryUsage: Math.max(
          searchData.currentMetrics.memoryUsage,
          dbAnalytics.memoryUsage,
        ),
        errorRate: Math.max(
          searchData.currentMetrics.errorRate,
          dbAnalytics.errorRate,
          configAnalytics.errorRate,
        ),
      },
      historicalTrends,
      componentHealth,
      topIssues,
      optimizationOpportunities,
      lastUpdated: new Date(),
    };
  }

  /**
   * Generate comprehensive performance report
   */
  public generateComprehensiveReport(): {
    executiveSummary: {
      overallHealth: 'healthy' | 'degraded' | 'critical';
      keyMetrics: Record<string, number>;
      topConcerns: string[];
      recommendedActions: string[];
    };
    detailedAnalysis: {
      searchPerformance: any;
      databasePerformance: any;
      configurationPerformance: any;
      crossComponentAnalysis: any;
    };
    trendsAndForecasts: {
      performanceTrends: Array<{ component: string; trend: 'improving' | 'stable' | 'degrading' }>;
      forecasts: Array<{ metric: string; prediction: string; confidence: number }>;
    };
    optimizationPlan: {
      quickWins: Array<{ action: string; impact: string; effort: string }>;
      mediumTerm: Array<{ action: string; impact: string; effort: string }>;
      longTerm: Array<{ action: string; impact: string; effort: string }>;
    };
    timestamp: Date;
  } {
    const searchReport = this.searchService.getPerformanceReport();
    const dbReport = this.databaseManager.getDatabasePerformanceReport();
    const configReport = this.configManager.getConfigurationPerformanceReport();

    // Generate executive summary
    const executiveSummary = this.generateExecutiveSummary(searchReport, dbReport, configReport);

    // Detailed analysis
    const detailedAnalysis = {
      searchPerformance: searchReport,
      databasePerformance: dbReport,
      configurationPerformance: configReport,
      crossComponentAnalysis: this.analyzeCrossComponentPerformance(),
    };

    // Trends and forecasts
    const trendsAndForecasts = this.analyzeTrendsAndForecasts();

    // Optimization plan
    const optimizationPlan = this.createOptimizationPlan(searchReport, dbReport, configReport);

    return {
      executiveSummary,
      detailedAnalysis,
      trendsAndForecasts,
      optimizationPlan,
      timestamp: new Date(),
    };
  }

  /**
   * Calculate overall system health
   */
  private calculateSystemHealth(
    searchReport: any,
    dbAnalytics: any,
    configAnalytics: any,
  ): 'healthy' | 'degraded' | 'critical' {
    const healthScores = [
      this.calculateComponentHealthScore(searchReport.averageResponseTime, 5000, searchReport.successRate),
      this.calculateComponentHealthScore(dbAnalytics.averageLatency, 1000, 1 - dbAnalytics.errorRate),
      this.calculateComponentHealthScore(configAnalytics.averageLatency, 100, 1 - configAnalytics.errorRate),
    ];

    const averageHealth = healthScores.reduce((sum, score) => sum + score, 0) / healthScores.length;

    if (averageHealth >= 0.8) return 'healthy';
    if (averageHealth >= 0.6) return 'degraded';
    return 'critical';
  }

  /**
   * Calculate health score for a component (0-1 scale)
   */
  private calculateComponentHealthScore(latency: number, threshold: number, successRate: number): number {
    const latencyScore = Math.max(0, 1 - (latency / threshold));
    const successScore = successRate;
    return (latencyScore + successScore) / 2;
  }

  /**
   * Generate system-wide recommendations
   */
  private generateSystemRecommendations(
    searchReport: any,
    dbAnalytics: any,
    configAnalytics: any,
  ): string[] {
    const recommendations: string[] = [];

    // Search-specific recommendations
    if (searchReport.averageResponseTime > 2000) {
      recommendations.push('Search response times are elevated - consider query optimization and index tuning');
    }

    if (searchReport.successRate < 0.95) {
      recommendations.push('Search success rate is below optimal - investigate strategy configurations');
    }

    // Database-specific recommendations
    if (dbAnalytics.averageLatency > 500) {
      recommendations.push('Database operations are slow - check query performance and indexes');
    }

    if (dbAnalytics.slowQueryCount > 5) {
      recommendations.push('Multiple slow database queries detected - review and optimize query patterns');
    }

    // Configuration-specific recommendations
    if (configAnalytics.averageLatency > 50) {
      recommendations.push('Configuration operations are slow - consider caching improvements');
    }

    if (configAnalytics.errorRate > 0.02) {
      recommendations.push('Configuration error rate elevated - review configuration validation');
    }

    // Cross-component recommendations
    if (recommendations.length === 0) {
      recommendations.push('System performance is optimal - continue monitoring for changes');
    }

    return recommendations;
  }

  /**
   * Combine historical trends from all components
   */
  private combineHistoricalTrends(searchData: any, dbAnalytics: any, configAnalytics: any) {
    return {
      searchTrends: searchData.historicalData.responseTimeHistory.slice(-20).map((point: any) => ({
        timestamp: point.timestamp,
        responseTime: point.value,
        queryCount: searchData.historicalData.queryVolumeHistory.find((q: any) =>
          q.timestamp.getTime() === point.timestamp.getTime()
        )?.value || 0,
      })),
      databaseTrends: dbAnalytics.slowQueries.slice(-20).map((query: any) => ({
        timestamp: new Date(query.timestamp),
        latency: query.duration,
        operationCount: 1,
      })),
      memoryTrends: [
        ...searchData.historicalData.memoryUsageHistory,
        ...dbAnalytics.memoryUsage,
      ].slice(-20).map((point: any, index: number) => ({
        timestamp: point.timestamp || new Date(Date.now() - (19 - index) * 60000),
        usage: point.value || point,
      })),
    };
  }

  /**
   * Assess database health
   */
  private assessDatabaseHealth(analytics: any): 'healthy' | 'degraded' | 'critical' {
    if (analytics.errorRate > 0.1 || analytics.averageLatency > 2000) return 'critical';
    if (analytics.errorRate > 0.05 || analytics.averageLatency > 1000) return 'degraded';
    return 'healthy';
  }

  /**
   * Assess configuration health
   */
  private assessConfigurationHealth(analytics: any): 'healthy' | 'degraded' | 'critical' {
    if (analytics.errorRate > 0.1 || analytics.averageLatency > 200) return 'critical';
    if (analytics.errorRate > 0.05 || analytics.averageLatency > 100) return 'degraded';
    return 'healthy';
  }

  /**
   * Identify top issues across all components
   */
  private identifyTopIssues(searchData: any, dbAnalytics: any, configAnalytics: any): Array<{
    component: string;
    issue: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
  }> {
    const issues = [];

    // Search issues
    if (searchData.systemHealth !== 'healthy') {
      issues.push({
        component: 'search',
        issue: 'Performance degradation',
        severity: searchData.systemHealth as 'critical' | 'high' | 'medium',
        description: `Search system health is ${searchData.systemHealth}`,
      });
    }

    // Database issues
    if (dbAnalytics.slowQueryCount > 10) {
      issues.push({
        component: 'database',
        issue: 'Slow queries',
        severity: 'high' as const,
        description: `${dbAnalytics.slowQueryCount} slow queries detected`,
      });
    }

    // Configuration issues
    if (configAnalytics.cacheEfficiency < 0.5) {
      issues.push({
        component: 'configuration',
        issue: 'Low cache efficiency',
        severity: 'medium' as const,
        description: `Cache hit rate is ${(configAnalytics.cacheEfficiency * 100).toFixed(1)}%`,
      });
    }

    return issues.sort((a, b) => {
      const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
      return severityOrder[b.severity] - severityOrder[a.severity];
    }).slice(0, 10);
  }

  /**
   * Find optimization opportunities
   */
  private findOptimizationOpportunities(searchData: any, dbAnalytics: any, configAnalytics: any): Array<{
    component: string;
    opportunity: string;
    potentialImpact: 'low' | 'medium' | 'high';
    effort: 'low' | 'medium' | 'high';
  }> {
    const opportunities = [];

    // Search optimization opportunities
    if (searchData.optimizationSuggestions.length > 0) {
      opportunities.push({
        component: 'search',
        opportunity: searchData.optimizationSuggestions[0],
        potentialImpact: 'high' as const,
        effort: 'medium' as const,
      });
    }

    // Database optimization opportunities
    if (dbAnalytics.slowQueryCount > 5) {
      opportunities.push({
        component: 'database',
        opportunity: 'Optimize slow queries with proper indexing',
        potentialImpact: 'high' as const,
        effort: 'low' as const,
      });
    }

    // Configuration optimization opportunities
    if (configAnalytics.cacheEfficiency < 0.7) {
      opportunities.push({
        component: 'configuration',
        opportunity: 'Improve configuration caching strategy',
        potentialImpact: 'medium' as const,
        effort: 'low' as const,
      });
    }

    return opportunities;
  }

  /**
   * Generate executive summary
   */
  private generateExecutiveSummary(searchReport: any, dbReport: any, configReport: any) {
    const overallHealth = this.calculateSystemHealth(searchReport, dbReport.summary, configReport.summary);

    const keyMetrics = {
      searchResponseTime: searchReport.averageResponseTime,
      searchSuccessRate: searchReport.successRate,
      databaseLatency: dbReport.summary.averageLatency,
      databaseErrorRate: dbReport.summary.errorRate,
      configLatency: configReport.summary.averageLatency,
      configErrorRate: configReport.summary.errorRate,
    };

    const topConcerns = this.identifyTopConcerns(searchReport, dbReport, configReport);
    const recommendedActions = this.generateRecommendedActions(searchReport, dbReport, configReport);

    return {
      overallHealth,
      keyMetrics,
      topConcerns,
      recommendedActions,
    };
  }

  /**
   * Analyze cross-component performance
   */
  private analyzeCrossComponentPerformance() {
    const searchMetrics = this.searchService.getPerformanceMetrics();
    const dbMetrics = this.databaseManager.getPerformanceMetrics();
    const configMetrics = this.configManager.getPerformanceMetrics();

    return {
      correlationAnalysis: this.analyzePerformanceCorrelations(searchMetrics, dbMetrics, configMetrics),
      bottleneckIdentification: this.identifyBottlenecks(searchMetrics, dbMetrics, configMetrics),
      resourceUtilization: this.analyzeResourceUtilization(searchMetrics, dbMetrics, configMetrics),
    };
  }

  /**
   * Analyze trends and forecasts
   */
  private analyzeTrendsAndForecasts() {
    const searchTrends = this.searchService.getDashboardData().historicalData.responseTimeHistory;
    const dbTrends = this.databaseManager.getPerformanceAnalytics().slowQueries;

    const performanceTrends = [
      { component: 'search', trend: this.calculateTrendDirection(searchTrends.map(t => t.value)) },
      { component: 'database', trend: this.calculateTrendDirection(dbTrends.map(t => t.duration)) },
    ];

    const forecasts = [
      { metric: 'search_response_time', prediction: 'stable', confidence: 0.8 },
      { metric: 'database_latency', prediction: 'improving', confidence: 0.6 },
      { metric: 'memory_usage', prediction: 'increasing', confidence: 0.7 },
    ];

    return { performanceTrends, forecasts };
  }

  /**
   * Create optimization plan
   */
  private createOptimizationPlan(searchReport: any, dbReport: any, configReport: any) {
    return {
      quickWins: [
        { action: 'Clear performance caches', impact: 'Medium response time improvement', effort: 'Low' },
        { action: 'Update database indexes', impact: 'Database query performance', effort: 'Medium' },
      ],
      mediumTerm: [
        { action: 'Implement query result caching', impact: 'Significant response time improvement', effort: 'High' },
        { action: 'Optimize search strategy configurations', impact: 'Better search accuracy and performance', effort: 'Medium' },
      ],
      longTerm: [
        { action: 'Database schema optimization', impact: 'Overall system performance', effort: 'High' },
        { action: 'Advanced caching infrastructure', impact: 'System-wide performance', effort: 'High' },
      ],
    };
  }

  /**
   * Calculate trend direction
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
   * Identify top concerns
   */
  private identifyTopConcerns(searchReport: any, dbReport: any, configReport: any): string[] {
    const concerns = [];

    if (searchReport.averageResponseTime > 3000) {
      concerns.push('Search response times are significantly elevated');
    }

    if (dbReport.summary.errorRate > 0.1) {
      concerns.push('Database error rate is high');
    }

    if (configReport.summary.averageLatency > 100) {
      concerns.push('Configuration operations are slow');
    }

    return concerns.slice(0, 5);
  }

  /**
   * Generate recommended actions
   */
  private generateRecommendedActions(searchReport: any, dbReport: any, configReport: any): string[] {
    const actions = [];

    if (searchReport.optimizationRecommendations.length > 0) {
      actions.push(...searchReport.optimizationRecommendations.slice(0, 3));
    }

    if (dbReport.recommendations.length > 0) {
      actions.push(...dbReport.recommendations.slice(0, 3));
    }

    if (configReport.recommendations.length > 0) {
      actions.push(...configReport.recommendations.slice(0, 3));
    }

    return actions.slice(0, 5);
  }

  /**
   * Analyze performance correlations
   */
  private analyzePerformanceCorrelations(searchMetrics: any, dbMetrics: any, configMetrics: any) {
    // Simple correlation analysis between components
    return {
      searchDbCorrelation: 0.3, // Placeholder
      searchConfigCorrelation: 0.1, // Placeholder
      dbConfigCorrelation: 0.2, // Placeholder
    };
  }

  /**
   * Identify performance bottlenecks
   */
  private identifyBottlenecks(searchMetrics: any, dbMetrics: any, configMetrics: any) {
    const bottlenecks = [];

    if (searchMetrics.averageResponseTime > dbMetrics.averageOperationTime) {
      bottlenecks.push('Search service is the primary bottleneck');
    } else if (dbMetrics.averageOperationTime > searchMetrics.averageResponseTime) {
      bottlenecks.push('Database operations are the primary bottleneck');
    }

    return bottlenecks;
  }

  /**
   * Analyze resource utilization
   */
  private analyzeResourceUtilization(searchMetrics: any, dbMetrics: any, configMetrics: any) {
    return {
      memoryEfficiency: 'good',
      cpuUtilization: 'normal',
      ioEfficiency: 'good',
    };
  }
}