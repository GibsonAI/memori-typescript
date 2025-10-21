import { ILLMProvider } from '../ILLMProvider';
import { IProviderConfig } from '../IProviderConfig';
import { ProviderType } from '../ProviderType';
import { ChatCompletionParams } from '../types/ChatCompletionParams';
import { EmbeddingParams } from '../types/EmbeddingParams';

/**
 * Benchmark configuration
 */
export interface BenchmarkConfig {
  iterations: number;
  concurrency?: number;
  warmupIterations?: number;
  testParams: ChatCompletionParams | EmbeddingParams;
  timeout?: number;
}

/**
 * Benchmark results for a single operation
 */
export interface BenchmarkResult {
  duration: number;
  success: boolean;
  tokens?: number;
  error?: string;
}

/**
 * Comprehensive benchmark results
 */
export interface ProviderBenchmarkResults {
  providerType: ProviderType;
  config: BenchmarkConfig;
  summary: {
    totalDuration: number;
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    successRate: number;
    totalTokens?: number;
    tokensPerSecond?: number;
    requestsPerSecond: number;
  };
  results: BenchmarkResult[];
  percentiles: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  errors: string[];
}

/**
 * Provider benchmark utility for performance testing
 * Measures provider performance under various load conditions
 */
export class ProviderBenchmark {
  private provider: ILLMProvider;
  private config: IProviderConfig;

  constructor(provider: ILLMProvider, config: IProviderConfig) {
    this.provider = provider;
    this.config = config;
  }

  /**
   * Run comprehensive benchmark suite
   */
  async runBenchmark(benchmarkConfig: BenchmarkConfig): Promise<ProviderBenchmarkResults> {
    const startTime = Date.now();
    const results: BenchmarkResult[] = [];
    const errors: string[] = [];

    try {
      // Initialize provider
      await this.provider.initialize(this.config);

      // Warmup if configured
      if (benchmarkConfig.warmupIterations && benchmarkConfig.warmupIterations > 0) {
        await this.runWarmup(benchmarkConfig);
      }

      // Run benchmark based on concurrency settings
      if (benchmarkConfig.concurrency && benchmarkConfig.concurrency > 1) {
        results.push(...await this.runConcurrentBenchmark(benchmarkConfig));
      } else {
        results.push(...await this.runSequentialBenchmark(benchmarkConfig));
      }

      const totalDuration = Date.now() - startTime;

      // Calculate statistics
      const summary = this.calculateSummary(results, totalDuration, benchmarkConfig);
      const percentiles = this.calculatePercentiles(results);

      return {
        providerType: this.provider.getProviderType(),
        config: benchmarkConfig,
        summary,
        results,
        percentiles,
        errors,
      };
    } catch (error) {
      const totalDuration = Date.now() - startTime;
      errors.push(error instanceof Error ? error.message : String(error));

      return {
        providerType: this.provider.getProviderType(),
        config: benchmarkConfig,
        summary: {
          totalDuration,
          averageDuration: 0,
          minDuration: 0,
          maxDuration: 0,
          successRate: 0,
          requestsPerSecond: 0,
        },
        results: [],
        percentiles: {
          p50: 0,
          p90: 0,
          p95: 0,
          p99: 0,
        },
        errors,
      };
    }
  }

  /**
   * Run warmup iterations
   */
  private async runWarmup(config: BenchmarkConfig): Promise<void> {
    const warmupConfig = { ...config };
    warmupConfig.iterations = config.warmupIterations || 1;

    await this.runSequentialBenchmark(warmupConfig);
  }

