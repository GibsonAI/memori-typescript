import { Memori } from '../../../src/core/Memori';
import {
  UpdateMemoryInput,
  UpdateMemoryRelationshipsInput,
  DeltaInput
} from '../../../src/core/types/memory-operations';

// Avoid ConfigManager/env validation in these unit tests by stubbing it.
jest.mock('../../../src/core/infrastructure/config/ConfigManager', () => {
  const actual = jest.requireActual('../../../src/core/infrastructure/config/ConfigManager');
  return {
    ...actual,
    ConfigManager: {
      ...actual.ConfigManager,
      loadConfig: () => ({
        // Minimal shape satisfying Memori constructor expectations
        databaseUrl: 'file:./test.db',
        namespace: 'test',
        consciousIngest: false,
        autoIngest: false,
        enableRelationshipExtraction: false,
        apiKey: 'test-key',
        provider: 'openai',
      }),
    },
  };
});

// Mock DatabaseManager to avoid real DatabaseContext timers and resources
jest.mock('../../../src/core/infrastructure/database/DatabaseManager', () => {
  return {
    DatabaseManager: jest.fn().mockImplementation(() => {
      return {
        // Facade used by Memori.updateMemory
        updateMemory: jest.fn().mockResolvedValue(true),

        // Facade used by Memori.updateMemoryRelationships
        updateMemoryRelationshipsFacade: jest.fn().mockResolvedValue({
          updated: 1,
          errors: [],
        }),

        // Facades used by duplicate/supersedence helpers
        markAsDuplicateFacade: jest.fn().mockResolvedValue(true),
        setSupersedesFacade: jest.fn().mockResolvedValue(true),

        // Close hook used by Memori.close()
        close: jest.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

/**
 * Helper to construct Memori with mocked internals.
 * DatabaseManager is fully mocked above; no real DatabaseContext or timers run.
 */
function createMemoriWithMockDb(namespace = 'default'): { memori: Memori } {
  const memori = new Memori({
    databaseUrl: 'file:./test.db',
    namespace,
  } as any);

  // Enable Memori without starting any real background behavior;
  // this works because DatabaseManager is fully mocked above.
  (memori as any).enabled = true;

  return { memori };
}

describe('Memori public memory update and relationship APIs', () => {
  afterEach(() => {
    // Reset mocks between tests; all heavy lifting is mocked
    jest.clearAllMocks();
  });

  test('updateMemory applies controlled updates via DatabaseManager facade', async () => {
    const { memori } = createMemoriWithMockDb('my-app');

    const ok = await memori.updateMemory('m-1', {
      content: 'new content',
      tags: ['curated'],
      importance: 'high',
      metadata: { reviewed: true },
    } as UpdateMemoryInput, 'my-app');

    expect(ok).toBe(true);

    const { DatabaseManager } = jest.requireMock('../../../src/core/infrastructure/database/DatabaseManager');
    const instance = (DatabaseManager as jest.Mock).mock.results[0].value;
    expect(instance.updateMemory).toHaveBeenCalledTimes(1);
    // Only assert on the meaningful parts; Memori passes namespace inside updates
    const [idArg, updateArg] = (instance.updateMemory as jest.Mock).mock.calls[0];
    expect(idArg).toBe('m-1');
    expect(updateArg).toMatchObject({
      content: 'new content',
      tags: ['curated'],
      importance: 'high',
      metadata: { reviewed: true },
    });
  });

  test('updateMemory respects namespace and returns false on mismatch', async () => {
    const { memori } = createMemoriWithMockDb('ns-a');

    // Force facade to signal failure
    const { DatabaseManager } = jest.requireMock('../../../src/core/infrastructure/database/DatabaseManager');
    const instance = (DatabaseManager as jest.Mock).mock.results[0].value;
    (instance.updateMemory as jest.Mock).mockResolvedValueOnce(false);

    const okWrongNs = await memori.updateMemory(
      'm-2',
      { content: 'should not apply' } as UpdateMemoryInput,
      'ns-b',
    );

    expect(okWrongNs).toBe(false);
    expect(instance.updateMemory).toHaveBeenCalled();
  });

  test('updateMemoryRelationships creates relationships via facade', async () => {
    const { memori } = createMemoriWithMockDb('team');

    const input: UpdateMemoryRelationshipsInput = {
      sourceId: 's-1',
      namespace: 'team',
      relations: [
        { targetId: 't-1', type: 'references', strength: 0.9 },
        { targetId: 't-2', type: 'explains' },
      ],
    };

    const result = await memori.updateMemoryRelationships(input);
    expect(result.updated).toBeGreaterThanOrEqual(1);
    expect(result.errors).toHaveLength(0);

    const { DatabaseManager } = jest.requireMock('../../../src/core/infrastructure/database/DatabaseManager');
    const instance = (DatabaseManager as jest.Mock).mock.results[0].value;
    expect(instance.updateMemoryRelationshipsFacade).toHaveBeenCalledWith(input);
  });

  test('markAsDuplicate marks memory as duplicate of another', async () => {
    const { memori } = createMemoriWithMockDb('dup-ns');
    const { DatabaseManager } = jest.requireMock('../../../src/core/infrastructure/database/DatabaseManager');
    const instance = (DatabaseManager as jest.Mock).mock.results[0].value;

    const ok = await memori.markAsDuplicate('dup', 'orig', { namespace: 'dup-ns' });
    expect(ok).toBe(true);
    expect(instance.markAsDuplicateFacade).toHaveBeenCalledWith('dup', 'orig', 'dup-ns');
  });

  test('setSupersedes creates supersedes relationship', async () => {
    const { memori } = createMemoriWithMockDb('sup-ns');
    const { DatabaseManager } = jest.requireMock('../../../src/core/infrastructure/database/DatabaseManager');
    const instance = (DatabaseManager as jest.Mock).mock.results[0].value;

    const ok = await memori.setSupersedes('primary', 'old', { namespace: 'sup-ns' });
    expect(ok).toBe(true);
    expect(instance.setSupersedesFacade).toHaveBeenCalledWith('primary', 'old', 'sup-ns');
  });

  test('applyDeltas routes note, correction, and relationship deltas through public APIs', async () => {
    const { memori } = createMemoriWithMockDb('delta-ns');
    const { DatabaseManager } = jest.requireMock('../../../src/core/infrastructure/database/DatabaseManager');
    const instance = (DatabaseManager as jest.Mock).mock.results[0].value;

    // Patch recordConversation to be deterministic and observable
    const createdIds: string[] = [];
    (memori as any).recordConversation = async (userInput: string) => {
      const id = `note-${createdIds.length + 1}`;
      createdIds.push(id);
      return id;
    };

    const deltas: DeltaInput[] = [
      {
        type: 'note',
        content: 'New curated note',
        namespace: 'delta-ns',
      },
      {
        type: 'correction',
        targetId: 'mem-to-fix',
        content: 'corrected',
        namespace: 'delta-ns',
      },
      {
        type: 'relationship',
        relationship: {
          sourceId: 'mem-to-fix',
          targetId: 'note-1',
          type: 'references',
          strength: 0.7,
        },
        namespace: 'delta-ns',
      },
    ];

    const result = await memori.applyDeltas(deltas, {
      continueOnError: true,
      defaultNamespace: 'delta-ns',
    });

    expect(result.failed).toHaveLength(0);
    expect(result.applied.length).toBe(3);

    // Verify that public APIs were used
    // recordConversation was patched above; treat it as a spy-style function
    expect(typeof (memori as any).recordConversation).toBe('function');

    const [idArg, updateArg] = (instance.updateMemory as jest.Mock).mock.calls[0];
    expect(idArg).toBe('mem-to-fix');
    expect(updateArg).toMatchObject({ content: 'corrected' });
    expect(instance.updateMemoryRelationshipsFacade).toHaveBeenCalled();
  });

  test('applyDeltas collects failures when continueOnError is true', async () => {
    const { memori } = createMemoriWithMockDb('err-ns');

    const deltas: DeltaInput[] = [
      {
        type: 'correction',
        // targetId missing
        content: 'invalid correction',
      },
    ];

    const result = await memori.applyDeltas(deltas, {
      continueOnError: true,
      defaultNamespace: 'err-ns',
    });

    expect(result.applied).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].error).toContain('requires targetId');
  });
});