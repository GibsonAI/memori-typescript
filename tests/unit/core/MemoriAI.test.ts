import { MemoriAI } from '../../../src/core/MemoriAI';
import { ProviderType } from '../../../src/core/infrastructure/providers/ProviderType';

jest.mock('uuid', () => ({
  v4: jest.fn(() => 'memoriai-session-id'),
}));

describe('MemoriAI', () => {
  const mockProvider = {
    initialize: jest.fn().mockResolvedValue(undefined),
    createChatCompletion: jest.fn().mockResolvedValue({
      message: { role: 'assistant', content: 'mock response' },
      finish_reason: 'stop',
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      id: 'chat-id',
      model: 'gpt-4o-mini',
      created: Date.now(),
    }),
    createEmbedding: jest.fn().mockResolvedValue({
      data: [{ embedding: [0.1, 0.2], index: 0, object: 'embedding' }],
      usage: { prompt_tokens: 1, total_tokens: 1 },
      model: 'text-embedding-3-small',
    }),
    dispose: jest.fn().mockResolvedValue(undefined),
    getProviderType: jest.fn().mockReturnValue(ProviderType.OPENAI),
    getModel: jest.fn().mockReturnValue('gpt-4o-mini'),
    getClient: jest.fn(),
    getConfig: jest.fn(),
    isHealthy: jest.fn().mockResolvedValue(true),
    getDiagnostics: jest.fn().mockResolvedValue({}),
    updateMemoryConfig: jest.fn(),
  };

  const mockMemori = {
    enable: jest.fn().mockResolvedValue(undefined),
    recordConversation: jest.fn().mockResolvedValue('memory-id'),
    searchMemories: jest.fn().mockResolvedValue([]),
    close: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    jest.doMock('../../../src/core/infrastructure/providers/OpenAIProvider', () => ({
      OpenAIProvider: jest.fn().mockImplementation(() => ({ ...mockProvider })),
    }));

    jest.doMock('../../../src/core/infrastructure/providers/AnthropicProvider', () => ({
      AnthropicProvider: jest.fn().mockImplementation(() => ({ ...mockProvider })),
    }));

    jest.doMock('../../../src/core/infrastructure/providers/OllamaProvider', () => ({
      OllamaProvider: jest.fn().mockImplementation(() => ({ ...mockProvider })),
    }));

    jest.doMock('../../../src/core/Memori', () => ({
      Memori: jest.fn().mockImplementation(() => ({ ...mockMemori })),
    }));
  });

  afterEach(() => {
    jest.dontMock('../../../src/core/infrastructure/providers/OpenAIProvider');
    jest.dontMock('../../../src/core/infrastructure/providers/AnthropicProvider');
    jest.dontMock('../../../src/core/infrastructure/providers/OllamaProvider');
    jest.dontMock('../../../src/core/Memori');
  });

  const createInstance = async () => {
    const { MemoriAI } = await import('../../../src/core/MemoriAI');
    return new MemoriAI({ apiKey: 'test', databaseUrl: 'file:./test.sqlite' } as any);
  };

  it('routes chat requests through provider and records conversation', async () => {
    const instance = await createInstance();

    const result = await instance.chat({
      messages: [{ role: 'user', content: 'Hello' }],
    } as any);

    expect(mockProvider.createChatCompletion).toHaveBeenCalled();
    expect(result.message.content).toBe('mock response');
    expect(mockMemori.recordConversation).toHaveBeenCalled();
  });

  it('disposes resources on close()', async () => {
    const instance = await createInstance();

    await instance.close();

    expect(mockProvider.dispose).toHaveBeenCalled();
    expect(mockMemori.close).toHaveBeenCalled();
  });
});
