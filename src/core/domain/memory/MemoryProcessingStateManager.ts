/**
 * Memory Processing State Management System
 *
 * This module provides comprehensive state tracking for memory processing workflows,
 * including state transitions, validation, and history tracking.
 */

import { logInfo, logError, logDebug } from '../../infrastructure/config/Logger';

// Memory Processing States
export enum MemoryProcessingState {
  // Initial state when memory is created
  PENDING = 'PENDING',

  // Memory is being processed by MemoryAgent
  PROCESSING = 'PROCESSING',

  // Memory processing completed successfully
  PROCESSED = 'PROCESSED',

  // Memory queued for conscious processing
  CONSCIOUS_PENDING = 'CONSCIOUS_PENDING',

  // Memory being processed by ConsciousAgent
  CONSCIOUS_PROCESSING = 'CONSCIOUS_PROCESSING',

  // Conscious processing completed
  CONSCIOUS_PROCESSED = 'CONSCIOUS_PROCESSED',

  // Memory queued for duplicate detection
  DUPLICATE_CHECK_PENDING = 'DUPLICATE_CHECK_PENDING',

  // Memory being checked for duplicates
  DUPLICATE_CHECK_PROCESSING = 'DUPLICATE_CHECK_PROCESSING',

  // Duplicate check completed
  DUPLICATE_CHECKED = 'DUPLICATE_CHECKED',

  // Memory marked for consolidation
  CONSOLIDATION_PENDING = 'CONSOLIDATION_PENDING',

  // Memory being consolidated
  CONSOLIDATION_PROCESSING = 'CONSOLIDATION_PROCESSING',

  // Consolidation completed
  CONSOLIDATED = 'CONSOLIDATED',

  // Memory processing failed with error
  FAILED = 'FAILED',

  // Memory marked for deletion/cleanup
  CLEANUP_PENDING = 'CLEANUP_PENDING',

  // Memory being cleaned up
  CLEANUP_PROCESSING = 'CLEANUP_PROCESSING',

  // Memory cleanup completed
  CLEANED = 'CLEANED'
}

// Valid state transitions
export const VALID_STATE_TRANSITIONS: Record<MemoryProcessingState, MemoryProcessingState[]> = {
  [MemoryProcessingState.PENDING]: [
    MemoryProcessingState.PROCESSING,
    MemoryProcessingState.FAILED,
  ],
  [MemoryProcessingState.PROCESSING]: [
    MemoryProcessingState.PROCESSED,
    MemoryProcessingState.FAILED,
  ],
  [MemoryProcessingState.PROCESSED]: [
    MemoryProcessingState.CONSCIOUS_PENDING,
    MemoryProcessingState.DUPLICATE_CHECK_PENDING,
    MemoryProcessingState.FAILED,
  ],
  [MemoryProcessingState.CONSCIOUS_PENDING]: [
    MemoryProcessingState.CONSCIOUS_PROCESSING,
    MemoryProcessingState.FAILED,
  ],
  [MemoryProcessingState.CONSCIOUS_PROCESSING]: [
    MemoryProcessingState.CONSCIOUS_PROCESSED,
    MemoryProcessingState.FAILED,
  ],
  [MemoryProcessingState.CONSCIOUS_PROCESSED]: [
    MemoryProcessingState.DUPLICATE_CHECK_PENDING,
    MemoryProcessingState.CONSOLIDATION_PENDING,
  ],
  [MemoryProcessingState.DUPLICATE_CHECK_PENDING]: [
    MemoryProcessingState.DUPLICATE_CHECK_PROCESSING,
    MemoryProcessingState.FAILED,
  ],
  [MemoryProcessingState.DUPLICATE_CHECK_PROCESSING]: [
    MemoryProcessingState.DUPLICATE_CHECKED,
    MemoryProcessingState.FAILED,
  ],
  [MemoryProcessingState.DUPLICATE_CHECKED]: [
    MemoryProcessingState.CONSOLIDATION_PENDING,
    MemoryProcessingState.PROCESSED, // Allow return to processed if no duplicates
  ],
  [MemoryProcessingState.CONSOLIDATION_PENDING]: [
    MemoryProcessingState.CONSOLIDATION_PROCESSING,
    MemoryProcessingState.FAILED,
  ],
  [MemoryProcessingState.CONSOLIDATION_PROCESSING]: [
    MemoryProcessingState.CONSOLIDATED,
    MemoryProcessingState.FAILED,
  ],
  [MemoryProcessingState.CONSOLIDATED]: [
    MemoryProcessingState.CLEANUP_PENDING,
  ],
  [MemoryProcessingState.CLEANUP_PENDING]: [
    MemoryProcessingState.CLEANUP_PROCESSING,
    MemoryProcessingState.FAILED,
  ],
  [MemoryProcessingState.CLEANUP_PROCESSING]: [
    MemoryProcessingState.CLEANED,
    MemoryProcessingState.FAILED,
  ],
  [MemoryProcessingState.CLEANED]: [], // Terminal state
  [MemoryProcessingState.FAILED]: [
    MemoryProcessingState.PENDING, // Allow retry
    MemoryProcessingState.CLEANUP_PENDING,
  ],
};

