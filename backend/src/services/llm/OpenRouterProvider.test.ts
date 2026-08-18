import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OpenRouterProvider, getOpenRouterRuntimeDiagnostics } from './OpenRouterProvider';

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

function makeCustomOkResponse(payload: any): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
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

test('OpenRouterProvider reads text when message.content is an array of parts', async () => {
  const old = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_BACKUP_API_KEYS: process.env.OPENROUTER_BACKUP_API_KEYS,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_URL: process.env.OPENROUTER_URL
  };

  process.env.OPENROUTER_API_KEY = 'sk-or-v1-array_content_test';
  process.env.OPENROUTER_BACKUP_API_KEYS = '';
  process.env.OPENROUTER_MODEL = 'google/gemma-3-27b-it:free';
  process.env.OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

  globalThis.fetch = async () => makeCustomOkResponse({
    id: 'resp_arr',
    choices: [{
      message: {
        content: [
          { type: 'output_text', text: 'Hello' },
          { type: 'output_text', text: ' world' }
        ]
      }
    }]
  });

  const provider = new OpenRouterProvider();
  const text = await provider.generateText('hi', 'sys', { maxRetries: 0 });
  assert.equal(text, 'Hello world');

  process.env.OPENROUTER_API_KEY = old.OPENROUTER_API_KEY;
  process.env.OPENROUTER_BACKUP_API_KEYS = old.OPENROUTER_BACKUP_API_KEYS;
  process.env.OPENROUTER_MODEL = old.OPENROUTER_MODEL;
  process.env.OPENROUTER_URL = old.OPENROUTER_URL;
});

test('OpenRouterProvider reads text from choice.text fallback', async () => {
  const old = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_BACKUP_API_KEYS: process.env.OPENROUTER_BACKUP_API_KEYS,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_URL: process.env.OPENROUTER_URL
  };

  process.env.OPENROUTER_API_KEY = 'sk-or-v1-choice_text_test';
  process.env.OPENROUTER_BACKUP_API_KEYS = '';
  process.env.OPENROUTER_MODEL = 'google/gemma-3-27b-it:free';
  process.env.OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

  globalThis.fetch = async () => makeCustomOkResponse({
    id: 'resp_text',
    choices: [{ text: 'Fallback text works' }]
  });

  const provider = new OpenRouterProvider();
  const text = await provider.generateText('hi', 'sys', { maxRetries: 0 });
  assert.equal(text, 'Fallback text works');

  process.env.OPENROUTER_API_KEY = old.OPENROUTER_API_KEY;
  process.env.OPENROUTER_BACKUP_API_KEYS = old.OPENROUTER_BACKUP_API_KEYS;
  process.env.OPENROUTER_MODEL = old.OPENROUTER_MODEL;
  process.env.OPENROUTER_URL = old.OPENROUTER_URL;
});

test('OpenRouterProvider reads text when message.content is an object', async () => {
  const old = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_BACKUP_API_KEYS: process.env.OPENROUTER_BACKUP_API_KEYS,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_URL: process.env.OPENROUTER_URL
  };

  process.env.OPENROUTER_API_KEY = 'sk-or-v1-content_object_test';
  process.env.OPENROUTER_BACKUP_API_KEYS = '';
  process.env.OPENROUTER_MODEL = 'google/gemma-3-27b-it:free';
  process.env.OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

  globalThis.fetch = async () => makeCustomOkResponse({
    id: 'resp_content_obj',
    choices: [{
      message: {
        content: { text: 'Object content works' }
      }
    }]
  });

  const provider = new OpenRouterProvider();
  const text = await provider.generateText('hi', 'sys', { maxRetries: 0 });
  assert.equal(text, 'Object content works');

  process.env.OPENROUTER_API_KEY = old.OPENROUTER_API_KEY;
  process.env.OPENROUTER_BACKUP_API_KEYS = old.OPENROUTER_BACKUP_API_KEYS;
  process.env.OPENROUTER_MODEL = old.OPENROUTER_MODEL;
  process.env.OPENROUTER_URL = old.OPENROUTER_URL;
});

test('OpenRouterProvider reads text from delta.content fallback', async () => {
  const old = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_BACKUP_API_KEYS: process.env.OPENROUTER_BACKUP_API_KEYS,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_URL: process.env.OPENROUTER_URL
  };

  process.env.OPENROUTER_API_KEY = 'sk-or-v1-delta_content_test';
  process.env.OPENROUTER_BACKUP_API_KEYS = '';
  process.env.OPENROUTER_MODEL = 'google/gemma-3-27b-it:free';
  process.env.OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

  globalThis.fetch = async () => makeCustomOkResponse({
    id: 'resp_delta',
    choices: [{
      delta: {
        content: 'Delta content works'
      }
    }]
  });

  const provider = new OpenRouterProvider();
  const text = await provider.generateText('hi', 'sys', { maxRetries: 0 });
  assert.equal(text, 'Delta content works');

  process.env.OPENROUTER_API_KEY = old.OPENROUTER_API_KEY;
  process.env.OPENROUTER_BACKUP_API_KEYS = old.OPENROUTER_BACKUP_API_KEYS;
  process.env.OPENROUTER_MODEL = old.OPENROUTER_MODEL;
  process.env.OPENROUTER_URL = old.OPENROUTER_URL;
});

