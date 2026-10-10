import type { SafeUser, TaskView } from '../shared/types.js';
import { parseDateTime } from './date-parser.js';
import {
  chatDate,
  chatTime,
  dateInChatTimeZone,
  dateTimeInChatTimeZone,
  formatChatDateTime,
} from './chat-timezone.js';

export type ChatLanguage = 'en' | 'hi' | 'hinglish';
export type FollowUpSlot = 'title' | 'assignee' | 'date' | 'time' | 'description' | 'status' | 'task' | 'confirm';

export interface EngineState {
  flow?: 'create' | 'update';
  slot?: FollowUpSlot;
  language?: ChatLanguage;
  title?: string;
  description?: string;
  assignedToId?: number;
  date?: string;
  time?: string;
  taskId?: number;
  candidates?: number[];
  contextMessage?: string;
  changes?: {
    title?: string;
    description?: string;
    date?: string;
    time?: string;
    assignedToId?: number;
    status?: TaskView['status'];
  };
}

export interface EngineInput {
  message: string;
  languageHint?: ChatLanguage;
  state: EngineState | null;
  me: SafeUser;
  users: SafeUser[];
  tasks: TaskView[];
  now: Date;
}

export type EngineResult =
  | { type: 'reply'; text: string; tasks?: TaskView[]; state: EngineState | null }
  | {
      type: 'create';
      data: { title: string; description: string; dueAt: string; assignedToId: number };
      lang: ChatLanguage;
    }
  | {
      type: 'update';
      taskId: number;
      changes: {
        title?: string;
        description?: string;
        dueAt?: string;
        assignedToId?: number;
        status?: TaskView['status'];
      };
      lang: ChatLanguage;
    };

