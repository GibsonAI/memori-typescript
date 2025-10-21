import { SearchStrategy, SearchStrategyConfig } from './types';
import { SearchConfigurationError } from './SearchStrategy';
import { logError, logWarn, logInfo } from '../../infrastructure/config/Logger';

/**
 * Configuration management module for search operations
 * Extracted from SearchService to improve maintainability and separation of concerns
 */

// ===== CONFIGURATION INTERFACES =====

/**
 * Configuration change listener type
 */
export type ConfigurationChangeListener = (
    oldConfig: SearchStrategyConfig,
    newConfig: SearchStrategyConfig
) => void;

/**
 * Configuration update state
 */
export interface ConfigurationUpdateState {
    isUpdating: boolean;
    lastUpdateAttempt: Date | null;
    lastUpdateSuccess: Date | null;
    updateHistory: ConfigurationUpdateRecord[];
    rollbackInProgress: boolean;
}

/**
 * Configuration update record
 */
export interface ConfigurationUpdateRecord {
    timestamp: Date;
    strategyName: string;
    action: 'update' | 'rollback' | 'failed';
    oldConfig?: SearchStrategyConfig;
    newConfig?: SearchStrategyConfig;
    error?: string;
    success: boolean;
}

/**
 * Configuration manager class for handling search strategy configurations
 */
export class SearchConfigurationManager {
    private changeListeners: Map<string, ConfigurationChangeListener[]> = new Map();
    private updateState: ConfigurationUpdateState;
    private readonly maxUpdateHistorySize = 100;

    constructor() {
        this.updateState = {
            isUpdating: false,
            lastUpdateAttempt: null,
            lastUpdateSuccess: null,
            updateHistory: [],
            rollbackInProgress: false,
        };
    }

    /**
     * Update strategy configuration at runtime
     */
    async updateStrategyConfiguration(
        strategyName: string,
        config: Partial<SearchStrategyConfig>,
    ): Promise<void> {
        const updateStartTime = Date.now();

        if (this.updateState.isUpdating) {
            throw new SearchConfigurationError(
                `Configuration update already in progress for ${strategyName}`,
                'runtime_config_update',
                { strategyName, timestamp: new Date() },
            );
        }

        this.updateState.isUpdating = true;
        this.updateState.lastUpdateAttempt = new Date();

        try {
            // Load current configuration
            const currentConfig = await this.loadConfiguration(strategyName);
            if (!currentConfig) {
                throw new SearchConfigurationError(
                    `No configuration found for strategy: ${strategyName}`,
                    'config_not_found',
                    { strategyName },
                );
            }

            // Merge configurations
            const updatedConfig = this.mergeConfigurations(currentConfig, config);

            // Validate the updated configuration
            const validation = await this.validateConfiguration(updatedConfig);
            if (!validation.isValid) {
                throw new SearchConfigurationError(
                    `Invalid configuration for ${strategyName}: ${validation.errors.join(', ')}`,
                    'validation_failed',
                    { strategyName, errors: validation.errors, warnings: validation.warnings },
                );
            }

            // Create backup before applying changes
            await this.createConfigurationBackup(strategyName);

            // Apply configuration to running strategy
            await this.applyConfigurationToStrategy(strategyName as SearchStrategy, updatedConfig);

            // Save the updated configuration
            await this.saveConfiguration(strategyName, updatedConfig);

            // Update cached configuration
            this.updateCachedConfiguration(strategyName, updatedConfig);

            // Record successful update
            this.updateState.lastUpdateSuccess = new Date();
            this.recordConfigurationUpdate({
                timestamp: new Date(),
                strategyName,
                action: 'update',
                oldConfig: currentConfig,
                newConfig: updatedConfig,
                success: true,
            });

            // Notify listeners
            this.notifyConfigurationChange(strategyName, currentConfig, updatedConfig);

            const updateDuration = Date.now() - updateStartTime;
            logInfo(`Configuration updated for ${strategyName} in ${updateDuration}ms`, {
                component: 'SearchConfigurationManager',
                operation: 'updateStrategyConfiguration',
                strategyName,
                updateDuration
            });

        } catch (error) {
            this.recordConfigurationUpdate({
                timestamp: new Date(),
                strategyName,
                action: 'failed',
                error: error instanceof Error ? error.message : String(error),
                success: false,
            });

            throw new SearchConfigurationError(
                `Failed to update configuration for ${strategyName}: ${error instanceof Error ? error.message : String(error)}`,
                'update_failed',
                {
                    strategyName,
                    updateDuration: Date.now() - updateStartTime,
                    timestamp: new Date(),
                    originalError: error instanceof Error ? error.message : String(error),
                },
            );
        } finally {
            this.updateState.isUpdating = false;
        }
    }

    /**
     * Load configuration for a strategy
     */
    async loadConfiguration(strategyName: string): Promise<SearchStrategyConfig | null> {
        // This would typically load from a configuration file or database
        // For now, return null to indicate no configuration found
        return null;
    }