test('OpenRouterProvider falls back to reasoning when text content is missing', async () => {
  const old = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_BACKUP_API_KEYS: process.env.OPENROUTER_BACKUP_API_KEYS,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_URL: process.env.OPENROUTER_URL
  };

  process.env.OPENROUTER_API_KEY = 'sk-or-v1-reasoning_test';
  process.env.OPENROUTER_BACKUP_API_KEYS = '';
  process.env.OPENROUTER_MODEL = 'google/gemma-3-27b-it:free';
  process.env.OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

  globalThis.fetch = async () => makeCustomOkResponse({
    id: 'resp_reasoning',
    choices: [{
      message: {
        reasoning: 'Reasoning fallback text'
      }
    }]
  });

  const provider = new OpenRouterProvider();
  const text = await provider.generateText('hi', 'sys', { maxRetries: 0 });
  assert.equal(text, 'Reasoning fallback text');

  process.env.OPENROUTER_API_KEY = old.OPENROUTER_API_KEY;
  process.env.OPENROUTER_BACKUP_API_KEYS = old.OPENROUTER_BACKUP_API_KEYS;
  process.env.OPENROUTER_MODEL = old.OPENROUTER_MODEL;
  process.env.OPENROUTER_URL = old.OPENROUTER_URL;
});

test('OpenRouterProvider inlines system instructions into user for gemma-3n-e2b-it', async () => {
  const old = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_BACKUP_API_KEYS: process.env.OPENROUTER_BACKUP_API_KEYS,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_URL: process.env.OPENROUTER_URL
  };

  process.env.OPENROUTER_API_KEY = 'sk-or-v1-system_to_user_inline_test';
  process.env.OPENROUTER_BACKUP_API_KEYS = '';
  process.env.OPENROUTER_MODEL = 'google/gemma-3n-e2b-it:free';
  process.env.OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

  const calls: FetchCall[] = [];
  globalThis.fetch = async (_url: any, init: any) => {
    let parsedBody: any = undefined;
    try {
      parsedBody = init?.body ? JSON.parse(init.body) : undefined;
    } catch {
      parsedBody = init?.body;
    }
    calls.push({ url: 'x', body: parsedBody });
    return makeOkResponse('ok');
  };

  const provider = new OpenRouterProvider() as any;
  await provider.callOpenRouter(
    {
      model: 'google/gemma-3n-e2b-it:free',
      messages: [
        { role: 'system', content: 'You are strict.' },
        { role: 'user', content: 'Solve task' }
      ]
    },
    { maxRetries: 0 }
  );

  assert.equal(calls.length, 1);
  assert.equal(Array.isArray(calls[0].body.messages), true);
  assert.equal(calls[0].body.messages.length, 1);
  assert.equal(calls[0].body.messages[0].role, 'user');
  assert.equal(typeof calls[0].body.messages[0].content, 'string');
  assert.equal(calls[0].body.messages[0].content.includes('You are strict.'), true);
  assert.equal(calls[0].body.messages[0].content.includes('Solve task'), true);

  process.env.OPENROUTER_API_KEY = old.OPENROUTER_API_KEY;
  process.env.OPENROUTER_BACKUP_API_KEYS = old.OPENROUTER_BACKUP_API_KEYS;
  process.env.OPENROUTER_MODEL = old.OPENROUTER_MODEL;
  process.env.OPENROUTER_URL = old.OPENROUTER_URL;
});

test('OpenRouterProvider keeps system role for models that support it', async () => {
  const old = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_BACKUP_API_KEYS: process.env.OPENROUTER_BACKUP_API_KEYS,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_URL: process.env.OPENROUTER_URL
  };

  process.env.OPENROUTER_API_KEY = 'sk-or-v1-keep_system_role_test';
  process.env.OPENROUTER_BACKUP_API_KEYS = '';
  process.env.OPENROUTER_MODEL = 'openai/gpt-4o-mini';
  process.env.OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

  const calls: FetchCall[] = [];
  globalThis.fetch = async (_url: any, init: any) => {
    let parsedBody: any = undefined;
    try {
      parsedBody = init?.body ? JSON.parse(init.body) : undefined;
    } catch {
      parsedBody = init?.body;
    }
    calls.push({ url: 'x', body: parsedBody });
    return makeOkResponse('ok');
  };

  const provider = new OpenRouterProvider() as any;
  await provider.callOpenRouter(
    {
      model: 'openai/gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are strict.' },
        { role: 'user', content: 'Solve task' }
      ]
    },
    { maxRetries: 0 }
  );

  assert.equal(calls.length, 1);
  assert.deepEqual(
    calls[0].body.messages,
    [
      { role: 'system', content: 'You are strict.' },
      { role: 'user', content: 'Solve task' }
    ]
  );

  process.env.OPENROUTER_API_KEY = old.OPENROUTER_API_KEY;
  process.env.OPENROUTER_BACKUP_API_KEYS = old.OPENROUTER_BACKUP_API_KEYS;
  process.env.OPENROUTER_MODEL = old.OPENROUTER_MODEL;
  process.env.OPENROUTER_URL = old.OPENROUTER_URL;
});

