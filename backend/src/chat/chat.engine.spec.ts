import { describe, expect, it } from 'vitest';
import type { SafeUser, TaskView } from '../shared/types.js';
import { parseDateTime } from './date-parser.js';
import {
  detectNewCommandIntent,
  processMessage,
  type EngineInput,
} from './chat.engine.js';

const now = new Date(2026, 9, 9, 10, 0);
const alice: SafeUser = { id: 1, name: 'Alice Sharma', email: 'alice@example.com' };
const rahul: SafeUser = { id: 2, name: 'Rahul Verma', email: 'rahul@example.com' };
const priya: SafeUser = { id: 3, name: 'Priya Singh', email: 'priya@example.com' };
const users = [alice, rahul, priya];

function task(
  id: number,
  title: string,
  options: Partial<TaskView> = {},
): TaskView {
  return {
    id,
    title,
    description: `Details for ${title}`,
    dueAt: new Date(2026, 9, 12, 17, 0).toISOString(),
    status: 'PENDING',
    assignedTo: rahul,
    assignedBy: alice,
    createdAt: new Date(2026, 9, 1).toISOString(),
    updatedAt: new Date(2026, 9, 1).toISOString(),
    permissions: { canEditAll: true, canUpdateStatus: true },
    ...options,
  };
}

const tasks = [
  task(1, 'Send the report'),
  task(2, 'Review the launch plan', { status: 'IN_PROGRESS' }),
  task(3, 'Book the meeting room', { status: 'COMPLETED' }),
];

function input(message: string, options: Partial<EngineInput> = {}): EngineInput {
  return {
    message,
    state: null,
    me: alice,
    users,
    tasks,
    now,
    ...options,
  };
}

describe('chat date parser', () => {
  it.each([
    ['today', '2026-10-09'],
    ['aaj', '2026-10-09'],
    ['आज', '2026-10-09'],
    ['tonight', '2026-10-09'],
    ['tomorrow', '2026-10-10'],
    ['kal', '2026-10-10'],
    ['कल', '2026-10-10'],
    ['day after tomorrow', '2026-10-11'],
    ['parso', '2026-10-11'],
    ['परसों', '2026-10-11'],
    ['next monday', '2026-10-12'],
    ['this monday', '2026-10-12'],
    ['next week', '2026-10-16'],
    ['in 3 days', '2026-10-12'],
    ['3 din baad', '2026-10-12'],
    ['25 Oct', '2026-10-25'],
    ['15th October 2026', '2026-10-15'],
    ['October 15th, 2026', '2026-10-15'],
    ['1st Nov', '2026-11-01'],
    ['October 2nd', '2027-10-02'],
    ['Oct 25 2026', '2026-10-25'],
    ['25/10', '2026-10-25'],
    ['25-10-2026', '2026-10-25'],
    ['2026-10-25', '2026-10-25'],
    ['kal shaam 5 baje', '2026-10-10'],
    ['17 October ko', '2026-10-17'],
    ['17 Oct 2026', '2026-10-17'],
    ['next monday at 5pm', '2026-10-12'],
    ['at 17:30', undefined],
    ['in 2 hours', '2026-10-09'],
    ['2 ghante mein', '2026-10-09'],
  ])('parses date in %s', (text, expected) => {
    expect(parseDateTime(text, now).date).toBe(expected);
  });

  describe('new command detection', () => {
    it.each([
      ['Show all tasks', 'list'],
      ['Mere pending tasks dikhao', 'list'],
      ['Create a task for Rahul', 'create'],
      ['Task #1 complete kar do', 'update'],
      ['उसकी तारीख कल कर दो', 'update'],
      ['Show all tasks and create one', 'list'],
    ] as const)('recognizes %s as a new %s command', (message, intent) => {
      expect(detectNewCommandIntent(message)).toBe(intent);
    });

    it.each(['17', 'tomorrow', '5pm', 'skip'])(
      'does not treat follow-up answer "%s" as a new command',
      (message) => {
        expect(detectNewCommandIntent(message)).toBeNull();
      },
    );
  });

  it.each([
    ['17', '2026-10-17'],
    ['17th', '2026-10-17'],
    ['8', '2026-11-08'],
    ['31', '2026-10-31'],
  ])('parses bare day %s as the next day-of-month when requested', (text, expected) => {
    expect(
      parseDateTime(text, now, { bareNumberAsDayOfMonth: true }).date,
    ).toBe(expected);
  });

  it.each([
    ['5pm', '17:00'],
    ['5:30 pm', '17:30'],
    ['17:30', '17:30'],
    ['at 5', '17:00'],
    ['5 baje', '17:00'],
    ['शाम 5 बजे', '17:00'],
    ['subah 9 baje', '09:00'],
    ['dopahar 2 baje', '14:00'],
    ['raat 9 baje', '21:00'],
    ['noon', '12:00'],
    ['12am', '00:00'],
    ['12pm', '12:00'],
    ['11', '11:00'],
    ['7', '07:00'],
    ['6', '18:00'],
  ])('parses time in %s', (text, expected) => {
    expect(parseDateTime(text, now).time).toBe(expected);
  });
});

