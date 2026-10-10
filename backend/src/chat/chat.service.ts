import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SafeUser, TaskView } from '../shared/types.js';
import {
  detectUpdateField,
  detectNewCommandIntent,
  processMessage,
  type ChatLanguage,
  type EngineState,
  type FollowUpSlot,
} from './chat.engine.js';
import { formatChatDateTime } from './chat-timezone.js';
import { ChatNormalizer } from './chat-normalizer.js';
import { TasksService } from '../tasks/tasks.service.js';
import {
  ASSIGNEE_UPDATE_FORBIDDEN_MESSAGE,
  TASK_FORBIDDEN_MESSAGE,
} from '../tasks/task.constants.js';

const permissionReplies: Record<ChatLanguage, { assigned: string; denied: string }> = {
  en: {
    assigned: 'You can update the status of a task assigned to you, but only its creator can change its other details.',
    denied: 'You do not have permission to modify that task.',
  },
  hi: {
    assigned: 'आपको दिए गए काम की स्थिति बदल सकते हैं, बाकी जानकारी केवल बनाने वाला बदल सकता है।',
    denied: 'आपको इस काम को बदलने की अनुमति नहीं है।',
  },
  hinglish: {
    assigned: 'Aap assigned task ka status update kar sakte ho; baaki details sirf creator change kar sakta hai.',
    denied: 'Aapko yeh task modify karne ki permission nahi hai.',
  },
};

type QuickReply = { label: string; value: string };
type ChatReply = {
  reply: string;
  tasks: TaskView[];
  language: ChatLanguage;
  quickReplies?: QuickReply[];
};

type StoredChatMessage = {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  language: ChatLanguage;
  taskIds: number[];
  createdAt: string;
};

type StoredConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  state: EngineState | null;
  messages: StoredChatMessage[];
};

type PersistedChatStore = {
  version: 2;
  activeConversationId: string | null;
  conversations: StoredConversation[];
};

type LegacyPersistedConversation = {
  version: 1;
  state: EngineState | null;
  messages: StoredChatMessage[];
};

type ConversationSummary = Pick<
  StoredConversation,
  'id' | 'title' | 'createdAt' | 'updatedAt'
>;

type ChatHistoryMessage = {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  language: ChatLanguage;
  tasks: TaskView[];
  createdAt: string;
  quickReplies?: QuickReply[];
};

const contextualReferenceWords =
  /(?:\b(?:it|that(?:\s+task|\s+one)?|its|same\s+task|uska|uski|uske|usko|isko|iski|iske|usse|us\s+task|woh\s+task|wo\s+task)\b|उसकी|उसका|उसके|उसको|उससे|इसकी|इसका|इसके|उस\s+काम|उस\s+टास्क)/iu;

const quickReplyText: Record<
  ChatLanguage,
  Partial<Record<FollowUpSlot, QuickReply[]>>