test('OpenRouterProvider removes response_format for gemma-3n-e2b-it', async () => {
  const old = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_BACKUP_API_KEYS: process.env.OPENROUTER_BACKUP_API_KEYS,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_URL: process.env.OPENROUTER_URL
  };

  process.env.OPENROUTER_API_KEY = 'sk-or-v1-strip_json_mode_test';
  process.env.OPENROUTER_BACKUP_API_KEYS = '';
  process.env.OPENROUTER_MODEL = 'google/gemma-3n-e2b-it:free';
  process.env.OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

  const calls: FetchCall[] = [];
  globalThis.fetch = async (_url: any, init: any) => {
    let parsedBody: any = undefined;
    try {
      parsedBody = init?.body ? JSON.parse(init.body) : undefined;
    } catch {
      parsedBody = init?.body;
    }
    calls.push({ url: 'x', body: parsedBody });
    return makeOkResponse('ok');
  };

  const provider = new OpenRouterProvider() as any;
  await provider.callOpenRouter(
    {
      model: 'google/gemma-3n-e2b-it:free',
      messages: [
        { role: 'system', content: 'Return strict JSON' },
        { role: 'user', content: 'Solve task' }
      ],
      response_format: {
        type: 'json_object'
      }
    },
    { maxRetries: 0 }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].body.response_format, undefined);

  process.env.OPENROUTER_API_KEY = old.OPENROUTER_API_KEY;
  process.env.OPENROUTER_BACKUP_API_KEYS = old.OPENROUTER_BACKUP_API_KEYS;
  process.env.OPENROUTER_MODEL = old.OPENROUTER_MODEL;
  process.env.OPENROUTER_URL = old.OPENROUTER_URL;
});

test('OpenRouterProvider falls back to configured model when primary model is rate-limited upstream', async () => {
  const old = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_BACKUP_API_KEYS: process.env.OPENROUTER_BACKUP_API_KEYS,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_TEXT_MODEL: process.env.OPENROUTER_TEXT_MODEL,
    OPENROUTER_JSON_MODEL: process.env.OPENROUTER_JSON_MODEL,
    OPENROUTER_FALLBACK_MODELS: process.env.OPENROUTER_FALLBACK_MODELS,
    OPENROUTER_URL: process.env.OPENROUTER_URL
  };

  process.env.OPENROUTER_API_KEY = 'sk-or-v1-fallback_test_key';
  process.env.OPENROUTER_BACKUP_API_KEYS = '';
  process.env.OPENROUTER_MODEL = 'google/gemma-3-12b-it:free';
  process.env.OPENROUTER_TEXT_MODEL = '';
  process.env.OPENROUTER_JSON_MODEL = '';
  process.env.OPENROUTER_FALLBACK_MODELS = 'openai/gpt-4o-mini';
  process.env.OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

  const calls: FetchCall[] = [];
  globalThis.fetch = async (_url: any, init: any) => {
    let parsedBody: any = undefined;
    try {
      parsedBody = init?.body ? JSON.parse(init.body) : undefined;
    } catch {
      parsedBody = init?.body;
    }
    calls.push({ url: 'x', body: parsedBody });

    const model = String(parsedBody?.model || '');
    if (model.includes('gemma-3-12b-it:free')) {
      return makeErrorResponse(429, {
        error: {
          message: 'Provider returned error',
          code: 429,
          metadata: {
            raw: 'google/gemma-3-12b-it:free is temporarily rate-limited upstream'
          }
        }
      });
    }

    return makeOkResponse('fallback model worked');
  };

  const provider = new OpenRouterProvider();
  const text = await provider.generateText('hello', 'system', { maxRetries: 0 });

  assert.equal(text, 'fallback model worked');
  assert.equal(calls.length, 2);
  assert.equal(String(calls[0].body?.model), 'google/gemma-3-12b-it:free');
  assert.equal(String(calls[1].body?.model), 'openai/gpt-4o-mini');

  process.env.OPENROUTER_API_KEY = old.OPENROUTER_API_KEY;
  process.env.OPENROUTER_BACKUP_API_KEYS = old.OPENROUTER_BACKUP_API_KEYS;
  process.env.OPENROUTER_MODEL = old.OPENROUTER_MODEL;
  process.env.OPENROUTER_TEXT_MODEL = old.OPENROUTER_TEXT_MODEL;
  process.env.OPENROUTER_JSON_MODEL = old.OPENROUTER_JSON_MODEL;
  process.env.OPENROUTER_FALLBACK_MODELS = old.OPENROUTER_FALLBACK_MODELS;
  process.env.OPENROUTER_URL = old.OPENROUTER_URL;
});

