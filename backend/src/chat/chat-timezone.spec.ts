import { describe, expect, it } from 'vitest';
import {
  chatDate,
  chatTime,
  dateInChatTimeZone,
  dateTimeInChatTimeZone,
  formatChatDateTime,
} from './chat-timezone.js';

describe('chat timezone helpers', () => {
  it('interprets wall-clock dates in the configured India timezone', () => {
    expect(dateTimeInChatTimeZone('2026-10-17', '17:00').toISOString()).toBe(
      '2026-10-17T11:30:00.000Z',
    );
  });

  it('uses the chat timezone date and time for existing task due dates', () => {
    const date = new Date('2026-10-17T11:30:00.000Z');
    expect(chatDate(date)).toBe('2026-10-17');
    expect(chatTime(date)).toBe('17:00');
    expect(formatChatDateTime(date, 'en')).toContain('17 Oct 2026');
  });

  it('creates a date-parser reference with chat-local calendar fields', () => {
    const wallClock = dateInChatTimeZone(new Date('2026-10-09T04:30:00.000Z'));
    expect(wallClock.getFullYear()).toBe(2026);
    expect(wallClock.getMonth()).toBe(9);
    expect(wallClock.getDate()).toBe(9);
    expect(wallClock.getHours()).toBe(10);
  });
});