    /**
     * Save configuration for a strategy
     */
    async saveConfiguration(strategyName: string, config: SearchStrategyConfig): Promise<void> {
        // This would typically save to a configuration file or database
        logInfo(`Saving configuration for ${strategyName}`, {
            component: 'SearchConfigurationManager',
            operation: 'saveConfiguration',
            strategyName
        });
    }

    /**
     * Get default configuration for a strategy
     */
    getDefaultConfiguration(strategyName: string): SearchStrategyConfig {
        // Return default configuration based on strategy type
        const baseConfig: SearchStrategyConfig = {
            strategyName: strategyName as SearchStrategy,
            enabled: true,
            priority: 5,
            timeout: 5000,
            maxResults: 100,
            performance: {
                enableMetrics: true,
                enableCaching: true,
                cacheSize: 100,
                enableParallelExecution: true,
            },
            scoring: {
                baseWeight: 0.5,
                recencyWeight: 0.3,
                importanceWeight: 0.2,
                relationshipWeight: 0.1,
            },
        };

        // Strategy-specific defaults
        switch (strategyName) {
            case SearchStrategy.FTS5:
                return {
                    ...baseConfig,
                    priority: 10,
                    timeout: 10000,
                    maxResults: 1000,
                    strategySpecific: {
                        bm25Weights: {
                            title: 2.0,
                            content: 1.0,
                            category: 1.5,
                        },
                        queryTimeout: 10000,
                        resultBatchSize: 100,
                    },
                };
            case SearchStrategy.LIKE:
                return {
                    ...baseConfig,
                    priority: 3,
                    timeout: 3000,
                    strategySpecific: {
                        wildcardSensitivity: 0.8,
                        maxWildcardTerms: 5,
                        enablePhraseSearch: true,
                        caseSensitive: false,
                    },
                };
            case SearchStrategy.RECENT:
                return {
                    ...baseConfig,
                    priority: 2,
                    timeout: 2000,
                    maxResults: 50,
                    strategySpecific: {
                        timeWindows: {
                            immediate: 300000, // 5 minutes
                            short: 3600000,    // 1 hour
                            medium: 86400000,  // 24 hours
                        },
                        maxAge: 2592000000, // 30 days
                    },
                };
            default:
                return baseConfig;
        }
    }

    /**
     * Validate configuration
     */
    async validateConfiguration(config: SearchStrategyConfig): Promise<{
        isValid: boolean;
        errors: string[];
        warnings: string[];
    }> {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Basic validation
        if (!config.strategyName) {
            errors.push('Strategy name is required');
        }

        if (config.priority !== undefined && (config.priority < 0 || config.priority > 100)) {
            errors.push('Priority must be between 0 and 100');
        }

        if (config.timeout !== undefined && (config.timeout < 1000 || config.timeout > 30000)) {
            errors.push('Timeout must be between 1000ms and 30000ms');
        }

        if (config.maxResults !== undefined && (config.maxResults < 1 || config.maxResults > 1000)) {
            errors.push('Max results must be between 1 and 1000');
        }

        // Strategy-specific validation
        if (config.strategyName === SearchStrategy.FTS5) {
            const ftsConfig = config.strategySpecific as any;
            if (ftsConfig?.bm25Weights) {
                const weights = ftsConfig.bm25Weights;
                if (weights.title < 0 || weights.content < 0 || weights.category < 0) {
                    errors.push('BM25 weights must be non-negative');
                }
            }
        }

        return {
            isValid: errors.length === 0,
            errors,
            warnings,
        };
    }

    /**
     * Merge two configurations
     */
    mergeConfigurations(
        baseConfig: SearchStrategyConfig,
        updates: Partial<SearchStrategyConfig>,
    ): SearchStrategyConfig {
        const merged = { ...baseConfig };

        // Merge top-level properties
        Object.assign(merged, updates);

        // Deep merge strategy-specific configuration
        if (updates.strategySpecific && baseConfig.strategySpecific) {
            merged.strategySpecific = {
                ...baseConfig.strategySpecific,
                ...updates.strategySpecific,
            };
        } else if (updates.strategySpecific) {
            merged.strategySpecific = { ...updates.strategySpecific };
        }

        // Deep merge scoring configuration
        if (updates.scoring && baseConfig.scoring) {
            merged.scoring = {
                ...baseConfig.scoring,
                ...updates.scoring,
            };
        } else if (updates.scoring) {
            merged.scoring = { ...updates.scoring };
        }

        return merged;
    }

    /**
     * Apply configuration to a running strategy (placeholder)
     */
    private async applyConfigurationToStrategy(
        strategyName: SearchStrategy,
        config: SearchStrategyConfig,
    ): Promise<void> {
        // This would apply the configuration to a running strategy instance
        logInfo(`Applying configuration to strategy ${strategyName}`, {
            component: 'SearchConfigurationManager',
            operation: 'applyConfigurationToStrategy',
            strategyName
        });
    }