test('OpenRouterProvider adds the free router after an exhausted Gemma-only chain', () => {
  const old = {
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_TEXT_MODEL: process.env.OPENROUTER_TEXT_MODEL,
    OPENROUTER_JSON_MODEL: process.env.OPENROUTER_JSON_MODEL,
    OPENROUTER_FALLBACK_MODELS: process.env.OPENROUTER_FALLBACK_MODELS,
    OPENROUTER_MODEL_FALLBACKS: process.env.OPENROUTER_MODEL_FALLBACKS,
  };

  process.env.OPENROUTER_MODEL = 'google/gemma-3-27b-it:free';
  process.env.OPENROUTER_TEXT_MODEL = 'google/gemma-3-27b-it:free';
  process.env.OPENROUTER_JSON_MODEL = 'google/gemma-3-27b-it:free';
  process.env.OPENROUTER_FALLBACK_MODELS = 'google/gemma-3-12b-it:free';
  process.env.OPENROUTER_MODEL_FALLBACKS = '';

  const diagnostics = getOpenRouterRuntimeDiagnostics();
  assert.deepEqual(diagnostics.modelCandidates.json, [
    'google/gemma-3-27b-it:free',
    'google/gemma-3-12b-it:free',
    'openrouter/free',
  ]);

  process.env.OPENROUTER_MODEL = old.OPENROUTER_MODEL;
  process.env.OPENROUTER_TEXT_MODEL = old.OPENROUTER_TEXT_MODEL;
  process.env.OPENROUTER_JSON_MODEL = old.OPENROUTER_JSON_MODEL;
  process.env.OPENROUTER_FALLBACK_MODELS = old.OPENROUTER_FALLBACK_MODELS;
  process.env.OPENROUTER_MODEL_FALLBACKS = old.OPENROUTER_MODEL_FALLBACKS;
});

test('OpenRouterProvider does not fallback to another model on invalid request errors', async () => {
  const old = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_BACKUP_API_KEYS: process.env.OPENROUTER_BACKUP_API_KEYS,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_FALLBACK_MODELS: process.env.OPENROUTER_FALLBACK_MODELS,
    OPENROUTER_URL: process.env.OPENROUTER_URL
  };

  process.env.OPENROUTER_API_KEY = 'sk-or-v1-no_fallback_invalid_request';
  process.env.OPENROUTER_BACKUP_API_KEYS = '';
  process.env.OPENROUTER_MODEL = 'google/gemma-3-12b-it:free';
  process.env.OPENROUTER_FALLBACK_MODELS = 'openai/gpt-4o-mini';
  process.env.OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

  const calls: FetchCall[] = [];
  globalThis.fetch = async (_url: any, init: any) => {
    let parsedBody: any = undefined;
    try {
      parsedBody = init?.body ? JSON.parse(init.body) : undefined;
    } catch {
      parsedBody = init?.body;
    }
    calls.push({ url: 'x', body: parsedBody });
    return makeErrorResponse(400, {
      error: {
        message: 'INVALID_ARGUMENT: malformed request'
      }
    });
  };

  const provider = new OpenRouterProvider();
  await assert.rejects(
    () => provider.generateText('hello', 'system', { maxRetries: 0 }),
    /AI_GENERATION_FAILED: Invalid request for model/
  );

  assert.equal(calls.length, 1);
  assert.equal(String(calls[0].body?.model), 'google/gemma-3-12b-it:free');

  process.env.OPENROUTER_API_KEY = old.OPENROUTER_API_KEY;
  process.env.OPENROUTER_BACKUP_API_KEYS = old.OPENROUTER_BACKUP_API_KEYS;
  process.env.OPENROUTER_MODEL = old.OPENROUTER_MODEL;
  process.env.OPENROUTER_FALLBACK_MODELS = old.OPENROUTER_FALLBACK_MODELS;
  process.env.OPENROUTER_URL = old.OPENROUTER_URL;
});