// State transition interface
export interface MemoryStateTransition {
  id: string;
  memoryId: string;
  fromState: MemoryProcessingState;
  toState: MemoryProcessingState;
  timestamp: Date;
  reason?: string;
  metadata?: Record<string, unknown>;
  userId?: string;
  agentId?: string;
  errorMessage?: string;
  processingTimeMs?: number;
}

// State history interface
export interface MemoryProcessingHistory {
  memoryId: string;
  currentState: MemoryProcessingState;
  transitions: MemoryStateTransition[];
  createdAt: Date;
  updatedAt: Date;
}

// State validation result
export interface StateTransitionValidation {
  isValid: boolean;
  error?: string;
  warning?: string;
  suggestedState?: MemoryProcessingState;
}

// State manager configuration
export interface ProcessingStateManagerConfig {
  enableHistoryTracking?: boolean;
  maxHistoryEntries?: number;
  enableMetrics?: boolean;
  retryAttempts?: number;
  retryDelayMs?: number;
}

/**
 * Centralized state manager for memory processing workflows
 */
export class ProcessingStateManager {
  private memoryStates = new Map<string, MemoryProcessingState>();
  private stateHistory = new Map<string, MemoryStateTransition[]>();
  private config: Required<ProcessingStateManagerConfig>;
  private metrics = new Map<string, number>();

  constructor(config: ProcessingStateManagerConfig = {}) {
    this.config = {
      enableHistoryTracking: config.enableHistoryTracking ?? true,
      maxHistoryEntries: config.maxHistoryEntries ?? 100,
      enableMetrics: config.enableMetrics ?? true,
      retryAttempts: config.retryAttempts ?? 3,
      retryDelayMs: config.retryDelayMs ?? 1000,
      ...config,
    };
  }

  /**
   * Initialize memory state
   */
  async initializeMemoryState(
    memoryId: string,
    initialState: MemoryProcessingState = MemoryProcessingState.PENDING,
  ): Promise<void> {
    if (this.memoryStates.has(memoryId)) {
      logDebug(`Memory ${memoryId} already initialized with state ${this.memoryStates.get(memoryId)}`, {
        component: 'ProcessingStateManager',
        memoryId,
        existingState: this.memoryStates.get(memoryId),
        requestedState: initialState,
      });
      return;
    }

    this.memoryStates.set(memoryId, initialState);

    if (this.config.enableHistoryTracking) {
      const transition: MemoryStateTransition = {
        id: this.generateTransitionId(),
        memoryId,
        fromState: MemoryProcessingState.PENDING, // Special case for initialization
        toState: initialState,
        timestamp: new Date(),
        reason: 'Memory state initialized',
      };

      this.addTransitionToHistory(memoryId, transition);
    }

    logInfo(`Initialized memory ${memoryId} with state ${initialState}`, {
      component: 'ProcessingStateManager',
      memoryId,
      initialState,
    });
  }

  /**
   * Get current state of a memory
   */
  getCurrentState(memoryId: string): MemoryProcessingState | undefined {
    return this.memoryStates.get(memoryId);
  }

