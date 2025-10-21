import { ProviderType } from '../ProviderType';

/**
 * Provider diagnostics information
 */
export interface ProviderDiagnostics {
  /** Provider type */
  providerType: ProviderType;
  /** Whether the provider is initialized */
  isInitialized: boolean;
  /** Whether the provider is healthy */
  isHealthy: boolean;
  /** Model currently in use */
  model: string;
  /** Provider-specific diagnostic information */
  metadata: Record<string, any>;
  /** Timestamp of diagnostics */
  timestamp: Date;
}