test('OpenRouterProvider falls back when gpt-oss endpoint requires reasoning to be enabled', async () => {
  const old = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_BACKUP_API_KEYS: process.env.OPENROUTER_BACKUP_API_KEYS,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_TEXT_MODEL: process.env.OPENROUTER_TEXT_MODEL,
    OPENROUTER_JSON_MODEL: process.env.OPENROUTER_JSON_MODEL,
    OPENROUTER_REASONING_ENABLED: process.env.OPENROUTER_REASONING_ENABLED,
    OPENROUTER_FALLBACK_MODELS: process.env.OPENROUTER_FALLBACK_MODELS,
    OPENROUTER_URL: process.env.OPENROUTER_URL
  };

  process.env.OPENROUTER_API_KEY = 'sk-or-v1-gptoss_reasoning_mandatory_fallback';
  process.env.OPENROUTER_BACKUP_API_KEYS = '';
  process.env.OPENROUTER_MODEL = 'openai/gpt-oss-20b:free';
  // Neutralize ambient OPENROUTER_TEXT_MODEL/JSON_MODEL from a loaded .env so the
  // candidate chain is exactly [primary, ...OPENROUTER_FALLBACK_MODELS]. Without
  // this the configured text model leaks in as the 2nd candidate, making the
  // fallback-model assertion non-deterministic across environments.
  process.env.OPENROUTER_TEXT_MODEL = '';
  process.env.OPENROUTER_JSON_MODEL = '';
  process.env.OPENROUTER_REASONING_ENABLED = '0';
  process.env.OPENROUTER_FALLBACK_MODELS = 'google/gemma-3-12b-it:free';
  process.env.OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

  const calls: FetchCall[] = [];
  globalThis.fetch = async (_url: any, init: any) => {
    let parsedBody: any = undefined;
    try {
      parsedBody = init?.body ? JSON.parse(init.body) : undefined;
    } catch {
      parsedBody = init?.body;
    }
    calls.push({ url: 'x', body: parsedBody });

    const model = String(parsedBody?.model || '');
    if (model.includes('openai/gpt-oss-20b:free')) {
      return makeErrorResponse(400, {
        error: {
          message: 'Reasoning is mandatory for this endpoint and cannot be disabled.',
          code: 400
        }
      });
    }

    return makeOkResponse('fallback after reasoning requirement');
  };

  const provider = new OpenRouterProvider();
  const text = await provider.generateText('hello', 'system', { maxRetries: 0 });

  assert.equal(text, 'fallback after reasoning requirement');
  assert.equal(calls.length, 2);
  assert.equal(String(calls[0].body?.model), 'openai/gpt-oss-20b:free');
  assert.deepEqual(calls[0].body?.reasoning, { enabled: false });
  assert.equal(String(calls[1].body?.model), 'google/gemma-3-12b-it:free');
  assert.equal(calls[1].body?.reasoning, undefined);

  process.env.OPENROUTER_API_KEY = old.OPENROUTER_API_KEY;
  process.env.OPENROUTER_BACKUP_API_KEYS = old.OPENROUTER_BACKUP_API_KEYS;
  process.env.OPENROUTER_MODEL = old.OPENROUTER_MODEL;
  process.env.OPENROUTER_TEXT_MODEL = old.OPENROUTER_TEXT_MODEL;
  process.env.OPENROUTER_JSON_MODEL = old.OPENROUTER_JSON_MODEL;
  process.env.OPENROUTER_REASONING_ENABLED = old.OPENROUTER_REASONING_ENABLED;
  process.env.OPENROUTER_FALLBACK_MODELS = old.OPENROUTER_FALLBACK_MODELS;
  process.env.OPENROUTER_URL = old.OPENROUTER_URL;
});

test('OpenRouterProvider generateJSON falls back to configured model when primary is rate-limited', async () => {
  const old = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_BACKUP_API_KEYS: process.env.OPENROUTER_BACKUP_API_KEYS,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_TEXT_MODEL: process.env.OPENROUTER_TEXT_MODEL,
    OPENROUTER_JSON_MODEL: process.env.OPENROUTER_JSON_MODEL,
    OPENROUTER_FALLBACK_MODELS: process.env.OPENROUTER_FALLBACK_MODELS,
    OPENROUTER_URL: process.env.OPENROUTER_URL
  };

  process.env.OPENROUTER_API_KEY = 'sk-or-v1-json_fallback_test_key';
  process.env.OPENROUTER_BACKUP_API_KEYS = '';
  process.env.OPENROUTER_MODEL = 'google/gemma-3-12b-it:free';
  process.env.OPENROUTER_TEXT_MODEL = '';
  process.env.OPENROUTER_JSON_MODEL = '';
  process.env.OPENROUTER_FALLBACK_MODELS = 'openai/gpt-4o-mini';
  process.env.OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

  const calls: FetchCall[] = [];
  globalThis.fetch = async (_url: any, init: any) => {
    let parsedBody: any = undefined;
    try {
      parsedBody = init?.body ? JSON.parse(init.body) : undefined;
    } catch {
      parsedBody = init?.body;
    }
    calls.push({ url: 'x', body: parsedBody });

    const model = String(parsedBody?.model || '');
    if (model.includes('gemma-3-12b-it:free')) {
      return makeErrorResponse(429, {
        error: {
          message: 'Provider returned error',
          code: 429,
          metadata: {
            raw: 'google/gemma-3-12b-it:free is temporarily rate-limited upstream'
          }
        }
      });
    }

    return makeOkResponse('{"ok":true,"via":"fallback"}');
  };

  const provider = new OpenRouterProvider();
  const json = await provider.generateJSON<{ ok: boolean; via: string }>(
    'Return object',
    { type: 'object', properties: { ok: { type: 'boolean' }, via: { type: 'string' } }, required: ['ok', 'via'] },
    'JSON only',
    { maxRetries: 0 }
  );

  assert.equal(json.ok, true);
  assert.equal(json.via, 'fallback');
  assert.equal(calls.length, 2);
  assert.equal(String(calls[0].body?.model), 'google/gemma-3-12b-it:free');
  assert.equal(String(calls[1].body?.model), 'openai/gpt-4o-mini');

  process.env.OPENROUTER_API_KEY = old.OPENROUTER_API_KEY;
  process.env.OPENROUTER_BACKUP_API_KEYS = old.OPENROUTER_BACKUP_API_KEYS;
  process.env.OPENROUTER_MODEL = old.OPENROUTER_MODEL;
  process.env.OPENROUTER_TEXT_MODEL = old.OPENROUTER_TEXT_MODEL;
  process.env.OPENROUTER_JSON_MODEL = old.OPENROUTER_JSON_MODEL;
  process.env.OPENROUTER_FALLBACK_MODELS = old.OPENROUTER_FALLBACK_MODELS;
  process.env.OPENROUTER_URL = old.OPENROUTER_URL;
});