  /**
   * Validate state transition
   */
  validateTransition(
    memoryId: string,
    toState: MemoryProcessingState,
    _reason?: string,
  ): StateTransitionValidation {
    const currentState = this.memoryStates.get(memoryId);

    if (!currentState) {
      return {
        isValid: false,
        error: `Memory ${memoryId} not found. Initialize state first.`,
      };
    }

    const validTransitions = VALID_STATE_TRANSITIONS[currentState];

    if (!validTransitions.includes(toState)) {
      // Check if this is a self-transition (same state)
      if (currentState === toState) {
        return {
          isValid: true,
          warning: `Redundant transition to same state ${toState}`,
        };
      }

      // Suggest closest valid state
      const suggestedState = this.findClosestValidState(currentState, toState);

      return {
        isValid: false,
        error: `Invalid transition from ${currentState} to ${toState}`,
        suggestedState,
        warning: suggestedState ? `Consider transitioning to ${suggestedState} instead` : undefined,
      };
    }

    return { isValid: true };
  }

  /**
   * Transition memory to new state with validation
   */
  async transitionToState(
    memoryId: string,
    toState: MemoryProcessingState,
    options: {
      reason?: string;
      metadata?: Record<string, unknown>;
      userId?: string;
      agentId?: string;
      errorMessage?: string;
      force?: boolean;
    } = {},
  ): Promise<boolean> {
    const { reason, metadata, userId, agentId, errorMessage, force = false } = options;

    const currentState = this.memoryStates.get(memoryId);
    if (!currentState) {
      throw new Error(`Memory ${memoryId} not found. Initialize state first.`);
    }

    // Validate transition unless forced
    if (!force) {
      const validation = this.validateTransition(memoryId, toState, reason);
      if (!validation.isValid) {
        throw new Error(`Invalid state transition: ${validation.error}`);
      }
    }

    const startTime = Date.now();
    const previousState = currentState;

    try {
      // Update state
      this.memoryStates.set(memoryId, toState);

      // Record transition
      if (this.config.enableHistoryTracking) {
        const transition: MemoryStateTransition = {
          id: this.generateTransitionId(),
          memoryId,
          fromState: previousState,
          toState,
          timestamp: new Date(),
          reason,
          metadata,
          userId,
          agentId,
          errorMessage,
          processingTimeMs: Date.now() - startTime,
        };

        this.addTransitionToHistory(memoryId, transition);
      }

      // Update metrics
      if (this.config.enableMetrics) {
        this.updateMetrics(memoryId, previousState, toState);
      }

      logInfo(`Memory ${memoryId} transitioned from ${previousState} to ${toState}`, {
        component: 'ProcessingStateManager',
        memoryId,
        fromState: previousState,
        toState,
        reason,
        agentId,
        processingTimeMs: Date.now() - startTime,
      });

      return true;
    } catch (error) {
      logError(`Failed to transition memory ${memoryId} from ${previousState} to ${toState}`, {
        component: 'ProcessingStateManager',
        memoryId,
        fromState: previousState,
        toState,
        reason,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get state history for a memory
   */
  getStateHistory(memoryId: string): MemoryStateTransition[] {
    return this.stateHistory.get(memoryId) || [];
  }

  /**
   * Get processing metrics
   */
  getMetrics(): Record<string, number> {
    return Object.fromEntries(this.metrics);
  }

  /**
   * Get memories in specific state
   */
  getMemoriesByState(state: MemoryProcessingState): string[] {
    const memories: string[] = [];
    for (const [memoryId, memoryState] of this.memoryStates) {
      if (memoryState === state) {
        memories.push(memoryId);
      }
    }
    return memories;
  }

  /**
   * Check if memory can transition to specific state
   */
  canTransitionTo(memoryId: string, toState: MemoryProcessingState): boolean {
    const validation = this.validateTransition(memoryId, toState);
    return validation.isValid;
  }

  /**
   * Get all memory states
   */
  getAllMemoryStates(): Record<string, MemoryProcessingState> {
    return Object.fromEntries(this.memoryStates);
  }

  /**
   * Clear state for a memory (for cleanup)
   */
  clearMemoryState(memoryId: string): boolean {
    const deleted = this.memoryStates.delete(memoryId);
    if (this.config.enableHistoryTracking) {
      this.stateHistory.delete(memoryId);
    }
    return deleted;
  }

  /**
   * Get state statistics
   */
  getStateStatistics(): Record<MemoryProcessingState, number> {
    const stats: Record<MemoryProcessingState, number> = {} as Record<MemoryProcessingState, number>;

    // Initialize all states to 0
    Object.values(MemoryProcessingState).forEach(state => {
      stats[state] = 0;
    });

    // Count memories in each state
    for (const state of this.memoryStates.values()) {
      stats[state]++;
    }

    return stats;
  }

  /**
   * Retry failed state transition
   */
  async retryTransition(
    memoryId: string,
    targetState: MemoryProcessingState,
    options: { maxRetries?: number; delayMs?: number } = {},
  ): Promise<boolean> {
    const { maxRetries = this.config.retryAttempts, delayMs = this.config.retryDelayMs } = options;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await this.transitionToState(memoryId, targetState, {
          reason: `Retry attempt ${attempt}/${maxRetries}`,
          metadata: { retryAttempt: attempt, maxRetries },
        });

        logInfo(`Successfully transitioned memory ${memoryId} to ${targetState} on attempt ${attempt}`, {
          component: 'ProcessingStateManager',
          memoryId,
          targetState,
          attempt,
          maxRetries,
        });

        return true;
      } catch (error) {
        logError(`Retry attempt ${attempt}/${maxRetries} failed for memory ${memoryId}`, {
          component: 'ProcessingStateManager',
          memoryId,
          targetState,
          attempt,
          maxRetries,
          error: error instanceof Error ? error.message : String(error),
        });

        if (attempt < maxRetries) {
          await this.delay(delayMs * attempt); // Exponential backoff
        }
      }
    }

    logError(`All retry attempts failed for memory ${memoryId} transition to ${targetState}`, {
      component: 'ProcessingStateManager',
      memoryId,
      targetState,
      maxRetries,
    });

    return false;
  }

  /**
   * Private helper methods
   */
  private generateTransitionId(): string {
    return `transition_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private addTransitionToHistory(memoryId: string, transition: MemoryStateTransition): void {
    if (!this.stateHistory.has(memoryId)) {
      this.stateHistory.set(memoryId, []);
    }

    const history = this.stateHistory.get(memoryId)!;
    history.push(transition);

    // Trim history if it exceeds max entries
    if (history.length > this.config.maxHistoryEntries) {
      history.splice(0, history.length - this.config.maxHistoryEntries);
    }
  }

  private findClosestValidState(
    currentState: MemoryProcessingState,
    targetState: MemoryProcessingState,
  ): MemoryProcessingState | undefined {
    // Simple heuristic: find state with most similar name
    const validTransitions = VALID_STATE_TRANSITIONS[currentState];
    let closestState: MemoryProcessingState | undefined;
    let maxSimilarity = 0;

    for (const validState of validTransitions) {
      const similarity = this.calculateStateSimilarity(targetState, validState);
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        closestState = validState;
      }
    }

    return maxSimilarity > 0.3 ? closestState : undefined;
  }

  private calculateStateSimilarity(state1: MemoryProcessingState, state2: MemoryProcessingState): number {
    if (state1 === state2) return 1.0;

    const name1 = state1.toLowerCase();
    const name2 = state2.toLowerCase();

    // Calculate string similarity
    const longer = name1.length > name2.length ? name1 : name2;
    const shorter = name1.length > name2.length ? name2 : name1;

    if (longer.length === 0) return 1.0;

    const editDistance = this.levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
  }

  private levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1,
          );
        }
      }
    }

    return matrix[str2.length][str1.length];
  }

  private updateMetrics(
    memoryId: string,
    fromState: MemoryProcessingState,
    toState: MemoryProcessingState,
  ): void {
    const transitionKey = `${fromState}_TO_${toState}`;
    this.metrics.set(transitionKey, (this.metrics.get(transitionKey) || 0) + 1);

    // Update state count metrics
    const stateKey = `STATE_${toState}`;
    this.metrics.set(stateKey, (this.metrics.get(stateKey) || 0) + 1);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}