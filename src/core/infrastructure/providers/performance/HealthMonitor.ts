import { ILLMProvider } from '../ILLMProvider';
import { ProviderType } from '../ProviderType';
import { ProviderDiagnostics } from '../types/ProviderDiagnostics';
import { logInfo, logError, logWarn } from '../../config/Logger';

/**
 * Configuration for provider health monitoring
 */
export interface HealthMonitorConfig {
  /** Health check interval in milliseconds */
  checkInterval: number;
  /** Timeout for health checks in milliseconds */
  checkTimeout: number;
  /** Number of consecutive failures before marking unhealthy */
  failureThreshold: number;
  /** Number of successful checks before marking healthy */
  successThreshold: number;
  /** Enable detailed metrics collection */
  enableMetrics: boolean;
  /** Maximum number of health events to keep in history */
  maxHistorySize: number;
}

/**
 * Health status of a provider
 */
export interface ProviderHealthStatus {
  providerType: ProviderType;
  isHealthy: boolean;
  lastCheck: Date;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  averageResponseTime: number;
  totalRequests: number;
  failedRequests: number;
  lastError?: string;
  diagnostics?: ProviderDiagnostics;
}

/**
 * Health check event for tracking history
 */
export interface HealthCheckEvent {
  timestamp: Date;
  isHealthy: boolean;
  responseTime: number;
  error?: string;
  diagnostics?: ProviderDiagnostics;
}

/**
 * Comprehensive health monitoring service for LLM providers
 */
export class HealthMonitor {
  private providerStatuses = new Map<string, ProviderHealthStatus>();
  private healthHistory = new Map<string, HealthCheckEvent[]>();
  private checkIntervals = new Map<string, NodeJS.Timeout>();
  private config: HealthMonitorConfig;

  constructor(config: Partial<HealthMonitorConfig> = {}) {
    this.config = {
      checkInterval: 30000, // 30 seconds
      checkTimeout: 10000, // 10 seconds
      failureThreshold: 3,
      successThreshold: 2,
      enableMetrics: true,
      maxHistorySize: 100,
      ...config,
    };
  }

  /**
   * Start monitoring a provider
   */
  startMonitoring(provider: ILLMProvider): void {
    const key = this.getProviderKey(provider);

    if (this.checkIntervals.has(key)) {
      logWarn('Provider is already being monitored', {
        component: 'HealthMonitor',
        providerType: provider.getProviderType(),
      });
      return;
    }

    // Initialize status
    const status: ProviderHealthStatus = {
      providerType: provider.getProviderType(),
      isHealthy: true,
      lastCheck: new Date(),
      consecutiveFailures: 0,
      consecutiveSuccesses: 0,
      averageResponseTime: 0,
      totalRequests: 0,
      failedRequests: 0,
    };

    this.providerStatuses.set(key, status);
    this.healthHistory.set(key, []);

    // Start monitoring interval
    const interval = setInterval(async () => {
      await this.performHealthCheck(provider);
    }, this.config.checkInterval);

    this.checkIntervals.set(key, interval);

    logInfo('Started monitoring provider', {
      component: 'HealthMonitor',
      providerType: provider.getProviderType(),
      checkInterval: this.config.checkInterval,
    });
  }

  /**
   * Stop monitoring a provider
   */
  stopMonitoring(provider: ILLMProvider): void {
    const key = this.getProviderKey(provider);

    const interval = this.checkIntervals.get(key);
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(key);
    }