> = {
  en: {
    confirm: [
      { label: 'Yes, confirm', value: 'yes' },
      { label: 'No, cancel', value: 'no' },
    ],
    status: [
      { label: 'Pending', value: 'pending' },
      { label: 'In progress', value: 'in progress' },
      { label: 'Completed', value: 'completed' },
    ],
    task: [
      { label: 'Status', value: 'status' },
      { label: 'Title', value: 'title' },
      { label: 'Description', value: 'description' },
      { label: 'Due date', value: 'due date' },
      { label: 'Assignee', value: 'assignee' },
    ],
    date: [
      { label: 'Tomorrow', value: 'tomorrow' },
      { label: 'Day after tomorrow', value: 'day after tomorrow' },
    ],
    time: [
      { label: '9:00 AM', value: '9am' },
      { label: '12:00 PM', value: '12pm' },
      { label: '5:00 PM', value: '5pm' },
    ],
    description: [{ label: 'Skip description', value: 'skip' }],
  },
  hi: {
    confirm: [
      { label: 'हाँ, पुष्टि करें', value: 'हाँ' },
      { label: 'नहीं, रद्द करें', value: 'नहीं' },
    ],
    status: [
      { label: 'बाकी', value: 'बाकी' },
      { label: 'जारी', value: 'शुरू' },
      { label: 'पूरा', value: 'पूरा' },
    ],
    task: [
      { label: 'स्थिति', value: 'स्थिति' },
      { label: 'नाम', value: 'नाम' },
      { label: 'विवरण', value: 'विवरण' },
      { label: 'तारीख़', value: 'तारीख़' },
      { label: 'किसे दिया', value: 'किसे' },
    ],
    date: [
      { label: 'कल', value: 'कल' },
      { label: 'परसों', value: 'परसों' },
    ],
    time: [
      { label: 'सुबह 9 बजे', value: 'सुबह 9 बजे' },
      { label: 'दोपहर 12 बजे', value: 'दोपहर 12 बजे' },
      { label: 'शाम 5 बजे', value: 'शाम 5 बजे' },
    ],
    description: [{ label: 'विवरण छोड़ें', value: 'छोड़ो' }],
  },
  hinglish: {
    confirm: [
      { label: 'Haan, confirm', value: 'haan' },
      { label: 'Nahi, cancel', value: 'nahi' },
    ],
    status: [
      { label: 'Pending', value: 'pending' },
      { label: 'In progress', value: 'in progress' },
      { label: 'Completed', value: 'completed' },
    ],
    task: [
      { label: 'Status', value: 'status' },
      { label: 'Title', value: 'title' },
      { label: 'Description', value: 'description' },
      { label: 'Due date', value: 'due date' },
      { label: 'Assignee', value: 'assignee' },
    ],
    date: [
      { label: 'Kal', value: 'kal' },
      { label: 'Parso', value: 'parso' },
    ],
    time: [
      { label: '9 baje subah', value: '9 baje subah' },
      { label: '12 baje dopahar', value: '12 baje dopahar' },
      { label: '5 baje shaam', value: '5 baje shaam' },
    ],
    description: [{ label: 'Description skip karo', value: 'skip' }],
  },
};

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tasksService: TasksService,
    private readonly normalizer: ChatNormalizer,
  ) {}

  async getHistory(
    requester: SafeUser,
    conversationId?: string,
  ): Promise<{
    conversationId: string | null;
    conversations: ConversationSummary[];
    messages: ChatHistoryMessage[];
  }> {
    const [savedState, users, tasks] = await Promise.all([
      this.prisma.chatState.findUnique({ where: { userId: requester.id } }),
      this.prisma.user.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, email: true },
      }),
      this.tasksService.list(requester),
    ]);
    const store = savedState
      ? this.parseStore(savedState.data, requester.id)
      : null;
    const conversation =
      conversationId !== undefined
        ? store?.conversations.find((entry) => entry.id === conversationId)
        : store?.conversations.find(
            (entry) => entry.id === store.activeConversationId,
          );
    if (conversationId !== undefined && !conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (
      conversation &&
      store &&
      conversationId !== undefined &&
      store.activeConversationId !== conversation.id
    ) {
      store.activeConversationId = conversation.id;
      await this.saveStore(requester.id, store);
    }
    const visibleTasks = new Map(tasks.map((task) => [task.id, task]));
    const messages: ChatHistoryMessage[] = (conversation?.messages ?? []).map(
      (entry) => ({
        id: entry.id,
        role: entry.role,
        text: entry.content,
        language: entry.language,
        tasks:
          entry.role === 'assistant'
            ? entry.taskIds.flatMap((id) => {
                const task = visibleTasks.get(id);
                return task ? [task] : [];
              })
            : [],
        createdAt: entry.createdAt,
      }),
    );
    const state = conversation &&
      Date.now() - Date.parse(conversation.updatedAt) < 30 * 60_000
      ? conversation.state
      : null;
    const lastMessage = messages.at(-1);
    if (lastMessage?.role === 'assistant' && state) {
      const quickReplies = this.getQuickReplies(
        state,
        state.language ?? lastMessage.language,
        requester,
        users,
        tasks,
      ).quickReplies;
      if (quickReplies?.length) lastMessage.quickReplies = quickReplies;
    }
    const conversations = [...(store?.conversations ?? [])]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(({ id, title, createdAt, updatedAt }) => ({
        id,
        title,
        createdAt,
        updatedAt,
      }));
    return {
      conversationId: conversation?.id ?? null,
      conversations,
      messages,
    };
  }

  async startConversation(requester: SafeUser): Promise<{ conversationId: string }> {
    const saved = await this.prisma.chatState.findUnique({
      where: { userId: requester.id },
    });
    const store = saved
      ? this.parseStore(saved.data, requester.id)
      : this.emptyStore();
    const conversation: StoredConversation = {
      id: randomUUID(),
      title: 'New chat',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      state: null,
      messages: [],
    };
    store.conversations = [...store.conversations, conversation].slice(-20);
    store.activeConversationId = conversation.id;
    await this.saveStore(requester.id, store);
    return { conversationId: conversation.id };
  }

  async clearHistory(requester: SafeUser): Promise<{ ok: true }> {
    await this.prisma.chatState.deleteMany({ where: { userId: requester.id } });
    return { ok: true };
  }

  async handle(
    requester: SafeUser,
    message: string,
    preferredLanguage?: ChatLanguage,
    requestedConversationId?: string,
  ): Promise<ChatReply> {
    const saved = await this.prisma.chatState.findUnique({
      where: { userId: requester.id },
    });
    const store = saved
      ? this.parseStore(saved.data, requester.id)
      : this.emptyStore();
    let conversation = requestedConversationId
      ? store.conversations.find(
          (entry) => entry.id === requestedConversationId,
        )
      : store.conversations.find(
          (entry) => entry.id === store.activeConversationId,
        );
    if (requestedConversationId && !conversation) {
      throw new NotFoundException('Conversation not found');
    }
    if (!conversation) {
      conversation = {
        id: randomUUID(),
        title: 'New chat',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        state: null,
        messages: [],
      };
      store.conversations.push(conversation);
    }
    store.activeConversationId = conversation.id;
    const state =
      saved &&
      Date.now() - Date.parse(conversation.updatedAt) < 30 * 60_000
        ? conversation.state
        : null;

    const [users, tasks] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: { name: 'asc' },
        select: { id: true, name: true, email: true },
      }),
      this.tasksService.list(requester),
    ]);
    const latestAssistant = conversation.messages.at(-1);
    const normalized = await this.normalizer.normalize(
      message,
      state,
      preferredLanguage,
    );
    const selectedUpdateField =
      state?.flow === 'update' && state.slot === 'task'
        ? detectUpdateField(message)
        : null;
    const rawIntent = detectNewCommandIntent(message);
    const hasTaskReference =
      /(?:#\s*\d+|\btask\s+(?:number\s+)?#?\s*\d+\b|\b\d+\s+number\s+task\b|काम\s+(?:नंबर|क्रमांक)\s*\d+)/iu.test(message);
    const explicitUpdateIntent =
      rawIntent === 'update' || detectNewCommandIntent(normalized.instruction) === 'update';
    const contextualTaskIds =
      !state &&
      !hasTaskReference &&
      rawIntent !== 'create' &&
      rawIntent !== 'list' &&
      explicitUpdateIntent &&
      contextualReferenceWords.test(message)
        ? [
            ...new Set(
              latestAssistant?.role === 'assistant'
                ? latestAssistant.taskIds
                : [],
            ),
          ].filter((id) => tasks.some((task) => task.id === id))
        : [];
    const contextualState: EngineState | null =
      contextualTaskIds.length > 1
        ? {
            flow: 'update',
            slot: 'task',
            language: preferredLanguage ?? normalized.language,
            candidates: contextualTaskIds,
            contextMessage: normalized.instruction,
          }
        : null;
    const isExplicitNewFlow =
      rawIntent === 'create' ||
      rawIntent === 'list' ||
      (rawIntent === 'update' && hasTaskReference);
    const keepUpdateFollowUp =
      state?.flow === 'update' &&
      (selectedUpdateField !== null ||
        (state.slot !== 'task' && !isExplicitNewFlow));
    const detectedIntent = detectNewCommandIntent(normalized.instruction);
    const startsNewFlow =
      !keepUpdateFollowUp &&
      ((normalized.fromGemini &&
        (normalized.intent === 'create' ||
          normalized.intent === 'list' ||
          normalized.intent === 'update' ||
          normalized.intent === 'help')) ||
        (!normalized.fromGemini && Boolean(state) && detectedIntent !== null));
    const activeState = startsNewFlow ? null : state;
    const processState = contextualState ?? activeState;
    const language =
      preferredLanguage ??
      (normalized.intent === 'followup' ? processState?.language : undefined) ??
      normalized.language;
    const result = processMessage({
      message: selectedUpdateField
        ? message
        : contextualTaskIds.length === 1
          ? `task #${contextualTaskIds[0]} ${normalized.instruction}`
          : normalized.instruction,
      languageHint: language,
      state: processState,
      me: requester,
      users,
      tasks,
      now: new Date(),
    });

    if (normalized.fromGemini) {
      const expectedIntent =
        processState?.flow === 'create' || processState?.flow === 'update'
          ? 'followup'
          : normalized.intent;
      if (
        (result.type === 'create' &&
          expectedIntent !== 'create' &&
          expectedIntent !== 'followup') ||
        (result.type === 'update' &&
          expectedIntent !== 'update' &&
          expectedIntent !== 'followup') ||
        (result.type === 'reply' &&
          Boolean(result.tasks?.length) &&
          expectedIntent !== 'list' &&
          expectedIntent !== 'update' &&
          expectedIntent !== 'followup')
      ) {
        const safeState = result.type === 'reply' ? result.state : activeState;
        const reply = this.notUnderstoodReply(language);
        await this.saveTurn(
          requester.id,
          store,
          conversation,
          safeState,
          message,
          reply,
          [],
          language,
        );
        return {
          reply,
          tasks: [],
          language,
        };
      }
    }

    if (result.type === 'reply') {
      const responseLanguage =
        preferredLanguage ?? result.state?.language ?? language;
      const quickReplies = this.getQuickReplies(
        result.state,
        responseLanguage,
        requester,
        users,
        tasks,
      ).quickReplies;
      await this.saveTurn(
        requester.id,
        store,
        conversation,
        result.state,
        message,
        result.text,
        result.tasks ?? [],
        responseLanguage,
      );
      return {
        reply: result.text,
        tasks: result.tasks ?? [],
        language: responseLanguage,
        ...(quickReplies?.length ? { quickReplies } : {}),
      };
    }

    const responseLanguage = preferredLanguage ?? result.lang;
    try {
      if (result.type === 'create') {
        const created = await this.tasksService.create(
          {
            title: result.data.title,
            description: result.data.description,
            dueAt: result.data.dueAt,
            assignedToId: result.data.assignedToId,
          },
          requester,
        );
        const reply = this.createdReply(
          responseLanguage,
          created.title,
          created.dueAt,
        );
        await this.saveTurn(
          requester.id,
          store,
          conversation,
          null,
          message,
          reply,
          [created],
          responseLanguage,
        );
        return {
          reply,
          tasks: [created],
          language: responseLanguage,
        };
      }
      const updated = await this.tasksService.update(
        result.taskId,
        result.changes,
        requester,
      );
      const reply = this.updatedReply(
        responseLanguage,
        updated.id,
        updated.title,
        result.changes.dueAt ? updated.dueAt : undefined,
      );
      await this.saveTurn(
        requester.id,
        store,
        conversation,
        null,
        message,
        reply,
        [updated],
        responseLanguage,
      );
      return {
        reply,
        tasks: [updated],
        language: responseLanguage,
      };
    } catch (error) {
      if (error instanceof ForbiddenException) {
        const response = error.getResponse();
        const messageText =
          typeof response === 'string'
            ? response
            : typeof response === 'object' && response !== null && 'message' in response
              ? response.message
              : '';
        const localized =
          messageText === ASSIGNEE_UPDATE_FORBIDDEN_MESSAGE
            ? permissionReplies[responseLanguage].assigned
            : messageText === TASK_FORBIDDEN_MESSAGE
              ? permissionReplies[responseLanguage].denied
              : null;
        if (localized) {
          await this.saveTurn(
            requester.id,
            store,
            conversation,
            null,
            message,
            localized,
            [],
            responseLanguage,
          );
          return { reply: localized, tasks: [], language: responseLanguage };
        }
      }
      if (error instanceof NotFoundException) {
        const reply = this.notFoundReply(responseLanguage);
        await this.saveTurn(
          requester.id,
          store,
          conversation,
          null,
          message,
          reply,
          [],
          responseLanguage,
        );
        return {
          reply,
          tasks: [],
          language: responseLanguage,
        };
      }
      throw error;
    }
  }

  private getQuickReplies(
    state: EngineState | null,
    language: ChatLanguage,
    requester: SafeUser,
    users: SafeUser[],
    tasks: TaskView[],
  ): Pick<ChatReply, 'quickReplies'> {
    if (!state?.slot) return {};
    let quickReplies = quickReplyText[language][state.slot];
    if (state.slot === 'assignee') {
      const assignees = users.slice(0, 4);
      if (!assignees.some((user) => user.id === requester.id)) {
        assignees.unshift(requester);
      }
      quickReplies = assignees.map((user) => ({
        label: user.name,
        value: user.name,
      }));
    } else if (
      state.slot === 'task' &&
      state.flow === 'update' &&
      state.taskId !== undefined
    ) {
      quickReplies = quickReplyText[language].task;
    } else if (state.slot === 'task' && state.candidates?.length) {
      quickReplies = state.candidates
        .slice(0, 5)
        .flatMap((id) => {
          const task = tasks.find((entry) => entry.id === id);
          return task
            ? [{ label: `#${task.id} · ${task.title}`, value: `#${task.id}` }]
            : [];
        });
    }
    return quickReplies?.length ? { quickReplies } : {};
  }

  private emptyStore(): PersistedChatStore {
    return { version: 2, activeConversationId: null, conversations: [] };
  }

  private parseStore(data: string, userId: number): PersistedChatStore {
    try {
      const parsed: unknown = JSON.parse(data);
      if (this.isPersistedChatStore(parsed)) return parsed;
      if (this.isLegacyConversation(parsed)) {
        const timestamp = new Date().toISOString();
        const conversation: StoredConversation = {
          id: this.legacyConversationId(userId),
          title: this.getConversationTitle(parsed.messages),
          createdAt: parsed.messages[0]?.createdAt ?? timestamp,
          updatedAt: parsed.messages.at(-1)?.createdAt ?? timestamp,
          state: parsed.state,
          messages: parsed.messages,
        };
        return {
          version: 2,
          activeConversationId: conversation.id,
          conversations: [conversation],
        };
      }
      if (this.isEngineState(parsed)) {
        const timestamp = new Date().toISOString();
        const conversation: StoredConversation = {
          id: this.legacyConversationId(userId),
          title: 'Previous chat',
          createdAt: timestamp,
          updatedAt: timestamp,
          state: parsed,
          messages: [],
        };
        return {
          version: 2,
          activeConversationId: conversation.id,
          conversations: [conversation],
        };
      }
      return this.emptyStore();
    } catch {
      return this.emptyStore();
    }
  }

  private isPersistedChatStore(value: unknown): value is PersistedChatStore {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('conversations' in value)
    ) {
      return false;
    }
    const store = value as {
      version?: unknown;
      activeConversationId?: unknown;
      conversations?: unknown;
    };
    return (
      store.version === 2 &&
      (store.activeConversationId === null ||
        (typeof store.activeConversationId === 'string' &&
          store.conversations instanceof Array &&
          store.conversations.some(
            (entry) =>
              typeof entry === 'object' &&
              entry !== null &&
              'id' in entry &&
              entry.id === store.activeConversationId,
          ))) &&
      Array.isArray(store.conversations) &&
      store.conversations.length <= 20 &&
      store.conversations.every((entry) => this.isStoredConversation(entry))
    );
  }

  private isLegacyConversation(
    value: unknown,
  ): value is LegacyPersistedConversation {
    if (typeof value !== 'object' || value === null || !('messages' in value)) {
      return false;
    }
    const legacy = value as {
      version?: unknown;
      state?: unknown;
      messages?: unknown;
    };
    return (
      (legacy.version === undefined || legacy.version === 1) &&
      (legacy.state === null || this.isEngineState(legacy.state)) &&
      Array.isArray(legacy.messages) &&
      legacy.messages.length <= 100 &&
      legacy.messages.every((message) => this.isStoredChatMessage(message))
    );
  }

  private isStoredConversation(value: unknown): value is StoredConversation {
    if (typeof value !== 'object' || value === null) return false;
    const conversation = value as {
      id?: unknown;
      title?: unknown;
      createdAt?: unknown;
      updatedAt?: unknown;
      state?: unknown;
      messages?: unknown;
    };
    return (
      typeof conversation.id === 'string' &&
      conversation.id.length <= 64 &&
      typeof conversation.title === 'string' &&
      conversation.title.length <= 100 &&
      typeof conversation.createdAt === 'string' &&
      !Number.isNaN(Date.parse(conversation.createdAt)) &&
      typeof conversation.updatedAt === 'string' &&
      !Number.isNaN(Date.parse(conversation.updatedAt)) &&
      (conversation.state === null || this.isEngineState(conversation.state)) &&
      Array.isArray(conversation.messages) &&
      conversation.messages.length <= 100 &&
      conversation.messages.every((message) => this.isStoredChatMessage(message))
    );
  }

  private isStoredChatMessage(value: unknown): value is StoredChatMessage {
    if (typeof value !== 'object' || value === null) return false;
    const message = value as {
      id?: unknown;
      role?: unknown;
      content?: unknown;
      language?: unknown;
      taskIds?: unknown;
      createdAt?: unknown;
    };
    return (
      Number.isInteger(message.id) &&
      (message.role === 'user' || message.role === 'assistant') &&
      typeof message.content === 'string' &&
      message.content.length <= 5000 &&
      typeof message.language === 'string' &&
      this.isChatLanguage(message.language) &&
      Array.isArray(message.taskIds) &&
      message.taskIds.every((id) => Number.isInteger(id) && Number(id) > 0) &&
      typeof message.createdAt === 'string' &&
      !Number.isNaN(Date.parse(message.createdAt))
    );
  }

  private isEngineState(value: unknown): value is EngineState {
    if (typeof value !== 'object' || value === null || !('flow' in value)) {
      return false;
    }
    const state = value as {
      flow?: unknown;
      slot?: unknown;
      language?: unknown;
      contextMessage?: unknown;
    };
    return (
      (state.flow === 'create' || state.flow === 'update') &&
      (state.slot === undefined ||
        ['title', 'assignee', 'date', 'time', 'description', 'status', 'task', 'confirm'].includes(
          String(state.slot),
        )) &&
      (state.language === undefined ||
        state.language === 'en' ||
        state.language === 'hi' ||
        state.language === 'hinglish') &&
      (state.contextMessage === undefined ||
        (typeof state.contextMessage === 'string' &&
          state.contextMessage.length <= 500))
    );
  }

  private async saveTurn(
    userId: number,
    store: PersistedChatStore,
    conversation: StoredConversation,
    state: EngineState | null,
    userMessage: string,
    assistantMessage: string,
    tasks: TaskView[],
    language: ChatLanguage,
  ): Promise<void> {
    const timestamp = new Date().toISOString();
    const messages = [...conversation.messages];
    const nextId = Math.max(Date.now(), (messages.at(-1)?.id ?? 0) + 1);
    messages.push(
      {
        id: nextId,
        role: 'user',
        content: userMessage,
        language,
        taskIds: [],
        createdAt: timestamp,
      },
      {
        id: nextId + 1,
        role: 'assistant',
        content: assistantMessage,
        language,
        taskIds: tasks.map((task) => task.id),
        createdAt: timestamp,
      },
    );
    conversation.state = state;
    conversation.messages = messages.slice(-100);
    conversation.updatedAt = timestamp;
    if (conversation.title === 'New chat') {
      conversation.title =
        userMessage.trim().slice(0, 100) || 'New chat';
    }
    store.activeConversationId = conversation.id;
    await this.saveStore(userId, store);
  }

  private saveStore(userId: number, store: PersistedChatStore): Promise<unknown> {
    const data = JSON.stringify({
      ...store,
      conversations: store.conversations.slice(-20),
    });
    return this.prisma.chatState.upsert({
      where: { userId },
      create: { userId, data },
      update: { data, updatedAt: new Date() },
    });
  }

  private getConversationTitle(messages: StoredChatMessage[]): string {
    const firstUserMessage = messages.find((message) => message.role === 'user');
    return firstUserMessage?.content.trim().slice(0, 100) || 'Previous chat';
  }

  private legacyConversationId(userId: number): string {
    return `00000000-0000-4000-8000-${String(userId).padStart(12, '0')}`;
  }

  private isChatLanguage(value: string): value is ChatLanguage {
    return value === 'en' || value === 'hi' || value === 'hinglish';
  }

  private createdReply(
    language: ChatLanguage,
    title: string,
    dueAt: string,
  ): string {
    const date = formatChatDateTime(new Date(dueAt), language);
    switch (language) {
      case 'hi':
        return `“${title}” काम बना दिया। ड्यू डेट: ${date}।`;
      case 'hinglish':
        return `“${title}” task create ho gaya. Due date: ${date}.`;
      default:
        return `Created “${title}”. Due: ${date}.`;
    }
  }

  private updatedReply(
    language: ChatLanguage,
    taskId: number,
    title: string,
    dueAt?: string,
  ): string {
    if (!dueAt) {
      if (language === 'hi') return `#${taskId} “${title}” काम अपडेट हो गया।`;
      if (language === 'hinglish') return `Task #${taskId} “${title}” update ho gaya.`;
      return `Task #${taskId} “${title}” updated.`;
    }
    const date = formatChatDateTime(new Date(dueAt), language);
    if (language === 'hi') return `#${taskId} “${title}” अपडेट हो गया। ड्यू डेट: ${date}।`;
    if (language === 'hinglish') return `Task #${taskId} “${title}” update ho gaya. Due date: ${date}.`;
    return `Task #${taskId} “${title}” updated. Due: ${date}.`;
  }

  private notFoundReply(language: ChatLanguage): string {
    if (language === 'hi') return 'वह काम अब मौजूद नहीं है।';
    if (language === 'hinglish') return 'Woh task ab nahi mila.';
    return 'That task could not be found.';
  }

  private notUnderstoodReply(language: ChatLanguage): string {
    if (language === 'hi') {
      return 'माफ़ कीजिए, मैं आपका अनुरोध ठीक से समझ नहीं पाया। क्या आप इसे दूसरे तरीके से बता सकते हैं?';
    }
    if (language === 'hinglish') {
      return 'Sorry, main request samajh nahi paaya. Kya aap ise thoda alag tarah se bol sakte ho?';
    }
    return 'Sorry, I couldn’t understand that request. Could you rephrase it?';
  }
}