const words = {
  en: {
    help: 'I can create, find, and update tasks. Try “Create a task to call Maya tomorrow at 5pm”, “Show my pending tasks”, or “Complete task #3”.',
    title: 'What should the task be called?',
    assignee: 'Who should I assign it to? You can say “me” or give a name.',
    date: 'What day is it due?',
    time: 'What time should it be due?',
    description: 'Add a short description, or say “skip”.',
    task: 'Which task did you mean? Reply with its number.',
    datePast: 'That due date is in the past. What future date should I use?',
    created: 'I have all the details. Creating your task now.',
    emptyList: 'I couldn’t find any matching tasks.',
    list: (n: number) => `Here ${n === 1 ? 'is' : 'are'} ${n} matching task${n === 1 ? '' : 's'}.`,
    updated: 'Task updated.',
    noTask: 'I couldn’t identify that task. Here are your open tasks; tell me which one to change.',
    whatChange: 'What would you like to change: its status, title, description, due date, or assignee?',
    updateTitle: 'What should the new title be?',
    updateDescription: 'What should the new description be?',
    updateDate: 'What should the new due date and time be?',
    updateStatus: 'What status should I set: pending, in progress, or completed?',
    ambiguous: 'I found a few possible tasks. Which one did you mean?',
    canceled: 'Okay, I cancelled that request.',
    noMatch: 'I couldn’t match that name to a user. Who should I assign it to?',
    permission: 'You can update the status of a task assigned to you, but only its creator can change its other details.',
    denied: 'You do not have permission to modify that task.',
    alreadyAssigned: 'That task is already assigned to this person.',
    confirmChange: (task: string, change: string) =>
      `Confirm this change to “${task}”: ${change}?`,
    confirmDate: (date: string) => `set the due date to ${date}`,
    confirmAssignee: (name: string) => `assign it to ${name}`,
    yesNo: 'Please choose Yes to confirm or No to cancel.',
    canceledChange: 'Okay, I left the task unchanged.',
  },
  hi: {
    help: 'मैं काम बनाने, ढूँढने और अपडेट करने में मदद कर सकता हूँ। जैसे “कल शाम 5 बजे रिपोर्ट भेजने का काम बनाओ” या “मेरे बाकी काम दिखाओ”।',
    title: 'इस काम का नाम क्या रखें?',
    assignee: 'यह काम किसे देना है? “मुझे” या किसी का नाम बताइए।',
    date: 'यह काम किस तारीख़ तक पूरा करना है?',
    time: 'कितने बजे तक पूरा करना है?',
    description: 'छोटा विवरण लिखें या “छोड़ो” कहें।',
    task: 'आप किस काम की बात कर रहे हैं? उसका नंबर बताइए।',
    datePast: 'यह तारीख़ बीत चुकी है। कोई आने वाली तारीख़ बताइए।',
    created: 'सारी जानकारी मिल गई। काम बनाया जा रहा है।',
    emptyList: 'मुझे इससे मेल खाते काम नहीं मिले।',
    list: (n: number) => `${n} मेल खाते काम मिले।`,
    updated: 'काम अपडेट हो गया।',
    noTask: 'कौन सा काम बदलना है, यह समझ नहीं आया। आपके खुले काम ये हैं—कौन सा?',
    whatChange: 'क्या बदलना है—स्थिति, नाम, विवरण, तारीख़ या किसे दिया गया है?',
    updateTitle: 'काम का नया नाम क्या रखें?',
    updateDescription: 'काम का नया विवरण क्या हो?',
    updateDate: 'नई तारीख़ और समय क्या रखें?',
    updateStatus: 'कौन सी स्थिति रखें—बाकी, जारी, या पूरा?',
    ambiguous: 'कई काम मिले। आप किस काम की बात कर रहे हैं?',
    canceled: 'ठीक है, अनुरोध रद्द कर दिया।',
    noMatch: 'इस नाम का कोई उपयोगकर्ता नहीं मिला। काम किसे देना है?',
    permission: 'आपको दिए गए काम की स्थिति बदल सकते हैं, बाकी जानकारी केवल बनाने वाला बदल सकता है।',
    denied: 'आपको इस काम को बदलने की अनुमति नहीं है।',
    alreadyAssigned: 'यह काम पहले से ही इसी व्यक्ति को दिया गया है।',
    confirmChange: (task: string, change: string) =>
      `“${task}” में यह बदलाव करूँ: ${change}?`,
    confirmDate: (date: string) => `ड्यू डेट ${date} रखें`,
    confirmAssignee: (name: string) => `${name} को काम दें`,
    yesNo: 'पुष्टि के लिए “हाँ” या रद्द करने के लिए “नहीं” चुनें।',
    canceledChange: 'ठीक है, काम में कोई बदलाव नहीं किया।',
  },
  hinglish: {
    help: 'Main tasks bana, dhoondh aur update kar sakta hoon. Jaise “kal 5pm report bhejne ka task banao”, “mere pending tasks dikhao”, ya “task #3 complete karo”.',
    title: 'Task ka naam kya rakhein?',
    assignee: 'Kisko assign karna hai? “Mujhe” ya naam batao.',
    date: 'Kis date tak complete karna hai?',
    time: 'Kitne baje tak chahiye?',
    description: 'Chhota description do ya “skip” bolo.',
    task: 'Kaunsa task? Uska number batao.',
    datePast: 'Yeh due date beet chuki hai. Koi future date batao.',
    created: 'Details mil gayi. Task create kar raha hoon.',
    emptyList: 'Koi matching task nahi mila.',
    list: (n: number) => `${n} matching task${n === 1 ? '' : 's'} mile.`,
    updated: 'Task update ho gaya.',
    noTask: 'Kaunsa task change karna hai samajh nahi aaya. Yeh aapke open tasks hain—kaunsa?',
    whatChange: 'Kya change karna hai: status, title, description, due date, ya assignee?',
    updateTitle: 'Naya title kya rakhna hai?',
    updateDescription: 'Naya description kya hona chahiye?',
    updateDate: 'Nayi due date aur time kya rakhein?',
    updateStatus: 'Kaunsa status rakhein: pending, in progress, ya completed?',
    ambiguous: 'Kuch tasks match hue. Kaunsa wala?',
    canceled: 'Theek hai, request cancel kar di.',
    noMatch: 'Is naam ka user nahi mila. Kisko assign karna hai?',
    permission: 'Aap assigned task ka status update kar sakte ho; baaki details sirf creator change kar sakta hai.',
    denied: 'Aapko yeh task modify karne ki permission nahi hai.',
    alreadyAssigned: 'Yeh task pehle se isi person ko assigned hai.',
    confirmChange: (task: string, change: string) =>
      `“${task}” mein yeh change karun: ${change}?`,
    confirmDate: (date: string) => `due date ${date} set karun`,
    confirmAssignee: (name: string) => `${name} ko assign karun`,
    yesNo: 'Confirm ke liye “haan”, cancel ke liye “nahi” chuno.',
    canceledChange: 'Theek hai, task mein koi change nahi kiya.',
  },
} as const;