describe('pure chat engine', () => {
  it.each([
    ['Create a task for Rahul to send the report by tomorrow 5pm', 'en'],
    ['Kal 5 baje Rahul ko report bhejne ka task banao', 'hinglish'],
    ['राहुल को कल शाम 5 बजे रिपोर्ट भेजने का काम बनाओ', 'hi'],
  ])('starts a localized create flow for %s', (message, language) => {
    const result = processMessage(input(message));
    expect(result.type).toBe('reply');
    if (result.type === 'reply') {
      expect(result.state?.flow).toBe('create');
      expect(result.state?.language).toBe(language);
      expect(result.state?.title).toBeTruthy();
      if (language === 'en') expect(result.state?.title?.toLowerCase()).toBe('send the report');
      expect(result.state?.assignedToId).toBe(rahul.id);
      expect(result.state?.date).toBe('2026-10-10');
      expect(result.state?.time).toBe('17:00');
      expect(result.state?.slot).toBe('description');
    }
  });

  it('parses the normalized instruction while preserving the detected language', () => {
    const result = processMessage(
      input('Create a task for Rahul to send the report by tomorrow 5pm', {
        languageHint: 'hi',
      }),
    );
    expect(result.type).toBe('reply');
    if (result.type === 'reply') {
      expect(result.state?.title).toBe('send the report');
      expect(result.state?.assignedToId).toBe(rahul.id);
      expect(result.state?.language).toBe('hi');
    }
  });

  it('fills create slots in the required order and accepts a skipped description', () => {
    let result = processMessage(input('Create a task'));
    expect(result.type).toBe('reply');
    if (result.type !== 'reply' || !result.state) throw new Error('Create flow did not start');
    expect(result.state.slot).toBe('title');

    result = processMessage(input('Send invoices', { state: result.state }));
    expect(result.type).toBe('reply');
    if (result.type !== 'reply' || !result.state) throw new Error('Assignee question missing');
    expect(result.state.slot).toBe('assignee');

    result = processMessage(input('Rahul', { state: result.state }));
    expect(result.type).toBe('reply');
    if (result.type !== 'reply' || !result.state) throw new Error('Date question missing');
    expect(result.state.slot).toBe('date');

    result = processMessage(input('tomorrow', { state: result.state }));
    expect(result.type).toBe('reply');
    if (result.type !== 'reply' || !result.state) throw new Error('Time question missing');
    expect(result.state.slot).toBe('time');

    result = processMessage(input('5pm', { state: result.state }));
    expect(result.type).toBe('reply');
    if (result.type !== 'reply' || !result.state) throw new Error('Description question missing');
    expect(result.state.slot).toBe('description');

    result = processMessage(input('skip', { state: result.state }));
    expect(result.type).toBe('create');
    if (result.type === 'create') {
      expect(result.data.title).toBe('Send invoices');
      expect(result.data.description).toBe('Send invoices');
      expect(result.data.assignedToId).toBe(rahul.id);
      expect(result.data.dueAt).toBeTruthy();
    }
  });

  it('accepts a future ordinal date supplied in a date follow-up', () => {
    const result = processMessage(
      input('15th October 2026 at 5pm', {
        state: {
          flow: 'create',
          slot: 'date',
          language: 'en',
          title: 'Send the report',
          assignedToId: rahul.id,
          description: 'Send the report',
        },
      }),
    );
    expect(result.type).toBe('create');
    if (result.type === 'create') {
      expect(result.data.dueAt).toBe('2026-10-15T11:30:00.000Z');
    }
  });

  it('accepts a bare day number in a create-date follow-up', () => {
    const result = processMessage(
      input('17', {
        state: {
          flow: 'create',
          slot: 'date',
          language: 'en',
          title: 'Send the report',
          assignedToId: rahul.id,
          description: 'Send the report',
        },
      }),
    );
    expect(result.type).toBe('reply');
    if (result.type === 'reply') {
      expect(result.state?.date).toBe('2026-10-17');
      expect(result.state?.slot).toBe('time');
      expect(result.text).toBe('What time should it be due?');
    }
  });

  it('does not infer an assignee from “Call Rahul”', () => {
    const result = processMessage(input('Create a task Call Rahul tomorrow 5pm'));
    expect(result.type).toBe('reply');
    if (result.type === 'reply') {
      expect(result.state?.assignedToId).toBeUndefined();
      expect(result.state?.slot).toBe('assignee');
    }
  });

  it('matches Devanagari assignee names', () => {
    const result = processMessage(input('राहुल को कल शाम 5 बजे रिपोर्ट भेजने का काम बनाओ'));
    expect(result.type).toBe('reply');
    if (result.type === 'reply') expect(result.state?.assignedToId).toBe(rahul.id);
  });

  it.each([
    'Show pending tasks',
    'List my tasks',
    'Show overdue tasks',
    'Find report',
    'Mere pending tasks dikhao',
    'Assigned by me',
    'मेरे बाकी काम दिखाओ',
    'रिपोर्ट खोजो',
    'मेरे सारे काम दिखाओ',
  ])('returns a list response for %s', (message) => {
    const result = processMessage(input(message));
    expect(result.type).toBe('reply');
  });

  it.each([
    'Show all tasks',
    'List all tasks',
    'Saare task dikhao',
    'Sab tasks batao',
    'सारे काम दिखाओ',
    'सभी काम दिखाओ',
  ])('lists all visible tasks without treating “all” as a title filter: %s', (message) => {
    const result = processMessage(input(message));
    expect(result.type).toBe('reply');
    if (result.type === 'reply') {
      expect(result.tasks).toHaveLength(tasks.length);
    }
  });

  it.each([
    ['Complete task #1', 1, 'COMPLETED'],
    ['Mark task 2 in progress', 2, 'IN_PROGRESS'],
    ['Task #3 pending', 3, 'PENDING'],
    ['Task #1 complete kar do', 1, 'COMPLETED'],
    ['काम नंबर 1 पूरा करो', 1, 'COMPLETED'],
  ])('updates status using %s', (message, id, status) => {
    const result = processMessage(input(message));
    expect(result.type).toBe('update');
    if (result.type === 'update') {
      expect(result.taskId).toBe(id);
      expect(result.changes.status).toBe(status);
    }
  });

  it('finds a task by title text and extracts title changes', () => {
    const result = processMessage(input('Change Send the report title to Send final report'));
    expect(result.type).toBe('update');
    if (result.type === 'update') {
      expect(result.taskId).toBe(1);
      expect(result.changes.title).toBe('Send final report');
    }
  });

  it.each([
    ['Change title of task #1 to Final report', 'title', 'Final report'],
    ['Rename task #1 to Final report', 'title', 'Final report'],
    ['Change description of task #1 to Send the signed report', 'description', 'Send the signed report'],
  ])('extracts the requested task field from %s', (message, field, value) => {
    const result = processMessage(input(message));
    expect(result.type).toBe('update');
    if (result.type === 'update') expect(result.changes[field]).toBe(value);
  });

  it.each([
    'Change assignee of task #1 to Priya',
    'Change task #1 assignee to Priya',
    'Reassign task #1 to Priya',
  ])('updates the assignee from a complete request: %s', (message) => {
    const result = processMessage(input(message));
    expect(result.type).toBe('reply');
    if (result.type === 'reply' && result.state) {
      expect(result.state.slot).toBe('confirm');
      const confirmed = processMessage(input('yes', { state: result.state }));
      expect(confirmed.type).toBe('update');
      if (confirmed.type === 'update') {
        expect(confirmed.taskId).toBe(1);
        expect(confirmed.changes.assignedToId).toBe(priya.id);
      }
    }
  });

  it('asks for an assignee name after the user selects assignee as the field to change', () => {
    const request = processMessage(input('Update task #1'));
    expect(request.type).toBe('reply');
    if (request.type !== 'reply' || !request.state) {
      throw new Error('Task update clarification missing');
    }
    const field = processMessage(input('assignee', { state: request.state }));
    expect(field.type).toBe('reply');
    if (field.type !== 'reply' || !field.state) {
      throw new Error('Assignee follow-up missing');
    }
    expect(field.state.slot).toBe('assignee');

    const answer = processMessage(input('Priya', { state: field.state }));
    expect(answer.type).toBe('reply');
    if (answer.type === 'reply' && answer.state) {
      expect(answer.state.slot).toBe('confirm');
      const confirmed = processMessage(input('haan', { state: answer.state }));
      expect(confirmed.type).toBe('update');
      if (confirmed.type === 'update') {
        expect(confirmed.taskId).toBe(1);
        expect(confirmed.changes.assignedToId).toBe(priya.id);
      }
    }
  });

  it.each([
    ['title', 'Updated report', 'title', 'Updated report'],
    ['description', 'Send the revised report', 'description', 'Send the revised report'],
    ['due date', 'tomorrow at 6pm', 'dueAt', '2026-10-10T12:30:00.000Z'],
    ['status', 'in progress', 'status', 'IN_PROGRESS'],
  ] as const)('updates the selected %s after a follow-up answer', (field, answer, key, value) => {
    const request = processMessage(input('Update task #1'));
    if (request.type !== 'reply' || !request.state) {
      throw new Error('Task update clarification missing');
    }
    const selection = processMessage(input(field, { state: request.state }));
    if (selection.type !== 'reply' || !selection.state) {
      throw new Error(`${field} follow-up missing`);
    }
    expect(selection.state.slot).toBe(
      field === 'due date' ? 'date' : field,
    );
    const result = processMessage(input(answer, { state: selection.state }));
    if (field === 'due date') {
      expect(result.type).toBe('reply');
      if (result.type === 'reply' && result.state) {
        expect(result.state.slot).toBe('confirm');
        expect(result.text).toContain('10 Oct 2026, 6:00 pm');
        const confirmed = processMessage(input('yes', { state: result.state }));
        expect(confirmed.type).toBe('update');
        if (confirmed.type === 'update') expect(confirmed.changes.dueAt).toBe(value);
      }
      return;
    }
    expect(result.type).toBe('update');
    if (result.type === 'update') {
      expect(result.taskId).toBe(1);
      expect(result.changes[key]).toBe(value);
    }
  });

  it('leaves a risky task change untouched when the user declines the preview', () => {
    const preview = processMessage(input('Reassign task #1 to Priya'));
    if (preview.type !== 'reply' || !preview.state) {
      throw new Error('Assignee confirmation preview missing');
    }
    const canceled = processMessage(input('no', { state: preview.state }));
    expect(canceled.type).toBe('reply');
    if (canceled.type === 'reply') {
      expect(canceled.state).toBeNull();
      expect(canceled.text).toContain('left the task unchanged');
    }
  });

  it('requires confirmation after resolving a risky change for an ambiguous task', () => {
    const ambiguousTasks = [task(11, 'Send report'), task(12, 'Send report to client')];
    const selection = processMessage(input('12', {
      tasks: ambiguousTasks,
      state: {
        flow: 'update',
        slot: 'task',
        taskId: undefined,
        candidates: [11, 12],
        language: 'en',
        changes: { assignedToId: priya.id },
      },
    }));
    expect(selection.type).toBe('reply');
    if (selection.type === 'reply' && selection.state) {
      expect(selection.state.taskId).toBe(12);
      expect(selection.state.slot).toBe('confirm');
    }
  });

  it.each([
    ['स्थिति', 'status'],
    ['नाम', 'title'],
    ['विवरण', 'description'],
    ['तारीख़', 'date'],
    ['किसे', 'assignee'],
  ] as const)('recognizes localized update field choice %s', (field, slot) => {
    const request = processMessage(input('Update task #1'));
    if (request.type !== 'reply' || !request.state) {
      throw new Error('Task update clarification missing');
    }
    const selection = processMessage(input(field, { state: request.state }));
    expect(selection.type).toBe('reply');
    if (selection.type === 'reply') expect(selection.state?.slot).toBe(slot);
  });

  it('asks which task when matching titles are ambiguous, then accepts an id', () => {
    const ambiguousTasks = [task(11, 'Send report'), task(12, 'Send report to client')];
    const result = processMessage(input('Complete report', { tasks: ambiguousTasks }));
    expect(result.type).toBe('reply');
    if (result.type !== 'reply' || !result.state) throw new Error('Ambiguity missing');
    expect(result.state.slot).toBe('task');
    const answer = processMessage(
      input('12', { tasks: ambiguousTasks, state: result.state }),
    );
    expect(answer.type).toBe('update');
    if (answer.type === 'update') expect(answer.taskId).toBe(12);
  });

  it('applies a contextual Hinglish update only after the user selects one of the prior tasks', () => {
    const ambiguousTasks = [task(11, 'Send report'), task(12, 'Send report to client')];
    const result = processMessage(input('12', {
      tasks: ambiguousTasks,
      state: {
        flow: 'update',
        slot: 'task',
        language: 'hinglish',
        candidates: [11, 12],
        contextMessage: 'uski due date kal 6pm kar do',
      },
    }));

    expect(result.type).toBe('reply');
    if (result.type === 'reply') {
      expect(result.state?.taskId).toBe(12);
      expect(result.state?.slot).toBe('confirm');
      expect(result.state?.changes?.date).toBe('2026-10-10');
      expect(result.state?.changes?.time).toBe('18:00');
    }
  });

  it('does not accept a task number outside the contextual candidate list', () => {
    const result = processMessage(input('1', {
      state: {
        flow: 'update',
        slot: 'task',
        language: 'en',
        candidates: [11, 12],
        contextMessage: 'set its due date to tomorrow',
      },
    }));

    expect(result.type).toBe('reply');
    if (result.type === 'reply') expect(result.state?.taskId).toBeUndefined();
  });

  it('cancels an active follow-up', () => {
    const result = processMessage(input('cancel', {
      state: { flow: 'create', slot: 'title', language: 'en' },
    }));
    expect(result.type).toBe('reply');
    if (result.type === 'reply') expect(result.state).toBeNull();
  });

  it('rejects a date and time that have already passed', () => {
    const result = processMessage(input('Create a task for Rahul to send report today at 9am'));
    expect(result.type).toBe('reply');
    if (result.type === 'reply') {
      expect(result.state?.slot).toBe('date');
      expect(result.text.toLowerCase()).toContain('past');
    }
  });

  it('restarts a create flow when a new create command arrives during follow-up', () => {
    const result = processMessage(input('Create a task for me tomorrow at 5pm to call client', {
      state: { flow: 'create', slot: 'title', language: 'en', title: 'Old task' },
    }));
    expect(result.type).toBe('reply');
    if (result.type === 'reply') expect(result.state?.title).not.toBe('Old task');
  });
});