    /**
     * Create backup of current configuration
     */
    private async createConfigurationBackup(strategyName: string): Promise<void> {
        try {
            // This would create a backup of the current configuration
            logInfo(`Creating backup for strategy ${strategyName}`, {
                component: 'SearchConfigurationManager',
                operation: 'createConfigurationBackup',
                strategyName
            });
        } catch (error) {
            logWarn(`Failed to create configuration backup for ${strategyName}`, {
                component: 'SearchConfigurationManager',
                operation: 'createConfigurationBackup',
                strategyName,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    /**
     * Update cached configuration (placeholder)
     */
    private updateCachedConfiguration(strategyName: string, config: SearchStrategyConfig): void {
        // This would update any cached configuration
        logInfo(`Updating cached configuration for ${strategyName}`, {
            component: 'SearchConfigurationManager',
            operation: 'updateCachedConfiguration',
            strategyName
        });
    }

    /**
     * Register a listener for configuration changes
     */
    onConfigurationChange(strategyName: string, listener: ConfigurationChangeListener): void {
        if (!this.changeListeners.has(strategyName)) {
            this.changeListeners.set(strategyName, []);
        }
        this.changeListeners.get(strategyName)!.push(listener);
    }

    /**
     * Remove a configuration change listener
     */
    offConfigurationChange(strategyName: string, listener: ConfigurationChangeListener): void {
        const listeners = this.changeListeners.get(strategyName);
        if (listeners) {
            const index = listeners.indexOf(listener);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    /**
     * Notify all listeners of a configuration change
     */
    private notifyConfigurationChange(
        strategyName: string,
        oldConfig: SearchStrategyConfig,
        newConfig: SearchStrategyConfig,
    ): void {
        const listeners = this.changeListeners.get(strategyName) || [];
        listeners.forEach(listener => {
            try {
                listener(oldConfig, newConfig);
            } catch (error) {
                logError(`Configuration change listener error for ${strategyName}`, {
                    component: 'SearchConfigurationManager',
                    operation: 'notifyConfigurationChange',
                    strategyName,
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        });
    }

    /**
     * Get configuration update history
     */
    getConfigurationUpdateHistory(strategyName?: string): ConfigurationUpdateRecord[] {
        if (strategyName) {
            return this.updateState.updateHistory.filter(
                record => record.strategyName === strategyName,
            );
        }
        return this.updateState.updateHistory;
    }

    /**
     * Get current configuration update state
     */
    getConfigurationUpdateState(): ConfigurationUpdateState {
        return {
            ...this.updateState,
            updateHistory: [...this.updateState.updateHistory],
        };
    }

    /**
     * Record a configuration update in history
     */
    private recordConfigurationUpdate(record: ConfigurationUpdateRecord): void {
        this.updateState.updateHistory.unshift(record);

        if (this.updateState.updateHistory.length > this.maxUpdateHistorySize) {
            this.updateState.updateHistory = this.updateState.updateHistory.slice(0, this.maxUpdateHistorySize);
        }
    }

    /**
     * Rollback configuration to previous version
     */
    async rollbackConfiguration(strategyName: string): Promise<void> {
        if (this.updateState.rollbackInProgress) {
            throw new SearchConfigurationError(
                `Rollback already in progress for ${strategyName}`,
                'rollback_in_progress',
                { strategyName },
            );
        }

        this.updateState.rollbackInProgress = true;

        try {
            const lastUpdate = this.updateState.updateHistory
                .filter(record => record.strategyName === strategyName && record.action === 'update' && record.success)
                .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())[0];

            if (!lastUpdate || !lastUpdate.oldConfig) {
                throw new SearchConfigurationError(
                    `No previous configuration found for rollback: ${strategyName}`,
                    'no_rollback_available',
                    { strategyName },
                );
            }

            await this.updateStrategyConfiguration(strategyName, lastUpdate.oldConfig);

            this.recordConfigurationUpdate({
                timestamp: new Date(),
                strategyName,
                action: 'rollback',
                oldConfig: lastUpdate.newConfig,
                newConfig: lastUpdate.oldConfig,
                success: true,
            });

            logInfo(`Configuration rolled back for ${strategyName}`, {
                component: 'SearchConfigurationManager',
                operation: 'rollbackConfiguration',
                strategyName
            });

        } catch (error) {
            this.recordConfigurationUpdate({
                timestamp: new Date(),
                strategyName,
                action: 'rollback',
                error: error instanceof Error ? error.message : String(error),
                success: false,
            });

            throw new SearchConfigurationError(
                `Failed to rollback configuration for ${strategyName}: ${error instanceof Error ? error.message : String(error)}`,
                'rollback_failed',
                {
                    strategyName,
                    originalError: error instanceof Error ? error.message : String(error),
                },
            );
        } finally {
            this.updateState.rollbackInProgress = false;
        }
    }

    /**
     * Get strategy backups (placeholder)
     */
    async getStrategyBackups(strategyName: string): Promise<string[]> {
        // This would return available backups for a strategy
        return [];
    }
}