const createWords = /(?:\b(?:create|add|new|make|banao|bana|banado|task\s+do)\b|बनाओ|बना\s*दो)/iu;
const listWords = /(?:\b(?:show|list|find|search|dikhao|batao|dhundo|dhoondo|mere|all|everything|saare|sare|sab)\b|दिखाओ|बताओ|ढूँढो|खोजो|सारे|सभी|सब)/iu;
const updateWords = /(?:\b(?:change|update|edit|reschedule|complete|completed|done|finish|mark|status|badlo|kar|karo|ho\s+gaya|pura|shuru|chalu)\b|बदल(?:ो|ें|िए|\s*दो)?|पूरा|हो\s*गया|शुरू|कर(?:\s*दो|\s*दीजिए|\s*दें)?)/iu;
const greetingWords = /(?:\b(?:hi|hello|hey|help|namaste|namaskar)\b|नमस्ते|नमस्कार|मदद)/iu;
const cancelWords = /^(?:cancel|stop|never mind|nevermind|रद्द|chhodo)$/iu;
const hinglishWords = /(?:\b(?:ko|karo|kal|aaj|hai|baje|shaam|banao|dikhao|mujhe|mera|mere|nahi|tak|mein|ke|liye|baaki|parso)\b)/iu;
const wordBoundary = (value: string) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(value)}(?:$|[^\\p{L}\\p{N}])`, 'iu');
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

function detectLanguage(message: string, previous?: ChatLanguage): ChatLanguage {
  if (/\p{Script=Devanagari}/u.test(message)) return 'hi';
  if (hinglishWords.test(message)) return 'hinglish';
  if (previous && message.trim().split(/\s+/u).length <= 3) return previous;
  return 'en';
}

function transliterate(value: string): string {
  const map: Record<string, string> = {
    'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au',
    'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh',
    'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
    'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v',
    'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h', 'ं': 'n', 'ँ': 'n', 'ा': 'a', 'ि': 'i', 'ी': 'i',
    'ु': 'u', 'ू': 'u', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', '्': '',
  };
  return [...value].map((letter) => map[letter] ?? letter).join('').toLowerCase().replace(/a$/u, '');
}

function matchUser(name: string, users: SafeUser[]): SafeUser | undefined {
  const normalized = name.trim().toLowerCase();
  const latin = transliterate(normalized);
  return users.find((user) => {
    const userName = user.name.toLowerCase();
    return userName === normalized || userName.includes(normalized) || userName.includes(latin);
  });
}

function extractAssignee(
  message: string,
  users: SafeUser[],
  me: SafeUser,
): { user?: SafeUser; phrase?: string } {
  const meMatch = message.match(/(?:\b(?:me|myself|mujhe|mere\s+liye)\b|मुझे|मेरे\s+लिए)/iu);
  if (meMatch) return { user: me, phrase: meMatch[0] };

  const cue = message.match(
    /(?:\b(?:reassign(?:\s+to)?|assign(?:\s+to)?|assigned\s+to|assignee(?:\s+(?:to|as))?|owner(?:\s+(?:to|as))?|for)\s+([\p{L}][^\n,;]{0,80})|\b([\p{L}][\p{L}\s'-]{0,40}?)\s+(?:ko|ke\s+liye)\b|([\p{Script=Devanagari}]+)\s+को)/iu,
  );
  if (!cue) return {};
  const captured = cue[1] ?? cue[2] ?? cue[3] ?? '';
  for (const user of users) {
    if (user.id === me.id && /^(?:me|myself|mujhe|mere\s+liye)$/iu.test(captured)) {
      return { user, phrase: cue[0] };
    }
    const name = user.name.split(/\s+/u)[0] ?? user.name;
    if (name && (captured.toLowerCase().includes(name.toLowerCase()) ||
      transliterate(captured).includes(name.toLowerCase()))) {
      const cueStart = cue[0].search(/(?:assign(?:\s+to)?|for)\s+/iu);
      if (cueStart >= 0) {
        const prefix = cue[0].slice(0, cueStart);
        const capturedName = new RegExp(
          `(?:assign(?:\\s+to)?|for)\\s+${escapeRegExp(name)}(?:\\s+[\\p{L}]+)?`,
          'iu',
        ).exec(cue[0]);
        return { user, phrase: `${prefix}${capturedName?.[0] ?? cue[0].slice(cueStart)}` };
      }
      const hindiCue = new RegExp(
        `${escapeRegExp(name)}\\s+(?:ko|ke\\s+liye|को|के\\s+लिए)`,
        'iu',
      ).exec(cue[0]);
      if (hindiCue) return { user, phrase: hindiCue[0] };
      const hindiNameCue = /[\p{Script=Devanagari}]+\s+को/u.exec(cue[0]);
      if (hindiNameCue) return { user, phrase: hindiNameCue[0] };
      return { user, phrase: cue[0] };
    }
  }
  return { phrase: cue[0] };
}

function stripCreatePhrases(
  message: string,
  assigneePhrase: string | undefined,
  parsedLeftover: string,
): string {
  let title = parsedLeftover;
  if (assigneePhrase) title = title.replace(assigneePhrase, ' ');
  title = title
    .replace(/^(?:please\s+)?(?:create|add|make|new|banao|bana\s*do|task\s+do)\s+(?:a\s+)?(?:new\s+)?(?:task\s+)?/iu, '')
    .replace(/^(?:task\s+)?(?:bana|banao)\s*/iu, '')
    .replace(/\b(?:create|add|make|new|banao|bana|banado|task\s+do|task|please|for|assign|to|by|ka|ki|ke|ko|tak)\b/giu, ' ')
    .replace(/(?:काम\s*(?:बनाओ|बना\s*दो)|बनाओ|बना\s*दो|को|के\s+लिए|का|की|के|तक|में)/gu, ' ')
    .replace(/^[\s:,-]+|[\s:,-]+$/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  const quoted = message.match(/["“](.+?)["”]/u);
  return quoted?.[1]?.trim() || title;
}

function datetime(data: Pick<EngineState, 'date' | 'time'>, now: Date): string {
  const day = data.date;
  const time = data.time;
  if (!day || !time) return '';
  const due = dateTimeInChatTimeZone(day, time);
  if (due.getTime() < now.getTime()) return '';
  return due.toISOString();
}

function parseChatDateTime(
  message: string,
  now: Date,
  options?: { bareNumberAsDayOfMonth?: boolean },
) {
  return parseDateTime(message, dateInChatTimeZone(now), options);
}

function nextCreateSlot(state: EngineState): FollowUpSlot | null {
  if (!state.title?.trim()) return 'title';
  if (state.assignedToId === undefined) return 'assignee';
  if (!state.date) return 'date';
  if (!state.time) return 'time';
  if (state.description === undefined) return 'description';
  return null;
}

function slotQuestion(lang: ChatLanguage, slot: FollowUpSlot): string {
  const template = words[lang];
  if (slot === 'status') return template.updateStatus;
  if (slot === 'task') return template.task;
  if (slot === 'confirm') return template.yesNo;
  return template[slot];
}

function reply(
  text: string,
  state: EngineState | null = null,
  tasks?: TaskView[],
): EngineResult {
  return { type: 'reply', text, state, ...(tasks ? { tasks } : {}) };
}

function fullCreate(
  state: EngineState,
  language: ChatLanguage,
  now: Date,
): EngineResult | null {
  if (state.date && state.time && !datetime(state, now)) {
    return reply(words[language].datePast, {
      ...state,
      flow: 'create',
      slot: 'date',
      date: undefined,
      language,
    });
  }
  const slot = nextCreateSlot(state);
  if (slot) return reply(slotQuestion(language, slot), { ...state, flow: 'create', slot, language });
  const dueAt = datetime(state, now);
  if (!dueAt) {
    return reply(words[language].datePast, {
      ...state,
      flow: 'create',
      slot: 'date',
      date: undefined,
      language,
    });
  }
  return {
    type: 'create',
    data: {
      title: state.title ?? '',
      description: state.description || state.title || '',
      dueAt,
      assignedToId: state.assignedToId ?? 0,
    },
    lang: language,
  };
}

function statusFrom(message: string): TaskView['status'] | undefined {
  if (/(?:\b(?:complete|completed|done|finish|pura|ho\s+gaya)\b|पूरा|हो\s*गया)/iu.test(message)) return 'COMPLETED';
  if (/(?:\b(?:in\s+progress|start|shuru|chalu)\b|शुरू)/iu.test(message)) return 'IN_PROGRESS';
  if (/(?:\b(?:pending|reopen|baaki)\b|बाकी)/iu.test(message)) return 'PENDING';
  return undefined;
}

export function detectUpdateField(
  message: string,
): Exclude<FollowUpSlot, 'time' | 'task' | 'confirm'> | null {
  const value = message.trim().toLowerCase().replace(/[.!?।]+$/gu, '').trim();
  if (/^(?:status|state|progress|स्थिति|स्टेटस|haalat)$/iu.test(value)) return 'status';
  if (/^(?:title|name|task\s+name|rename|नाम|शीर्षक)$/iu.test(value)) return 'title';
  if (/^(?:description|details?|विवरण|जानकारी)$/iu.test(value)) return 'description';
  if (/^(?:due\s*date|date|deadline|time|तारीख़?|तिथि|समय|डेडलाइन)$/iu.test(value)) return 'date';
  if (/^(?:assignee|assigned\s+to|owner|person|किसे|किसको|जिम्मेदार)$/iu.test(value)) return 'assignee';
  return null;
}

function matchTasks(message: string, tasks: TaskView[]): TaskView[] {
  const byId = message.match(
    /#\s*(\d+)|\btask\s+(?:number\s+)?#?\s*(\d+)\b|\b(\d+)\s+number\s+task\b|काम\s+(?:नंबर|क्रमांक)\s*(\d+)/iu,
  );
  if (byId) {
    const id = Number(byId[1] ?? byId[2] ?? byId[3] ?? byId[4]);
    const exact = tasks.find((task) => task.id === id);
    if (exact) return [exact];
  }
  const quote = message.match(/["“](.+?)["”]/u);
  const query = (quote?.[1] ?? message)
    .toLowerCase()
    .replace(/(?:#\s*\d+|\b\d+\b)/gu, ' ')
    .replace(/\b(?:task|please|update|change|edit|complete|completed|done|mark|the|a|an|is|to|status|of|badlo|karo|kar|ho|gaya|pura|mein|ko|hai)\b/giu, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/u)
    .filter((part) => part.length > 1);
  if (quote) {
    const quotedMatches = tasks.filter((task) =>
      `${task.title} ${task.description}`.toLowerCase().includes(query.join(' ')),
    );
    if (quotedMatches.length) return quotedMatches;
  }
  if (!query.length) return [];
  const scored = tasks
    .map((task) => {
      const haystack = `${task.title} ${task.description}`.toLowerCase();
      const score = query.reduce((sum, token) => sum + (wordBoundary(token).test(haystack) ? 1 : 0), 0);
      return { task, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.task.dueAt.localeCompare(b.task.dueAt));
  const best = scored[0]?.score ?? 0;
  return scored.filter((item) => item.score === best).map((item) => item.task);
}

function openTasks(tasks: TaskView[]): TaskView[] {
  return tasks.filter((task) => task.status !== 'COMPLETED');
}

function listTasks(message: string, input: EngineInput, language: ChatLanguage): EngineResult {
  const normalized = message.toLowerCase();
  let selected = [...input.tasks];
  const parsedDate = parseChatDateTime(message, input.now).date;
  if (/(?:\bpending\b|\bbaaki\b|बाकी)/iu.test(normalized)) {
    selected = selected.filter((task) => task.status === 'PENDING');
  } else if (/(?:\bin\s+progress\b|\bchalu\b|\bshuru\b|शुरू)/iu.test(normalized)) {
    selected = selected.filter((task) => task.status === 'IN_PROGRESS');
  } else if (/(?:\bcompleted\b|\bcomplete\b|\bdone\b|पूरा)/iu.test(normalized)) {
    selected = selected.filter((task) => task.status === 'COMPLETED');
  }
  if (/\b(?:overdue|late|past due)\b|देरी/iu.test(normalized)) {
    selected = selected.filter((task) => task.status !== 'COMPLETED' && new Date(task.dueAt) < input.now);
  }
  if (/\b(?:my tasks|mere tasks|assigned to me)\b|मेरे काम/iu.test(normalized)) {
    selected = selected.filter((task) => task.assignedTo.id === input.me.id);
  }
  if (/\b(?:assigned by me|i assigned)\b|मेरे द्वारा/iu.test(normalized)) {
    selected = selected.filter((task) => task.assignedBy.id === input.me.id);
  }
  if (parsedDate && (/\bdue\b|\btoday\b|\btomorrow\b|\baaj\b|\bkal\b|आज|कल|परसों/iu.test(normalized) ||
      /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/iu.test(normalized))) {
    selected = selected.filter((task) => {
      const due = new Date(task.dueAt);
      const dueDate = chatDate(due);
      return dueDate === parsedDate;
    });
  }
  const id = normalized.match(/#\s*(\d+)|\btask\s+(\d+)\b/iu);
  if (id) selected = selected.filter((task) => task.id === Number(id[1] ?? id[2]));

  const userFilter = input.users.find((user) => {
    if (user.id === input.me.id) return false;
    const firstName = user.name.split(/\s+/u)[0]?.toLowerCase() ?? '';
    return firstName.length > 1 && wordBoundary(firstName).test(normalized);
  });
  if (userFilter) {
    selected = selected.filter(
      (task) => task.assignedTo.id === userFilter.id || task.assignedBy.id === userFilter.id,
    );
  }

  const tokens = normalized
    .replace(/(?:show|list|find|search|dikhao|batao|dhundo|dhoondo|tasks?|mere|my|pending|overdue|late|assigned|by|to|me|today|tomorrow|aaj|kal|hai|dikha|mujhe|all|everything|saare|sare|sab|kaam|kam|सारे|सभी|सब|काम|कार्य|दिखाओ|बताओ|ढूँढो|खोजो)/giu, ' ')
    .split(/\s+/u)
    .filter((token) => token.length > 2 && !input.users.some((user) => user.name.toLowerCase().includes(token)));
  if (tokens.length) {
    selected = selected.filter((task) => {
      const content = `${task.title} ${task.description}`.toLowerCase();
      return tokens.every((token) => content.includes(token));
    });
  }
  selected.sort(
    (a, b) =>
      Number(a.status === 'COMPLETED') - Number(b.status === 'COMPLETED') ||
      a.dueAt.localeCompare(b.dueAt),
  );
  return selected.length
    ? reply(words[language].list(selected.length), null, selected)
    : reply(words[language].emptyList);
}

function createInitial(input: EngineInput, language: ChatLanguage): EngineResult {
  const assignee = extractAssignee(input.message, input.users, input.me);
  const parsed = parseChatDateTime(input.message, input.now);
  const description = input.message.match(/(?:description|details?)\s*:\s*(.+)$/iu)?.[1]?.trim();
  const titleInput = description
    ? parsed.leftover.replace(/(?:description|details?)\s*:\s*.+$/iu, ' ')
    : parsed.leftover;
  const state: EngineState = {
    flow: 'create',
    language,
    title: stripCreatePhrases(input.message, assignee.phrase, titleInput),
    ...(assignee.user ? { assignedToId: assignee.user.id } : {}),
    ...(parsed.date ? { date: parsed.date } : {}),
    ...(parsed.time ? { time: parsed.time } : {}),
    ...(description ? { description } : {}),
  };
  if (assignee.phrase && !assignee.user) {
    return reply(words[language].noMatch, { ...state, slot: 'assignee' });
  }
  return fullCreate(state, language, input.now) ?? reply(words[language].created);
}

function fillCreate(input: EngineInput, state: EngineState, language: ChatLanguage): EngineResult {
  const answer = input.message.trim();
  switch (state.slot) {
    case 'title': {
      const parsed = parseChatDateTime(answer, input.now);
      return fullCreate({
        ...state,
        title: parsed.leftover || answer,
        ...(parsed.date ? { date: parsed.date } : {}),
        ...(parsed.time ? { time: parsed.time } : {}),
      }, language, input.now) ?? reply(words[language].created);
    }
    case 'assignee': {
      const assignee = extractAssignee(answer, input.users, input.me);
      const candidate = assignee.user ?? matchUser(answer.replace(/(?:ko|ke\s+liye|को|के\s+लिए)/giu, ''), input.users);
      if (!candidate) return reply(words[language].noMatch, state);
      const parsed = parseChatDateTime(answer, input.now);
      return fullCreate({
        ...state,
        assignedToId: candidate.id,
        ...(parsed.date ? { date: parsed.date } : {}),
        ...(parsed.time ? { time: parsed.time } : {}),
      }, language, input.now) ?? reply(words[language].created);
    }
    case 'date': {
      const parsed = parseChatDateTime(answer, input.now, {
        bareNumberAsDayOfMonth: true,
      });
      if (!parsed.date) return reply(words[language].datePast, state);
      return fullCreate({ ...state, date: parsed.date, ...(parsed.time ? { time: parsed.time } : {}) }, language, input.now) ?? reply(words[language].created);
    }
    case 'time': {
      const parsed = parseChatDateTime(answer, input.now);
      if (!parsed.time) return reply(words[language].time, state);
      return fullCreate({ ...state, time: parsed.time }, language, input.now) ?? reply(words[language].created);
    }
    case 'description':
      return fullCreate({ ...state, description: /^(?:skip|no description|छोड़ो|छोड़ दीजिए)$/iu.test(answer) ? state.title : answer }, language, input.now) ?? reply(words[language].created);
    default:
      return reply(words[language].help);
  }
}

function extractChanges(
  message: string,
  task: TaskView,
  users: SafeUser[],
  me: SafeUser,
  now: Date,
): EngineState['changes'] {
  const changes: NonNullable<EngineState['changes']> = {};
  const status = statusFrom(message);
  if (status) changes.status = status;
  const titleMatch = message.match(
    /(?:\b(?:title|name)(?:\s+of\s+(?:task\s+#?\d+|the\s+task))?\s*(?:to|as|:|=)\s*|\brename\s+(?:task\s+#?\d+\s+)?to\s*)["“]?(.+?)["”]?\s*$/iu,
  );
  if (titleMatch) changes.title = titleMatch[1].trim();
  const descriptionMatch = message.match(
    /\bdescription(?:\s+of\s+(?:task\s+#?\d+|the\s+task))?\s*(?:to|as|:|=)\s*(.+)$/iu,
  );
  if (descriptionMatch) changes.description = descriptionMatch[1].trim();
  const assignee = extractAssignee(message, users, me);
  if (assignee.user && assignee.user.id !== task.assignedTo.id) {
    changes.assignedToId = assignee.user.id;
  }
  const parsed = parseChatDateTime(message, now);
  if (parsed.date) changes.date = parsed.date;
  if (parsed.time) changes.time = parsed.time;
  if (!status && !titleMatch && !descriptionMatch && !assignee.user && !parsed.date && !parsed.time) {
    return undefined;
  }
  return changes;
}

function finishUpdate(
  task: TaskView,
  changes: NonNullable<EngineState['changes']>,
  language: ChatLanguage,
  now: Date,
  users: SafeUser[] = [],
  requireConfirmation = true,
): EngineResult {
  let dueAt: string | undefined;
  if (changes.date || changes.time) {
    const existing = new Date(task.dueAt);
    const date = changes.date ?? chatDate(existing);
    const time = changes.time ?? chatTime(existing);
    dueAt = datetime({ date, time }, now);
    if (!dueAt) return reply(words[language].datePast, { flow: 'update', slot: 'date', taskId: task.id, language, changes });
  }
  if (requireConfirmation && (dueAt || changes.assignedToId !== undefined)) {
    const target = changes.assignedToId === undefined
      ? null
      : users.find((user) => user.id === changes.assignedToId);
    const change = dueAt
      ? words[language].confirmDate(formatChatDateTime(new Date(dueAt), language))
      : words[language].confirmAssignee(target?.name ?? 'the selected person');
    return reply(
      words[language].confirmChange(task.title, change),
      {
        flow: 'update',
        slot: 'confirm',
        taskId: task.id,
        language,
        changes,
      },
    );
  }
  return {
    type: 'update',
    taskId: task.id,
    lang: language,
    changes: {
      ...(changes.status ? { status: changes.status } : {}),
      ...(changes.title ? { title: changes.title } : {}),
      ...(changes.description ? { description: changes.description } : {}),
      ...(dueAt ? { dueAt } : {}),
      ...(changes.assignedToId ? { assignedToId: changes.assignedToId } : {}),
    },
  };
}

function beginUpdate(input: EngineInput, language: ChatLanguage): EngineResult {
  const candidates = matchTasks(input.message, input.tasks);
  if (candidates.length === 0) {
    const open = openTasks(input.tasks);
    const state: EngineState = { flow: 'update', slot: 'task', language, candidates: open.map((task) => task.id) };
    return open.length
      ? reply(words[language].noTask, state, open)
      : reply(words[language].noTask, state);
  }
  if (candidates.length > 1) {
    const initialChanges = extractChanges(
      input.message,
      candidates[0]!,
      input.users,
      input.me,
      input.now,
    );
    return reply(words[language].ambiguous, {
      flow: 'update',
      slot: 'task',
      language,
      candidates: candidates.map((task) => task.id),
      ...(initialChanges ? { changes: initialChanges } : {}),
    }, candidates);
  }
  const task = candidates[0];
  if (!task) return reply(words[language].help);
  const changes = extractChanges(input.message, task, input.users, input.me, input.now);
  if (!changes) {
    return reply(words[language].whatChange, {
      flow: 'update',
      slot: 'task',
      language,
      taskId: task.id,
      candidates: [task.id],
    });
  }
  return finishUpdate(task, changes, language, input.now, input.users);
}

export function detectNewCommandIntent(
  message: string,
): 'create' | 'list' | 'update' | 'help' | null {
  const listIndex = message.search(listWords);
  const createIndex = message.search(createWords);
  const taskReference =
    /(?:#\s*\d+|\btask\s+(?:number\s+)?#?\s*\d+\b|\b\d+\s+number\s+task\b|काम\s+(?:नंबर|क्रमांक)\s*\d+)/iu.test(message);
  if (taskReference && updateWords.test(message)) return 'update';
  if (listIndex >= 0 && (createIndex < 0 || listIndex < createIndex) && !updateWords.test(message)) {
    return 'list';
  }
  if (createIndex >= 0 && (listIndex < 0 || createIndex < listIndex)) return 'create';
  if (listWords.test(message) && !createWords.test(message) && !updateWords.test(message)) {
    return 'list';
  }
  if (updateWords.test(message) || taskReference) return 'update';
  if (greetingWords.test(message)) return 'help';
  return null;
}

export function processMessage(input: EngineInput): EngineResult {
  const message = input.message.trim();
  const state = input.state;
  const language =
    input.languageHint ?? detectLanguage(input.message, state?.language);

  if (state?.flow && cancelWords.test(message)) {
    return reply(words[language].canceled);
  }
  if (state?.flow === 'create' && createWords.test(message)) {
    return createInitial(input, language);
  }
  if (state?.flow === 'create' && state.slot && state.slot !== 'task') {
    const result = fillCreate(input, state, language);
    if (result.type !== 'reply' || result.state) return result;
  }
  if (state?.flow === 'update' && state.slot === 'task') {
    const number = message.match(/#?\s*(\d+)/u);
    const selectedId = number ? Number(number[1]) : undefined;
    const targetId = state.taskId ?? selectedId;
    if (
      selectedId !== undefined &&
      state.candidates?.length &&
      !state.candidates.includes(selectedId)
    ) {
      return reply(words[language].task, state);
    }
    const task = targetId
      ? input.tasks.find((entry) => entry.id === targetId)
      : state.candidates?.length === 1
        ? input.tasks.find((entry) => entry.id === state.candidates?.[0])
        : undefined;
    if (!task) return reply(words[language].task, state);
    const selectedField = detectUpdateField(message);
    if (selectedField) {
      const prompts = {
        title: words[language].updateTitle,
        description: words[language].updateDescription,
        date: words[language].updateDate,
        status: words[language].updateStatus,
        assignee: words[language].assignee,
      };
      return reply(prompts[selectedField], {
        ...state,
        slot: selectedField,
        taskId: task.id,
        candidates: [task.id],
      });
    }
    const onlyTaskChoice = /^(?:#?\s*\d+|task\s+#?\d+)$/iu.test(message);
    const changes = state.contextMessage
      ? extractChanges(
          state.contextMessage,
          task,
          input.users,
          input.me,
          input.now,
        ) ?? state.changes
      : onlyTaskChoice
        ? state.changes
        : extractChanges(message, task, input.users, input.me, input.now) ?? state.changes;
    if (!changes) return reply(words[language].whatChange, { ...state, taskId: task.id, candidates: [task.id] });
    return finishUpdate(task, changes, language, input.now, input.users);
  }
  if (state?.flow === 'update' && state.slot === 'assignee') {
    const task = state.taskId
      ? input.tasks.find((entry) => entry.id === state.taskId)
      : undefined;
    if (!task) return reply(words[language].noTask);
    const assignee = extractAssignee(message, input.users, input.me).user ?? matchUser(message, input.users);
    if (!assignee) return reply(words[language].noMatch, state);
    if (assignee.id === task.assignedTo.id) {
      return reply(words[language].alreadyAssigned);
    }
    return finishUpdate(
      task,
      { ...state.changes, assignedToId: assignee.id },
      language,
      input.now,
      input.users,
    );
  }
  if (state?.flow === 'update' && state.slot === 'confirm') {
    const task = state.taskId
      ? input.tasks.find((entry) => entry.id === state.taskId)
      : undefined;
    if (!task || !state.changes) return reply(words[language].noTask);
    if (/^(?:no|nope|nah|nahi|nahi\s+chahiye|नहीं|नही|मत)$/iu.test(message)) {
      return reply(words[language].canceledChange);
    }
    if (!/^(?:yes|y|yeah|yep|confirm|haan|han|ji|हाँ|हां|ठीक|ठीक\s+है)$/iu.test(message)) {
      return reply(words[language].yesNo, state);
    }
    return finishUpdate(task, state.changes, language, input.now, input.users, false);
  }
  if (
    state?.flow === 'update' &&
    (state.slot === 'title' ||
      state.slot === 'description' ||
      state.slot === 'date' ||
      state.slot === 'status')
  ) {
    const task = state.taskId
      ? input.tasks.find((entry) => entry.id === state.taskId)
      : undefined;
    if (!task) return reply(words[language].noTask);
    const value = message.trim();
    if (!value) {
      const prompts = {
        title: words[language].updateTitle,
        description: words[language].updateDescription,
        date: words[language].updateDate,
        status: words[language].updateStatus,
      };
      return reply(prompts[state.slot], state);
    }
    if (state.slot === 'title') {
      return finishUpdate(task, { ...state.changes, title: value }, language, input.now, input.users);
    }
    if (state.slot === 'description') {
      return finishUpdate(task, { ...state.changes, description: value }, language, input.now, input.users);
    }
    if (state.slot === 'status') {
      const status = statusFrom(value);
      if (!status) return reply(words[language].updateStatus, state);
      return finishUpdate(task, { ...state.changes, status }, language, input.now, input.users);
    }
    const parsed = parseChatDateTime(value, input.now);
    if (!parsed.date) return reply(words[language].updateDate, state);
    return finishUpdate(
      task,
      { ...state.changes, date: parsed.date, ...(parsed.time ? { time: parsed.time } : {}) },
      language,
      input.now,
      input.users,
    );
  }
  const commandIntent = detectNewCommandIntent(message);
  if (commandIntent === 'list') return listTasks(message, input, language);
  if (commandIntent === 'create') return createInitial(input, language);
  if (commandIntent === 'update') return beginUpdate(input, language);
  if (commandIntent === 'help') return reply(words[language].help);
  return reply(words[language].help);
}
