/**
 * StateManager - Namespace-aware Memory State Management
 *
 * This class provides comprehensive state management functionality for memory processing,
 * wrapping the existing MemoryProcessingStateManager with namespace support and
 * integration with DatabaseContext for database operations.
 */

import {
  ProcessingStateManager,
  MemoryProcessingState,
  MemoryStateTransition,
} from '../../domain/memory/MemoryProcessingStateManager';
import { logInfo, logError, logDebug } from '../config/Logger';
import { DatabaseContext } from './DatabaseContext';

// Re-export for convenience
export { MemoryProcessingState } from '../../domain/memory/MemoryProcessingStateManager';

/**
 * Configuration interface for StateManager
 */
export interface StateManagerConfig {
  enableHistoryTracking?: boolean;
  enableMetrics?: boolean;
  maxHistoryEntries?: number;
}

/**
 * State statistics interface
 */
export interface StateStatistics {
  total: number;
  byState: Record<MemoryProcessingState, number>;
  recentTransitions: number;
  averageTransitionTime: number;
}

/**
 * Namespace-aware state manager for memory processing workflows
 */
export class StateManager {
  private stateManager: ProcessingStateManager;
  private databaseContext: DatabaseContext;

  constructor(
    databaseContext: DatabaseContext,
    config: StateManagerConfig = {},
  ) {
    this.databaseContext = databaseContext;

    // Initialize the underlying state manager with configuration
    this.stateManager = new ProcessingStateManager({
      enableHistoryTracking: config.enableHistoryTracking ?? true,
      enableMetrics: config.enableMetrics ?? true,
      maxHistoryEntries: config.maxHistoryEntries ?? 100,
    });

    logInfo('StateManager initialized with namespace support', {
      component: 'StateManager',
      enableHistoryTracking: config.enableHistoryTracking ?? true,
      enableMetrics: config.enableMetrics ?? true,
      maxHistoryEntries: config.maxHistoryEntries ?? 100,
    });
  }

  /**
   * Get the underlying state manager instance for direct access
   */
  getStateManager(): ProcessingStateManager {
    return this.stateManager;
  }

