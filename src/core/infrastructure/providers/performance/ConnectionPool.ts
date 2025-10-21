import { ILLMProvider } from '../ILLMProvider';
import { IProviderConfig } from '../IProviderConfig';
import { ProviderType } from '../ProviderType';
import { logInfo, logError } from '../../config/Logger';

/**
 * Connection pool for LLM providers to optimize resource usage
 * Manages provider instances and handles connection lifecycle
 */
export interface ConnectionPoolConfig {
  maxConnections: number;
  maxIdleTime: number; // milliseconds
  healthCheckInterval: number; // milliseconds
  connectionTimeout: number; // milliseconds
  retryAttempts: number;
  retryDelay: number; // milliseconds
}

export interface PooledConnection {
  provider: ILLMProvider;
  createdAt: Date;
  lastUsedAt: Date;
  isHealthy: boolean;
  usageCount: number;
}

export class ConnectionPool {
  private connections = new Map<string, PooledConnection[]>();
  private config: ConnectionPoolConfig;
  private healthCheckTimer?: ReturnType<typeof setInterval>;

  constructor(config: Partial<ConnectionPoolConfig> = {}) {
    this.config = {
      maxConnections: 10,
      maxIdleTime: 300000, // 5 minutes
      healthCheckInterval: 60000, // 1 minute
      connectionTimeout: 30000, // 30 seconds
      retryAttempts: 3,
      retryDelay: 1000, // 1 second
      ...config,
    };

    // Start health check interval only if not in test environment
    if (!this.isTestEnvironment()) {
      this.startHealthCheckInterval();
    }
  }