    logInfo('Stopped monitoring provider', {
      component: 'HealthMonitor',
      providerType: provider.getProviderType(),
    });
  }

  /**
   * Get health status for a provider
   */
  getProviderHealth(provider: ILLMProvider): ProviderHealthStatus | null {
    const key = this.getProviderKey(provider);
    return this.providerStatuses.get(key) || null;
  }

  /**
   * Get health status for all monitored providers
   */
  getAllHealthStatuses(): ProviderHealthStatus[] {
    return Array.from(this.providerStatuses.values());
  }

  /**
   * Get health history for a provider
   */
  getProviderHealthHistory(provider: ILLMProvider, limit?: number): HealthCheckEvent[] {
    const key = this.getProviderKey(provider);
    const history = this.healthHistory.get(key) || [];
    const limitCount = limit || history.length;
    return history.slice(-limitCount);
  }

  /**
   * Record a request result for metrics calculation
   */
  recordRequestResult(
    provider: ILLMProvider,
    success: boolean,
    responseTime: number,
    error?: string
  ): void {
    const key = this.getProviderKey(provider);
    const status = this.providerStatuses.get(key);

    if (!status) return;

    status.totalRequests++;

    if (!success) {
      status.failedRequests++;
      status.consecutiveSuccesses = 0;
      status.consecutiveFailures++;
      status.lastError = error;

      if (status.consecutiveFailures >= this.config.failureThreshold) {
        status.isHealthy = false;
        logWarn('Provider marked as unhealthy due to consecutive failures', {
          component: 'HealthMonitor',
          providerType: provider.getProviderType(),
          consecutiveFailures: status.consecutiveFailures,
        });
      }
    } else {
      status.consecutiveFailures = 0;
      status.consecutiveSuccesses++;

      if (status.consecutiveSuccesses >= this.config.successThreshold && !status.isHealthy) {
        status.isHealthy = true;
        logInfo('Provider recovered and marked as healthy', {
          component: 'HealthMonitor',
          providerType: provider.getProviderType(),
          consecutiveSuccesses: status.consecutiveSuccesses,
        });
      }
    }

    // Update average response time
    if (status.totalRequests === 1) {
      status.averageResponseTime = responseTime;
    } else {
      status.averageResponseTime =
        (status.averageResponseTime * (status.totalRequests - 1) + responseTime) /
        status.totalRequests;
    }

    status.lastCheck = new Date();

    // Record in history if metrics are enabled
    if (this.config.enableMetrics) {
      this.recordHealthEvent(provider, success, responseTime, error);
    }
  }

  /**
   * Get overall health summary
   */
  getHealthSummary(): {
    totalProviders: number;
    healthyProviders: number;
    unhealthyProviders: number;
    averageUptime: number;
    totalRequests: number;
    totalFailures: number;
  } {
    const statuses = Array.from(this.providerStatuses.values());

    if (statuses.length === 0) {
      return {
        totalProviders: 0,
        healthyProviders: 0,
        unhealthyProviders: 0,
        averageUptime: 0,
        totalRequests: 0,
        totalFailures: 0,
      };
    }

    const healthyProviders = statuses.filter(s => s.isHealthy).length;
    const totalRequests = statuses.reduce((sum, s) => sum + s.totalRequests, 0);
    const totalFailures = statuses.reduce((sum, s) => sum + s.failedRequests, 0);

    // Calculate average uptime (simplified as health ratio)
    const averageUptime = healthyProviders / statuses.length;

    return {
      totalProviders: statuses.length,
      healthyProviders,
      unhealthyProviders: statuses.length - healthyProviders,
      averageUptime,
      totalRequests,
      totalFailures,
    };
  }

  /**
   * Dispose of the health monitor
   */
  dispose(): void {
    // Clear all intervals
    for (const interval of this.checkIntervals.values()) {
      clearInterval(interval);
    }
    this.checkIntervals.clear();

    // Clear all data
    this.providerStatuses.clear();
    this.healthHistory.clear();

    logInfo('Health monitor disposed', {
      component: 'HealthMonitor',
    });
  }

  private async performHealthCheck(provider: ILLMProvider): Promise<void> {
    const key = this.getProviderKey(provider);
    const startTime = Date.now();

    try {
      const isHealthy = await Promise.race([
        provider.isHealthy(),
        new Promise<boolean>((_, reject) =>
          setTimeout(() => reject(new Error('Health check timeout')), this.config.checkTimeout)
        ),
      ]);

      const responseTime = Date.now() - startTime;
      const status = this.providerStatuses.get(key)!;

      // Update status
      if (isHealthy) {
        status.consecutiveFailures = 0;
        status.consecutiveSuccesses++;
        status.isHealthy = status.consecutiveSuccesses >= this.config.successThreshold;
      } else {
        status.consecutiveSuccesses = 0;
        status.consecutiveFailures++;
        status.isHealthy = status.consecutiveFailures < this.config.failureThreshold;
      }

      status.lastCheck = new Date();

      // Get diagnostics if available
      try {
        status.diagnostics = await provider.getDiagnostics();
      } catch (error) {
        // Diagnostics not available, continue without them
      }

      // Record in history
      if (this.config.enableMetrics) {
        this.recordHealthEvent(provider, isHealthy, responseTime);
      }

      logInfo('Health check completed', {
        component: 'HealthMonitor',
        providerType: provider.getProviderType(),
        isHealthy,
        responseTime,
        consecutiveFailures: status.consecutiveFailures,
        consecutiveSuccesses: status.consecutiveSuccesses,
      });

    } catch (error) {
      const responseTime = Date.now() - startTime;
      const status = this.providerStatuses.get(key)!;

      // Mark as unhealthy on error
      status.consecutiveSuccesses = 0;
      status.consecutiveFailures++;
      status.isHealthy = status.consecutiveFailures < this.config.failureThreshold;
      status.lastError = error instanceof Error ? error.message : String(error);

      // Record in history
      if (this.config.enableMetrics) {
        this.recordHealthEvent(provider, false, responseTime, status.lastError);
      }

      logError('Health check failed', {
        component: 'HealthMonitor',
        providerType: provider.getProviderType(),
        error: status.lastError,
        responseTime,
        consecutiveFailures: status.consecutiveFailures,
      });
    }
  }

  private recordHealthEvent(
    provider: ILLMProvider,
    isHealthy: boolean,
    responseTime: number,
    error?: string
  ): void {
    const key = this.getProviderKey(provider);
    const event: HealthCheckEvent = {
      timestamp: new Date(),
      isHealthy,
      responseTime,
      error,
    };

    // Get or create diagnostics
    provider.getDiagnostics().then(diagnostics => {
      event.diagnostics = diagnostics;
    }).catch(() => {
      // Diagnostics not available
    });

    // Add to history
    let history = this.healthHistory.get(key) || [];
    history.push(event);

    // Trim history if needed
    if (history.length > this.config.maxHistorySize) {
      history = history.slice(-this.config.maxHistorySize);
    }

    this.healthHistory.set(key, history);
  }

  private getProviderKey(provider: ILLMProvider): string {
    return `${provider.getProviderType()}:${provider.getModel()}`;
  }
}

// Global health monitor instance
export const globalHealthMonitor = new HealthMonitor();