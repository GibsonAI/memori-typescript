import { MemoriOpenAIClient } from '../../../../src/integrations/openai-dropin/client';
import { LLMProviderFactory } from '../../../../src/core/infrastructure/providers/LLMProviderFactory';
import type { IProviderConfig } from '../../../../src/core/infrastructure/providers/IProviderConfig';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'test-session-id'),
}));

jest.mock('../../../../src/core/infrastructure/providers/LLMProviderFactory', () => ({
  LLMProviderFactory: {
    createProviderFromConfig: jest.fn(),
  },
}));

describe('MemoriOpenAIClient', () => {
  const baseConfig: IProviderConfig = {
    apiKey: 'test-key',
    model: 'gpt-4o-mini',
  };

  const createProviderStub = () => {
    let disposed = false;

    return {
      initialize: jest.fn().mockResolvedValue(undefined),
      dispose: jest.fn().mockImplementation(async () => {
        disposed = true;
      }),
      createChatCompletion: jest.fn().mockResolvedValue({
        id: 'chat-id',
        message: { role: 'assistant', content: 'hello world' },
        finish_reason: 'stop',
        created: Date.now(),
        model: 'gpt-4o-mini',
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }),
      createEmbedding: jest.fn().mockResolvedValue({
        data: [{ embedding: [0.1, 0.2], index: 0, object: 'embedding' }],
        model: 'text-embedding-3-small',
        usage: { prompt_tokens: 2, total_tokens: 2 },
      }),
      getModel: jest.fn().mockReturnValue('gpt-4o-mini'),
      getMemoryMetrics: jest.fn().mockReturnValue({
        totalRequests: 0,
        memoryRecordingSuccess: 0,
        memoryRecordingFailures: 0,
        averageResponseTime: 0,
        averageMemoryProcessingTime: 0,
      }),
      updateMemoryConfig: jest.fn(),
      isDisposed: () => disposed,
    };
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes provider on demand via enable()', async () => {
    const provider = createProviderStub();
    (LLMProviderFactory.createProviderFromConfig as jest.Mock).mockResolvedValue(provider);

    const client = new MemoriOpenAIClient(baseConfig);
    await client.enable();

    expect(LLMProviderFactory.createProviderFromConfig).toHaveBeenCalledTimes(1);
    expect(client.memory).toBe(provider);
  });

  it('creates chat completion using underlying provider', async () => {
    const provider = createProviderStub();
    (LLMProviderFactory.createProviderFromConfig as jest.Mock).mockResolvedValue(provider);

    const client = new MemoriOpenAIClient(baseConfig);
    const chat = client.chat;
    const response = await chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
    } as any);

    expect(provider.createChatCompletion).toHaveBeenCalled();
    expect(response.object).toBe('chat.completion');
  });

  it('returns default metrics when provider uninitialized', async () => {
    (LLMProviderFactory.createProviderFromConfig as jest.Mock).mockResolvedValue(undefined);

    const client = new MemoriOpenAIClient(baseConfig);
    const metrics = await client.getMetrics();

    expect(metrics).toEqual({
      totalRequests: 0,
      memoryRecordingSuccess: 0,
      memoryRecordingFailures: 0,
      averageResponseTime: 0,
      averageMemoryProcessingTime: 0,
    });
  });

  it('disposes provider on disable()', async () => {
    const provider = createProviderStub();
    (LLMProviderFactory.createProviderFromConfig as jest.Mock).mockResolvedValue(provider);

    const client = new MemoriOpenAIClient(baseConfig);
    await client.enable();
    await client.disable();

    expect(provider.dispose).toHaveBeenCalled();
    expect(() => client.memory).toThrow();
  });
});