  /**
   * Get a connection from the pool or create a new one
   */
  async getConnection(
    providerType: ProviderType,
    config: IProviderConfig
  ): Promise<ILLMProvider> {
    const poolKey = this.getPoolKey(providerType, config);

    // Initialize pool if it doesn't exist
    if (!this.connections.has(poolKey)) {
      this.connections.set(poolKey, []);
    }

    const pool = this.connections.get(poolKey)!;

    // Try to find a healthy connection
    for (const connection of pool) {
      if (connection.isHealthy && this.isConnectionValid(connection)) {
        connection.lastUsedAt = new Date();
        connection.usageCount++;
        // Only log every 10 reuses to reduce noise
        if (connection.usageCount % 10 === 0) {
          logInfo('Reusing pooled connection', {
            component: 'ConnectionPool',
            providerType,
            poolSize: pool.length,
            usageCount: connection.usageCount,
          });
        }
        return connection.provider;
      }
    }

    // No healthy connection available, create new one if under limit
    if (pool.length < this.config.maxConnections) {
      try {
        const provider = await this.createProvider(providerType, config);
        const pooledConnection: PooledConnection = {
          provider,
          createdAt: new Date(),
          lastUsedAt: new Date(),
          isHealthy: true,
          usageCount: 1,
        };

        pool.push(pooledConnection);

        // Only log new connections occasionally to reduce noise
        if (Math.random() < 0.1) { // Log ~10% of new connections
          logInfo('Created new pooled connection', {
            component: 'ConnectionPool',
            providerType,
            poolSize: pool.length,
          });
        }

        return provider;
      } catch (error) {
        logError('Failed to create new provider connection', {
          component: 'ConnectionPool',
          providerType,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      }
    }

    // Pool is full, wait for a connection to become available
    return this.waitForAvailableConnection(pool);
  }

  /**
   * Return a connection to the pool
   */
  async returnConnection(provider: ILLMProvider): Promise<void> {
    // Find the connection in the pool
    for (const pool of this.connections.values()) {
      const connection = pool.find(c => c.provider === provider);
      if (connection) {
        connection.lastUsedAt = new Date();
        logInfo('Connection returned to pool', {
          component: 'ConnectionPool',
          usageCount: connection.usageCount,
        });
        break;
      }
    }
  }

  /**
   * Get pool statistics
   */
  getPoolStats(): {
    totalPools: number;
    totalConnections: number;
    poolDetails: Array<{
      providerType: ProviderType;
      configHash: string;
      connectionCount: number;
      healthyConnections: number;
      averageUsageCount: number;
    }>;
  } {
    const poolDetails = [];

    for (const [poolKey, pool] of this.connections.entries()) {
      const { providerType, configHash } = this.parsePoolKey(poolKey);
      const healthyConnections = pool.filter(c => c.isHealthy).length;
      const averageUsageCount = pool.length > 0
        ? pool.reduce((sum, c) => sum + c.usageCount, 0) / pool.length
        : 0;

      poolDetails.push({
        providerType,
        configHash,
        connectionCount: pool.length,
        healthyConnections,
        averageUsageCount,
      });
    }

    return {
      totalPools: this.connections.size,
      totalConnections: Array.from(this.connections.values()).reduce((sum, pool) => sum + pool.length, 0),
      poolDetails,
    };
  }

  /**
   * Clean up expired connections
   */
  async cleanup(): Promise<void> {
    const now = new Date();
    let cleanedCount = 0;

    for (const [poolKey, pool] of this.connections.entries()) {
      const originalLength = pool.length;

      // Remove expired or unhealthy connections
      const validConnections = pool.filter(connection => {
        const isExpired = now.getTime() - connection.lastUsedAt.getTime() > this.config.maxIdleTime;
        const shouldRemove = isExpired || !connection.isHealthy;

        if (shouldRemove) {
          // Dispose of the provider
          connection.provider.dispose().catch(error => {
            logError('Error disposing connection during cleanup', {
              component: 'ConnectionPool',
              error: error instanceof Error ? error.message : String(error),
            });
          });
        }

        return !shouldRemove;
      });

      this.connections.set(poolKey, validConnections);
      cleanedCount += originalLength - validConnections.length;
    }

    if (cleanedCount > 0) {
      logInfo('Connection pool cleanup completed', {
        component: 'ConnectionPool',
        connectionsCleaned: cleanedCount,
      });
    }
  }

  /**
    * Dispose of all connections in the pool
    */
   async dispose(): Promise<void> {
     // Stop health check interval first
     this.stopHealthCheckInterval();

     const disposePromises = [];

     for (const pool of this.connections.values()) {
       for (const connection of pool) {
         disposePromises.push(connection.provider.dispose());
       }
     }

     await Promise.all(disposePromises);
     this.connections.clear();

     logInfo('Connection pool disposed', {
       component: 'ConnectionPool',
     });
   }

  private async createProvider(
    providerType: ProviderType,
    config: IProviderConfig
  ): Promise<ILLMProvider> {
    // Import dynamically to avoid circular dependencies
    const { LLMProviderFactory } = await import('../LLMProviderFactory');

    // Create config with connection pooling disabled to prevent infinite recursion
    // The pooled providers should be "raw" providers that just make API calls
    const poolConfig = {
      ...config,
      features: {
        ...config.features,
        performance: {
          ...config.features?.performance,
          enableConnectionPooling: false, // Disable pooling for pooled providers
        }
      }
    };

    return LLMProviderFactory.createProvider(providerType, poolConfig);
  }

  private isConnectionValid(connection: PooledConnection): boolean {
    const now = new Date();
    const idleTime = now.getTime() - connection.lastUsedAt.getTime();
    return idleTime < this.config.maxIdleTime;
  }

  private async waitForAvailableConnection(pool: PooledConnection[]): Promise<ILLMProvider> {
    // Simple implementation - in production you might want to use a proper queue
    const maxWaitTime = 30000; // 30 seconds
    const checkInterval = 1000; // 1 second
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      // Check for healthy connection
      for (const connection of pool) {
        if (connection.isHealthy && this.isConnectionValid(connection)) {
          connection.lastUsedAt = new Date();
          connection.usageCount++;
          return connection.provider;
        }
      }

      // Wait before checking again
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    throw new Error('Timeout waiting for available connection in pool');
  }

  private getPoolKey(providerType: ProviderType, config: IProviderConfig): string {
    const configHash = this.hashConfig(config);
    return `${providerType}:${configHash}`;
  }

  private parsePoolKey(poolKey: string): { providerType: ProviderType; configHash: string } {
    const [providerTypeStr, configHash] = poolKey.split(':');
    return {
      providerType: providerTypeStr as ProviderType,
      configHash,
    };
  }

  private hashConfig(config: IProviderConfig): string {
    // Simple hash of config properties
    const configStr = JSON.stringify({
      apiKey: config.apiKey ? '***' : '',
      baseUrl: config.baseUrl,
      model: config.model,
      options: config.options,
    });

    let hash = 0;
    for (let i = 0; i < configStr.length; i++) {
      const char = configStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private startHealthCheckInterval(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthChecks();
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop the health check interval
   */
  public stopHealthCheckInterval(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
      logInfo('Stopped health check interval', {
        component: 'ConnectionPool',
      });
    }
  }

  /**
   * Check if running in test environment
   */
  private isTestEnvironment(): boolean {
    // Check for Jest test environment
    return typeof jest !== 'undefined' ||
           process.env.JEST_WORKER_ID !== undefined ||
           process.env.NODE_ENV === 'test' ||
           (typeof globalThis !== 'undefined' && (globalThis as any).__JEST__ === true);
  }

  /**
   * Manually start the health check interval (for testing or when explicitly needed)
   */
  public startHealthCheckIntervalManual(): void {
    if (!this.healthCheckTimer) {
      this.startHealthCheckInterval();
    }
  }

  private async performHealthChecks(): Promise<void> {
    for (const [poolKey, pool] of this.connections.entries()) {
      for (const connection of pool) {
        try {
          connection.isHealthy = await connection.provider.isHealthy();
        } catch (error) {
          logError('Health check failed for connection', {
            component: 'ConnectionPool',
            poolKey,
            error: error instanceof Error ? error.message : String(error),
          });
          connection.isHealthy = false;
        }
      }
    }
  }
}

// Global connection pool instance
// In test environment, create instance but don't start health check interval
export const globalConnectionPool = new ConnectionPool();

/**
 * Cleanup function for the global connection pool
 * Stops the health check interval to prevent Jest from hanging
 */
export function cleanupGlobalConnectionPool(): void {
  globalConnectionPool.stopHealthCheckInterval();
}