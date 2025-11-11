import { PrismaClient } from '@prisma/client';
import { ChatHistoryManager } from '../../../src/core/domain/conversation/ChatHistoryManager';
import { DatabaseContext } from '../../../src/core/infrastructure/database/DatabaseContext';
import { ChatHistoryData } from '../../../src/core/infrastructure/database/types';
import { ValidationError, sanitizeNamespace } from '../../../src/core/infrastructure/config/SanitizationUtils';
import { beforeEachTest, afterEachTest } from '../../setup/database/TestHelper';

describe('ChatHistoryManager', () => {
  let databaseContext: DatabaseContext | null;
  let chatHistoryManager: ChatHistoryManager;
  let prisma: PrismaClient | null;
  let testContext: Awaited<ReturnType<typeof beforeEachTest>>;
  let namespacesToCleanup: Set<string>;

  const databaseUrl = `file:${process.cwd()}/test-db-unit.sqlite`;

  beforeEach(async () => {
    testContext = await beforeEachTest('unit', 'ChatHistoryManager');
    namespacesToCleanup = new Set();
    trackNamespace(testContext.namespace);

    databaseContext = new DatabaseContext({
      databaseUrl,
      enablePerformanceMonitoring: false,
      enableFTS: false,
    });

    chatHistoryManager = new ChatHistoryManager(databaseContext);
    prisma = databaseContext.getPrismaClient();
  });

  afterEach(async () => {
    if (prisma && namespacesToCleanup) {
      for (const namespace of namespacesToCleanup) {
        await prisma.chatHistory.deleteMany({ where: { namespace } });
      }
    }

    await afterEachTest(testContext.testName, testContext.namespace);

    if (databaseContext) {
      await databaseContext.cleanup();
    }
  });

  it('stores chat history with sanitized namespace and metadata intact', async () => {
    const mixedCaseNamespace = `${testContext.namespace}MixedCase`;
    const payload = createChatHistoryPayload({
      chatId: `  ${testContext.testName}-chat-sanitized  `,
      namespace: mixedCaseNamespace,
      metadata: { tags: ['alpha', 'beta'], nested: { allowed: true } },
    });

    const storedId = await chatHistoryManager.storeChatHistory(payload);
    const storedRecord = await prisma!.chatHistory.findUnique({ where: { id: storedId } });

    expect(storedRecord).toBeTruthy();
    expect(storedRecord?.id).toBe(payload.chatId.trim());
    expect(storedRecord?.namespace).toBe(mixedCaseNamespace.toLowerCase());
    expect(storedRecord?.metadata).toEqual(payload.metadata);
  });

  it('rejects invalid chat history payloads', async () => {
    const payload = createChatHistoryPayload({
      userInput: '', // Empty string should fail validation (not sanitization)
    });

    await expect(chatHistoryManager.storeChatHistory(payload)).rejects.toThrow(ValidationError);

    const count = await prisma!.chatHistory.count({ where: { sessionId: payload.sessionId } });
    expect(count).toBe(0);
  });

  it('retrieves chat history by id with optional namespace scoping', async () => {
    const payload = createChatHistoryPayload();
    const chatId = await chatHistoryManager.storeChatHistory(payload);

    const found = await chatHistoryManager.getChatHistory(chatId, payload.namespace);
    expect(found).toMatchObject({
      chatId,
      sessionId: payload.sessionId,
      namespace: payload.namespace,
    });

    const mismatched = await chatHistoryManager.getChatHistory(chatId, `${payload.namespace}-alt`);
    expect(mismatched).toBeNull();

    const missing = await chatHistoryManager.getChatHistory('non-existent-chat-id');
    expect(missing).toBeNull();
  });

  it('retrieves chat history by session with ordering, pagination, and namespace filtering', async () => {
    const sessionId = `session-${Date.now()}`;
    const storedChatIds: string[] = [];
    const timestamps = [30, 20, 10]; // Minutes ago to create ordering gaps

    for (let index = 0; index < timestamps.length; index++) {
      const chatId = `session-chat-${index + 1}`;
      const storedId = await chatHistoryManager.storeChatHistory(
        createChatHistoryPayload({
          chatId,
          sessionId,
          userInput: `Message ${chatId}`,
          aiOutput: `Response ${chatId}`,
        }),
      );

      storedChatIds.push(storedId);
      await updateTimestamp(storedId, minutesAgo(timestamps[index]));
    }

    // Add a record under a different namespace to prove filtering works
    await chatHistoryManager.storeChatHistory(
      createChatHistoryPayload({
        chatId: `filtered-out-${Date.now()}`,
        sessionId,
        namespace: `${testContext.namespace}-secondary`,
      }),
    );

    const ascending = await chatHistoryManager.getChatHistoryBySession(sessionId, testContext.namespace, {
      orderBy: 'asc',
    });
    expect(ascending.map(entry => entry.chatId)).toEqual(storedChatIds);

    const pagedDescending = await chatHistoryManager.getChatHistoryBySession(sessionId, testContext.namespace, {
      orderBy: 'desc',
      limit: 2,
    });
    expect(pagedDescending.map(entry => entry.chatId)).toEqual([storedChatIds[2], storedChatIds[1]]);

    const offsetResult = await chatHistoryManager.getChatHistoryBySession(sessionId, testContext.namespace, {
      orderBy: 'asc',
      limit: 1,
      offset: 1,
    });
    expect(offsetResult.map(entry => entry.chatId)).toEqual([storedChatIds[1]]);
  });

  it('deletes chat history records respecting namespace scoping', async () => {
    const payload = createChatHistoryPayload();
    await chatHistoryManager.storeChatHistory(payload);

    const wrongNamespaceResult = await chatHistoryManager.deleteChatHistory(
      payload.chatId,
      `${payload.namespace}-alt`,
    );
    expect(wrongNamespaceResult).toBe(false);

    const stillExists = await chatHistoryManager.getChatHistory(payload.chatId, payload.namespace);
    expect(stillExists).not.toBeNull();

    const deleted = await chatHistoryManager.deleteChatHistory(payload.chatId, payload.namespace);
    expect(deleted).toBe(true);

    const deletedAgain = await chatHistoryManager.deleteChatHistory(payload.chatId, payload.namespace);
    expect(deletedAgain).toBe(false);
  });

  it('supports dry-run and destructive cleanup of old chat history per namespace', async () => {
    const oldChatId = await chatHistoryManager.storeChatHistory(
      createChatHistoryPayload({ chatId: `old-chat-${Date.now()}` }),
    );
    await updateTimestamp(oldChatId, daysAgo(45));

    const recentChatId = await chatHistoryManager.storeChatHistory(
      createChatHistoryPayload({ chatId: `recent-chat-${Date.now()}` }),
    );

    const foreignNamespace = `${testContext.namespace}-foreign`;
    const foreignChatId = await chatHistoryManager.storeChatHistory(
      createChatHistoryPayload({
        chatId: `foreign-old-${Date.now()}`,
        namespace: foreignNamespace,
      }),
    );
    await updateTimestamp(foreignChatId, daysAgo(60));

    const dryRunCount = await chatHistoryManager.cleanupOldChatHistory(30, testContext.namespace, { dryRun: true });
    expect(dryRunCount).toBe(1);

    const deletedCount = await chatHistoryManager.cleanupOldChatHistory(30, testContext.namespace);
    expect(deletedCount).toBe(1);

    const remaining = await prisma!.chatHistory.findMany({ where: { namespace: testContext.namespace } });
    expect(remaining).toHaveLength(1);
    expect(remaining[0].id).toBe(recentChatId);

    const sanitizedForeign = sanitizeNamespace(foreignNamespace, { fieldName: 'namespace' });
    const foreignRemaining = await prisma!.chatHistory.count({ where: { namespace: sanitizedForeign } });
    expect(foreignRemaining).toBe(1);
  });

  it('validates cleanup input parameters', async () => {
    await expect(chatHistoryManager.cleanupOldChatHistory(0, testContext.namespace))
      .rejects.toThrow(ValidationError);
  });

  it('computes namespace-scoped chat history statistics', async () => {
    const statsNamespace = `${testContext.namespace}-stats`;
    const sessionA = `${testContext.testName}-session-a`;
    const sessionB = `${testContext.testName}-session-b`;

    const chatOne = await chatHistoryManager.storeChatHistory(
      createChatHistoryPayload({
        chatId: `stats-chat-1`,
        namespace: statsNamespace,
        sessionId: sessionA,
        model: 'gpt-4o-mini',
      }),
    );
    await updateTimestamp(chatOne, new Date());

    const chatTwo = await chatHistoryManager.storeChatHistory(
      createChatHistoryPayload({
        chatId: `stats-chat-2`,
        namespace: statsNamespace,
        sessionId: sessionA,
        model: 'gpt-4o-mini',
      }),
    );
    await updateTimestamp(chatTwo, daysAgo(3));

    const chatThree = await chatHistoryManager.storeChatHistory(
      createChatHistoryPayload({
        chatId: `stats-chat-3`,
        namespace: statsNamespace,
        sessionId: sessionB,
        model: 'claude-3-sonnet',
      }),
    );
    await updateTimestamp(chatThree, daysAgo(20));

    const stats = await chatHistoryManager.getChatHistoryStats(statsNamespace.toUpperCase());

    expect(stats.totalConversations).toBe(3);
    expect(stats.uniqueSessions).toBe(2);
    expect(stats.averageMessagesPerSession).toBe(1.5);
    expect(stats.conversationsByModel).toEqual({
      'gpt-4o-mini': 2,
      'claude-3-sonnet': 1,
    });
    expect(stats.recentActivity).toEqual({
      last24Hours: 1,
      last7Days: 2,
      last30Days: 3,
    });
  });

  function createChatHistoryPayload(overrides: Partial<ChatHistoryData> = {}): ChatHistoryData {
    const payload: ChatHistoryData = {
      chatId: `chat-${testContext.testName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      userInput: 'Hello from a test user',
      aiOutput: 'Hi from the AI side',
      model: 'gpt-4o-mini',
      sessionId: `session-${testContext.testName}`,
      namespace: testContext.namespace,
      metadata: { traceId: `trace-${Math.random().toString(36).slice(2, 8)}` },
      ...overrides,
    };

    trackNamespace(payload.namespace);
    return payload;
  }

  function trackNamespace(value: string): string {
    const sanitized = sanitizeNamespace(value, { fieldName: 'namespace' });
    namespacesToCleanup.add(sanitized);
    return sanitized;
  }

  async function updateTimestamp(chatId: string, date: Date): Promise<void> {
    await prisma!.chatHistory.update({
      where: { id: chatId },
      data: { timestamp: date },
    });
  }

  function minutesAgo(minutes: number): Date {
    return new Date(Date.now() - minutes * 60 * 1000);
  }

  function daysAgo(days: number): Date {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
});
