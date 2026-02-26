import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenRouterProvider } from './OpenRouterProvider';

type FetchCall = {
  url: string;
  auth?: string;
  body?: any;
};

function makeOkResponse(content: string): Response {
  return new Response(
    JSON.stringify({
      id: 'resp_1',
      choices: [{ message: { content } }]
    }),
    {
      status: 200,
      headers: { 'content-type': 'application/json' }
    }
  );
}

function makeErrorResponse(status: number, body: any, headers?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...(headers ?? {})
    }
  });
}

test('OpenRouterProvider disables invalid keys (401) and skips them on subsequent calls', async () => {
  const old = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_BACKUP_API_KEYS: process.env.OPENROUTER_BACKUP_API_KEYS,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_URL: process.env.OPENROUTER_URL
  };

  const KEY_BAD = 'sk-or-v1-bad_key_for_test_401';
  const KEY_GOOD = 'sk-or-v1-good_key_for_test_200';

  process.env.OPENROUTER_API_KEY = KEY_BAD;
  process.env.OPENROUTER_BACKUP_API_KEYS = KEY_GOOD;
  process.env.OPENROUTER_MODEL = 'google/gemma-3-27b-it:free';
  process.env.OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

  const calls: FetchCall[] = [];
  globalThis.fetch = async (url: any, init: any) => {
    const auth = init?.headers?.Authorization ?? init?.headers?.authorization;
    let parsedBody: any = undefined;
    try {
      parsedBody = init?.body ? JSON.parse(init.body) : undefined;
    } catch {
      parsedBody = init?.body;
    }
    calls.push({ url: String(url), auth: String(auth || ''), body: parsedBody });

    if (String(auth).includes(KEY_BAD)) {
      return makeErrorResponse(401, { error: { message: 'User not found.', code: 401 } });
    }
    return makeOkResponse('OK');
  };

  const provider = new OpenRouterProvider();

  const first = await provider.generateText('hi', 'sys', { maxRetries: 0 });
  assert.equal(first, 'OK');
  assert.equal(calls.length, 2);
  assert.ok(calls[0].auth?.includes(KEY_BAD));
  assert.ok(calls[1].auth?.includes(KEY_GOOD));

  calls.length = 0;
  const second = await provider.generateText('hi again', 'sys', { maxRetries: 0 });
  assert.equal(second, 'OK');
  assert.equal(calls.length, 1);
  assert.ok(calls[0].auth?.includes(KEY_GOOD), 'expected disabled key to be skipped');

  process.env.OPENROUTER_API_KEY = old.OPENROUTER_API_KEY;
  process.env.OPENROUTER_BACKUP_API_KEYS = old.OPENROUTER_BACKUP_API_KEYS;
  process.env.OPENROUTER_MODEL = old.OPENROUTER_MODEL;
  process.env.OPENROUTER_URL = old.OPENROUTER_URL;
});

test('OpenRouterProvider cools down rate-limited keys (429) using Retry-After', async () => {
  const old = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_BACKUP_API_KEYS: process.env.OPENROUTER_BACKUP_API_KEYS,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_URL: process.env.OPENROUTER_URL
  };

  const KEY_RL = 'sk-or-v1-rate_limited_key_for_test_429';
  const KEY_GOOD = 'sk-or-v1-good_key_for_test_200_b';

  process.env.OPENROUTER_API_KEY = KEY_RL;
  process.env.OPENROUTER_BACKUP_API_KEYS = KEY_GOOD;
  process.env.OPENROUTER_MODEL = 'google/gemma-3-27b-it:free';
  process.env.OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

  const calls: FetchCall[] = [];
  globalThis.fetch = async (_url: any, init: any) => {
    const auth = init?.headers?.Authorization ?? init?.headers?.authorization;
    calls.push({ url: 'x', auth: String(auth || '') });

    if (String(auth).includes(KEY_RL)) {
      return makeErrorResponse(
        429,
        {
          error: {
            message: 'Provider returned error',
            code: 429,
            metadata: { raw: 'temporarily rate-limited upstream' }
          }
        },
        { 'retry-after': '10' }
      );
    }

    return makeOkResponse('OK2');
  };

  const provider = new OpenRouterProvider();

  const first = await provider.generateText('hi', 'sys', { maxRetries: 0 });
  assert.equal(first, 'OK2');
  assert.equal(calls.length, 2);
  assert.ok(calls[0].auth?.includes(KEY_RL));
  assert.ok(calls[1].auth?.includes(KEY_GOOD));

  calls.length = 0;
  const second = await provider.generateText('hi again', 'sys', { maxRetries: 0 });
  assert.equal(second, 'OK2');
  assert.equal(calls.length, 1, 'expected rate-limited key to be skipped due to cooldown');
  assert.ok(calls[0].auth?.includes(KEY_GOOD));

  process.env.OPENROUTER_API_KEY = old.OPENROUTER_API_KEY;
  process.env.OPENROUTER_BACKUP_API_KEYS = old.OPENROUTER_BACKUP_API_KEYS;
  process.env.OPENROUTER_MODEL = old.OPENROUTER_MODEL;
  process.env.OPENROUTER_URL = old.OPENROUTER_URL;
});
