import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { SafeUser, TaskView } from '../shared/types.js';
import type { TasksService } from '../tasks/tasks.service.js';
import { ChatNormalizer } from './chat-normalizer.js';
import { ChatService } from './chat.service.js';

const alice: SafeUser = {
  id: 1,
  name: 'Alice Sharma',
  email: 'alice@example.com',
};
const rahul: SafeUser = {
  id: 2,
  name: 'Rahul Verma',
  email: 'rahul@example.com',
};

function task(id: number, title: string): TaskView {
  return {
    id,
    title,
    description: `Details for ${title}`,
    dueAt: '2026-10-12T11:30:00.000Z',
    status: 'PENDING',
    assignedTo: rahul,
    assignedBy: alice,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
    permissions: { canEditAll: true, canUpdateStatus: true },
  };
}

function createFixture(taskIds: number[]) {
  const tasks = taskIds.map((id) => task(id, `Task ${id}`));
  const savedConversation = {
    version: 1,
    state: null,
    messages: taskIds.length
      ? [{
          id: 1,
          role: 'assistant',
          content: 'Here are the matching tasks.',
          language: 'hinglish',
          taskIds,
          createdAt: '2026-10-09T10:00:00.000Z',
        }]
      : [],
  };
  const savedState = {
    findUnique: vi.fn().mockResolvedValue({
      data: JSON.stringify(savedConversation),
      updatedAt: new Date(),
    }),
    upsert: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  const prisma = {
    chatState: savedState,
    user: { findMany: vi.fn().mockResolvedValue([alice, rahul]) },
  } as unknown as PrismaService;
  const taskService = {
    list: vi.fn().mockResolvedValue(tasks),
    update: vi.fn(),
  } as unknown as TasksService;
  const normalizer = {
    normalize: vi.fn().mockResolvedValue({
      language: 'hinglish',
      intent: 'update',
      instruction: 'uski due date kal 6pm kar do',
      fromGemini: false,
    }),
  } as unknown as ChatNormalizer;

  return {
    service: new ChatService(prisma, taskService, normalizer),
    savedState,
    taskService,
  };
}

describe('ChatService conversation context', () => {
  it('restores the saved transcript with currently visible task cards', async () => {
    const { service } = createFixture([7]);

    const result = await service.getHistory(alice);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      role: 'assistant',
      text: 'Here are the matching tasks.',
      tasks: [task(7, 'Task 7')],
    });
  });

  it('previews an update to the single task in the previous response and saves both turns', async () => {
    const { service, savedState, taskService } = createFixture([7]);

    const result = await service.handle(alice, 'uski due date kal 6pm kar do');

    expect(result.reply).toContain('Task 7');
    expect(result.quickReplies?.map((reply) => reply.value)).toEqual([
      'haan',
      'nahi',
    ]);
    const savedData = savedState.upsert.mock.calls[0]?.[0].create.data;
    const conversation: unknown = JSON.parse(savedData);
    expect(conversation).toMatchObject({
      conversations: [{
        state: { taskId: 7, slot: 'confirm' },
        messages: [
        { content: 'Here are the matching tasks.', role: 'assistant' },
        { content: 'uski due date kal 6pm kar do', role: 'user' },
        { role: 'assistant', taskIds: [] },
        ],
      }],
    });
    expect(taskService.update).not.toHaveBeenCalled();
  });

  it('asks the user to select when the previous response contained multiple tasks', async () => {
    const { service, savedState } = createFixture([7, 8]);

    const result = await service.handle(alice, 'uski due date kal 6pm kar do');

    expect(result.reply).toContain('Kaunsa task');
    expect(result.quickReplies?.map((reply) => reply.value)).toEqual([
      '#7',
      '#8',
    ]);
    const savedData = savedState.upsert.mock.calls[0]?.[0].create.data;
    const conversation: unknown = JSON.parse(savedData);
    expect(conversation).toMatchObject({
      conversations: [{
        state: {
          flow: 'update',
          slot: 'task',
          candidates: [7, 8],
          contextMessage: 'uski due date kal 6pm kar do',
        },
      }],
    });
  });

  it('starts a fresh active conversation while retaining the existing chat', async () => {
    const { service, savedState } = createFixture([7]);

    const result = await service.startConversation(alice);

    const savedData = savedState.upsert.mock.calls[0]?.[0].create.data;
    const store: unknown = JSON.parse(savedData);
    expect(store).toMatchObject({
      activeConversationId: result.conversationId,
      conversations: [
        { id: '00000000-0000-4000-8000-000000000001' },
        { id: result.conversationId, title: 'New chat', messages: [] },
      ],
    });
  });

  it('clears only the current user conversation history', async () => {
    const { service, savedState } = createFixture([]);

    await expect(service.clearHistory(alice)).resolves.toEqual({ ok: true });

    expect(savedState.deleteMany).toHaveBeenCalledWith({
      where: { userId: alice.id },
    });
  });
});
