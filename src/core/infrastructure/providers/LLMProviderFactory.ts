import { AnthropicProvider } from './AnthropicProvider';
import { ILLMProvider } from './ILLMProvider';
import { IProviderConfig } from './IProviderConfig';
import { OllamaProvider } from './OllamaProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { ProviderType } from './ProviderType';

/**
 * Factory for creating and managing LLM providers
 * Provides a centralized registry for provider implementations
 */
export class LLMProviderFactory {
  private static providers = new Map<ProviderType, new (config: IProviderConfig) => ILLMProvider>();
  private static instances = new Map<string, ILLMProvider>();

  /**
   * Register a provider implementation
   * @param providerType The type of provider to register
   * @param providerClass The provider class constructor
   */
  static registerProvider(
    providerType: ProviderType,
    providerClass: new (config: IProviderConfig) => ILLMProvider
  ): void {
    LLMProviderFactory.providers.set(providerType, providerClass);
  }

  /**
   * Create a provider instance
   * @param providerType The type of provider to create
   * @param config Provider configuration
   * @returns Promise resolving to the provider instance
   */
  static async createProvider(
    providerType: ProviderType,
    config: IProviderConfig
  ): Promise<ILLMProvider> {
    const ProviderClass = LLMProviderFactory.providers.get(providerType);
    if (!ProviderClass) {
      throw new Error(`Provider type '${providerType}' is not registered`);
    }

    const instanceKey = `${providerType}-${JSON.stringify(config)}`;
    let instance = LLMProviderFactory.instances.get(instanceKey);

    if (!instance) {
      instance = new ProviderClass(config);
      await instance.initialize(config);
      LLMProviderFactory.instances.set(instanceKey, instance);
    }

    return instance;
  }

  /**
   * Create a provider from configuration with auto-detection
   * @param config Provider configuration
   * @returns Promise resolving to the provider instance
   */
  static async createProviderFromConfig(config: IProviderConfig): Promise<ILLMProvider> {
    // Auto-detect provider type based on configuration
    const providerType = LLMProviderFactory.detectProviderType(config);

    return LLMProviderFactory.createProvider(providerType, config);
  }

  /**
   * Get all registered provider types
   * @returns Array of registered provider types
   */
  static getRegisteredProviderTypes(): ProviderType[] {
    return Array.from(LLMProviderFactory.providers.keys());
  }

  /**
   * Check if a provider type is registered
   * @param providerType The provider type to check
   * @returns True if the provider is registered
   */
  static isProviderRegistered(providerType: ProviderType): boolean {
    return LLMProviderFactory.providers.has(providerType);
  }

  /**
   * Dispose of all provider instances
   */
  static async disposeAll(): Promise<void> {
    const disposePromises = Array.from(LLMProviderFactory.instances.values()).map(
      instance => instance.dispose()
    );

    await Promise.all(disposePromises);
    LLMProviderFactory.instances.clear();
  }

  /**
   * Clear the provider registry (for testing)
   */
  static clearRegistry(): void {
    LLMProviderFactory.providers.clear();
  }

  /**
   * Detect provider type from configuration
   * @param config Provider configuration
   * @returns Detected provider type
   */
  private static detectProviderType(config: IProviderConfig): ProviderType {
    // Check for Anthropic-specific indicators
    if (config.apiKey && (
      config.apiKey.startsWith('sk-ant-') ||
      config.baseUrl?.includes('anthropic') ||
      config.apiKey === 'anthropic-dummy'
    )) {
      return ProviderType.ANTHROPIC;
    }

    // Check for Ollama-specific indicators
    if (config.baseUrl?.includes('ollama') ||
        config.apiKey === 'ollama-local' ||
        config.baseUrl?.includes('11434') ||
        config.baseUrl?.includes('localhost')) {
      return ProviderType.OLLAMA;
    }

    // Check for OpenAI-specific indicators
    if (config.apiKey && (
      config.apiKey.startsWith('sk-') ||
      config.baseUrl?.includes('openai')
    )) {
      return ProviderType.OPENAI;
    }

    // Default to OpenAI for backward compatibility
    return ProviderType.OPENAI;
  }

  /**
   * Register default provider implementations
   * Should be called during module initialization
   */
  static registerDefaultProviders(): void {
    LLMProviderFactory.registerProvider(ProviderType.OPENAI, OpenAIProvider);
    LLMProviderFactory.registerProvider(ProviderType.ANTHROPIC, AnthropicProvider);
    LLMProviderFactory.registerProvider(ProviderType.OLLAMA, OllamaProvider);
  }

  /**
   * Ensure all default providers are registered and return registered types
   * This method blocks until providers are registered
   */
  static async getRegisteredProviderTypesAsync(): Promise<ProviderType[]> {
    // First ensure default providers are registered
    LLMProviderFactory.registerDefaultProviders();

    return LLMProviderFactory.getRegisteredProviderTypes();
  }
}