test('OpenRouterProvider supports OPENROUTER_MODEL_FALLBACKS alias for model fallback chain', async () => {
  const old = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_BACKUP_API_KEYS: process.env.OPENROUTER_BACKUP_API_KEYS,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_TEXT_MODEL: process.env.OPENROUTER_TEXT_MODEL,
    OPENROUTER_JSON_MODEL: process.env.OPENROUTER_JSON_MODEL,
    OPENROUTER_FALLBACK_MODELS: process.env.OPENROUTER_FALLBACK_MODELS,
    OPENROUTER_MODEL_FALLBACKS: process.env.OPENROUTER_MODEL_FALLBACKS,
    OPENROUTER_URL: process.env.OPENROUTER_URL
  };

  process.env.OPENROUTER_API_KEY = 'sk-or-v1-fallback_alias_test_key';
  process.env.OPENROUTER_BACKUP_API_KEYS = '';
  process.env.OPENROUTER_MODEL = 'google/gemma-3-12b-it:free';
  process.env.OPENROUTER_TEXT_MODEL = '';
  process.env.OPENROUTER_JSON_MODEL = '';
  process.env.OPENROUTER_FALLBACK_MODELS = '';
  process.env.OPENROUTER_MODEL_FALLBACKS = 'openai/gpt-4o-mini';
  process.env.OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

  const calls: FetchCall[] = [];
  globalThis.fetch = async (_url: any, init: any) => {
    let parsedBody: any = undefined;
    try {
      parsedBody = init?.body ? JSON.parse(init.body) : undefined;
    } catch {
      parsedBody = init?.body;
    }
    calls.push({ url: 'x', body: parsedBody });

    const model = String(parsedBody?.model || '');
    if (model.includes('gemma-3-12b-it:free')) {
      return makeErrorResponse(429, {
        error: {
          message: 'Provider returned error',
          code: 429,
          metadata: {
            raw: 'google/gemma-3-12b-it:free is temporarily rate-limited upstream'
          }
        }
      });
    }

    return makeOkResponse('alias fallback worked');
  };

  const provider = new OpenRouterProvider();
  const text = await provider.generateText('hello', 'system', { maxRetries: 0 });

  assert.equal(text, 'alias fallback worked');
  assert.equal(calls.length, 2);
  assert.equal(String(calls[0].body?.model), 'google/gemma-3-12b-it:free');
  assert.equal(String(calls[1].body?.model), 'openai/gpt-4o-mini');

  process.env.OPENROUTER_API_KEY = old.OPENROUTER_API_KEY;
  process.env.OPENROUTER_BACKUP_API_KEYS = old.OPENROUTER_BACKUP_API_KEYS;
  process.env.OPENROUTER_MODEL = old.OPENROUTER_MODEL;
  process.env.OPENROUTER_TEXT_MODEL = old.OPENROUTER_TEXT_MODEL;
  process.env.OPENROUTER_JSON_MODEL = old.OPENROUTER_JSON_MODEL;
  process.env.OPENROUTER_FALLBACK_MODELS = old.OPENROUTER_FALLBACK_MODELS;
  process.env.OPENROUTER_MODEL_FALLBACKS = old.OPENROUTER_MODEL_FALLBACKS;
  process.env.OPENROUTER_URL = old.OPENROUTER_URL;
});

