/**
 * State management for complex mock testing workflows
 */

export type MockWorkflowState =
  | 'initializing'
  | 'ready'
  | 'processing'
  | 'error'
  | 'rate_limited'
  | 'maintenance'
  | 'shutdown';

export interface MockStateConfig {
  initialState?: MockWorkflowState;
  stateTransitions?: Record<MockWorkflowState, MockWorkflowState[]>;
  stateDurations?: Record<MockWorkflowState, number>;
  failureModes?: {
    intermittentErrors?: boolean;
    gradualDegradation?: boolean;
    suddenFailure?: boolean;
  };
}

export interface MockStateInfo {
  currentState: MockWorkflowState;
  stateHistory: Array<{ state: MockWorkflowState; timestamp: number; reason?: string }>;
  metrics: {
    requestsProcessed: number;
    errorsEncountered: number;
    averageResponseTime: number;
    uptime: number;
  };
  metadata: Record<string, any>;
}

/**
 * Manages state for complex mock testing workflows
 */
export class MockStateManager {
  private currentState: MockWorkflowState;
  private stateHistory: Array<{ state: MockWorkflowState; timestamp: number; reason?: string }>;
  private metrics = {
    requestsProcessed: 0,
    errorsEncountered: 0,
    responseTimes: [] as number[],
    startTime: Date.now(),
  };
  private config: Required<MockStateConfig>;
  private metadata: Record<string, any> = {};

  constructor(config: MockStateConfig = {}) {
    this.config = {
      initialState: 'ready',
      stateTransitions: {
        initializing: ['ready', 'error'],
        ready: ['processing', 'error', 'maintenance', 'rate_limited'],
        processing: ['ready', 'error', 'rate_limited'],
        error: ['ready', 'maintenance'],
        rate_limited: ['ready', 'error'],
        maintenance: ['ready'],
        shutdown: [],
      },
      stateDurations: {
        initializing: 100,
        ready: 0,
        processing: 200,
        error: 1000,
        rate_limited: 5000,
        maintenance: 3000,
        shutdown: 0,
      },
      failureModes: {
        intermittentErrors: false,
        gradualDegradation: false,
        suddenFailure: false,
      },
      ...config,
    };

    this.currentState = this.config.initialState;
    this.stateHistory = [{
      state: this.currentState,
      timestamp: Date.now(),
    }];
  }

  /**
   * Get current state information
   */
  getStateInfo(): MockStateInfo {
    const uptime = Date.now() - this.metrics.startTime;
    const averageResponseTime = this.metrics.responseTimes.length > 0
      ? this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length
      : 0;

    return {
      currentState: this.currentState,
      stateHistory: [...this.stateHistory],
      metrics: {
        requestsProcessed: this.metrics.requestsProcessed,
        errorsEncountered: this.metrics.errorsEncountered,
        averageResponseTime,
        uptime,
      },
      metadata: { ...this.metadata },
    };
  }

  /**
   * Get current state
   */
  getCurrentState(): MockWorkflowState {
    return this.currentState;
  }

  /**
   * Transition to a new state
   */
  transitionTo(newState: MockWorkflowState, reason?: string): void {
    const allowedTransitions = this.config.stateTransitions[this.currentState] || [];

    if (!allowedTransitions.includes(newState)) {
      throw new Error(`Invalid state transition: ${this.currentState} -> ${newState}`);
    }

    this.currentState = newState;
    this.stateHistory.push({
      state: newState,
      timestamp: Date.now(),
      reason,
    });

    // Update metadata
    this.metadata.lastTransition = {
      from: this.stateHistory[this.stateHistory.length - 2]?.state,
      to: newState,
      timestamp: Date.now(),
      reason,
    };
  }

  /**
   * Record a successful request
   */
  recordRequest(responseTime: number = 100): void {
    this.metrics.requestsProcessed++;
    this.metrics.responseTimes.push(responseTime);

    // Keep only last 100 response times for average calculation
    if (this.metrics.responseTimes.length > 100) {
      this.metrics.responseTimes = this.metrics.responseTimes.slice(-100);
    }

    // Auto-transition back to ready from processing
    if (this.currentState === 'processing') {
      this.transitionTo('ready', 'Request completed');
    }
  }

  /**
   * Record an error
   */
  recordError(): void {
    this.metrics.errorsEncountered++;

    // Check for failure mode triggers
    if (this.config.failureModes.intermittentErrors && Math.random() < 0.1) {
      this.transitionTo('error', 'Intermittent error triggered');
    } else if (this.config.failureModes.gradualDegradation) {
      const errorRate = this.metrics.errorsEncountered / this.metrics.requestsProcessed;
      if (errorRate > 0.5) {
        this.transitionTo('maintenance', 'High error rate detected');
      }
    }
  }

  /**
   * Check if the mock should simulate being healthy
   */
  isHealthy(): boolean {
    return !['error', 'maintenance', 'shutdown'].includes(this.currentState);
  }

  /**
   * Check if the mock should simulate being rate limited
   */
  isRateLimited(): boolean {
    return this.currentState === 'rate_limited';
  }

  /**
   * Check if the mock should simulate being in maintenance
   */
  isInMaintenance(): boolean {
    return this.currentState === 'maintenance';
  }

  /**
   * Get suggested delay based on current state
   */
  getStateDelay(): number {
    const baseDelay = this.config.stateDurations[this.currentState] || 0;

    // Add some randomness to make it more realistic
    const jitter = baseDelay * 0.1 * (Math.random() - 0.5);
    return Math.max(0, baseDelay + jitter);
  }

  /**
   * Simulate state progression over time
   */
  simulateTimeProgression(timeDeltaMs: number): void {
    // Auto-transition out of temporary states
    if (this.currentState === 'error' && timeDeltaMs > this.config.stateDurations.error) {
      this.transitionTo('ready', 'Error duration elapsed');
    } else if (this.currentState === 'rate_limited' && timeDeltaMs > this.config.stateDurations.rate_limited) {
      this.transitionTo('ready', 'Rate limit period elapsed');
    } else if (this.currentState === 'maintenance' && timeDeltaMs > this.config.stateDurations.maintenance) {
      this.transitionTo('ready', 'Maintenance completed');
    }
  }

  /**
   * Reset state to initial conditions
   */
  reset(reason?: string): void {
    const previousState = this.currentState;
    this.currentState = this.config.initialState;
    this.stateHistory.push({
      state: this.currentState,
      timestamp: Date.now(),
      reason: reason || 'Manual reset',
    });

    // Reset metrics but keep history
    this.metrics = {
      requestsProcessed: 0,
      errorsEncountered: 0,
      responseTimes: [],
      startTime: Date.now(),
    };

    this.metadata.resetFrom = previousState;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<MockStateConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Set metadata
   */
  setMetadata(key: string, value: any): void {
    this.metadata[key] = value;
  }

  /**
   * Get metadata
   */
  getMetadata(key?: string): any {
    return key ? this.metadata[key] : this.metadata;
  }
}