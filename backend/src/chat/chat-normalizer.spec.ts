import { afterEach, describe, expect, it, vi } from 'vitest';
import { ChatNormalizer } from './chat-normalizer.js';

function geminiResponse(
  result: Record<string, unknown>,
  status = 200,
): Response {
  return new Response(
    JSON.stringify({
      candidates: [
        {
          content: {
            parts: [{ text: JSON.stringify(result) }],
          },
        },
      ],
    }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('ChatNormalizer', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    ['en', 'create', 'create task for Rahul: send report tomorrow at 5pm'],
    ['hi', 'list', 'show my pending tasks'],
    ['hinglish', 'update', 'complete task #3'],
  ])('normalizes supported language messages (%s)', async (language, intent, instruction) => {
    vi.stubEnv('GEMINI_API_KEY', 'test-secret');
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      geminiResponse({ language, intent, instruction }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new ChatNormalizer().normalize('some message', null);

    expect(result).toEqual({ language, intent, instruction, fromGemini: true });
    const [url, options] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).not.toContain('test-secret');
    expect(new Headers(options?.headers).get('x-goog-api-key')).toBe('test-secret');
  });

  it('rejects malformed model output and falls back to the custom parser input', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        geminiResponse({ language: 'fr', intent: 'delete', instruction: '' }),
      ),
    );

    const result = await new ChatNormalizer().normalize('कल काम दिखाओ', null);

    expect(result).toEqual({
      language: 'hi',
      intent: 'unknown',
      instruction: 'कल काम दिखाओ',
      fromGemini: false,
    });
  });

  it('uses the pending language for short follow-ups when Gemini is not configured', async () => {
    const result = await new ChatNormalizer().normalize('Rahul', {
      flow: 'create',
      slot: 'assignee',
      language: 'hinglish',
    });

    expect(result).toEqual({
      language: 'hinglish',
      intent: 'followup',
      instruction: 'Rahul',
      fromGemini: false,
    });
  });

  it('falls back when Gemini returns an HTTP error', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        new Response('{}', { status: 503 }),
      ),
    );

    const result = await new ChatNormalizer().normalize('Show pending tasks', null);

    expect(result.fromGemini).toBe(false);
    expect(result.instruction).toBe('Show pending tasks');
  });

  it('retries rate-limited primary model on the configured fallback model', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-secret');
    vi.stubEnv('GEMINI_MODEL', 'gemini-primary');
    vi.stubEnv('GEMINI_FALLBACK_MODEL', 'gemini-fallback');
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 429 }))
      .mockResolvedValueOnce(
        geminiResponse({
          language: 'hinglish',
          intent: 'list',
          instruction: 'show pending tasks',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await new ChatNormalizer().normalize(
      'Mere pending tasks dikhao',
      null,
    );

    expect(result.fromGemini).toBe(true);
    expect(result.intent).toBe('list');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('gemini-primary');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('gemini-fallback');
  });

  it('uses a selected reply language without changing the normalized instruction', async () => {
    vi.stubEnv('GEMINI_API_KEY', 'test-secret');
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        geminiResponse({
          language: 'en',
          intent: 'followup',
          instruction: 'tomorrow at 5pm',
        }),
      ),
    );

    const result = await new ChatNormalizer().normalize(
      'कल शाम 5 बजे',
      { flow: 'create', slot: 'date', language: 'hi' },
      'hi',
    );

    expect(result).toEqual({
      language: 'hi',
      intent: 'followup',
      instruction: 'tomorrow at 5pm',
      fromGemini: true,
    });
  });
});