  /**
   * Run benchmark sequentially
   */
  private async runSequentialBenchmark(config: BenchmarkConfig): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    for (let i = 0; i < config.iterations; i++) {
      const result = await this.runSingleBenchmark(config);
      results.push(result);

      // Add small delay between requests to avoid overwhelming the service
      if (i < config.iterations - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Run benchmark with concurrency
   */
  private async runConcurrentBenchmark(config: BenchmarkConfig): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];
    const concurrency = config.concurrency || 5;
    const semaphore = new Semaphore(concurrency);

    const promises = Array.from({ length: config.iterations }, async (_, i) => {
      await semaphore.acquire();
      try {
        const result = await this.runSingleBenchmark(config);
        results.push(result);
      } finally {
        semaphore.release();
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * Run a single benchmark iteration
   */
  private async runSingleBenchmark(config: BenchmarkConfig): Promise<BenchmarkResult> {
    const startTime = Date.now();

    try {
      let result: any;
      let tokens: number | undefined;

      if ('messages' in config.testParams) {
        // Chat completion benchmark
        result = await this.provider.createChatCompletion(config.testParams as ChatCompletionParams);
        tokens = result.usage?.total_tokens;
      } else {
        // Embedding benchmark
        result = await this.provider.createEmbedding(config.testParams as EmbeddingParams);
        tokens = result.usage?.total_tokens;
      }

      const duration = Date.now() - startTime;

      return {
        duration,
        success: true,
        tokens,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      return {
        duration,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Calculate benchmark summary statistics
   */
  private calculateSummary(results: BenchmarkResult[], totalDuration: number, config: BenchmarkConfig): ProviderBenchmarkResults['summary'] {
    const successfulResults = results.filter(r => r.success);
    const durations = successfulResults.map(r => r.duration);
    const tokens = successfulResults.map(r => r.tokens).filter(Boolean) as number[];

    const averageDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length || 0;
    const minDuration = Math.min(...durations) || 0;
    const maxDuration = Math.max(...durations) || 0;
    const successRate = (successfulResults.length / results.length) * 100;
    const totalTokens = tokens.reduce((sum, t) => sum + t, 0) || 0;
    const tokensPerSecond = totalTokens / (totalDuration / 1000) || 0;
    const requestsPerSecond = (results.length / (totalDuration / 1000)) * 1000;

    return {
      totalDuration,
      averageDuration,
      minDuration,
      maxDuration,
      successRate,
      totalTokens,
      tokensPerSecond,
      requestsPerSecond,
    };
  }

  /**
   * Calculate percentile values
   */
  private calculatePercentiles(results: BenchmarkResult[]): ProviderBenchmarkResults['percentiles'] {
    const durations = results.filter(r => r.success).map(r => r.duration).sort((a, b) => a - b);

    if (durations.length === 0) {
      return { p50: 0, p90: 0, p95: 0, p99: 0 };
    }

    const p50Index = Math.floor(durations.length * 0.5);
    const p90Index = Math.floor(durations.length * 0.9);
    const p95Index = Math.floor(durations.length * 0.95);
    const p99Index = Math.floor(durations.length * 0.99);

    return {
      p50: durations[p50Index] || 0,
      p90: durations[p90Index] || 0,
      p95: durations[p95Index] || 0,
      p99: durations[p99Index] || 0,
    };
  }

  /**
   * Get standard benchmark configurations
   */
  static getStandardBenchmarkConfigs(): BenchmarkConfig[] {
    return [
      {
        iterations: 10,
        concurrency: 1,
        warmupIterations: 2,
        testParams: {
          messages: [{ role: 'user', content: 'Hello, how are you today?' }],
          max_tokens: 50,
          temperature: 0.7,
        },
        timeout: 30000,
      },
      {
        iterations: 20,
        concurrency: 5,
        warmupIterations: 3,
        testParams: {
          messages: [
            { role: 'system', content: 'You are a helpful assistant.' },
            { role: 'user', content: 'Explain quantum computing in simple terms.' },
          ],
          max_tokens: 100,
          temperature: 0.5,
        },
        timeout: 60000,
      },
      {
        iterations: 15,
        concurrency: 3,
        warmupIterations: 2,
        testParams: {
          input: 'The future of artificial intelligence is bright and promising.',
        } as EmbeddingParams,
        timeout: 45000,
      },
    ];
  }
}

/**
 * Simple semaphore for controlling concurrency
 */
class Semaphore {
  private permits: number;
  private waiting: Array<() => void> = [];

  constructor(permits: number) {
    this.permits = permits;
  }

  async acquire(): Promise<void> {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise(resolve => {
      this.waiting.push(resolve);
    });
  }

  release(): void {
    this.permits++;
    if (this.waiting.length > 0) {
      const next = this.waiting.shift();
      next?.();
    }
  }
}