  /**
   * Get memories by processing state with namespace filtering
   */
  async getMemoriesByState(
    state: MemoryProcessingState,
    namespace: string = 'default',
    limit?: number,
  ): Promise<string[]> {
    try {
      logDebug(`Getting memories by state ${state} in namespace ${namespace}`, {
        component: 'StateManager',
        state,
        namespace,
        limit,
      });

      const memoryIds = this.stateManager.getMemoriesByState(state);

      // Filter by namespace if needed
      if (namespace !== 'default') {
        const filteredIds: string[] = [];
        for (const memoryId of memoryIds) {
          try {
            const memory = await this.databaseContext.getPrismaClient().longTermMemory.findUnique({
              where: { id: memoryId },
              select: { namespace: true },
            });
            if (memory?.namespace === namespace) {
              filteredIds.push(memoryId);
            }
          } catch (error) {
            logError(`Failed to check namespace for memory ${memoryId}`, {
              component: 'StateManager',
              memoryId,
              error: error instanceof Error ? error.message : String(error),
            });
            // Skip memories that can't be found or accessed
          }
        }
        const result = limit ? filteredIds.slice(0, limit) : filteredIds;

        logInfo(`Retrieved ${result.length} memories in state ${state} for namespace ${namespace}`, {
          component: 'StateManager',
          state,
          namespace,
          totalFound: memoryIds.length,
          filteredCount: result.length,
        });

        return result;
      }

      const result = limit ? memoryIds.slice(0, limit) : memoryIds;

      logInfo(`Retrieved ${result.length} memories in state ${state}`, {
        component: 'StateManager',
        state,
        totalFound: memoryIds.length,
        requestedLimit: limit,
      });

      return result;
    } catch (error) {
      logError(`Failed to get memories by state ${state}`, {
        component: 'StateManager',
        state,
        namespace,
        limit,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to get memories by state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get memory processing state
   */
  async getMemoryState(memoryId: string): Promise<MemoryProcessingState | undefined> {
    try {
      const state = this.stateManager.getCurrentState(memoryId);

      logDebug(`Retrieved state for memory ${memoryId}: ${state}`, {
        component: 'StateManager',
        memoryId,
        state,
      });

      return state;
    } catch (error) {
      logError(`Failed to get memory state for ${memoryId}`, {
        component: 'StateManager',
        memoryId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to get memory state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get memory state history
   */
  async getMemoryStateHistory(memoryId: string): Promise<MemoryStateTransition[]> {
    try {
      const history = this.stateManager.getStateHistory(memoryId);

      logDebug(`Retrieved state history for memory ${memoryId}: ${history.length} transitions`, {
        component: 'StateManager',
        memoryId,
        transitionCount: history.length,
      });

      return history;
    } catch (error) {
      logError(`Failed to get state history for memory ${memoryId}`, {
        component: 'StateManager',
        memoryId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to get state history: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Transition memory to new state with validation
   */
  async transitionMemoryState(
    memoryId: string,
    toState: MemoryProcessingState,
    options?: {
      reason?: string;
      metadata?: Record<string, unknown>;
      userId?: string;
      agentId?: string;
      errorMessage?: string;
      force?: boolean;
    },
  ): Promise<boolean> {
    try {
      const success = await this.stateManager.transitionToState(memoryId, toState, options);

      if (success) {
        logInfo(`Successfully transitioned memory ${memoryId} to state ${toState}`, {
          component: 'StateManager',
          memoryId,
          toState,
          reason: options?.reason,
          agentId: options?.agentId,
        });
      } else {
        logError(`Failed to transition memory ${memoryId} to state ${toState}`, {
          component: 'StateManager',
          memoryId,
          toState,
          options,
        });
      }

      return success;
    } catch (error) {
      logError(`Failed to transition memory ${memoryId} to state ${toState}`, {
        component: 'StateManager',
        memoryId,
        toState,
        options,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to transition memory state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get processing state statistics with namespace filtering
   */
  async getProcessingStateStats(namespace?: string): Promise<Record<MemoryProcessingState, number>> {
    try {
      const stats = this.stateManager.getStateStatistics();

      logDebug('Retrieved processing state statistics', {
        component: 'StateManager',
        stats,
        namespace,
      });

      // If namespace filter is provided, we need to count only memories in that namespace
      if (namespace && namespace !== 'default') {
        const filteredStats: Record<MemoryProcessingState, number> = {} as Record<MemoryProcessingState, number>;
        Object.values(MemoryProcessingState).forEach(state => {
          filteredStats[state] = 0;
        });

        // Get all memory IDs for each state and filter by namespace
        for (const state of Object.values(MemoryProcessingState)) {
          const memoryIds = this.stateManager.getMemoriesByState(state);
          for (const memoryId of memoryIds) {
            try {
              const memory = await this.databaseContext.getPrismaClient().longTermMemory.findUnique({
                where: { id: memoryId },
                select: { namespace: true },
              });
              if (memory?.namespace === namespace) {
                filteredStats[state]++;
              }
            } catch {
              // Skip memories that can't be found
            }
          }
        }

        logInfo(`Retrieved filtered processing state statistics for namespace ${namespace}`, {
          component: 'StateManager',
          namespace,
          filteredStats,
        });

        return filteredStats;
      }

      logInfo('Retrieved processing state statistics', {
        component: 'StateManager',
        stats,
      });

      return stats;
    } catch (error) {
      logError('Failed to get processing state statistics', {
        component: 'StateManager',
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to get processing state statistics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Initialize memory state (for existing memories without state tracking)
   */
  async initializeExistingMemoryState(
    memoryId: string,
    initialState: MemoryProcessingState = MemoryProcessingState.PENDING,
  ): Promise<void> {
    try {
      await this.stateManager.initializeMemoryState(memoryId, initialState);

      logInfo(`Initialized existing memory state for ${memoryId}`, {
        component: 'StateManager',
        memoryId,
        initialState,
      });
    } catch (error) {
      logError(`Failed to initialize existing memory state for ${memoryId}`, {
        component: 'StateManager',
        memoryId,
        initialState,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to initialize existing memory state: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get all memory states
   */
  async getAllMemoryStates(): Promise<Record<string, MemoryProcessingState>> {
    try {
      const states = this.stateManager.getAllMemoryStates();

      logDebug(`Retrieved all memory states: ${Object.keys(states).length} memories`, {
        component: 'StateManager',
        memoryCount: Object.keys(states).length,
      });

      return states;
    } catch (error) {
      logError('Failed to get all memory states', {
        component: 'StateManager',
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to get all memory states: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if memory can transition to specific state
   */
  async canMemoryTransitionTo(memoryId: string, toState: MemoryProcessingState): Promise<boolean> {
    try {
      const canTransition = this.stateManager.canTransitionTo(memoryId, toState);

      logDebug(`Checked transition possibility for memory ${memoryId} to ${toState}: ${canTransition}`, {
        component: 'StateManager',
        memoryId,
        toState,
        canTransition,
      });

      return canTransition;
    } catch (error) {
      logError(`Failed to check transition possibility for memory ${memoryId}`, {
        component: 'StateManager',
        memoryId,
        toState,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to check transition possibility: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Retry failed memory state transition
   */
  async retryMemoryStateTransition(
    memoryId: string,
    targetState: MemoryProcessingState,
    options?: { maxRetries?: number; delayMs?: number },
  ): Promise<boolean> {
    try {
      const success = await this.stateManager.retryTransition(memoryId, targetState, options);

      logInfo(`Retry transition ${success ? 'succeeded' : 'failed'} for memory ${memoryId} to ${targetState}`, {
        component: 'StateManager',
        memoryId,
        targetState,
        success,
        maxRetries: options?.maxRetries,
      });

      return success;
    } catch (error) {
      logError(`Failed to retry transition for memory ${memoryId}`, {
        component: 'StateManager',
        memoryId,
        targetState,
        options,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to retry transition: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get processing metrics
   */
  async getProcessingMetrics(): Promise<Record<string, number>> {
    try {
      const metrics = this.stateManager.getMetrics();

      logDebug('Retrieved processing metrics', {
        component: 'StateManager',
        metrics,
      });

      return metrics;
    } catch (error) {
      logError('Failed to get processing metrics', {
        component: 'StateManager',
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to get processing metrics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get comprehensive state statistics for a namespace
   */
  async getStateStatistics(namespace?: string): Promise<StateStatistics> {
    try {
      const stateCounts = await this.getProcessingStateStats(namespace);
      const metrics = await this.getProcessingMetrics();

      // Calculate additional statistics
      const total = Object.values(stateCounts).reduce((sum, count) => sum + count, 0);
      const recentTransitions = metrics['PENDING_TO_PROCESSING'] || 0;
      const averageTransitionTime = this.calculateAverageTransitionTime(metrics);

      const statistics: StateStatistics = {
        total,
        byState: stateCounts,
        recentTransitions,
        averageTransitionTime,
      };

      logInfo(`Retrieved comprehensive state statistics for namespace ${namespace || 'all'}`, {
        component: 'StateManager',
        namespace,
        ...statistics,
      });

      return statistics;
    } catch (error) {
      logError('Failed to get state statistics', {
        component: 'StateManager',
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to get state statistics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get memories in multiple states with namespace filtering
   */
  async getMemoriesByStates(
    states: MemoryProcessingState[],
    namespace: string = 'default',
    limit?: number,
  ): Promise<Record<MemoryProcessingState, string[]>> {
    try {
      const result: Record<MemoryProcessingState, string[]> = {} as Record<MemoryProcessingState, string[]>;

      // Initialize result object
      states.forEach(state => {
        result[state] = [];
      });

      // Get memories for each state
      for (const state of states) {
        result[state] = await this.getMemoriesByState(state, namespace, limit);
      }

      logInfo(`Retrieved memories for ${states.length} states in namespace ${namespace}`, {
        component: 'StateManager',
        namespace,
        states,
        resultCounts: Object.fromEntries(
          Object.entries(result).map(([state, ids]) => [state, ids.length]),
        ),
      });

      return result;
    } catch (error) {
      logError('Failed to get memories by multiple states', {
        component: 'StateManager',
        states,
        namespace,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(`Failed to get memories by states: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clean up state tracking for deleted memories
   */
  async cleanupOrphanedStates(memoryIds: string[]): Promise<{ cleaned: number; errors: string[] }> {
    const errors: string[] = [];
    let cleaned = 0;

    try {
      logInfo(`Cleaning up state tracking for ${memoryIds.length} memories`, {
        component: 'StateManager',
        memoryCount: memoryIds.length,
      });

      for (const memoryId of memoryIds) {
        try {
          // Check if memory exists in database
          const memory = await this.databaseContext.getPrismaClient().longTermMemory.findUnique({
            where: { id: memoryId },
            select: { id: true },
          });
          if (!memory) {
            // Memory doesn't exist, clean up state
            const wasDeleted = this.stateManager.clearMemoryState(memoryId);
            if (wasDeleted) {
              cleaned++;
              logDebug(`Cleaned up orphaned state for memory ${memoryId}`, {
                component: 'StateManager',
                memoryId,
              });
            }
          }
        } catch (error) {
          const errorMsg = `Failed to cleanup state for memory ${memoryId}: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          logError(errorMsg, {
            component: 'StateManager',
            memoryId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      logInfo(`State cleanup completed: ${cleaned} cleaned, ${errors.length} errors`, {
        component: 'StateManager',
        cleaned,
        errors: errors.length,
      });

      return { cleaned, errors };
    } catch (error) {
      const errorMsg = `Failed to cleanup orphaned states: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      logError(errorMsg, {
        component: 'StateManager',
        error: error instanceof Error ? error.message : String(error),
      });
      return { cleaned, errors };
    }
  }

  /**
   * Helper method to calculate average transition time from metrics
   */
  private calculateAverageTransitionTime(metrics: Record<string, number>): number {
    const transitionKeys = Object.keys(metrics).filter(key => key.includes('_TO_'));
    if (transitionKeys.length === 0) return 0;

    const totalTransitions = transitionKeys.reduce((sum, key) => sum + metrics[key], 0);
    return totalTransitions > 0 ? totalTransitions / transitionKeys.length : 0;
  }



}