test('OpenRouter runtime diagnostics exposes model candidates and does not leak API keys', async () => {
  const old = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_BACKUP_API_KEYS: process.env.OPENROUTER_BACKUP_API_KEYS,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_TEXT_MODEL: process.env.OPENROUTER_TEXT_MODEL,
    OPENROUTER_JSON_MODEL: process.env.OPENROUTER_JSON_MODEL,
    OPENROUTER_FALLBACK_MODELS: process.env.OPENROUTER_FALLBACK_MODELS,
    OPENROUTER_MODEL_FALLBACKS: process.env.OPENROUTER_MODEL_FALLBACKS,
    OPENROUTER_LOG_MODEL_CANDIDATES: process.env.OPENROUTER_LOG_MODEL_CANDIDATES,
  };

  process.env.OPENROUTER_API_KEY = 'sk-or-v1-secret_primary_test_key';
  process.env.OPENROUTER_BACKUP_API_KEYS = 'sk-or-v1-backup_1,sk-or-v1-backup_2';
  process.env.OPENROUTER_MODEL = 'google/gemma-3-12b-it:free';
  process.env.OPENROUTER_TEXT_MODEL = '';
  process.env.OPENROUTER_JSON_MODEL = '';
  process.env.OPENROUTER_FALLBACK_MODELS = 'openai/gpt-4o-mini,openai/gpt-4o-mini';
  process.env.OPENROUTER_MODEL_FALLBACKS = 'anthropic/claude-3-haiku';
  process.env.OPENROUTER_LOG_MODEL_CANDIDATES = '1';

  const diagnostics = getOpenRouterRuntimeDiagnostics();
  const serialized = JSON.stringify(diagnostics);

  assert.equal(diagnostics.env.hasPrimaryKey, true);
  assert.equal(diagnostics.env.backupKeysCount, 2);
  assert.equal(Array.isArray(diagnostics.modelCandidates.text), true);
  assert.equal(Array.isArray(diagnostics.modelCandidates.json), true);
  assert.deepEqual(
    diagnostics.modelCandidates.text,
    ['google/gemma-3-12b-it:free', 'openai/gpt-4o-mini', 'anthropic/claude-3-haiku']
  );
  assert.deepEqual(
    diagnostics.modelCandidates.json,
    ['google/gemma-3-12b-it:free', 'openai/gpt-4o-mini', 'anthropic/claude-3-haiku']
  );
  assert.equal(serialized.includes('sk-or-v1-secret_primary_test_key'), false);
  assert.equal(serialized.includes('sk-or-v1-backup_1'), false);
  assert.equal(serialized.includes('sk-or-v1-backup_2'), false);

  process.env.OPENROUTER_API_KEY = old.OPENROUTER_API_KEY;
  process.env.OPENROUTER_BACKUP_API_KEYS = old.OPENROUTER_BACKUP_API_KEYS;
  process.env.OPENROUTER_MODEL = old.OPENROUTER_MODEL;
  process.env.OPENROUTER_TEXT_MODEL = old.OPENROUTER_TEXT_MODEL;
  process.env.OPENROUTER_JSON_MODEL = old.OPENROUTER_JSON_MODEL;
  process.env.OPENROUTER_FALLBACK_MODELS = old.OPENROUTER_FALLBACK_MODELS;
  process.env.OPENROUTER_MODEL_FALLBACKS = old.OPENROUTER_MODEL_FALLBACKS;
  process.env.OPENROUTER_LOG_MODEL_CANDIDATES = old.OPENROUTER_LOG_MODEL_CANDIDATES;
});

test('OpenRouterProvider disables reasoning by default for openai/gpt-oss-20b:free', async () => {
  const old = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_BACKUP_API_KEYS: process.env.OPENROUTER_BACKUP_API_KEYS,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_REASONING_ENABLED: process.env.OPENROUTER_REASONING_ENABLED,
    OPENROUTER_URL: process.env.OPENROUTER_URL
  };

  process.env.OPENROUTER_API_KEY = 'sk-or-v1-gptoss_reasoning_default_off';
  process.env.OPENROUTER_BACKUP_API_KEYS = '';
  process.env.OPENROUTER_MODEL = 'openai/gpt-oss-20b:free';
  process.env.OPENROUTER_REASONING_ENABLED = '';
  process.env.OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

  const calls: FetchCall[] = [];
  globalThis.fetch = async (_url: any, init: any) => {
    let parsedBody: any = undefined;
    try {
      parsedBody = init?.body ? JSON.parse(init.body) : undefined;
    } catch {
      parsedBody = init?.body;
    }
    calls.push({ url: 'x', body: parsedBody });
    return makeOkResponse('ok');
  };

  const provider = new OpenRouterProvider();
  const text = await provider.generateText('hello', 'system', { maxRetries: 0 });

  assert.equal(text, 'ok');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body?.reasoning, { enabled: false });

  process.env.OPENROUTER_API_KEY = old.OPENROUTER_API_KEY;
  process.env.OPENROUTER_BACKUP_API_KEYS = old.OPENROUTER_BACKUP_API_KEYS;
  process.env.OPENROUTER_MODEL = old.OPENROUTER_MODEL;
  process.env.OPENROUTER_REASONING_ENABLED = old.OPENROUTER_REASONING_ENABLED;
  process.env.OPENROUTER_URL = old.OPENROUTER_URL;
});

test('OpenRouterProvider can enable reasoning for openai/gpt-oss-20b:free via env toggle', async () => {
  const old = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_BACKUP_API_KEYS: process.env.OPENROUTER_BACKUP_API_KEYS,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_REASONING_ENABLED: process.env.OPENROUTER_REASONING_ENABLED,
    OPENROUTER_URL: process.env.OPENROUTER_URL
  };

  process.env.OPENROUTER_API_KEY = 'sk-or-v1-gptoss_reasoning_enabled';
  process.env.OPENROUTER_BACKUP_API_KEYS = '';
  process.env.OPENROUTER_MODEL = 'openai/gpt-oss-20b:free';
  process.env.OPENROUTER_REASONING_ENABLED = '1';
  process.env.OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

  const calls: FetchCall[] = [];
  globalThis.fetch = async (_url: any, init: any) => {
    let parsedBody: any = undefined;
    try {
      parsedBody = init?.body ? JSON.parse(init.body) : undefined;
    } catch {
      parsedBody = init?.body;
    }
    calls.push({ url: 'x', body: parsedBody });
    return makeOkResponse('ok');
  };

  const provider = new OpenRouterProvider();
  const text = await provider.generateText('hello', 'system', { maxRetries: 0 });

  assert.equal(text, 'ok');
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].body?.reasoning, { enabled: true });

  process.env.OPENROUTER_API_KEY = old.OPENROUTER_API_KEY;
  process.env.OPENROUTER_BACKUP_API_KEYS = old.OPENROUTER_BACKUP_API_KEYS;
  process.env.OPENROUTER_MODEL = old.OPENROUTER_MODEL;
  process.env.OPENROUTER_REASONING_ENABLED = old.OPENROUTER_REASONING_ENABLED;
  process.env.OPENROUTER_URL = old.OPENROUTER_URL;
});

test('OpenRouterProvider does not add reasoning payload for non gpt-oss models', async () => {
  const old = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_BACKUP_API_KEYS: process.env.OPENROUTER_BACKUP_API_KEYS,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_REASONING_ENABLED: process.env.OPENROUTER_REASONING_ENABLED,
    OPENROUTER_URL: process.env.OPENROUTER_URL
  };

  process.env.OPENROUTER_API_KEY = 'sk-or-v1-non_gptoss_reasoning_absent';
  process.env.OPENROUTER_BACKUP_API_KEYS = '';
  process.env.OPENROUTER_MODEL = 'openai/gpt-4o-mini';
  process.env.OPENROUTER_REASONING_ENABLED = '1';
  process.env.OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

  const calls: FetchCall[] = [];
  globalThis.fetch = async (_url: any, init: any) => {
    let parsedBody: any = undefined;
    try {
      parsedBody = init?.body ? JSON.parse(init.body) : undefined;
    } catch {
      parsedBody = init?.body;
    }
    calls.push({ url: 'x', body: parsedBody });
    return makeOkResponse('ok');
  };

  const provider = new OpenRouterProvider();
  const text = await provider.generateText('hello', 'system', { maxRetries: 0 });

  assert.equal(text, 'ok');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].body?.reasoning, undefined);

  process.env.OPENROUTER_API_KEY = old.OPENROUTER_API_KEY;
  process.env.OPENROUTER_BACKUP_API_KEYS = old.OPENROUTER_BACKUP_API_KEYS;
  process.env.OPENROUTER_MODEL = old.OPENROUTER_MODEL;
  process.env.OPENROUTER_REASONING_ENABLED = old.OPENROUTER_REASONING_ENABLED;
  process.env.OPENROUTER_URL = old.OPENROUTER_URL;
});

test('OpenRouterProvider respects OPENROUTER_DISABLE_TIMEOUT and does not abort long requests', async () => {
  const old = {
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
    OPENROUTER_BACKUP_API_KEYS: process.env.OPENROUTER_BACKUP_API_KEYS,
    OPENROUTER_MODEL: process.env.OPENROUTER_MODEL,
    OPENROUTER_URL: process.env.OPENROUTER_URL,
    OPENROUTER_DISABLE_TIMEOUT: process.env.OPENROUTER_DISABLE_TIMEOUT,
    OPENROUTER_DISABLE_TIMEOUTS: process.env.OPENROUTER_DISABLE_TIMEOUTS
  };

  process.env.OPENROUTER_API_KEY = 'sk-or-v1-disable_timeout_test';
  process.env.OPENROUTER_BACKUP_API_KEYS = '';
  process.env.OPENROUTER_MODEL = 'openai/gpt-4o-mini';
  process.env.OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
  process.env.OPENROUTER_DISABLE_TIMEOUT = '1';
  process.env.OPENROUTER_DISABLE_TIMEOUTS = '';

  const calls: FetchCall[] = [];
  globalThis.fetch = async (_url: any, init: any) => {
    let parsedBody: any = undefined;
    try {
      parsedBody = init?.body ? JSON.parse(init.body) : undefined;
    } catch {
      parsedBody = init?.body;
    }
    calls.push({ url: 'x', body: parsedBody });

    const signal = init?.signal as AbortSignal | undefined;
    return await new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(makeOkResponse('slow but ok')), 30);
      if (!signal) return;

      if (signal.aborted) {
        clearTimeout(timer);
        const err: any = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
        return;
      }

      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        const err: any = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      }, { once: true });
    });
  };

  const provider = new OpenRouterProvider();
  const text = await provider.generateText('hello', 'system', {
    maxRetries: 0,
    timeout: 1
  });

  assert.equal(text, 'slow but ok');
  assert.equal(calls.length, 1);

  process.env.OPENROUTER_API_KEY = old.OPENROUTER_API_KEY;
  process.env.OPENROUTER_BACKUP_API_KEYS = old.OPENROUTER_BACKUP_API_KEYS;
  process.env.OPENROUTER_MODEL = old.OPENROUTER_MODEL;
  process.env.OPENROUTER_URL = old.OPENROUTER_URL;
  process.env.OPENROUTER_DISABLE_TIMEOUT = old.OPENROUTER_DISABLE_TIMEOUT;
  process.env.OPENROUTER_DISABLE_TIMEOUTS = old.OPENROUTER_DISABLE_TIMEOUTS;
});
